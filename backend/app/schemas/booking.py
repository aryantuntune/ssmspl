from datetime import date, datetime, time

from pydantic import BaseModel, Field


class BookingItemRead(BaseModel):
    id: int = Field(..., description="Unique booking item identifier")
    booking_id: int = Field(..., description="Parent booking ID")
    item_id: int = Field(..., description="Item ID")
    rate: float = Field(..., description="Rate")
    levy: float = Field(..., description="Levy")
    vehicle_no: str | None = Field(None, description="Vehicle number")
    is_cancelled: bool = Field(..., description="Whether this item is cancelled")
    quantity: int = Field(..., description="Quantity")
    created_at: datetime | None = Field(None, description="Record creation timestamp")
    updated_at: datetime | None = Field(None, description="Record last update timestamp")

    model_config = {"from_attributes": True}


class BookingRead(BaseModel):
    id: int = Field(..., description="Unique booking identifier")
    branch_id: int = Field(..., description="Branch ID")
    booking_no: int = Field(..., description="Booking number")
    travel_date: date = Field(..., description="Travel date")
    departure: time | None = Field(None, description="Departure time")
    amount: float = Field(..., description="Total amount")
    discount: float | None = Field(None, description="Discount")
    payment_mode_id: int = Field(..., description="Payment mode ID")
    is_cancelled: bool = Field(..., description="Whether booking is cancelled")
    net_amount: float = Field(..., description="Net amount")
    route_id: int = Field(..., description="Route ID")
    portal_user_id: int | None = Field(None, description="Portal user ID")
    created_at: datetime | None = Field(None, description="Record creation timestamp")
    updated_at: datetime | None = Field(None, description="Record last update timestamp")

    model_config = {"from_attributes": True}
