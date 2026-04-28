import datetime
import uuid as uuid_mod
from decimal import Decimal, ROUND_HALF_UP
from zoneinfo import ZoneInfo

IST = ZoneInfo("Asia/Kolkata")

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_, text

from app.models.ticket import Ticket, TicketItem
from app.models.branch import Branch
from app.models.route import Route
from app.models.item import Item
from app.models.item_rate import ItemRate
from app.models.payment_mode import PaymentMode
from app.models.ferry_schedule import FerrySchedule
from app.models.company import Company
from app.models.user import User
from app.schemas.ticket import TicketCreate, TicketUpdate


def _round2(value: float) -> float:
    return float(Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def _format_time(t: datetime.time | None) -> str | None:
    if t is None:
        return None
    return t.strftime("%H:%M")


def _parse_time(s: str) -> datetime.time:
    try:
        return datetime.datetime.strptime(s, "%H:%M").time()
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid time format: '{s}'. Expected HH:MM",
        )


async def _get_branch_name(db: AsyncSession, branch_id: int) -> str | None:
    result = await db.execute(select(Branch.name).where(Branch.id == branch_id))
    return result.scalar_one_or_none()


async def _get_route_display_name(db: AsyncSession, route_id: int) -> str | None:
    BranchOne = Branch.__table__.alias("b1")
    BranchTwo = Branch.__table__.alias("b2")
    result = await db.execute(
        select(
            BranchOne.c.name.label("branch_one_name"),
            BranchTwo.c.name.label("branch_two_name"),
        )
        .select_from(Route.__table__)
        .join(BranchOne, BranchOne.c.id == Route.branch_id_one)
        .join(BranchTwo, BranchTwo.c.id == Route.branch_id_two)
        .where(Route.id == route_id)
    )
    row = result.one_or_none()
    if not row:
        return None
    return f"{row.branch_one_name} - {row.branch_two_name}"


async def _get_payment_mode_name(db: AsyncSession, pm_id: int) -> str | None:
    result = await db.execute(select(PaymentMode.description).where(PaymentMode.id == pm_id))
    return result.scalar_one_or_none()


async def _get_item_names(db: AsyncSession, item_id: int) -> tuple[str | None, str | None]:
    result = await db.execute(select(Item.name, Item.short_name).where(Item.id == item_id))
    row = result.one_or_none()
    return (row[0], row[1]) if row else (None, None)


async def _enrich_ticket_item(db: AsyncSession, ti: TicketItem) -> dict:
    item_name, item_short_name = await _get_item_names(db, ti.item_id)
    rate = float(ti.rate) if ti.rate is not None else 0
    levy = float(ti.levy) if ti.levy is not None else 0
    quantity = ti.quantity or 0
    amount = _round2(quantity * (rate + levy))
    return {
        "id": ti.id,
        "ticket_id": ti.ticket_id,
        "item_id": ti.item_id,
        "rate": rate,
        "levy": levy,
        "quantity": quantity,
        "vehicle_no": ti.vehicle_no,
        "vehicle_name": ti.vehicle_name,
        "is_cancelled": ti.is_cancelled,
        "amount": amount,
        "item_name": item_name,
        "item_short_name": item_short_name,
    }


async def _get_username(db: AsyncSession, user_id) -> str | None:
    if user_id is None:
        return None
    result = await db.execute(select(User.username).where(User.id == user_id))
    return result.scalar_one_or_none()


async def _enrich_ticket(db: AsyncSession, ticket: Ticket, include_items: bool = False) -> dict:
    branch_name = await _get_branch_name(db, ticket.branch_id)
    route_name = await _get_route_display_name(db, ticket.route_id)
    pm_name = await _get_payment_mode_name(db, ticket.payment_mode_id)
    created_by_username = await _get_username(db, ticket.created_by)

    data = {
        "id": ticket.id,
        "branch_id": ticket.branch_id,
        "ticket_no": ticket.ticket_no,
        "ticket_date": ticket.ticket_date,
        "departure": _format_time(ticket.departure),
        "route_id": ticket.route_id,
        "amount": float(ticket.amount) if ticket.amount is not None else 0,
        "discount": float(ticket.discount) if ticket.discount is not None else 0,
        "payment_mode_id": ticket.payment_mode_id,
        "ref_no": ticket.ref_no,
        "is_cancelled": ticket.is_cancelled,
        "net_amount": float(ticket.net_amount) if ticket.net_amount is not None else 0,
        "status": ticket.status,
        "checked_in_at": ticket.checked_in_at,
        "branch_name": branch_name,
        "route_name": route_name,
        "payment_mode_name": pm_name,
        "verification_code": str(ticket.verification_code) if ticket.verification_code else None,
        "created_at": ticket.created_at,
        "created_by_username": created_by_username,
        "is_multi_ticket": ticket.is_multi_ticket,
        "generated_at": ticket.generated_at,
    }

    if include_items:
        result = await db.execute(
            select(TicketItem).where(TicketItem.ticket_id == ticket.id)
        )
        items = result.scalars().all()
        data["items"] = [await _enrich_ticket_item(db, ti) for ti in items]
    else:
        data["items"] = None

    return data


