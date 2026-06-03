"""
Admin Report E — Branch Vehicle Traffic (Cash + UPI only).

Cross-route. Ranks branches by total vehicle quantity over a date range.
A "vehicle" is any ticket_items row whose joined items.is_vehicle = True.

Query scope (always):
    - tickets.is_cancelled = false
    - ticket_items.is_cancelled = false
    - ticket_items.quantity > 0
    - items.is_vehicle = true
    - ticket_date BETWEEN :date_from AND :date_to
    - payment_mode_id IN (1, 2)   # Cash + UPI only
    - branch_id IN (:branch_ids)  # if filter provided
"""
from __future__ import annotations

import datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.branch import Branch
from app.models.item import Item
from app.models.ticket import Ticket, TicketItem

CASH_UPI_IDS: tuple[int, ...] = (1, 2)


async def get_branch_vehicle_traffic(
    db: AsyncSession,
    date_from: datetime.date,
    date_to: datetime.date,
    branch_ids: list[int] | None = None,
) -> dict:
    """Return Branch Vehicle Traffic as a dict, ranked highest first."""
    raw = await _query_grouped(db, date_from, date_to, branch_ids)

    rows: list[dict] = []
    grand_total = 0
    for r in raw:
        total = int(r.total_vehicles)
        grand_total += total
        rows.append(
            {
                "branch_id": r.branch_id,
                "branch_name": r.branch_name,
                "total_vehicles": total,
                "rank": 0,  # filled below
            }
        )

    # Assign rank after sorting (query already returns DESC, but be explicit)
    rows.sort(key=lambda x: x["total_vehicles"], reverse=True)
    for idx, row in enumerate(rows, start=1):
        row["rank"] = idx

    return {
        "date_from": date_from,
        "date_to": date_to,
        "rows": rows,
        "grand_total": grand_total,
    }


async def _query_grouped(
    db: AsyncSession,
    date_from: datetime.date,
    date_to: datetime.date,
    branch_ids: list[int] | None,
) -> list:
    """One row per branch with summed vehicle quantity, sorted DESC."""
    q = (
        select(
            Branch.id.label("branch_id"),
            Branch.name.label("branch_name"),
            func.sum(TicketItem.quantity).label("total_vehicles"),
        )
        .join(Ticket, TicketItem.ticket_id == Ticket.id)
        .join(Item, TicketItem.item_id == Item.id)
        .join(Branch, Ticket.branch_id == Branch.id)
        .where(Item.is_vehicle == True)  # noqa: E712
        .where(Ticket.is_cancelled == False)  # noqa: E712
        .where(TicketItem.is_cancelled == False)  # noqa: E712
        .where(TicketItem.quantity > 0)
        .where(Ticket.payment_mode_id.in_(CASH_UPI_IDS))
        .where(Ticket.ticket_date >= date_from)
        .where(Ticket.ticket_date <= date_to)
        .group_by(Branch.id, Branch.name)
        .order_by(func.sum(TicketItem.quantity).desc())
    )
    if branch_ids:
        q = q.where(Ticket.branch_id.in_(branch_ids))
    return (await db.execute(q)).all()
