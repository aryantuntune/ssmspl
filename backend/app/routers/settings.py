from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.rbac import UserRole
from app.database import get_db
from app.dependencies import require_roles
from app.models.company import Company
from app.models.daily_report_recipient import DailyReportRecipient
from app.services.activity_log_service import log_activity, ActivityAction
from app.services import admin_screen_service

router = APIRouter(prefix="/api/settings", tags=["Settings"])

_super_admin_only = require_roles(UserRole.SUPER_ADMIN)


class TimeLockToggle(BaseModel):
    enabled: bool


class TimeLockStatus(BaseModel):
    time_lock_enabled: bool


@router.get(
    "/time-lock",
    response_model=TimeLockStatus,
    summary="Get time-lock status",
)
async def get_time_lock(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(_super_admin_only),
):
    result = await db.execute(select(Company).where(Company.id == 1))
    company = result.scalar_one_or_none()
    return {"time_lock_enabled": company.time_lock_enabled if company else True}


@router.put(
    "/time-lock",
    response_model=TimeLockStatus,
    summary="Toggle time-lock on ticketing screens",
)
async def toggle_time_lock(
    body: TimeLockToggle,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(_super_admin_only),
):
    result = await db.execute(select(Company).where(Company.id == 1))
    company = result.scalar_one_or_none()
    if not company:
        raise HTTPException(status_code=404, detail="Company record not found")
    company.time_lock_enabled = body.enabled
    await db.flush()
    background_tasks.add_task(
        log_activity, current_user.active_session_id, current_user.id,
        ActivityAction.SETTINGS_CHANGE,
        {"entity": "time_lock", "action": "toggle", "enabled": body.enabled},
    )
    return {"time_lock_enabled": company.time_lock_enabled}


class RecipientCreate(BaseModel):
    email: EmailStr
    label: str | None = None


class RecipientOut(BaseModel):
    id: int
    email: str
    label: str | None
    is_active: bool

    model_config = {"from_attributes": True}


@router.get(
    "/daily-report-recipients",
    response_model=list[RecipientOut],
    summary="List daily report recipients",
)
async def list_recipients(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(_super_admin_only),
):
    result = await db.execute(
        select(DailyReportRecipient).order_by(DailyReportRecipient.email)
    )
    return result.scalars().all()


@router.post(
    "/daily-report-recipients",
    response_model=RecipientOut,
    status_code=status.HTTP_201_CREATED,
    summary="Add daily report recipient",
)
async def add_recipient(
    body: RecipientCreate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(_super_admin_only),
):
    # Check duplicate
    existing = await db.execute(
        select(DailyReportRecipient).where(DailyReportRecipient.email == body.email)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Email already in recipient list")

    recipient = DailyReportRecipient(email=body.email, label=body.label)
    db.add(recipient)
    await db.flush()
    await db.refresh(recipient)
    background_tasks.add_task(
        log_activity, current_user.active_session_id, current_user.id,
        ActivityAction.SETTINGS_CHANGE,
        {"entity": "daily_report_recipient", "action": "add", "email": body.email},
    )
    return recipient


@router.patch(
    "/daily-report-recipients/{recipient_id}",
    response_model=RecipientOut,
    summary="Toggle recipient active status",
)
async def toggle_recipient(
    recipient_id: int,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(_super_admin_only),
):
    result = await db.execute(
        select(DailyReportRecipient).where(DailyReportRecipient.id == recipient_id)
    )
    recipient = result.scalar_one_or_none()
    if not recipient:
        raise HTTPException(status_code=404, detail="Recipient not found")
    recipient.is_active = not recipient.is_active
    await db.flush()
    await db.refresh(recipient)
    background_tasks.add_task(
        log_activity, current_user.active_session_id, current_user.id,
        ActivityAction.SETTINGS_CHANGE,
        {"entity": "daily_report_recipient", "action": "toggle", "id": recipient_id, "is_active": recipient.is_active},
    )
    return recipient


@router.delete(
    "/daily-report-recipients/{recipient_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Remove daily report recipient",
)
async def delete_recipient(
    recipient_id: int,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(_super_admin_only),
):
    result = await db.execute(
        select(DailyReportRecipient).where(DailyReportRecipient.id == recipient_id)
    )
    recipient = result.scalar_one_or_none()
    if not recipient:
        raise HTTPException(status_code=404, detail="Recipient not found")
    email = recipient.email
    await db.delete(recipient)
    background_tasks.add_task(
        log_activity, current_user.active_session_id, current_user.id,
        ActivityAction.SETTINGS_CHANGE,
        {"entity": "daily_report_recipient", "action": "delete", "id": recipient_id, "email": email},
    )


# --- Admin Portal Screen Toggles ---


class ScreenToggleOut(BaseModel):
    id: int
    screen_name: str
    is_enabled: bool
    is_permission: bool = False  # True if this row gates a privileged action, not a screen

    model_config = {"from_attributes": True}


class ScreenToggleBulkUpdate(BaseModel):
    toggles: dict[str, bool]  # {"Ticketing": true, "Reports": false}


@router.get(
    "/screen-toggles",
    response_model=list[ScreenToggleOut],
    summary="List all admin portal screen toggles",
)
async def list_screen_toggles(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(_super_admin_only),
):
    rows = await admin_screen_service.get_all_toggles(db)
    perms = admin_screen_service.PERMISSION_TOGGLES
    return [
        {"id": t.id, "screen_name": t.screen_name, "is_enabled": t.is_enabled,
         "is_permission": t.screen_name in perms}
        for t in rows
    ]


@router.put(
    "/screen-toggles",
    response_model=list[ScreenToggleOut],
    summary="Bulk update admin portal screen toggles",
)
async def update_screen_toggles(
    body: ScreenToggleBulkUpdate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(_super_admin_only),
):
    result = await admin_screen_service.bulk_update_toggles(db, body.toggles)
    perms = admin_screen_service.PERMISSION_TOGGLES
    background_tasks.add_task(
        log_activity, current_user.active_session_id, current_user.id,
        ActivityAction.SETTINGS_CHANGE,
        {"entity": "screen_toggles", "action": "bulk_update", "toggles": body.toggles},
    )
    return [
        {"id": t.id, "screen_name": t.screen_name, "is_enabled": t.is_enabled,
         "is_permission": t.screen_name in perms}
        for t in result
    ]
