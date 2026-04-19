import hashlib
import uuid
from datetime import date, datetime, timezone
from decimal import Decimal, ROUND_DOWN
from sqlalchemy import func, select, text, update
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

MAX_ITEM_ROWS = 5000
PREVIEW_TICKET_CAP = 50


def _date_lock_hash(date_start: date, date_end: date) -> int:
    raw = f"{date_start}{date_end}".encode()
    return int(hashlib.md5(raw).hexdigest(), 16) % (2**31 - 1)


async def _count_eligible_items(
    db: AsyncSession, branch_id: int, date_start: date, date_end: date
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
            func.upper(PaymentMode.description) == "CASH",
        )
    )
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
            func.upper(PaymentMode.description) == "CASH",
        )
    )
    return Decimal(str((await db.execute(q)).scalar_one()))


def _order_clause(rule: ParameterMaster) -> list:
    order = rule.ticket_selection_order
    if order == "LIFO":
        return [Ticket.id.desc(), TicketItem.id.asc()]
    if order == "HIGHEST_VALUE":
        return [
            ((TicketItem.rate + TicketItem.levy) * TicketItem.quantity).desc(),
            Ticket.id.asc(),
            TicketItem.id.asc(),
        ]
    if order == "LOWEST_VALUE":
        return [
            ((TicketItem.rate + TicketItem.levy) * TicketItem.quantity).asc(),
            Ticket.id.asc(),
            TicketItem.id.asc(),
        ]
    return [Ticket.id.asc(), TicketItem.id.asc()]  # FIFO default


async def _fetch_eligible_items_for_rule(
    db: AsyncSession,
    rule: ParameterMaster,
    branch_id: int,
    date_start: date,
    date_end: date,
) -> list[dict]:
    q = (
        select(
            Ticket.id.label("ticket_id"),
            Ticket.net_amount.label("ticket_net_amount"),
            TicketItem.id.label("item_id"),
            TicketItem.rate,
            TicketItem.levy,
            TicketItem.quantity,
        )
        .select_from(TicketItem)
        .join(Ticket, Ticket.id == TicketItem.ticket_id)
        .join(PaymentMode, PaymentMode.id == Ticket.payment_mode_id)
        .where(
            Ticket.branch_id == branch_id,
            Ticket.ticket_date >= date_start,
            Ticket.ticket_date <= date_end,
            Ticket.is_cancelled == False,
            TicketItem.is_cancelled == False,
            func.upper(PaymentMode.description) == "CASH",
        )
        .order_by(*_order_clause(rule))
    )
    if rule.item_id:
        q = q.where(TicketItem.item_id == rule.item_id)

    rows = (await db.execute(q)).all()
    return [
        {
            "ticket_id": r.ticket_id,
            "ticket_net_amount": Decimal(str(r.ticket_net_amount)),
            "item_id": r.item_id,
            "rate": Decimal(str(r.rate)),
            "levy": Decimal(str(r.levy)),
            "quantity": r.quantity,
        }
        for r in rows
    ]