async def _validate_references(db: AsyncSession, branch_id: int, route_id: int, payment_mode_id: int):
    result = await db.execute(select(Branch.id).where(Branch.id == branch_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Branch ID {branch_id} not found")

    result = await db.execute(select(Route.id).where(Route.id == route_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Route ID {route_id} not found")

    result = await db.execute(select(PaymentMode.id).where(PaymentMode.id == payment_mode_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Payment Mode ID {payment_mode_id} not found")


async def _validate_items(db: AsyncSession, items: list) -> None:
    for item in items:
        result = await db.execute(select(Item.id).where(Item.id == item.item_id))
        if not result.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Item ID {item.item_id} not found",
            )


async def _enforce_db_rates(
    db: AsyncSession, items: list, route_id: int, exclude_item_ids: set[int] | None = None,
) -> None:
    """Fetch current rates from DB and reject if client-submitted rates don't match.

    This prevents tickets being created with stale, zero, or manipulated rates.
    Items in exclude_item_ids are skipped (used for SF items split across batch tickets).
    """
    # Collect unique item IDs (skip cancelled items and excluded items)
    active_items = [i for i in items if not getattr(i, "is_cancelled", False)]
    if exclude_item_ids:
        active_items = [i for i in active_items if i.item_id not in exclude_item_ids]
    if not active_items:
        return

    item_ids = list({i.item_id for i in active_items})

    # Batch-fetch all active rates for this route
    result = await db.execute(
        select(ItemRate.item_id, ItemRate.rate, ItemRate.levy)
        .where(
            ItemRate.item_id.in_(item_ids),
            ItemRate.route_id == route_id,
            ItemRate.is_active == True,
        )
    )
    db_rates = {row.item_id: (float(row.rate) if row.rate is not None else 0,
                               float(row.levy) if row.levy is not None else 0)
                for row in result.all()}

    # Validate each item's rate against the DB
    mismatches = []
    missing = []
    for item in active_items:
        db_entry = db_rates.get(item.item_id)
        if db_entry is None:
            missing.append(item.item_id)
            continue

        db_rate, db_levy = db_entry
        submitted_rate = float(getattr(item, "rate", 0))
        submitted_levy = float(getattr(item, "levy", 0))

        if abs(submitted_rate - db_rate) > 0.01 or abs(submitted_levy - db_levy) > 0.01:
            mismatches.append(
                f"Item {item.item_id}: submitted rate={submitted_rate}/levy={submitted_levy}, "
                f"current rate={db_rate}/levy={db_levy}"
            )

    if missing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No active rate found for item(s) {missing} on route {route_id}",
        )

    if mismatches:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Rate has changed. Please refresh and try again. " + "; ".join(mismatches),
        )


def _compute_amounts(items: list, discount: float | None) -> tuple[float, float]:
    total = 0.0
    for item in items:
        if getattr(item, "is_cancelled", False):
            continue
        rate = float(getattr(item, "rate", 0))
        quantity = int(getattr(item, "quantity", 0))
        levy = float(getattr(item, "levy", 0))
        total += quantity * (rate + levy)
    amount = _round2(total)
    disc = float(discount) if discount else 0
    net_amount = _round2(amount - disc)
    return amount, net_amount


def _cross_check_amounts(computed_amount: float, computed_net: float, submitted_amount: float, submitted_net: float):
    if abs(computed_amount - submitted_amount) > 0.01:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Amount mismatch: expected {computed_amount}, got {submitted_amount}",
        )
    if abs(computed_net - submitted_net) > 0.01:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Net amount mismatch: expected {computed_net}, got {submitted_net}",
        )


async def get_current_rate(db: AsyncSession, item_id: int, route_id: int) -> dict:
    result = await db.execute(
        select(ItemRate)
        .where(
            ItemRate.item_id == item_id,
            ItemRate.route_id == route_id,
            ItemRate.is_active == True,
        )
        .limit(1)
    )
    ir = result.scalar_one_or_none()
    if not ir:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No active rate found for item {item_id}, route {route_id}",
        )
    return {
        "rate": float(ir.rate) if ir.rate is not None else 0,
        "levy": float(ir.levy) if ir.levy is not None else 0,
        "item_rate_id": ir.id,
    }


