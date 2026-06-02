"""
Item-deletion adjustment engine for D Drive Process Reconciliation.
Computes Recommended + Requested plans in dry-run, stores both in the log,
and DELETEs chosen ticket_items on commit.
"""
import hashlib
import uuid
from datetime import date, datetime, timezone
from decimal import Decimal, InvalidOperation
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

SMALL_REMAINDER_THRESHOLD = Decimal("50")
ROUND_OFF_ITEM_NAME_KEYWORDS = ["LUGGAGE", "LUG ", "GOODS", "PER KG"]


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
    db: AsyncSession, branch_id: int, date_start: date, date_end: date, protected_item_ids: set[int], payment_mode: str
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
            func.upper(PaymentMode.description) == payment_mode,
        )
    )
    if protected_item_ids:
        q = q.where(~TicketItem.item_id.in_(protected_item_ids))
    return (await db.execute(q)).scalar_one()


async def _fetch_eligible_total(
    db: AsyncSession, branch_id: int, date_start: date, date_end: date, payment_mode: str
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
            func.upper(PaymentMode.description) == payment_mode,
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
    payment_mode: str,
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
        payment_mode=payment_mode,
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
                func.upper(PaymentMode.description) == payment_mode,
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


async def _find_roundoff_target(
    db: AsyncSession,
    branch_id: int,
    date_start: date,
    date_end: date,
    remaining: Decimal,
    excluded_ticket_item_ids: set[int],
    payment_mode: str,
) -> dict | None:
    """
    Find a round-off transformation target for a small remainder.
    Strategy: last in-scope ticket (CASH or UPI) in date range -> pick a ticket_item
    with sufficient value (prefer PASSENGER items) -> transform to a luggage-type
    item with rate=1, levy=0, adjusted quantity.

    Returns a dict describing the transformation, or None if no suitable target.
    """
    if remaining <= 0:
        return None

    # Find a luggage-type TO item (active items whose name matches keywords)
    from sqlalchemy import or_ as _or_keywords
    kw_clauses = [Item.name.ilike(f"%{kw}%") for kw in ROUND_OFF_ITEM_NAME_KEYWORDS]
    to_item_result = await db.execute(
        select(Item).where(Item.is_active == True, _or_keywords(*kw_clauses)).order_by(Item.id).limit(1)
    )
    to_item = to_item_result.scalar_one_or_none()
    if to_item is None:
        return None  # no luggage-type item available; skip round-off

    # Find candidate tickets: last in-scope ticket first, walking backward
    # Use ticket_id DESC as the "last ticket" proxy (tickets are issued sequentially)
    tickets_q = (
        select(Ticket.id, Ticket.ticket_date, Ticket.ticket_no)
        .join(PaymentMode, PaymentMode.id == Ticket.payment_mode_id)
        .where(
            Ticket.branch_id == branch_id,
            Ticket.ticket_date >= date_start,
            Ticket.ticket_date <= date_end,
            Ticket.is_cancelled == False,
            func.upper(PaymentMode.description) == payment_mode,
        )
        .order_by(Ticket.ticket_date.desc(), Ticket.id.desc())
        .limit(20)  # at most 20 candidates; usually the first one works
    )
    candidate_tickets = (await db.execute(tickets_q)).all()

    for tkt in candidate_tickets:
        # Fetch items on this ticket, prefer PASSENGER ones first
        items_q = (
            select(
                TicketItem.id.label("tiid"),
                TicketItem.ticket_id,
                TicketItem.item_id,
                TicketItem.rate,
                TicketItem.levy,
                TicketItem.quantity,
                Item.name.label("item_name"),
            )
            .join(Item, Item.id == TicketItem.item_id)
            .where(
                TicketItem.ticket_id == tkt.id,
                TicketItem.is_cancelled == False,
            )
        )
        rows = (await db.execute(items_q)).all()
        # Sort candidate items: PASSENGER first, then highest line_value first
        def _score(r):
            lv = (Decimal(str(r.rate)) + Decimal(str(r.levy))) * r.quantity
            is_passenger = "PASSENGER" in (r.item_name or "").upper()
            # Tuple: (is_passenger as -1/0 for sort ASC = True first, then -line_value for desc)
            return (0 if is_passenger else 1, -lv)
        sorted_rows = sorted(rows, key=_score)

        for r in sorted_rows:
            if r.tiid in excluded_ticket_item_ids:
                continue
            unit_value = Decimal(str(r.rate)) + Decimal(str(r.levy))
            line_value = unit_value * r.quantity
            if line_value <= remaining:
                continue  # can't reduce by more than the item's own value
            # Target line_value after transform
            target_line_value = line_value - remaining
            # TO item is rate=1, levy=0 -> quantity = target_line_value (integer)
            # target_line_value must be a positive integer
            if target_line_value <= 0 or target_line_value != target_line_value.to_integral_value():
                continue
            new_quantity = int(target_line_value)
            if new_quantity <= 0:
                continue
            return {
                "ticket_id": r.ticket_id,
                "ticket_item_id": r.tiid,
                "remaining_absorbed": float(remaining),
                "old": {
                    "item_id": r.item_id,
                    "item_name": r.item_name,
                    "rate": float(r.rate),
                    "levy": float(r.levy),
                    "quantity": r.quantity,
                    "line_value": float(line_value),
                },
                "new": {
                    "item_id": to_item.id,
                    "item_name": to_item.name,
                    "rate": 1.0,
                    "levy": 0.0,
                    "quantity": new_quantity,
                    "line_value": float(target_line_value),
                },
            }

    return None


async def dry_run(
    db: AsyncSession,
    branch_id: int,
    date_start: date,
    date_end: date,
    adjustment_amount: float,
    created_by: uuid.UUID,
    payment_mode: str = "CASH",
) -> dict:
    requested = Decimal(str(adjustment_amount)).quantize(Decimal("0.01"))
    if requested <= 0:
        raise HTTPException(status_code=400, detail="Adjustment amount must be positive")

    payment_mode = (payment_mode or "CASH").upper()
    if payment_mode not in ("CASH", "UPI"):
        raise HTTPException(status_code=400, detail="payment_mode must be 'CASH' or 'UPI'")

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
    item_count = await _count_eligible_unprotected_items(db, branch_id, date_start, date_end, protected_item_ids, payment_mode)
    if item_count > MAX_ITEM_ROWS:
        raise HTTPException(status_code=400, detail=f"Too many eligible ticket items ({item_count}). Reduce the date range. Max: {MAX_ITEM_ROWS}")
    if item_count == 0:
        raise HTTPException(status_code=400, detail=f"No unprotected items available for deletion in this branch / date range ({payment_mode} mode)")

    cash_total = await _fetch_eligible_total(db, branch_id, date_start, date_end, payment_mode)

    # Compute deletable vs protected breakdown for admin clarity (scoped to the selected payment_mode).
    # deletable_total = sum of (rate+levy)*qty for items NOT protected
    # protected_total = sum of (rate+levy)*qty for items that ARE protected
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
            func.upper(PaymentMode.description) == payment_mode,
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
                func.upper(PaymentMode.description) == payment_mode,
                TicketItem.item_id.in_(protected_item_ids),
            )
        )
        protected_cash_total = Decimal(str((await db.execute(protected_cash_q)).scalar_one()))

    # Step 1: Build the REQUESTED plan first — target the exact amount admin entered.
    # achievable_amount = what this plan actually delivers (discrete items may fall short).
    req_ids, achievable_amount, req_detail = await _build_deletion_plan(
        db, branch_id, date_start, date_end, requested, protected_item_ids, payment_mode
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
                func.upper(PaymentMode.description) == payment_mode,
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
            # STRICT NO-OVERSHOOT: only accept items that keep new_applied <= requested.
            # Admin explicitly wants: never remove more than requested.
            # Any small undershoot is absorbed exactly by the round-off step below.
            if new_applied > requested:
                continue
            new_distance = requested - new_applied  # always >= 0 after the guard
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

    # Round-off completion: absorb a small remainder by transforming one ticket_item
    # into a luggage-type stub. Applies to both CASH and UPI — the mechanism is
    # payment-mode-agnostic. The backup and audit trail are written in all cases.
    roundoff = None
    pre_roundoff_remaining = requested - closest_applied
    if Decimal("0") < pre_roundoff_remaining <= SMALL_REMAINDER_THRESHOLD:
        roundoff = await _find_roundoff_target(
            db, branch_id, date_start, date_end,
            pre_roundoff_remaining, excluded_ticket_item_ids=set(closest_ids),
            payment_mode=payment_mode,
        )

    # Update closest_applied to reflect the round-off absorption (for UI display)
    total_applied = closest_applied + (Decimal(str(roundoff["remaining_absorbed"])) if roundoff else Decimal("0"))

    # Step 2: Recommended = round DOWN of achievable (safe, clean number for admin).
    recommended_amount = _round_down_to_clean(achievable_amount)
    if recommended_amount <= 0:
        # Achievable is smaller than the smallest rounding step — just use achievable as-is.
        recommended_amount = achievable_amount

    # Step 3: Build the RECOMMENDED plan targeting the rounded-down amount.
    # This typically matches exactly (since recommended <= achievable).
    rec_ids, rec_applied, rec_detail = await _build_deletion_plan(
        db, branch_id, date_start, date_end, recommended_amount, protected_item_ids, payment_mode
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
        "payment_mode": payment_mode,
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
        "roundoff": roundoff,
        "total_applied": str(total_applied),
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
        payment_mode=payment_mode,
        created_by=created_by,
    )
    db.add(log)
    await db.flush()
    await db.refresh(log)

    # Unapplied based on what the Closest plan + round-off actually delivers
    final_unapplied = requested - total_applied
    if final_unapplied < 0:
        final_unapplied = Decimal("0")

    return {
        "batch_id": str(log.id),
        "payment_mode": payment_mode,
        "cash_total_before": float(cash_total),
        "requested_adjustment": float(requested),
        "closest_applied": float(closest_applied),
        "total_applied": float(total_applied),
        "deletable_cash_total": float(deletable_cash_total),
        "protected_cash_total": float(protected_cash_total),
        "unapplied_amount": float(final_unapplied),
        "plan": {
            "applied": float(closest_applied),
            "tickets": execution_plan["closest_plan"]["tickets"],
            "item_ids": closest_ids,
            "extra_item_id": closest_extra_item_id,
        },
        "roundoff": roundoff,
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

    # Idempotency: a second click on an already-COMMITTED batch returns the same
    # success payload as the first commit, NOT an error. Extra clicks are safe no-ops.
    if log.status == "COMMITTED":
        return {
            "batch_id": str(log.id),
            "status": "COMMITTED",
            "plan_choice": log.plan_choice,
            "tickets_affected": log.total_tickets_affected or 0,
            "items_deleted": log.total_items_affected or 0,
            "tickets_hard_deleted": 0,  # already applied earlier; count unknown without re-querying
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

    plan = log.dry_run_summary[f"{plan_choice}_plan"]
    item_ids: list[int] = plan["item_ids"]
    tickets_view: list[dict] = plan["tickets"]

    if not item_ids:
        raise HTTPException(status_code=400, detail="No items in selected plan")

    # Defensive no-overshoot guard: reject any stored plan whose deletion value
    # exceeds the admin-requested amount. Protects against legacy dry-runs
    # generated before the strict no-overshoot fix, and against any future
    # regression of the plan builder. Round-off is separate and always exact.
    try:
        plan_applied = Decimal(str(plan.get("applied", "0")))
        requested_dec = Decimal(str(log.adjustment_amount))
        if plan_applied > requested_dec:
            raise HTTPException(
                status_code=409,
                detail=(
                    f"Stored plan is out-of-policy (applied {plan_applied} > requested {requested_dec}). "
                    "Re-run the trial preview to generate a fresh plan."
                ),
            )
    except (InvalidOperation, TypeError, ValueError):
        # Plan data malformed — let downstream logic handle it
        pass

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

        # Apply round-off transformation (if any) — transforms one ticket_item
        # on the last ticket to absorb a small remainder.
        # Skip round-off entirely when admin skipped tickets — the round-off was
        # computed for the FULL plan and its remainder-absorb value no longer matches reality.
        roundoff = log.dry_run_summary.get("roundoff") if not skipped_set else None
        if roundoff:
            ro_ticket_id = roundoff["ticket_id"]
            ro_tiid = roundoff["ticket_item_id"]

            # Staleness guard: the round-off target must still exist and not be cancelled.
            # If invalid, fail loudly with 409 so the admin can re-run the trial preview.
            ro_check = await db.execute(
                select(TicketItem).where(TicketItem.id == ro_tiid)
            )
            ro_ti = ro_check.scalar_one_or_none()
            if ro_ti is None or ro_ti.is_cancelled:
                raise HTTPException(
                    status_code=409,
                    detail="Round-off target ticket_item was modified since dry-run. Re-run the trial preview.",
                )

            # Backup the original ticket_item (full state) and the ticket (if not already backed up)
            db.add(TicketItemsBackup(
                adjustment_batch_id=log.id,
                ticket_item_id=ro_ti.id,
                ticket_id=ro_ti.ticket_id,
                original_data={
                    "id": ro_ti.id,
                    "ticket_id": ro_ti.ticket_id,
                    "item_id": ro_ti.item_id,
                    "rate": str(ro_ti.rate),
                    "levy": str(ro_ti.levy),
                    "quantity": ro_ti.quantity,
                    "vehicle_no": ro_ti.vehicle_no,
                    "vehicle_name": ro_ti.vehicle_name,
                    "is_cancelled": ro_ti.is_cancelled,
                },
            ))
            if ro_ticket_id not in set(ticket_ids):
                ro_tkt = (await db.execute(select(Ticket).where(Ticket.id == ro_ticket_id))).scalar_one_or_none()
                if ro_tkt is not None:
                    db.add(TicketsBackup(
                        adjustment_batch_id=log.id,
                        ticket_id=ro_tkt.id,
                        original_data={
                            "id": ro_tkt.id,
                            "branch_id": ro_tkt.branch_id,
                            "ticket_no": ro_tkt.ticket_no,
                            "ticket_date": str(ro_tkt.ticket_date),
                            "route_id": ro_tkt.route_id,
                            "amount": str(ro_tkt.amount),
                            "discount": str(ro_tkt.discount) if ro_tkt.discount is not None else None,
                            "payment_mode_id": ro_tkt.payment_mode_id,
                            "net_amount": str(ro_tkt.net_amount),
                            "is_cancelled": ro_tkt.is_cancelled,
                            "status": ro_tkt.status,
                            "is_multi_ticket": ro_tkt.is_multi_ticket,
                            "boat_id": ro_tkt.boat_id,
                            "ref_no": ro_tkt.ref_no,
                            "departure": str(ro_tkt.departure) if ro_tkt.departure is not None else None,
                            "verification_code": str(ro_tkt.verification_code) if ro_tkt.verification_code is not None else None,
                        },
                    ))

            # Apply the transformation
            await db.execute(
                update(TicketItem)
                .where(TicketItem.id == ro_tiid)
                .values(
                    item_id=roundoff["new"]["item_id"],
                    rate=roundoff["new"]["rate"],
                    levy=roundoff["new"]["levy"],
                    quantity=roundoff["new"]["quantity"],
                    last_adjustment_id=log.id,
                )
            )

            # Audit trail (operation_type=MODIFY since we're modifying not deleting)
            old_rate = Decimal(str(roundoff["old"]["rate"]))
            old_levy = Decimal(str(roundoff["old"]["levy"]))
            old_qty = roundoff["old"]["quantity"]
            new_rate = Decimal(str(roundoff["new"]["rate"]))
            new_levy = Decimal(str(roundoff["new"]["levy"]))
            new_qty = roundoff["new"]["quantity"]
            old_line = (old_rate + old_levy) * old_qty
            new_line = (new_rate + new_levy) * new_qty
            db.add(AdminAdjustmentDetails(
                adjustment_id=log.id,
                ticket_id=ro_ticket_id,
                ticket_item_id=ro_tiid,
                old_rate=float(old_rate),
                old_levy=float(old_levy),
                new_rate=float(new_rate),
                new_levy=float(new_levy),
                rate_delta=float(old_rate * old_qty - new_rate * new_qty),
                levy_delta=float(old_levy * old_qty - new_levy * new_qty),
                total_delta=float(old_line - new_line),
                matched_rule_id=None,
                operation_type="MODIFY",
            ))

            # Always recompute amount + net_amount after the round-off.
            # Even if ro_ticket_id is in surviving_ticket_ids (and was recomputed
            # at line 1008), that earlier recompute ran *before* the round-off
            # mutation above — so Ticket.amount is still stale by the round-off
            # delta. A second recompute here is idempotent and required for
            # header/items consistency.
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
                    WHERE id = :tid
                """),
                {"tid": ro_ticket_id},
            )

        log.status = "COMMITTED"
        log.executed_at = datetime.now(timezone.utc)
        log.plan_choice = plan_choice
        log.total_tickets_affected = len(ticket_ids)
        log.total_items_affected = len(item_ids)
        await db.flush()

    except HTTPException as http_exc:
        # Reset IN_PROGRESS to FAILED so the batch isn't permanently stuck.
        # The CAS-style WHERE clause ensures we only flip if status is still IN_PROGRESS;
        # if a guard already set it to DRY_RUN (e.g., skip-all), this is a no-op.
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
        "plan_choice": plan_choice,
        "tickets_affected": len(ticket_ids),
        "items_deleted": len(item_ids),
        "tickets_hard_deleted": len(hard_delete_ticket_ids),
        "executed_at": log.executed_at.isoformat(),
    }