def _apply_rule_to_items(
    items: list[dict],
    remaining: Decimal,
    rule: ParameterMaster,
) -> tuple[list[dict], Decimal]:
    """
    Apply adjustment to items for one rule.
    Returns (list of change records, remaining_amount after this rule).
    Stops strictly when remaining == 0. No overshoot.
    Pro-rates delta by item value within the rule's total eligible value.
    """
    if remaining <= 0:
        return [], remaining

    max_per_rule = Decimal(str(rule.max_total_adjustment_per_rule)) if rule.max_total_adjustment_per_rule else None
    max_per_item = Decimal(str(rule.max_adjustment_per_item)) if rule.max_adjustment_per_item else None
    max_per_ticket = Decimal(str(rule.max_adjustment_per_ticket)) if rule.max_adjustment_per_ticket else None

    rule_cap = min(remaining, max_per_rule) if max_per_rule else remaining
    if rule_cap <= 0:
        return [], remaining

    # Total eligible value for pro-ration
    total_eligible = sum(
        (item["rate"] + item["levy"]) * item["quantity"] for item in items
    )
    if total_eligible <= 0:
        return [], remaining

    changes = []
    rule_spent = Decimal("0")
    ticket_spent: dict[int, Decimal] = {}

    for item in items:
        if rule_spent >= rule_cap or remaining <= 0:
            break

        item_value = (item["rate"] + item["levy"]) * item["quantity"]
        pro_rata = (item_value / total_eligible * rule_cap).quantize(
            Decimal("0.01"), rounding=ROUND_DOWN
        )

        delta = pro_rata
        if max_per_item:
            delta = min(delta, max_per_item)
        if max_per_ticket:
            tid = item["ticket_id"]
            ticket_spent.setdefault(tid, Decimal("0"))
            ticket_remaining = max_per_ticket - ticket_spent[tid]
            delta = min(delta, ticket_remaining)
        delta = min(delta, remaining - rule_spent, rule_cap - rule_spent)
        delta = delta.quantize(Decimal("0.01"), rounding=ROUND_DOWN)

        if delta <= 0:
            continue

        # Apply delta to rate first, then levy
        rate_delta = min(delta, item["rate"] * item["quantity"])
        max_levy_available = item["levy"] * item["quantity"]
        levy_delta = min(delta - rate_delta, max_levy_available)
        actual_delta = rate_delta + levy_delta
        new_rate = (item["rate"] - rate_delta / item["quantity"]).quantize(
            Decimal("0.01"), rounding=ROUND_DOWN
        )
        new_levy = (item["levy"] - levy_delta / item["quantity"]).quantize(
            Decimal("0.01"), rounding=ROUND_DOWN
        )

        changes.append({
            "ticket_id": item["ticket_id"],
            "item_id": item["item_id"],
            "old_rate": float(item["rate"]),
            "old_levy": float(item["levy"]),
            "new_rate": float(new_rate),
            "new_levy": float(new_levy),
            "rate_delta": float(rate_delta),
            "levy_delta": float(levy_delta),
            "total_delta": float(actual_delta),
        })
        rule_spent += actual_delta
        ticket_spent[item["ticket_id"]] = ticket_spent.get(item["ticket_id"], Decimal("0")) + actual_delta

    remaining -= rule_spent
    return changes, remaining


async def dry_run(
    db: AsyncSession,
    branch_id: int,
    date_start: date,
    date_end: date,
    adjustment_amount: float,
    created_by: uuid.UUID,
) -> dict:
    """
    Phase 1: compute and store the deterministic execution plan. No data modified.
    Returns a preview summary + batch_id for use in commit().
    """
    amount = Decimal(str(adjustment_amount)).quantize(Decimal("0.01"))
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Adjustment amount must be positive")

    # Guard 1: row count BEFORE loading dataset
    item_count = await _count_eligible_items(db, branch_id, date_start, date_end)
    if item_count > MAX_ITEM_ROWS:
        raise HTTPException(
            status_code=400,
            detail=f"Too many eligible ticket items ({item_count}). Reduce the date range. Max: {MAX_ITEM_ROWS}",
        )

    # Guard 2: adjustment must not exceed eligible cash
    cash_total = await _fetch_cash_total(db, branch_id, date_start, date_end)
    if amount > cash_total:
        raise HTTPException(
            status_code=400,
            detail=f"Adjustment amount exceeds eligible cash total (cash: {float(cash_total):.2f})",
        )

    # Load active rules in priority order
    rules_result = await db.execute(
        select(ParameterMaster)
        .where(ParameterMaster.is_active == True)
        .order_by(ParameterMaster.priority_order)
    )
    rules = list(rules_result.scalars().all())

    remaining = amount
    all_changes: list[dict] = []
    tickets_affected: set[int] = set()

    for rule in rules:
        if remaining <= 0:
            break
        items = await _fetch_eligible_items_for_rule(db, rule, branch_id, date_start, date_end)
        changes, remaining = _apply_rule_to_items(items, remaining, rule)
        for c in changes:
            c["matched_rule_id"] = rule.id
        all_changes.extend(changes)
        tickets_affected.update(c["ticket_id"] for c in changes)
        if rule.stop_on_match and changes:
            break

    total_applied = sum(Decimal(str(c["total_delta"])) for c in all_changes)

    execution_plan = {
        "branch_id": branch_id,
        "date_start": str(date_start),
        "date_end": str(date_end),
        "adjustment_amount": str(amount),
        "changes": all_changes,
        "cash_total_before": str(cash_total),
        "total_delta": str(total_applied),
    }

    log = AdminAdjustmentsLog(
        branch_id=branch_id,
        date_range_start=date_start,
        date_range_end=date_end,
        adjustment_amount=float(amount),
        dry_run_summary=execution_plan,
        total_tickets_affected=len(tickets_affected),
        total_items_affected=len(all_changes),
        row_count_checked=item_count,
        status="DRY_RUN",
        created_by=created_by,
    )
    db.add(log)
    await db.flush()
    await db.refresh(log)

    return {
        "batch_id": str(log.id),
        "summary": {
            "branch_id": branch_id,
            "date_start": str(date_start),
            "date_end": str(date_end),
            "eligible_items_checked": item_count,
            "cash_total_before": float(cash_total),
            "total_adjustment_applied": float(total_applied),
            "cash_total_after": float(cash_total) - float(total_applied),
            "tickets_affected": len(tickets_affected),
            "items_affected": len(all_changes),
            "amount_not_applied": float(remaining),
        },
        "preview_changes": all_changes[:PREVIEW_TICKET_CAP],
    }


