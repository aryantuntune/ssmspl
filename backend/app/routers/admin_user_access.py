import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.rbac import UserRole
from app.database import get_db
from app.dependencies import require_roles
from app.services import admin_user_access_service

router = APIRouter(prefix="/api/admin/user-access", tags=["Admin User Access"])

_super_admin_only = require_roles(UserRole.SUPER_ADMIN)


class AccessToggle(BaseModel):
    is_granted: bool


@router.get("", summary="List ADMIN users with access status")
async def list_access(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(_super_admin_only),
):
    return await admin_user_access_service.list_admin_users_with_access(db)


@router.put("/{user_id}", summary="Grant or revoke admin portal access")
async def update_access(
    user_id: uuid.UUID,
    body: AccessToggle,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(_super_admin_only),
):
    return await admin_user_access_service.set_user_access(
        db, user_id, body.is_granted, current_user.id
    )
