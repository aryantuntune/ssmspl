from datetime import date
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.ticket import Ticket, TicketItem
from app.models.branch import Branch
from app.models.payment_mode import PaymentMode
from app.models.user import User
from app.models.item import Item


async def get_branch_summary(
    db: AsyncSession,
    date_start: date,
    date_end: date,
    branch_id: int | None = None,
    payment_mode_name: str | None = None,
    item_id: int | None = None,
) -> list[dict]:
    """Aggregate collection by branch, broken down by payment mode."""
    q = (
        select(
            Branch.id.label("branch_id"),
            Branch.name.label("branch_name"),
            PaymentMode.description.label("payment_mode"),
            func.count(Ticket.id).label("ticket_count"),
            func.coalesce(func.sum(Ticket.net_amount), 0).label("total"),
        )
        .select_from(Ticket)
        .join(Branch, Branch.id == Ticket.branch_id)
        .join(PaymentMode, PaymentMode.id == Ticket.payment_mode_id)
        .where(
            Ticket.ticket_date >= date_start,
            Ticket.ticket_date <= date_end,
            Ticket.is_cancelled == False,
        )
    )
    if branch_id:
        q = q.where(Ticket.branch_id == branch_id)
    if payment_mode_name:
        q = q.where(func.upper(PaymentMode.description) == payment_mode_name.upper())
    if item_id:
        item_exists = (
            select(TicketItem.id)
            .where(
                TicketItem.ticket_id == Ticket.id,
                TicketItem.item_id == item_id,
                TicketItem.is_cancelled == False,
            )
            .exists()
        )
        q = q.where(item_exists)
    q = q.group_by(Branch.id, Branch.name, PaymentMode.description).order_by(Branch.name)

    rows = (await db.execute(q)).all()

    # Pivot by branch: aggregate cash/upi/online columns. Only ONLINE goes in
    # the Online bucket (portal/Airpay payments). Any other mode (e.g. Card)
    # falls into "other" so it isn't misreported as Online.
    branches: dict[int, dict] = {}
    for row in rows:
        bid = row.branch_id
        if bid not in branches:
            branches[bid] = {
                "branch_id": bid,
                "branch_name": row.branch_name,
                "ticket_count": 0,
                "total": 0.0,
                "cash": 0.0,
                "upi": 0.0,
                "online": 0.0,
                "other": 0.0,
            }
        branches[bid]["total"] += float(row.total or 0)
        branches[bid]["ticket_count"] += row.ticket_count or 0
        mode = (row.payment_mode or "").upper()
        if mode == "CASH":
            branches[bid]["cash"] += float(row.total or 0)
        elif mode == "UPI":
            branches[bid]["upi"] += float(row.total or 0)
        elif mode == "ONLINE":
            branches[bid]["online"] += float(row.total or 0)
        else:
            branches[bid]["other"] += float(row.total or 0)

    return list(branches.values())


async def list_tickets(
    db: AsyncSession,
    date_start: date,
    date_end: date,
    branch_id: int | None = None,
    payment_mode_name: str | None = None,
    item_id: int | None = None,
    page: int = 1,
    page_size: int = 50,
) -> dict:
    """Paginated ticket list with optional filters."""
    base = (
        select(
            Ticket.id,
            Ticket.ticket_date,
            Ticket.net_amount,
            Branch.name.label("branch_name"),
            PaymentMode.description.label("payment_mode"),
            User.full_name.label("operator_name"),
        )
        .select_from(Ticket)
        .join(Branch, Branch.id == Ticket.branch_id)
        .join(PaymentMode, PaymentMode.id == Ticket.payment_mode_id)
        .outerjoin(User, User.id == Ticket.created_by)
        .where(
            Ticket.ticket_date >= date_start,
            Ticket.ticket_date <= date_end,
            Ticket.is_cancelled == False,
        )
    )
    if branch_id:
        base = base.where(Ticket.branch_id == branch_id)
    if payment_mode_name:
        base = base.where(func.upper(PaymentMode.description) == payment_mode_name.upper())
    if item_id:
        item_exists = (
            select(TicketItem.id)
            .where(
                TicketItem.ticket_id == Ticket.id,
                TicketItem.item_id == item_id,
                TicketItem.is_cancelled == False,
            )
            .exists()
        )
        base = base.where(item_exists)

    total_q = select(func.count()).select_from(base.subquery())
    total = (await db.execute(total_q)).scalar_one()

    rows = (
        await db.execute(
            base.order_by(Ticket.id.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    ).all()

    # Fetch item summaries for this page of tickets
    ticket_ids = [r.id for r in rows]
    items_by_ticket: dict[int, list[str]] = {}
    if ticket_ids:
        items_q = (
            select(TicketItem.ticket_id, Item.name, TicketItem.quantity)
            .join(Item, Item.id == TicketItem.item_id)
            .where(TicketItem.ticket_id.in_(ticket_ids), TicketItem.is_cancelled == False)
        )
        item_rows = (await db.execute(items_q)).all()
        for ir in item_rows:
            items_by_ticket.setdefault(ir.ticket_id, []).append(f"{ir.quantity}x {ir.name}")

    # Detect which tickets have been modified via adjustments
    modified_ticket_ids: set[int] = set()
    if ticket_ids:
        mod_q = (
            select(TicketItem.ticket_id)
            .where(
                TicketItem.ticket_id.in_(ticket_ids),
                TicketItem.is_cancelled == False,
                TicketItem.last_adjustment_id.is_not(None),
            )
            .distinct()
        )
        mod_rows = (await db.execute(mod_q)).scalars().all()
        modified_ticket_ids = set(mod_rows)

    tickets = [
        {
            "id": r.id,
            "ticket_date": r.ticket_date.isoformat() if r.ticket_date else None,
            "branch_name": r.branch_name,
            "payment_mode": r.payment_mode,
            "net_amount": float(r.net_amount),
            "operator_name": r.operator_name,
            "item_summary": ", ".join(items_by_ticket.get(r.id, [])),
            "is_modified": r.id in modified_ticket_ids,
        }
        for r in rows
    ]

    return {
        "tickets": tickets,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": max(1, (total + page_size - 1) // page_size),
    }
