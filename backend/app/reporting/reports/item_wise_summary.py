"""
Item-wise Summary Report.

Returns item-level aggregation across POS and Portal, grouped by
(item_name, rate, levy). Each (item, rate+levy) combination is a
single row showing separate POS and Portal quantities.

Foundation helpers used
-----------------------
  get_source_flags         → which legs to execute
  apply_pos_filters        → WHERE clauses for tickets / ticket_items
  apply_portal_filters     → WHERE clauses for bookings / booking_items
  merge_by_key(skip_sum)   → merge POS + Portal rows without doubling keys
  sort_by_item_id          → item-master order (items.id ASC)

Integrity check
---------------
  After building the result, if both item rows AND a payment mode
  breakdown are present, the grand_total (sum of effective_rate * qty
  over item rows) MUST equal the sum of amounts in the payment_mode
  breakdown.  A mismatch raises ValueError.
"""
from __future__ import annotations

from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.booking import Booking
from app.models.booking_item import BookingItem
from app.models.item import Item
from app.models.payment_mode import PaymentMode
from app.models.ticket import Ticket
from app.models.ticket import TicketItem
from app.reporting.filters import ReportFilters, get_source_flags
from app.reporting.merge import merge_by_key
from app.reporting.query_helpers import apply_portal_filters, apply_pos_filters
from app.reporting.sorting import sort_by_item_id

# Fields that are numeric but must not be summed during merge — these are
# either rates (rate/levy) or identifiers (item_id) that happen to be integer
# columns. If we didn't skip them the merge would do ``1 + 1 = 2``.
_ITEM_SKIP_SUM = frozenset({"item_id", "rate", "levy"})


# ── Public entry point ────────────────────────────────────────────────────────


async def get_item_wise_summary(
    db: AsyncSession,
    filters: ReportFilters,
) -> dict:
    """
    Item-wise Summary Report.

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
                "item_name":       str,
                "rate":            Decimal,  # effective = base_rate + levy
                "quantity":        int,      # pos + portal
                "net_amount":      Decimal,  # rate * quantity
                "pos_quantity":    int,
                "portal_quantity": int,
            },
            ...
        ],
        "grand_total":             Decimal,
        "payment_mode_breakdown":  [
            {"payment_mode_name": str, "amount": Decimal},
            ...
        ],
    }

    Rows are sorted by item master primary key (Item.id ASC) — the
    canonical business order used everywhere in the system.
    Cancelled POS tickets/items and non-CONFIRMED Portal bookings/items are
    excluded.  An integrity check asserts that grand_total equals the sum of
    payment_mode_breakdown amounts.
    """
    include_pos, include_portal = get_source_flags(filters)

    pos_items: list[dict] = []
    pos_payment: list[dict] = []
    if include_pos:
        pos_items = await _query_pos_items(db, filters)
        pos_payment = await _query_pos_payment(db, filters)

    portal_items: list[dict] = []
    portal_payment: list[dict] = []
    if include_portal:
        portal_items = await _query_portal_items(db, filters)
        portal_payment = await _query_portal_payment(db, filters)

    return _build_item_wise_summary_result(pos_items, portal_items, pos_payment, portal_payment)


# ── DB query legs ─────────────────────────────────────────────────────────────


async def _query_pos_items(db: AsyncSession, filters: ReportFilters) -> list[dict]:
    """
    Query POS ticket_items grouped by (item_name, rate, levy).

    Both the ticket AND the item must not be cancelled.
    apply_pos_filters enforces the ticket-level conditions.
    """
    q = (
        select(
            Item.id.label("item_id"),
            Item.name.label("item_name"),
            TicketItem.rate,
            TicketItem.levy,
            func.sum(TicketItem.quantity).label("pos_quantity"),
        )
        .join(Ticket, TicketItem.ticket_id == Ticket.id)
        .join(Item, TicketItem.item_id == Item.id)
        .where(TicketItem.is_cancelled == False)  # noqa: E712
        .group_by(Item.id, Item.name, TicketItem.rate, TicketItem.levy)
    )
    q = apply_pos_filters(q, filters)
    rows = (await db.execute(q)).all()
    return [
        {
            "item_id": int(r.item_id),
            "item_name": r.item_name,
            "rate": Decimal(str(r.rate)),
            "levy": Decimal(str(r.levy)),
            "pos_quantity": int(r.pos_quantity),
            "portal_quantity": 0,
        }
        for r in rows
    ]


async def _query_portal_items(db: AsyncSession, filters: ReportFilters) -> list[dict]:
    """
    Query Portal booking_items grouped by (item_name, rate, levy).

    Both the booking AND the item must qualify.
    apply_portal_filters enforces the booking-level conditions.
    """
    q = (
        select(
            Item.id.label("item_id"),
            Item.name.label("item_name"),
            BookingItem.rate,
            BookingItem.levy,
            func.sum(BookingItem.quantity).label("portal_quantity"),
        )
        .join(Booking, BookingItem.booking_id == Booking.id)
        .join(Item, BookingItem.item_id == Item.id)
        .where(BookingItem.is_cancelled == False)  # noqa: E712
        .group_by(Item.id, Item.name, BookingItem.rate, BookingItem.levy)
    )
    q = apply_portal_filters(q, filters)
    rows = (await db.execute(q)).all()
    return [
        {
            "item_id": int(r.item_id),
            "item_name": r.item_name,
            "rate": Decimal(str(r.rate)),
            "levy": Decimal(str(r.levy)),
            "portal_quantity": int(r.portal_quantity),
            "pos_quantity": 0,
        }
        for r in rows
    ]


