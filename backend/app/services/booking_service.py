import datetime
import math
import uuid as uuid_mod
from decimal import Decimal, ROUND_HALF_UP

from fastapi import HTTPException, status
from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.booking import Booking
from app.models.booking_item import BookingItem
from app.models.branch import Branch
from app.models.route import Route
from app.models.item import Item
from app.models.item_rate import ItemRate
from app.models.ferry_schedule import FerrySchedule
from app.models.portal_user import PortalUser
from app.schemas.booking import BookingCreate


# ── Private helpers ──────────────────────────────────────────────────────────


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


async def _get_item_name(db: AsyncSession, item_id: int) -> str | None:
    result = await db.execute(select(Item.name).where(Item.id == item_id))
    return result.scalar_one_or_none()


async def _find_route(db: AsyncSession, from_branch_id: int, to_branch_id: int) -> Route:
    """Find an active route connecting two branches (either direction)."""
    result = await db.execute(
        select(Route).where(
            Route.is_active == True,
            or_(
                (Route.branch_id_one == from_branch_id) & (Route.branch_id_two == to_branch_id),
                (Route.branch_id_one == to_branch_id) & (Route.branch_id_two == from_branch_id),
            ),
        )
    )
    route = result.scalar_one_or_none()
    if not route:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No active route found between branch {from_branch_id} and branch {to_branch_id}",
        )
    return route


async def _get_current_rate(db: AsyncSession, item_id: int, route_id: int) -> dict:
    """Get the most recent active rate where applicable_from_date <= today."""
    today = datetime.date.today()
    result = await db.execute(
        select(ItemRate)
        .where(
            ItemRate.item_id == item_id,
            ItemRate.route_id == route_id,
            ItemRate.is_active == True,
            ItemRate.applicable_from_date.is_not(None),
            ItemRate.applicable_from_date <= today,
        )
        .order_by(ItemRate.applicable_from_date.desc())
        .limit(1)
    )
    ir = result.scalar_one_or_none()
    if not ir:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No active rate found for item {item_id} and route {route_id}",
        )
    return {
        "rate": float(ir.rate) if ir.rate is not None else 0,
        "levy": float(ir.levy) if ir.levy is not None else 0,
    }


async def _check_capacity(
    db: AsyncSession,
    branch_id: int,
    travel_date: datetime.date,
    departure_time: datetime.time,
) -> None:
    """
    Count non-cancelled bookings for the same branch + date + departure
    and compare against FerrySchedule.capacity. Raises 400 if full.
    Capacity of 0 means unlimited (skip check).
    """
    # Look up the schedule to get capacity
    sched_result = await db.execute(
        select(FerrySchedule).where(
            FerrySchedule.branch_id == branch_id,
            FerrySchedule.departure == departure_time,
        )
    )
    schedule = sched_result.scalar_one_or_none()
    if not schedule:
        # No schedule found -- nothing to enforce
        return

    capacity = schedule.capacity or 0
    if capacity == 0:
        # Unlimited capacity
        return

    # Count existing non-cancelled bookings for this departure
    count_result = await db.execute(
        select(func.count()).select_from(Booking).where(
            Booking.branch_id == branch_id,
            Booking.travel_date == travel_date,
            Booking.departure == departure_time,
            Booking.status != "CANCELLED",
            Booking.is_cancelled == False,
        )
    )
    current_count = count_result.scalar() or 0

    if current_count >= capacity:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"This departure ({_format_time(departure_time)}) on {travel_date} is fully booked. Capacity: {capacity}.",
        )


async def _enrich_booking_item(db: AsyncSession, bi: BookingItem) -> dict:
    """Enrich a BookingItem with item_name and computed amount."""
    item_name = await _get_item_name(db, bi.item_id)
    rate = float(bi.rate) if bi.rate is not None else 0
    levy = float(bi.levy) if bi.levy is not None else 0
    quantity = bi.quantity or 0
    amount = _round2(quantity * (rate + levy))
    return {
        "id": bi.id,
        "booking_id": bi.booking_id,
        "item_id": bi.item_id,
        "item_name": item_name,
        "rate": rate,
        "levy": levy,
        "quantity": quantity,
        "vehicle_no": bi.vehicle_no,
        "is_cancelled": bi.is_cancelled,
        "amount": amount,
    }


