"""
Orchestrator for the three admin reports.

Each public function:
    1. Runs the report query.
    2. Computes an integrity cross-check (items vs ticket headers).
    3. Attaches an ``integrity_warning`` to the response if drift exceeds the
       tolerance. The report itself is always returned so a small data
       inconsistency does not block operations — the UI surfaces the warning
       so admins can investigate.

Check semantics
---------------
``Ticket.amount`` is the gross subtotal at creation time (matches the original
item tree). The check validates:

    items_total   = SUM over *all* ticket_items (including is_cancelled=true)
                        of qty * (rate + levy)
    tickets_total = SUM over non-cancelled tickets of Ticket.amount

Both sums cover the SAME universe because ``Ticket.amount`` was written from
the full item tree. Differences now point to real drift:

    * Admin adjustments that changed rate/quantity without re-syncing
      Ticket.amount.
    * Transfer logic that mutates item rows without touching the header.
    * Hard-deleted ticket_items rows.

False positives intentionally suppressed:

    * Discounts (we compare Ticket.amount, not net_amount — see db22783).
    * Partial item cancellations (cancelled items stay in items_total — this
      commit).
    * Decimal rounding within ±₹0.01 tolerance.
"""
from __future__ import annotations

import datetime
import logging
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ticket import Ticket, TicketItem
from app.reporting.reports.admin_date_branch_summary import (
    CASH_UPI_IDS,
    get_date_branch_summary,
)
from app.reporting.reports.admin_itemwise_daily_charges import (
    CASH_UPI_IDS as DAILY_CHARGES_MODES,
    get_itemwise_daily_charges,
)
from app.reporting.reports.admin_itemwise_levy import POS_MODE_IDS
from app.reporting.reports.admin_itemwise_levy import get_itemwise_levy_summary
from app.reporting.reports.admin_month_branch_summary import (
    get_month_branch_summary,
)

logger = logging.getLogger(__name__)

TOLERANCE = Decimal("0.01")


# ── Public entry points ───────────────────────────────────────────────────────


async def run_itemwise_levy_summary(
    db: AsyncSession,
    date_from: datetime.date,
    date_to: datetime.date,
    route_id: int,
) -> dict:
    data = await get_itemwise_levy_summary(db, date_from, date_to, route_id)
    warning = await _check_integrity(
        db, date_from, date_to, route_id, POS_MODE_IDS, context="itemwise_levy_summary"
    )
    if warning:
        data["integrity_warning"] = warning
    return data


async def run_date_branch_summary(
    db: AsyncSession,
    date_from: datetime.date,
    date_to: datetime.date,
    route_id: int,
) -> dict:
    data = await get_date_branch_summary(db, date_from, date_to, route_id)
    warning = await _check_integrity(
        db, date_from, date_to, route_id, CASH_UPI_IDS, context="date_branch_summary"
    )
    if warning:
        data["integrity_warning"] = warning
    return data


async def run_itemwise_daily_charges(
    db: AsyncSession,
    date_from: datetime.date,
    date_to: datetime.date,
    route_id: int,
) -> dict:
    data = await get_itemwise_daily_charges(db, date_from, date_to, route_id)
    # Daily Charges now filters Cash+UPI only (matches Date-Wise Branch), so
    # the integrity check must scope to the same modes — otherwise it would
    # compare apples (item totals across Cash+UPI+Card) to oranges (daily
    # charges subtotal across Cash+UPI only).
    warning = await _check_integrity(
        db, date_from, date_to, route_id, DAILY_CHARGES_MODES, context="itemwise_daily_charges"
    )
    if warning:
        data["integrity_warning"] = warning
    return data