async def get_departure_options(db: AsyncSession, branch_id: int) -> dict:
    """Return prev / current-or-next / next-after departure options.

    The ``recommended`` key is the departure that should be auto-selected
    (the nearest schedule whose departure + buffer >= now).  We also
    include one schedule before it (``previous``) and one schedule after
    it (``next``) so the operator has a small, relevant window.

    A 10-minute buffer keeps a departure as "current" after its scheduled
    time (e.g. 16:00 stays current until 16:10) so billing operators can
    still print tickets for ferries that are slightly delayed.

    Returns ``server_time`` so the frontend can display server-synchronised
    time without relying on the client clock.
    """
    BUFFER_MINUTES = 10
    now_dt = datetime.datetime.now(IST)
    now = now_dt.time()
    # Effective cutoff: a schedule is still "current" if departure + buffer >= now,
    # i.e. we compare departure against (now - buffer).
    cutoff_dt = now_dt - datetime.timedelta(minutes=BUFFER_MINUTES)
    # Clamp to midnight if subtraction wrapped to previous day (e.g. 00:05 - 10min)
    cutoff = cutoff_dt.time() if cutoff_dt.date() == now_dt.date() else datetime.time(0, 0)

    # Fetch all schedules for the branch, sorted ascending
    result = await db.execute(
        select(FerrySchedule)
        .where(FerrySchedule.branch_id == branch_id)
        .order_by(FerrySchedule.departure.asc())
    )
    all_schedules = result.scalars().all()

    if not all_schedules:
        return {
            "server_time": now_dt.strftime("%H:%M"),
            "options": [],
            "recommended": None,
        }

    # Find the index of the first schedule whose departure >= cutoff
    # (i.e. departure + buffer hasn't expired yet)
    current_idx: int | None = None
    for i, s in enumerate(all_schedules):
        if s.departure >= cutoff:
            current_idx = i
            break

    options: list[dict] = []

    if current_idx is not None:
        # Previous schedule (one before current)
        if current_idx > 0:
            prev = all_schedules[current_idx - 1]
            options.append({"id": prev.id, "departure": _format_time(prev.departure), "tag": "previous"})
        # Current / next-up schedule
        cur = all_schedules[current_idx]
        options.append({"id": cur.id, "departure": _format_time(cur.departure), "tag": "current"})
        # Next schedule (one after current)
        if current_idx + 1 < len(all_schedules):
            nxt = all_schedules[current_idx + 1]
            options.append({"id": nxt.id, "departure": _format_time(nxt.departure), "tag": "next"})

        recommended = _format_time(cur.departure)
    else:
        # All departures (+ buffer) have passed — show only the last schedule
        last = all_schedules[-1]
        options.append({"id": last.id, "departure": _format_time(last.departure), "tag": "previous"})
        recommended = None

    return {
        "server_time": now_dt.strftime("%H:%M"),
        "options": options,
        "recommended": recommended,
    }


async def get_multi_ticket_init(
    db: AsyncSession, user, branch_id: int | None = None, route_id: int | None = None,
) -> dict:
    """Return all data needed to populate the multi-ticket form."""
    effective_route_id = route_id or user.route_id
    if not effective_route_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No route specified. Please select a route.",
        )

    # Get route info
    route_result = await db.execute(select(Route).where(Route.id == effective_route_id))
    route = route_result.scalar_one_or_none()
    if not route:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Route not found")

    route_name = await _get_route_display_name(db, route.id)

    # Determine operating branch: use provided branch_id, or user's active branch, or route's branch_id_one
    if branch_id is not None:
        if branch_id not in (route.branch_id_one, route.branch_id_two):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Branch {branch_id} does not belong to route {effective_route_id}",
            )
    elif user.active_branch_id and user.active_branch_id in (route.branch_id_one, route.branch_id_two):
        branch_id = user.active_branch_id
    else:
        branch_id = route.branch_id_one
    branch_name = await _get_branch_name(db, branch_id)

    # Get ferry time window for this branch
    first_ferry, last_ferry = await _get_ferry_window(db, branch_id)

    # Determine if off-hours (multi-ticketing allowed)
    # Multi-ticketing and normal ticketing are mutually exclusive:
    #   Normal open: (first_ferry - 45min) to (last_ferry + 30min)
    #   Multi open:  outside that window
    # When time-lock is disabled, always treat as off-hours (both screens open).
    time_lock_on = await _is_time_lock_enabled(db)
    now = datetime.datetime.now(IST).time()
    if not time_lock_on:
        is_off_hours = True
    elif first_ferry and last_ferry:
        normal_opens_at = _time_sub(first_ferry, NORMAL_TICKET_BUFFER_BEFORE)
        normal_closes_at = _time_add(last_ferry, MULTI_TICKET_BUFFER_AFTER)
        is_off_hours = now < normal_opens_at or now >= normal_closes_at
    else:
        # No ferry schedules — always off-hours
        is_off_hours = True

    # Get active items with their current rates for this route (batch query)
    items_with_rates_result = await db.execute(
        select(
            Item.id,
            Item.name,
            Item.short_name,
            Item.is_vehicle,
            ItemRate.rate,
            ItemRate.levy,
        )
        .join(ItemRate, (ItemRate.item_id == Item.id) & (ItemRate.route_id == effective_route_id) & (ItemRate.is_active == True))
        .where(Item.is_active == True)
        .order_by(Item.id)
    )

    items_with_rates = [
        {
            "id": row.id,
            "name": row.name,
            "short_name": row.short_name,
            "is_vehicle": bool(row.is_vehicle),
            "rate": float(row.rate) if row.rate is not None else 0,
            "levy": float(row.levy) if row.levy is not None else 0,
        }
        for row in items_with_rates_result.all()
    ]

    # Get active payment modes that are visible on POS
    pm_result = await db.execute(
        select(PaymentMode).where(PaymentMode.is_active == True, PaymentMode.show_at_pos == True).order_by(PaymentMode.id)
    )
    payment_modes = pm_result.scalars().all()

    # Get Special Ferry item ID from company config
    sf_item_id = None
    sf_rate = None
    sf_levy = None
    company_result = await db.execute(select(Company).limit(1))
    company = company_result.scalar_one_or_none()
    if company and company.sf_item_id:
        sf_item_id = company.sf_item_id
        # Check already-fetched items first to avoid an extra query
        sf_match = next((i for i in items_with_rates if i["id"] == sf_item_id), None)
        if sf_match:
            sf_rate = sf_match["rate"]
            sf_levy = sf_match["levy"]
        else:
            # SF item not in active items list — fallback to single query
            sf_rate_result = await db.execute(
                select(ItemRate)
                .where(
                    ItemRate.item_id == sf_item_id,
                    ItemRate.route_id == effective_route_id,
                    ItemRate.is_active == True,
                )
                .limit(1)
            )
            sf_ir = sf_rate_result.scalar_one_or_none()
            if sf_ir:
                sf_rate = float(sf_ir.rate) if sf_ir.rate is not None else None
                sf_levy = float(sf_ir.levy) if sf_ir.levy is not None else None

    return {
        "route_id": route.id,
        "route_name": route_name or "",
        "branch_id": branch_id,
        "branch_name": branch_name or "",
        "multi_ticketing_enabled": route.multi_ticketing_enabled,
        "items": items_with_rates,
        "payment_modes": [{"id": pm.id, "description": pm.description} for pm in payment_modes],
        "first_ferry_time": _format_time(first_ferry),
        "last_ferry_time": _format_time(last_ferry),
        "is_off_hours": is_off_hours,
        "sf_item_id": sf_item_id,
        "sf_rate": sf_rate,
        "sf_levy": sf_levy,
    }


