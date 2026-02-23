from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import require_roles
from app.core.rbac import UserRole
from app.models.user import User
from app.schemas.ticket import (
    TicketCreate, TicketRead, TicketUpdate, RateLookupResponse,
    MultiTicketCreate, MultiTicketInitResponse,
)
from app.services import ticket_service
from app.services.qr_service import generate_qr_png

router = APIRouter(prefix="/api/tickets", tags=["Tickets"])

# Ticketing is accessible to SUPER_ADMIN, ADMIN, MANAGER, BILLING_OPERATOR
_ticket_roles = require_roles(
    UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER, UserRole.BILLING_OPERATOR
)


@router.get(
    "/",
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
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(5, ge=1, le=200, description="Maximum number of records to return"),
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
    db: AsyncSession = Depends(get_db),
    _=Depends(_ticket_roles),
):
    return await ticket_service.get_all_tickets(
        db, skip, limit, sort_by, sort_order,
        status, branch_filter, route_filter, date_from, date_to,
        id_filter, id_op, id_filter_end, ticket_no_filter,
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
    db: AsyncSession = Depends(get_db),
    _=Depends(_ticket_roles),
):
    return await ticket_service.count_tickets(
        db, status, branch_filter, route_filter, date_from, date_to,
        id_filter, id_op, id_filter_end, ticket_no_filter,
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
    _=Depends(_ticket_roles),
):
    return await ticket_service.get_current_rate(db, item_id, route_id)


@router.get(
    "/departure-options",
    summary="Get departure times for a branch",
    description="Returns ferry schedules for the given branch with departure >= current time.",
    responses={
        200: {"description": "List of departure options"},
    },
)
async def departure_options(
    branch_id: int = Query(..., description="Branch ID"),
    db: AsyncSession = Depends(get_db),
    _=Depends(_ticket_roles),
):
    return await ticket_service.get_departure_options(db, branch_id)


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
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(_ticket_roles),
):
    return await ticket_service.get_multi_ticket_init(db, current_user)


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
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(_ticket_roles),
):
    return await ticket_service.create_multi_tickets(db, body, current_user)


@router.post(
    "/",
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
    db: AsyncSession = Depends(get_db),
    _=Depends(_ticket_roles),
):
    return await ticket_service.create_ticket(db, body)


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
    _=Depends(_ticket_roles),
):
    ticket_data = await ticket_service.get_ticket_by_id(db, ticket_id)
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
    db: AsyncSession = Depends(get_db),
    _=Depends(_ticket_roles),
):
    return await ticket_service.get_ticket_by_id(db, ticket_id)


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
    db: AsyncSession = Depends(get_db),
    _=Depends(_ticket_roles),
):
    return await ticket_service.update_ticket(db, ticket_id, body)
