"""
Orchestrator for the three admin reports.

Each public function:
    1. Runs the report query.
    2. Runs the integrity cross-check (items vs tickets).
    3. Raises HTTP 500 on mismatch so a broken report is never served.

The integrity check compares the same filter scope across two independent
aggregations:
    items_total   = SUM(ticket_items.quantity * (ticket_items.rate + ticket_items.levy))
    tickets_total = SUM(tickets.net_amount)

Tolerance: ₹0.01 absolute (absorbs Decimal rounding from NUMERIC(9,2)).
"""
from __future__ import annotations

import datetime
from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ticket import Ticket, TicketItem
from app.reporting.reports.admin_date_branch_summary import (
    CASH_UPI_IDS,
    get_date_branch_summary,
)
from app.reporting.reports.admin_itemwise_daily_charges import (
    POS_MODE_IDS,
    get_itemwise_daily_charges,
)
from app.reporting.reports.admin_itemwise_levy import get_itemwise_levy_summary

TOLERANCE = Decimal("0.01")


# ── Public entry points ───────────────────────────────────────────────────────


async def run_itemwise_levy_summary(
    db: AsyncSession,
    date_from: datetime.date,
    date_to: datetime.date,
    route_id: int,
) -> dict:
    data = await get_itemwise_levy_summary(db, date_from, date_to, route_id)
    await _assert_integrity(
        db, date_from, date_to, route_id, POS_MODE_IDS, context="itemwise_levy_summary"
    )
    return data


async def run_date_branch_summary(
    db: AsyncSession,
    date_from: datetime.date,
    date_to: datetime.date,
    route_id: int,
) -> dict:
    data = await get_date_branch_summary(db, date_from, date_to, route_id)
    # Report B is restricted to Cash+UPI, so integrity must be checked on that
    # subset (the Card-mode tickets have their own items but are excluded here).
    await _assert_integrity(
        db, date_from, date_to, route_id, CASH_UPI_IDS, context="date_branch_summary"
    )
    return data


async def run_itemwise_daily_charges(
    db: AsyncSession,
    date_from: datetime.date,
    date_to: datetime.date,
    route_id: int,
) -> dict:
    data = await get_itemwise_daily_charges(db, date_from, date_to, route_id)
    await _assert_integrity(
        db, date_from, date_to, route_id, POS_MODE_IDS, context="itemwise_daily_charges"
    )
    return data


# ── Integrity check ───────────────────────────────────────────────────────────


async def _assert_integrity(
    db: AsyncSession,
    date_from: datetime.date,
    date_to: datetime.date,
    route_id: int,
    mode_ids: tuple[int, ...],
    context: str,
) -> None:
    """Raise HTTP 500 unless items aggregate matches tickets aggregate."""
    items_total = await _items_total(db, date_from, date_to, route_id, mode_ids)
    tickets_total = await _tickets_total(db, date_from, date_to, route_id, mode_ids)

    if abs(items_total - tickets_total) > TOLERANCE:
        raise HTTPException(
            status_code=500,
            detail=(
                f"Integrity check failed for {context}: "
                f"items_total={items_total} tickets_total={tickets_total} "
                f"diff={items_total - tickets_total}"
            ),
        )


async def _items_total(
    db: AsyncSession,
    date_from: datetime.date,
    date_to: datetime.date,
    route_id: int,
    mode_ids: tuple[int, ...],
) -> Decimal:
    """SUM(quantity * (rate + levy)) over active ticket_items in scope."""
    q = (
        select(
            func.coalesce(
                func.sum(TicketItem.quantity * (TicketItem.rate + TicketItem.levy)),
                0,
            )
        )
        .select_from(TicketItem)
        .join(Ticket, TicketItem.ticket_id == Ticket.id)
        .where(Ticket.is_cancelled == False)  # noqa: E712
        .where(TicketItem.is_cancelled == False)  # noqa: E712
        .where(TicketItem.quantity > 0)
        .where(TicketItem.rate >= 0)
        .where(TicketItem.levy >= 0)
        .where(Ticket.ticket_date >= date_from)
        .where(Ticket.ticket_date <= date_to)
        .where(Ticket.route_id == route_id)
        .where(Ticket.payment_mode_id.in_(mode_ids))
    )
    v = await db.scalar(q)
    return Decimal(str(v or 0))


async def _tickets_total(
    db: AsyncSession,
    date_from: datetime.date,
    date_to: datetime.date,
    route_id: int,
    mode_ids: tuple[int, ...],
) -> Decimal:
    """SUM(Ticket.amount) — gross, before discount — over active tickets in scope.

    We compare against the gross ``amount`` (not ``net_amount``) because the
    integrity check's purpose is to detect drift between the item tree and
    the ticket header. ``amount`` equals ``SUM(qty × (rate + levy))`` by
    construction; ``net_amount`` subtracts a discount that has no
    representation in ticket_items, so using net would generate false
    positives equal to the sum of discounts in the scope.
    """
    q = (
        select(func.coalesce(func.sum(Ticket.amount), 0))
        .where(Ticket.is_cancelled == False)  # noqa: E712
        .where(Ticket.net_amount >= 0)
        .where(Ticket.ticket_date >= date_from)
        .where(Ticket.ticket_date <= date_to)
        .where(Ticket.route_id == route_id)
        .where(Ticket.payment_mode_id.in_(mode_ids))
    )
    v = await db.scalar(q)
    return Decimal(str(v or 0))
