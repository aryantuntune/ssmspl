from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import require_roles
from app.core.rbac import UserRole
from app.schemas.route import RouteCreate, RouteRead, RouteUpdate
from app.services import route_service

router = APIRouter(prefix="/api/routes", tags=["Routes"])

# Route listing is accessible to BILLING_OPERATOR too (for ticket form dropdowns)
_route_read_roles = require_roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER, UserRole.BILLING_OPERATOR)
_route_roles = require_roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER)


@router.get(
    "/",
    response_model=list[RouteRead],
    summary="List all routes",
    description="Paginated list of all routes with branch names. Requires **Super Admin**, **Admin**, or **Manager** role.",
    responses={
        200: {"description": "List of routes returned"},
        401: {"description": "Not authenticated"},
        403: {"description": "Insufficient role permissions"},
    },
)
async def list_routes(
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(5, ge=1, le=200, description="Maximum number of records to return"),
    sort_by: str = Query("id", description="Column to sort by (id, branch_id_one, branch_id_two, is_active)"),
    sort_order: str = Query("asc", description="Sort direction (asc or desc)"),
    branch_filter: int | None = Query(None, ge=1, description="Filter routes containing this branch ID"),
    id_filter: int | None = Query(None, ge=1, description="Filter by route ID (or range start for between)"),
    id_op: str = Query("eq", description="ID comparison operator: eq, lt, gt, or between"),
    id_filter_end: int | None = Query(None, ge=1, description="Range end for between operator"),
    status: str | None = Query(None, description="Filter by status: active, inactive, or all (default all)"),
    db: AsyncSession = Depends(get_db),
    _=Depends(_route_read_roles),
):
    return await route_service.get_all_routes(db, skip, limit, sort_by, sort_order, status, branch_filter, id_filter, id_op, id_filter_end)


@router.get(
    "/count",
    response_model=int,
    summary="Get total route count",
    description="Returns the total number of routes. Requires **Super Admin**, **Admin**, **Manager**, or **Billing Operator** role.",
    responses={
        200: {"description": "Total count returned"},
        401: {"description": "Not authenticated"},
        403: {"description": "Insufficient role permissions"},
    },
)
async def count_routes(
    branch_filter: int | None = Query(None, ge=1, description="Filter routes containing this branch ID"),
    id_filter: int | None = Query(None, ge=1, description="Filter by route ID (or range start for between)"),
    id_op: str = Query("eq", description="ID comparison operator: eq, lt, gt, or between"),
    id_filter_end: int | None = Query(None, ge=1, description="Range end for between operator"),
    status: str | None = Query(None, description="Filter by status: active, inactive, or all (default all)"),
    db: AsyncSession = Depends(get_db),
    _=Depends(_route_read_roles),
):
    return await route_service.count_routes(db, status, branch_filter, id_filter, id_op, id_filter_end)


@router.post(
    "/",
    response_model=RouteRead,
    status_code=201,
    summary="Create a new route",
    description="Add a new route between two branches. Requires **Super Admin** or **Admin** role.",
    responses={
        201: {"description": "Route created successfully"},
        400: {"description": "Same branch on both ends"},
        401: {"description": "Not authenticated"},
        403: {"description": "Insufficient role permissions"},
        404: {"description": "Branch not found"},
        409: {"description": "Route between these branches already exists"},
    },
)
async def create_route(
    body: RouteCreate,
    db: AsyncSession = Depends(get_db),
    _=Depends(require_roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)),
):
    return await route_service.create_route(db, body)


@router.get(
    "/{route_id}",
    response_model=RouteRead,
    summary="Get route by ID",
    description="Fetch a single route by its ID. Requires **Super Admin**, **Admin**, or **Manager** role.",
    responses={
        200: {"description": "Route details returned"},
        401: {"description": "Not authenticated"},
        403: {"description": "Insufficient role permissions"},
        404: {"description": "Route not found"},
    },
)
async def get_route(
    route_id: int,
    db: AsyncSession = Depends(get_db),
    _=Depends(_route_roles),
):
    return await route_service.get_route_by_id(db, route_id)


@router.patch(
    "/{route_id}",
    response_model=RouteRead,
    summary="Update route details",
    description="Partially update a route. Set `is_active=false` to soft-delete. Requires **Super Admin** or **Admin** role.",
    responses={
        200: {"description": "Route updated successfully"},
        400: {"description": "Same branch on both ends"},
        401: {"description": "Not authenticated"},
        403: {"description": "Insufficient role permissions"},
        404: {"description": "Route or branch not found"},
        409: {"description": "Route between these branches already exists"},
    },
)
async def update_route(
    route_id: int,
    body: RouteUpdate,
    db: AsyncSession = Depends(get_db),
    _=Depends(require_roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)),
):
    return await route_service.update_route(db, route_id, body)
