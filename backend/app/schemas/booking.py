from datetime import date, datetime, time

from pydantic import BaseModel, Field


# ── Create schemas ──

class BookingItemCreate(BaseModel):
    item_id: int = Field(..., description="Item ID")
    quantity: int = Field(..., ge=1, description="Quantity")
    vehicle_no: str | None = Field(None, max_length=15, description="Vehicle number (optional)")

    model_config = {
        "json_schema_extra": {
            "examples": [{"item_id": 1, "quantity": 2, "vehicle_no": None}]
        }
    }


class BookingCreate(BaseModel):
    from_branch_id: int = Field(..., description="Departure branch ID")
    to_branch_id: int = Field(..., description="Destination branch ID")
    travel_date: date = Field(..., description="Travel date (must be today or future)")
    departure: str = Field(..., description="Departure time HH:MM")
    items: list[BookingItemCreate] = Field(..., min_length=1, description="Booking items (at least 1)")

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "from_branch_id": 1,
                    "to_branch_id": 2,
                    "travel_date": "2026-02-21",
                    "departure": "09:30",
                    "items": [{"item_id": 1, "quantity": 2, "vehicle_no": None}],
                }
            ]
        }
    }


# ── Read schemas (enriched responses) ──

class BookingItemRead(BaseModel):
    id: int
    booking_id: int
    item_id: int
    item_name: str | None = None
    rate: float
    levy: float
    quantity: int
    vehicle_no: str | None = None
    is_cancelled: bool
    amount: float = Field(..., description="Computed: quantity * (rate + levy)")


class BookingRead(BaseModel):
    id: int
    booking_no: int
    status: str
    verification_code: str | None = None
    branch_id: int
    branch_name: str | None = None
    route_id: int
    route_name: str | None = None
    travel_date: date
    departure: str | None = None
    amount: float
    discount: float
    net_amount: float
    portal_user_id: int
    is_cancelled: bool
    created_at: datetime | None = None
    items: list[BookingItemRead] | None = None


# ── List schemas (lighter payload for paginated list) ──

class BookingListItem(BaseModel):
    id: int
    booking_no: int
    status: str
    branch_name: str | None = None
    route_name: str | None = None
    travel_date: date
    departure: str | None = None
    net_amount: float
    is_cancelled: bool
    created_at: datetime | None = None
    items: list[dict] | None = None  # [{item_name, quantity}]


class BookingListResponse(BaseModel):
    data: list[BookingListItem]
    total: int
    page: int
    page_size: int
    total_pages: int
