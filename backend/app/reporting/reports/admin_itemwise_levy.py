"""
Admin Report A — Itemwise Levy Summary.

POS-only. Groups ticket_items by (item_id) and pivots branch quantities
into columns. ``amount = canonical_levy * total_quantity`` per row.

Query scope (always):
    - tickets.is_cancelled = false
    - ticket_items.is_cancelled = false
    - ticket_items.quantity > 0
    - item_rates.levy > 0      # exclude zero-levy items (ambulance, luggage, etc.)
    - ticket_date BETWEEN :date_from AND :date_to
    - route_id = :route_id
    - payment_mode_id IN (1, 2, 3)   # Cash, UPI, Card — POS modes

The levy is read from item_rates (canonical per item+route) rather than
ticket_items.levy. This ensures D-Drive re-categorised tickets are grouped
under the correct item at its correct levy — not scattered across multiple
rows due to the original item's levy being preserved in the ticket record.
"""
from __future__ import annotations

import datetime
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.branch import Branch
from app.models.item import Item
from app.models.item_rate import ItemRate
from app.models.route import Route
from app.models.ticket import Ticket, TicketItem

# POS payment modes (Cash, UPI, Card) per seed_data.sql
POS_MODE_IDS: tuple[int, ...] = (1, 2, 3)


async def get_itemwise_levy_summary(
    db: AsyncSession,
    date_from: datetime.date,
    date_to: datetime.date,
    route_id: int,
) -> dict:
    """Return the Itemwise Levy Summary as a dict ready for the schema."""
    route, branches = await _fetch_route_and_branches(db, route_id)

    rows_raw = await _query_items_by_branch(db, date_from, date_to, route_id)

    # Pivot into {(item_id, item_name, canonical_levy): {branch_id: qty}}
    pivot: dict[tuple[int, str, Decimal], dict[int, int]] = {}
    for r in rows_raw:
        key = (r.item_id, r.item_name, Decimal(str(r.canonical_levy)))
        pivot.setdefault(key, {})[r.branch_id] = int(r.quantity)

    # Build rows in item-master order (items.id ASC).
    sorted_keys = sorted(pivot.keys(), key=lambda k: k[0])
    branch_ids = [b.id for b in branches]

    result_rows: list[dict] = []
    branch_totals: dict[int, Decimal] = {bid: Decimal("0") for bid in branch_ids}
    grand_total = Decimal("0")

    for item_id, item_name, levy in sorted_keys:
        by_branch = pivot[(item_id, item_name, levy)]
        # Fill zeros for branches with no data
        branch_qty = {bid: by_branch.get(bid, 0) for bid in branch_ids}
        total_qty = sum(branch_qty.values())
        amount = levy * total_qty
        result_rows.append(
            {
                "item_id": item_id,
                "item_name": item_name,
                "levy": _fmt(levy),
                "branch_quantities": {str(bid): q for bid, q in branch_qty.items()},
                "total_quantity": total_qty,
                "amount": _fmt(amount),
            }
        )
        for bid, q in branch_qty.items():
            branch_totals[bid] += levy * q
        grand_total += amount

    return {
        "route_id": route.id,
        "route_label": _route_label(branches),
        "date_from": date_from,
        "date_to": date_to,
        "branches": [{"id": b.id, "name": b.name} for b in branches],
        "rows": result_rows,
        "branch_totals": {str(bid): _fmt(v) for bid, v in branch_totals.items()},
        "grand_total": _fmt(grand_total),
    }


async def _fetch_route_and_branches(
    db: AsyncSession, route_id: int
) -> tuple[Route, list[Branch]]:
    """Load the route and its two branches (in route order: branch_one, branch_two)."""
    route = await db.get(Route, route_id)
    if route is None:
        from fastapi import HTTPException

        raise HTTPException(status_code=404, detail=f"Route {route_id} not found")

    q = select(Branch).where(Branch.id.in_([route.branch_id_one, route.branch_id_two]))
    rs = (await db.execute(q)).scalars().all()
    by_id = {b.id: b for b in rs}
    ordered = [by_id[route.branch_id_one], by_id[route.branch_id_two]]
    return route, ordered


async def _query_items_by_branch(
    db: AsyncSession,
    date_from: datetime.date,
    date_to: datetime.date,
    route_id: int,
) -> list:
    """One row per (item, branch) with summed quantity and canonical levy from item_rates."""
    q = (
        select(
            Item.id.label("item_id"),
            Item.name.label("item_name"),
            ItemRate.levy.label("canonical_levy"),
            Branch.id.label("branch_id"),
            Branch.name.label("branch_name"),
            func.sum(TicketItem.quantity).label("quantity"),
        )
        .join(Ticket, TicketItem.ticket_id == Ticket.id)
        .join(Item, TicketItem.item_id == Item.id)
        .join(
            ItemRate,
            (ItemRate.item_id == Item.id)
            & (ItemRate.route_id == route_id)
            & (ItemRate.is_active == True),  # noqa: E712
        )
        .join(Branch, Ticket.branch_id == Branch.id)
        .where(Ticket.is_cancelled == False)  # noqa: E712
        .where(TicketItem.is_cancelled == False)  # noqa: E712
        .where(TicketItem.quantity > 0)
        .where(TicketItem.levy > 0)   # exclude zero-levy individual entries (online/nominal)
        .where(ItemRate.levy > 0)     # exclude items whose canonical levy is zero (e.g. PASS LUG)
        .where(Ticket.ticket_date >= date_from)
        .where(Ticket.ticket_date <= date_to)
        .where(Ticket.route_id == route_id)
        .where(Ticket.payment_mode_id.in_(POS_MODE_IDS))
        .group_by(Item.id, Item.name, ItemRate.levy, Branch.id, Branch.name)
    )
    return (await db.execute(q)).all()


def _route_label(branches: list[Branch]) -> str:
    """Render the route label as '<branch_one.name> + <branch_two.name>'."""
    return " + ".join(b.name for b in branches)


def _fmt(v: Decimal) -> str:
    """Two-decimal string matching PDF layout (no thousands separator)."""
    return f"{Decimal(v):.2f}"
