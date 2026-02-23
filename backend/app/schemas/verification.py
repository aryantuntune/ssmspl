import datetime
import uuid

from pydantic import BaseModel, Field


class VerificationItemDetail(BaseModel):
    item_name: str
    quantity: int
    is_vehicle: bool = False
    vehicle_no: str | None = None


class VerificationResult(BaseModel):
    source: str = Field(..., description="'booking' (Customer Portal) or 'ticket' (Billing Operator)")
    id: int
    reference_no: int = Field(..., description="booking_no or ticket_no")
    status: str
    route_name: str | None = None
    branch_name: str | None = None
    travel_date: datetime.date
    departure: str | None = None
    net_amount: float
    passenger_count: int = 0
    items: list[VerificationItemDetail] = []
    checked_in_at: datetime.datetime | None = None
    verification_code: str | None = Field(None, description="Booking/ticket verification code (for check-in)")


class CheckInRequest(BaseModel):
    verification_code: uuid.UUID = Field(..., description="The QR verification code (booking or ticket)")


class CheckInResponse(BaseModel):
    message: str
    source: str = Field(..., description="'booking' or 'ticket'")
    id: int
    reference_no: int
    checked_in_at: datetime.datetime
