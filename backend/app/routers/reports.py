import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import require_roles
from app.core.rbac import UserRole
from app.models.user import User
from app.schemas.report import (
    RevenueReport,
    TicketCountReport,
    ItemBreakdownReport,
    BranchSummaryReport,
    PaymentModeReport,
    DateWiseAmountReport,
    FerryWiseItemReport,
    ItemwiseLevyReport,
    UserWiseSummaryReport,
    VehicleWiseTicketReport,
)
from app.services import report_service

router = APIRouter(prefix="/api/reports", tags=["Reports"])

_report_roles = require_roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER)


@router.get(
    "/revenue",
    response_model=RevenueReport,
    summary="Revenue report",
    description="Revenue summary (tickets + bookings) grouped by day, week, or month.",
)
async def revenue_report(
    date_from: datetime.date = Query(...),
    date_to: datetime.date = Query(...),
    branch_id: int | None = Query(None),
    route_id: int | None = Query(None),
    grouping: str = Query("day", pattern="^(day|week|month)$"),
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(_report_roles),
):
    return await report_service.get_revenue_report(db, date_from, date_to, branch_id, route_id, grouping)


@router.get(
    "/ticket-count",
    response_model=TicketCountReport,
    summary="Ticket count report",
    description="Count of tickets and bookings by status, grouped by branch, route, or date.",
)
async def ticket_count_report(
    date_from: datetime.date = Query(...),
    date_to: datetime.date = Query(...),
    branch_id: int | None = Query(None),
    route_id: int | None = Query(None),
    group_by: str = Query("date", pattern="^(branch|route|date)$"),
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(_report_roles),
):
    return await report_service.get_ticket_count_report(db, date_from, date_to, branch_id, route_id, group_by)


@router.get(
    "/item-breakdown",
    response_model=ItemBreakdownReport,
    summary="Item breakdown report",
    description="Revenue and quantity per item across tickets and bookings.",
)
async def item_breakdown_report(
    date_from: datetime.date = Query(...),
    date_to: datetime.date = Query(...),
    branch_id: int | None = Query(None),
    route_id: int | None = Query(None),
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(_report_roles),
):
    return await report_service.get_item_breakdown_report(db, date_from, date_to, branch_id, route_id)


@router.get(
    "/branch-summary",
    response_model=BranchSummaryReport,
    summary="Branch summary report",
    description="Revenue and count per branch across tickets and bookings.",
)
async def branch_summary_report(
    date_from: datetime.date = Query(...),
    date_to: datetime.date = Query(...),
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(_report_roles),
):
    return await report_service.get_branch_summary_report(db, date_from, date_to)


@router.get(
    "/payment-mode",
    response_model=PaymentModeReport,
    summary="Payment mode report",
    description="Revenue by payment mode across tickets and bookings.",
)
async def payment_mode_report(
    date_from: datetime.date = Query(...),
    date_to: datetime.date = Query(...),
    branch_id: int | None = Query(None),
    route_id: int | None = Query(None),
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(_report_roles),
):
    return await report_service.get_payment_mode_report(db, date_from, date_to, branch_id, route_id)


@router.get(
    "/date-wise-amount",
    response_model=DateWiseAmountReport,
    summary="Date wise amount summary",
    description="Daily ticket revenue totals over a date range.",
)
async def date_wise_amount_report(
    date_from: datetime.date = Query(...),
    date_to: datetime.date = Query(...),
    branch_id: int | None = Query(None),
    payment_mode_id: int | None = Query(None),
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(_report_roles),
):
    return await report_service.get_date_wise_amount(db, date_from, date_to, branch_id, payment_mode_id)


@router.get(
    "/ferry-wise-item",
    response_model=FerryWiseItemReport,
    summary="Ferry wise item summary",
    description="Item quantities grouped by departure time for a single date.",
)
async def ferry_wise_item_report(
    date: datetime.date = Query(...),
    branch_id: int | None = Query(None),
    payment_mode_id: int | None = Query(None),
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(_report_roles),
):
    return await report_service.get_ferry_wise_item_summary(db, date, branch_id, payment_mode_id)


@router.get(
    "/itemwise-levy",
    response_model=ItemwiseLevyReport,
    summary="Itemwise levy summary",
    description="Levy breakdown per item over a date range.",
)
async def itemwise_levy_report(
    date_from: datetime.date = Query(...),
    date_to: datetime.date = Query(...),
    branch_id: int | None = Query(None),
    route_id: int | None = Query(None),
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(_report_roles),
):
    return await report_service.get_itemwise_levy_summary(db, date_from, date_to, branch_id, route_id)


@router.get(
    "/user-wise-summary",
    response_model=UserWiseSummaryReport,
    summary="User wise daily summary",
    description="Revenue per user (ticket creator) for a single date.",
)
async def user_wise_summary_report(
    date: datetime.date = Query(...),
    branch_id: int | None = Query(None),
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(_report_roles),
):
    return await report_service.get_user_wise_summary(db, date, branch_id)


@router.get(
    "/vehicle-wise-tickets",
    response_model=VehicleWiseTicketReport,
    summary="Vehicle wise ticket details",
    description="Vehicle ticket details for a single date.",
)
async def vehicle_wise_ticket_report(
    date: datetime.date = Query(...),
    branch_id: int | None = Query(None),
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(_report_roles),
):
    return await report_service.get_vehicle_wise_tickets(db, date, branch_id)
