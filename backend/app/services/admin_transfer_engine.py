"""
Item Transfer engine — re-categorisation transformation.

Swaps item_id and levy on affected ticket_items while keeping the original
rate (what was charged per unit) and quantity unchanged. Only the levy is
updated to the TO item's master levy; the fare (rate) is preserved as-is.

Effect per ticket_item:
    item_id  -> TO item id
    rate     -> unchanged (FROM charged rate)
    levy     -> TO.master_levy   (from item_rates for route_id at ticket_date)
    quantity -> unchanged

This is a clean re-categorisation: no division, no floor-rounding, no value leakage.
FIFO by ticket.created_at, deterministic.
"""
import hashlib
import uuid
from datetime import date, datetime, timezone
from decimal import Decimal
from sqlalchemy import delete as sa_delete, func, insert as sa_insert, select, text, update
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
from app.models.route import Route

MAX_ITEM_ROWS = 5000


def _date_lock_hash(date_start: date, date_end: date) -> int:
    raw = f"{date_start}{date_end}".encode()
    return int(hashlib.md5(raw).hexdigest(), 16) % (2**31 - 1)


async def _resolve_to_master(
    db: AsyncSession, to_item_id: int, route_id: int, ticket_date: date
) -> tuple[Decimal | None, Decimal | None]:
    """
    Return (rate, levy) effective on ticket_date for TO item on given route.
    History-aware: if item_rate_history has a change after ticket_date, use the
    PRE-change values (old_rate, old_levy). Otherwise fall back to current item_rates.
    """
    hist_q = (
        select(ItemRateHistory.old_rate, ItemRateHistory.old_levy)
        .where(
            ItemRateHistory.item_id == to_item_id,
            ItemRateHistory.route_id == route_id,
            func.date(ItemRateHistory.changed_at) > ticket_date,
        )
        .order_by(ItemRateHistory.changed_at.asc())
        .limit(1)
    )
    row = (await db.execute(hist_q)).first()
    if row is not None and row[0] is not None and row[1] is not None:
        return (Decimal(str(row[0])), Decimal(str(row[1])))

    current_q = (
        select(ItemRate.rate, ItemRate.levy)
        .where(
            ItemRate.item_id == to_item_id,
            ItemRate.route_id == route_id,
            ItemRate.is_active == True,
        )
        .limit(1)
    )
    row = (await db.execute(current_q)).first()
    if row is None:
        return (None, None)
    rate = Decimal(str(row[0])) if row[0] is not None else None
    levy = Decimal(str(row[1])) if row[1] is not None else None
    return (rate, levy)


async def _resolve_branch_ids(
    db: AsyncSession, branch_id: int | None, route_id: int | None
) -> tuple[list[int], int | None]:
    """
    Returns (branch_ids, resolved_route_id).

    - Single-branch mode: returns ([branch_id], None).
    - Route mode: returns ([branch_one, branch_two], route_id) for both endpoint
      branches of the route. Both branches participate regardless of individual
      active flags so historical transfers stay possible.
    """
    if (branch_id is None) == (route_id is None):
        raise HTTPException(
            status_code=400,
            detail="Provide exactly one of `branch_id` or `route_id`.",
        )
    if branch_id is not None:
        return ([int(branch_id)], None)
    route = (await db.execute(select(Route).where(Route.id == route_id))).scalar_one_or_none()
    if route is None:
        raise HTTPException(status_code=404, detail=f"Route {route_id} not found.")
    return ([int(route.branch_id_one), int(route.branch_id_two)], int(route.id))


