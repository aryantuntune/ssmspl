"""
Admin Report C — Itemwise Daily Collection Charges Summary.

POS-only. Per-date, per-branch item breakdown. Same item at different rates
appears as separate rows (key = (item, rate)). Per row:
    levy   = sum(ticket_items.levy * ticket_items.quantity)
    amount = (rate * qty) + levy = total collected for the line

Query scope (always):
    - tickets.is_cancelled = false
    - ticket_items.is_cancelled = false
    - ticket_items.quantity > 0
    - ticket_items.rate >= 0
    - ticket_date BETWEEN :date_from AND :date_to
    - route_id = :route_id
    - payment_mode_id IN (1, 2)   # Cash + UPI only — matches Date-Wise Branch

Branch subtotal and day total are computed as SUM(Ticket.net_amount) — the
same source-of-truth that Date-Wise Branch uses — so day totals here equal
the row totals there. Discounts are therefore reflected (item amount cells
can sum higher than the subtotal when a ticket carried a discount).
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

# Cash + UPI only — matches admin_date_branch_summary.py so day totals align.
CASH_UPI_IDS: tuple[int, ...] = (1, 2)


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
    net_amounts = await _query_net_amount_by_date_branch(
        db, date_from, date_to, route_id
    )

    # Nest: {date: {branch_id: [row, ...]}}
    nested: dict[datetime.date, dict[int, list[dict]]] = {}
    for r in raw:
        charges = Decimal(str(r.charges))
        quantity = int(r.quantity)
        levy_total = Decimal(str(r.levy_total))
        amount = charges * quantity + levy_total
        nested.setdefault(r.ticket_date, {}).setdefault(r.branch_id, []).append(
            {
                "item_id": r.item_id,
                "item_name": r.item_name,
                "charges": _fmt(charges),
                "quantity": quantity,
                "levy": _fmt(levy_total),
                "amount": _fmt(amount),
                "_charges_raw": charges,
            }
        )

    # Build output: dates sorted ascending, within each date branches in route
    # order. Within a branch, rows sorted by item_id (items.id ASC) then by
    # charges — the canonical business order.
    date_sections: list[dict] = []
    grand_total = Decimal("0")

    all_dates = sorted(set(nested.keys()) | set(net_amounts.keys()))
    for d in all_dates:
        branch_sections: list[dict] = []
        day_total = Decimal("0")
        by_branch = nested.get(d, {})
        net_for_day = net_amounts.get(d, {})
        for b in branches:
            if b.id not in by_branch and b.id not in net_for_day:
                continue
            rows = sorted(
                by_branch.get(b.id, []),
                key=lambda r: (r["item_id"], r["_charges_raw"]),
            )
            # Subtotal is sum(Ticket.net_amount) for this day+branch — same
            # source Date-Wise Branch uses, so the per-day totals match.
            subtotal = net_for_day.get(b.id, Decimal("0"))
            clean_rows = [
                {
                    "item_id": r["item_id"],
                    "item_name": r["item_name"],
                    "charges": r["charges"],
                    "quantity": r["quantity"],
                    "levy": r["levy"],
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
    """One row per (date, branch, item, rate) with summed quantity and
    summed levy (= levy_per_unit * quantity rolled up)."""
    q = (
        select(
            Ticket.ticket_date.label("ticket_date"),
            Branch.id.label("branch_id"),
            Branch.name.label("branch_name"),
            Item.id.label("item_id"),
            Item.name.label("item_name"),
            TicketItem.rate.label("charges"),
            func.sum(TicketItem.quantity).label("quantity"),
            func.sum(TicketItem.levy * TicketItem.quantity).label("levy_total"),
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
        .where(Ticket.payment_mode_id.in_(CASH_UPI_IDS))
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


async def _query_net_amount_by_date_branch(
    db: AsyncSession,
    date_from: datetime.date,
    date_to: datetime.date,
    route_id: int,
) -> dict[datetime.date, dict[int, Decimal]]:
    """Sum Ticket.net_amount per (date, branch) for Cash+UPI tickets.

    This is the same aggregation the Date-Wise Branch report uses for its
    row total, so using it here keeps the two reports in lockstep — the
    'Total for <route>' row of Daily Charges equals the 'Total' column
    cell for that date in Date-Wise Branch.
    """
    q = (
        select(
            Ticket.ticket_date.label("ticket_date"),
            Ticket.branch_id.label("branch_id"),
            func.sum(Ticket.net_amount).label("amount"),
        )
        .where(Ticket.is_cancelled == False)  # noqa: E712
        .where(Ticket.net_amount >= 0)
        .where(Ticket.ticket_date >= date_from)
        .where(Ticket.ticket_date <= date_to)
        .where(Ticket.route_id == route_id)
        .where(Ticket.payment_mode_id.in_(CASH_UPI_IDS))
        .group_by(Ticket.ticket_date, Ticket.branch_id)
    )
    out: dict[datetime.date, dict[int, Decimal]] = {}
    for r in (await db.execute(q)).all():
        out.setdefault(r.ticket_date, {})[r.branch_id] = Decimal(str(r.amount))
    return out


def _route_label(branches: list[Branch]) -> str:
    return " + ".join(b.name for b in branches)


def _fmt(v: Decimal) -> str:
    return f"{Decimal(v):.2f}"
