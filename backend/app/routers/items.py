from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import require_roles
from app.core.rbac import UserRole
from app.schemas.item import ItemCreate, ItemRead, ItemUpdate
from app.services import item_service

router = APIRouter(prefix="/api/items", tags=["Items"])

# Item listing is accessible to BILLING_OPERATOR too (for ticket form dropdowns)
_item_read_roles = require_roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER, UserRole.BILLING_OPERATOR)
_item_roles = require_roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER)


@router.get(
    "/",
    response_model=list[ItemRead],
    summary="List all items",
    description="Paginated list of all items. Requires **Super Admin**, **Admin**, or **Manager** role.",
    responses={
        200: {"description": "List of items returned"},
        401: {"description": "Not authenticated"},
        403: {"description": "Insufficient role permissions"},
    },
)
async def list_items(
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(5, ge=1, le=200, description="Maximum number of records to return"),
    sort_by: str = Query("id", description="Column to sort by (id, name, short_name, online_visibility, is_vehicle, is_active)"),
    sort_order: str = Query("asc", description="Sort direction (asc or desc)"),
    search: str | None = Query(None, description="Search by item name or short name (case-insensitive)"),
    search_column: str = Query("all", description="Column to search: all, name, or short_name"),
    match_type: str = Query("contains", description="Match type: contains, starts_with, or ends_with"),
    id_filter: int | None = Query(None, ge=1, description="Filter by item ID (or range start for between)"),
    id_op: str = Query("eq", description="ID comparison operator: eq, lt, gt, or between"),
    id_filter_end: int | None = Query(None, ge=1, description="Range end for between operator"),
    status: str | None = Query(None, description="Filter by status: active, inactive, or all (default all)"),
    online_visibility: str | None = Query(None, description="Filter by online visibility: visible, hidden, or all (default all)"),
    is_vehicle: str | None = Query(None, description="Filter by vehicle type: yes, no, or all (default all)"),
    db: AsyncSession = Depends(get_db),
    _=Depends(_item_read_roles),
):
    return await item_service.get_all_items(db, skip, limit, sort_by, sort_order, search, status, search_column, match_type, id_filter, id_op, id_filter_end, online_visibility, is_vehicle)


@router.get(
    "/count",
    response_model=int,
    summary="Get total item count",
    description="Returns the total number of items. Requires **Super Admin**, **Admin**, **Manager**, or **Billing Operator** role.",
    responses={
        200: {"description": "Total count returned"},
        401: {"description": "Not authenticated"},
        403: {"description": "Insufficient role permissions"},
    },
)
async def count_items(
    search: str | None = Query(None, description="Search by item name or short name (case-insensitive)"),
    search_column: str = Query("all", description="Column to search: all, name, or short_name"),
    match_type: str = Query("contains", description="Match type: contains, starts_with, or ends_with"),
    id_filter: int | None = Query(None, ge=1, description="Filter by item ID (or range start for between)"),
    id_op: str = Query("eq", description="ID comparison operator: eq, lt, gt, or between"),
    id_filter_end: int | None = Query(None, ge=1, description="Range end for between operator"),
    status: str | None = Query(None, description="Filter by status: active, inactive, or all (default all)"),
    online_visibility: str | None = Query(None, description="Filter by online visibility: visible, hidden, or all (default all)"),
    is_vehicle: str | None = Query(None, description="Filter by vehicle type: yes, no, or all (default all)"),
    db: AsyncSession = Depends(get_db),
    _=Depends(_item_read_roles),
):
    return await item_service.count_items(db, search, status, search_column, match_type, id_filter, id_op, id_filter_end, online_visibility, is_vehicle)


@router.post(
    "/",
    response_model=ItemRead,
    status_code=201,
    summary="Create a new item",
    description="Add a new item to the system. Requires **Super Admin** or **Admin** role.",
    responses={
        201: {"description": "Item created successfully"},
        401: {"description": "Not authenticated"},
        403: {"description": "Insufficient role permissions"},
        409: {"description": "Item name or short name already exists"},
    },
)
async def create_item(
    body: ItemCreate,
    db: AsyncSession = Depends(get_db),
    _=Depends(require_roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)),
):
    return await item_service.create_item(db, body)


@router.get(
    "/{item_id}",
    response_model=ItemRead,
    summary="Get item by ID",
    description="Fetch a single item by its ID. Requires **Super Admin**, **Admin**, or **Manager** role.",
    responses={
        200: {"description": "Item details returned"},
        401: {"description": "Not authenticated"},
        403: {"description": "Insufficient role permissions"},
        404: {"description": "Item not found"},
    },
)
async def get_item(
    item_id: int,
    db: AsyncSession = Depends(get_db),
    _=Depends(_item_roles),
):
    return await item_service.get_item_by_id(db, item_id)


@router.patch(
    "/{item_id}",
    response_model=ItemRead,
    summary="Update item details",
    description="Partially update an item's information. Set `is_active=false` to soft-delete. Requires **Super Admin** or **Admin** role.",
    responses={
        200: {"description": "Item updated successfully"},
        401: {"description": "Not authenticated"},
        403: {"description": "Insufficient role permissions"},
        404: {"description": "Item not found"},
        409: {"description": "Item name or short name already exists"},
    },
)
async def update_item(
    item_id: int,
    body: ItemUpdate,
    db: AsyncSession = Depends(get_db),
    _=Depends(require_roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)),
):
    return await item_service.update_item(db, item_id, body)
