from datetime import date, datetime, time

from pydantic import BaseModel, Field


# ── Ticket Item schemas ──

class TicketItemCreate(BaseModel):
    item_id: int = Field(..., description="Item ID")
    rate: float = Field(..., ge=0, description="Rate fetched from item_rate")
    levy: float = Field(..., ge=0, description="Levy fetched from item_rate")
    quantity: int = Field(..., ge=1, description="Quantity")
    vehicle_no: str | None = Field(None, max_length=15, description="Vehicle number (optional)")

    model_config = {
        "json_schema_extra": {
            "examples": [{"item_id": 1, "rate": 150.00, "levy": 10.00, "quantity": 2, "vehicle_no": None}]
        }
    }


class TicketItemUpdate(BaseModel):
    id: int | None = Field(None, description="Item ID for existing items (null for new items)")
    item_id: int = Field(..., description="Item ID")
    rate: float = Field(..., ge=0, description="Rate")
    levy: float = Field(..., ge=0, description="Levy")
    quantity: int = Field(..., ge=1, description="Quantity")
    vehicle_no: str | None = Field(None, max_length=15, description="Vehicle number")
    is_cancelled: bool = Field(False, description="Set true to soft-delete this item")


class TicketItemRead(BaseModel):
    id: int = Field(..., description="Unique ticket item identifier")
    ticket_id: int = Field(..., description="Parent ticket ID")
    item_id: int = Field(..., description="Item ID")
    rate: float = Field(..., description="Rate")
    levy: float = Field(..., description="Levy")
    quantity: int = Field(..., description="Quantity")
    vehicle_no: str | None = Field(None, description="Vehicle number")
    is_cancelled: bool = Field(..., description="Whether this item is cancelled")
    amount: float = Field(..., description="Computed: rate * (quantity + levy)")
    item_name: str | None = Field(None, description="Item name for display")

    model_config = {"from_attributes": True}


# ── Ticket Payment schemas ──

class TicketPayementCreate(BaseModel):
    payment_mode_id: int = Field(..., description="Payment mode ID (e.g. CASH, UPI)")
    amount: float = Field(..., ge=1, description="Payment amount (must be >= 1)")
    ref_no: str | None = Field(None, max_length=30, description="Reference/transaction ID (for UPI payments)")

    model_config = {
        "json_schema_extra": {
            "examples": [{"payment_mode_id": 1, "amount": 320.00, "ref_no": None}]
        }
    }


class TicketPayementRead(BaseModel):
    id: int = Field(..., description="Unique ticket payment identifier")
    ticket_id: int = Field(..., description="Parent ticket ID")
    payment_mode_id: int = Field(..., description="Payment mode ID")
    amount: float = Field(..., description="Payment amount")
    ref_no: str | None = Field(None, description="Reference/transaction ID")
    payment_mode_name: str | None = Field(None, description="Payment mode description for display")

    model_config = {"from_attributes": True}


# ── Ticket schemas ──

class TicketCreate(BaseModel):
    branch_id: int = Field(..., description="Branch ID")
    ticket_date: date = Field(..., description="Ticket date")
    departure: str | None = Field(None, description="Departure time HH:MM")
    route_id: int = Field(..., description="Route ID")
    payment_mode_id: int = Field(..., description="Payment mode ID")
    discount: float | None = Field(0, ge=0, description="Discount amount")
    amount: float = Field(..., ge=1, description="Total amount (sum of item amounts, must be >= 1)")
    net_amount: float = Field(..., ge=1, description="Net amount (amount - discount, must be >= 1)")
    items: list[TicketItemCreate] = Field(..., min_length=1, description="Ticket items (at least 1)")
    payments: list[TicketPayementCreate] | None = Field(None, description="Payment rows (optional, at least 1 if provided)")

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "branch_id": 1,
                    "ticket_date": "2026-02-19",
                    "departure": "09:30",
                    "route_id": 1,
                    "payment_mode_id": 1,
                    "discount": 0,
                    "amount": 320.00,
                    "net_amount": 320.00,
                    "items": [
                        {"item_id": 1, "rate": 150.00, "levy": 10.00, "quantity": 2, "vehicle_no": None}
                    ],
                    "payments": [
                        {"payment_mode_id": 1, "amount": 320.00, "ref_no": None}
                    ],
                }
            ]
        }
    }


