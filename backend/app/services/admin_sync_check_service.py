"""
Sync-check service — read-only diagnostic that compares ssmspl_admin against
ssmspl_sync (the prod replica) for a given branch + date range.

Use case: after a rollback (or to audit admin-side drift), verify that every
ticket and ticket_item in the admin DB matches what's in the sync mirror.

No mutations. Results are structured: summary counts + per-row mismatch details.
"""
from datetime import date
from decimal import Decimal
from typing import Any

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database_sync import SyncSessionLocal, is_sync_configured
from fastapi import HTTPException


def _norm_decimal(v: Any) -> str | None:
    """Normalize a numeric value (Decimal / float / str / None) to a 2-decimal string for comparison."""
    if v is None:
        return None
    return str(Decimal(str(v)).quantize(Decimal("0.01")))


def _norm_date(v: Any) -> str | None:
    if v is None:
        return None
    return str(v)


async def _fetch_tickets(session: AsyncSession, branch_id: int | None, date_start: date, date_end: date) -> dict[int, dict]:
    """Fetch tickets (keyed by id) in range via raw SQL for identical shape across both DBs."""
    params = {"date_start": date_start, "date_end": date_end}
    where = ["ticket_date BETWEEN :date_start AND :date_end"]
    if branch_id is not None:
        where.append("branch_id = :branch_id")
        params["branch_id"] = branch_id
    q = f"""
        SELECT id, branch_id, ticket_no, ticket_date, route_id,
               amount, discount, payment_mode_id, is_cancelled,
               net_amount, status, is_multi_ticket
        FROM tickets
        WHERE {" AND ".join(where)}
    """
    rows = (await session.execute(text(q), params)).mappings().all()
    return {
        r["id"]: {
            "id": r["id"],
            "branch_id": r["branch_id"],
            "ticket_no": r["ticket_no"],
            "ticket_date": _norm_date(r["ticket_date"]),
            "route_id": r["route_id"],
            "amount": _norm_decimal(r["amount"]),
            "discount": _norm_decimal(r["discount"]),
            "payment_mode_id": r["payment_mode_id"],
            "is_cancelled": bool(r["is_cancelled"]),
            "net_amount": _norm_decimal(r["net_amount"]),
            "status": r["status"],
            "is_multi_ticket": bool(r["is_multi_ticket"]),
        }
        for r in rows
    }


async def _fetch_ticket_items(session: AsyncSession, ticket_ids: list[int]) -> dict[int, dict]:
    """Fetch ticket_items (keyed by id) for the given tickets."""
    if not ticket_ids:
        return {}
    rows = (
        await session.execute(
            text("""
                SELECT id, ticket_id, item_id, rate, levy, quantity,
                       is_cancelled, vehicle_no, vehicle_name
                FROM ticket_items
                WHERE ticket_id = ANY(:ids)
            """),
            {"ids": ticket_ids},
        )
    ).mappings().all()
    return {
        r["id"]: {
            "id": r["id"],
            "ticket_id": r["ticket_id"],
            "item_id": r["item_id"],
            "rate": _norm_decimal(r["rate"]),
            "levy": _norm_decimal(r["levy"]),
            "quantity": int(r["quantity"]),
            "is_cancelled": bool(r["is_cancelled"]),
            "vehicle_no": r["vehicle_no"],
            "vehicle_name": r["vehicle_name"],
        }
        for r in rows
    }


def _diff_row(a: dict, b: dict, ignore_keys: set[str] = set()) -> list[dict]:
    """Return a list of {field, admin, sync} for every differing field."""
    diffs = []
    for k in a.keys():
        if k in ignore_keys:
            continue
        if a.get(k) != b.get(k):
            diffs.append({"field": k, "admin": a.get(k), "sync": b.get(k)})
    return diffs