NORMAL_TICKET_BUFFER_BEFORE = datetime.timedelta(minutes=45)
MULTI_TICKET_BUFFER_AFTER = datetime.timedelta(minutes=30)


def _time_add(t: datetime.time, delta: datetime.timedelta) -> datetime.time:
    """Add a timedelta to a time, clamping at 23:59:59."""
    dt = datetime.datetime.combine(datetime.date.today(), t) + delta
    if dt.date() > datetime.date.today():
        return datetime.time(23, 59, 59)
    return dt.time()


def _time_sub(t: datetime.time, delta: datetime.timedelta) -> datetime.time:
    """Subtract a timedelta from a time, clamping at 00:00:00."""
    dt = datetime.datetime.combine(datetime.date.today(), t) - delta
    if dt.date() < datetime.date.today():
        return datetime.time(0, 0, 0)
    return dt.time()


async def _get_ferry_window(db: AsyncSession, branch_id: int):
    """Return (first_ferry, last_ferry) times for a branch, or (None, None)."""
    first_result = await db.execute(
        select(func.min(FerrySchedule.departure)).where(FerrySchedule.branch_id == branch_id)
    )
    first_ferry = first_result.scalar_one_or_none()

    last_result = await db.execute(
        select(func.max(FerrySchedule.departure)).where(FerrySchedule.branch_id == branch_id)
    )
    last_ferry = last_result.scalar_one_or_none()

    return first_ferry, last_ferry


async def _is_time_lock_enabled(db: AsyncSession) -> bool:
    """Check if time-lock is enabled in company settings."""
    result = await db.execute(select(Company).where(Company.id == 1))
    company = result.scalar_one_or_none()
    return company.time_lock_enabled if company else True


async def get_ticketing_status(db: AsyncSession, branch_id: int, route_id: int | None = None) -> dict:
    """Compute which ticketing screens are open/locked for a branch right now.

    Mutually exclusive — no overlap:
      - Before (first_ferry - 45min):                    MULTI only
      - (first_ferry - 45min) → (last_ferry + 30min):   NORMAL only
      - After (last_ferry + 30min):                      MULTI only

    No ferry schedules → both open.
    Time-lock disabled → both open (admin override).
    Route multi_ticketing_enabled=false → normal always open, multi always closed.
    """
    first_ferry, last_ferry = await _get_ferry_window(db, branch_id)
    now = datetime.datetime.now(IST).time()

    # Check route-level multi-ticketing flag
    route_mt_enabled = True
    if route_id:
        route_result = await db.execute(select(Route).where(Route.id == route_id))
        route = route_result.scalar_one_or_none()
        if route:
            route_mt_enabled = route.multi_ticketing_enabled

    # Route has multi-ticketing disabled → normal always open, multi always closed
    if not route_mt_enabled:
        return {
            "normal_ticketing_open": True,
            "multi_ticketing_open": False,
            "first_ferry_time": _format_time(first_ferry) if first_ferry else None,
            "last_ferry_time": _format_time(last_ferry) if last_ferry else None,
            "normal_opens_at": None,
            "normal_closes_at": None,
            "multi_opens_at": None,
            "current_time": now.strftime("%H:%M:%S"),
        }

    # Time-lock disabled → both screens always open
    time_lock_on = await _is_time_lock_enabled(db)
    if not time_lock_on or not first_ferry or not last_ferry:
        return {
            "normal_ticketing_open": True,
            "multi_ticketing_open": True,
            "first_ferry_time": _format_time(first_ferry) if first_ferry else None,
            "last_ferry_time": _format_time(last_ferry) if last_ferry else None,
            "normal_opens_at": None,
            "normal_closes_at": None,
            "multi_opens_at": None,
            "current_time": now.strftime("%H:%M:%S"),
        }

    normal_opens_at = _time_sub(first_ferry, NORMAL_TICKET_BUFFER_BEFORE)
    normal_closes_at = _time_add(last_ferry, MULTI_TICKET_BUFFER_AFTER)

    normal_open = normal_opens_at <= now < normal_closes_at
    multi_open = not normal_open  # mutually exclusive — no overlap

    # Hint for lock screen: when will multi-ticketing next open?
    if multi_open:
        multi_opens_at_hint = None
    else:
        multi_opens_at_hint = _format_time(normal_closes_at)

    return {
        "normal_ticketing_open": normal_open,
        "multi_ticketing_open": multi_open,
        "first_ferry_time": _format_time(first_ferry),
        "last_ferry_time": _format_time(last_ferry),
        "normal_opens_at": _format_time(normal_opens_at),
        "normal_closes_at": _format_time(normal_closes_at),
        "multi_opens_at": multi_opens_at_hint,
        "current_time": now.strftime("%H:%M:%S"),
    }


