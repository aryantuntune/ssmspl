from datetime import date

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request, status
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import require_roles
from app.core.rbac import UserRole
from app.core.data_cutoff import clamp_date_from, clamp_date_to, is_before_cutoff
from app.core.route_scope import needs_route_scope, get_route_branch_ids
from app.core.timezone import today_ist
from app.middleware.rate_limit import limiter
from app.models.user import User
from app.schemas.ticket import (
    TicketCreate, TicketRead, TicketUpdate, RateLookupResponse,
    MultiTicketCreate, MultiTicketInitResponse, TicketingStatusResponse,
)
from app.services import ticket_service
from app.services.activity_log_service import log_activity, ActivityAction
from app.services.qr_service import generate_qr_png

router = APIRouter(prefix="/api/tickets", tags=["Tickets"])

# Ticketing is accessible to SUPER_ADMIN, ADMIN, MANAGER, BILLING_OPERATOR
_ticket_roles = require_roles(
    UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER, UserRole.BILLING_OPERATOR
)


@limiter.limit("30/minute")
@router.get(
    "",
    response_model=list[TicketRead],
    summary="List all tickets",
    description="Paginated list of tickets. Requires **Super Admin**, **Admin**, **Manager**, or **Billing Operator** role.",
    responses={
        200: {"description": "List of tickets returned"},
        401: {"description": "Not authenticated"},
        403: {"description": "Insufficient role permissions"},
    },
)
async def list_tickets(
    request: Request,
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(5, ge=1, le=5000, description="Maximum number of records to return"),
    sort_by: str = Query("id", description="Column to sort by (id, ticket_no, ticket_date, branch_id, route_id, amount, net_amount, is_cancelled)"),
    sort_order: str = Query("desc", description="Sort direction (asc or desc)"),
    status: str | None = Query(None, description="Filter by status: active, cancelled, or all (default all)"),
    branch_filter: int | None = Query(None, description="Filter by branch ID"),
    route_filter: int | None = Query(None, description="Filter by route ID"),
    date_from: date | None = Query(None, description="Filter tickets from this date"),
    date_to: date | None = Query(None, description="Filter tickets to this date"),
    id_filter: int | None = Query(None, ge=1, description="Filter by ticket ID"),
    id_op: str = Query("eq", description="ID comparison operator: eq, lt, gt, or between"),
    id_filter_end: int | None = Query(None, ge=1, description="Range end for between operator"),
    ticket_no_filter: int | None = Query(None, description="Filter by ticket number"),
    is_multi_ticket: bool | None = Query(None, description="Filter: true=multi-tickets only, false=normal only, omit=all"),
    include_items: bool = Query(False, description="Embed each ticket's items[] in the response (batch-loaded)"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(_ticket_roles),
):
    # Force route scoping for non-admin roles
    if needs_route_scope(current_user):
        route_filter = current_user.route_id
    # Billing operators: force branch to active session branch + today only
    if current_user.role == UserRole.BILLING_OPERATOR:
        if not current_user.active_branch_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No branch selected. Please log out and log back in to select your branch.",
            )
        today = today_ist()
        date_from = today
        date_to = today
        branch_filter = current_user.active_branch_id
    # Data cutoff: clamp dates for non-SUPER_ADMIN
    date_from = clamp_date_from(date_from, current_user.role)
    date_to = clamp_date_to(date_to, current_user.role)
    return await ticket_service.get_all_tickets(
        db, skip, limit, sort_by, sort_order,
        status, branch_filter, route_filter, date_from, date_to,
        id_filter, id_op, id_filter_end, ticket_no_filter,
        is_multi_ticket,
        include_items=include_items,
    )


@router.get(
    "/count",
    response_model=int,
    summary="Get total ticket count",
    description="Returns the total number of tickets matching filters.",
    responses={
        200: {"description": "Total count returned"},
        401: {"description": "Not authenticated"},
        403: {"description": "Insufficient role permissions"},
    },
)
async def count_tickets(
    status: str | None = Query(None, description="Filter by status: active, cancelled, or all"),
    branch_filter: int | None = Query(None, description="Filter by branch ID"),
    route_filter: int | None = Query(None, description="Filter by route ID"),
    date_from: date | None = Query(None, description="Filter tickets from this date"),
    date_to: date | None = Query(None, description="Filter tickets to this date"),
    id_filter: int | None = Query(None, ge=1, description="Filter by ticket ID"),
    id_op: str = Query("eq", description="ID comparison operator"),
    id_filter_end: int | None = Query(None, ge=1, description="Range end for between operator"),
    ticket_no_filter: int | None = Query(None, description="Filter by ticket number"),
    is_multi_ticket: bool | None = Query(None, description="Filter: true=multi-tickets only, false=normal only, omit=all"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(_ticket_roles),
):
    # Force route scoping for non-admin roles
    if needs_route_scope(current_user):
        route_filter = current_user.route_id
    # Billing operators: force branch to active session branch + today only
    if current_user.role == UserRole.BILLING_OPERATOR:
        if not current_user.active_branch_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No branch selected. Please log out and log back in to select your branch.",
            )
        today = today_ist()
        date_from = today
        date_to = today
        branch_filter = current_user.active_branch_id
    # Data cutoff: clamp dates for non-SUPER_ADMIN
    date_from = clamp_date_from(date_from, current_user.role)
    date_to = clamp_date_to(date_to, current_user.role)
    return await ticket_service.count_tickets(
        db, status, branch_filter, route_filter, date_from, date_to,
        id_filter, id_op, id_filter_end, ticket_no_filter,
        is_multi_ticket,
    )