async def _enrich_booking(
    db: AsyncSession, booking: Booking, include_items: bool = False
) -> dict:
    """Enrich a Booking with branch_name, route_name, and optionally full items."""
    branch_name = await _get_branch_name(db, booking.branch_id)
    route_name = await _get_route_display_name(db, booking.route_id)

    data = {
        "id": booking.id,
        "booking_no": booking.booking_no,
        "status": booking.status,
        "verification_code": str(booking.verification_code) if booking.verification_code else None,
        "branch_id": booking.branch_id,
        "branch_name": branch_name,
        "route_id": booking.route_id,
        "route_name": route_name,
        "travel_date": booking.travel_date,
        "departure": _format_time(booking.departure),
        "amount": float(booking.amount) if booking.amount is not None else 0,
        "discount": float(booking.discount) if booking.discount is not None else 0,
        "net_amount": float(booking.net_amount) if booking.net_amount is not None else 0,
        "portal_user_id": booking.portal_user_id,
        "is_cancelled": booking.is_cancelled,
        "created_at": booking.created_at,
    }

    # Always fetch items, but the level of detail varies
    items_result = await db.execute(
        select(BookingItem).where(BookingItem.booking_id == booking.id)
    )
    items = items_result.scalars().all()

    if include_items:
        data["items"] = [await _enrich_booking_item(db, bi) for bi in items]
    else:
        # Lightweight summary: [{item_name, quantity}]
        summaries = []
        for bi in items:
            item_name = await _get_item_name(db, bi.item_id)
            summaries.append({"item_name": item_name, "quantity": bi.quantity})
        data["items"] = summaries

    return data


# ── Public data functions (for booking form) ─────────────────────────────────


async def get_to_branches(db: AsyncSession, from_branch_id: int) -> list[dict]:
    """Find destination branches reachable via active routes from given branch."""
    result = await db.execute(
        select(Route).where(
            Route.is_active == True,
            or_(
                Route.branch_id_one == from_branch_id,
                Route.branch_id_two == from_branch_id,
            ),
        )
    )
    routes = result.scalars().all()

    branch_ids = set()
    for r in routes:
        if r.branch_id_one == from_branch_id:
            branch_ids.add(r.branch_id_two)
        else:
            branch_ids.add(r.branch_id_one)

    if not branch_ids:
        return []

    branches_result = await db.execute(
        select(Branch.id, Branch.name)
        .where(Branch.id.in_(branch_ids), Branch.is_active == True)
        .order_by(Branch.name)
    )
    rows = branches_result.all()
    return [{"id": row.id, "name": row.name} for row in rows]


async def get_online_items(
    db: AsyncSession, from_branch_id: int, to_branch_id: int
) -> list[dict]:
    """
    Find items with online_visibility=True that have active rates
    for the route connecting the two branches.
    """
    route = await _find_route(db, from_branch_id, to_branch_id)

    # Get all active, online-visible items
    items_result = await db.execute(
        select(Item)
        .where(Item.is_active == True, Item.online_visibility == True)
        .order_by(Item.id)
    )
    items = items_result.scalars().all()

    today = datetime.date.today()
    result_items = []
    for item in items:
        rate_result = await db.execute(
            select(ItemRate)
            .where(
                ItemRate.item_id == item.id,
                ItemRate.route_id == route.id,
                ItemRate.is_active == True,
                ItemRate.applicable_from_date.is_not(None),
                ItemRate.applicable_from_date <= today,
            )
            .order_by(ItemRate.applicable_from_date.desc())
            .limit(1)
        )
        ir = rate_result.scalar_one_or_none()
        if ir:
            result_items.append({
                "id": item.id,
                "name": item.name,
                "short_name": item.short_name,
                "is_vehicle": bool(item.is_vehicle),
                "rate": float(ir.rate) if ir.rate is not None else 0,
                "levy": float(ir.levy) if ir.levy is not None else 0,
            })

    return result_items


async def get_schedules(db: AsyncSession, branch_id: int) -> list[dict]:
    """Get ferry departure times for a branch."""
    result = await db.execute(
        select(FerrySchedule)
        .where(FerrySchedule.branch_id == branch_id)
        .order_by(FerrySchedule.departure.asc())
    )
    schedules = result.scalars().all()
    return [{"schedule_time": _format_time(s.departure)} for s in schedules]


