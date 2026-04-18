import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.rbac import UserRole
from app.database import get_db
from app.dependencies import require_roles
from app.services import admin_parameter_master_service

router = APIRouter(prefix="/api/admin/parameter-master", tags=["Admin Parameter Master"])

_super_admin_only = require_roles(UserRole.SUPER_ADMIN)
_admin_or_super = require_roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)


class RuleOut(BaseModel):
    id: int
    priority_order: int
    branch_scope: int | None
    item_id: int | None
    payment_mode: str
    ticket_conditions: dict
    item_conditions: dict
    ticket_selection_order: str
    max_adjustment_per_ticket: float | None
    max_adjustment_per_item: float | None
    max_total_adjustment_per_rule: float | None
    stop_on_match: bool
    is_active: bool
    model_config = {"from_attributes": True}


class RuleCreate(BaseModel):
    priority_order: int
    branch_scope: int | None = None
    item_id: int | None = None
    payment_mode: str = "CASH"
    ticket_conditions: dict = {}
    item_conditions: dict = {}
    ticket_selection_order: str = "FIFO"
    max_adjustment_per_ticket: float | None = None
    max_adjustment_per_item: float | None = None
    max_total_adjustment_per_rule: float | None = None
    stop_on_match: bool = False


class ReorderBody(BaseModel):
    ordered_ids: list[int]


class StatusToggle(BaseModel):
    is_active: bool


class PreviewQuery(BaseModel):
    branch_id: int | None = None
    date_start: str
    date_end: str


@router.get("", response_model=list[RuleOut])
async def list_rules(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(_admin_or_super),
):
    return await admin_parameter_master_service.list_rules(db)


@router.post("", response_model=RuleOut, status_code=status.HTTP_201_CREATED)
async def create_rule(
    body: RuleCreate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(_super_admin_only),
):
    return await admin_parameter_master_service.create_rule(db, body.model_dump(), current_user.id)


@router.put("/{rule_id}", response_model=RuleOut)
async def update_rule(
    rule_id: int,
    body: RuleCreate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(_super_admin_only),
):
    rule = await admin_parameter_master_service.update_rule(db, rule_id, body.model_dump())
    if rule is None:
        raise HTTPException(status_code=404, detail="Rule not found")
    return rule


@router.patch("/{rule_id}/status", response_model=RuleOut)
async def toggle_rule_status(
    rule_id: int,
    body: StatusToggle,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(_super_admin_only),
):
    rule = await admin_parameter_master_service.set_rule_status(db, rule_id, body.is_active)
    if rule is None:
        raise HTTPException(status_code=404, detail="Rule not found")
    return rule


@router.post("/reorder", response_model=list[RuleOut])
async def reorder_rules(
    body: ReorderBody,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(_super_admin_only),
):
    return await admin_parameter_master_service.reorder_rules(db, body.ordered_ids)


@router.post("/{rule_id}/preview")
async def preview_rule(
    rule_id: int,
    body: PreviewQuery,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(_admin_or_super),
):
    return await admin_parameter_master_service.preview_rule_matches(
        db, rule_id, body.branch_id, body.date_start, body.date_end
    )
