from datetime import date

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ticket import Ticket
from app.models.boat import Boat
from app.models.branch import Branch


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
