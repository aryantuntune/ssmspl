import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.rbac import UserRole
from app.database import get_db
from app.dependencies import require_roles
from app.services import admin_parameter_master_service

router = APIRouter(prefix="/api/admin/parameter-master", tags=["Admin Parameter Master"])

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
    is_protected: bool
    min_remaining_per_item: int
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
    is_protected: bool = False
    min_remaining_per_item: int = 0


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
    current_user=Depends(_admin_or_super),
):
    return await admin_parameter_master_service.create_rule(db, body.model_dump(), current_user.id)


@router.put("/{rule_id}", response_model=RuleOut)
async def update_rule(
    rule_id: int,
    body: RuleCreate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(_admin_or_super),
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
    current_user=Depends(_admin_or_super),
):
    rule = await admin_parameter_master_service.set_rule_status(db, rule_id, body.is_active)
    if rule is None:
        raise HTTPException(status_code=404, detail="Rule not found")
    return rule


@router.post("/reorder", response_model=list[RuleOut])
async def reorder_rules(
    body: ReorderBody,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(_admin_or_super),
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


from app.models.item import Item
from sqlalchemy import func, delete as sa_delete


class ItemProtectionOut(BaseModel):
    item_id: int
    item_name: str
    is_protected: bool
    is_active: bool


class ItemProtectionToggle(BaseModel):
    is_protected: bool


@router.get("/items", response_model=list[ItemProtectionOut], summary="List all items with their protection status")
async def list_items_with_protection(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(_admin_or_super),
):
    """Return every item in the system with whether it is currently protected from deletion.
    Active items are sorted first, then inactive."""
    from sqlalchemy import select
    from app.models.parameter_master import ParameterMaster

    items_result = await db.execute(
        select(Item).order_by(Item.is_active.desc().nulls_last(), Item.name)
    )
    all_items = list(items_result.scalars().all())

    protected_result = await db.execute(
        select(ParameterMaster.item_id).where(
            ParameterMaster.is_protected == True,
            ParameterMaster.is_active == True,
            ParameterMaster.item_id != None,
        )
    )
    protected_set = {row[0] for row in protected_result.all()}

    return [
        {
            "item_id": item.id,
            "item_name": item.name,
            "is_protected": item.id in protected_set,
            "is_active": bool(item.is_active),
        }
        for item in all_items
    ]


@router.put("/items/{item_id}", response_model=ItemProtectionOut, summary="Toggle an item's protection status")
async def set_item_protection(
    item_id: int,
    body: ItemProtectionToggle,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(_admin_or_super),
):
    """Mark an item as Protected (never deleted) or Deletable (may be removed during reconciliation)."""
    from sqlalchemy import select
    from app.models.parameter_master import ParameterMaster

    item_result = await db.execute(select(Item).where(Item.id == item_id))
    item = item_result.scalar_one_or_none()
    if item is None:
        raise HTTPException(status_code=404, detail="Item not found")

    # Always delete any existing protection rule for this item_id
    # (a ticket_items.item_id has at most ONE protected rule at any time in this simplified model)
    await db.execute(
        sa_delete(ParameterMaster).where(
            ParameterMaster.item_id == item_id,
            ParameterMaster.is_protected == True,
        )
    )

    if body.is_protected:
        # Serialize priority_order assignment to avoid UniqueViolation under
        # concurrent toggles. Lock releases automatically at transaction end.
        from sqlalchemy import text as _text
        await db.execute(_text("SELECT pg_advisory_xact_lock(hashtext('parameter_master_priority_order'))"))
        max_priority_result = await db.execute(select(func.coalesce(func.max(ParameterMaster.priority_order), 0)))
        new_priority = (max_priority_result.scalar() or 0) + 1
        rule = ParameterMaster(
            priority_order=new_priority,
            branch_scope=None,
            item_id=item_id,
            payment_mode="CASH",
            ticket_conditions={},
            item_conditions={},
            ticket_selection_order="FIFO",
            max_adjustment_per_ticket=None,
            max_adjustment_per_item=None,
            max_total_adjustment_per_rule=None,
            stop_on_match=False,
            is_active=True,
            is_protected=True,
            min_remaining_per_item=0,
            created_by=current_user.id,
        )
        db.add(rule)

    await db.flush()
    return {
        "item_id": item_id,
        "item_name": item.name,
        "is_protected": body.is_protected,
        "is_active": bool(item.is_active),
    }


class BulkItemProtection(BaseModel):
    item_ids: list[int]
    is_protected: bool


@router.put("/items/bulk", response_model=list[ItemProtectionOut], summary="Bulk toggle protection for multiple items")
async def bulk_set_item_protection(
    body: BulkItemProtection,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(_admin_or_super),
):
    """Mark a list of items as Protected or Deletable in a single operation."""
    from sqlalchemy import select
    from app.models.parameter_master import ParameterMaster

    if not body.item_ids:
        raise HTTPException(status_code=400, detail="item_ids cannot be empty")

    # Verify all items exist
    items_result = await db.execute(select(Item).where(Item.id.in_(body.item_ids)))
    items_by_id = {i.id: i for i in items_result.scalars().all()}
    missing = [iid for iid in body.item_ids if iid not in items_by_id]
    if missing:
        raise HTTPException(status_code=404, detail=f"Items not found: {missing}")

    # Delete any existing protection rules for these items
    await db.execute(
        sa_delete(ParameterMaster).where(
            ParameterMaster.item_id.in_(body.item_ids),
            ParameterMaster.is_protected == True,
        )
    )
    await db.flush()

    if body.is_protected:
        # Serialize priority_order assignment to avoid UniqueViolation under
        # concurrent toggles. Lock releases automatically at transaction end.
        from sqlalchemy import text as _text
        await db.execute(_text("SELECT pg_advisory_xact_lock(hashtext('parameter_master_priority_order'))"))
        # Create fresh protection rules with sequential priority_orders
        max_priority_result = await db.execute(select(func.coalesce(func.max(ParameterMaster.priority_order), 0)))
        next_priority = (max_priority_result.scalar() or 0) + 1
        for item_id in body.item_ids:
            rule = ParameterMaster(
                priority_order=next_priority,
                branch_scope=None,
                item_id=item_id,
                payment_mode="CASH",
                ticket_conditions={},
                item_conditions={},
                ticket_selection_order="FIFO",
                max_adjustment_per_ticket=None,
                max_adjustment_per_item=None,
                max_total_adjustment_per_rule=None,
                stop_on_match=False,
                is_active=True,
                is_protected=True,
                min_remaining_per_item=0,
                created_by=current_user.id,
            )
            db.add(rule)
            next_priority += 1

    await db.flush()

    return [
        {
            "item_id": iid,
            "item_name": items_by_id[iid].name,
            "is_protected": body.is_protected,
            "is_active": bool(items_by_id[iid].is_active),
        }
        for iid in body.item_ids
    ]


class TransferAllowOut(BaseModel):
    item_id: int
    item_name: str
    allowed_as_transfer_from: bool
    allowed_as_transfer_to: bool
    quantity_mode: bool  # True when parameter_master.quantity_mode_item_id equals item_id (self-ref)
    is_active: bool


class TransferAllowToggle(BaseModel):
    item_ids: list[int]
    field: str  # "from" | "to" | "quantity_mode"
    allowed: bool


@router.get("/items/transfer", response_model=list[TransferAllowOut], summary="List items with transfer allowlist flags")
async def list_transfer_allowlist(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(_admin_or_super),
):
    """Return every item with its (allowed_as_transfer_from, allowed_as_transfer_to) status from the active rules.
    Active items are sorted first, then inactive."""
    from sqlalchemy import select
    from app.models.parameter_master import ParameterMaster as PM

    items_result = await db.execute(
        select(Item).order_by(Item.is_active.desc().nulls_last(), Item.name)
    )
    all_items = list(items_result.scalars().all())

    rules_q = (
        select(PM.item_id, PM.allowed_as_transfer_from, PM.allowed_as_transfer_to, PM.quantity_mode_item_id)
        .where(PM.is_active == True, PM.item_id.isnot(None))
    )
    from_set: set[int] = set()
    to_set: set[int] = set()
    qmode_set: set[int] = set()
    for row in (await db.execute(rules_q)).all():
        if row.allowed_as_transfer_from:
            from_set.add(row.item_id)
        if row.allowed_as_transfer_to:
            to_set.add(row.item_id)
        if row.quantity_mode_item_id is not None and row.quantity_mode_item_id == row.item_id:
            qmode_set.add(row.item_id)

    return [
        {
            "item_id": i.id,
            "item_name": i.name,
            "allowed_as_transfer_from": i.id in from_set,
            "allowed_as_transfer_to": i.id in to_set,
            "quantity_mode": i.id in qmode_set,
            "is_active": bool(i.is_active),
        }
        for i in all_items
    ]


@router.put("/items/transfer/bulk", summary="Bulk toggle transfer allowlist for multiple items")
async def bulk_set_transfer_allowlist(
    body: TransferAllowToggle,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(_admin_or_super),
):
    """
    Set allowed_as_transfer_from OR allowed_as_transfer_to for the given item_ids.
    If no rule exists for an item, creates one with defaults. If a rule exists, updates the chosen flag.
    """
    from sqlalchemy import select
    from app.models.parameter_master import ParameterMaster as PM

    if body.field not in ("from", "to", "quantity_mode"):
        raise HTTPException(status_code=400, detail="field must be 'from', 'to', or 'quantity_mode'")
    if not body.item_ids:
        raise HTTPException(status_code=400, detail="item_ids cannot be empty")

    # Verify items exist
    items_result = await db.execute(select(Item).where(Item.id.in_(body.item_ids)))
    items_by_id = {i.id: i for i in items_result.scalars().all()}
    missing = [iid for iid in body.item_ids if iid not in items_by_id]
    if missing:
        raise HTTPException(status_code=404, detail=f"Items not found: {missing}")

    # For each requested item_id, find or create a PM rule
    existing = await db.execute(
        select(PM).where(PM.item_id.in_(body.item_ids), PM.is_active == True)
    )
    rules_by_item: dict[int, PM] = {}
    for r in existing.scalars().all():
        # If multiple rules per item, use the first one we encounter
        rules_by_item.setdefault(r.item_id, r)

    # Get next priority if we need to insert
    max_priority_result = await db.execute(select(func.coalesce(func.max(PM.priority_order), 0)))
    next_priority = (max_priority_result.scalar() or 0) + 1

    for item_id in body.item_ids:
        rule = rules_by_item.get(item_id)
        if rule is None:
            rule = PM(
                priority_order=next_priority,
                branch_scope=None,
                item_id=item_id,
                payment_mode="CASH",
                ticket_conditions={},
                item_conditions={},
                ticket_selection_order="FIFO",
                max_adjustment_per_ticket=None,
                max_adjustment_per_item=None,
                max_total_adjustment_per_rule=None,
                stop_on_match=False,
                is_active=True,
                is_protected=False,
                min_remaining_per_item=0,
                allowed_as_transfer_from=(body.field == "from" and body.allowed),
                allowed_as_transfer_to=(body.field == "to" and body.allowed),
                quantity_mode_item_id=(item_id if (body.field == "quantity_mode" and body.allowed) else None),
                created_by=current_user.id,
            )
            db.add(rule)
            next_priority += 1
        else:
            if body.field == "from":
                rule.allowed_as_transfer_from = body.allowed
            elif body.field == "to":
                rule.allowed_as_transfer_to = body.allowed
            else:  # quantity_mode
                rule.quantity_mode_item_id = item_id if body.allowed else None

    await db.flush()

    # Return updated list inline (cannot call list_transfer_allowlist via Depends here)
    items_result = await db.execute(select(Item).order_by(Item.name))
    all_items = list(items_result.scalars().all())
    rules_q = (
        select(PM.item_id, PM.allowed_as_transfer_from, PM.allowed_as_transfer_to, PM.quantity_mode_item_id)
        .where(PM.is_active == True, PM.item_id.isnot(None))
    )
    from_set: set[int] = set()
    to_set: set[int] = set()
    qmode_set: set[int] = set()
    for row in (await db.execute(rules_q)).all():
        if row.allowed_as_transfer_from:
            from_set.add(row.item_id)
        if row.allowed_as_transfer_to:
            to_set.add(row.item_id)
        if row.quantity_mode_item_id is not None and row.quantity_mode_item_id == row.item_id:
            qmode_set.add(row.item_id)
    return [
        {
            "item_id": i.id,
            "item_name": i.name,
            "allowed_as_transfer_from": i.id in from_set,
            "allowed_as_transfer_to": i.id in to_set,
            "quantity_mode": i.id in qmode_set,
            "is_active": bool(i.is_active),
        }
        for i in all_items
    ]
