"""
Admin Report B — Date-Wise Branch Summary (Cash + GPay only).

POS-only. Grid of net_amount totals: rows = dates, columns = {branch}-{mode}.

Query scope (always):
    - tickets.is_cancelled = false
    - tickets.net_amount >= 0
    - ticket_date BETWEEN :date_from AND :date_to
    - route_id = :route_id
    - payment_mode_id IN (1, 2)   # Cash + UPI only — the PDF excludes Card/Online

Output columns are built in a stable order: for each branch on the route
(branch_one then branch_two), append CASH column then GPay column.
"""
from __future__ import annotations

import datetime
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.branch import Branch
from app.models.payment_mode import PaymentMode
from app.models.route import Route
from app.models.ticket import Ticket

# Payment-mode IDs from seed_data.sql (1=Cash, 2=UPI) — PDF only shows these two
MODE_CASH: int = 1
MODE_UPI: int = 2
CASH_UPI_IDS: tuple[int, ...] = (MODE_CASH, MODE_UPI)


async def get_date_branch_summary(
    db: AsyncSession,
    date_from: datetime.date,
    date_to: datetime.date,
    route_id: int,
) -> dict:
    """Return the Date-Wise Branch Summary as a dict ready for the schema."""
    route, branches = await _fetch_route_and_branches(db, route_id)

    raw = await _query_date_branch_mode(db, date_from, date_to, route_id)

    # Index lookup: {(date, branch_id, mode_id): amount}
    cells_idx: dict[tuple[datetime.date, int, int], Decimal] = {}
    for r in raw:
        cells_idx[(r.ticket_date, r.branch_id, r.payment_mode_id)] = Decimal(str(r.amount))

    columns = _build_columns(branches)
    rows = _build_rows(date_from, date_to, columns, cells_idx)

    column_totals: dict[str, Decimal] = {c["key"]: Decimal("0") for c in columns}
    for row in rows:
        for key in column_totals:
            column_totals[key] += Decimal(row["cells"][key].replace(",", "") or "0")
    grand_total = sum(column_totals.values(), Decimal("0"))

    return {
        "route_id": route.id,
        "route_label": _route_label(branches),
        "date_from": date_from,
        "date_to": date_to,
        "columns": columns,
        "rows": rows,
        "column_totals": {k: _fmt(v) for k, v in column_totals.items()},
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


async def _query_date_branch_mode(
    db: AsyncSession,
    date_from: datetime.date,
    date_to: datetime.date,
    route_id: int,
) -> list:
    """One row per (date, branch, payment_mode) with summed net_amount."""
    q = (
        select(
            Ticket.ticket_date.label("ticket_date"),
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
        .where(Ticket.route_id == route_id)
        .where(Ticket.payment_mode_id.in_(CASH_UPI_IDS))
        .group_by(
            Ticket.ticket_date,
            Ticket.branch_id,
            Ticket.payment_mode_id,
            PaymentMode.description,
        )
    )
    return (await db.execute(q)).all()


def _build_columns(branches: list[Branch]) -> list[dict]:
    """For each branch, append a CASH column then a GPay column."""
    cols: list[dict] = []
    for b in branches:
        cols.append(
            {
                "key": f"{b.id}-CASH",
                "label": f"{b.name}-CASH",
                "branch_id": b.id,
                "mode": "CASH",
            }
        )
        cols.append(
            {
                "key": f"{b.id}-GPay",
                "label": f"{b.name}-GPay",
                "branch_id": b.id,
                "mode": "GPay",
            }
        )
    return cols


def _build_rows(
    date_from: datetime.date,
    date_to: datetime.date,
    columns: list[dict],
    cells_idx: dict[tuple[datetime.date, int, int], Decimal],
) -> list[dict]:
    """Emit one row per date in the range, filling missing cells with '0.00'."""
    rows: list[dict] = []
    d = date_from
    while d <= date_to:
        cells: dict[str, str] = {}
        total = Decimal("0")
        for col in columns:
            mode_id = MODE_CASH if col["mode"] == "CASH" else MODE_UPI
            amount = cells_idx.get((d, col["branch_id"], mode_id), Decimal("0"))
            cells[col["key"]] = _fmt(amount)
            total += amount
        rows.append({"date": d, "cells": cells, "total": _fmt(total)})
        d += datetime.timedelta(days=1)
    return rows


def _route_label(branches: list[Branch]) -> str:
    return " + ".join(b.name for b in branches)


def _fmt(v: Decimal) -> str:
    return f"{Decimal(v):.2f}"
