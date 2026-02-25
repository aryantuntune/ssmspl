import datetime

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
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
from app.services import report_service, pdf_service, ticket_service

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


# ---------------------------------------------------------------------------
# PDF Download Endpoints
# ---------------------------------------------------------------------------


@router.get(
    "/date-wise-amount/pdf",
    summary="Date wise amount summary PDF",
    description="Download the Date Wise Amount Summary report as a PDF file.",
)
async def get_date_wise_amount_pdf(
    date_from: datetime.date = Query(...),
    date_to: datetime.date = Query(...),
    branch_id: int | None = Query(None),
    payment_mode_id: int | None = Query(None),
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(_report_roles),
):
    data = await report_service.get_date_wise_amount(db, date_from, date_to, branch_id, payment_mode_id)
    pdf_buf = pdf_service.generate_date_wise_amount_pdf(data)
    return StreamingResponse(
        pdf_buf,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=date_wise_amount_{date_from}_{date_to}.pdf"},
    )


@router.get(
    "/ferry-wise-item/pdf",
    summary="Ferry wise item summary PDF",
    description="Download the Ferry Wise Item Summary report as a PDF file.",
)
async def get_ferry_wise_item_pdf(
    date: datetime.date = Query(...),
    branch_id: int | None = Query(None),
    payment_mode_id: int | None = Query(None),
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(_report_roles),
):
    data = await report_service.get_ferry_wise_item_summary(db, date, branch_id, payment_mode_id)
    pdf_buf = pdf_service.generate_ferry_wise_item_pdf(data)
    return StreamingResponse(
        pdf_buf,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=ferry_wise_item_{date}.pdf"},
    )


@router.get(
    "/itemwise-levy/pdf",
    summary="Itemwise levy summary PDF",
    description="Download the Itemwise Levy Summary report as a PDF file.",
)
async def get_itemwise_levy_pdf(
    date_from: datetime.date = Query(...),
    date_to: datetime.date = Query(...),
    branch_id: int | None = Query(None),
    route_id: int | None = Query(None),
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(_report_roles),
):
    data = await report_service.get_itemwise_levy_summary(db, date_from, date_to, branch_id, route_id)
    pdf_buf = pdf_service.generate_itemwise_levy_pdf(data)
    return StreamingResponse(
        pdf_buf,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=itemwise_levy_{date_from}_{date_to}.pdf"},
    )


@router.get(
    "/payment-mode/pdf",
    summary="Payment mode summary PDF",
    description="Download the Payment Mode Wise Summary report as a PDF file.",
)
async def get_payment_mode_pdf(
    date_from: datetime.date = Query(...),
    date_to: datetime.date = Query(...),
    branch_id: int | None = Query(None),
    route_id: int | None = Query(None),
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(_report_roles),
):
    data = await report_service.get_payment_mode_report(db, date_from, date_to, branch_id, route_id)
    pdf_buf = pdf_service.generate_payment_mode_pdf(data)
    return StreamingResponse(
        pdf_buf,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=payment_mode_{date_from}_{date_to}.pdf"},
    )


@router.get(
    "/ticket-details/pdf",
    summary="Ticket details PDF",
    description="Download the Ticket Details report as a PDF file.",
)
async def get_ticket_details_pdf(
    date: datetime.date = Query(...),
    branch_id: int | None = Query(None),
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(_report_roles),
):
    # Fetch all tickets for the given date and optional branch, using a large
    # limit so that all tickets for a single day are included in the PDF.
    tickets = await ticket_service.get_all_tickets(
        db,
        skip=0,
        limit=10000,
        sort_by="ticket_no",
        sort_order="asc",
        branch_filter=branch_id,
        date_from=date,
        date_to=date,
    )

    # Resolve the branch name for the subtitle
    branch_name = None
    if branch_id:
        branch_name = await ticket_service._get_branch_name(db, branch_id)

    # Build the data dict expected by generate_ticket_details_pdf
    data = {
        "date": date,
        "branch_name": branch_name,
        "rows": [
            {
                "ticket_date": t["ticket_date"],
                "ticket_no": t["ticket_no"],
                "departure": t["departure"] or "",
                "payment_mode_name": t["payment_mode_name"] or "",
                "net_amount": t["net_amount"],
                "is_cancelled": t["is_cancelled"],
            }
            for t in tickets
        ],
    }

    pdf_buf = pdf_service.generate_ticket_details_pdf(data)
    return StreamingResponse(
        pdf_buf,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=ticket_details_{date}.pdf"},
    )


@router.get(
    "/user-wise-summary/pdf",
    summary="User wise daily summary PDF",
    description="Download the User Wise Daily Cash Summary report as a PDF file.",
)
async def get_user_wise_summary_pdf(
    date: datetime.date = Query(...),
    branch_id: int | None = Query(None),
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(_report_roles),
):
    data = await report_service.get_user_wise_summary(db, date, branch_id)
    pdf_buf = pdf_service.generate_user_wise_summary_pdf(data)
    return StreamingResponse(
        pdf_buf,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=user_wise_summary_{date}.pdf"},
    )


@router.get(
    "/vehicle-wise-tickets/pdf",
    summary="Vehicle wise ticket details PDF",
    description="Download the Vehicle Wise Ticket Details report as a PDF file.",
)
async def get_vehicle_wise_tickets_pdf(
    date: datetime.date = Query(...),
    branch_id: int | None = Query(None),
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(_report_roles),
):
    data = await report_service.get_vehicle_wise_tickets(db, date, branch_id)
    pdf_buf = pdf_service.generate_vehicle_wise_tickets_pdf(data)
    return StreamingResponse(
        pdf_buf,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=vehicle_wise_tickets_{date}.pdf"},
    )


@router.get(
    "/branch-summary/pdf",
    summary="Branch summary PDF",
    description="Download the Branch Summary report as a PDF file.",
)
async def get_branch_summary_pdf(
    date_from: datetime.date = Query(...),
    date_to: datetime.date = Query(...),
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(_report_roles),
):
    data = await report_service.get_branch_summary_report(db, date_from, date_to)
    pdf_buf = pdf_service.generate_branch_summary_pdf(data)
    return StreamingResponse(
        pdf_buf,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=branch_summary_{date_from}_{date_to}.pdf"},
    )
