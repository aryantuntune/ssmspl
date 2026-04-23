"""
One-shot migration: reconcile Ticket.amount and Ticket.net_amount against
the current item tree.

Background
----------
The admin adjustment engine's round-off step had a bug (fixed separately)
that left Ticket.amount stale whenever the round-off ticket was also among
the tickets whose items were being deleted in the same batch. The earlier
recompute ran *before* the round-off mutation, so it captured pre-round-off
state.

This script reconciles every non-cancelled ticket by setting:
    amount     = SUM((rate + levy) * quantity) over non-cancelled items
    net_amount = amount - COALESCE(discount, 0)

The calculation matches the production code paths (creation, adjustment
engine recompute). Tickets with no items (orphaned headers) are flagged
separately and NOT touched — those require human review.

Usage
-----
    # Dry run — prints affected tickets and totals, does not write
    python scripts/fix_ticket_amount_drift.py

    # Apply
    python scripts/fix_ticket_amount_drift.py --apply

    # Apply against a specific database
    DATABASE_URL=postgresql+asyncpg://... python scripts/fix_ticket_amount_drift.py --apply

The script is idempotent: running it twice on a clean database is a no-op.
"""
from __future__ import annotations

import argparse
import asyncio
import datetime
import os
import sys
from decimal import Decimal

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine


TOLERANCE = Decimal("0.01")


async def audit(conn) -> tuple[list[dict], list[dict]]:
    """Return (drifted_tickets, orphan_tickets)."""
    rows = (await conn.execute(text("""
        WITH item_sums AS (
            SELECT
                ticket_id,
                SUM((rate + levy) * quantity) FILTER (WHERE is_cancelled = false) AS live_gross,
                COUNT(*) AS total_items,
                COUNT(*) FILTER (WHERE is_cancelled = false) AS live_items
            FROM ticket_items
            WHERE quantity > 0 AND rate >= 0 AND levy >= 0
            GROUP BY ticket_id
        )
        SELECT
            t.id,
            t.ticket_no,
            t.ticket_date,
            t.branch_id,
            t.amount                                AS current_amount,
            COALESCE(t.discount, 0)                 AS discount,
            t.net_amount                            AS current_net,
            COALESCE(i.live_gross, 0)               AS expected_amount,
            COALESCE(i.live_gross, 0) - COALESCE(t.discount, 0) AS expected_net,
            COALESCE(i.total_items, 0)              AS total_items,
            COALESCE(i.live_items, 0)               AS live_items
        FROM tickets t
        LEFT JOIN item_sums i ON t.id = i.ticket_id
        WHERE t.is_cancelled = false
    """))).mappings().all()

    drifted: list[dict] = []
    orphan: list[dict] = []

    for r in rows:
        if r["total_items"] == 0:
            orphan.append(dict(r))
            continue
        amt_diff = Decimal(str(r["current_amount"])) - Decimal(str(r["expected_amount"]))
        net_diff = Decimal(str(r["current_net"])) - Decimal(str(r["expected_net"]))
        if abs(amt_diff) > TOLERANCE or abs(net_diff) > TOLERANCE:
            d = dict(r)
            d["amount_diff"] = amt_diff
            d["net_diff"] = net_diff
            drifted.append(d)

    return drifted, orphan


async def apply_fix(conn, drifted: list[dict]) -> None:
    """Reconcile drifted tickets in a single transactional batch."""
    if not drifted:
        return
    ids = [d["id"] for d in drifted]
    # Same recompute query used by the adjustment engine and ticket creation.
    await conn.execute(
        text("""
            UPDATE tickets
            SET
                amount = (
                    SELECT COALESCE(SUM((ti.rate + ti.levy) * ti.quantity), 0)
                    FROM ticket_items ti
                    WHERE ti.ticket_id = tickets.id AND ti.is_cancelled = false
                ),
                net_amount = (
                    SELECT COALESCE(SUM((ti.rate + ti.levy) * ti.quantity), 0)
                    FROM ticket_items ti
                    WHERE ti.ticket_id = tickets.id AND ti.is_cancelled = false
                ) - COALESCE(discount, 0)
            WHERE id = ANY(:ids)
        """),
        {"ids": ids},
    )


def summarise(drifted: list[dict], orphan: list[dict]) -> None:
    total_amt_delta = sum((d["amount_diff"] for d in drifted), Decimal("0"))
    total_net_delta = sum((d["net_diff"] for d in drifted), Decimal("0"))
    print(f"Drifted tickets:  {len(drifted)}")
    print(f"Orphan tickets:   {len(orphan)}  (no items — manual review)")
    print(f"Total amount delta (current - expected):  {total_amt_delta:+.2f}")
    print(f"Total net delta    (current - expected):  {total_net_delta:+.2f}")

    if drifted:
        date_min = min(d["ticket_date"] for d in drifted)
        date_max = max(d["ticket_date"] for d in drifted)
        print(f"Drift date range: {date_min} -> {date_max}")
        print()
        print("Sample of up to 10 drifted tickets:")
        print(f"  {'ticket_no':>10}  {'date':10}  {'cur_amt':>12}  "
              f"{'expected':>12}  {'diff':>10}")
        for d in drifted[:10]:
            print(f"  {d['ticket_no']:>10}  {d['ticket_date']!s:10}  "
                  f"{d['current_amount']:>12}  {d['expected_amount']:>12}  "
                  f"{d['amount_diff']:>+10.2f}")


async def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true",
                        help="Write the fix. Without this flag, only audit.")
    parser.add_argument("--database-url", default=os.getenv("DATABASE_URL"),
                        help="Async SQLAlchemy DB URL. Defaults to $DATABASE_URL.")
    args = parser.parse_args()

    if not args.database_url:
        print("ERROR: DATABASE_URL not set and --database-url not provided.",
              file=sys.stderr)
        return 2

    engine = create_async_engine(args.database_url)
    try:
        async with engine.begin() as conn:
            print(f"# ticket amount/net drift audit  ({datetime.datetime.now():%Y-%m-%d %H:%M:%S})")
            drifted, orphan = await audit(conn)
            summarise(drifted, orphan)

            if not args.apply:
                print()
                print("Dry run complete. Re-run with --apply to write the fix.")
                return 0

            if not drifted:
                print()
                print("Nothing to do.")
                return 0

            print()
            print(f"Applying fix to {len(drifted)} tickets…")
            await apply_fix(conn, drifted)

        # Re-audit in a fresh transaction to confirm clean state.
        async with engine.begin() as conn:
            post_drifted, _ = await audit(conn)
        print(f"Post-fix drifted tickets: {len(post_drifted)}")
        if post_drifted:
            print("WARNING: drift remains after fix. Investigate manually.")
            return 1
        print("[OK] All tickets reconciled.")
        return 0
    finally:
        await engine.dispose()


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
