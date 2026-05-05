import datetime

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import require_roles
from app.core.rbac import UserRole
from app.core.data_cutoff import clamp_date_from, clamp_date_to, clamp_single_date
from app.core.route_scope import get_route_branch_ids, needs_route_scope
from app.middleware.rate_limit import limiter
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
from app.services.activity_log_service import log_activity, ActivityAction

router = APIRouter(prefix="/api/reports", tags=["Reports"])

_report_roles = require_roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER, UserRole.BILLING_OPERATOR)


def _log_report(bg: BackgroundTasks, user, report_type: str, is_pdf: bool, **filters):
    """Fire-and-forget activity log for report access."""
    bg.add_task(
        log_activity,
        session_id=user.active_session_id,
        user_id=user.id,
        action_type=ActivityAction.REPORT_PDF if is_pdf else ActivityAction.REPORT_VIEW,
        metadata={"report_type": report_type, **{k: str(v) for k, v in filters.items() if v is not None}},
    )


async def _scope_route_and_branch(
    db: AsyncSession,
    user: User,
    route_id: int | None,
    branch_id: int | None,
) -> tuple[int | None, int | None]:
    """Apply route scoping and validate route-branch consistency.

    - For all users: validates branch belongs to route when both are provided.
    - For BILLING_OPERATOR: forces branch_id to active_branch_id (server-side).
    - For scoped users (MANAGER/BILLING_OPERATOR): auto-sets route and restricts access.
    """
    if not needs_route_scope(user):
        # ADMIN/SUPER_ADMIN: just validate route-branch consistency
        if route_id is not None and branch_id is not None:
            b1, b2 = await get_route_branch_ids(db, route_id)
            if branch_id not in (b1, b2):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Branch does not belong to the selected route.",
                )
        return route_id, branch_id

    # Scoped users must have route_id assigned
    if not user.route_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No route assigned. Contact admin to set your route.",
        )

    # BILLING_OPERATOR must have active_branch_id (set at login)
    if user.role == UserRole.BILLING_OPERATOR and not user.active_branch_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No branch selected. Please log out and log back in to select your branch.",
        )

    # Force route to user's assigned route
    if route_id is None:
        route_id = user.route_id

    # If user tries to query a different route, deny
    if route_id != user.route_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. You can only view data for your assigned route.",
        )

    # BILLING_OPERATOR: force branch to their active_branch_id (set at login)
    if user.role == UserRole.BILLING_OPERATOR:
        if branch_id is not None and branch_id != user.active_branch_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied. You can only view data for your assigned branch.",
            )
        branch_id = user.active_branch_id

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
    BILLING_OPERATOR: force branch to their active_branch_id.
    """
    if not needs_route_scope(user):
        return branch_id

    # BILLING_OPERATOR must have active_branch_id (set at login)
    if user.role == UserRole.BILLING_OPERATOR and not user.active_branch_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No branch selected. Please log out and log back in to select your branch.",
        )

    # BILLING_OPERATOR: force branch to their active_branch_id (set at login)
    if user.role == UserRole.BILLING_OPERATOR:
        if branch_id is not None and branch_id != user.active_branch_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied. You can only view data for your assigned branch.",
            )
        branch_id = user.active_branch_id

    if branch_id is not None and user.route_id:
        b1, b2 = await get_route_branch_ids(db, user.route_id)
        if branch_id not in (b1, b2):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied. Branch does not belong to your assigned route.",
            )

    return branch_id


@limiter.limit("10/minute")
@router.get(
    "/report-users",
    summary="Users available for report filtering",
    description="Returns the list of users the current user is allowed to filter by in reports, "
                "respecting role hierarchy.",
)
async def report_users(
    request: Request,
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


@limiter.limit("10/minute")
@router.get(
    "/revenue",
    response_model=RevenueReport,
    summary="Revenue report",
    description="Revenue summary (tickets + bookings) grouped by day, week, or month.",
)
async def revenue_report(
    request: Request,
    background_tasks: BackgroundTasks,
    date_from: datetime.date = Query(...),
    date_to: datetime.date = Query(...),
    branch_id: int | None = Query(None),
    route_id: int | None = Query(None),
    grouping: str = Query("day", pattern="^(day|week|month)$"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(_report_roles),
):
    route_id, branch_id = await _scope_route_and_branch(db, current_user, route_id, branch_id)
    date_from = clamp_date_from(date_from, current_user.role)
    date_to = clamp_date_to(date_to, current_user.role)
    _log_report(background_tasks, current_user, "revenue", False, date_from=date_from, date_to=date_to, branch_id=branch_id, route_id=route_id, grouping=grouping)
    return await report_service.get_revenue_report(db, date_from, date_to, branch_id, route_id, grouping)


@limiter.limit("10/minute")
@router.get(
    "/ticket-count",
    response_model=TicketCountReport,
    summary="Ticket count report",
    description="Count of tickets and bookings by status, grouped by branch, route, or date.",
)
async def ticket_count_report(
    request: Request,
    background_tasks: BackgroundTasks,
    date_from: datetime.date = Query(...),
    date_to: datetime.date = Query(...),
    branch_id: int | None = Query(None),
    route_id: int | None = Query(None),
    group_by: str = Query("date", pattern="^(branch|route|date)$"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(_report_roles),
):
    route_id, branch_id = await _scope_route_and_branch(db, current_user, route_id, branch_id)
    date_from = clamp_date_from(date_from, current_user.role)
    date_to = clamp_date_to(date_to, current_user.role)
    _log_report(background_tasks, current_user, "ticket_count", False, date_from=date_from, date_to=date_to, branch_id=branch_id, route_id=route_id, group_by=group_by)
    return await report_service.get_ticket_count_report(db, date_from, date_to, branch_id, route_id, group_by)


@limiter.limit("10/minute")
@router.get(
    "/item-breakdown",
    response_model=ItemBreakdownReport,
    summary="Item breakdown report",
    description="Revenue and quantity per item across tickets and bookings.",
)
async def item_breakdown_report(
    request: Request,
    background_tasks: BackgroundTasks,
    date_from: datetime.date = Query(...),
    date_to: datetime.date = Query(...),
    branch_id: int | None = Query(None),
    route_id: int | None = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(_report_roles),
):
    route_id, branch_id = await _scope_route_and_branch(db, current_user, route_id, branch_id)
    date_from = clamp_date_from(date_from, current_user.role)
    date_to = clamp_date_to(date_to, current_user.role)
    _log_report(background_tasks, current_user, "item_breakdown", False, date_from=date_from, date_to=date_to, branch_id=branch_id, route_id=route_id)
    return await report_service.get_item_breakdown_report(db, date_from, date_to, branch_id, route_id)


@limiter.limit("10/minute")
@router.get(
    "/branch-summary",
    response_model=BranchSummaryReport,
    summary="Branch summary report",
    description="Revenue and count per branch across tickets and bookings.",
)
async def branch_summary_report(
    request: Request,
    background_tasks: BackgroundTasks,
    date_from: datetime.date = Query(...),
    date_to: datetime.date = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(_report_roles),
):
    # Scoped users must have route_id assigned
    branch_ids: list[int] | None = None
    if needs_route_scope(current_user):
        if not current_user.route_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No route assigned. Contact admin to set your route.",
            )
        b1, b2 = await get_route_branch_ids(db, current_user.route_id)
        # BILLING_OPERATOR: scope to only their active branch
        if current_user.role == UserRole.BILLING_OPERATOR:
            if not current_user.active_branch_id:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="No branch selected. Please log out and log back in to select your branch.",
                )
            branch_ids = [current_user.active_branch_id]
        else:
            branch_ids = [b1, b2]
    date_from = clamp_date_from(date_from, current_user.role)
    date_to = clamp_date_to(date_to, current_user.role)
    _log_report(background_tasks, current_user, "branch_summary", False, date_from=date_from, date_to=date_to)
    return await report_service.get_branch_summary_report(db, date_from, date_to, branch_ids=branch_ids)


@limiter.limit("10/minute")
@router.get(
    "/payment-mode",
    response_model=PaymentModeReport,
    summary="Payment mode report",
    description="Revenue by payment mode across tickets and bookings.",
)
async def payment_mode_report(
    request: Request,
    background_tasks: BackgroundTasks,
    date_from: datetime.date = Query(...),
    date_to: datetime.date = Query(...),
    branch_id: int | None = Query(None),
    route_id: int | None = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(_report_roles),
):
    route_id, branch_id = await _scope_route_and_branch(db, current_user, route_id, branch_id)
    date_from = clamp_date_from(date_from, current_user.role)
    date_to = clamp_date_to(date_to, current_user.role)
    _log_report(background_tasks, current_user, "payment_mode", False, date_from=date_from, date_to=date_to, branch_id=branch_id, route_id=route_id)
    return await report_service.get_payment_mode_report(db, date_from, date_to, branch_id, route_id)


@limiter.limit("10/minute")
@router.get(
    "/date-wise-amount",
    response_model=DateWiseAmountReport,
    summary="Date wise amount summary",
    description="Daily ticket revenue totals over a date range.",
)
async def date_wise_amount_report(
    request: Request,
    background_tasks: BackgroundTasks,
    date_from: datetime.date = Query(...),
    date_to: datetime.date = Query(...),
    branch_id: int | None = Query(None),
    route_id: int | None = Query(None),
    payment_mode_id: int | None = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(_report_roles),
):
    route_id, branch_id = await _scope_route_and_branch(db, current_user, route_id, branch_id)
    date_from = clamp_date_from(date_from, current_user.role)
    date_to = clamp_date_to(date_to, current_user.role)
    _log_report(background_tasks, current_user, "date_wise_amount", False, date_from=date_from, date_to=date_to, branch_id=branch_id, route_id=route_id, payment_mode_id=payment_mode_id)
    return await report_service.get_date_wise_amount(db, date_from, date_to, branch_id, payment_mode_id=payment_mode_id, route_id=route_id)


@limiter.limit("10/minute")
@router.get(
    "/ferry-wise-item",
    response_model=FerryWiseItemReport,
    summary="Ferry wise item summary",
    description="Item quantities grouped by departure time for a single date.",
)
async def ferry_wise_item_report(
    request: Request,
    background_tasks: BackgroundTasks,
    date: datetime.date = Query(...),
    branch_id: int | None = Query(None),
    route_id: int | None = Query(None),
    payment_mode_id: int | None = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(_report_roles),
):
    route_id, branch_id = await _scope_route_and_branch(db, current_user, route_id, branch_id)
    date = clamp_single_date(date, current_user.role)
    _log_report(background_tasks, current_user, "ferry_wise_item", False, date=date, branch_id=branch_id, route_id=route_id, payment_mode_id=payment_mode_id)
    return await report_service.get_ferry_wise_item_summary(db, date, branch_id, payment_mode_id=payment_mode_id, route_id=route_id)


@limiter.limit("10/minute")
@router.get(
    "/itemwise-levy",
    response_model=ItemWiseSummaryReport,
    summary="Item wise summary",
    description="Item wise summary with rate and payment mode breakdown.",
)
async def itemwise_levy_report(
    request: Request,
    background_tasks: BackgroundTasks,
    date_from: datetime.date = Query(...),
    date_to: datetime.date = Query(...),
    branch_id: int | None = Query(None),
    route_id: int | None = Query(None),
    payment_mode_id: int | None = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(_report_roles),
):
    route_id, branch_id = await _scope_route_and_branch(db, current_user, route_id, branch_id)
    date_from = clamp_date_from(date_from, current_user.role)
    date_to = clamp_date_to(date_to, current_user.role)
    _log_report(background_tasks, current_user, "itemwise_levy", False, date_from=date_from, date_to=date_to, branch_id=branch_id, route_id=route_id, payment_mode_id=payment_mode_id)
    return await report_service.get_item_wise_summary(db, date_from, date_to, branch_id, route_id, payment_mode_id)


@limiter.limit("10/minute")
@router.get(
    "/user-wise-summary",
    response_model=UserWiseSummaryReport,
    summary="User wise daily summary",
    description="Revenue per user (ticket creator) for a single date.",
)
async def user_wise_summary_report(
    request: Request,
    background_tasks: BackgroundTasks,
    date: datetime.date = Query(...),
    branch_id: int | None = Query(None),
    route_id: int | None = Query(None),
    payment_mode_id: int | None = Query(None),
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
    date = clamp_single_date(date, current_user.role)
    _log_report(background_tasks, current_user, "user_wise_summary", False, date=date, branch_id=branch_id, route_id=route_id, payment_mode_id=payment_mode_id, user_id=user_id)
    return await report_service.get_user_wise_summary(db, date, branch_id, route_id, user_id, payment_mode_id)


@limiter.limit("10/minute")
@router.get(
    "/vehicle-wise-tickets",
    response_model=VehicleWiseTicketReport,
    summary="Vehicle wise ticket details",
    description="Vehicle ticket details for a single date.",
)
async def vehicle_wise_ticket_report(
    request: Request,
    background_tasks: BackgroundTasks,
    date: datetime.date = Query(...),
    branch_id: int | None = Query(None),
    route_id: int | None = Query(None),
    payment_mode_id: int | None = Query(None),
    boat_id: int | None = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(_report_roles),
):
    route_id, branch_id = await _scope_route_and_branch(db, current_user, route_id, branch_id)
    date = clamp_single_date(date, current_user.role)
    _log_report(background_tasks, current_user, "vehicle_wise_tickets", False, date=date, branch_id=branch_id, route_id=route_id, payment_mode_id=payment_mode_id, boat_id=boat_id)
    return await report_service.get_vehicle_wise_tickets(db, date, branch_id, route_id, payment_mode_id, boat_id)


@limiter.limit("10/minute")
@router.get(
    "/branch-item-summary",
    response_model=BranchItemSummaryReport,
    summary="Branch item summary report",
    description="Item-wise billing summary for a branch over a date range with payment mode breakdown.",
)
async def branch_item_summary_report(
    request: Request,
    background_tasks: BackgroundTasks,
    date_from: datetime.date = Query(...),
    date_to: datetime.date = Query(...),
    branch_id: int | None = Query(None),
    route_id: int | None = Query(None),
    payment_mode_id: int | None = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(_report_roles),
):
    route_id, branch_id = await _scope_route_and_branch(db, current_user, route_id, branch_id)
    date_from = clamp_date_from(date_from, current_user.role)
    date_to = clamp_date_to(date_to, current_user.role)
    _log_report(background_tasks, current_user, "branch_item_summary", False, date_from=date_from, date_to=date_to, branch_id=branch_id, route_id=route_id, payment_mode_id=payment_mode_id)
    return await report_service.get_branch_item_summary(db, date_from, date_to, branch_id, route_id, payment_mode_id)


# ---------------------------------------------------------------------------
# PDF Download Endpoints
# ---------------------------------------------------------------------------


@limiter.limit("10/minute")
@router.get(
    "/date-wise-amount/pdf",
    summary="Date wise amount summary PDF",
    description="Download the Date Wise Amount Summary report as a PDF file.",
)
async def get_date_wise_amount_pdf(
    request: Request,
    background_tasks: BackgroundTasks,
    date_from: datetime.date = Query(...),
    date_to: datetime.date = Query(...),
    branch_id: int | None = Query(None),
    route_id: int | None = Query(None),
    payment_mode_id: int | None = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(_report_roles),
):
    route_id, branch_id = await _scope_route_and_branch(db, current_user, route_id, branch_id)
    date_from = clamp_date_from(date_from, current_user.role)
    date_to = clamp_date_to(date_to, current_user.role)
    data = await report_service.get_date_wise_amount(db, date_from, date_to, branch_id, payment_mode_id=payment_mode_id, route_id=route_id)
    pdf_buf = pdf_service.generate_date_wise_amount_pdf(data)
    _log_report(background_tasks, current_user, "date_wise_amount", True, date_from=date_from, date_to=date_to, branch_id=branch_id, route_id=route_id, payment_mode_id=payment_mode_id)
    return StreamingResponse(
        pdf_buf,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=date_wise_amount_{date_from}_{date_to}.pdf"},
    )


@limiter.limit("10/minute")
@router.get(
    "/ferry-wise-item/pdf",
    summary="Ferry wise item summary PDF",
    description="Download the Ferry Wise Item Summary report as a PDF file.",
)
async def get_ferry_wise_item_pdf(
    request: Request,
    background_tasks: BackgroundTasks,
    date: datetime.date = Query(...),
    branch_id: int | None = Query(None),
    route_id: int | None = Query(None),
    payment_mode_id: int | None = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(_report_roles),
):
    route_id, branch_id = await _scope_route_and_branch(db, current_user, route_id, branch_id)
    date = clamp_single_date(date, current_user.role)
    data = await report_service.get_ferry_wise_item_summary(db, date, branch_id, payment_mode_id=payment_mode_id, route_id=route_id)
    pdf_buf = pdf_service.generate_ferry_wise_item_pdf(data)
    _log_report(background_tasks, current_user, "ferry_wise_item", True, date=date, branch_id=branch_id, route_id=route_id, payment_mode_id=payment_mode_id)
    return StreamingResponse(
        pdf_buf,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=ferry_wise_item_{date}.pdf"},
    )


@limiter.limit("10/minute")
@router.get(
    "/itemwise-levy/pdf",
    summary="Itemwise levy summary PDF",
    description="Download the Itemwise Levy Summary report as a PDF file.",
)
async def get_itemwise_levy_pdf(
    request: Request,
    background_tasks: BackgroundTasks,
    date_from: datetime.date = Query(...),
    date_to: datetime.date = Query(...),
    branch_id: int | None = Query(None),
    route_id: int | None = Query(None),
    payment_mode_id: int | None = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(_report_roles),
):
    route_id, branch_id = await _scope_route_and_branch(db, current_user, route_id, branch_id)
    date_from = clamp_date_from(date_from, current_user.role)
    date_to = clamp_date_to(date_to, current_user.role)
    data = await report_service.get_item_wise_summary(db, date_from, date_to, branch_id, route_id, payment_mode_id)
    pdf_buf = pdf_service.generate_item_wise_summary_pdf(data)
    _log_report(background_tasks, current_user, "itemwise_levy", True, date_from=date_from, date_to=date_to, branch_id=branch_id, route_id=route_id, payment_mode_id=payment_mode_id)
    return StreamingResponse(
        pdf_buf,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=itemwise_levy_{date_from}_{date_to}.pdf"},
    )


@limiter.limit("10/minute")
@router.get(
    "/payment-mode/pdf",
    summary="Payment mode summary PDF",
    description="Download the Payment Mode Wise Summary report as a PDF file.",
)
async def get_payment_mode_pdf(
    request: Request,
    background_tasks: BackgroundTasks,
    date_from: datetime.date = Query(...),
    date_to: datetime.date = Query(...),
    branch_id: int | None = Query(None),
    route_id: int | None = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(_report_roles),
):
    route_id, branch_id = await _scope_route_and_branch(db, current_user, route_id, branch_id)
    date_from = clamp_date_from(date_from, current_user.role)
    date_to = clamp_date_to(date_to, current_user.role)
    data = await report_service.get_payment_mode_report(db, date_from, date_to, branch_id, route_id)
    pdf_buf = pdf_service.generate_payment_mode_pdf(data)
    _log_report(background_tasks, current_user, "payment_mode", True, date_from=date_from, date_to=date_to, branch_id=branch_id, route_id=route_id)
    return StreamingResponse(
        pdf_buf,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=payment_mode_{date_from}_{date_to}.pdf"},
    )


@limiter.limit("10/minute")
@router.get(
    "/ticket-details",
    response_model=TicketDetailsReport,
    summary="Ticket details report",
    description="Detailed ticket list for a single date with boat name and payment mode.",
)
async def ticket_details_report(
    request: Request,
    background_tasks: BackgroundTasks,
    date: datetime.date = Query(...),
    branch_id: int | None = Query(None),
    route_id: int | None = Query(None),
    payment_mode_id: int | None = Query(None),
    boat_id: int | None = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(_report_roles),
):
    route_id, branch_id = await _scope_route_and_branch(db, current_user, route_id, branch_id)
    date = clamp_single_date(date, current_user.role)
    _log_report(background_tasks, current_user, "ticket_details", False, date=date, branch_id=branch_id, route_id=route_id, payment_mode_id=payment_mode_id, boat_id=boat_id)
    return await report_service.get_ticket_details_report(db, date, branch_id, route_id, payment_mode_id, boat_id)


@limiter.limit("10/minute")
@router.get(
    "/ticket-details/pdf",
    summary="Ticket details PDF",
    description="Download the Ticket Details report as a PDF file.",
)
async def get_ticket_details_pdf(
    request: Request,
    background_tasks: BackgroundTasks,
    date: datetime.date = Query(...),
    branch_id: int | None = Query(None),
    route_id: int | None = Query(None),
    payment_mode_id: int | None = Query(None),
    boat_id: int | None = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(_report_roles),
):
    route_id, branch_id = await _scope_route_and_branch(db, current_user, route_id, branch_id)
    date = clamp_single_date(date, current_user.role)
    data = await report_service.get_ticket_details_report(db, date, branch_id, route_id, payment_mode_id, boat_id)
    pdf_buf = pdf_service.generate_ticket_details_pdf(data)
    _log_report(background_tasks, current_user, "ticket_details", True, date=date, branch_id=branch_id, route_id=route_id, payment_mode_id=payment_mode_id, boat_id=boat_id)
    return StreamingResponse(
        pdf_buf,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=ticket_details_{date}.pdf"},
    )


@limiter.limit("10/minute")
@router.get(
    "/user-wise-summary/pdf",
    summary="User wise daily summary PDF",
    description="Download the User Wise Daily Cash Summary report as a PDF file.",
)
async def get_user_wise_summary_pdf(
    request: Request,
    background_tasks: BackgroundTasks,
    date: datetime.date = Query(...),
    branch_id: int | None = Query(None),
    route_id: int | None = Query(None),
    payment_mode_id: int | None = Query(None),
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
    date = clamp_single_date(date, current_user.role)
    data = await report_service.get_user_wise_summary(db, date, branch_id, route_id, user_id, payment_mode_id)
    pdf_buf = pdf_service.generate_user_wise_summary_pdf(data)
    _log_report(background_tasks, current_user, "user_wise_summary", True, date=date, branch_id=branch_id, route_id=route_id, payment_mode_id=payment_mode_id, user_id=user_id)
    return StreamingResponse(
        pdf_buf,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=user_wise_summary_{date}.pdf"},
    )


@limiter.limit("10/minute")
@router.get(
    "/vehicle-wise-tickets/pdf",
    summary="Vehicle wise ticket details PDF",
    description="Download the Vehicle Wise Ticket Details report as a PDF file.",
)
async def get_vehicle_wise_tickets_pdf(
    request: Request,
    background_tasks: BackgroundTasks,
    date: datetime.date = Query(...),
    branch_id: int | None = Query(None),
    route_id: int | None = Query(None),
    payment_mode_id: int | None = Query(None),
    boat_id: int | None = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(_report_roles),
):
    route_id, branch_id = await _scope_route_and_branch(db, current_user, route_id, branch_id)
    date = clamp_single_date(date, current_user.role)
    data = await report_service.get_vehicle_wise_tickets(db, date, branch_id, route_id, payment_mode_id, boat_id)
    pdf_buf = pdf_service.generate_vehicle_wise_tickets_pdf(data)
    _log_report(background_tasks, current_user, "vehicle_wise_tickets", True, date=date, branch_id=branch_id, route_id=route_id, payment_mode_id=payment_mode_id, boat_id=boat_id)
    return StreamingResponse(
        pdf_buf,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=vehicle_wise_tickets_{date}.pdf"},
    )


@limiter.limit("10/minute")
@router.get(
    "/branch-summary/pdf",
    summary="Branch summary PDF",
    description="Download the Branch Summary report as a PDF file.",
)
async def get_branch_summary_pdf(
    request: Request,
    background_tasks: BackgroundTasks,
    date_from: datetime.date = Query(...),
    date_to: datetime.date = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(_report_roles),
):
    branch_ids: list[int] | None = None
    if needs_route_scope(current_user):
        if not current_user.route_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No route assigned. Contact admin to set your route.",
            )
        b1, b2 = await get_route_branch_ids(db, current_user.route_id)
        if current_user.role == UserRole.BILLING_OPERATOR:
            if not current_user.active_branch_id:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="No branch selected. Please log out and log back in to select your branch.",
                )
            branch_ids = [current_user.active_branch_id]
        else:
            branch_ids = [b1, b2]
    date_from = clamp_date_from(date_from, current_user.role)
    date_to = clamp_date_to(date_to, current_user.role)
    data = await report_service.get_branch_summary_report(db, date_from, date_to, branch_ids=branch_ids)
    pdf_buf = pdf_service.generate_branch_summary_pdf(data)
    _log_report(background_tasks, current_user, "branch_summary", True, date_from=date_from, date_to=date_to)
    return StreamingResponse(
        pdf_buf,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=branch_summary_{date_from}_{date_to}.pdf"},
    )


@limiter.limit("10/minute")
@router.get(
    "/branch-item-summary/pdf",
    summary="Branch item summary PDF",
    description="Download the Branch Item Summary report as a PDF file.",
)
async def get_branch_item_summary_pdf(
    request: Request,
    background_tasks: BackgroundTasks,
    date_from: datetime.date = Query(...),
    date_to: datetime.date = Query(...),
    branch_id: int | None = Query(None),
    route_id: int | None = Query(None),
    payment_mode_id: int | None = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(_report_roles),
):
    route_id, branch_id = await _scope_route_and_branch(db, current_user, route_id, branch_id)
    date_from = clamp_date_from(date_from, current_user.role)
    date_to = clamp_date_to(date_to, current_user.role)
    data = await report_service.get_branch_item_summary(db, date_from, date_to, branch_id, route_id, payment_mode_id)
    pdf_buf = pdf_service.generate_branch_item_summary_pdf(data)
    _log_report(background_tasks, current_user, "branch_item_summary", True, date_from=date_from, date_to=date_to, branch_id=branch_id, route_id=route_id, payment_mode_id=payment_mode_id)
    return StreamingResponse(
        pdf_buf,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=branch_item_summary_{date_from}_{date_to}.pdf"},
    )