class TicketUpdate(BaseModel):
    departure: str | None = Field(None, description="Updated departure time HH:MM")
    route_id: int | None = Field(None, description="Updated route ID")
    payment_mode_id: int | None = Field(None, description="Updated payment mode ID")
    discount: float | None = Field(None, ge=0, description="Updated discount")
    amount: float | None = Field(None, ge=1, description="Updated total amount (must be >= 1)")
    net_amount: float | None = Field(None, ge=1, description="Updated net amount (must be >= 1)")
    is_cancelled: bool | None = Field(None, description="Set true to cancel the ticket")
    items: list[TicketItemUpdate] | None = Field(None, description="Updated ticket items")

    model_config = {
        "json_schema_extra": {
            "examples": [
                {"discount": 50.00, "amount": 320.00, "net_amount": 270.00, "is_cancelled": False}
            ]
        }
    }


class TicketRead(BaseModel):
    id: int = Field(..., description="Unique ticket identifier")
    branch_id: int = Field(..., description="Branch ID")
    ticket_no: int = Field(..., description="Ticket number (unique per branch)")
    ticket_date: date = Field(..., description="Ticket date")
    departure: str | None = Field(None, description="Departure time")
    route_id: int = Field(..., description="Route ID")
    amount: float = Field(..., description="Total amount")
    discount: float | None = Field(None, description="Discount")
    payment_mode_id: int = Field(..., description="Payment mode ID")
    is_cancelled: bool = Field(..., description="Whether ticket is cancelled")
    net_amount: float = Field(..., description="Net amount")
    # Enriched display fields
    branch_name: str | None = Field(None, description="Branch name")
    route_name: str | None = Field(None, description="Route display name")
    payment_mode_name: str | None = Field(None, description="Payment mode description")
    items: list[TicketItemRead] | None = Field(None, description="Ticket items (only in detail view)")
    payments: list[TicketPayementRead] | None = Field(None, description="Ticket payments (only in detail view)")
    created_at: datetime | None = Field(None, description="Record creation timestamp")
    updated_at: datetime | None = Field(None, description="Record last update timestamp")

    model_config = {"from_attributes": True}


# ── Rate lookup response ──

class RateLookupResponse(BaseModel):
    rate: float = Field(..., description="Current rate for the item")
    levy: float = Field(..., description="Current levy for the item")
    item_rate_id: int = Field(..., description="Item rate record ID")


# ── Multi-ticket schemas ──

class MultiTicketInitItem(BaseModel):
    id: int
    name: str
    short_name: str
    is_vehicle: bool
    rate: float
    levy: float

class MultiTicketInitPaymentMode(BaseModel):
    id: int
    description: str

class MultiTicketInitResponse(BaseModel):
    route_id: int
    route_name: str
    branch_id: int
    branch_name: str
    items: list[MultiTicketInitItem]
    payment_modes: list[MultiTicketInitPaymentMode]
    first_ferry_time: str | None = Field(None, description="HH:MM of earliest ferry")
    last_ferry_time: str | None = Field(None, description="HH:MM of latest ferry")
    is_off_hours: bool = Field(..., description="True if current time is outside ferry schedule")
    sf_item_id: int | None = Field(None, description="Special Ferry item ID from company config")
    sf_rate: float | None = Field(None, description="Current rate for the Special Ferry item")
    sf_levy: float | None = Field(None, description="Current levy for the Special Ferry item")

class MultiTicketCreate(BaseModel):
    tickets: list[TicketCreate] = Field(..., min_length=1, description="Array of tickets to create atomically")
