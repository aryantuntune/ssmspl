import uuid
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.parameter_master import ParameterMaster
from app.models.ticket import Ticket, TicketItem
from app.models.payment_mode import PaymentMode


async def list_rules(db: AsyncSession) -> list[ParameterMaster]:
    result = await db.execute(
        select(ParameterMaster).order_by(ParameterMaster.priority_order)
    )
    return list(result.scalars().all())


async def get_rule(db: AsyncSession, rule_id: int) -> ParameterMaster | None:
    result = await db.execute(
        select(ParameterMaster).where(ParameterMaster.id == rule_id)
    )
    return result.scalar_one_or_none()


async def create_rule(db: AsyncSession, data: dict, created_by: uuid.UUID) -> ParameterMaster:
    await _make_priority_room(db, data["priority_order"])
    rule = ParameterMaster(**data, created_by=created_by)
    db.add(rule)
    await db.flush()
    await db.refresh(rule)
    return rule


async def update_rule(db: AsyncSession, rule_id: int, data: dict) -> ParameterMaster | None:
    result = await db.execute(select(ParameterMaster).where(ParameterMaster.id == rule_id))
    rule = result.scalar_one_or_none()
    if rule is None:
        return None
    if "priority_order" in data and data["priority_order"] != rule.priority_order:
        await _make_priority_room(db, data["priority_order"], exclude_id=rule_id)
    for k, v in data.items():
        setattr(rule, k, v)
    await db.flush()
    await db.refresh(rule)
    return rule


async def set_rule_status(db: AsyncSession, rule_id: int, is_active: bool) -> ParameterMaster | None:
    result = await db.execute(select(ParameterMaster).where(ParameterMaster.id == rule_id))
    rule = result.scalar_one_or_none()
    if rule is None:
        return None
    rule.is_active = is_active
    await db.flush()
    return rule


async def reorder_rules(db: AsyncSession, ordered_ids: list[int]) -> list[ParameterMaster]:
    """Assign new priority_order values based on the supplied list order."""
    result = await db.execute(
        select(ParameterMaster).where(ParameterMaster.id.in_(ordered_ids))
    )
    rules = {r.id: r for r in result.scalars().all()}
    for idx, rule_id in enumerate(ordered_ids, start=1):
        if rule_id in rules:
            rules[rule_id].priority_order = idx
    await db.flush()
    return sorted(rules.values(), key=lambda r: r.priority_order)


async def preview_rule_matches(
    db: AsyncSession,
    rule_id: int,
    branch_id: int | None,
    date_start: str,
    date_end: str,
) -> dict:
    """Count tickets/items/cash that would match this rule for given filters."""
    result = await db.execute(select(ParameterMaster).where(ParameterMaster.id == rule_id))
    rule = result.scalar_one_or_none()
    if rule is None:
        return {"error": "Rule not found"}

    effective_branch = rule.branch_scope or branch_id

    item_exists_subq = (
        select(TicketItem.id)
        .where(
            TicketItem.ticket_id == Ticket.id,
            TicketItem.is_cancelled == False,
        )
    )
    if rule.item_id:
        item_exists_subq = item_exists_subq.where(TicketItem.item_id == rule.item_id)

    q = (
        select(
            func.count(Ticket.id).label("ticket_count"),
            func.coalesce(func.sum(Ticket.net_amount), 0).label("cash_total"),
        )
        .select_from(Ticket)
        .join(PaymentMode, PaymentMode.id == Ticket.payment_mode_id)
        .where(
            Ticket.ticket_date >= date_start,
            Ticket.ticket_date <= date_end,
            Ticket.is_cancelled == False,
            func.upper(PaymentMode.description) == "CASH",
            item_exists_subq.exists(),
        )
    )
    if effective_branch:
        q = q.where(Ticket.branch_id == effective_branch)

    row = (await db.execute(q)).one()

    item_q = (
        select(func.count(TicketItem.id))
        .select_from(TicketItem)
        .join(Ticket, Ticket.id == TicketItem.ticket_id)
        .join(PaymentMode, PaymentMode.id == Ticket.payment_mode_id)
        .where(
            Ticket.ticket_date >= date_start,
            Ticket.ticket_date <= date_end,
            Ticket.is_cancelled == False,
            TicketItem.is_cancelled == False,
            func.upper(PaymentMode.description) == "CASH",
        )
    )
    if effective_branch:
        item_q = item_q.where(Ticket.branch_id == effective_branch)
    if rule.item_id:
        item_q = item_q.where(TicketItem.item_id == rule.item_id)

    item_count = (await db.execute(item_q)).scalar_one()

    return {
        "eligible_tickets": row.ticket_count or 0,
        "eligible_items": item_count or 0,
        "cash_total": float(row.cash_total or 0),
    }


async def _make_priority_room(db: AsyncSession, priority: int, exclude_id: int | None = None) -> None:
    """Shift rules with priority >= the target up by 1 to make room."""
    q = select(ParameterMaster).where(ParameterMaster.priority_order >= priority)
    if exclude_id is not None:
        q = q.where(ParameterMaster.id != exclude_id)
    result = await db.execute(q)
    for rule in result.scalars().all():
        rule.priority_order += 1
    await db.flush()
