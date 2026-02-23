from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import require_roles
from app.core.rbac import UserRole
from app.schemas.boat import BoatCreate, BoatRead, BoatUpdate
from app.services import boat_service

router = APIRouter(prefix="/api/boats", tags=["Boats"])

# Ferry Management is accessible to SUPER_ADMIN, ADMIN, MANAGER
_ferry_roles = require_roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER)


@router.get(
    "",
    response_model=list[BoatRead],
    summary="List all boats",
    description="Paginated list of all active boats. Soft-deleted boats are excluded. Requires **Super Admin**, **Admin**, or **Manager** role.",
    responses={
        200: {"description": "List of active boats returned"},
        401: {"description": "Not authenticated"},
        403: {"description": "Insufficient role permissions"},
    },
)
async def list_boats(
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(5, ge=1, le=200, description="Maximum number of records to return"),
    sort_by: str = Query("id", description="Column to sort by (id, name, no, is_active)"),
    sort_order: str = Query("asc", description="Sort direction (asc or desc)"),
    search: str | None = Query(None, description="Search by boat name or number (case-insensitive)"),
    search_column: str = Query("all", description="Column to search: all, name, or no"),
    match_type: str = Query("contains", description="Match type: contains, starts_with, or ends_with"),
    id_filter: int | None = Query(None, ge=1, description="Filter by boat ID (or range start for between)"),
    id_op: str = Query("eq", description="ID comparison operator: eq, lt, gt, or between"),
    id_filter_end: int | None = Query(None, ge=1, description="Range end for between operator"),
    status: str | None = Query(None, description="Filter by status: active, inactive, or all (default all)"),
    db: AsyncSession = Depends(get_db),
    _=Depends(_ferry_roles),
):
    return await boat_service.get_all_boats(db, skip, limit, sort_by, sort_order, search, status, search_column, match_type, id_filter, id_op, id_filter_end)


@router.get(
    "/count",
    response_model=int,
    summary="Get total boat count",
    description="Returns the total number of boats. Requires **Super Admin**, **Admin**, or **Manager** role.",
    responses={
        200: {"description": "Total count returned"},
        401: {"description": "Not authenticated"},
        403: {"description": "Insufficient role permissions"},
    },
)
async def count_boats(
    search: str | None = Query(None, description="Search by boat name or number (case-insensitive)"),
    search_column: str = Query("all", description="Column to search: all, name, or no"),
    match_type: str = Query("contains", description="Match type: contains, starts_with, or ends_with"),
    id_filter: int | None = Query(None, ge=1, description="Filter by boat ID (or range start for between)"),
    id_op: str = Query("eq", description="ID comparison operator: eq, lt, gt, or between"),
    id_filter_end: int | None = Query(None, ge=1, description="Range end for between operator"),
    status: str | None = Query(None, description="Filter by status: active, inactive, or all (default all)"),
    db: AsyncSession = Depends(get_db),
    _=Depends(_ferry_roles),
):
    return await boat_service.count_boats(db, search, status, search_column, match_type, id_filter, id_op, id_filter_end)


@router.post(
    "",
    response_model=BoatRead,
    status_code=201,
    summary="Register a new boat",
    description="Add a new boat/ferry to the system. Requires **Super Admin** or **Admin** role.",
    responses={
        201: {"description": "Boat created successfully"},
        401: {"description": "Not authenticated"},
        403: {"description": "Insufficient role permissions"},
        409: {"description": "Boat name or number already exists"},
    },
)
async def create_boat(
    body: BoatCreate,
    db: AsyncSession = Depends(get_db),
    _=Depends(require_roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)),
):
    return await boat_service.create_boat(db, body)


@router.get(
    "/{boat_id}",
    response_model=BoatRead,
    summary="Get boat by ID",
    description="Fetch a single active boat by its ID. Requires **Super Admin**, **Admin**, or **Manager** role.",
    responses={
        200: {"description": "Boat details returned"},
        401: {"description": "Not authenticated"},
        403: {"description": "Insufficient role permissions"},
        404: {"description": "Boat not found"},
    },
)
async def get_boat(
    boat_id: int,
    db: AsyncSession = Depends(get_db),
    _=Depends(_ferry_roles),
):
    return await boat_service.get_boat_by_id(db, boat_id)


@router.patch(
    "/{boat_id}",
    response_model=BoatRead,
    summary="Update boat details",
    description="Partially update a boat's information (name, number, or active status). Set `is_active=false` to soft-delete. Requires **Super Admin** or **Admin** role.",
    responses={
        200: {"description": "Boat updated successfully"},
        401: {"description": "Not authenticated"},
        403: {"description": "Insufficient role permissions"},
        404: {"description": "Boat not found"},
        409: {"description": "Boat name or number already exists"},
    },
)
async def update_boat(
    boat_id: int,
    body: BoatUpdate,
    db: AsyncSession = Depends(get_db),
    _=Depends(require_roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)),
):
    return await boat_service.update_boat(db, boat_id, body)