async def _validate_off_hours(db: AsyncSession, branch_id: int) -> None:
    """Raise 400 if current time is within the normal-ticketing window.

    Normal ticketing window: (first_ferry - 45min) to (last_ferry + 30min).
    Multi-ticketing is blocked during this entire window — no overlap.
    Skipped entirely when time-lock is disabled.
    """
    if not await _is_time_lock_enabled(db):
        return
    first_ferry, last_ferry = await _get_ferry_window(db, branch_id)

    if first_ferry and last_ferry:
        now = datetime.datetime.now(IST).time()
        normal_opens_at = _time_sub(first_ferry, NORMAL_TICKET_BUFFER_BEFORE)
        normal_closes_at = _time_add(last_ferry, MULTI_TICKET_BUFFER_AFTER)
        if normal_opens_at <= now < normal_closes_at:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Multi-ticketing is only available outside normal ticketing hours. "
                    f"Normal ticketing: {_format_time(normal_opens_at)} - {_format_time(normal_closes_at)} "
                    f"(ferry schedule {_format_time(first_ferry)} - {_format_time(last_ferry)}). "
                    f"Current time: {_format_time(now)}"
                ),
            )


async def _validate_normal_hours(db: AsyncSession, branch_id: int, route_id: int | None = None) -> None:
    """Raise 400 if current time is outside the normal-ticketing window.

    Normal ticketing is open from (first_ferry - 45 min) to (last_ferry + 30 min).
    Skipped entirely when time-lock is disabled.
    Skipped when route has multi_ticketing_enabled=false (normal ticketing is always open).
    """
    if not await _is_time_lock_enabled(db):
        return
    # If route has multi-ticketing disabled, normal ticketing is always open
    if route_id:
        route_result = await db.execute(select(Route).where(Route.id == route_id))
        route = route_result.scalar_one_or_none()
        if route and not route.multi_ticketing_enabled:
            return
    first_ferry, last_ferry = await _get_ferry_window(db, branch_id)

    if first_ferry and last_ferry:
        now = datetime.datetime.now(IST).time()
        normal_opens_at = _time_sub(first_ferry, NORMAL_TICKET_BUFFER_BEFORE)
        normal_closes_at = _time_add(last_ferry, MULTI_TICKET_BUFFER_AFTER)
        if now < normal_opens_at or now >= normal_closes_at:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Normal ticketing is only available during ferry hours. "
                    f"Open from {_format_time(normal_opens_at)} to {_format_time(normal_closes_at)}. "
                    f"Current time: {_format_time(now)}"
                ),
            )


async def create_multi_tickets(
    db: AsyncSession, data, user,
    branch_id: int | None = None,
    route_id: int | None = None,
    skip_time_check: bool = False,
) -> list[dict]:
    """Create multiple tickets in a single transaction."""
    effective_route_id = route_id or user.route_id
    if not effective_route_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No route specified. Please select a route.",
        )

    # Determine branch from user's route
    route_result = await db.execute(select(Route).where(Route.id == effective_route_id))
    route = route_result.scalar_one_or_none()
    if not route:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Route not found")

    if not route.multi_ticketing_enabled:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Multi-ticketing is not enabled for this route.",
        )

    if branch_id is not None:
        if branch_id not in (route.branch_id_one, route.branch_id_two):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Branch {branch_id} does not belong to route {effective_route_id}",
            )
    elif user.active_branch_id and user.active_branch_id in (route.branch_id_one, route.branch_id_two):
        branch_id = user.active_branch_id
    else:
        branch_id = route.branch_id_one

    # Validate off-hours (skipped for admin roles)
    if not skip_time_check:
        await _validate_off_hours(db, branch_id)

    # Check if SF (Special Ferry) item is configured — its rate is split across tickets
    sf_item_id = None
    exclude_rate_items: set[int] = set()
    company_result = await db.execute(select(Company).limit(1))
    company = company_result.scalar_one_or_none()
    if company and company.sf_item_id:
        sf_item_id = company.sf_item_id

        # Validate: sum of SF rates across all tickets must equal the DB rate
        sf_rate_result = await db.execute(
            select(ItemRate.rate, ItemRate.levy)
            .where(
                ItemRate.item_id == sf_item_id,
                ItemRate.route_id == effective_route_id,
                ItemRate.is_active == True,
            )
            .limit(1)
        )
        sf_db = sf_rate_result.one_or_none()
        if sf_db:
            db_sf_rate = float(sf_db.rate) if sf_db.rate is not None else 0
            db_sf_levy = float(sf_db.levy) if sf_db.levy is not None else 0

            # Sum SF rates across all tickets in the batch
            total_sf_rate = 0.0
            total_sf_levy = 0.0
            for ticket_data in data.tickets:
                for item in ticket_data.items:
                    if item.item_id == sf_item_id and not getattr(item, "is_cancelled", False):
                        total_sf_rate += float(item.rate)
                        total_sf_levy += float(item.levy)

            if total_sf_rate > 0 or total_sf_levy > 0:
                if abs(total_sf_rate - db_sf_rate) > 0.01 or abs(total_sf_levy - db_sf_levy) > 0.01:
                    raise HTTPException(
                        status_code=status.HTTP_409_CONFLICT,
                        detail=(
                            f"SF item rate has changed. Total submitted: rate={total_sf_rate}/levy={total_sf_levy}, "
                            f"current: rate={db_sf_rate}/levy={db_sf_levy}. Please refresh and try again."
                        ),
                    )
                # SF rates validated at batch level — exclude from per-ticket enforcement
                exclude_rate_items.add(sf_item_id)

    # Stamp current time as departure for off-hours tickets (no ferry schedule running)
    now_time = datetime.datetime.now(IST).strftime("%H:%M")
    for ticket_data in data.tickets:
        if not ticket_data.departure:
            ticket_data.departure = now_time

    # All tickets are created within the same DB transaction (get_db session).
    # create_ticket() uses flush(), not commit(), so if any fails, ALL roll back.
    created_tickets = []
    for ticket_data in data.tickets:
        result = await create_ticket(
            db, ticket_data, user_id=user.id,
            _exclude_rate_items=exclude_rate_items or None,
            is_multi_ticket=True,
        )
        created_tickets.append(result)

    return created_tickets


