import uuid
from datetime import datetime, timezone
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.admin_user_access import AdminUserAccess
from app.models.user import User
from app.core.rbac import UserRole


async def list_admin_users_with_access(db: AsyncSession) -> list[dict]:
    """Return all ADMIN users with their current portal access status."""
    result = await db.execute(
        select(User, AdminUserAccess)
        .outerjoin(AdminUserAccess, AdminUserAccess.user_id == User.id)
        .where(User.role == UserRole.ADMIN, User.is_active == True)
        .order_by(User.full_name)
    )
    rows = result.all()
    return [
        {
            "user_id": str(row.User.id),
            "full_name": row.User.full_name,
            "username": row.User.username,
            "is_granted": row.AdminUserAccess.is_granted if row.AdminUserAccess else False,
            "granted_at": row.AdminUserAccess.granted_at.isoformat() if row.AdminUserAccess and row.AdminUserAccess.granted_at else None,
        }
        for row in rows
    ]


async def set_user_access(
    db: AsyncSession,
    target_user_id: uuid.UUID,
    is_granted: bool,
    granted_by: uuid.UUID,
) -> dict:
    """Grant or revoke portal access for a specific ADMIN user."""
    result = await db.execute(
        select(AdminUserAccess).where(AdminUserAccess.user_id == target_user_id)
    )
    access = result.scalar_one_or_none()
    now = datetime.now(timezone.utc)

    if access is None:
        access = AdminUserAccess(
            user_id=target_user_id,
            is_granted=is_granted,
            granted_by=granted_by if is_granted else None,
            granted_at=now if is_granted else None,
        )
        db.add(access)
    else:
        access.is_granted = is_granted
        access.granted_by = granted_by if is_granted else None
        access.granted_at = now if is_granted else None
        access.updated_at = now

    await db.flush()
    return {
        "user_id": str(target_user_id),
        "is_granted": access.is_granted,
        "granted_at": access.granted_at.isoformat() if access.granted_at else None,
    }


async def check_user_access(db: AsyncSession, user_id: uuid.UUID) -> bool:
    """Return True if this user has been granted admin portal access."""
    result = await db.execute(
        select(AdminUserAccess.is_granted).where(AdminUserAccess.user_id == user_id)
    )
    row = result.scalar_one_or_none()
    return bool(row)
