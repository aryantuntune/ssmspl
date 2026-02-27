from decimal import Decimal

from pydantic import BaseModel, Field


class BranchStat(BaseModel):
    branch_id: int = Field(..., description="Branch identifier")
    branch_name: str = Field(..., description="Branch name")
    ticket_count: int = Field(..., description="Number of tickets for this branch today")
    revenue: Decimal = Field(..., description="Total revenue for this branch today")


class PaymentModeStat(BaseModel):
    payment_mode_id: int = Field(..., description="Payment mode identifier")
    payment_mode_name: str = Field(..., description="Payment mode description")
    ticket_count: int = Field(..., description="Number of tickets for this payment mode today")
    revenue: Decimal = Field(..., description="Total revenue for this payment mode today")


class TodaySummaryResponse(BaseModel):
    total_tickets: int = Field(..., description="Total ticket count for today")
    total_revenue: Decimal = Field(..., description="Total revenue for today")
    branches: list[BranchStat] = Field(..., description="Per-branch breakdown")
    payment_modes: list[PaymentModeStat] = Field(..., description="Per-payment-mode breakdown")
