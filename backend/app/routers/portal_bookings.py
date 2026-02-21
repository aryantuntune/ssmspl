from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_portal_user
from app.models.portal_user import PortalUser
from app.schemas.booking import BookingCreate, BookingRead, BookingListResponse
from app.services import booking_service
from app.services.qr_service import generate_qr_png
from app.services.email_service import send_booking_confirmation

router = APIRouter(prefix="/api/portal/bookings", tags=["Portal Bookings"])


@router.post(
    "",
    response_model=BookingRead,
    status_code=201,
    summary="Create a new booking",
    description="Create a ferry booking for the authenticated portal user.",
)
async def create_booking(
    body: BookingCreate,
    db: AsyncSession = Depends(get_db),
    current_user: PortalUser = Depends(get_current_portal_user),
):
    return await booking_service.create_booking(db, body, current_user)


@router.get(
    "",
    response_model=BookingListResponse,
    summary="List bookings for current user",
    description="Returns paginated bookings for the authenticated portal user.",
)
async def list_bookings(
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(10, ge=1, le=50, description="Items per page"),
    db: AsyncSession = Depends(get_db),
    current_user: PortalUser = Depends(get_current_portal_user),
):
    return await booking_service.get_user_bookings(db, current_user.id, page, page_size)


@router.get(
    "/{booking_id}",
    response_model=BookingRead,
    summary="Get booking detail",
    description="Returns full booking detail including items. Only the booking owner can access.",
)
async def get_booking(
    booking_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: PortalUser = Depends(get_current_portal_user),
):
    return await booking_service.get_booking_by_id(db, booking_id, current_user.id)


@router.post(
    "/{booking_id}/pay",
    response_model=BookingRead,
    summary="Simulate payment for a booking",
    description="Simulates payment and moves booking from PENDING to CONFIRMED. "
                "In production, this will be replaced by Razorpay integration.",
    responses={
        400: {"description": "Booking not in PENDING status"},
        404: {"description": "Booking not found"},
    },
)
async def pay_booking(
    booking_id: int,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: PortalUser = Depends(get_current_portal_user),
):
    result = await booking_service.confirm_booking_payment(db, booking_id, current_user.id)

    # Send confirmation email after successful payment
    background_tasks.add_task(send_booking_confirmation, result, current_user.email)

    return result


@router.post(
    "/{booking_id}/cancel",
    response_model=BookingRead,
    summary="Cancel a booking",
    description="Cancel a confirmed booking. Only the booking owner can cancel.",
)
async def cancel_booking(
    booking_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: PortalUser = Depends(get_current_portal_user),
):
    return await booking_service.cancel_booking(db, booking_id, current_user.id)


@router.get(
    "/{booking_id}/qr",
    summary="Get QR code for a booking",
    description="Returns a PNG QR code image encoding the booking verification code.",
    responses={200: {"content": {"image/png": {}}}},
)
async def get_qr(
    booking_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: PortalUser = Depends(get_current_portal_user),
):
    booking = await booking_service.get_booking_by_id(db, booking_id, current_user.id)
    if not booking.get("verification_code"):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No verification code for this booking",
        )

    png_bytes = generate_qr_png(booking["verification_code"])
    return Response(content=png_bytes, media_type="image/png")
