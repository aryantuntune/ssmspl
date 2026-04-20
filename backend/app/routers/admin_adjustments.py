import uuid
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.rbac import UserRole
from app.database import get_db
from app.dependencies import require_roles
from app.services import admin_rollback_service

router = APIRouter(prefix="/api/admin/d-drive/adjustments", tags=["Admin D Drive Adjustments"])

_admin_or_super = require_roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
_super_admin_only = require_roles(UserRole.SUPER_ADMIN)


@router.get("")
async def list_adjustments(
    branch_id: int | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(_admin_or_super),
):
    """Recent adjustment log entries — visible to ADMIN + SUPER_ADMIN."""
    return await admin_rollback_service.list_adjustments(db, branch_id=branch_id, limit=limit)


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
    current_user=Depends(_super_admin_only),
):
    """Reverse a COMMITTED adjustment — SUPER_ADMIN only."""
    return await admin_rollback_service.rollback(db, str(batch_id), current_user.id)
