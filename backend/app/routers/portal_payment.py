from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_portal_user
from app.models.portal_user import PortalUser
from app.services import sabpaisa_service, booking_service


router = APIRouter(prefix="/api/portal/payment", tags=["Portal Payment"])


class CreateOrderRequest(BaseModel):
    booking_id: int = Field(..., description="Booking ID to pay for")


class VerifyPaymentRequest(BaseModel):
    transaction_id: str = Field(..., description="SabPaisa transaction ID")
    order_id: str = Field(..., description="Order ID returned by create-order")
    booking_id: int = Field(..., description="Booking ID")


@router.get("/config", summary="Get payment gateway config")
async def payment_config():
    return {
        "gateway": "sabpaisa",
        "configured": sabpaisa_service.is_configured(),
    }


@router.post("/create-order", summary="Create a payment order")
async def create_order(
    body: CreateOrderRequest,
    db: AsyncSession = Depends(get_db),
    current_user: PortalUser = Depends(get_current_portal_user),
):
    booking = await booking_service.get_booking_by_id(db, body.booking_id, current_user.id)
    if booking["status"] != "PENDING":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Booking is not in PENDING status",
        )
    return await sabpaisa_service.create_order(
        booking["net_amount"], body.booking_id, current_user.email
    )


@router.post("/verify", summary="Verify payment and confirm booking")
async def verify_payment(
    body: VerifyPaymentRequest,
    db: AsyncSession = Depends(get_db),
    current_user: PortalUser = Depends(get_current_portal_user),
):
    result = await sabpaisa_service.verify_payment(body.transaction_id, body.order_id)
    if result.get("verified"):
        confirmed = await booking_service.confirm_booking_payment(
            db, body.booking_id, current_user.id
        )
        return {"message": "Payment verified, booking confirmed", "booking": confirmed}
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="Payment verification failed",
    )
