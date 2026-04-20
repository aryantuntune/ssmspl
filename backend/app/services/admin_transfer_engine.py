"""
Item Transfer engine — transforms a FROM item into a TO item on CASH tickets,
reassigning the levy to the TO item's route+date-effective levy. FIFO selection,
splits rows on partial replacement. Plan built in dry_run, reused in commit.
"""
import hashlib
import uuid
from datetime import date, datetime, timezone
from decimal import Decimal
from sqlalchemy import func, select, text, update, insert
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import HTTPException
from app.database import AsyncSessionLocal
from app.models.ticket import Ticket, TicketItem
from app.models.payment_mode import PaymentMode
from app.models.item import Item
from app.models.item_rate import ItemRate
from app.models.item_rate_history import ItemRateHistory
from app.models.parameter_master import ParameterMaster
from app.models.admin_adjustments_log import AdminAdjustmentsLog
from app.models.admin_adjustment_details import AdminAdjustmentDetails
from app.models.tickets_backup import TicketsBackup
from app.models.ticket_items_backup import TicketItemsBackup

MAX_ITEM_ROWS = 5000


def _date_lock_hash(date_start: date, date_end: date) -> int:
    raw = f"{date_start}{date_end}".encode()
    return int(hashlib.md5(raw).hexdigest(), 16) % (2**31 - 1)


async def _resolve_to_levy(
    db: AsyncSession, to_item_id: int, route_id: int, ticket_date: date
) -> Decimal | None:
    """
    Find the TO item's levy effective on ticket_date for the given route.
    Logic: the earliest item_rate_history record with changed_at > ticket_date
    tells us what the levy WAS before that change (its old_levy is what we want).
    If no such record exists, fall back to the current item_rates value.
    Returns None if no levy can be resolved (caller should abort).
    """
    hist_q = (
        select(ItemRateHistory.old_levy)
        .where(
            ItemRateHistory.item_id == to_item_id,
            ItemRateHistory.route_id == route_id,
            func.date(ItemRateHistory.changed_at) > ticket_date,
        )
        .order_by(ItemRateHistory.changed_at.asc())
        .limit(1)
    )
    row = (await db.execute(hist_q)).first()
    if row is not None and row[0] is not None:
        return Decimal(str(row[0]))

    # Fallback: current rate
    current_q = (
        select(ItemRate.levy)
        .where(
            ItemRate.item_id == to_item_id,
            ItemRate.route_id == route_id,
            ItemRate.is_active == True,
        )
        .limit(1)
    )
    row = (await db.execute(current_q)).first()
    if row is not None and row[0] is not None:
        return Decimal(str(row[0]))

    return None


async def _get_scope_data(
    db: AsyncSession,
    branch_id: int,
    date_start: date,
    date_end: date,
    from_item_id: int,
):
    """
    Return ordered list of candidate ticket_items (CASH, non-cancelled) plus their ticket context.
    Returns list of dicts in FIFO order.
    """
    q = (
        select(
            TicketItem.id.label("tiid"),
            TicketItem.ticket_id,
            TicketItem.item_id,
            TicketItem.rate,
            TicketItem.levy,
            TicketItem.quantity,
            TicketItem.vehicle_no,
            TicketItem.vehicle_name,
            Ticket.route_id,
            Ticket.ticket_date,
            Ticket.created_at,
            Ticket.discount,
        )
        .select_from(TicketItem)
        .join(Ticket, Ticket.id == TicketItem.ticket_id)
        .join(PaymentMode, PaymentMode.id == Ticket.payment_mode_id)
        .where(
            Ticket.branch_id == branch_id,
            Ticket.ticket_date >= date_start,
            Ticket.ticket_date <= date_end,
            TicketItem.item_id == from_item_id,
            Ticket.is_cancelled == False,
            TicketItem.is_cancelled == False,
            PaymentMode.name == "CASH",
        )
        .order_by(Ticket.created_at.asc(), Ticket.id.asc(), TicketItem.id.asc())
    )
    rows = (await db.execute(q)).all()
    return [
        {
            "tiid": r.tiid,
            "ticket_id": r.ticket_id,
            "item_id": r.item_id,
            "rate": Decimal(str(r.rate)),
            "levy": Decimal(str(r.levy)),
            "quantity": int(r.quantity),
            "vehicle_no": r.vehicle_no,
            "vehicle_name": r.vehicle_name,
            "route_id": r.route_id,
            "ticket_date": r.ticket_date,
            "created_at": r.created_at,
            "discount": Decimal(str(r.discount)) if r.discount is not None else Decimal("0"),
        }
        for r in rows
    ]