async def run_month_branch_summary(
    db: AsyncSession,
    date_from: datetime.date,
    date_to: datetime.date,
    branch_ids: list[int] | None = None,
) -> dict:
    """Cross-route monthly aggregate. No route_id filter — spans every
    selected branch across whatever routes they belong to."""
    data = await get_month_branch_summary(db, date_from, date_to, branch_ids)
    warning = await _check_integrity_cross_route(
        db, date_from, date_to, branch_ids, CASH_UPI_IDS,
        context="month_branch_summary",
    )
    if warning:
        data["integrity_warning"] = warning
    return data


# ── Integrity check ───────────────────────────────────────────────────────────


async def _check_integrity_cross_route(
    db: AsyncSession,
    date_from: datetime.date,
    date_to: datetime.date,
    branch_ids: list[int] | None,
    mode_ids: tuple[int, ...],
    context: str,
) -> dict | None:
    """Cross-route variant: no route filter; optional branch_ids filter.

    Used by the Month-Wise Branch Summary which aggregates across all
    routes. Same semantics as ``_check_integrity`` — items_total includes
    cancelled items so it matches Ticket.amount, which is set at creation
    from the full item tree.
    """
    try:
        items_q = (
            select(
                func.coalesce(
                    func.sum(TicketItem.quantity * (TicketItem.rate + TicketItem.levy)),
                    0,
                )
            )
            .select_from(TicketItem)
            .join(Ticket, TicketItem.ticket_id == Ticket.id)
            .where(Ticket.is_cancelled == False)  # noqa: E712
            .where(TicketItem.quantity > 0)
            .where(TicketItem.rate >= 0)
            .where(TicketItem.levy >= 0)
            .where(Ticket.ticket_date >= date_from)
            .where(Ticket.ticket_date <= date_to)
            .where(Ticket.payment_mode_id.in_(mode_ids))
        )
        tickets_q = (
            select(func.coalesce(func.sum(Ticket.amount), 0))
            .where(Ticket.is_cancelled == False)  # noqa: E712
            .where(Ticket.amount >= 0)
            .where(Ticket.ticket_date >= date_from)
            .where(Ticket.ticket_date <= date_to)
            .where(Ticket.payment_mode_id.in_(mode_ids))
        )
        if branch_ids:
            items_q = items_q.where(Ticket.branch_id.in_(branch_ids))
            tickets_q = tickets_q.where(Ticket.branch_id.in_(branch_ids))

        items_total = Decimal(str((await db.scalar(items_q)) or 0))
        tickets_total = Decimal(str((await db.scalar(tickets_q)) or 0))
    except Exception as e:
        logger.warning("integrity check query failed for %s: %s", context, e)
        return None

    diff = items_total - tickets_total
    if abs(diff) <= TOLERANCE:
        return None

    msg = (
        f"Totals show a ₹{abs(diff):.2f} drift between ticket_items and "
        f"ticket headers over the selected range."
    )
    logger.warning(
        "integrity drift in %s: items=%s tickets=%s diff=%s",
        context, items_total, tickets_total, diff,
    )
    return {
        "items_total": f"{items_total:.2f}",
        "tickets_total": f"{tickets_total:.2f}",
        "diff": f"{diff:.2f}",
        "message": msg,
        "sample_tickets": [],
    }


async def _check_integrity(
    db: AsyncSession,
    date_from: datetime.date,
    date_to: datetime.date,
    route_id: int,
    mode_ids: tuple[int, ...],
    context: str,
) -> dict | None:
    """Return None if clean, else a dict describing the drift.

    Never raises. The caller attaches the warning to the report payload; the
    report always generates so admins can still access data while they
    investigate the inconsistency.
    """
    try:
        items_total = await _items_total(db, date_from, date_to, route_id, mode_ids)
        tickets_total = await _tickets_total(db, date_from, date_to, route_id, mode_ids)
    except Exception as e:
        # Never let the integrity check itself break the report.
        logger.warning("integrity check query failed for %s: %s", context, e)
        return None

    diff = items_total - tickets_total
    if abs(diff) <= TOLERANCE:
        return None

    # Identify up to 5 specific tickets with drift so admins can investigate.
    sample = await _sample_drifted_tickets(
        db, date_from, date_to, route_id, mode_ids, limit=5
    )

    msg = (
        f"Totals show a ₹{abs(diff):.2f} drift between ticket_items and ticket "
        f"headers over the selected range. The report is generated from the "
        f"current item tree; investigate ticket_items/Ticket.amount sync for "
        f"listed tickets."
    )
    logger.warning(
        "integrity drift in %s: items=%s tickets=%s diff=%s sample=%s",
        context, items_total, tickets_total, diff, sample,
    )
    return {
        "items_total": f"{items_total:.2f}",
        "tickets_total": f"{tickets_total:.2f}",
        "diff": f"{diff:.2f}",
        "message": msg,
        "sample_tickets": sample,
    }


