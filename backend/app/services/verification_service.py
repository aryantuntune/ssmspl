import datetime
import uuid

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.booking import Booking
from app.models.booking_item import BookingItem
from app.models.ticket import Ticket, TicketItem
from app.models.item import Item
from app.models.branch import Branch
from app.models.route import Route
from app.models.user import User
from app.core.rbac import UserRole


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


def _format_time(t: datetime.time | None) -> str | None:
    if t is None:
        return None
    return t.strftime("%H:%M")


async def _get_item_details(db: AsyncSession, item_id: int) -> dict:
    result = await db.execute(select(Item).where(Item.id == item_id))
    item = result.scalar_one_or_none()
    if not item:
        return {"name": "Unknown", "is_vehicle": False}
    return {"name": item.name, "is_vehicle": bool(item.is_vehicle)}


def _check_route_access(user: User, ticket_or_booking_route_id: int) -> None:
    """Enforce route-based access: TICKET_CHECKER and BILLING_OPERATOR can only
    verify tickets/bookings on their assigned route. Higher roles bypass."""
    bypass_roles = {UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER}
    if user.role in bypass_roles:
        return
    if user.route_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your account has no route assigned. Contact admin.",
        )
    if user.route_id != ticket_or_booking_route_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only verify tickets for your assigned route.",
        )


async def lookup_booking_by_code(db: AsyncSession, verification_code: uuid.UUID, user: User) -> dict:
    """Look up a booking by its QR verification code."""
    result = await db.execute(
        select(Booking).where(Booking.verification_code == verification_code)
    )
    booking = result.scalar_one_or_none()
    if not booking:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Booking not found for this verification code",
        )

    _check_route_access(user, booking.route_id)

    # Fetch items
    items_result = await db.execute(
        select(BookingItem).where(
            BookingItem.booking_id == booking.id,
            BookingItem.is_cancelled == False,
        )
    )
    booking_items = items_result.scalars().all()

    items = []
    passenger_count = 0
    for bi in booking_items:
        details = await _get_item_details(db, bi.item_id)
        items.append({
            "item_name": details["name"],
            "quantity": bi.quantity,
            "is_vehicle": details["is_vehicle"],
            "vehicle_no": bi.vehicle_no,
        })
        if not details["is_vehicle"]:
            passenger_count += bi.quantity

    route_name = await _get_route_display_name(db, booking.route_id)
    branch_name = await _get_branch_name(db, booking.branch_id)

    return {
        "source": "booking",
        "id": booking.id,
        "reference_no": booking.booking_no,
        "status": booking.status,
        "route_name": route_name,
        "branch_name": branch_name,
        "travel_date": booking.travel_date,
        "departure": _format_time(booking.departure),
        "net_amount": float(booking.net_amount) if booking.net_amount else 0,
        "passenger_count": passenger_count,
        "items": items,
        "checked_in_at": booking.checked_in_at,
        "verification_code": str(booking.verification_code) if booking.verification_code else None,
    }


def _ticket_status(ticket: Ticket) -> str:
    """Return the effective status of a ticket."""
    if ticket.is_cancelled or ticket.status == "CANCELLED":
        return "CANCELLED"
    return ticket.status


async def _build_ticket_result(db: AsyncSession, ticket: Ticket) -> dict:
    """Build a verification result dict from a Ticket."""
    items_result = await db.execute(
        select(TicketItem).where(
            TicketItem.ticket_id == ticket.id,
            TicketItem.is_cancelled == False,
        )
    )
    ticket_items = items_result.scalars().all()

    items = []
    passenger_count = 0
    for ti in ticket_items:
        details = await _get_item_details(db, ti.item_id)
        items.append({
            "item_name": details["name"],
            "quantity": ti.quantity,
            "is_vehicle": details["is_vehicle"],
            "vehicle_no": ti.vehicle_no,
        })
        if not details["is_vehicle"]:
            passenger_count += ti.quantity

    route_name = await _get_route_display_name(db, ticket.route_id)
    branch_name = await _get_branch_name(db, ticket.branch_id)

    return {
        "source": "ticket",
        "id": ticket.id,
        "reference_no": ticket.ticket_no,
        "status": _ticket_status(ticket),
        "route_name": route_name,
        "branch_name": branch_name,
        "travel_date": ticket.ticket_date,
        "departure": _format_time(ticket.departure),
        "net_amount": float(ticket.net_amount) if ticket.net_amount else 0,
        "passenger_count": passenger_count,
        "items": items,
        "checked_in_at": ticket.checked_in_at,
        "verification_code": str(ticket.verification_code) if ticket.verification_code else None,
    }


async def lookup_ticket_by_code(db: AsyncSession, verification_code: uuid.UUID, user: User) -> dict | None:
    """Look up a ticket by its QR verification code. Returns None if not found (no exception)."""
    result = await db.execute(
        select(Ticket).where(Ticket.verification_code == verification_code)
    )
    ticket = result.scalar_one_or_none()
    if not ticket:
        return None
    _check_route_access(user, ticket.route_id)
    return await _build_ticket_result(db, ticket)


