"""
Item-deletion adjustment engine for D Drive Process Reconciliation.
Computes Recommended + Requested plans in dry-run, stores both in the log,
and DELETEs chosen ticket_items on commit.
"""
import hashlib
import uuid
from datetime import date, datetime, timezone
from decimal import Decimal
from sqlalchemy import func, select, text, update, delete
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import HTTPException
from app.database import AsyncSessionLocal
from app.models.ticket import Ticket, TicketItem
from app.models.payment_mode import PaymentMode
from app.models.parameter_master import ParameterMaster
from app.models.admin_adjustments_log import AdminAdjustmentsLog
from app.models.admin_adjustment_details import AdminAdjustmentDetails
from app.models.tickets_backup import TicketsBackup
from app.models.ticket_items_backup import TicketItemsBackup
from app.models.item import Item

MAX_ITEM_ROWS = 5000


def _date_lock_hash(date_start: date, date_end: date) -> int:
    raw = f"{date_start}{date_end}".encode()
    return int(hashlib.md5(raw).hexdigest(), 16) % (2**31 - 1)


def _round_down_to_clean(amount: Decimal) -> Decimal:
    """Smart rounding: <1k->100, 1k-10k->500, >10k->1000."""
    if amount < Decimal("1000"):
        step = Decimal("100")
    elif amount <= Decimal("10000"):
        step = Decimal("500")
    else:
        step = Decimal("1000")
    return (amount // step) * step


async def _count_eligible_unprotected_items(
    db: AsyncSession, branch_id: int, date_start: date, date_end: date, protected_item_ids: set[int]
) -> int:
    q = (
        select(func.count(TicketItem.id))
        .select_from(TicketItem)
        .join(Ticket, Ticket.id == TicketItem.ticket_id)
        .join(PaymentMode, PaymentMode.id == Ticket.payment_mode_id)
        .where(
            Ticket.branch_id == branch_id,
            Ticket.ticket_date >= date_start,
            Ticket.ticket_date <= date_end,
            Ticket.is_cancelled == False,
            TicketItem.is_cancelled == False,
            PaymentMode.name == "CASH",
        )
    )
    if protected_item_ids:
        q = q.where(~TicketItem.item_id.in_(protected_item_ids))
    return (await db.execute(q)).scalar_one()


async def _fetch_cash_total(
    db: AsyncSession, branch_id: int, date_start: date, date_end: date
) -> Decimal:
    q = (
        select(func.coalesce(func.sum(Ticket.net_amount), 0))
        .select_from(Ticket)
        .join(PaymentMode, PaymentMode.id == Ticket.payment_mode_id)
        .where(
            Ticket.branch_id == branch_id,
            Ticket.ticket_date >= date_start,
            Ticket.ticket_date <= date_end,
            Ticket.is_cancelled == False,
            PaymentMode.name == "CASH",
        )
    )
    return Decimal(str((await db.execute(q)).scalar_one()))


def _order_clause(rule: ParameterMaster):
    order = rule.ticket_selection_order
    item_value = (TicketItem.rate + TicketItem.levy) * TicketItem.quantity
    if order == "LIFO":
        return [Ticket.id.desc(), TicketItem.id.asc()]
    if order == "HIGHEST_VALUE":
        return [item_value.desc(), Ticket.id.asc(), TicketItem.id.asc()]
    if order == "LOWEST_VALUE":
        return [item_value.asc(), Ticket.id.asc(), TicketItem.id.asc()]
    return [Ticket.id.asc(), TicketItem.id.asc()]  # FIFO default


async def _build_deletion_plan(
    db: AsyncSession,
    branch_id: int,
    date_start: date,
    date_end: date,
    target_amount: Decimal,
    protected_item_ids: set[int],
) -> tuple[list[int], Decimal, dict[int, list[dict]]]:
    """
    Build a deletion plan that deletes items until cumulative value reaches target_amount
    without overshoot. Walks rules in priority_order; within each rule uses ticket_selection_order.
    Returns (item_ids_to_delete, actual_applied, per_ticket_detail).
    per_ticket_detail maps ticket_id -> list of item dicts to be deleted.
    """
    if target_amount <= 0:
        return [], Decimal("0"), {}

    rules_result = await db.execute(
        select(ParameterMaster)
        .where(ParameterMaster.is_active == True, ParameterMaster.is_protected == False)
        .order_by(ParameterMaster.priority_order)
    )
    rules = list(rules_result.scalars().all())

    deletion_ids: list[int] = []
    deletion_set: set[int] = set()
    applied = Decimal("0")
    per_ticket: dict[int, list[dict]] = {}
    remaining = target_amount

    # If no unprotected rules defined, treat it as "all non-protected items eligible"
    # using a default pseudo-rule (FIFO, no caps)
    if not rules:
        pseudo_rule = ParameterMaster(
            id=0,
            priority_order=999999,
            branch_scope=None,
            item_id=None,
            payment_mode="CASH",
            ticket_conditions={},
            item_conditions={},
            ticket_selection_order="FIFO",
            max_adjustment_per_ticket=None,
            max_adjustment_per_item=None,
            max_total_adjustment_per_rule=None,
            stop_on_match=False,
            is_active=True,
            is_protected=False,
            min_remaining_per_item=0,
        )
        rules = [pseudo_rule]

    for rule in rules:
        if remaining <= 0:
            break

        max_per_rule = Decimal(str(rule.max_total_adjustment_per_rule)) if rule.max_total_adjustment_per_rule else None
        rule_cap = min(remaining, max_per_rule) if max_per_rule else remaining
        if rule_cap <= 0:
            continue

        q = (
            select(
                TicketItem.id.label("tiid"),
                TicketItem.ticket_id,
                TicketItem.item_id,
                TicketItem.rate,
                TicketItem.levy,
                TicketItem.quantity,
                Item.name.label("item_name"),
            )
            .select_from(TicketItem)
            .join(Ticket, Ticket.id == TicketItem.ticket_id)
            .join(PaymentMode, PaymentMode.id == Ticket.payment_mode_id)
            .join(Item, Item.id == TicketItem.item_id)
            .where(
                Ticket.branch_id == branch_id,
                Ticket.ticket_date >= date_start,
                Ticket.ticket_date <= date_end,
                Ticket.is_cancelled == False,
                TicketItem.is_cancelled == False,
                PaymentMode.name == "CASH",
            )
            .order_by(*_order_clause(rule))
        )
        if protected_item_ids:
            q = q.where(~TicketItem.item_id.in_(protected_item_ids))
        if rule.item_id:
            q = q.where(TicketItem.item_id == rule.item_id)

        rows = (await db.execute(q)).all()

        max_per_ticket = Decimal(str(rule.max_adjustment_per_ticket)) if rule.max_adjustment_per_ticket else None
        rule_spent = Decimal("0")
        ticket_spent: dict[int, Decimal] = {}

        for r in rows:
            if r.tiid in deletion_set:
                continue
            if rule_spent >= rule_cap or remaining <= 0:
                break

            item_value = (Decimal(str(r.rate)) + Decimal(str(r.levy))) * r.quantity

            if item_value > remaining or item_value > (rule_cap - rule_spent):
                continue

            if max_per_ticket is not None:
                tspent = ticket_spent.get(r.ticket_id, Decimal("0"))
                if item_value > (max_per_ticket - tspent):
                    continue
                ticket_spent[r.ticket_id] = tspent + item_value

            deletion_ids.append(r.tiid)
            deletion_set.add(r.tiid)
            applied += item_value
            rule_spent += item_value
            remaining -= item_value
            per_ticket.setdefault(r.ticket_id, []).append({
                "ticket_item_id": r.tiid,
                "item_id": r.item_id,
                "item_name": r.item_name,
                "rate": float(r.rate),
                "levy": float(r.levy),
                "quantity": r.quantity,
                "line_value": float(item_value),
            })

        if rule.stop_on_match and rule_spent > 0:
            break

    return deletion_ids, applied, per_ticket


async def _snapshot_tickets_for_preview(
    db: AsyncSession, ticket_ids: list[int]
) -> dict[int, dict]:
    """Return ticket_id -> {original_amount, branch_id, items} for the preview UI."""
    if not ticket_ids:
        return {}
    q = (
        select(
            Ticket.id.label("ticket_id"),
            Ticket.net_amount,
            Ticket.branch_id,
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
        .where(Ticket.id.in_(ticket_ids), TicketItem.is_cancelled == False)
        .order_by(Ticket.id.asc(), TicketItem.id.asc())
    )
    rows = (await db.execute(q)).all()
    result: dict[int, dict] = {}
    for r in rows:
        if r.ticket_id not in result:
            result[r.ticket_id] = {
                "ticket_id": r.ticket_id,
                "branch_id": r.branch_id,
                "original_amount": float(r.net_amount),
                "items": [],
            }
        result[r.ticket_id]["items"].append({
            "ticket_item_id": r.tiid,
            "item_id": r.item_id,
            "item_name": r.item_name,
            "rate": float(r.rate),
            "levy": float(r.levy),
            "quantity": r.quantity,
            "line_value": float((Decimal(str(r.rate)) + Decimal(str(r.levy))) * r.quantity),
        })
    return result


async def dry_run(
    db: AsyncSession,
    branch_id: int,
    date_start: date,
    date_end: date,
    adjustment_amount: float,
    created_by: uuid.UUID,
) -> dict:
    requested = Decimal(str(adjustment_amount)).quantize(Decimal("0.01"))
    if requested <= 0:
        raise HTTPException(status_code=400, detail="Adjustment amount must be positive")

    # Load protected item IDs from protected rules
    protected_result = await db.execute(
        select(ParameterMaster.item_id)
        .where(ParameterMaster.is_active == True, ParameterMaster.is_protected == True)
    )
    protected_item_ids = {row[0] for row in protected_result.all() if row[0] is not None}

    # Guard 1: row count (count BEFORE heavy loads)
    item_count = await _count_eligible_unprotected_items(db, branch_id, date_start, date_end, protected_item_ids)
    if item_count > MAX_ITEM_ROWS:
        raise HTTPException(status_code=400, detail=f"Too many eligible ticket items ({item_count}). Reduce the date range. Max: {MAX_ITEM_ROWS}")
    if item_count == 0:
        raise HTTPException(status_code=400, detail="No unprotected items available for deletion in this branch / date range")

    cash_total = await _fetch_cash_total(db, branch_id, date_start, date_end)

    # Compute max_possible_adjustment
    max_possible_q = (
        select(func.coalesce(func.sum((TicketItem.rate + TicketItem.levy) * TicketItem.quantity), 0))
        .select_from(TicketItem)
        .join(Ticket, Ticket.id == TicketItem.ticket_id)
        .join(PaymentMode, PaymentMode.id == Ticket.payment_mode_id)
        .where(
            Ticket.branch_id == branch_id,
            Ticket.ticket_date >= date_start,
            Ticket.ticket_date <= date_end,
            Ticket.is_cancelled == False,
            TicketItem.is_cancelled == False,
            PaymentMode.name == "CASH",
        )
    )
    if protected_item_ids:
        max_possible_q = max_possible_q.where(~TicketItem.item_id.in_(protected_item_ids))
    max_possible = Decimal(str((await db.execute(max_possible_q)).scalar_one()))

    if max_possible <= 0:
        raise HTTPException(status_code=400, detail="No value available for deletion")

    recommended_amount = _round_down_to_clean(max_possible)
    if recommended_amount <= 0:
        recommended_amount = max_possible

    rec_ids, rec_applied, rec_detail = await _build_deletion_plan(
        db, branch_id, date_start, date_end, recommended_amount, protected_item_ids
    )

    req_target = min(requested, max_possible)
    req_ids, req_applied, req_detail = await _build_deletion_plan(
        db, branch_id, date_start, date_end, req_target, protected_item_ids
    )

    rec_id_set = set(rec_ids)
    diff_items = [tid for tid in req_ids if tid not in rec_id_set]

    all_affected_ticket_ids = list(set(list(rec_detail.keys()) + list(req_detail.keys())))
    ticket_snapshots = await _snapshot_tickets_for_preview(db, all_affected_ticket_ids)

    def build_tickets_view(plan_detail: dict[int, list[dict]]) -> list[dict]:
        out = []
        for tid, items in plan_detail.items():
            snap = ticket_snapshots.get(tid, {"ticket_id": tid, "branch_id": branch_id, "original_amount": 0.0, "items": []})
            deleted_ids = {it["ticket_item_id"] for it in items}
            final_items = [i for i in snap["items"] if i["ticket_item_id"] not in deleted_ids]
            final_amount = sum(i["line_value"] for i in final_items)
            out.append({
                "ticket_id": tid,
                "branch_id": snap["branch_id"],
                "original_amount": snap["original_amount"],
                "original_items": snap["items"],
                "items_to_remove": items,
                "final_items": final_items,
                "final_amount": final_amount,
            })
        return sorted(out, key=lambda t: t["ticket_id"])

    execution_plan = {
        "branch_id": branch_id,
        "date_start": str(date_start),
        "date_end": str(date_end),
        "requested_adjustment": str(requested),
        "recommended_adjustment": str(recommended_amount),
        "max_possible_adjustment": str(max_possible),
        "cash_total_before": str(cash_total),
        "recommended_plan": {
            "applied": str(rec_applied),
            "item_ids": rec_ids,
            "tickets": build_tickets_view(rec_detail),
        },
        "requested_plan": {
            "applied": str(req_applied),
            "item_ids": req_ids,
            "tickets": build_tickets_view(req_detail),
        },
        "diff_items": diff_items,
    }

    log = AdminAdjustmentsLog(
        branch_id=branch_id,
        date_range_start=date_start,
        date_range_end=date_end,
        adjustment_amount=float(requested),
        dry_run_summary=execution_plan,
        total_tickets_affected=len(req_detail),
        total_items_affected=len(req_ids),
        row_count_checked=item_count,
        status="DRY_RUN",
        created_by=created_by,
    )
    db.add(log)
    await db.flush()
    await db.refresh(log)

    return {
        "batch_id": str(log.id),
        "cash_total_before": float(cash_total),
        "requested_adjustment": float(requested),
        "recommended_adjustment": float(recommended_amount),
        "max_possible_adjustment": float(max_possible),
        "recommended_plan": {
            "applied": float(rec_applied),
            "tickets": execution_plan["recommended_plan"]["tickets"],
            "item_ids": rec_ids,
        },
        "requested_plan": {
            "applied": float(req_applied),
            "tickets": execution_plan["requested_plan"]["tickets"],
            "item_ids": req_ids,
        },
        "diff_items": diff_items,
    }


async def commit(
    db: AsyncSession,
    batch_id: str,
    plan_choice: str,
    confirmed_by: uuid.UUID,
) -> dict:
    if plan_choice not in ("recommended", "requested"):
        raise HTTPException(status_code=400, detail="plan_choice must be 'recommended' or 'requested'")

    result = await db.execute(
        select(AdminAdjustmentsLog).where(AdminAdjustmentsLog.id == batch_id)
    )
    log = result.scalar_one_or_none()
    if log is None:
        raise HTTPException(status_code=404, detail="Adjustment batch not found")
    if log.status != "DRY_RUN":
        raise HTTPException(status_code=400, detail=f"Batch is not in DRY_RUN state (current: {log.status})")

    plan = log.dry_run_summary[f"{plan_choice}_plan"]
    item_ids: list[int] = plan["item_ids"]
    tickets_view: list[dict] = plan["tickets"]

    if not item_ids:
        raise HTTPException(status_code=400, detail="No items in selected plan")

    # Mark IN_PROGRESS in a separate session (survives main tx rollback)
    async with AsyncSessionLocal() as log_session:
        async with log_session.begin():
            await log_session.execute(
                update(AdminAdjustmentsLog)
                .where(AdminAdjustmentsLog.id == batch_id)
                .values(status="IN_PROGRESS", plan_choice=plan_choice)
            )

    try:
        date_hash = _date_lock_hash(log.date_range_start, log.date_range_end)
        await db.execute(
            text("SELECT pg_advisory_xact_lock(:a, :b)"),
            {"a": log.branch_id, "b": date_hash},
        )

        ticket_ids = list({t["ticket_id"] for t in tickets_view})

        # Backup affected tickets
        tickets_result = await db.execute(select(Ticket).where(Ticket.id.in_(ticket_ids)))
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

        # Backup items being deleted + capture for audit
        items_result = await db.execute(select(TicketItem).where(TicketItem.id.in_(item_ids)))
        item_rows_by_id: dict[int, TicketItem] = {}
        for ti in items_result.scalars().all():
            item_rows_by_id[ti.id] = ti
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
                    "quantity": ti.quantity,
                    "vehicle_no": ti.vehicle_no,
                    "vehicle_name": ti.vehicle_name,
                },
            ))

        # Audit details
        for t in tickets_view:
            for it in t["items_to_remove"]:
                ti = item_rows_by_id.get(it["ticket_item_id"])
                if ti is None:
                    continue
                rate_dec = Decimal(str(ti.rate))
                levy_dec = Decimal(str(ti.levy))
                total_del = (rate_dec + levy_dec) * ti.quantity
                db.add(AdminAdjustmentDetails(
                    adjustment_id=log.id,
                    ticket_id=ti.ticket_id,
                    ticket_item_id=ti.id,
                    old_rate=float(rate_dec),
                    old_levy=float(levy_dec),
                    new_rate=0.0,
                    new_levy=0.0,
                    rate_delta=float(rate_dec),
                    levy_delta=float(levy_dec),
                    total_delta=float(total_del),
                    matched_rule_id=None,
                    operation_type="DELETE",
                ))

        # DELETE items (the actual mutation)
        await db.execute(delete(TicketItem).where(TicketItem.id.in_(item_ids)))

        # Recalculate net_amount on affected tickets only
        await db.execute(
            text("""
                UPDATE tickets
                SET net_amount = (
                    SELECT COALESCE(SUM((ti.rate + ti.levy) * ti.quantity), 0)
                    FROM ticket_items ti
                    WHERE ti.ticket_id = tickets.id AND ti.is_cancelled = false
                )
                WHERE id = ANY(:ids)
            """),
            {"ids": ticket_ids},
        )

        log.status = "COMMITTED"
        log.executed_at = datetime.now(timezone.utc)
        log.plan_choice = plan_choice
        log.total_tickets_affected = len(ticket_ids)
        log.total_items_affected = len(item_ids)
        await db.flush()

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
        "plan_choice": plan_choice,
        "tickets_affected": len(ticket_ids),
        "items_deleted": len(item_ids),
        "executed_at": log.executed_at.isoformat(),
    }
