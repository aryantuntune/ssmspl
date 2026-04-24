"""
Ferry-wise Item Summary Report.

Returns per-ferry-slot item quantities, grouped by (departure, item_name).
POS and Portal quantities are kept separate within each row.

NULL departure represents walk-in / open-schedule trips and sorts last
in the output.  The response layer may render None as "No Time".

Foundation helpers used
-----------------------
  get_source_flags              → which legs to execute
  apply_pos_filters             → WHERE clauses for tickets / ticket_items
  apply_portal_filters          → WHERE clauses for bookings / booking_items
  merge_by_key(skip_sum)        → merge POS + Portal rows without altering
                                  the departure time value
  sort_by_departure_then_item   → departure ASC, nulls last, then item ASC
"""
from __future__ import annotations

import datetime
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.booking import Booking
from app.models.booking_item import BookingItem
from app.models.item import Item
from app.models.ticket import Ticket, TicketItem
from app.reporting.filters import ReportFilters, get_source_flags
from app.reporting.merge import merge_by_key
from app.reporting.query_helpers import apply_portal_filters, apply_pos_filters
from app.reporting.sorting import sort_by_departure_then_item

# departure is a time | None — not numeric, but listed in skip_sum for
# explicit safety and documentation intent.
_FERRY_SKIP_SUM = frozenset({"departure", "item_id"})


# ── Public entry point ────────────────────────────────────────────────────────


async def get_ferry_wise_item_summary(
    db: AsyncSession,
    filters: ReportFilters,
) -> dict:
    """
    Ferry-wise Item Summary Report.

    Parameters
    ----------
    db      : Async SQLAlchemy session.
    filters : ReportFilters — controls date range, branch, route,
              payment_mode_id, and source.

    Returns
    -------
    {
        "rows": [
            {
                "departure":       datetime.time | None,
                "item_name":       str,
                "pos_quantity":    int,
                "portal_quantity": int,
                "total_quantity":  int,
            },
            ...
        ],
        "total_quantity": int,
    }

    Rows are sorted by departure time ascending (nulls last), then by
    item_name ascending (case-insensitive).
    Cancelled POS tickets/items and non-CONFIRMED Portal bookings/items
    are excluded.
    """
    include_pos, include_portal = get_source_flags(filters)

    pos_data: list[dict] = []
    if include_pos:
        pos_data = await _query_pos(db, filters)

    portal_data: list[dict] = []
    if include_portal:
        portal_data = await _query_portal(db, filters)

    return _build_ferry_wise_item_result(pos_data, portal_data)


# ── DB query legs ─────────────────────────────────────────────────────────────


async def _query_pos(db: AsyncSession, filters: ReportFilters) -> list[dict]:
    """
    Query POS ticket_items grouped by (departure, item_name).

    Both the ticket AND the item must not be cancelled.
    apply_pos_filters enforces the ticket-level conditions.
    """
    q = (
        select(
            Ticket.departure,
            Item.id.label("item_id"),
            Item.name.label("item_name"),
            func.sum(TicketItem.quantity).label("pos_quantity"),
        )
        .join(TicketItem, TicketItem.ticket_id == Ticket.id)
        .join(Item, TicketItem.item_id == Item.id)
        .where(TicketItem.is_cancelled == False)  # noqa: E712
        .group_by(Ticket.departure, Item.id, Item.name)
    )
    q = apply_pos_filters(q, filters)
    rows = (await db.execute(q)).all()
    return [
        {
            "departure": r.departure,
            "item_id": int(r.item_id),
            "item_name": r.item_name,
            "pos_quantity": int(r.pos_quantity),
            "portal_quantity": 0,
        }
        for r in rows
    ]


async def _query_portal(db: AsyncSession, filters: ReportFilters) -> list[dict]:
    """
    Query Portal booking_items grouped by (departure, item_name).

    Both the booking AND the item must qualify.
    apply_portal_filters enforces the booking-level conditions.
    """
    q = (
        select(
            Booking.departure,
            Item.id.label("item_id"),
            Item.name.label("item_name"),
            func.sum(BookingItem.quantity).label("portal_quantity"),
        )
        .join(BookingItem, BookingItem.booking_id == Booking.id)
        .join(Item, BookingItem.item_id == Item.id)
        .where(BookingItem.is_cancelled == False)  # noqa: E712
        .group_by(Booking.departure, Item.id, Item.name)
    )
    q = apply_portal_filters(q, filters)
    rows = (await db.execute(q)).all()
    return [
        {
            "departure": r.departure,
            "item_id": int(r.item_id),
            "item_name": r.item_name,
            "portal_quantity": int(r.portal_quantity),
            "pos_quantity": 0,
        }
        for r in rows
    ]


# ── Pure transformation (testable without DB) ─────────────────────────────────


def _build_ferry_wise_item_result(
    pos_data: list[dict],
    portal_data: list[dict],
) -> dict:
    """
    Build the final report structure from query results.

    Steps
    -----
    1. Merge POS + Portal rows by (departure, item_name).  skip_sum contains
       "departure" to document that the time value must never be summed.
    2. For each merged row compute total_quantity = pos_quantity + portal_quantity.
    3. Sort by departure ascending (nulls last), then item_name ascending.
    4. Compute total_quantity = sum of all row.total_quantity.

    Parameters
    ----------
    pos_data    : Output of _query_pos (or [] if POS disabled).
    portal_data : Output of _query_portal (or [] if Portal disabled).

    Returns
    -------
    {"rows": list[dict], "total_quantity": int}
    """
    # Step 1: Merge by (departure, item_id). skip_sum preserves item_id and
    # departure from the first row rather than summing.
    merged = merge_by_key(
        pos_data,
        portal_data,
        key_fn=lambda r: (r["departure"], r["item_id"]),
        skip_sum=_FERRY_SKIP_SUM,
    )

    # Step 2: Build rows
    rows: list[dict] = []
    for m in merged:
        pos_qty = int(m.get("pos_quantity", 0))
        portal_qty = int(m.get("portal_quantity", 0))
        rows.append(
            {
                "departure": m["departure"],
                "item_id": m["item_id"],
                "item_name": m["item_name"],
                "pos_quantity": pos_qty,
                "portal_quantity": portal_qty,
                "total_quantity": pos_qty + portal_qty,
            }
        )

    # Step 3: Sort
    rows = sort_by_departure_then_item(rows)

    # Step 4: Grand total
    total_quantity: int = sum(r["total_quantity"] for r in rows)

    return {
        "rows": rows,
        "total_quantity": total_quantity,
    }
