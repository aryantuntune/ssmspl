import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import require_roles
from app.core.rbac import UserRole
from app.core.route_scope import get_route_branch_ids, needs_route_scope
from app.models.user import User
from app.schemas.report import (
    RevenueReport,
    TicketCountReport,
    ItemBreakdownReport,
    BranchSummaryReport,
    PaymentModeReport,
    DateWiseAmountReport,
    FerryWiseItemReport,
    ItemWiseSummaryReport,
    UserWiseSummaryReport,
    VehicleWiseTicketReport,
    BranchItemSummaryReport,
    TicketDetailsReport,
)
from sqlalchemy import select
from app.services import report_service, pdf_service

router = APIRouter(prefix="/api/reports", tags=["Reports"])

_report_roles = require_roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER, UserRole.BILLING_OPERATOR)


async def _scope_route_and_branch(
    db: AsyncSession,
    user: User,
    route_id: int | None,
    branch_id: int | None,
) -> tuple[int | None, int | None]:
    """Apply route scoping for MANAGER users.

    - If no route_id provided, auto-set to user's route_id.
    - If branch_id provided, validate it belongs to the user's route.
    - Returns the (possibly overridden) route_id and branch_id.
    """
    if not needs_route_scope(user):
        return route_id, branch_id

    # Force route to user's assigned route
    if route_id is None:
        route_id = user.route_id

    # If user tries to query a different route, deny
    if route_id != user.route_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. You can only view data for your assigned route.",
        )

    # Validate branch_id belongs to user's route
    if branch_id is not None and user.route_id:
        b1, b2 = await get_route_branch_ids(db, user.route_id)
        if branch_id not in (b1, b2):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied. Branch does not belong to your assigned route.",
            )

    return route_id, branch_id


async def _scope_branch_only(
    db: AsyncSession,
    user: User,
    branch_id: int | None,
) -> int | None:
    """For reports that only have branch_id (no route_id param).

    If MANAGER and no branch_id provided, leave it None (service will return
    data for all branches, but the route filter elsewhere limits it).
    If branch_id is provided, validate it belongs to the user's route.
    """
    if not needs_route_scope(user):
        return branch_id

    if branch_id is not None and user.route_id:
        b1, b2 = await get_route_branch_ids(db, user.route_id)
        if branch_id not in (b1, b2):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied. Branch does not belong to your assigned route.",
            )

    return branch_id


@router.get(
    "/report-users",
    summary="Users available for report filtering",
    description="Returns the list of users the current user is allowed to filter by in reports, "
                "respecting role hierarchy.",
)
async def report_users(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(_report_roles),
):
    """Return users visible to the caller based on role hierarchy.

    BILLING_OPERATOR -> only themselves
    MANAGER          -> billing operators under their route
    ADMIN            -> managers + billing operators (not SUPER_ADMIN)
    SUPER_ADMIN      -> all users except system accounts
    """
    role = current_user.role

    if role == UserRole.BILLING_OPERATOR:
        return [{"id": str(current_user.id), "full_name": current_user.full_name}]

    if role == UserRole.MANAGER:
        # Get billing operators assigned to the same route as the manager
        q = (
            select(User.id, User.full_name)
            .where(User.role == UserRole.BILLING_OPERATOR)
            .where(User.is_active == True)
            .order_by(User.full_name)
        )
        if current_user.route_id:
            q = q.where(User.route_id == current_user.route_id)
        rows = (await db.execute(q)).all()
        return [{"id": str(r.id), "full_name": r.full_name} for r in rows]

    if role == UserRole.ADMIN:
        # Managers + billing operators (not SUPER_ADMIN)
        q = (
            select(User.id, User.full_name, User.role)
            .where(User.role.in_([UserRole.MANAGER, UserRole.BILLING_OPERATOR]))
            .where(User.is_active == True)
            .order_by(User.full_name)
        )
        rows = (await db.execute(q)).all()
        return [{"id": str(r.id), "full_name": r.full_name} for r in rows]

    # SUPER_ADMIN -> all active users
    q = (
        select(User.id, User.full_name, User.role)
        .where(User.is_active == True)
        .order_by(User.full_name)
    )
    rows = (await db.execute(q)).all()
    return [{"id": str(r.id), "full_name": r.full_name} for r in rows]


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
    current_user: User = Depends(_report_roles),
):
    route_id, branch_id = await _scope_route_and_branch(db, current_user, route_id, branch_id)
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
    current_user: User = Depends(_report_roles),
):
    route_id, branch_id = await _scope_route_and_branch(db, current_user, route_id, branch_id)
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
    current_user: User = Depends(_report_roles),
):
    route_id, branch_id = await _scope_route_and_branch(db, current_user, route_id, branch_id)
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
    current_user: User = Depends(_report_roles),
):
    # For MANAGER, scope to their route's branches
    branch_ids: list[int] | None = None
    if needs_route_scope(current_user) and current_user.route_id:
        b1, b2 = await get_route_branch_ids(db, current_user.route_id)
        branch_ids = [b1, b2]
    return await report_service.get_branch_summary_report(db, date_from, date_to, branch_ids=branch_ids)


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
    current_user: User = Depends(_report_roles),
):
    route_id, branch_id = await _scope_route_and_branch(db, current_user, route_id, branch_id)
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
    route_id: int | None = Query(None),
    payment_mode_id: int | None = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(_report_roles),
):
    route_id, branch_id = await _scope_route_and_branch(db, current_user, route_id, branch_id)
    return await report_service.get_date_wise_amount(db, date_from, date_to, branch_id, payment_mode_id=payment_mode_id, route_id=route_id)