async def lookup_by_code(db: AsyncSession, verification_code: uuid.UUID, user: User) -> dict:
    """Look up a booking or ticket by verification code. Tries booking first, then ticket."""
    # Try booking first
    result = await db.execute(
        select(Booking).where(Booking.verification_code == verification_code)
    )
    booking = result.scalar_one_or_none()
    if booking:
        return await lookup_booking_by_code(db, verification_code, user)

    # Try ticket
    ticket_result = await lookup_ticket_by_code(db, verification_code, user)
    if ticket_result:
        return ticket_result

    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="No booking or ticket found for this verification code",
    )


async def verify(db: AsyncSession, verification_code: uuid.UUID, current_user: User) -> dict:
    """Unified verify (check-in) for both bookings and tickets.
    Sets status to VERIFIED and records checked_in_at timestamp.
    QR codes can only be scanned once."""

    # Try booking first
    result = await db.execute(
        select(Booking).where(Booking.verification_code == verification_code)
    )
    booking = result.scalar_one_or_none()

    if booking:
        # Route access check
        _check_route_access(current_user, booking.route_id)

        if booking.is_cancelled or booking.status == "CANCELLED":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot verify a cancelled booking",
            )
        if booking.status == "PENDING":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Payment pending — cannot verify until payment is confirmed",
            )
        if booking.status == "VERIFIED":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Already verified at {booking.checked_in_at.isoformat() if booking.checked_in_at else 'unknown'}",
            )

        now = datetime.datetime.now(datetime.timezone.utc)
        booking.status = "VERIFIED"
        booking.checked_in_at = now
        await db.flush()

        return {
            "message": "Booking verified successfully",
            "source": "booking",
            "id": booking.id,
            "reference_no": booking.booking_no,
            "checked_in_at": now,
        }

    # Try ticket
    ticket_result = await db.execute(
        select(Ticket).where(Ticket.verification_code == verification_code)
    )
    ticket = ticket_result.scalar_one_or_none()

    if ticket:
        # Route access check
        _check_route_access(current_user, ticket.route_id)

        effective_status = _ticket_status(ticket)
        if effective_status == "CANCELLED":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot verify a cancelled ticket",
            )
        if effective_status == "VERIFIED":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Already verified at {ticket.checked_in_at.isoformat() if ticket.checked_in_at else 'unknown'}",
            )

        now = datetime.datetime.now(datetime.timezone.utc)
        ticket.status = "VERIFIED"
        ticket.checked_in_at = now
        await db.flush()

        return {
            "message": "Ticket verified successfully",
            "source": "ticket",
            "id": ticket.id,
            "reference_no": ticket.ticket_no,
            "checked_in_at": now,
        }

    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="No booking or ticket found for this verification code",
    )


async def lookup_booking_by_number(
    db: AsyncSession, booking_no: int, user: User, branch_id: int | None = None
) -> dict:
    """Look up a portal booking by booking number (and optionally branch)."""
    query = select(Booking).where(Booking.booking_no == booking_no)
    if branch_id:
        query = query.where(Booking.branch_id == branch_id)
    query = query.order_by(Booking.id.desc()).limit(1)

    result = await db.execute(query)
    booking = result.scalar_one_or_none()
    if not booking:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Booking #{booking_no} not found",
        )

    _check_route_access(user, booking.route_id)

    # Fetch items
    items_result = await db.execute(
        select(BookingItem).where(
            BookingItem.booking_id == booking.id,
            BookingItem.is_cancelled == False,
        )
    )
    booking_items = items_result.scalars().all()

    items = []
    passenger_count = 0
    for bi in booking_items:
        details = await _get_item_details(db, bi.item_id)
        items.append({
            "item_name": details["name"],
            "quantity": bi.quantity,
            "is_vehicle": details["is_vehicle"],
            "vehicle_no": bi.vehicle_no,
        })
        if not details["is_vehicle"]:
            passenger_count += bi.quantity

    route_name = await _get_route_display_name(db, booking.route_id)
    branch_name = await _get_branch_name(db, booking.branch_id)

    return {
        "source": "booking",
        "id": booking.id,
        "reference_no": booking.booking_no,
        "status": booking.status,
        "route_name": route_name,
        "branch_name": branch_name,
        "travel_date": booking.travel_date,
        "departure": _format_time(booking.departure),
        "net_amount": float(booking.net_amount) if booking.net_amount else 0,
        "passenger_count": passenger_count,
        "items": items,
        "checked_in_at": booking.checked_in_at,
        "verification_code": str(booking.verification_code) if booking.verification_code else None,
    }


async def lookup_ticket_by_number(
    db: AsyncSession, ticket_no: int, branch_id: int, user: User
) -> dict:
    """Look up an operator ticket by ticket number and branch."""
    result = await db.execute(
        select(Ticket).where(
            Ticket.ticket_no == ticket_no,
            Ticket.branch_id == branch_id,
        ).order_by(Ticket.id.desc()).limit(1)
    )
    ticket = result.scalar_one_or_none()
    if not ticket:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Ticket #{ticket_no} not found for branch {branch_id}",
        )

    _check_route_access(user, ticket.route_id)

    return await _build_ticket_result(db, ticket)
