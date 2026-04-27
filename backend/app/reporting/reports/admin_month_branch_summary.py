"""
Admin Report D — Month-Wise Branch Amount Summary (Cash + UPI only).

POS-only. Grid of net_amount totals: rows = months, columns = {branch}-{mode}.
Cross-route — spans every branch the caller selects, regardless of route.

Query scope (always):
    - tickets.is_cancelled = false
    - tickets.net_amount >= 0
    - ticket_date BETWEEN :date_from AND :date_to
    - payment_mode_id IN (1, 2)              # Cash + UPI only
    - branch_id IN (:branch_ids)             # if filter provided

Output columns are built in alphabetical-by-branch-name order to match the
legacy Excel: AGARDANDA-CASH, AGARDANDA-UPI, DABHOL-CASH, DABHOL-UPI, …
Within each branch the CASH column precedes UPI.
"""
from __future__ import annotations

import datetime
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.branch import Branch
from app.models.payment_mode import PaymentMode
from app.models.ticket import Ticket

# Same payment-mode IDs as the date-branch summary (Cash + UPI from seed_data.sql)
MODE_CASH: int = 1
MODE_UPI: int = 2
CASH_UPI_IDS: tuple[int, ...] = (MODE_CASH, MODE_UPI)


async def get_month_branch_summary(
    db: AsyncSession,
    date_from: datetime.date,
    date_to: datetime.date,
    branch_ids: list[int] | None = None,
) -> dict:
    """Return the Month-Wise Branch Amount Summary as a dict."""
    branches = await _fetch_branches(db, branch_ids)

    raw = await _query_month_branch_mode(db, date_from, date_to, [b.id for b in branches])

    # Index lookup: {(month_yyyymm, branch_id, mode_id): amount}
    cells_idx: dict[tuple[str, int, int], Decimal] = {}
    for r in raw:
        cells_idx[(r.month, r.branch_id, r.payment_mode_id)] = Decimal(str(r.amount))

    columns = _build_columns(branches)
    rows = _build_rows(date_from, date_to, columns, cells_idx)

    column_totals: dict[str, Decimal] = {c["key"]: Decimal("0") for c in columns}
    for row in rows:
        for key in column_totals:
            column_totals[key] += Decimal(row["cells"][key].replace(",", "") or "0")
    grand_total = sum(column_totals.values(), Decimal("0"))

    return {
        "date_from": date_from,
        "date_to": date_to,
        "route_label": _route_label(branches),
        "branches": [{"id": b.id, "name": b.name} for b in branches],
        "columns": columns,
        "rows": rows,
        "column_totals": {k: _fmt(v) for k, v in column_totals.items()},
        "grand_total": _fmt(grand_total),
    }


# ── DB queries ───────────────────────────────────────────────────────────────


async def _fetch_branches(
    db: AsyncSession, branch_ids: list[int] | None
) -> list[Branch]:
    """Return branches matching the filter (or all active branches if no
    filter), sorted by name to match the legacy Excel column order.
    """
    q = select(Branch).where(Branch.is_active == True)  # noqa: E712
    if branch_ids:
        q = q.where(Branch.id.in_(branch_ids))
    q = q.order_by(Branch.name)
    return list((await db.execute(q)).scalars().all())


async def _query_month_branch_mode(
    db: AsyncSession,
    date_from: datetime.date,
    date_to: datetime.date,
    branch_ids: list[int],
) -> list:
    """One row per (month, branch, payment_mode) with summed net_amount.

    Month is rendered as 'YYYY-MM' so it sorts naturally and is unambiguous
    across years.
    """
    if not branch_ids:
        return []

    month_expr = func.to_char(Ticket.ticket_date, "YYYY-MM").label("month")
    q = (
        select(
            month_expr,
            Ticket.branch_id.label("branch_id"),
            Ticket.payment_mode_id.label("payment_mode_id"),
            PaymentMode.description.label("mode"),
            func.sum(Ticket.net_amount).label("amount"),
        )
        .join(PaymentMode, Ticket.payment_mode_id == PaymentMode.id)
        .where(Ticket.is_cancelled == False)  # noqa: E712
        .where(Ticket.net_amount >= 0)
        .where(Ticket.ticket_date >= date_from)
        .where(Ticket.ticket_date <= date_to)
        .where(Ticket.branch_id.in_(branch_ids))
        .where(Ticket.payment_mode_id.in_(CASH_UPI_IDS))
        .group_by(
            month_expr,
            Ticket.branch_id,
            Ticket.payment_mode_id,
            PaymentMode.description,
        )
    )
    return (await db.execute(q)).all()


# ── Pure transformation ──────────────────────────────────────────────────────


def _build_columns(branches: list[Branch]) -> list[dict]:
    """For each branch (in name-sorted order) emit a CASH then UPI column."""
    cols: list[dict] = []
    for b in branches:
        cols.append({
            "key": f"{b.id}-CASH", "label": f"{b.name}-CASH",
            "branch_id": b.id, "mode": "CASH",
        })
        cols.append({
            "key": f"{b.id}-UPI", "label": f"{b.name}-UPI",
            "branch_id": b.id, "mode": "UPI",
        })
    return cols


def _build_rows(
    date_from: datetime.date,
    date_to: datetime.date,
    columns: list[dict],
    cells_idx: dict[tuple[str, int, int], Decimal],
) -> list[dict]:
    """Emit one row per month in [date_from, date_to], filling missing
    cells with '0.00'. Months are rendered as 'MM-YYYY' to match the
    legacy Excel ('03-2026') while the internal ``month`` key uses
    'YYYY-MM' for natural sorting.
    """
    rows: list[dict] = []
    for ym_iso in _months_in_range(date_from, date_to):
        cells: dict[str, str] = {}
        total = Decimal("0")
        for col in columns:
            mode_id = MODE_CASH if col["mode"] == "CASH" else MODE_UPI
            amount = cells_idx.get((ym_iso, col["branch_id"], mode_id), Decimal("0"))
            cells[col["key"]] = _fmt(amount)
            total += amount
        # Display label MM-YYYY (matches legacy)
        y, m = ym_iso.split("-")
        rows.append({
            "month": ym_iso,
            "month_label": f"{m}-{y}",
            "cells": cells,
            "total": _fmt(total),
        })
    return rows


def _months_in_range(date_from: datetime.date, date_to: datetime.date) -> list[str]:
    """Return ISO 'YYYY-MM' strings for every month touched by the range."""
    out: list[str] = []
    y, m = date_from.year, date_from.month
    end_y, end_m = date_to.year, date_to.month
    while (y, m) <= (end_y, end_m):
        out.append(f"{y:04d}-{m:02d}")
        m += 1
        if m > 12:
            m = 1
            y += 1
    return out


def _route_label(branches: list[Branch]) -> str:
    return " + ".join(b.name for b in branches)


def _fmt(v: Decimal) -> str:
    return f"{Decimal(v):.2f}"