async def get_item_rate(db: AsyncSession, item_id: int, route_id: int) -> dict:
    """Get current rate for an item on a route."""
    return await _get_current_rate(db, item_id, route_id)


# ── Booking CRUD functions ───────────────────────────────────────────────────


async def create_booking(
    db: AsyncSession, data: BookingCreate, portal_user: PortalUser
) -> dict:
    """
    Full booking creation flow:
    1. Validate both branches exist and are active
    2. Find route
    3. Validate travel_date >= today
    4. Validate departure in ferry_schedules
    5. Check capacity
    6. For each item: validate, get rate, compute line amount
    7. Validate vehicle_no if item.is_vehicle
    8. Compute totals, set discount=0
    9. Lock branch, increment last_booking_no
    10. Generate next booking ID
    11. Look up "Online" payment mode
    12. Create Booking with status=CONFIRMED, verification_code=uuid4()
    13. Create BookingItem rows
    14. Flush and return enriched booking
    """
    # Import PaymentMode inside function to avoid circular imports
    from app.models.payment_mode import PaymentMode

    # 1. Validate both branches exist and are active
    from_branch_result = await db.execute(
        select(Branch).where(Branch.id == data.from_branch_id)
    )
    from_branch = from_branch_result.scalar_one_or_none()
    if not from_branch:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Branch ID {data.from_branch_id} not found",
        )
    if not from_branch.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Branch '{from_branch.name}' is not active",
        )

    to_branch_result = await db.execute(
        select(Branch).where(Branch.id == data.to_branch_id)
    )
    to_branch = to_branch_result.scalar_one_or_none()
    if not to_branch:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Branch ID {data.to_branch_id} not found",
        )
    if not to_branch.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Branch '{to_branch.name}' is not active",
        )

    # 2. Find route
    route = await _find_route(db, data.from_branch_id, data.to_branch_id)

    # 3. Validate travel_date >= today
    today = datetime.date.today()
    if data.travel_date < today:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Travel date cannot be in the past",
        )

    # 4. Validate departure in ferry_schedules
    departure_time = _parse_time(data.departure)
    sched_result = await db.execute(
        select(FerrySchedule).where(
            FerrySchedule.branch_id == data.from_branch_id,
            FerrySchedule.departure == departure_time,
        )
    )
    if not sched_result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Departure time {data.departure} is not a valid schedule for this branch",
        )

    # 5. Check capacity
    await _check_capacity(db, data.from_branch_id, data.travel_date, departure_time)

    # 6 & 7. Validate items, get rates, compute line amounts
    item_details = []  # list of (item_data, rate, levy, line_amount, item_obj)
    for item_data in data.items:
        item_result = await db.execute(
            select(Item).where(Item.id == item_data.item_id)
        )
        item_obj = item_result.scalar_one_or_none()
        if not item_obj:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Item ID {item_data.item_id} not found",
            )
        if not item_obj.is_active:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Item '{item_obj.name}' is not active",
            )
        if not item_obj.online_visibility:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Item '{item_obj.name}' is not available for online booking",
            )

        # Get current rate
        rate_info = await _get_current_rate(db, item_data.item_id, route.id)

        # Validate vehicle_no required if item.is_vehicle
        if item_obj.is_vehicle and not item_data.vehicle_no:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Vehicle number is required for item '{item_obj.name}'",
            )

        line_amount = _round2(item_data.quantity * (rate_info["rate"] + rate_info["levy"]))
        item_details.append((item_data, rate_info["rate"], rate_info["levy"], line_amount, item_obj))

    # 8. Compute total amount; discount is always 0 for portal bookings
    total_amount = _round2(sum(detail[3] for detail in item_details))
    discount = 0.0
    net_amount = total_amount

    # 9. Lock branch row and increment last_booking_no
    branch_lock_result = await db.execute(
        select(Branch).where(Branch.id == data.from_branch_id).with_for_update()
    )
    branch = branch_lock_result.scalar_one()
    next_booking_no = (branch.last_booking_no or 0) + 1

    # 10. Generate next booking ID
    id_result = await db.execute(select(func.coalesce(func.max(Booking.id), 0)))
    next_booking_id = id_result.scalar() + 1

    # 11. Look up "Online" payment mode (or first active)
    pm_result = await db.execute(
        select(PaymentMode)
        .where(PaymentMode.is_active == True, PaymentMode.description == "Online")
        .limit(1)
    )
    payment_mode = pm_result.scalar_one_or_none()
    if not payment_mode:
        # Fallback: first active payment mode
        pm_fallback = await db.execute(
            select(PaymentMode)
            .where(PaymentMode.is_active == True)
            .order_by(PaymentMode.id)
            .limit(1)
        )
        payment_mode = pm_fallback.scalar_one_or_none()
        if not payment_mode:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="No active payment mode available",
            )

    # 12. Create Booking
    booking = Booking(
        id=next_booking_id,
        branch_id=data.from_branch_id,
        booking_no=next_booking_no,
        travel_date=data.travel_date,
        departure=departure_time,
        amount=total_amount,
        discount=discount,
        payment_mode_id=payment_mode.id,
        is_cancelled=False,
        net_amount=net_amount,
        route_id=route.id,
        portal_user_id=portal_user.id,
        status="CONFIRMED",
        verification_code=uuid_mod.uuid4(),
    )
    db.add(booking)

    # 13. Create BookingItem rows
    item_id_result = await db.execute(select(func.coalesce(func.max(BookingItem.id), 0)))
    next_item_id = item_id_result.scalar() + 1

    for item_data, rate, levy, line_amount, item_obj in item_details:
        bi = BookingItem(
            id=next_item_id,
            booking_id=next_booking_id,
            item_id=item_data.item_id,
            rate=rate,
            levy=levy,
            quantity=item_data.quantity,
            vehicle_no=item_data.vehicle_no,
            is_cancelled=False,
        )
        db.add(bi)
        next_item_id += 1

    # Update branch counter
    branch.last_booking_no = next_booking_no

    # 14. Flush and return enriched booking
    await db.flush()
    return await _enrich_booking(db, booking, include_items=True)