async def _query_pos_payment(db: AsyncSession, filters: ReportFilters) -> list[dict]:
    """
    Aggregate Ticket.net_amount by payment mode name for the POS leg.
    """
    q = (
        select(
            PaymentMode.description.label("payment_mode_name"),
            func.coalesce(func.sum(Ticket.net_amount), 0).label("amount"),
        )
        .join(PaymentMode, Ticket.payment_mode_id == PaymentMode.id)
        .group_by(PaymentMode.description)
    )
    q = apply_pos_filters(q, filters)
    rows = (await db.execute(q)).all()
    return [
        {
            "payment_mode_name": r.payment_mode_name,
            "amount": Decimal(str(r.amount)),
        }
        for r in rows
    ]


async def _query_portal_payment(db: AsyncSession, filters: ReportFilters) -> list[dict]:
    """
    Aggregate Booking.net_amount by payment mode name for the Portal leg.
    """
    q = (
        select(
            PaymentMode.description.label("payment_mode_name"),
            func.coalesce(func.sum(Booking.net_amount), 0).label("amount"),
        )
        .join(PaymentMode, Booking.payment_mode_id == PaymentMode.id)
        .group_by(PaymentMode.description)
    )
    q = apply_portal_filters(q, filters)
    rows = (await db.execute(q)).all()
    return [
        {
            "payment_mode_name": r.payment_mode_name,
            "amount": Decimal(str(r.amount)),
        }
        for r in rows
    ]


# ── Pure transformation (testable without DB) ─────────────────────────────────


def _build_item_wise_summary_result(
    pos_items: list[dict],
    portal_items: list[dict],
    pos_payment: list[dict],
    portal_payment: list[dict],
) -> dict:
    """
    Build the final report structure from query results.

    Steps
    -----
    1. Merge POS + Portal item rows by (item_name, rate, levy); use skip_sum
       to prevent rate and levy from being doubled.
    2. For each merged row, compute:
         effective_rate = rate + levy
         quantity       = pos_quantity + portal_quantity
         net_amount     = effective_rate * quantity
    3. Sort item rows by item master primary key (Item.id ASC).
    4. Compute grand_total = sum(net_amount).
    5. Merge POS + Portal payment rows by payment_mode_name and sum amounts.
    6. Integrity check: if both item rows and payment data exist,
       grand_total must equal sum(payment_mode_breakdown.amount).

    Parameters
    ----------
    pos_items     : Output of _query_pos_items (or [] if POS disabled).
    portal_items  : Output of _query_portal_items (or [] if Portal disabled).
    pos_payment   : Output of _query_pos_payment (or [] if POS disabled).
    portal_payment: Output of _query_portal_payment (or [] if Portal disabled).

    Returns
    -------
    {"rows": list[dict], "grand_total": Decimal, "payment_mode_breakdown": list[dict]}
    """
    # Step 1: Merge items — key by (item_id, rate, levy) so POS and Portal
    # rows for the same item combine correctly. skip_sum preserves rate,
    # levy, and item_id from the first row rather than summing them.
    merged_items = merge_by_key(
        pos_items,
        portal_items,
        key_fn=lambda r: (r["item_id"], r["rate"], r["levy"]),
        skip_sum=_ITEM_SKIP_SUM,
    )

    # Step 2: Build item rows
    rows: list[dict] = []
    for m in merged_items:
        pos_qty = int(m.get("pos_quantity", 0))
        portal_qty = int(m.get("portal_quantity", 0))
        quantity = pos_qty + portal_qty
        effective_rate = Decimal(str(m["rate"])) + Decimal(str(m["levy"]))
        net_amount = effective_rate * quantity
        rows.append(
            {
                "item_id": m["item_id"],
                "item_name": m["item_name"],
                "rate": effective_rate,
                "quantity": quantity,
                "net_amount": net_amount,
                "pos_quantity": pos_qty,
                "portal_quantity": portal_qty,
            }
        )

    # Step 3: Sort by item master id (canonical business order) — same
    # rule used across every report on both admin.carferry.online and
    # the main site.
    rows = sort_by_item_id(rows)

    # Step 4: Grand total
    grand_total: Decimal = sum((r["net_amount"] for r in rows), Decimal("0"))

    # Step 5: Merge payment rows by payment_mode_name
    merged_payment = merge_by_key(
        pos_payment,
        portal_payment,
        key_fn=lambda r: r["payment_mode_name"],
    )
    payment_mode_breakdown: list[dict] = [
        {
            "payment_mode_name": r["payment_mode_name"],
            "amount": Decimal(str(r["amount"])),
        }
        for r in merged_payment
    ]

    # Step 6: Integrity check — only when both items AND payment data are present
    if rows and payment_mode_breakdown:
        breakdown_total = sum(
            (r["amount"] for r in payment_mode_breakdown), Decimal("0")
        )
        if grand_total != breakdown_total:
            raise ValueError(
                f"Integrity check failed: item grand_total={grand_total} != "
                f"payment_mode_breakdown_total={breakdown_total}"
            )

    return {
        "rows": rows,
        "grand_total": grand_total,
        "payment_mode_breakdown": payment_mode_breakdown,
    }
