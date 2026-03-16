import logging
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import require_roles
from app.core.rbac import UserRole
from app.models.user import User
from app.schemas.rate_change_log import RateChangeLogRead
from app.services import rate_change_log_service

logger = logging.getLogger("ssmspl")

router = APIRouter(prefix="/api/rate-change-logs", tags=["Rate Change Logs"])

_allowed_roles = require_roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER)


@router.get(
    "",
    response_model=list[RateChangeLogRead],
    summary="List rate change logs",
    description="Paginated list of rate change logs. Managers see only their own. Admins see managers + own. Superadmins see all.",
    responses={
        200: {"description": "List of rate change logs"},
        400: {"description": "Invalid filter parameters"},
        401: {"description": "Not authenticated"},
        403: {"description": "Insufficient role permissions"},
    },
)
async def list_rate_change_logs(
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(50, ge=1, le=200, description="Maximum records to return"),
    date_from: date | None = Query(None, description="Filter from date (inclusive)"),
    date_to: date | None = Query(None, description="Filter to date (inclusive)"),
    route_id: int | None = Query(None, ge=1, description="Filter by route ID"),
    item_id: int | None = Query(None, ge=1, description="Filter by item ID"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(_allowed_roles),
):
    if date_from and date_to and date_from > date_to:
        raise HTTPException(status_code=400, detail="date_from must not be after date_to")

    try:
        return await rate_change_log_service.get_rate_change_logs(
            db, current_user, skip, limit, date_from, date_to, route_id, item_id,
        )
    except SQLAlchemyError:
        logger.exception("Database error fetching rate change logs")
        raise HTTPException(status_code=500, detail="Failed to fetch rate change logs")


@router.get(
    "/count",
    response_model=int,
    summary="Count rate change logs",
    description="Total count of rate change logs with role-based filtering.",
    responses={
        200: {"description": "Total count"},
        400: {"description": "Invalid filter parameters"},
        401: {"description": "Not authenticated"},
        403: {"description": "Insufficient role permissions"},
    },
)
async def count_rate_change_logs(
    date_from: date | None = Query(None, description="Filter from date (inclusive)"),
    date_to: date | None = Query(None, description="Filter to date (inclusive)"),
    route_id: int | None = Query(None, ge=1, description="Filter by route ID"),
    item_id: int | None = Query(None, ge=1, description="Filter by item ID"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(_allowed_roles),
):
    if date_from and date_to and date_from > date_to:
        raise HTTPException(status_code=400, detail="date_from must not be after date_to")

    try:
        return await rate_change_log_service.count_rate_change_logs(
            db, current_user, date_from, date_to, route_id, item_id,
        )
    except SQLAlchemyError:
        logger.exception("Database error counting rate change logs")
        raise HTTPException(status_code=500, detail="Failed to count rate change logs")