async def run_sync_check(
    admin_db: AsyncSession,
    branch_id: int | None,
    date_start: date,
    date_end: date,
) -> dict:
    """
    Compare tickets + ticket_items between ssmspl_admin (admin_db) and ssmspl_sync (secondary).
    Returns a structured diff suitable for the history UI.
    """
    if not is_sync_configured():
        raise HTTPException(
            status_code=503,
            detail=(
                "Sync-check is not configured on this server. Ask the system administrator "
                "to set SYNC_DATABASE_URL in the admin backend environment."
            ),
        )
    if date_end < date_start:
        raise HTTPException(status_code=400, detail="date_end must be >= date_start")

    # Fetch both sides for the date range / branch
    admin_tickets = await _fetch_tickets(admin_db, branch_id, date_start, date_end)

    assert SyncSessionLocal is not None
    async with SyncSessionLocal() as sync_session:
        sync_tickets = await _fetch_tickets(sync_session, branch_id, date_start, date_end)

        all_ticket_ids = list(set(admin_tickets.keys()) | set(sync_tickets.keys()))
        admin_items = await _fetch_ticket_items(admin_db, all_ticket_ids)
        sync_items = await _fetch_ticket_items(sync_session, all_ticket_ids)

    # Ticket comparisons
    tickets_missing_in_admin: list[int] = []
    tickets_only_in_admin: list[int] = []
    tickets_field_mismatch: list[dict] = []

    for tid, sticket in sync_tickets.items():
        atticket = admin_tickets.get(tid)
        if atticket is None:
            tickets_missing_in_admin.append(tid)
            continue
        diffs = _diff_row(atticket, sticket)
        if diffs:
            tickets_field_mismatch.append({
                "ticket_id": tid,
                "branch_id": sticket["branch_id"],
                "ticket_date": sticket["ticket_date"],
                "diffs": diffs,
            })

    for tid in admin_tickets.keys():
        if tid not in sync_tickets:
            tickets_only_in_admin.append(tid)

    # Ticket-item comparisons
    items_missing_in_admin: list[dict] = []
    items_only_in_admin: list[dict] = []
    items_field_mismatch: list[dict] = []

    for iid, sitem in sync_items.items():
        aitem = admin_items.get(iid)
        if aitem is None:
            items_missing_in_admin.append({
                "ticket_item_id": iid,
                "ticket_id": sitem["ticket_id"],
                "item_id": sitem["item_id"],
                "rate": sitem["rate"],
                "levy": sitem["levy"],
                "quantity": sitem["quantity"],
            })
            continue
        diffs = _diff_row(aitem, sitem)
        if diffs:
            items_field_mismatch.append({
                "ticket_item_id": iid,
                "ticket_id": sitem["ticket_id"],
                "diffs": diffs,
            })

    for iid, aitem in admin_items.items():
        if iid not in sync_items:
            items_only_in_admin.append({
                "ticket_item_id": iid,
                "ticket_id": aitem["ticket_id"],
                "item_id": aitem["item_id"],
                "rate": aitem["rate"],
                "levy": aitem["levy"],
                "quantity": aitem["quantity"],
            })

    in_sync = (
        not tickets_missing_in_admin
        and not tickets_only_in_admin
        and not tickets_field_mismatch
        and not items_missing_in_admin
        and not items_only_in_admin
        and not items_field_mismatch
    )

    return {
        "in_sync": in_sync,
        "checked_range": {
            "date_start": str(date_start),
            "date_end": str(date_end),
            "branch_id": branch_id,
        },
        "totals": {
            "admin_tickets": len(admin_tickets),
            "sync_tickets": len(sync_tickets),
            "admin_ticket_items": len(admin_items),
            "sync_ticket_items": len(sync_items),
        },
        "tickets": {
            "missing_in_admin_count": len(tickets_missing_in_admin),
            "only_in_admin_count": len(tickets_only_in_admin),
            "field_mismatch_count": len(tickets_field_mismatch),
            "missing_in_admin": tickets_missing_in_admin[:100],
            "only_in_admin": tickets_only_in_admin[:100],
            "field_mismatch": tickets_field_mismatch[:100],
        },
        "ticket_items": {
            "missing_in_admin_count": len(items_missing_in_admin),
            "only_in_admin_count": len(items_only_in_admin),
            "field_mismatch_count": len(items_field_mismatch),
            "missing_in_admin": items_missing_in_admin[:100],
            "only_in_admin": items_only_in_admin[:100],
            "field_mismatch": items_field_mismatch[:100],
        },
    }
