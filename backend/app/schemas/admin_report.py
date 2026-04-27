"""Pydantic response schemas for the three admin reports.

These reports are POS-only (tickets + ticket_items) and live under
/api/reports/admin/*. They are gated to SUPER_ADMIN + granted ADMIN
users and served only from the admin portal backend.

All monetary values are strings formatted to two decimal places so
that the JSON representation matches the PDF layout exactly.
"""
from __future__ import annotations

import datetime

from pydantic import BaseModel, Field


class BranchRef(BaseModel):
    id: int
    name: str


class DriftedTicket(BaseModel):
    ticket_id: int
    ticket_no: int
    ticket_amount: str
    items_sum: str
    diff: str


class IntegrityWarning(BaseModel):
    """Non-blocking warning emitted when items_total disagrees with ticket
    headers by more than ₹0.01. The report itself is always returned."""

    items_total: str
    tickets_total: str
    diff: str
    message: str
    sample_tickets: list[DriftedTicket] = Field(default_factory=list)


# ── Report A: Itemwise Levy Summary ───────────────────────────────────────────


class ItemwiseLevyRow(BaseModel):
    item_id: int
    item_name: str
    levy: str
    # keyed by str(branch_id) because JSON object keys must be strings
    branch_quantities: dict[str, int]
    total_quantity: int
    amount: str


class ItemwiseLevyReport(BaseModel):
    route_id: int
    route_label: str
    date_from: datetime.date
    date_to: datetime.date
    branches: list[BranchRef]
    rows: list[ItemwiseLevyRow]
    branch_totals: dict[str, str]
    grand_total: str
    integrity_warning: IntegrityWarning | None = None


# ── Report B: Date-Wise Branch Summary (Cash + UPI) ──────────────────────────


class DateBranchColumn(BaseModel):
    key: str = Field(..., description="Stable column identifier (e.g. '202-CASH')")
    label: str = Field(..., description="Human label (e.g. 'BHAYANDER-CASH')")
    branch_id: int
    mode: str = Field(..., description="CASH or UPI")


class DateBranchRow(BaseModel):
    date: datetime.date
    cells: dict[str, str]
    total: str


class DateBranchSummaryReport(BaseModel):
    route_id: int
    route_label: str
    date_from: datetime.date
    date_to: datetime.date
    columns: list[DateBranchColumn]
    rows: list[DateBranchRow]
    column_totals: dict[str, str]
    grand_total: str
    integrity_warning: IntegrityWarning | None = None


# ── Report C: Itemwise Daily Collection Charges Summary ───────────────────────


class DailyChargeRow(BaseModel):
    item_id: int
    item_name: str
    charges: str
    quantity: int
    amount: str


class DailyBranchSection(BaseModel):
    branch_id: int
    branch_name: str
    rows: list[DailyChargeRow]
    subtotal: str


class DailyDateSection(BaseModel):
    date: datetime.date
    branches: list[DailyBranchSection]
    day_total: str


class ItemwiseDailyChargesReport(BaseModel):
    route_id: int
    route_label: str
    date_from: datetime.date
    date_to: datetime.date
    dates: list[DailyDateSection]
    grand_total: str
    integrity_warning: IntegrityWarning | None = None


# ── Report D: Month-Wise Branch Summary (cross-route) ────────────────────────


class MonthBranchRow(BaseModel):
    month: str = Field(..., description="ISO month identifier 'YYYY-MM'")
    month_label: str = Field(..., description="Display label 'MM-YYYY'")
    cells: dict[str, str]
    total: str


class MonthBranchSummaryReport(BaseModel):
    route_label: str
    date_from: datetime.date
    date_to: datetime.date
    branches: list[BranchRef]
    columns: list[DateBranchColumn]
    rows: list[MonthBranchRow]
    column_totals: dict[str, str]
    grand_total: str
    integrity_warning: IntegrityWarning | None = None