def _apply_filters(
    query,
    status_filter: str | None = None,
    branch_filter: int | None = None,
    route_filter: int | None = None,
    date_from: datetime.date | None = None,
    date_to: datetime.date | None = None,
    id_filter: int | None = None,
    id_op: str = "eq",
    id_filter_end: int | None = None,
    ticket_no_filter: int | None = None,
    is_multi_ticket: bool | None = None,
):
    if id_filter is not None:
        if id_op == "between" and id_filter_end is not None:
            query = query.where(Ticket.id >= id_filter, Ticket.id <= id_filter_end)
        elif id_op == "lt":
            query = query.where(Ticket.id < id_filter)
        elif id_op == "gt":
            query = query.where(Ticket.id > id_filter)
        else:
            query = query.where(Ticket.id == id_filter)

    if branch_filter is not None:
        query = query.where(Ticket.branch_id == branch_filter)

    if route_filter is not None:
        query = query.where(Ticket.route_id == route_filter)

    if ticket_no_filter is not None:
        query = query.where(Ticket.ticket_no == ticket_no_filter)

    if date_from is not None:
        query = query.where(Ticket.ticket_date >= date_from)

    if date_to is not None:
        query = query.where(Ticket.ticket_date <= date_to)

    if status_filter == "active":
        query = query.where(Ticket.is_cancelled == False)
    elif status_filter == "cancelled":
        query = query.where(Ticket.is_cancelled == True)

    if is_multi_ticket is not None:
        query = query.where(Ticket.is_multi_ticket == is_multi_ticket)

    return query


async def count_tickets(
    db: AsyncSession,
    status_filter: str | None = None,
    branch_filter: int | None = None,
    route_filter: int | None = None,
    date_from: datetime.date | None = None,
    date_to: datetime.date | None = None,
    id_filter: int | None = None,
    id_op: str = "eq",
    id_filter_end: int | None = None,
    ticket_no_filter: int | None = None,
    is_multi_ticket: bool | None = None,
) -> int:
    query = select(func.count()).select_from(Ticket)
    query = _apply_filters(query, status_filter, branch_filter, route_filter, date_from, date_to, id_filter, id_op, id_filter_end, ticket_no_filter, is_multi_ticket)
    result = await db.execute(query)
    return result.scalar()


SORTABLE_COLUMNS = {
    "id": Ticket.id,
    "ticket_no": Ticket.ticket_no,
    "ticket_date": Ticket.ticket_date,
    "branch_id": Ticket.branch_id,
    "route_id": Ticket.route_id,
    "departure": Ticket.departure,
    "amount": Ticket.amount,
    "discount": Ticket.discount,
    "net_amount": Ticket.net_amount,
    "is_cancelled": Ticket.is_cancelled,
}