async def commit(
    db: AsyncSession,
    batch_id: str,
    confirmed_by: uuid.UUID,
) -> dict:
    """
    Phase 2: execute the stored plan atomically. Reuses dry_run_summary — does NOT recompute.
    """
    result = await db.execute(
        select(AdminAdjustmentsLog).where(AdminAdjustmentsLog.id == batch_id)
    )
    log = result.scalar_one_or_none()
    if log is None:
        raise HTTPException(status_code=404, detail="Adjustment batch not found")
    if log.status != "DRY_RUN":
        raise HTTPException(
            status_code=400,
            detail=f"Batch is not in DRY_RUN state (current: {log.status})",
        )

    plan = log.dry_run_summary
    changes: list[dict] = plan["changes"]
    branch_id = log.branch_id

    if not changes:
        raise HTTPException(status_code=400, detail="No changes in execution plan")

    # Mark IN_PROGRESS in a SEPARATE transaction so this log survives rollback
    async with AsyncSessionLocal() as log_session:
        async with log_session.begin():
            await log_session.execute(
                update(AdminAdjustmentsLog)
                .where(AdminAdjustmentsLog.id == batch_id)
                .values(status="IN_PROGRESS")
            )

    try:
        # Advisory lock: prevent concurrent commits for same branch+date range
        date_hash = _date_lock_hash(log.date_range_start, log.date_range_end)
        await db.execute(
            text("SELECT pg_advisory_xact_lock(:a, :b)"),
            {"a": branch_id, "b": date_hash},
        )

        ticket_ids = list({c["ticket_id"] for c in changes})
        item_ids = [c["item_id"] for c in changes]

        # Backup tickets (immutable JSONB snapshot)
        tickets_result = await db.execute(
            select(Ticket).where(Ticket.id.in_(ticket_ids))
        )
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

        # Backup ticket_items (immutable JSONB snapshot)
        items_result = await db.execute(
            select(TicketItem).where(TicketItem.id.in_(item_ids))
        )
        for ti in items_result.scalars().all():
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
                },
            ))

        # Apply changes to ticket_items
        for change in changes:
            await db.execute(
                update(TicketItem)
                .where(TicketItem.id == change["item_id"])
                .values(
                    rate=change["new_rate"],
                    levy=change["new_levy"],
                    last_adjustment_id=log.id,
                )
            )

        # Recalculate net_amount for affected tickets ONLY (optimized grouped SUM)
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

        # Insert audit details
        for change in changes:
            db.add(AdminAdjustmentDetails(
                adjustment_id=log.id,
                ticket_id=change["ticket_id"],
                ticket_item_id=change["item_id"],
                old_rate=change["old_rate"],
                old_levy=change["old_levy"],
                new_rate=change["new_rate"],
                new_levy=change["new_levy"],
                rate_delta=change["rate_delta"],
                levy_delta=change["levy_delta"],
                total_delta=change["total_delta"],
                matched_rule_id=change.get("matched_rule_id"),
            ))

        # Mark COMMITTED
        log.status = "COMMITTED"
        log.executed_at = datetime.now(timezone.utc)
        log.total_tickets_affected = len(ticket_ids)
        log.total_items_affected = len(changes)
        await db.flush()

    except Exception as exc:
        # Mark FAILED in a separate session (survives the main transaction rollback)
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
        "tickets_affected": len(ticket_ids),
        "items_affected": len(changes),
        "executed_at": log.executed_at.isoformat(),
    }
