from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.rbac import UserRole
from app.database import get_db
from app.dependencies import require_roles
from app.models.daily_report_recipient import DailyReportRecipient

router = APIRouter(prefix="/api/settings", tags=["Settings"])

_super_admin_only = require_roles(UserRole.SUPER_ADMIN)


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
    return recipient


@router.patch(
    "/daily-report-recipients/{recipient_id}",
    response_model=RecipientOut,
    summary="Toggle recipient active status",
)
async def toggle_recipient(
    recipient_id: int,
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
    return recipient


@router.delete(
    "/daily-report-recipients/{recipient_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Remove daily report recipient",
)
async def delete_recipient(
    recipient_id: int,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(_super_admin_only),
):
    result = await db.execute(
        select(DailyReportRecipient).where(DailyReportRecipient.id == recipient_id)
    )
    recipient = result.scalar_one_or_none()
    if not recipient:
        raise HTTPException(status_code=404, detail="Recipient not found")
    await db.delete(recipient)