async def get_all_tickets(
    db: AsyncSession,
    skip: int = 0,
    limit: int = 50,
    sort_by: str = "id",
    sort_order: str = "desc",
    status_filter: str | None = None,
    branch_filter: int | None = None,
    route_filter: int | None = None,
    date_from: datetime.date | None = None,
    date_to: datetime.date | None = None,
    id_filter: int | None = None,
    id_op: str = "eq",
    id_filter_end: int | None = None,
    ticket_no_filter: int | None = None,
    is_multi_ticket: bool | None = None,
    include_items: bool = False,
) -> list[dict]:
    column = SORTABLE_COLUMNS.get(sort_by, Ticket.id)
    order = column.desc() if sort_order == "desc" else column.asc()

    query = select(Ticket)
    query = _apply_filters(query, status_filter, branch_filter, route_filter, date_from, date_to, id_filter, id_op, id_filter_end, ticket_no_filter, is_multi_ticket)
    result = await db.execute(query.order_by(order).offset(skip).limit(limit))
    tickets = result.scalars().all()

    enriched = [await _enrich_ticket(db, t, include_items=False) for t in tickets]
    if not include_items or not tickets:
        return enriched

    # Batch-load items + item-name lookups so we don't N+1 across the page.
    ticket_ids = [t.id for t in tickets]
    items_result = await db.execute(
        select(TicketItem).where(TicketItem.ticket_id.in_(ticket_ids))
    )
    all_items = items_result.scalars().all()

    item_ids = list({ti.item_id for ti in all_items})
    name_map: dict[int, tuple[str | None, str | None]] = {}
    if item_ids:
        names_result = await db.execute(
            select(Item.id, Item.name, Item.short_name).where(Item.id.in_(item_ids))
        )
        for row_id, row_name, row_short in names_result.all():
            name_map[row_id] = (row_name, row_short)

    items_by_ticket: dict[int, list[dict]] = {}
    for ti in all_items:
        rate = float(ti.rate) if ti.rate is not None else 0
        levy = float(ti.levy) if ti.levy is not None else 0
        quantity = ti.quantity or 0
        item_name, item_short_name = name_map.get(ti.item_id, (None, None))
        items_by_ticket.setdefault(ti.ticket_id, []).append({
            "id": ti.id,
            "ticket_id": ti.ticket_id,
            "item_id": ti.item_id,
            "rate": rate,
            "levy": levy,
            "quantity": quantity,
            "vehicle_no": ti.vehicle_no,
            "vehicle_name": ti.vehicle_name,
            "is_cancelled": ti.is_cancelled,
            "amount": _round2(quantity * (rate + levy)),
            "item_name": item_name,
            "item_short_name": item_short_name,
        })

    for data in enriched:
        data["items"] = items_by_ticket.get(data["id"], [])
    return enriched


async def get_ticket_by_id(db: AsyncSession, ticket_id: int) -> dict:
    result = await db.execute(select(Ticket).where(Ticket.id == ticket_id))
    ticket = result.scalar_one_or_none()
    if not ticket:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found")
    return await _enrich_ticket(db, ticket, include_items=True)


async def create_ticket(
    db: AsyncSession, data: TicketCreate, user_id=None,
    _exclude_rate_items: set[int] | None = None,
    is_multi_ticket: bool = False,
) -> dict:
    effective_payment_mode_id = data.payment_mode_id

    await _validate_references(db, data.branch_id, data.route_id, effective_payment_mode_id)
    await _validate_items(db, data.items)
    await _enforce_db_rates(db, data.items, data.route_id, exclude_item_ids=_exclude_rate_items)

    computed_amount, computed_net = _compute_amounts(data.items, data.discount)
    _cross_check_amounts(computed_amount, computed_net, data.amount, data.net_amount)

    result = await db.execute(
        select(Branch).where(Branch.id == data.branch_id).with_for_update()
    )
    branch = result.scalar_one()

    # Daily ticket_no per branch: query actual max for this branch+date
    # (safe against backdated tickets and out-of-order date changes)
    max_result = await db.execute(
        select(func.coalesce(func.max(Ticket.ticket_no), 0))
        .where(Ticket.branch_id == data.branch_id, Ticket.ticket_date == data.ticket_date)
    )
    next_ticket_no = max_result.scalar() + 1
    branch.last_ticket_date = data.ticket_date

    # NOTE: tickets.id is now generated by the PostgreSQL sequence (tickets_id_seq).
    # The previous MAX(id)+1 approach caused phantom-ID collisions on the admin
    # database (where prod's replicated rows and admin-local INSERTs could both
    # land at the same ID). The sequence on admin is offset to 1B+, eliminating
    # cross-DB collisions entirely. ticket_no still uses the per-branch+date
    # MAX+1 above because it is a business identifier (single-writer per branch).
    departure_time = _parse_time(data.departure) if data.departure else None

    # ── FAIL-SAFE: guarantee departure is never a stale ferry schedule time ──
    # If no departure was provided, always stamp current IST time.
    # If off-hours and the provided departure matches a ferry schedule (auto-filled
    # by a stale frontend), override it with current IST time.
    now_ist = datetime.datetime.now(IST).time().replace(microsecond=0)
    if departure_time is None:
        departure_time = now_ist
    else:
        # Check if off-hours for this branch
        fs_result = await db.execute(
            select(func.min(FerrySchedule.departure), func.max(FerrySchedule.departure))
            .where(FerrySchedule.branch_id == data.branch_id)
        )
        fs_row = fs_result.one_or_none()
        if fs_row and fs_row[0] and fs_row[1]:
            first_ferry, last_ferry = fs_row[0], fs_row[1]
            is_off_hours = now_ist < first_ferry or now_ist > last_ferry
            if is_off_hours:
                # Check if departure matches a scheduled ferry time (i.e. stale auto-fill)
                sched_result = await db.execute(
                    select(FerrySchedule.departure)
                    .where(FerrySchedule.branch_id == data.branch_id,
                           FerrySchedule.departure == departure_time)
                )
                if sched_result.scalar_one_or_none() is not None:
                    # Departure matches a ferry schedule during off-hours → override
                    departure_time = now_ist

    ticket = Ticket(
        # id auto-generated by tickets_id_seq (no manual MAX+1 — see note above)
        branch_id=data.branch_id,
        ticket_no=next_ticket_no,
        ticket_date=data.ticket_date,
        departure=departure_time,
        route_id=data.route_id,
        amount=computed_amount,
        discount=float(data.discount) if data.discount else 0,
        payment_mode_id=effective_payment_mode_id,
        is_cancelled=False,
        net_amount=computed_net,
        status="CONFIRMED",
        verification_code=uuid_mod.uuid4(),
        boat_id=data.boat_id,
        ref_no=data.ref_no,
        created_by=user_id,
        is_multi_ticket=is_multi_ticket,
        generated_at=datetime.datetime.now(IST),
    )
    db.add(ticket)
    await db.flush()  # populate ticket.id from the sequence so child items can FK to it

    for item_data in data.items:
        ti = TicketItem(
            # id auto-generated by ticket_items_id_seq
            ticket_id=ticket.id,
            item_id=item_data.item_id,
            rate=item_data.rate,
            levy=item_data.levy,
            quantity=item_data.quantity,
            vehicle_no=item_data.vehicle_no,
            vehicle_name=item_data.vehicle_name,
            is_cancelled=False,
        )
        db.add(ti)

    branch.last_ticket_no = next_ticket_no

    await db.flush()
    await db.refresh(ticket)
    return await _enrich_ticket(db, ticket, include_items=True)


