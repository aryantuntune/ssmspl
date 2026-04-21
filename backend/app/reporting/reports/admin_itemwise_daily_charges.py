"""
Admin Report C — Itemwise Daily Collection Charges Summary.

POS-only. Per-date, per-branch item breakdown. Same item at different rates
appears as separate rows (key = (item, rate)). ``amount = rate * quantity``.

Query scope (always):
    - tickets.is_cancelled = false
    - ticket_items.is_cancelled = false
    - ticket_items.quantity > 0
    - ticket_items.rate >= 0
    - ticket_date BETWEEN :date_from AND :date_to
    - route_id = :route_id
    - payment_mode_id IN (1, 2, 3)   # Cash, UPI, Card (POS modes)
"""
from __future__ import annotations

import datetime
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.branch import Branch
from app.models.item import Item
from app.models.route import Route
from app.models.ticket import Ticket, TicketItem

POS_MODE_IDS: tuple[int, ...] = (1, 2, 3)


async def get_itemwise_daily_charges(
    db: AsyncSession,
    date_from: datetime.date,
    date_to: datetime.date,
    route_id: int,
) -> dict:
    """Return the Itemwise Daily Collection Charges Summary as a dict."""
    route, branches = await _fetch_route_and_branches(db, route_id)
    branch_order = {b.id: idx for idx, b in enumerate(branches)}

    raw = await _query_grouped(db, date_from, date_to, route_id)

    # Nest: {date: {branch_id: [row, ...]}}
    nested: dict[datetime.date, dict[int, list[dict]]] = {}
    for r in raw:
        charges = Decimal(str(r.charges))
        quantity = int(r.quantity)
        amount = charges * quantity
        nested.setdefault(r.ticket_date, {}).setdefault(r.branch_id, []).append(
            {
                "item_id": r.item_id,
                "item_name": r.item_name,
                "charges": _fmt(charges),
                "quantity": quantity,
                "amount": _fmt(amount),
                "_charges_raw": charges,
                "_amount_raw": amount,
            }
        )

    # Build output: dates sorted ascending, within each date branches in route
    # order. Within a branch, rows sorted by item_name then by charges.
    date_sections: list[dict] = []
    grand_total = Decimal("0")

    for d in sorted(nested.keys()):
        branch_sections: list[dict] = []
        day_total = Decimal("0")
        by_branch = nested[d]
        for b in branches:
            if b.id not in by_branch:
                continue
            rows = sorted(
                by_branch[b.id],
                key=lambda r: (r["item_name"].upper(), r["_charges_raw"]),
            )
            subtotal = sum((r["_amount_raw"] for r in rows), Decimal("0"))
            # Strip helper fields before emitting
            clean_rows = [
                {
                    "item_id": r["item_id"],
                    "item_name": r["item_name"],
                    "charges": r["charges"],
                    "quantity": r["quantity"],
                    "amount": r["amount"],
                }
                for r in rows
            ]
            branch_sections.append(
                {
                    "branch_id": b.id,
                    "branch_name": b.name,
                    "rows": clean_rows,
                    "subtotal": _fmt(subtotal),
                }
            )
            day_total += subtotal
        # Preserve route order even if one branch is missing that day
        branch_sections.sort(key=lambda s: branch_order.get(s["branch_id"], 99))
        date_sections.append(
            {
                "date": d,
                "branches": branch_sections,
                "day_total": _fmt(day_total),
            }
        )
        grand_total += day_total

    return {
        "route_id": route.id,
        "route_label": _route_label(branches),
        "date_from": date_from,
        "date_to": date_to,
        "dates": date_sections,
        "grand_total": _fmt(grand_total),
    }


async def _fetch_route_and_branches(
    db: AsyncSession, route_id: int
) -> tuple[Route, list[Branch]]:
    route = await db.get(Route, route_id)
    if route is None:
        from fastapi import HTTPException

        raise HTTPException(status_code=404, detail=f"Route {route_id} not found")

    q = select(Branch).where(Branch.id.in_([route.branch_id_one, route.branch_id_two]))
    rs = (await db.execute(q)).scalars().all()
    by_id = {b.id: b for b in rs}
    ordered = [by_id[route.branch_id_one], by_id[route.branch_id_two]]
    return route, ordered


async def _query_grouped(
    db: AsyncSession,
    date_from: datetime.date,
    date_to: datetime.date,
    route_id: int,
) -> list:
    """One row per (date, branch, item, rate) with summed quantity."""
    q = (
        select(
            Ticket.ticket_date.label("ticket_date"),
            Branch.id.label("branch_id"),
            Branch.name.label("branch_name"),
            Item.id.label("item_id"),
            Item.name.label("item_name"),
            TicketItem.rate.label("charges"),
            func.sum(TicketItem.quantity).label("quantity"),
        )
        .join(Ticket, TicketItem.ticket_id == Ticket.id)
        .join(Item, TicketItem.item_id == Item.id)
        .join(Branch, Ticket.branch_id == Branch.id)
        .where(Ticket.is_cancelled == False)  # noqa: E712
        .where(TicketItem.is_cancelled == False)  # noqa: E712
        .where(TicketItem.quantity > 0)
        .where(TicketItem.rate >= 0)
        .where(Ticket.ticket_date >= date_from)
        .where(Ticket.ticket_date <= date_to)
        .where(Ticket.route_id == route_id)
        .where(Ticket.payment_mode_id.in_(POS_MODE_IDS))
        .group_by(
            Ticket.ticket_date,
            Branch.id,
            Branch.name,
            Item.id,
            Item.name,
            TicketItem.rate,
        )
    )
    return (await db.execute(q)).all()


def _route_label(branches: list[Branch]) -> str:
    return " + ".join(b.name for b in branches)


def _fmt(v: Decimal) -> str:
    return f"{Decimal(v):.2f}"
