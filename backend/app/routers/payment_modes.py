from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import require_roles
from app.core.rbac import UserRole
from app.schemas.payment_mode import PaymentModeCreate, PaymentModeRead, PaymentModeUpdate
from app.services import payment_mode_service

router = APIRouter(prefix="/api/payment-modes", tags=["Payment Modes"])

# Payment mode listing is accessible to BILLING_OPERATOR too (for ticket form dropdowns)
_payment_mode_read_roles = require_roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER, UserRole.BILLING_OPERATOR)
_payment_mode_roles = require_roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER)


@router.get(
    "",
    response_model=list[PaymentModeRead],
    summary="List all payment modes",
    description="Paginated list of all payment modes. Requires **Super Admin**, **Admin**, or **Manager** role.",
    responses={
        200: {"description": "List of payment modes returned"},
        401: {"description": "Not authenticated"},
        403: {"description": "Insufficient role permissions"},
    },
)
async def list_payment_modes(
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(5, ge=1, le=200, description="Maximum number of records to return"),
    sort_by: str = Query("id", description="Column to sort by (id, description, is_active)"),
    sort_order: str = Query("asc", description="Sort direction (asc or desc)"),
    search: str | None = Query(None, description="Search by description (case-insensitive)"),
    search_column: str = Query("all", description="Column to search: all or description"),
    match_type: str = Query("contains", description="Match type: contains, starts_with, or ends_with"),
    id_filter: int | None = Query(None, ge=1, description="Filter by payment mode ID (or range start for between)"),
    id_op: str = Query("eq", description="ID comparison operator: eq, lt, gt, or between"),
    id_filter_end: int | None = Query(None, ge=1, description="Range end for between operator"),
    status: str | None = Query(None, description="Filter by status: active, inactive, or all (default all)"),
    db: AsyncSession = Depends(get_db),
    _=Depends(_payment_mode_read_roles),
):
    return await payment_mode_service.get_all_payment_modes(db, skip, limit, sort_by, sort_order, search, status, search_column, match_type, id_filter, id_op, id_filter_end)


@router.get(
    "/count",
    response_model=int,
    summary="Get total payment mode count",
    description="Returns the total number of payment modes. Requires **Super Admin**, **Admin**, **Manager**, or **Billing Operator** role.",
    responses={
        200: {"description": "Total count returned"},
        401: {"description": "Not authenticated"},
        403: {"description": "Insufficient role permissions"},
    },
)
async def count_payment_modes(
    search: str | None = Query(None, description="Search by description (case-insensitive)"),
    search_column: str = Query("all", description="Column to search: all or description"),
    match_type: str = Query("contains", description="Match type: contains, starts_with, or ends_with"),
    id_filter: int | None = Query(None, ge=1, description="Filter by payment mode ID (or range start for between)"),
    id_op: str = Query("eq", description="ID comparison operator: eq, lt, gt, or between"),
    id_filter_end: int | None = Query(None, ge=1, description="Range end for between operator"),
    status: str | None = Query(None, description="Filter by status: active, inactive, or all (default all)"),
    db: AsyncSession = Depends(get_db),
    _=Depends(_payment_mode_read_roles),
):
    return await payment_mode_service.count_payment_modes(db, search, status, search_column, match_type, id_filter, id_op, id_filter_end)


@router.post(
    "",
    response_model=PaymentModeRead,
    status_code=201,
    summary="Create a new payment mode",
    description="Add a new payment mode to the system. Requires **Super Admin** or **Admin** role.",
    responses={
        201: {"description": "Payment mode created successfully"},
        401: {"description": "Not authenticated"},
        403: {"description": "Insufficient role permissions"},
        409: {"description": "Payment mode description already exists"},
    },
)
async def create_payment_mode(
    body: PaymentModeCreate,
    db: AsyncSession = Depends(get_db),
    _=Depends(require_roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)),
):
    return await payment_mode_service.create_payment_mode(db, body)


@router.get(
    "/{payment_mode_id}",
    response_model=PaymentModeRead,
    summary="Get payment mode by ID",
    description="Fetch a single payment mode by its ID. Requires **Super Admin**, **Admin**, or **Manager** role.",
    responses={
        200: {"description": "Payment mode details returned"},
        401: {"description": "Not authenticated"},
        403: {"description": "Insufficient role permissions"},
        404: {"description": "Payment mode not found"},
    },
)
async def get_payment_mode(
    payment_mode_id: int,
    db: AsyncSession = Depends(get_db),
    _=Depends(_payment_mode_roles),
):
    return await payment_mode_service.get_payment_mode_by_id(db, payment_mode_id)


@router.patch(
    "/{payment_mode_id}",
    response_model=PaymentModeRead,
    summary="Update payment mode details",
    description="Partially update a payment mode's information. Set `is_active=false` to soft-delete. Requires **Super Admin** or **Admin** role.",
    responses={
        200: {"description": "Payment mode updated successfully"},
        401: {"description": "Not authenticated"},
        403: {"description": "Insufficient role permissions"},
        404: {"description": "Payment mode not found"},
        409: {"description": "Payment mode description already exists"},
    },
)
async def update_payment_mode(
    payment_mode_id: int,
    body: PaymentModeUpdate,
    db: AsyncSession = Depends(get_db),
    _=Depends(require_roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)),
):
    return await payment_mode_service.update_payment_mode(db, payment_mode_id, body)
