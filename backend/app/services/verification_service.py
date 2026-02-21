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


async def lookup_booking_by_code(db: AsyncSession, verification_code: uuid.UUID) -> dict:
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
    }


async def check_in_booking(db: AsyncSession, verification_code: uuid.UUID) -> dict:
    """Mark a booking as checked in."""
    result = await db.execute(
        select(Booking).where(Booking.verification_code == verification_code)
    )
    booking = result.scalar_one_or_none()
    if not booking:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Booking not found for this verification code",
        )

    if booking.is_cancelled or booking.status == "CANCELLED":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot check in a cancelled booking",
        )

    if booking.checked_in_at is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Booking already checked in at {booking.checked_in_at.isoformat()}",
        )

    now = datetime.datetime.now(datetime.timezone.utc)
    booking.checked_in_at = now
    await db.flush()

    return {
        "message": "Booking checked in successfully",
        "booking_id": booking.id,
        "checked_in_at": now,
    }


async def lookup_ticket_by_number(
    db: AsyncSession, ticket_no: int, branch_id: int
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

    # Fetch items
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
        "status": "CANCELLED" if ticket.is_cancelled else "ACTIVE",
        "route_name": route_name,
        "branch_name": branch_name,
        "travel_date": ticket.ticket_date,
        "departure": _format_time(ticket.departure),
        "net_amount": float(ticket.net_amount) if ticket.net_amount else 0,
        "passenger_count": passenger_count,
        "items": items,
        "checked_in_at": None,
    }