async def _check_transfer_allowed(db: AsyncSession, from_item_id: int, to_item_id: int):
    """Verify PM rules allow from_item as FROM and to_item as TO."""
    if from_item_id == to_item_id:
        raise HTTPException(status_code=400, detail="FROM and TO items must be different")

    from_check = await db.execute(
        select(ParameterMaster.id)
        .where(
            ParameterMaster.is_active == True,
            ParameterMaster.allowed_as_transfer_from == True,
            ParameterMaster.item_id == from_item_id,
        )
        .limit(1)
    )
    if from_check.scalar_one_or_none() is None:
        raise HTTPException(
            status_code=400,
            detail=f"FROM item {from_item_id} is not allowed as a transfer source. Update Parameter Master → Transfer Items.",
        )

    to_check = await db.execute(
        select(ParameterMaster.id)
        .where(
            ParameterMaster.is_active == True,
            ParameterMaster.allowed_as_transfer_to == True,
            ParameterMaster.item_id == to_item_id,
        )
        .limit(1)
    )
    if to_check.scalar_one_or_none() is None:
        raise HTTPException(
            status_code=400,
            detail=f"TO item {to_item_id} is not allowed as a transfer target. Update Parameter Master → Transfer Items.",
        )


async def dry_run(
    db: AsyncSession,
    branch_id: int,
    date_start: date,
    date_end: date,
    from_item_id: int,
    to_item_id: int,
    input_mode: str,  # "percentage" or "quantity"
    input_value: float,
    created_by: uuid.UUID,
) -> dict:
    if input_mode not in ("percentage", "quantity"):
        raise HTTPException(status_code=400, detail="input_mode must be 'percentage' or 'quantity'")

    await _check_transfer_allowed(db, from_item_id, to_item_id)

    scope = await _get_scope_data(db, branch_id, date_start, date_end, from_item_id)
    if not scope:
        raise HTTPException(
            status_code=400,
            detail="No eligible CASH ticket items found for FROM item in this branch / date range.",
        )
    if len(scope) > MAX_ITEM_ROWS:
        raise HTTPException(
            status_code=400,
            detail=f"Too many eligible ticket items ({len(scope)}). Reduce the date range. Max: {MAX_ITEM_ROWS}",
        )

    total_quantity = sum(r["quantity"] for r in scope)
    if total_quantity <= 0:
        raise HTTPException(status_code=400, detail="Total FROM quantity is zero — nothing to transfer.")

    if input_mode == "percentage":
        pct = Decimal(str(input_value))
        if pct <= 0 or pct > 100:
            raise HTTPException(status_code=400, detail="Percentage must be between 0 (exclusive) and 100.")
        transfer_quantity = int((Decimal(total_quantity) * pct) // 100)
    else:
        try:
            transfer_quantity = int(input_value)
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail="Quantity must be an integer.")
        if transfer_quantity <= 0:
            raise HTTPException(status_code=400, detail="Quantity must be positive.")

    if transfer_quantity == 0:
        raise HTTPException(status_code=400, detail="Computed transfer quantity is 0. Increase percentage or quantity.")
    if transfer_quantity > total_quantity:
        raise HTTPException(
            status_code=400,
            detail=f"Requested {transfer_quantity} exceeds available {total_quantity}.",
        )

    # Get item names for display
    item_rows = await db.execute(
        select(Item.id, Item.name).where(Item.id.in_([from_item_id, to_item_id]))
    )
    item_map = {r[0]: r[1] for r in item_rows.all()}
    if from_item_id not in item_map or to_item_id not in item_map:
        raise HTTPException(status_code=404, detail="FROM or TO item not found.")

    # Build the transformation plan (FIFO walk)
    operations: list[dict] = []
    affected_ticket_ids: set[int] = set()
    split_ticket_ids: set[int] = set()
    remaining = transfer_quantity
    from_levy_total_before = Decimal("0")
    to_levy_total_after = Decimal("0")

    # Cache TO levy per (route_id, ticket_date) to avoid repeated DB hits in the same dry-run
    levy_cache: dict[tuple[int, date], Decimal | None] = {}

    for r in scope:
        # Contribution to "from levy total" — levy across ALL matched items before any transfer
        from_levy_total_before += r["levy"] * r["quantity"]

    for r in scope:
        if remaining <= 0:
            break
        key = (r["route_id"], r["ticket_date"])
        if key not in levy_cache:
            levy_cache[key] = await _resolve_to_levy(db, to_item_id, r["route_id"], r["ticket_date"])
        to_levy = levy_cache[key]
        if to_levy is None:
            raise HTTPException(
                status_code=409,
                detail=(
                    f"TO item has no levy configured for route {r['route_id']} at ticket date {r['ticket_date']}. "
                    "Configure item_rates for this route or restrict the transfer date range."
                ),
            )

        if r["quantity"] <= remaining:
            # Case A — full replacement
            affected_ticket_ids.add(r["ticket_id"])
            operations.append({
                "type": "UPDATE",
                "ticket_id": r["ticket_id"],
                "ticket_item_id": r["tiid"],
                "route_id": r["route_id"],
                "ticket_date": str(r["ticket_date"]),
                "old": {
                    "item_id": r["item_id"],
                    "rate": str(r["rate"]),
                    "levy": str(r["levy"]),
                    "quantity": r["quantity"],
                },
                "new": {
                    "item_id": to_item_id,
                    "rate": str(r["rate"]),  # rate preserved
                    "levy": str(to_levy),
                    "quantity": r["quantity"],
                },
            })
            to_levy_total_after += to_levy * r["quantity"]
            remaining -= r["quantity"]
        else:
            # Case B — partial replacement (UPDATE existing + INSERT leftover FROM)
            transferred_qty = remaining
            leftover_qty = r["quantity"] - remaining
            affected_ticket_ids.add(r["ticket_id"])
            split_ticket_ids.add(r["ticket_id"])
            operations.append({
                "type": "UPDATE",
                "ticket_id": r["ticket_id"],
                "ticket_item_id": r["tiid"],
                "route_id": r["route_id"],
                "ticket_date": str(r["ticket_date"]),
                "old": {
                    "item_id": r["item_id"],
                    "rate": str(r["rate"]),
                    "levy": str(r["levy"]),
                    "quantity": r["quantity"],
                },
                "new": {
                    "item_id": to_item_id,
                    "rate": str(r["rate"]),
                    "levy": str(to_levy),
                    "quantity": transferred_qty,
                },
            })
            operations.append({
                "type": "INSERT",
                "ticket_id": r["ticket_id"],
                "route_id": r["route_id"],
                "ticket_date": str(r["ticket_date"]),
                "new_row": {
                    "item_id": from_item_id,
                    "rate": str(r["rate"]),
                    "levy": str(r["levy"]),
                    "quantity": leftover_qty,
                    "vehicle_no": r["vehicle_no"],
                    "vehicle_name": r["vehicle_name"],
                },
            })
            to_levy_total_after += to_levy * transferred_qty
            # Leftover FROM still carries the original levy
            to_levy_total_after += r["levy"] * leftover_qty
            remaining = 0
            break

    # For items NOT touched (past the remaining boundary), their levy is unchanged — already counted in total_before
    # but we also need to add them to the "after" total (their levy is unchanged, so same contribution)
    touched_tiids = {op["ticket_item_id"] for op in operations if op["type"] == "UPDATE"}
    for r in scope:
        if r["tiid"] not in touched_tiids:
            to_levy_total_after += r["levy"] * r["quantity"]

    levy_difference = to_levy_total_after - from_levy_total_before

    # Build preview: gather ticket snapshots for affected tickets
    affected_ids_list = list(affected_ticket_ids)
    ticket_preview = {}
    if affected_ids_list:
        snap_q = (
            select(
                Ticket.id,
                Ticket.ticket_date,
                Ticket.route_id,
                TicketItem.id.label("tiid"),
                TicketItem.item_id,
                TicketItem.rate,
                TicketItem.levy,
                TicketItem.quantity,
                Item.name.label("item_name"),
            )
            .select_from(Ticket)
            .join(TicketItem, TicketItem.ticket_id == Ticket.id)
            .join(Item, Item.id == TicketItem.item_id)
            .where(Ticket.id.in_(affected_ids_list), TicketItem.is_cancelled == False)
            .order_by(Ticket.id.asc(), TicketItem.id.asc())
        )
        for row in (await db.execute(snap_q)).all():
            if row.id not in ticket_preview:
                ticket_preview[row.id] = {
                    "ticket_id": row.id,
                    "ticket_date": str(row.ticket_date),
                    "route_id": row.route_id,
                    "original_items": [],
                }
            ticket_preview[row.id]["original_items"].append({
                "ticket_item_id": row.tiid,
                "item_id": row.item_id,
                "item_name": row.item_name,
                "rate": float(row.rate),
                "levy": float(row.levy),
                "quantity": int(row.quantity),
                "line_value": float((Decimal(str(row.rate)) + Decimal(str(row.levy))) * row.quantity),
            })

    # Enrich with final_items per ticket (based on ops)
    ops_by_ticket: dict[int, list[dict]] = {}
    for op in operations:
        ops_by_ticket.setdefault(op["ticket_id"], []).append(op)

    tickets_view = []
    for tid, snap in ticket_preview.items():
        tops = ops_by_ticket.get(tid, [])
        # Build "final_items" by applying ops to original_items
        final_items = [dict(i) for i in snap["original_items"]]  # clone
        updated_tiids = {op["ticket_item_id"]: op for op in tops if op["type"] == "UPDATE"}
        inserted_ops = [op for op in tops if op["type"] == "INSERT"]
        for fi in final_items:
            if fi["ticket_item_id"] in updated_tiids:
                new = updated_tiids[fi["ticket_item_id"]]["new"]
                fi["item_id"] = new["item_id"]
                fi["item_name"] = item_map.get(new["item_id"], f"#{new['item_id']}")
                fi["levy"] = float(new["levy"])
                fi["quantity"] = int(new["quantity"])
                fi["line_value"] = float(
                    (Decimal(str(fi["rate"])) + Decimal(new["levy"])) * int(new["quantity"])
                )
        for ins in inserted_ops:
            nr = ins["new_row"]
            final_items.append({
                "ticket_item_id": None,  # not yet created
                "item_id": nr["item_id"],
                "item_name": item_map.get(nr["item_id"], f"#{nr['item_id']}"),
                "rate": float(nr["rate"]),
                "levy": float(nr["levy"]),
                "quantity": int(nr["quantity"]),
                "line_value": float((Decimal(nr["rate"]) + Decimal(nr["levy"])) * int(nr["quantity"])),
                "is_inserted": True,
            })
        original_total = sum(i["line_value"] for i in snap["original_items"])
        final_total = sum(i["line_value"] for i in final_items)
        tickets_view.append({
            "ticket_id": tid,
            "ticket_date": snap["ticket_date"],
            "route_id": snap["route_id"],
            "original_items": snap["original_items"],
            "final_items": final_items,
            "original_amount": original_total,
            "final_amount": final_total,
            "is_split": tid in split_ticket_ids,
        })
    tickets_view.sort(key=lambda t: t["ticket_id"])

    execution_plan = {
        "branch_id": branch_id,
        "date_start": str(date_start),
        "date_end": str(date_end),
        "from_item_id": from_item_id,
        "from_item_name": item_map[from_item_id],
        "to_item_id": to_item_id,
        "to_item_name": item_map[to_item_id],
        "input_mode": input_mode,
        "input_value": float(input_value),
        "transfer_quantity": int(transfer_quantity),
        "total_quantity_in_scope": int(total_quantity),
        "from_levy_total_before": str(from_levy_total_before),
        "to_levy_total_after": str(to_levy_total_after),
        "levy_difference": str(levy_difference),
        "affected_tickets_count": len(affected_ticket_ids),
        "tickets_to_split_count": len(split_ticket_ids),
        "operations": operations,
        "affected_ticket_ids": list(affected_ticket_ids),
        "tickets_view": tickets_view,
    }

    log = AdminAdjustmentsLog(
        branch_id=branch_id,
        date_range_start=date_start,
        date_range_end=date_end,
        adjustment_amount=float(levy_difference),  # signed levy delta for reporting
        dry_run_summary=execution_plan,
        total_tickets_affected=len(affected_ticket_ids),
        total_items_affected=len([o for o in operations if o["type"] == "UPDATE"]) + len([o for o in operations if o["type"] == "INSERT"]),
        row_count_checked=len(scope),
        status="DRY_RUN",
        created_by=created_by,
    )
    db.add(log)
    await db.flush()
    await db.refresh(log)

    return {
        "batch_id": str(log.id),
        "from_item_id": from_item_id,
        "from_item_name": item_map[from_item_id],
        "to_item_id": to_item_id,
        "to_item_name": item_map[to_item_id],
        "input_mode": input_mode,
        "input_value": float(input_value),
        "transfer_quantity": int(transfer_quantity),
        "total_quantity_in_scope": int(total_quantity),
        "from_levy_total_before": float(from_levy_total_before),
        "to_levy_total_after": float(to_levy_total_after),
        "levy_difference": float(levy_difference),
        "affected_tickets_count": len(affected_ticket_ids),
        "tickets_to_split_count": len(split_ticket_ids),
        "tickets": tickets_view,
    }


