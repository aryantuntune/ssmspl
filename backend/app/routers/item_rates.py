from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import require_roles
from app.core.rbac import UserRole
from app.schemas.item_rate import BulkUpcomingRequest, ItemRateCreate, ItemRateRead, ItemRateUpdate
from app.services import item_rate_service

router = APIRouter(prefix="/api/item-rates", tags=["Item Rates"])

_item_rate_roles = require_roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER)


@router.get(
    "",
    response_model=list[ItemRateRead],
    summary="List all item rates",
    description="Paginated list of all item rates with item and route names. Requires **Super Admin**, **Admin**, or **Manager** role.",
    responses={
        200: {"description": "List of item rates returned"},
        401: {"description": "Not authenticated"},
        403: {"description": "Insufficient role permissions"},
    },
)
async def list_item_rates(
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(5, ge=1, le=200, description="Maximum number of records to return"),
    sort_by: str = Query("id", description="Column to sort by (id, applicable_from_date, levy, rate, item_id, route_id, is_active)"),
    sort_order: str = Query("asc", description="Sort direction (asc or desc)"),
    item_filter: int | None = Query(None, ge=1, description="Filter by item ID"),
    route_filter: int | None = Query(None, ge=1, description="Filter by route ID"),
    id_filter: int | None = Query(None, ge=1, description="Filter by item rate ID (or range start for between)"),
    id_op: str = Query("eq", description="ID comparison operator: eq, lt, gt, or between"),
    id_filter_end: int | None = Query(None, ge=1, description="Range end for between operator"),
    status: str | None = Query(None, description="Filter by status: active, inactive, or all (default all)"),
    from_date: date | None = Query(None, description="Return rates where applicable_from_date <= this date (YYYY-MM-DD). Excludes null dates."),
    db: AsyncSession = Depends(get_db),
    _=Depends(_item_rate_roles),
):
    return await item_rate_service.get_all_item_rates(db, skip, limit, sort_by, sort_order, status, item_filter, route_filter, id_filter, id_op, id_filter_end, from_date)


@router.get(
    "/count",
    response_model=int,
    summary="Get total item rate count",
    description="Returns the total number of item rates. Requires **Super Admin**, **Admin**, or **Manager** role.",
    responses={
        200: {"description": "Total count returned"},
        401: {"description": "Not authenticated"},
        403: {"description": "Insufficient role permissions"},
    },
)
async def count_item_rates(
    item_filter: int | None = Query(None, ge=1, description="Filter by item ID"),
    route_filter: int | None = Query(None, ge=1, description="Filter by route ID"),
    id_filter: int | None = Query(None, ge=1, description="Filter by item rate ID (or range start for between)"),
    id_op: str = Query("eq", description="ID comparison operator: eq, lt, gt, or between"),
    id_filter_end: int | None = Query(None, ge=1, description="Range end for between operator"),
    status: str | None = Query(None, description="Filter by status: active, inactive, or all (default all)"),
    from_date: date | None = Query(None, description="Return rates where applicable_from_date <= this date (YYYY-MM-DD). Excludes null dates."),
    db: AsyncSession = Depends(get_db),
    _=Depends(_item_rate_roles),
):
    return await item_rate_service.count_item_rates(db, status, item_filter, route_filter, id_filter, id_op, id_filter_end, from_date)


@router.post(
    "",
    response_model=ItemRateRead,
    status_code=201,
    summary="Create a new item rate",
    description="Add a new item rate for a specific item and route. Requires **Super Admin** or **Admin** role.",
    responses={
        201: {"description": "Item rate created successfully"},
        401: {"description": "Not authenticated"},
        403: {"description": "Insufficient role permissions"},
        404: {"description": "Item or route not found"},
        409: {"description": "Duplicate item rate (same item, route, and date)"},
    },
)
async def create_item_rate(
    body: ItemRateCreate,
    db: AsyncSession = Depends(get_db),
    _=Depends(require_roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)),
):
    return await item_rate_service.create_item_rate(db, body)


@router.post(
    "/bulk-upcoming",
    status_code=201,
    summary="Bulk-create item rates for an upcoming date",
    description="Duplicates all active item rates with a new applicable_from_date. Skips combos that already exist for that date. Requires **Super Admin** or **Admin** role.",
    responses={
        201: {"description": "Item rates created, returns count"},
        400: {"description": "No active item rates to duplicate"},
        401: {"description": "Not authenticated"},
        403: {"description": "Insufficient role permissions"},
        409: {"description": "All active rates already have entries for this date"},
    },
)
async def bulk_upcoming(
    body: BulkUpcomingRequest,
    db: AsyncSession = Depends(get_db),
    _=Depends(require_roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)),
):
    count = await item_rate_service.bulk_create_for_upcoming_date(db, body.applicable_from_date)
    return {"created": count}


@router.get(
    "/{item_rate_id}",
    response_model=ItemRateRead,
    summary="Get item rate by ID",
    description="Fetch a single item rate by its ID. Requires **Super Admin**, **Admin**, or **Manager** role.",
    responses={
        200: {"description": "Item rate details returned"},
        401: {"description": "Not authenticated"},
        403: {"description": "Insufficient role permissions"},
        404: {"description": "Item rate not found"},
    },
)
async def get_item_rate(
    item_rate_id: int,
    db: AsyncSession = Depends(get_db),
    _=Depends(_item_rate_roles),
):
    return await item_rate_service.get_item_rate_by_id(db, item_rate_id)


@router.patch(
    "/{item_rate_id}",
    response_model=ItemRateRead,
    summary="Update item rate details",
    description="Partially update an item rate. Set `is_active=false` to soft-delete. Requires **Super Admin** or **Admin** role.",
    responses={
        200: {"description": "Item rate updated successfully"},
        401: {"description": "Not authenticated"},
        403: {"description": "Insufficient role permissions"},
        404: {"description": "Item rate, item, or route not found"},
        409: {"description": "Duplicate item rate (same item, route, and date)"},
    },
)
async def update_item_rate(
    item_rate_id: int,
    body: ItemRateUpdate,
    db: AsyncSession = Depends(get_db),
    _=Depends(require_roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)),
):
    return await item_rate_service.update_item_rate(db, item_rate_id, body)