async def update_ticket(db: AsyncSession, ticket_id: int, data: TicketUpdate) -> dict:
    result = await db.execute(select(Ticket).where(Ticket.id == ticket_id))
    ticket = result.scalar_one_or_none()
    if not ticket:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found")

    if ticket.is_cancelled:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot update a cancelled ticket")

    update_data = data.model_dump(exclude_unset=True)

    if update_data.get("is_cancelled") is True:
        ticket.is_cancelled = True
        ticket.status = "CANCELLED"
        ticket.amount = 0
        ticket.net_amount = 0
        items_result = await db.execute(
            select(TicketItem).where(TicketItem.ticket_id == ticket_id)
        )
        for ti in items_result.scalars().all():
            ti.is_cancelled = True
        await db.flush()
        await db.refresh(ticket)
        return await _enrich_ticket(db, ticket, include_items=True)

    if "branch_id" in update_data:
        r = await db.execute(select(Branch.id).where(Branch.id == update_data["branch_id"]))
        if not r.scalar_one_or_none():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Branch ID {update_data['branch_id']} not found")

    if "route_id" in update_data:
        r = await db.execute(select(Route.id).where(Route.id == update_data["route_id"]))
        if not r.scalar_one_or_none():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Route ID {update_data['route_id']} not found")

    if "payment_mode_id" in update_data:
        r = await db.execute(select(PaymentMode.id).where(PaymentMode.id == update_data["payment_mode_id"]))
        if not r.scalar_one_or_none():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Payment Mode ID {update_data['payment_mode_id']} not found")

    if "departure" in update_data and update_data["departure"] is not None:
        ticket.departure = _parse_time(update_data["departure"])
    elif "departure" in update_data:
        ticket.departure = None

    for field in ("branch_id", "route_id", "payment_mode_id", "discount"):
        if field in update_data:
            setattr(ticket, field, update_data[field])

    if "items" in update_data and data.items is not None:
        active_update_items = [i for i in data.items if not i.is_cancelled]
        await _validate_items(db, active_update_items)
        effective_route = update_data.get("route_id", ticket.route_id)
        await _enforce_db_rates(db, active_update_items, effective_route)

        existing_result = await db.execute(
            select(TicketItem).where(TicketItem.ticket_id == ticket_id)
        )
        existing_items = {ti.id: ti for ti in existing_result.scalars().all()}

        # New ticket_items get IDs from ticket_items_id_seq (no manual MAX+1).
        # Same reasoning as create_ticket — admin's sequence is offset to 1B+ so
        # admin-side INSERTs cannot collide with prod's replicated rows.
        for item_update in data.items:
            if item_update.id and item_update.id in existing_items:
                ti = existing_items[item_update.id]
                ti.item_id = item_update.item_id
                ti.rate = item_update.rate
                ti.levy = item_update.levy
                ti.quantity = item_update.quantity
                ti.vehicle_no = item_update.vehicle_no
                ti.vehicle_name = item_update.vehicle_name
                ti.is_cancelled = item_update.is_cancelled
            else:
                ti = TicketItem(
                    # id auto-generated by ticket_items_id_seq
                    ticket_id=ticket_id,
                    item_id=item_update.item_id,
                    rate=item_update.rate,
                    levy=item_update.levy,
                    quantity=item_update.quantity,
                    vehicle_no=item_update.vehicle_no,
                    vehicle_name=item_update.vehicle_name,
                    is_cancelled=item_update.is_cancelled,
                )
                db.add(ti)

        computed_amount, computed_net = _compute_amounts(
            data.items, update_data.get("discount", ticket.discount)
        )
        if "amount" in update_data and "net_amount" in update_data:
            _cross_check_amounts(computed_amount, computed_net, update_data["amount"], update_data["net_amount"])
        ticket.amount = computed_amount
        ticket.net_amount = computed_net
    elif "discount" in update_data:
        current_amount = float(ticket.amount)
        new_discount = float(update_data["discount"]) if update_data["discount"] else 0
        ticket.net_amount = _round2(current_amount - new_discount)
        if "net_amount" in update_data:
            _cross_check_amounts(current_amount, ticket.net_amount, update_data.get("amount", current_amount), update_data["net_amount"])

    await db.flush()
    await db.refresh(ticket)
    return await _enrich_ticket(db, ticket, include_items=True)