async def _get_scope_data(
    db: AsyncSession,
    branch_ids: list[int],
    date_start: date,
    date_end: date,
    from_item_id: int,
    payment_mode: str,
):
    """Ordered list of FROM ticket_items with their ticket context. FIFO by created_at.

    `branch_ids` may contain one (single-branch mode) or two branches (route mode,
    both endpoint branches of the route). FIFO ordering is by ticket.created_at
    so the chronological order is preserved across branches.
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
            Ticket.branch_id,
        )
        .select_from(TicketItem)
        .join(Ticket, Ticket.id == TicketItem.ticket_id)
        .join(PaymentMode, PaymentMode.id == Ticket.payment_mode_id)
        .where(
            Ticket.branch_id.in_(branch_ids),
            Ticket.ticket_date >= date_start,
            Ticket.ticket_date <= date_end,
            TicketItem.item_id == from_item_id,
            Ticket.is_cancelled == False,
            TicketItem.is_cancelled == False,
            func.upper(PaymentMode.description) == payment_mode,
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
            "branch_id": int(r.branch_id),
        }
        for r in rows
    ]


async def _count_other_items_per_ticket(
    db: AsyncSession, ticket_ids: list[int], exclude_item_id: int
) -> dict[int, int]:
    """Count non-cancelled ticket_items per ticket, EXCLUDING the FROM item."""
    if not ticket_ids:
        return {}
    q = (
        select(TicketItem.ticket_id, func.count(TicketItem.id).label("c"))
        .where(
            TicketItem.ticket_id.in_(ticket_ids),
            TicketItem.is_cancelled == False,
            TicketItem.item_id != exclude_item_id,
        )
        .group_by(TicketItem.ticket_id)
    )
    rows = (await db.execute(q)).all()
    return {r.ticket_id: int(r.c) for r in rows}


async def _check_transfer_allowed(db: AsyncSession, from_item_id: int, to_item_id: int):
    """Enforce PM allowlist (from and to)."""
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
    branch_id: int | None,
    date_start: date,
    date_end: date,
    from_item_id: int,
    to_item_id: int,
    input_mode: str,  # "percentage" or "quantity"
    input_value: float,
    created_by: uuid.UUID,
    route_id: int | None = None,
    payment_mode: str = "CASH",
) -> dict:
    if input_mode not in ("percentage", "quantity"):
        raise HTTPException(status_code=400, detail="input_mode must be 'percentage' or 'quantity'")

    payment_mode = (payment_mode or "CASH").upper()
    if payment_mode not in ("CASH", "UPI"):
        raise HTTPException(status_code=400, detail="payment_mode must be 'CASH' or 'UPI'")

    await _check_transfer_allowed(db, from_item_id, to_item_id)

    branch_ids, resolved_route_id = await _resolve_branch_ids(db, branch_id, route_id)

    scope = await _get_scope_data(db, branch_ids, date_start, date_end, from_item_id, payment_mode)
    if not scope:
        scope_label = (
            f"route {resolved_route_id}" if resolved_route_id is not None else f"branch {branch_ids[0]}"
        )
        raise HTTPException(
            status_code=400,
            detail=f"No eligible {payment_mode} ticket items found for FROM item in {scope_label} / date range.",
        )
    if len(scope) > MAX_ITEM_ROWS:
        raise HTTPException(
            status_code=400,
            detail=f"Too many eligible ticket items ({len(scope)}). Reduce the date range. Max: {MAX_ITEM_ROWS}",
        )

    total_quantity = sum(r["quantity"] for r in scope)
    if total_quantity <= 0:
        raise HTTPException(status_code=400, detail="Total FROM quantity is zero — nothing to transfer.")

    # Interpret input
    if input_mode == "percentage":
        pct = Decimal(str(input_value))
        if pct <= 0 or pct > 100:
            raise HTTPException(status_code=400, detail="Percentage must be between 0 (exclusive) and 100.")
        requested_transfer_qty = int((Decimal(total_quantity) * pct) // 100)
    else:
        try:
            requested_transfer_qty = int(input_value)
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail="Quantity must be an integer.")
        if requested_transfer_qty <= 0:
            raise HTTPException(status_code=400, detail="Quantity must be positive.")

    if requested_transfer_qty == 0:
        raise HTTPException(status_code=400, detail="Computed transfer quantity is 0. Increase percentage or quantity.")
    if requested_transfer_qty > total_quantity:
        raise HTTPException(
            status_code=400,
            detail=f"Requested {requested_transfer_qty} exceeds available {total_quantity}.",
        )

    # Item names for display
    item_rows = await db.execute(
        select(Item.id, Item.name).where(Item.id.in_([from_item_id, to_item_id]))
    )
    item_map = {r[0]: r[1] for r in item_rows.all()}
    if from_item_id not in item_map or to_item_id not in item_map:
        raise HTTPException(status_code=404, detail="FROM or TO item not found.")

    # Cache TO master per (route, ticket_date)
    to_master_cache: dict[tuple[int, date], tuple[Decimal | None, Decimal | None]] = {}

    operations: list[dict] = []
    affected_ticket_ids: set[int] = set()
    split_ticket_ids: set[int] = set()
    skipped_tickets: list[dict] = []  # kept for response schema compat; always empty with swap approach

    remaining = requested_transfer_qty
    levy_before = Decimal("0")  # levy removed from FROM items (per transferred qty)
    levy_after = Decimal("0")   # levy added by TO items (per transferred qty)

    for r in scope:
        if remaining <= 0:
            break

        # How much we transfer from THIS ticket_item
        transferred_qty = min(r["quantity"], remaining)

        # Look up TO master
        key = (r["route_id"], r["ticket_date"])
        if key not in to_master_cache:
            to_master_cache[key] = await _resolve_to_master(db, to_item_id, r["route_id"], r["ticket_date"])
        x2, y2 = to_master_cache[key]
        if x2 is None or y2 is None:
            raise HTTPException(
                status_code=409,
                detail=(
                    f"TO item has no rate+levy configured for route {r['route_id']} at ticket date {r['ticket_date']}. "
                    "Configure item_rates for this route or restrict the transfer date range."
                ),
            )
        # Swap approach: keep FROM rate and quantity; only update item_id and levy.
        # No division → no floor-rounding → no value leakage.
        would_remove_entire_row = (transferred_qty == r["quantity"])

        # Plan:
        affected_ticket_ids.add(r["ticket_id"])
        if would_remove_entire_row:
            # UPDATE the FROM row to become the TO row
            operations.append({
                "type": "CONVERT",  # UPDATE ticket_item: change item_id, rate, levy, quantity
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
                    "rate": str(r["rate"]),  # keep FROM rate (what was charged)
                    "levy": str(y2),          # TO master levy
                    "quantity": transferred_qty,
                },
                "transferred_qty": transferred_qty,
            })
        else:
            # Partial: UPDATE FROM row to reduce quantity, INSERT new TO row
            split_ticket_ids.add(r["ticket_id"])
            operations.append({
                "type": "REDUCE",  # UPDATE FROM row: quantity -= transferred_qty
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
                    "item_id": r["item_id"],
                    "rate": str(r["rate"]),
                    "levy": str(r["levy"]),
                    "quantity": r["quantity"] - transferred_qty,
                },
                "transferred_qty": transferred_qty,
            })
            operations.append({
                "type": "INSERT",  # INSERT new TO row
                "ticket_id": r["ticket_id"],
                "route_id": r["route_id"],
                "ticket_date": str(r["ticket_date"]),
                "new_row": {
                    "item_id": to_item_id,
                    "rate": str(r["rate"]),  # keep FROM rate (what was charged)
                    "levy": str(y2),          # TO master levy
                    "quantity": transferred_qty,
                    "vehicle_no": None,
                    "vehicle_name": None,
                },
            })

        levy_before += r["levy"] * transferred_qty
        levy_after += y2 * transferred_qty

        remaining -= transferred_qty

    achieved_qty = requested_transfer_qty - remaining - sum(s["transferred_qty_not_applied"] for s in skipped_tickets)
    unapplied_qty = requested_transfer_qty - achieved_qty

    # Build per-ticket snapshots for preview
    ticket_preview = {}
    if affected_ticket_ids:
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
            .where(Ticket.id.in_(list(affected_ticket_ids)), TicketItem.is_cancelled == False)
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

    # Apply planned ops in-memory to build final_items per ticket
    ops_by_ticket: dict[int, list[dict]] = {}
    for op in operations:
        ops_by_ticket.setdefault(op["ticket_id"], []).append(op)

    tickets_view = []
    for tid, snap in ticket_preview.items():
        tops = ops_by_ticket.get(tid, [])
        final_items = [dict(i) for i in snap["original_items"]]  # clone

        # First apply CONVERTs and REDUCEs (both UPDATE an existing row)
        for op in tops:
            if op["type"] in ("CONVERT", "REDUCE"):
                for fi in final_items:
                    if fi["ticket_item_id"] == op["ticket_item_id"]:
                        new = op["new"]
                        fi["item_id"] = new["item_id"]
                        fi["item_name"] = item_map.get(new["item_id"], f"#{new['item_id']}")
                        fi["rate"] = float(Decimal(new["rate"]))
                        fi["levy"] = float(Decimal(new["levy"]))
                        fi["quantity"] = int(new["quantity"])
                        fi["line_value"] = float(
                            (Decimal(new["rate"]) + Decimal(new["levy"])) * int(new["quantity"])
                        )
                        break

        # Then apply INSERTs
        for op in tops:
            if op["type"] == "INSERT":
                nr = op["new_row"]
                final_items.append({
                    "ticket_item_id": None,
                    "item_id": nr["item_id"],
                    "item_name": item_map.get(nr["item_id"], f"#{nr['item_id']}"),
                    "rate": float(Decimal(nr["rate"])),
                    "levy": float(Decimal(nr["levy"])),
                    "quantity": int(nr["quantity"]),
                    "line_value": float(
                        (Decimal(nr["rate"]) + Decimal(nr["levy"])) * int(nr["quantity"])
                    ),
                    "is_inserted": True,
                })

        # Remove zero-quantity rows (defensive; should never occur with the swap approach)
        final_items = [fi for fi in final_items if int(fi["quantity"]) > 0]

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
            "difference": round(final_total - original_total, 2),  # should be 0
            "is_split": tid in split_ticket_ids,
        })
    tickets_view.sort(key=lambda t: t["ticket_id"])

    # The legacy `branch_id` column on admin_adjustments_log is NOT NULL. In
    # route mode we record the route's first branch as the canonical anchor and
    # store the full route context (id + both branches) inside dry_run_summary.
    log_branch_id = branch_ids[0]

    execution_plan = {
        "branch_id": log_branch_id,
        "payment_mode": payment_mode,
        "scope_branch_ids": branch_ids,
        "route_id": resolved_route_id,
        "scope_mode": "route" if resolved_route_id is not None else "branch",
        "date_start": str(date_start),
        "date_end": str(date_end),
        "from_item_id": from_item_id,
        "from_item_name": item_map[from_item_id],
        "to_item_id": to_item_id,
        "to_item_name": item_map[to_item_id],
        "input_mode": input_mode,
        "input_value": float(input_value),
        "requested_transfer_qty": int(requested_transfer_qty),
        "achieved_transfer_qty": int(achieved_qty),
        "unapplied_transfer_qty": int(unapplied_qty),
        "total_from_qty_in_scope": int(total_quantity),
        "total_from_value_applied": str(Decimal("0")),
        "total_from_value_skipped": str(Decimal("0")),
        "total_unapplied_rounding": str(Decimal("0")),
        "total_q2_created": int(achieved_qty),
        "levy_before": str(levy_before),
        "levy_after": str(levy_after),
        "levy_saved": str(levy_before - levy_after),
        "affected_tickets_count": len(affected_ticket_ids),
        "tickets_to_split_count": len(split_ticket_ids),
        "skipped_tickets": skipped_tickets,
        "operations": operations,
        "affected_ticket_ids": list(affected_ticket_ids),
        "tickets_view": tickets_view,
    }

    log = AdminAdjustmentsLog(
        branch_id=log_branch_id,
        date_range_start=date_start,
        date_range_end=date_end,
        adjustment_amount=float(levy_before - levy_after),
        dry_run_summary=execution_plan,
        total_tickets_affected=len(affected_ticket_ids),
        total_items_affected=len(operations),
        row_count_checked=len(scope),
        status="DRY_RUN",
        payment_mode=payment_mode,
        created_by=created_by,
    )
    db.add(log)
    await db.flush()
    await db.refresh(log)

    return {
        "batch_id": str(log.id),
        "payment_mode": payment_mode,
        "scope_mode": "route" if resolved_route_id is not None else "branch",
        "scope_branch_ids": branch_ids,
        "route_id": resolved_route_id,
        "from_item_id": from_item_id,
        "from_item_name": item_map[from_item_id],
        "to_item_id": to_item_id,
        "to_item_name": item_map[to_item_id],
        "input_mode": input_mode,
        "input_value": float(input_value),
        "requested_transfer_qty": int(requested_transfer_qty),
        "achieved_transfer_qty": int(achieved_qty),
        "unapplied_transfer_qty": int(unapplied_qty),
        "total_from_qty_in_scope": int(total_quantity),
        "total_from_value_applied": 0.0,
        "total_from_value_skipped": 0.0,
        "total_unapplied_rounding": 0.0,
        "total_q2_created": int(achieved_qty),
        "levy_before": float(levy_before),
        "levy_after": float(levy_after),
        "levy_saved": float(levy_before - levy_after),
        "affected_tickets_count": len(affected_ticket_ids),
        "tickets_to_split_count": len(split_ticket_ids),
        "skipped_tickets": skipped_tickets,
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

    # Idempotency: a second click on an already-COMMITTED batch returns the same
    # success payload as the first commit, NOT an error. Extra clicks are safe no-ops.
    if log.status == "COMMITTED":
        return {
            "batch_id": str(log.id),
            "status": "COMMITTED",
            "tickets_affected": log.total_tickets_affected or 0,
            "items_updated": 0,  # already applied; recomputing would require re-querying audit
            "items_inserted": 0,
            "executed_at": log.executed_at.isoformat() if log.executed_at else None,
            "idempotent_replay": True,
        }
    if log.status == "IN_PROGRESS":
        raise HTTPException(
            status_code=409,
            detail="This batch is currently being processed. Please wait a moment and refresh.",
        )
    if log.status != "DRY_RUN":
        # FAILED or ROLLED_BACK — cannot commit
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
        # Advisory lock — per-branch only so overlapping date ranges on the same
        # branch are serialized. Prevents concurrent transfer/delete operations
        # from racing on shared tickets. In route mode we lock BOTH endpoint
        # branches (in deterministic ascending order) so a transfer scoped to
        # the same route from another worker — even with branches in inverse
        # order — cannot deadlock or race against this one.
        plan_branch_ids = sorted({int(b) for b in (plan.get("scope_branch_ids") or [log.branch_id])})
        for bid in plan_branch_ids:
            await db.execute(
                text("SELECT pg_advisory_xact_lock(:a, :b)"),
                {"a": bid, "b": 0},
            )

        # Collect UPDATE targets (CONVERT + REDUCE both are updates)
        update_ops = [op for op in operations if op["type"] in ("CONVERT", "REDUCE")]
        insert_ops = [op for op in operations if op["type"] == "INSERT"]
        update_item_ids = [op["ticket_item_id"] for op in update_ops]

        # Staleness guard: every UPDATE target must still exist, not be cancelled,
        # and have the same item_id + quantity the plan recorded
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
                if (
                    fresh_ti.item_id != op["old"]["item_id"]
                    or int(fresh_ti.quantity) != int(op["old"]["quantity"])
                    or Decimal(str(fresh_ti.rate)) != Decimal(op["old"]["rate"])
                    or Decimal(str(fresh_ti.levy)) != Decimal(op["old"]["levy"])
                ):
                    raise HTTPException(
                        status_code=409,
                        detail=f"Plan is stale — ticket_item {tiid} state changed (item/qty/rate/levy). Re-run the trial preview.",
                    )
        else:
            fresh_map = {}

        # Backup affected tickets — capture ALL fields needed for a complete restore,
        # including foreign keys that the rollback path's INSERT will require.
        tickets_result = await db.execute(select(Ticket).where(Ticket.id.in_(affected_ticket_ids)))
        for ticket in tickets_result.scalars().all():
            db.add(TicketsBackup(
                adjustment_batch_id=log.id,
                ticket_id=ticket.id,
                original_data={
                    "id": ticket.id,
                    "branch_id": ticket.branch_id,
                    "ticket_no": ticket.ticket_no,
                    "ticket_date": str(ticket.ticket_date),
                    "route_id": ticket.route_id,
                    "amount": str(ticket.amount),
                    "discount": str(ticket.discount) if ticket.discount is not None else None,
                    "payment_mode_id": ticket.payment_mode_id,
                    "net_amount": str(ticket.net_amount),
                    "is_cancelled": ticket.is_cancelled,
                    "status": ticket.status,
                    "is_multi_ticket": ticket.is_multi_ticket,
                    "boat_id": ticket.boat_id,
                    "ref_no": ticket.ref_no,
                    "departure": str(ticket.departure) if ticket.departure is not None else None,
                    "verification_code": str(ticket.verification_code) if ticket.verification_code is not None else None,
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

        # Apply UPDATEs (CONVERT: change item_id, rate, levy, quantity; REDUCE: just lower quantity)
        for op in update_ops:
            new = op["new"]
            await db.execute(
                update(TicketItem)
                .where(TicketItem.id == op["ticket_item_id"])
                .values(
                    item_id=int(new["item_id"]),
                    rate=float(Decimal(new["rate"])),
                    levy=float(Decimal(new["levy"])),
                    quantity=int(new["quantity"]),
                )
            )

        # Apply INSERTs
        inserted_new_ids: list[int] = []
        for op in insert_ops:
            nr = op["new_row"]
            ins_stmt = (
                sa_insert(TicketItem)
                .values(
                    ticket_id=op["ticket_id"],
                    item_id=int(nr["item_id"]),
                    rate=float(Decimal(nr["rate"])),
                    levy=float(Decimal(nr["levy"])),
                    quantity=int(nr["quantity"]),
                    vehicle_no=nr.get("vehicle_no"),
                    vehicle_name=nr.get("vehicle_name"),
                    is_cancelled=False,
                )
                .returning(TicketItem.id)
            )
            new_id = (await db.execute(ins_stmt)).scalar_one()
            inserted_new_ids.append(new_id)
            op["_inserted_id"] = new_id

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

        # Audit: CONVERTs and REDUCEs become TRANSFER_UPDATE; INSERTs become TRANSFER_INSERT
        for op in update_ops:
            old = op["old"]
            new = op["new"]
            old_rate = Decimal(old["rate"])
            old_levy = Decimal(old["levy"])
            new_rate = Decimal(new["rate"])
            new_levy = Decimal(new["levy"])
            old_qty = int(old["quantity"])
            new_qty = int(new["quantity"])
            old_line = (old_rate + old_levy) * old_qty
            new_line = (new_rate + new_levy) * new_qty
            delta = new_line - old_line
            db.add(AdminAdjustmentDetails(
                adjustment_id=log.id,
                ticket_id=op["ticket_id"],
                ticket_item_id=op["ticket_item_id"],
                old_rate=float(old_rate),
                old_levy=float(old_levy),
                new_rate=float(new_rate),
                new_levy=float(new_levy),
                rate_delta=float((new_rate - old_rate) * new_qty),
                levy_delta=float((new_levy - old_levy) * new_qty),
                total_delta=float(delta),
                matched_rule_id=None,
                operation_type="TRANSFER_UPDATE",
            ))
        for op in insert_ops:
            nr = op["new_row"]
            new_rate = Decimal(nr["rate"])
            new_levy = Decimal(nr["levy"])
            qty = int(nr["quantity"])
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

    except HTTPException as http_exc:
        # Reset IN_PROGRESS to FAILED so the batch isn't permanently stuck.
        # The CAS-style WHERE clause is a no-op if a guard already set status
        # elsewhere (defensive — same pattern as the deletion engine).
        async with AsyncSessionLocal() as log_session:
            async with log_session.begin():
                await log_session.execute(
                    update(AdminAdjustmentsLog)
                    .where(
                        AdminAdjustmentsLog.id == batch_id,
                        AdminAdjustmentsLog.status == "IN_PROGRESS",
                    )
                    .values(status="FAILED", error_message=f"Commit aborted: {http_exc.detail}"[:2000])
                )
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