@router.get(
    "/ferry-wise-item",
    response_model=FerryWiseItemReport,
    summary="Ferry wise item summary",
    description="Item quantities grouped by departure time for a single date.",
)
async def ferry_wise_item_report(
    date: datetime.date = Query(...),
    branch_id: int | None = Query(None),
    route_id: int | None = Query(None),
    payment_mode_id: int | None = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(_report_roles),
):
    route_id, branch_id = await _scope_route_and_branch(db, current_user, route_id, branch_id)
    return await report_service.get_ferry_wise_item_summary(db, date, branch_id, payment_mode_id=payment_mode_id, route_id=route_id)


@router.get(
    "/itemwise-levy",
    response_model=ItemWiseSummaryReport,
    summary="Item wise summary",
    description="Item wise summary with rate and payment mode breakdown.",
)
async def itemwise_levy_report(
    date_from: datetime.date = Query(...),
    date_to: datetime.date = Query(...),
    branch_id: int | None = Query(None),
    route_id: int | None = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(_report_roles),
):
    route_id, branch_id = await _scope_route_and_branch(db, current_user, route_id, branch_id)
    return await report_service.get_item_wise_summary(db, date_from, date_to, branch_id, route_id)


@router.get(
    "/user-wise-summary",
    response_model=UserWiseSummaryReport,
    summary="User wise daily summary",
    description="Revenue per user (ticket creator) for a single date.",
)
async def user_wise_summary_report(
    date: datetime.date = Query(...),
    branch_id: int | None = Query(None),
    route_id: int | None = Query(None),
    user_id: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(_report_roles),
):
    route_id, branch_id = await _scope_route_and_branch(db, current_user, route_id, branch_id)
    # Role hierarchy enforcement
    if current_user.role == UserRole.BILLING_OPERATOR:
        user_id = str(current_user.id)
    elif current_user.role == UserRole.MANAGER and user_id:
        # Validate the requested user is a billing operator under this manager's route
        target = await db.get(User, user_id)
        if not target or target.role != UserRole.BILLING_OPERATOR:
            user_id = None  # Ignore invalid filter
        elif current_user.route_id and target.route_id != current_user.route_id:
            user_id = None  # Not under this manager's route
    return await report_service.get_user_wise_summary(db, date, branch_id, route_id, user_id)


@router.get(
    "/vehicle-wise-tickets",
    response_model=VehicleWiseTicketReport,
    summary="Vehicle wise ticket details",
    description="Vehicle ticket details for a single date.",
)
async def vehicle_wise_ticket_report(
    date: datetime.date = Query(...),
    branch_id: int | None = Query(None),
    route_id: int | None = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(_report_roles),
):
    route_id, branch_id = await _scope_route_and_branch(db, current_user, route_id, branch_id)
    return await report_service.get_vehicle_wise_tickets(db, date, branch_id, route_id)