@router.get(
    "/rate-lookup",
    response_model=RateLookupResponse,
    summary="Look up current rate for an item + route",
    description="Returns the latest applicable rate and levy for the given item and route.",
    responses={
        200: {"description": "Rate and levy returned"},
        404: {"description": "No active rate found"},
    },
)
async def rate_lookup(
    item_id: int = Query(..., description="Item ID"),
    route_id: int = Query(..., description="Route ID"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(_ticket_roles),
):
    if needs_route_scope(current_user) and current_user.route_id:
        if route_id != current_user.route_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Route not assigned to you")
    return await ticket_service.get_current_rate(db, item_id, route_id)


@router.get(
    "/departure-options",
    summary="Get departure times for a branch",
    description="Returns previous, current, and next ferry departure for the given branch relative to server time.",
    responses={
        200: {"description": "Departure options with recommended selection"},
    },
)
async def departure_options(
    branch_id: int = Query(..., description="Branch ID"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(_ticket_roles),
):
    if needs_route_scope(current_user) and current_user.route_id:
        b1, b2 = await get_route_branch_ids(db, current_user.route_id)
        if branch_id not in (b1, b2):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Branch not in your assigned route")
    return await ticket_service.get_departure_options(db, branch_id)


@router.get(
    "/ticketing-status",
    response_model=TicketingStatusResponse,
    summary="Get ticketing screen lock status for a branch",
    description="Returns whether normal and multi-ticketing screens are open or locked based on ferry schedule times. SUPER_ADMIN and ADMIN always get both open.",
)
async def ticketing_status(
    branch_id: int = Query(..., description="Branch ID to check status for"),
    route_id: int | None = Query(None, description="Route ID — used to check multi_ticketing_enabled"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(_ticket_roles),
):
    # SUPER_ADMIN / ADMIN bypass all locks
    if current_user.role in (UserRole.SUPER_ADMIN, UserRole.ADMIN):
        import datetime
        from app.services.ticket_service import IST
        now = datetime.datetime.now(IST).time()
        return {
            "normal_ticketing_open": True,
            "multi_ticketing_open": True,
            "first_ferry_time": None,
            "last_ferry_time": None,
            "normal_opens_at": None,
            "normal_closes_at": None,
            "multi_opens_at": None,
            "current_time": now.strftime("%H:%M:%S"),
        }
    return await ticket_service.get_ticketing_status(db, branch_id, route_id=route_id)


@router.get(
    "/multi-ticket-init",
    response_model=MultiTicketInitResponse,
    summary="Get multi-ticket form initialization data",
    description="Returns route, branch, items with rates, payment modes, and ferry time window for the logged-in user.",
    responses={
        200: {"description": "Form initialization data returned"},
        400: {"description": "User has no assigned route"},
        401: {"description": "Not authenticated"},
        403: {"description": "Insufficient role permissions"},
    },
)
async def multi_ticket_init(
    branch_id: int | None = Query(None, description="Operating branch ID. Defaults to route's branch_id_one."),
    route_id: int | None = Query(None, description="Route ID (for admins without assigned route)."),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(_ticket_roles),
):
    return await ticket_service.get_multi_ticket_init(db, current_user, branch_id, route_id=route_id)


@router.post(
    "/batch",
    response_model=list[TicketRead],
    status_code=201,
    summary="Create multiple tickets in a single transaction",
    description="Creates all provided tickets atomically. Only available outside ferry schedule hours.",
    responses={
        201: {"description": "All tickets created successfully"},
        400: {"description": "Validation error, amount mismatch, or not off-hours"},
        401: {"description": "Not authenticated"},
        403: {"description": "Insufficient role permissions"},
        404: {"description": "Referenced entity not found"},
    },
)
async def create_multi_tickets(
    body: MultiTicketCreate,
    background_tasks: BackgroundTasks,
    branch_id: int | None = Query(None, description="Operating branch ID. Defaults to route's branch_id_one."),
    route_id: int | None = Query(None, description="Route ID (for admins without assigned route)."),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(_ticket_roles),
):
    skip_time_check = current_user.role in (UserRole.SUPER_ADMIN, UserRole.ADMIN)
    result = await ticket_service.create_multi_tickets(
        db, body, current_user, branch_id,
        route_id=route_id, skip_time_check=skip_time_check,
    )
    background_tasks.add_task(
        log_activity, current_user.active_session_id, current_user.id,
        ActivityAction.TICKET_BATCH,
        {"ticket_count": len(result), "branch_id": result[0]["branch_id"] if result else None},
    )
    return result


@router.post(
    "",
    response_model=TicketRead,
    status_code=201,
    summary="Create a new ticket",
    description="Create a ticket with items. Ticket number is auto-generated per branch. Requires **Super Admin**, **Admin**, **Manager**, or **Billing Operator** role.",
    responses={
        201: {"description": "Ticket created successfully"},
        400: {"description": "Amount mismatch or validation error"},
        401: {"description": "Not authenticated"},
        403: {"description": "Insufficient role permissions"},
        404: {"description": "Referenced entity not found"},
    },
)
async def create_ticket(
    body: TicketCreate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(_ticket_roles),
):
    # BILLING_OPERATOR: force branch_id to their active session branch
    if current_user.role == UserRole.BILLING_OPERATOR:
        if not current_user.active_branch_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No branch selected. Please log out and log back in to select your branch.",
            )
        body.branch_id = current_user.active_branch_id
    # Scoped users: validate branch belongs to their route
    if needs_route_scope(current_user) and current_user.route_id:
        b1, b2 = await get_route_branch_ids(db, current_user.route_id)
        if body.branch_id not in (b1, b2):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Branch does not belong to your assigned route.",
            )
    # Time-lock: non-admin roles can only create normal tickets during normal-ticketing hours
    if current_user.role not in (UserRole.SUPER_ADMIN, UserRole.ADMIN):
        await ticket_service._validate_normal_hours(db, body.branch_id, route_id=current_user.route_id)
    result = await ticket_service.create_ticket(db, body, user_id=current_user.id)
    background_tasks.add_task(
        log_activity, current_user.active_session_id, current_user.id,
        ActivityAction.TICKET_CREATE,
        {"ticket_id": str(result["id"]), "ticket_no": result["ticket_no"], "branch_id": result["branch_id"]},
    )
    return result


@router.get(
    "/{ticket_id}/qr",
    summary="Get QR code image for a ticket",
    description="Returns a PNG QR code image for the ticket's verification code.",
    responses={
        200: {"description": "QR code PNG image", "content": {"image/png": {}}},
        404: {"description": "Ticket not found or has no verification code"},
    },
)
async def get_ticket_qr(
    ticket_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(_ticket_roles),
):
    ticket_data = await ticket_service.get_ticket_by_id(db, ticket_id)
    if is_before_cutoff(ticket_data.get("ticket_date"), current_user.role):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found")
    if needs_route_scope(current_user) and current_user.route_id:
        if ticket_data.get("route_id") != current_user.route_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Ticket not in your assigned route")
    verification_code = ticket_data.get("verification_code")
    if not verification_code:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Ticket has no verification code",
        )
    png_bytes = generate_qr_png(verification_code)
    return Response(content=png_bytes, media_type="image/png")


