import datetime

from pydantic import BaseModel, Field


# --- Revenue Report ---

class RevenueRow(BaseModel):
    period: str = Field(..., description="Grouping label (date, week, or month)")
    ticket_revenue: float = 0
    booking_revenue: float = 0
    total_revenue: float = 0


class RevenueReport(BaseModel):
    date_from: datetime.date
    date_to: datetime.date
    grouping: str
    rows: list[RevenueRow]
    total_ticket_revenue: float = 0
    total_booking_revenue: float = 0
    grand_total: float = 0


# --- Ticket Count Report ---

class TicketCountRow(BaseModel):
    group: str = Field(..., description="Group label (branch name, route name, or date)")
    active_tickets: int = 0
    cancelled_tickets: int = 0
    total_tickets: int = 0
    active_bookings: int = 0
    cancelled_bookings: int = 0
    total_bookings: int = 0


class TicketCountReport(BaseModel):
    date_from: datetime.date
    date_to: datetime.date
    group_by: str
    rows: list[TicketCountRow]


# --- Item Breakdown Report ---

class ItemBreakdownRow(BaseModel):
    item_id: int
    item_name: str
    is_vehicle: bool = False
    ticket_qty: int = 0
    ticket_revenue: float = 0
    booking_qty: int = 0
    booking_revenue: float = 0
    total_qty: int = 0
    total_revenue: float = 0


class ItemBreakdownReport(BaseModel):
    date_from: datetime.date
    date_to: datetime.date
    rows: list[ItemBreakdownRow]
    grand_total_revenue: float = 0


# --- Branch Summary Report ---

class BranchSummaryRow(BaseModel):
    branch_id: int
    branch_name: str
    ticket_count: int = 0
    ticket_revenue: float = 0
    booking_count: int = 0
    booking_revenue: float = 0
    total_count: int = 0
    total_revenue: float = 0


class BranchSummaryReport(BaseModel):
    date_from: datetime.date
    date_to: datetime.date
    rows: list[BranchSummaryRow]


# --- Payment Mode Report ---

class PaymentModeRow(BaseModel):
    payment_mode_id: int
    payment_mode_name: str
    ticket_revenue: float = 0
    ticket_count: int = 0
    booking_revenue: float = 0
    booking_count: int = 0
    total_revenue: float = 0
    total_count: int = 0


class PaymentModeReport(BaseModel):
    date_from: datetime.date
    date_to: datetime.date
    rows: list[PaymentModeRow]