async def commit(
    db: AsyncSession,
    batch_id: str,
    confirmed_by: uuid.UUID,
) -> dict:
    result = await db.execute(
        select(AdminAdjustmentsLog).where(AdminAdjustmentsLog.id == batch_id)
    )
    log = result.scalar_one_or_none()
    if log is None:
        raise HTTPException(status_code=404, detail="Adjustment batch not found")
    if log.status != "DRY_RUN":
        raise HTTPException(status_code=400, detail=f"Batch is not in DRY_RUN state (current: {log.status})")

    plan = log.dry_run_summary
    operations: list[dict] = plan["operations"]
    affected_ticket_ids: list[int] = plan["affected_ticket_ids"]

    if not operations:
        raise HTTPException(status_code=400, detail="No operations in selected plan")

    # CAS DRY_RUN -> IN_PROGRESS in separate session
    async with AsyncSessionLocal() as log_session:
        async with log_session.begin():
            cas_result = await log_session.execute(
                update(AdminAdjustmentsLog)
                .where(
                    AdminAdjustmentsLog.id == batch_id,
                    AdminAdjustmentsLog.status == "DRY_RUN",
                )
                .values(status="IN_PROGRESS", plan_choice="transfer")
            )
            if cas_result.rowcount == 0:
                raise HTTPException(
                    status_code=409,
                    detail="Batch is being committed by another request or has already been processed.",
                )

    try:
        # Advisory lock
        date_hash = _date_lock_hash(log.date_range_start, log.date_range_end)
        await db.execute(
            text("SELECT pg_advisory_xact_lock(:a, :b)"),
            {"a": log.branch_id, "b": date_hash},
        )

        # Collect UPDATE targets
        update_ops = [op for op in operations if op["type"] == "UPDATE"]
        insert_ops = [op for op in operations if op["type"] == "INSERT"]
        update_item_ids = [op["ticket_item_id"] for op in update_ops]

        # Staleness guard — verify every UPDATE target still exists, is not cancelled,
        # and has the same item_id + quantity that the plan recorded
        if update_item_ids:
            fresh = await db.execute(
                select(TicketItem).where(TicketItem.id.in_(update_item_ids))
            )
            fresh_map = {ti.id: ti for ti in fresh.scalars().all()}
            for op in update_ops:
                tiid = op["ticket_item_id"]
                fresh_ti = fresh_map.get(tiid)
                if fresh_ti is None:
                    raise HTTPException(
                        status_code=409,
                        detail=f"Plan is stale — ticket_item {tiid} no longer exists. Re-run the trial preview.",
                    )
                if fresh_ti.is_cancelled:
                    raise HTTPException(
                        status_code=409,
                        detail=f"Plan is stale — ticket_item {tiid} was cancelled. Re-run the trial preview.",
                    )
                if fresh_ti.item_id != op["old"]["item_id"] or int(fresh_ti.quantity) != int(op["old"]["quantity"]):
                    raise HTTPException(
                        status_code=409,
                        detail=f"Plan is stale — ticket_item {tiid} state has changed. Re-run the trial preview.",
                    )
        else:
            fresh_map = {}

        # Backup affected tickets
        tickets_result = await db.execute(select(Ticket).where(Ticket.id.in_(affected_ticket_ids)))
        for ticket in tickets_result.scalars().all():
            db.add(TicketsBackup(
                adjustment_batch_id=log.id,
                ticket_id=ticket.id,
                original_data={
                    "id": ticket.id,
                    "net_amount": str(ticket.net_amount),
                    "amount": str(ticket.amount),
                    "discount": str(ticket.discount) if ticket.discount is not None else None,
                    "branch_id": ticket.branch_id,
                    "ticket_date": str(ticket.ticket_date),
                },
            ))

        # Backup UPDATE-target items
        for op in update_ops:
            ti = fresh_map.get(op["ticket_item_id"])
            if ti is None:
                continue
            db.add(TicketItemsBackup(
                adjustment_batch_id=log.id,
                ticket_item_id=ti.id,
                ticket_id=ti.ticket_id,
                original_data={
                    "id": ti.id,
                    "ticket_id": ti.ticket_id,
                    "item_id": ti.item_id,
                    "rate": str(ti.rate),
                    "levy": str(ti.levy),
                    "quantity": int(ti.quantity),
                    "vehicle_no": ti.vehicle_no,
                    "vehicle_name": ti.vehicle_name,
                    "is_cancelled": ti.is_cancelled,
                },
            ))

        # Apply UPDATEs
        for op in update_ops:
            await db.execute(
                update(TicketItem)
                .where(TicketItem.id == op["ticket_item_id"])
                .values(
                    item_id=op["new"]["item_id"],
                    levy=float(op["new"]["levy"]),
                    quantity=int(op["new"]["quantity"]),
                )
            )

        # Apply INSERTs and capture new ticket_item_ids for audit
        inserted_new_ids: list[int] = []
        for op in insert_ops:
            nr = op["new_row"]
            ins_stmt = (
                insert(TicketItem)
                .values(
                    ticket_id=op["ticket_id"],
                    item_id=nr["item_id"],
                    rate=float(nr["rate"]),
                    levy=float(nr["levy"]),
                    quantity=int(nr["quantity"]),
                    vehicle_no=nr.get("vehicle_no"),
                    vehicle_name=nr.get("vehicle_name"),
                    is_cancelled=False,
                )
                .returning(TicketItem.id)
            )
            new_id = (await db.execute(ins_stmt)).scalar_one()
            inserted_new_ids.append(new_id)
            op["_inserted_id"] = new_id  # stash for audit below

        # Recalc affected ticket totals (amount + net_amount with discount)
        await db.execute(
            text("""
                UPDATE tickets
                SET
                    amount = (
                        SELECT COALESCE(SUM((ti.rate + ti.levy) * ti.quantity), 0)
                        FROM ticket_items ti
                        WHERE ti.ticket_id = tickets.id AND ti.is_cancelled = false
                    ),
                    net_amount = (
                        SELECT COALESCE(SUM((ti.rate + ti.levy) * ti.quantity), 0)
                        FROM ticket_items ti
                        WHERE ti.ticket_id = tickets.id AND ti.is_cancelled = false
                    ) - COALESCE(discount, 0)
                WHERE id = ANY(:ids)
            """),
            {"ids": affected_ticket_ids},
        )

        # Audit
        for op in update_ops:
            old = op["old"]
            new = op["new"]
            old_rate = Decimal(old["rate"])
            old_levy = Decimal(old["levy"])
            new_rate = Decimal(new["rate"])
            new_levy = Decimal(new["levy"])
            qty = int(new["quantity"])
            rate_delta = (new_rate - old_rate) * qty
            levy_delta = (new_levy - old_levy) * qty
            total_delta = rate_delta + levy_delta
            db.add(AdminAdjustmentDetails(
                adjustment_id=log.id,
                ticket_id=op["ticket_id"],
                ticket_item_id=op["ticket_item_id"],
                old_rate=float(old_rate),
                old_levy=float(old_levy),
                new_rate=float(new_rate),
                new_levy=float(new_levy),
                rate_delta=float(rate_delta),
                levy_delta=float(levy_delta),
                total_delta=float(total_delta),
                matched_rule_id=None,
                operation_type="TRANSFER_UPDATE",
            ))
        for op in insert_ops:
            nr = op["new_row"]
            new_rate = Decimal(nr["rate"])
            new_levy = Decimal(nr["levy"])
            qty = int(nr["quantity"])
            # For INSERTs: no "old" values. Store zeros for old_*, levy_delta = new_levy*qty (positive contribution).
            db.add(AdminAdjustmentDetails(
                adjustment_id=log.id,
                ticket_id=op["ticket_id"],
                ticket_item_id=op["_inserted_id"],
                old_rate=0.0,
                old_levy=0.0,
                new_rate=float(new_rate),
                new_levy=float(new_levy),
                rate_delta=float(new_rate * qty),
                levy_delta=float(new_levy * qty),
                total_delta=float((new_rate + new_levy) * qty),
                matched_rule_id=None,
                operation_type="TRANSFER_INSERT",
            ))

        log.status = "COMMITTED"
        log.executed_at = datetime.now(timezone.utc)
        log.plan_choice = "transfer"
        log.total_tickets_affected = len(affected_ticket_ids)
        log.total_items_affected = len(update_ops) + len(insert_ops)
        await db.flush()

    except HTTPException:
        # Pass-through 4xx/5xx guards — do not mark FAILED
        raise

    except Exception as exc:
        async with AsyncSessionLocal() as log_session:
            async with log_session.begin():
                await log_session.execute(
                    update(AdminAdjustmentsLog)
                    .where(AdminAdjustmentsLog.id == batch_id)
                    .values(status="FAILED", error_message=str(exc)[:2000])
                )
        raise

    return {
        "batch_id": str(log.id),
        "status": "COMMITTED",
        "tickets_affected": len(affected_ticket_ids),
        "items_updated": len(update_ops),
        "items_inserted": len(insert_ops),
        "executed_at": log.executed_at.isoformat(),
    }
