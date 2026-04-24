import uuid
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.rbac import UserRole
from app.database import get_db
from app.dependencies import get_current_user, require_roles
from app.models.user import User
from app.services import admin_rollback_service, admin_screen_service

router = APIRouter(prefix="/api/admin/d-drive/adjustments", tags=["Admin D Drive Adjustments"])

_admin_or_super = require_roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)


async def require_rollback_permission(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> User:
    """
    Gate for the rollback endpoint:
    - SUPER_ADMIN: always allowed
    - ADMIN: allowed only when "Admin Rollback Access" toggle is ON in Settings → Screen Access
    - Other roles: denied
    """
    if current_user.role == UserRole.SUPER_ADMIN:
        return current_user
    if current_user.role == UserRole.ADMIN:
        if await admin_screen_service.is_permission_enabled(db, "Admin Rollback Access"):
            return current_user
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Rollback is disabled for admin users. Ask a SUPER_ADMIN to enable 'Admin Rollback Access' in Settings.",
        )
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Access denied. Insufficient permissions.",
    )


@router.get("")
async def list_adjustments(
    branch_id: int | None = Query(None),
    status: str | None = Query(None, description="DRY_RUN | COMMITTED | IN_PROGRESS | FAILED | ROLLED_BACK"),
    date_from: str | None = Query(None, description="ISO date YYYY-MM-DD; filters created_at >="),
    date_to: str | None = Query(None, description="ISO date YYYY-MM-DD; filters created_at <= end-of-day"),
    search: str | None = Query(None, description="Partial batch_id substring match (UUID text)"),
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(_admin_or_super),
):
    """Paginated adjustment log — visible to ADMIN + SUPER_ADMIN. All historical batches are retained."""
    return await admin_rollback_service.list_adjustments(
        db,
        branch_id=branch_id,
        status=status,
        date_from=date_from,
        date_to=date_to,
        search=search,
        offset=offset,
        limit=limit,
    )


@router.get("/permissions")
async def get_viewer_permissions(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(_admin_or_super),
):
    """Return what the current viewer can do on the adjustments history.
    Used by the frontend to decide whether to render the Rollback button."""
    can_rollback = False
    if current_user.role == UserRole.SUPER_ADMIN:
        can_rollback = True
    elif current_user.role == UserRole.ADMIN:
        can_rollback = await admin_screen_service.is_permission_enabled(db, "Admin Rollback Access")
    return {"can_rollback": can_rollback, "role": current_user.role.value}


@router.get("/{batch_id}")
async def get_adjustment(
    batch_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(_admin_or_super),
):
    """Full detail of a single adjustment including all per-item audit rows."""
    return await admin_rollback_service.get_adjustment_detail(db, str(batch_id))


@router.post("/{batch_id}/rollback")
async def rollback_adjustment(
    batch_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_rollback_permission),
):
    """Reverse a COMMITTED adjustment — SUPER_ADMIN always; ADMIN if the 'Admin Rollback Access' toggle is ON."""
    return await admin_rollback_service.rollback(db, str(batch_id), current_user.id)