async def get_user_bookings(
    db: AsyncSession,
    portal_user_id: int,
    page: int = 1,
    page_size: int = 10,
) -> dict:
    """Paginated bookings for a user. Returns BookingListResponse shape."""
    # Count total
    count_result = await db.execute(
        select(func.count()).select_from(Booking).where(
            Booking.portal_user_id == portal_user_id
        )
    )
    total = count_result.scalar() or 0
    total_pages = math.ceil(total / page_size) if total > 0 else 1

    # Fetch page
    offset = (page - 1) * page_size
    result = await db.execute(
        select(Booking)
        .where(Booking.portal_user_id == portal_user_id)
        .order_by(Booking.id.desc())
        .offset(offset)
        .limit(page_size)
    )
    bookings = result.scalars().all()

    data = [await _enrich_booking(db, b, include_items=False) for b in bookings]

    return {
        "data": data,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": total_pages,
    }


async def get_booking_by_id(
    db: AsyncSession, booking_id: int, portal_user_id: int
) -> dict:
    """Single booking with items. Ensures booking belongs to user."""
    result = await db.execute(
        select(Booking).where(Booking.id == booking_id)
    )
    booking = result.scalar_one_or_none()
    if not booking:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Booking not found",
        )
    if booking.portal_user_id != portal_user_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Booking not found",
        )
    return await _enrich_booking(db, booking, include_items=True)


async def cancel_booking(
    db: AsyncSession, booking_id: int, portal_user_id: int
) -> dict:
    """Cancel a CONFIRMED or PENDING booking."""
    result = await db.execute(
        select(Booking).where(Booking.id == booking_id)
    )
    booking = result.scalar_one_or_none()
    if not booking:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Booking not found",
        )
    if booking.portal_user_id != portal_user_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Booking not found",
        )

    if booking.status not in ("CONFIRMED", "PENDING"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot cancel a booking with status '{booking.status}'",
        )

    # Set booking as cancelled
    booking.status = "CANCELLED"
    booking.is_cancelled = True

    # Cancel all items
    items_result = await db.execute(
        select(BookingItem).where(BookingItem.booking_id == booking.id)
    )
    for bi in items_result.scalars().all():
        bi.is_cancelled = True

    await db.flush()
    return await _enrich_booking(db, booking, include_items=True)