async def _items_total(
    db: AsyncSession,
    date_from: datetime.date,
    date_to: datetime.date,
    route_id: int,
    mode_ids: tuple[int, ...],
) -> Decimal:
    """SUM(qty * (rate + levy)) over ALL ticket_items on active tickets in scope.

    Includes cancelled items intentionally: ``Ticket.amount`` was written from
    the full item tree at creation time and is not re-synced when individual
    items are cancelled later. Excluding cancelled items here would create
    false-positive drift equal to the sum of cancelled line items.
    """
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
    """SUM(Ticket.amount) — gross, before discount — over active tickets in scope."""
    q = (
        select(func.coalesce(func.sum(Ticket.amount), 0))
        .where(Ticket.is_cancelled == False)  # noqa: E712
        .where(Ticket.amount >= 0)
        .where(Ticket.ticket_date >= date_from)
        .where(Ticket.ticket_date <= date_to)
        .where(Ticket.route_id == route_id)
        .where(Ticket.payment_mode_id.in_(mode_ids))
    )
    v = await db.scalar(q)
    return Decimal(str(v or 0))


async def _sample_drifted_tickets(
    db: AsyncSession,
    date_from: datetime.date,
    date_to: datetime.date,
    route_id: int,
    mode_ids: tuple[int, ...],
    limit: int = 5,
) -> list[dict]:
    """Return up to `limit` tickets whose header amount disagrees with their
    item tree (summed over all items, cancelled included). Helps an admin
    locate the specific tickets that caused the drift.
    """
    items_subq = (
        select(
            TicketItem.ticket_id.label("ticket_id"),
            func.coalesce(
                func.sum(TicketItem.quantity * (TicketItem.rate + TicketItem.levy)),
                0,
            ).label("items_sum"),
        )
        .where(TicketItem.quantity > 0)
        .where(TicketItem.rate >= 0)
        .where(TicketItem.levy >= 0)
        .group_by(TicketItem.ticket_id)
        .subquery()
    )

    q = (
        select(
            Ticket.id.label("ticket_id"),
            Ticket.ticket_no.label("ticket_no"),
            Ticket.amount.label("amount"),
            func.coalesce(items_subq.c.items_sum, 0).label("items_sum"),
        )
        .outerjoin(items_subq, Ticket.id == items_subq.c.ticket_id)
        .where(Ticket.is_cancelled == False)  # noqa: E712
        .where(Ticket.ticket_date >= date_from)
        .where(Ticket.ticket_date <= date_to)
        .where(Ticket.route_id == route_id)
        .where(Ticket.payment_mode_id.in_(mode_ids))
    )
    result = (await db.execute(q)).all()

    drift: list[dict] = []
    for row in result:
        header = Decimal(str(row.amount))
        items = Decimal(str(row.items_sum))
        d = header - items
        if abs(d) > TOLERANCE:
            drift.append(
                {
                    "ticket_id": row.ticket_id,
                    "ticket_no": row.ticket_no,
                    "ticket_amount": f"{header:.2f}",
                    "items_sum": f"{items:.2f}",
                    "diff": f"{d:.2f}",
                }
            )
            if len(drift) >= limit:
                break
    return drift