@router.get(
    "/{ticket_id}",
    response_model=TicketRead,
    summary="Get ticket by ID",
    description="Fetch a single ticket with its items by ID.",
    responses={
        200: {"description": "Ticket details with items returned"},
        401: {"description": "Not authenticated"},
        403: {"description": "Insufficient role permissions"},
        404: {"description": "Ticket not found"},
    },
)
async def get_ticket(
    ticket_id: int,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(_ticket_roles),
):
    ticket_data = await ticket_service.get_ticket_by_id(db, ticket_id)
    if is_before_cutoff(ticket_data.get("ticket_date"), current_user.role):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found")
    if needs_route_scope(current_user) and current_user.route_id:
        if ticket_data.get("route_id") != current_user.route_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Ticket not in your assigned route")
    background_tasks.add_task(
        log_activity, current_user.active_session_id, current_user.id,
        ActivityAction.TICKET_VIEW,
        {"ticket_id": str(ticket_id)},
    )
    return ticket_data


@router.patch(
    "/{ticket_id}",
    response_model=TicketRead,
    summary="Update ticket",
    description="Update a ticket and its items. Set `is_cancelled=true` to cancel. Items can be added, updated, or cancelled.",
    responses={
        200: {"description": "Ticket updated successfully"},
        400: {"description": "Amount mismatch, validation error, or ticket already cancelled"},
        401: {"description": "Not authenticated"},
        403: {"description": "Insufficient role permissions"},
        404: {"description": "Ticket or referenced entity not found"},
    },
)
async def update_ticket(
    ticket_id: int,
    body: TicketUpdate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(_ticket_roles),
):
    existing = await ticket_service.get_ticket_by_id(db, ticket_id)
    if is_before_cutoff(existing.get("ticket_date"), current_user.role):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found")
    if needs_route_scope(current_user) and current_user.route_id:
        if existing.get("route_id") != current_user.route_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Ticket not in your assigned route")
    result = await ticket_service.update_ticket(db, ticket_id, body)
    if body.is_cancelled:
        background_tasks.add_task(
            log_activity, current_user.active_session_id, current_user.id,
            ActivityAction.TICKET_CANCEL,
            {"ticket_id": str(ticket_id)},
        )
    return result
