from datetime import date
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.rbac import UserRole
from app.database import get_db
from app.dependencies import require_roles
from app.database_sync import is_sync_configured
from app.services import admin_sync_check_service

router = APIRouter(prefix="/api/admin/d-drive/sync-check", tags=["Admin D Drive Sync Check"])

_admin_or_super = require_roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)


@router.get("/status")
async def sync_check_status(current_user=Depends(_admin_or_super)):
    """Quick check: is the sync-check feature available on this server?"""
    return {"configured": is_sync_configured()}


@router.get("")
async def run_sync_check(
    date_start: date = Query(...),
    date_end: date = Query(...),
    branch_id: int | None = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(_admin_or_super),
):
    """
    Compare ssmspl_admin against ssmspl_sync (mirror of prod) for the given
    branch + date range. Returns structured diff. Read-only.
    """
    return await admin_sync_check_service.run_sync_check(db, branch_id, date_start, date_end)
