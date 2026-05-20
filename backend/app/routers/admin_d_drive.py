import uuid
from datetime import date
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.rbac import UserRole
from app.database import get_db
from app.dependencies import require_roles
from app.services import admin_d_drive_service, admin_adjustment_engine

router = APIRouter(prefix="/api/admin/d-drive", tags=["Admin D Drive"])

_admin_or_super = require_roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)


@router.get("/summary")
async def branch_summary(
    date_start: date = Query(...),
    date_end: date = Query(...),
    branch_id: int | None = Query(None),
    payment_mode: str | None = Query(None),
    item_id: int | None = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(_admin_or_super),
):
    return await admin_d_drive_service.get_branch_summary(
        db, date_start, date_end, branch_id, payment_mode, item_id
    )


@router.get("/tickets")
async def list_tickets(
    date_start: date = Query(...),
    date_end: date = Query(...),
    branch_id: int | None = Query(None),
    payment_mode: str | None = Query(None),
    item_id: int | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(_admin_or_super),
):
    return await admin_d_drive_service.list_tickets(
        db, date_start, date_end, branch_id, payment_mode, item_id, page, page_size
    )


class DryRunRequest(BaseModel):
    branch_id: int
    date_start: date
    date_end: date
    adjustment_amount: float
    payment_mode: str = "CASH"  # "CASH" or "UPI"


class CommitRequest(BaseModel):
    batch_id: str
    plan_choice: str  # "recommended", "requested", or "closest" (new UI always sends "closest")
    skipped_ticket_ids: list[int] = []


@router.post("/adjustment/dry-run")
async def adjustment_dry_run(
    body: DryRunRequest,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(_admin_or_super),
):
    return await admin_adjustment_engine.dry_run(
        db,
        branch_id=body.branch_id,
        date_start=body.date_start,
        date_end=body.date_end,
        adjustment_amount=body.adjustment_amount,
        created_by=current_user.id,
        payment_mode=body.payment_mode,
    )


@router.post("/adjustment/commit")
async def adjustment_commit(
    body: CommitRequest,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(_admin_or_super),
):
    return await admin_adjustment_engine.commit(
        db, body.batch_id, body.plan_choice, current_user.id, body.skipped_ticket_ids
    )


@router.get("/adjustment/{batch_id}")
async def get_adjustment(
    batch_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(_admin_or_super),
):
    from sqlalchemy import select
    from app.models.admin_adjustments_log import AdminAdjustmentsLog
    result = await db.execute(
        select(AdminAdjustmentsLog).where(AdminAdjustmentsLog.id == batch_id)
    )
    log = result.scalar_one_or_none()
    if log is None:
        raise HTTPException(status_code=404, detail="Adjustment not found")
    return {
        "id": str(log.id),
        "branch_id": log.branch_id,
        "payment_mode": log.payment_mode,
        "date_start": str(log.date_range_start),
        "date_end": str(log.date_range_end),
        "adjustment_amount": float(log.adjustment_amount),
        "status": log.status,
        "total_tickets_affected": log.total_tickets_affected,
        "total_items_affected": log.total_items_affected,
        "executed_at": log.executed_at.isoformat() if log.executed_at else None,
        "error_message": log.error_message,
        "summary": log.dry_run_summary,
    }
