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
            func.upper(PaymentMode.description) == "CASH",
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
            func.upper(PaymentMode.description) == "CASH",
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

    from sqlalchemy import or_ as _or
    rules_result = await db.execute(
        select(ParameterMaster)
        .where(
            ParameterMaster.is_active == True,
            ParameterMaster.is_protected == False,
            _or(ParameterMaster.branch_scope == None, ParameterMaster.branch_scope == branch_id),
        )
        .order_by(ParameterMaster.priority_order)
    )
    rules = list(rules_result.scalars().all())

    deletion_ids: list[int] = []
    deletion_set: set[int] = set()
    applied = Decimal("0")
    per_ticket: dict[int, list[dict]] = {}
    remaining = target_amount

    # Always append a catch-all pseudo-rule at the END. This ensures items marked
    # "Deletable" via the simplified Parameter Master UI (but not covered by any
    # user-defined unprotected rule) are still eligible for deletion.
    # The deletion_set guard prevents double-counting items already processed by
    # a prior rule.
    catchall_rule = ParameterMaster(
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
    rules.append(catchall_rule)

    # Collect item_ids explicitly governed by user-defined (non-catch-all) rules.
    # The catch-all must NOT re-pick items covered by these specific rules;
    # doing so would bypass their per-rule caps. Specific rules are the sole
    # handler for their item_id.
    specific_rule_item_ids: set[int] = {
        r.item_id for r in rules if r.item_id is not None and r.id != 0
    }

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
                func.upper(PaymentMode.description) == "CASH",
            )
            .order_by(*_order_clause(rule))
        )
        if protected_item_ids:
            q = q.where(~TicketItem.item_id.in_(protected_item_ids))
        if rule.item_id:
            q = q.where(TicketItem.item_id == rule.item_id)
        elif rule.id == 0 and specific_rule_item_ids:
            # This is the catch-all. Exclude items already governed by a specific rule
            # so their per-rule caps (if any) are not bypassed.
            q = q.where(~TicketItem.item_id.in_(specific_rule_item_ids))

        rows = (await db.execute(q)).all()

        max_per_ticket = Decimal(str(rule.max_adjustment_per_ticket)) if rule.max_adjustment_per_ticket else None
        max_per_item = Decimal(str(rule.max_adjustment_per_item)) if rule.max_adjustment_per_item else None
        min_remaining = rule.min_remaining_per_item or 0
        rule_spent = Decimal("0")
        ticket_spent: dict[int, Decimal] = {}

        # Build a per-(ticket_id, item_id) original quantity map for min_remaining enforcement
        quantity_map: dict[tuple[int, int], int] = {}
        for r in rows:
            key = (r.ticket_id, r.item_id)
            quantity_map[key] = quantity_map.get(key, 0) + r.quantity
        # Track how much of each (ticket_id, item_id) we've already planned to delete
        planned_delete_qty: dict[tuple[int, int], int] = {}

        for r in rows:
            if r.tiid in deletion_set:
                continue
            if rule_spent >= rule_cap or remaining <= 0:
                break

            item_value = (Decimal(str(r.rate)) + Decimal(str(r.levy))) * r.quantity

            # Skip zero-value items (free tickets, comps, etc.) — no point deleting them
            if item_value <= 0:
                continue

            # Per-item cap: if this single row's value exceeds the max_per_item cap, skip it
            if max_per_item is not None and item_value > max_per_item:
                continue

            # Min-remaining guard: deleting this row cannot reduce (ticket_id, item_id)
            # total quantity below the configured floor.
            if min_remaining > 0:
                key = (r.ticket_id, r.item_id)
                original_qty = quantity_map.get(key, 0)
                already_planned = planned_delete_qty.get(key, 0)
                remaining_if_deleted = original_qty - already_planned - r.quantity
                if remaining_if_deleted < min_remaining:
                    continue

            if item_value > remaining or item_value > (rule_cap - rule_spent):
                continue

            if max_per_ticket is not None:
                tspent = ticket_spent.get(r.ticket_id, Decimal("0"))
                if item_value > (max_per_ticket - tspent):
                    continue
                ticket_spent[r.ticket_id] = tspent + item_value

            if min_remaining > 0:
                key = (r.ticket_id, r.item_id)
                planned_delete_qty[key] = planned_delete_qty.get(key, 0) + r.quantity

            deletion_ids.append(r.tiid)
            deletion_set.add(r.tiid)
            applied += item_value
            rule_spent += item_value
            remaining -= item_value
            unit_value = Decimal(str(r.rate)) + Decimal(str(r.levy))
            per_ticket.setdefault(r.ticket_id, []).append({
                "ticket_item_id": r.tiid,
                "item_id": r.item_id,
                "item_name": r.item_name,
                "unit_value": float(unit_value),
                "quantity": r.quantity,
                "line_value": float(item_value),
                "matched_rule_id": rule.id if rule.id else None,
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
        unit_value = Decimal(str(r.rate)) + Decimal(str(r.levy))
        result[r.ticket_id]["items"].append({
            "ticket_item_id": r.tiid,
            "item_id": r.item_id,
            "item_name": r.item_name,
            "unit_value": float(unit_value),
            "quantity": r.quantity,
            "line_value": float(unit_value * r.quantity),
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
    from sqlalchemy import or_ as _or_pr
    protected_result = await db.execute(
        select(ParameterMaster.item_id)
        .where(
            ParameterMaster.is_active == True,
            ParameterMaster.is_protected == True,
            _or_pr(ParameterMaster.branch_scope == None, ParameterMaster.branch_scope == branch_id),
        )
    )
    protected_item_ids = {row[0] for row in protected_result.all() if row[0] is not None}

    # Guard 1: row count (count BEFORE heavy loads)
    item_count = await _count_eligible_unprotected_items(db, branch_id, date_start, date_end, protected_item_ids)
    if item_count > MAX_ITEM_ROWS:
        raise HTTPException(status_code=400, detail=f"Too many eligible ticket items ({item_count}). Reduce the date range. Max: {MAX_ITEM_ROWS}")
    if item_count == 0:
        raise HTTPException(status_code=400, detail="No unprotected items available for deletion in this branch / date range")

    cash_total = await _fetch_cash_total(db, branch_id, date_start, date_end)

    # Compute deletable vs protected cash breakdown for admin clarity.
    # deletable_cash_total = sum of (rate+levy)*qty for items NOT protected
    # protected_cash_total = sum of (rate+levy)*qty for items that ARE protected
    deletable_cash_q = (
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
            func.upper(PaymentMode.description) == "CASH",
        )
    )
    if protected_item_ids:
        deletable_cash_q = deletable_cash_q.where(~TicketItem.item_id.in_(protected_item_ids))
    deletable_cash_total = Decimal(str((await db.execute(deletable_cash_q)).scalar_one()))

    protected_cash_total = Decimal("0")
    if protected_item_ids:
        protected_cash_q = (
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
                func.upper(PaymentMode.description) == "CASH",
                TicketItem.item_id.in_(protected_item_ids),
            )
        )
        protected_cash_total = Decimal(str((await db.execute(protected_cash_q)).scalar_one()))

    # Step 1: Build the REQUESTED plan first — target the exact amount admin entered.
    # achievable_amount = what this plan actually delivers (discrete items may fall short).
    req_ids, achievable_amount, req_detail = await _build_deletion_plan(
        db, branch_id, date_start, date_end, requested, protected_item_ids
    )

    if achievable_amount <= 0:
        raise HTTPException(
            status_code=400,
            detail="No deletable items found for this branch/date range — nothing to adjust.",
        )

    # Step 1b: Build the CLOSEST plan — Requested plan + up to ONE extra item
    # if that item lands the total closer to `requested` than undershooting does.
    closest_ids: list[int] = list(req_ids)
    closest_applied: Decimal = achievable_amount
    closest_detail: dict[int, list[dict]] = {tid: list(items) for tid, items in req_detail.items()}
    closest_extra_item_id: int | None = None

    gap = requested - achievable_amount
    if gap > 0:
        # Find an unprotected item NOT in req_ids whose value, when added, minimizes
        # abs(requested - new_total). Only consider items that strictly improve.
        req_id_set = set(req_ids)
        candidate_q = (
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
                func.upper(PaymentMode.description) == "CASH",
            )
            .order_by(Ticket.id.asc(), TicketItem.id.asc())
        )
        if protected_item_ids:
            candidate_q = candidate_q.where(~TicketItem.item_id.in_(protected_item_ids))

        candidate_rows = (await db.execute(candidate_q)).all()
        best_item = None
        best_distance = gap  # current undershoot distance; must beat this to be useful

        for c in candidate_rows:
            if c.tiid in req_id_set:
                continue
            unit_value = Decimal(str(c.rate)) + Decimal(str(c.levy))
            item_value = unit_value * c.quantity
            if item_value <= 0:
                continue
            new_applied = achievable_amount + item_value
            new_distance = abs(requested - new_applied)
            if new_distance < best_distance:
                best_distance = new_distance
                best_item = {
                    "tiid": c.tiid,
                    "ticket_id": c.ticket_id,
                    "item_id": c.item_id,
                    "item_name": c.item_name,
                    "unit_value": float(unit_value),
                    "quantity": c.quantity,
                    "line_value": float(item_value),
                }

        if best_item is not None:
            closest_extra_item_id = best_item["tiid"]
            closest_ids.append(best_item["tiid"])
            closest_applied = achievable_amount + Decimal(str(best_item["line_value"]))
            closest_detail.setdefault(best_item["ticket_id"], []).append({
                "ticket_item_id": best_item["tiid"],
                "item_id": best_item["item_id"],
                "item_name": best_item["item_name"],
                "unit_value": best_item["unit_value"],
                "quantity": best_item["quantity"],
                "line_value": best_item["line_value"],
                "matched_rule_id": None,
            })

    # Step 2: Recommended = round DOWN of achievable (safe, clean number for admin).
    recommended_amount = _round_down_to_clean(achievable_amount)
    if recommended_amount <= 0:
        # Achievable is smaller than the smallest rounding step — just use achievable as-is.
        recommended_amount = achievable_amount

    # Step 3: Build the RECOMMENDED plan targeting the rounded-down amount.
    # This typically matches exactly (since recommended <= achievable).
    rec_ids, rec_applied, rec_detail = await _build_deletion_plan(
        db, branch_id, date_start, date_end, recommended_amount, protected_item_ids
    )

    # Unapplied = shortfall between what admin wanted and what items can deliver.
    unapplied_amount = requested - achievable_amount
    if unapplied_amount < 0:
        unapplied_amount = Decimal("0")

    # Diff items = items present in Requested plan but NOT in Recommended plan.
    # These are the "extra" items that get deleted when going for the Requested vs Recommended plan.
    rec_id_set = set(rec_ids)
    diff_items = [tid for tid in req_ids if tid not in rec_id_set]

    # Build preview snapshots
    all_affected_ticket_ids = list(set(list(rec_detail.keys()) + list(req_detail.keys()) + list(closest_detail.keys())))
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
        "achievable_adjustment": str(achievable_amount),
        "recommended_adjustment": str(recommended_amount),
        "unapplied_amount": str(unapplied_amount),
        "cash_total_before": str(cash_total),
        "recommended_plan": {
            "applied": str(rec_applied),
            "item_ids": rec_ids,
            "tickets": build_tickets_view(rec_detail),
        },
        "requested_plan": {
            "applied": str(achievable_amount),
            "item_ids": req_ids,
            "tickets": build_tickets_view(req_detail),
        },
        "closest_plan": {
            "applied": str(closest_applied),
            "item_ids": closest_ids,
            "tickets": build_tickets_view(closest_detail),
            "extra_item_id": closest_extra_item_id,
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

    # Unapplied based on what the Closest plan actually delivers
    closest_unapplied = requested - closest_applied
    if closest_unapplied < 0:
        closest_unapplied = Decimal("0")

    return {
        "batch_id": str(log.id),
        "cash_total_before": float(cash_total),
        "requested_adjustment": float(requested),
        "closest_applied": float(closest_applied),
        "deletable_cash_total": float(deletable_cash_total),
        "protected_cash_total": float(protected_cash_total),
        "unapplied_amount": float(closest_unapplied),
        "plan": {
            "applied": float(closest_applied),
            "tickets": execution_plan["closest_plan"]["tickets"],
            "item_ids": closest_ids,
            "extra_item_id": closest_extra_item_id,
        },
    }


async def commit(
    db: AsyncSession,
    batch_id: str,
    plan_choice: str,
    confirmed_by: uuid.UUID,
    skipped_ticket_ids: list[int] | None = None,
) -> dict:
    if plan_choice not in ("recommended", "requested", "closest"):
        raise HTTPException(status_code=400, detail="plan_choice must be 'recommended', 'requested', or 'closest'")

    skipped_set: set[int] = set(skipped_ticket_ids or [])

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

    # Mark IN_PROGRESS atomically in a separate session using compare-and-swap
    # (only transitions DRY_RUN -> IN_PROGRESS; fails loudly if status changed).
    # This prevents concurrent commits on the same batch from racing.
    async with AsyncSessionLocal() as log_session:
        async with log_session.begin():
            cas_result = await log_session.execute(
                update(AdminAdjustmentsLog)
                .where(
                    AdminAdjustmentsLog.id == batch_id,
                    AdminAdjustmentsLog.status == "DRY_RUN",
                )
                .values(status="IN_PROGRESS", plan_choice=plan_choice)
            )
            if cas_result.rowcount == 0:
                raise HTTPException(
                    status_code=409,
                    detail="Batch is being committed by another request or has already been processed.",
                )

    try:
        # Per-branch lock (overlapping date ranges would otherwise race).
        await db.execute(
            text("SELECT pg_advisory_xact_lock(:a, :b)"),
            {"a": log.branch_id, "b": 0},
        )

        ticket_ids = list({t["ticket_id"] for t in tickets_view})

        # Filter out items from tickets the admin chose to skip.
        # Derive skipped_item_ids from tickets_view, then FILTER the authoritative
        # stored plan["item_ids"] (defensive: don't re-derive item_ids from tickets_view).
        if skipped_set:
            skipped_item_ids = {
                it["ticket_item_id"]
                for t in tickets_view if t["ticket_id"] in skipped_set
                for it in t["items_to_remove"]
            }
            item_ids = [iid for iid in item_ids if iid not in skipped_item_ids]
            tickets_view = [t for t in tickets_view if t["ticket_id"] not in skipped_set]
            ticket_ids = [tid for tid in ticket_ids if tid not in skipped_set]

        if not item_ids:
            # Admin skipped every ticket — this is a no-op, not a commit. Revert status to DRY_RUN
            # so the admin can retry with different choices without generating a fresh batch.
            async with AsyncSessionLocal() as log_session:
                async with log_session.begin():
                    await log_session.execute(
                        update(AdminAdjustmentsLog)
                        .where(AdminAdjustmentsLog.id == batch_id)
                        .values(status="DRY_RUN", plan_choice=None)
                    )
            raise HTTPException(
                status_code=400,
                detail="All tickets were skipped — no changes made. Adjust your skip toggles and retry.",
            )

        # Identify which affected tickets become empty after the deletion (these get hard-deleted)
        hard_delete_ticket_ids: list[int] = [
            t["ticket_id"]
            for t in tickets_view
            if len(t.get("final_items", [])) == 0
        ]
        hard_delete_set: set[int] = set(hard_delete_ticket_ids)

        # Backup affected tickets — capture ALL fields needed for a complete restore,
        # including foreign keys that the rollback path's INSERT will require.
        tickets_result = await db.execute(select(Ticket).where(Ticket.id.in_(ticket_ids)))
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

        # Backup items being deleted + capture for audit
        items_result = await db.execute(select(TicketItem).where(TicketItem.id.in_(item_ids)))
        item_rows_by_id: dict[int, TicketItem] = {}
        backed_up_ids: set[int] = set()
        for ti in items_result.scalars().all():
            item_rows_by_id[ti.id] = ti
            backed_up_ids.add(ti.id)
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
                    "is_cancelled": ti.is_cancelled,
                },
            ))

        # Staleness guard: if any items in the plan no longer exist in the DB (cancelled,
        # deleted by replication, or concurrent D-drive run), abort — audit must match reality.
        missing_item_ids = [iid for iid in item_ids if iid not in item_rows_by_id]
        if missing_item_ids:
            raise HTTPException(
                status_code=409,
                detail=(
                    f"Plan is stale — {len(missing_item_ids)} ticket_item(s) no longer exist. "
                    f"Re-run the trial preview to generate a fresh plan."
                ),
            )

        # Also backup any ADDITIONAL items (including cancelled) on tickets that will be hard-deleted
        # so the full ticket state is recoverable
        if hard_delete_ticket_ids:
            extra_items_result = await db.execute(
                select(TicketItem).where(
                    TicketItem.ticket_id.in_(hard_delete_ticket_ids),
                    ~TicketItem.id.in_(list(backed_up_ids)) if backed_up_ids else True,
                )
            )
            for ti in extra_items_result.scalars().all():
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
                        "is_cancelled": ti.is_cancelled,
                    },
                ))

        # Audit details
        # Build a map from ticket_item_id -> matched_rule_id from the stored plan
        rule_map: dict[int, int | None] = {}
        for t in tickets_view:
            for it in t["items_to_remove"]:
                rule_map[it["ticket_item_id"]] = it.get("matched_rule_id")

        for t in tickets_view:
            for it in t["items_to_remove"]:
                ti = item_rows_by_id.get(it["ticket_item_id"])
                if ti is None:
                    continue
                # For DELETE operations: the whole line vanishes. Use the combined
                # per-unit value (rate + levy) as a single number. The rate_delta
                # column stores the total amount removed; levy_delta is always 0.
                unit_value = Decimal(str(ti.rate)) + Decimal(str(ti.levy))
                total_del = unit_value * ti.quantity
                db.add(AdminAdjustmentDetails(
                    adjustment_id=log.id,
                    ticket_id=ti.ticket_id,
                    ticket_item_id=ti.id,
                    old_rate=float(unit_value),
                    old_levy=0.0,
                    new_rate=0.0,
                    new_levy=0.0,
                    rate_delta=float(total_del),
                    levy_delta=0.0,
                    total_delta=float(total_del),
                    matched_rule_id=rule_map.get(ti.id),
                    operation_type="DELETE",
                ))

        # DELETE items (the actual mutation)
        await db.execute(delete(TicketItem).where(TicketItem.id.in_(item_ids)))

        # Hard-delete tickets that are now empty (no items left after the deletion)
        if hard_delete_ticket_ids:
            # Delete any remaining ticket_items for those tickets (defensive — should be none)
            await db.execute(
                delete(TicketItem).where(TicketItem.ticket_id.in_(hard_delete_ticket_ids))
            )
            await db.execute(
                delete(Ticket).where(Ticket.id.in_(hard_delete_ticket_ids))
            )

        # Recalculate amount + net_amount ONLY for tickets that still exist (not hard-deleted)
        # net_amount = new_gross - discount   (critical: discount was being ignored)
        surviving_ticket_ids = [tid for tid in ticket_ids if tid not in hard_delete_set]
        if surviving_ticket_ids:
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
                {"ids": surviving_ticket_ids},
            )

        log.status = "COMMITTED"
        log.executed_at = datetime.now(timezone.utc)
        log.plan_choice = plan_choice
        log.total_tickets_affected = len(ticket_ids)
        log.total_items_affected = len(item_ids)
        await db.flush()

    except HTTPException:
        # Intentional 4xx/5xx from guards (staleness 409, skip-all 400, etc.)
        # do NOT mark the log as FAILED — the caller can retry or the batch has
        # already been reverted to DRY_RUN by the raising guard itself.
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
        "plan_choice": plan_choice,
        "tickets_affected": len(ticket_ids),
        "items_deleted": len(item_ids),
        "tickets_hard_deleted": len(hard_delete_ticket_ids),
        "executed_at": log.executed_at.isoformat(),
    }
