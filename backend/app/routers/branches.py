from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import require_roles
from app.core.rbac import UserRole
from app.schemas.branch import BranchCreate, BranchRead, BranchUpdate
from app.services import branch_service

router = APIRouter(prefix="/api/branches", tags=["Branches"])

# Branch listing is accessible to BILLING_OPERATOR too (for ticket form dropdowns)
_branch_read_roles = require_roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER, UserRole.BILLING_OPERATOR)
_branch_roles = require_roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER)


@router.get(
    "/",
    response_model=list[BranchRead],
    summary="List all branches",
    description="Paginated list of all branches. Requires **Super Admin**, **Admin**, or **Manager** role.",
    responses={
        200: {"description": "List of branches returned"},
        401: {"description": "Not authenticated"},
        403: {"description": "Insufficient role permissions"},
    },
)
async def list_branches(
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(5, ge=1, le=200, description="Maximum number of records to return"),
    sort_by: str = Query("id", description="Column to sort by (id, name, address, contact_nos, is_active)"),
    sort_order: str = Query("asc", description="Sort direction (asc or desc)"),
    search: str | None = Query(None, description="Search by branch name, address, or contact numbers (case-insensitive)"),
    search_column: str = Query("all", description="Column to search: all, name, address, or contact_nos"),
    match_type: str = Query("contains", description="Match type: contains, starts_with, or ends_with"),
    id_filter: int | None = Query(None, ge=1, description="Filter by branch ID (or range start for between)"),
    id_op: str = Query("eq", description="ID comparison operator: eq, lt, gt, or between"),
    id_filter_end: int | None = Query(None, ge=1, description="Range end for between operator"),
    status: str | None = Query(None, description="Filter by status: active, inactive, or all (default all)"),
    db: AsyncSession = Depends(get_db),
    _=Depends(_branch_read_roles),
):
    return await branch_service.get_all_branches(db, skip, limit, sort_by, sort_order, search, status, search_column, match_type, id_filter, id_op, id_filter_end)


@router.get(
    "/count",
    response_model=int,
    summary="Get total branch count",
    description="Returns the total number of branches. Requires **Super Admin**, **Admin**, **Manager**, or **Billing Operator** role.",
    responses={
        200: {"description": "Total count returned"},
        401: {"description": "Not authenticated"},
        403: {"description": "Insufficient role permissions"},
    },
)
async def count_branches(
    search: str | None = Query(None, description="Search by branch name, address, or contact numbers (case-insensitive)"),
    search_column: str = Query("all", description="Column to search: all, name, address, or contact_nos"),
    match_type: str = Query("contains", description="Match type: contains, starts_with, or ends_with"),
    id_filter: int | None = Query(None, ge=1, description="Filter by branch ID (or range start for between)"),
    id_op: str = Query("eq", description="ID comparison operator: eq, lt, gt, or between"),
    id_filter_end: int | None = Query(None, ge=1, description="Range end for between operator"),
    status: str | None = Query(None, description="Filter by status: active, inactive, or all (default all)"),
    db: AsyncSession = Depends(get_db),
    _=Depends(_branch_read_roles),
):
    return await branch_service.count_branches(db, search, status, search_column, match_type, id_filter, id_op, id_filter_end)


@router.get(
    "/export",
    response_model=list[BranchRead],
    summary="Export all branches",
    description="Returns all branches matching filters with no pagination limit. Intended for print/PDF/Excel export. Requires **Super Admin**, **Admin**, or **Manager** role.",
    responses={
        200: {"description": "Full list of matching branches returned"},
        401: {"description": "Not authenticated"},
        403: {"description": "Insufficient role permissions"},
    },
)
async def export_branches(
    sort_by: str = Query("id", description="Column to sort by (id, name, address, contact_nos, is_active)"),
    sort_order: str = Query("asc", description="Sort direction (asc or desc)"),
    search: str | None = Query(None, description="Search by branch name, address, or contact numbers (case-insensitive)"),
    search_column: str = Query("all", description="Column to search: all, name, address, or contact_nos"),
    match_type: str = Query("contains", description="Match type: contains, starts_with, or ends_with"),
    id_filter: int | None = Query(None, ge=1, description="Filter by branch ID (or range start for between)"),
    id_op: str = Query("eq", description="ID comparison operator: eq, lt, gt, or between"),
    id_filter_end: int | None = Query(None, ge=1, description="Range end for between operator"),
    status: str | None = Query(None, description="Filter by status: active, inactive, or all (default all)"),
    db: AsyncSession = Depends(get_db),
    _=Depends(_branch_roles),
):
    return await branch_service.get_all_branches(
        db, skip=0, limit=None, sort_by=sort_by, sort_order=sort_order,
        search=search, status=status, search_column=search_column, match_type=match_type,
        id_filter=id_filter, id_op=id_op, id_filter_end=id_filter_end,
    )


@router.post(
    "/",
    response_model=BranchRead,
    status_code=201,
    summary="Create a new branch",
    description="Add a new branch to the system. Requires **Super Admin** or **Admin** role.",
    responses={
        201: {"description": "Branch created successfully"},
        401: {"description": "Not authenticated"},
        403: {"description": "Insufficient role permissions"},
        409: {"description": "Branch name already exists"},
    },
)
async def create_branch(
    body: BranchCreate,
    db: AsyncSession = Depends(get_db),
    _=Depends(require_roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)),
):
    return await branch_service.create_branch(db, body)


@router.get(
    "/{branch_id}",
    response_model=BranchRead,
    summary="Get branch by ID",
    description="Fetch a single branch by its ID. Requires **Super Admin**, **Admin**, or **Manager** role.",
    responses={
        200: {"description": "Branch details returned"},
        401: {"description": "Not authenticated"},
        403: {"description": "Insufficient role permissions"},
        404: {"description": "Branch not found"},
    },
)
async def get_branch(
    branch_id: int,
    db: AsyncSession = Depends(get_db),
    _=Depends(_branch_roles),
):
    return await branch_service.get_branch_by_id(db, branch_id)


@router.patch(
    "/{branch_id}",
    response_model=BranchRead,
    summary="Update branch details",
    description="Partially update a branch's information. Set `is_active=false` to soft-delete. Requires **Super Admin** or **Admin** role.",
    responses={
        200: {"description": "Branch updated successfully"},
        401: {"description": "Not authenticated"},
        403: {"description": "Insufficient role permissions"},
        404: {"description": "Branch not found"},
        409: {"description": "Branch name already exists"},
    },
)
async def update_branch(
    branch_id: int,
    body: BranchUpdate,
    db: AsyncSession = Depends(get_db),
    _=Depends(require_roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)),
):
    return await branch_service.update_branch(db, branch_id, body)
