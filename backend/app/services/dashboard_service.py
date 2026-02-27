from datetime import date
from decimal import Decimal

from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ticket import Ticket
from app.models.boat import Boat
from app.models.branch import Branch
from app.models.payment_mode import PaymentMode


async def get_dashboard_stats(db: AsyncSession) -> dict:
    """Return aggregated dashboard statistics."""
    today = date.today()

    ticket_count_q = select(func.count()).select_from(Ticket)
    today_revenue_q = select(func.coalesce(func.sum(Ticket.net_amount), 0)).where(
        Ticket.ticket_date == today
    )
    active_ferries_q = select(func.count()).select_from(Boat).where(Boat.is_active == True)  # noqa: E712
    active_branches_q = select(func.count()).select_from(Branch).where(Branch.is_active == True)  # noqa: E712

    results = await db.execute(ticket_count_q)
    ticket_count = results.scalar() or 0

    results = await db.execute(today_revenue_q)
    today_revenue = float(results.scalar() or 0)

    results = await db.execute(active_ferries_q)
    active_ferries = results.scalar() or 0

    results = await db.execute(active_branches_q)
    active_branches = results.scalar() or 0

    return {
        "ticket_count": ticket_count,
        "today_revenue": today_revenue,
        "active_ferries": active_ferries,
        "active_branches": active_branches,
    }


async def get_today_summary(db: AsyncSession) -> dict:
    """Return today's ticket summary grouped by branch and payment mode."""
    today = date.today()

    # Revenue expression: sum net_amount only for non-cancelled tickets
    revenue_expr = func.coalesce(
        func.sum(
            case(
                (Ticket.is_cancelled == False, Ticket.net_amount),  # noqa: E712
                else_=0,
            )
        ),
        0,
    )

    # --- Branch breakdown ---
    branch_q = (
        select(
            Ticket.branch_id,
            Branch.name.label("branch_name"),
            func.count().label("ticket_count"),
            revenue_expr.label("revenue"),
        )
        .join(Branch, Ticket.branch_id == Branch.id)
        .where(Ticket.ticket_date == today)
        .group_by(Ticket.branch_id, Branch.name)
    )

    branch_rows = await db.execute(branch_q)
    branches = [
        {
            "branch_id": row.branch_id,
            "branch_name": row.branch_name,
            "ticket_count": row.ticket_count,
            "revenue": Decimal(str(row.revenue)),
        }
        for row in branch_rows.all()
    ]

    # --- Payment mode breakdown ---
    payment_q = (
        select(
            Ticket.payment_mode_id,
            PaymentMode.description.label("payment_mode_name"),
            func.count().label("ticket_count"),
            revenue_expr.label("revenue"),
        )
        .join(PaymentMode, Ticket.payment_mode_id == PaymentMode.id)
        .where(Ticket.ticket_date == today)
        .group_by(Ticket.payment_mode_id, PaymentMode.description)
    )

    payment_rows = await db.execute(payment_q)
    payment_modes = [
        {
            "payment_mode_id": row.payment_mode_id,
            "payment_mode_name": row.payment_mode_name,
            "ticket_count": row.ticket_count,
            "revenue": Decimal(str(row.revenue)),
        }
        for row in payment_rows.all()
    ]

    # --- Totals ---
    total_tickets = sum(b["ticket_count"] for b in branches)
    total_revenue = sum(b["revenue"] for b in branches)

    return {
        "total_tickets": total_tickets,
        "total_revenue": total_revenue,
        "branches": branches,
        "payment_modes": payment_modes,
    }