@router.get(
    "/branch-item-summary",
    response_model=BranchItemSummaryReport,
    summary="Branch item summary report",
    description="Item-wise billing summary for a branch over a date range with payment mode breakdown.",
)
async def branch_item_summary_report(
    date_from: datetime.date = Query(...),
    date_to: datetime.date = Query(...),
    branch_id: int | None = Query(None),
    route_id: int | None = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(_report_roles),
):
    route_id, branch_id = await _scope_route_and_branch(db, current_user, route_id, branch_id)
    return await report_service.get_branch_item_summary(db, date_from, date_to, branch_id, route_id)


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
    route_id: int | None = Query(None),
    payment_mode_id: int | None = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(_report_roles),
):
    route_id, branch_id = await _scope_route_and_branch(db, current_user, route_id, branch_id)
    data = await report_service.get_date_wise_amount(db, date_from, date_to, branch_id, payment_mode_id=payment_mode_id, route_id=route_id)
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
    route_id: int | None = Query(None),
    payment_mode_id: int | None = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(_report_roles),
):
    route_id, branch_id = await _scope_route_and_branch(db, current_user, route_id, branch_id)
    data = await report_service.get_ferry_wise_item_summary(db, date, branch_id, payment_mode_id=payment_mode_id, route_id=route_id)
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
    current_user: User = Depends(_report_roles),
):
    route_id, branch_id = await _scope_route_and_branch(db, current_user, route_id, branch_id)
    data = await report_service.get_item_wise_summary(db, date_from, date_to, branch_id, route_id)
    pdf_buf = pdf_service.generate_item_wise_summary_pdf(data)
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
    current_user: User = Depends(_report_roles),
):
    route_id, branch_id = await _scope_route_and_branch(db, current_user, route_id, branch_id)
    data = await report_service.get_payment_mode_report(db, date_from, date_to, branch_id, route_id)
    pdf_buf = pdf_service.generate_payment_mode_pdf(data)
    return StreamingResponse(
        pdf_buf,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=payment_mode_{date_from}_{date_to}.pdf"},
    )


@router.get(
    "/ticket-details",
    response_model=TicketDetailsReport,
    summary="Ticket details report",
    description="Detailed ticket list for a single date with boat name and payment mode.",
)
async def ticket_details_report(
    date: datetime.date = Query(...),
    branch_id: int | None = Query(None),
    route_id: int | None = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(_report_roles),
):
    route_id, branch_id = await _scope_route_and_branch(db, current_user, route_id, branch_id)
    return await report_service.get_ticket_details_report(db, date, branch_id, route_id)


@router.get(
    "/ticket-details/pdf",
    summary="Ticket details PDF",
    description="Download the Ticket Details report as a PDF file.",
)
async def get_ticket_details_pdf(
    date: datetime.date = Query(...),
    branch_id: int | None = Query(None),
    route_id: int | None = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(_report_roles),
):
    route_id, branch_id = await _scope_route_and_branch(db, current_user, route_id, branch_id)
    data = await report_service.get_ticket_details_report(db, date, branch_id, route_id)
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
    route_id: int | None = Query(None),
    user_id: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(_report_roles),
):
    route_id, branch_id = await _scope_route_and_branch(db, current_user, route_id, branch_id)
    if current_user.role == UserRole.BILLING_OPERATOR:
        user_id = str(current_user.id)
    elif current_user.role == UserRole.MANAGER and user_id:
        target = await db.get(User, user_id)
        if not target or target.role != UserRole.BILLING_OPERATOR:
            user_id = None
        elif current_user.route_id and target.route_id != current_user.route_id:
            user_id = None
    data = await report_service.get_user_wise_summary(db, date, branch_id, route_id, user_id)
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
    route_id: int | None = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(_report_roles),
):
    route_id, branch_id = await _scope_route_and_branch(db, current_user, route_id, branch_id)
    data = await report_service.get_vehicle_wise_tickets(db, date, branch_id, route_id)
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
    current_user: User = Depends(_report_roles),
):
    branch_ids: list[int] | None = None
    if needs_route_scope(current_user) and current_user.route_id:
        b1, b2 = await get_route_branch_ids(db, current_user.route_id)
        branch_ids = [b1, b2]
    data = await report_service.get_branch_summary_report(db, date_from, date_to, branch_ids=branch_ids)
    pdf_buf = pdf_service.generate_branch_summary_pdf(data)
    return StreamingResponse(
        pdf_buf,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=branch_summary_{date_from}_{date_to}.pdf"},
    )


@router.get(
    "/branch-item-summary/pdf",
    summary="Branch item summary PDF",
    description="Download the Branch Item Summary report as a PDF file.",
)
async def get_branch_item_summary_pdf(
    date_from: datetime.date = Query(...),
    date_to: datetime.date = Query(...),
    branch_id: int | None = Query(None),
    route_id: int | None = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(_report_roles),
):
    route_id, branch_id = await _scope_route_and_branch(db, current_user, route_id, branch_id)
    data = await report_service.get_branch_item_summary(db, date_from, date_to, branch_id, route_id)
    pdf_buf = pdf_service.generate_branch_item_summary_pdf(data)
    return StreamingResponse(
        pdf_buf,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=branch_item_summary_{date_from}_{date_to}.pdf"},
    )
