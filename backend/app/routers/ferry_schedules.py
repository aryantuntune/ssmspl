from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import require_roles
from app.core.rbac import UserRole
from app.schemas.ferry_schedule import FerryScheduleCreate, FerryScheduleRead, FerryScheduleUpdate
from app.services import ferry_schedule_service

router = APIRouter(prefix="/api/ferry-schedules", tags=["Ferry Schedules"])

# Read access includes BILLING_OPERATOR (for ticket form departure dropdown)
_read_roles = require_roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER, UserRole.BILLING_OPERATOR)


@router.get(
    "",
    response_model=list[FerryScheduleRead],
    summary="List all ferry schedules",
    description="Paginated list of all ferry schedules with branch names. Requires **Super Admin**, **Admin**, or **Manager** role.",
    responses={
        200: {"description": "List of schedules returned"},
        401: {"description": "Not authenticated"},
        403: {"description": "Insufficient role permissions"},
    },
)
async def list_schedules(
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(5, ge=1, le=200, description="Maximum number of records to return"),
    sort_by: str = Query("id", description="Column to sort by (id, branch_id, departure)"),
    sort_order: str = Query("asc", description="Sort direction (asc or desc)"),
    branch_filter: int | None = Query(None, ge=1, description="Filter schedules by branch ID"),
    id_filter: int | None = Query(None, ge=1, description="Filter by schedule ID (or range start for between)"),
    id_op: str = Query("eq", description="ID comparison operator: eq, lt, gt, or between"),
    id_filter_end: int | None = Query(None, ge=1, description="Range end for between operator"),
    db: AsyncSession = Depends(get_db),
    _=Depends(_read_roles),
):
    return await ferry_schedule_service.get_all_schedules(db, skip, limit, sort_by, sort_order, branch_filter, id_filter, id_op, id_filter_end)


@router.get(
    "/count",
    response_model=int,
    summary="Get total schedule count",
    description="Returns the total number of ferry schedules. Requires **Super Admin**, **Admin**, or **Manager** role.",
    responses={
        200: {"description": "Total count returned"},
        401: {"description": "Not authenticated"},
        403: {"description": "Insufficient role permissions"},
    },
)
async def count_schedules(
    branch_filter: int | None = Query(None, ge=1, description="Filter schedules by branch ID"),
    id_filter: int | None = Query(None, ge=1, description="Filter by schedule ID (or range start for between)"),
    id_op: str = Query("eq", description="ID comparison operator: eq, lt, gt, or between"),
    id_filter_end: int | None = Query(None, ge=1, description="Range end for between operator"),
    db: AsyncSession = Depends(get_db),
    _=Depends(_read_roles),
):
    return await ferry_schedule_service.count_schedules(db, branch_filter, id_filter, id_op, id_filter_end)


@router.post(
    "",
    response_model=FerryScheduleRead,
    status_code=201,
    summary="Create a new ferry schedule",
    description="Add a new departure schedule for a branch. Requires **Super Admin** or **Admin** role.",
    responses={
        201: {"description": "Schedule created successfully"},
        400: {"description": "Invalid time format"},
        401: {"description": "Not authenticated"},
        403: {"description": "Insufficient role permissions"},
        404: {"description": "Branch not found"},
        409: {"description": "Schedule with this branch and departure time already exists"},
    },
)
async def create_schedule(
    body: FerryScheduleCreate,
    db: AsyncSession = Depends(get_db),
    _=Depends(require_roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)),
):
    return await ferry_schedule_service.create_schedule(db, body)


@router.get(
    "/{schedule_id}",
    response_model=FerryScheduleRead,
    summary="Get schedule by ID",
    description="Fetch a single ferry schedule by its ID. Requires **Super Admin**, **Admin**, or **Manager** role.",
    responses={
        200: {"description": "Schedule details returned"},
        401: {"description": "Not authenticated"},
        403: {"description": "Insufficient role permissions"},
        404: {"description": "Schedule not found"},
    },
)
async def get_schedule(
    schedule_id: int,
    db: AsyncSession = Depends(get_db),
    _=Depends(_read_roles),
):
    return await ferry_schedule_service.get_schedule_by_id(db, schedule_id)


@router.patch(
    "/{schedule_id}",
    response_model=FerryScheduleRead,
    summary="Update schedule details",
    description="Partially update a ferry schedule. Requires **Super Admin** or **Admin** role.",
    responses={
        200: {"description": "Schedule updated successfully"},
        400: {"description": "Invalid time format"},
        401: {"description": "Not authenticated"},
        403: {"description": "Insufficient role permissions"},
        404: {"description": "Schedule or branch not found"},
        409: {"description": "Schedule with this branch and departure time already exists"},
    },
)
async def update_schedule(
    schedule_id: int,
    body: FerryScheduleUpdate,
    db: AsyncSession = Depends(get_db),
    _=Depends(require_roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)),
):
    return await ferry_schedule_service.update_schedule(db, schedule_id, body)
