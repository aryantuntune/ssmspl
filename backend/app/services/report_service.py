import datetime

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, case

from app.models.ticket import Ticket, TicketItem
from app.models.booking import Booking
from app.models.booking_item import BookingItem
from app.models.branch import Branch
from app.models.item import Item
from app.models.payment_mode import PaymentMode
from app.models.route import Route


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _apply_ticket_filters(query, date_from, date_to, branch_id=None, route_id=None):
    if date_from:
        query = query.where(Ticket.ticket_date >= date_from)
    if date_to:
        query = query.where(Ticket.ticket_date <= date_to)
    if branch_id:
        query = query.where(Ticket.branch_id == branch_id)
    if route_id:
        query = query.where(Ticket.route_id == route_id)
    return query


def _apply_booking_filters(query, date_from, date_to, branch_id=None, route_id=None):
    if date_from:
        query = query.where(Booking.travel_date >= date_from)
    if date_to:
        query = query.where(Booking.travel_date <= date_to)
    if branch_id:
        query = query.where(Booking.branch_id == branch_id)
    if route_id:
        query = query.where(Booking.route_id == route_id)
    return query


def _period_expr(model_date_col, grouping: str):
    """Return a SQL expression that groups dates into day/week/month labels."""
    if grouping == "week":
        return func.to_char(model_date_col, "IYYY-IW")
    elif grouping == "month":
        return func.to_char(model_date_col, "YYYY-MM")
    else:  # day
        return func.to_char(model_date_col, "YYYY-MM-DD")


async def _get_branch_name_map(db: AsyncSession) -> dict[int, str]:
    result = await db.execute(select(Branch.id, Branch.name))
    return {row[0]: row[1] for row in result.all()}


async def _get_route_name_map(db: AsyncSession) -> dict[int, str]:
    BranchOne = Branch.__table__.alias("b1")
    BranchTwo = Branch.__table__.alias("b2")
    result = await db.execute(
        select(
            Route.id,
            BranchOne.c.name.label("b1_name"),
            BranchTwo.c.name.label("b2_name"),
        )
        .select_from(Route.__table__)
        .join(BranchOne, BranchOne.c.id == Route.branch_id_one)
        .join(BranchTwo, BranchTwo.c.id == Route.branch_id_two)
    )
    return {row[0]: f"{row[1]} - {row[2]}" for row in result.all()}


# ---------------------------------------------------------------------------
# 1. Revenue Report
# ---------------------------------------------------------------------------

async def get_revenue_report(
    db: AsyncSession,
    date_from: datetime.date,
    date_to: datetime.date,
    branch_id: int | None = None,
    route_id: int | None = None,
    grouping: str = "day",
) -> dict:
    # Tickets: revenue from non-cancelled tickets
    ticket_period = _period_expr(Ticket.ticket_date, grouping)
    tq = select(
        ticket_period.label("period"),
        func.coalesce(func.sum(
            case((Ticket.is_cancelled == False, Ticket.net_amount), else_=0)
        ), 0).label("revenue"),
    ).group_by(ticket_period)
    tq = _apply_ticket_filters(tq, date_from, date_to, branch_id, route_id)
    ticket_rows = (await db.execute(tq)).all()
    ticket_map = {r.period: float(r.revenue) for r in ticket_rows}

    # Bookings: revenue from non-cancelled bookings
    booking_period = _period_expr(Booking.travel_date, grouping)
    bq = select(
        booking_period.label("period"),
        func.coalesce(func.sum(
            case((Booking.is_cancelled == False, Booking.net_amount), else_=0)
        ), 0).label("revenue"),
    ).group_by(booking_period)
    bq = _apply_booking_filters(bq, date_from, date_to, branch_id, route_id)
    booking_rows = (await db.execute(bq)).all()
    booking_map = {r.period: float(r.revenue) for r in booking_rows}

    # Merge
    all_periods = sorted(set(ticket_map.keys()) | set(booking_map.keys()))
    rows = []
    total_t = total_b = 0.0
    for p in all_periods:
        t_rev = ticket_map.get(p, 0)
        b_rev = booking_map.get(p, 0)
        total_t += t_rev
        total_b += b_rev
        rows.append({
            "period": p,
            "ticket_revenue": t_rev,
            "booking_revenue": b_rev,
            "total_revenue": t_rev + b_rev,
        })

    return {
        "date_from": date_from,
        "date_to": date_to,
        "grouping": grouping,
        "rows": rows,
        "total_ticket_revenue": total_t,
        "total_booking_revenue": total_b,
        "grand_total": total_t + total_b,
    }


# ---------------------------------------------------------------------------
# 2. Ticket Count Report
# ---------------------------------------------------------------------------

async def get_ticket_count_report(
    db: AsyncSession,
    date_from: datetime.date,
    date_to: datetime.date,
    branch_id: int | None = None,
    route_id: int | None = None,
    group_by: str = "date",
) -> dict:
    branch_names = await _get_branch_name_map(db)
    route_names = await _get_route_name_map(db)

    def _ticket_group_expr():
        if group_by == "branch":
            return Ticket.branch_id
        elif group_by == "route":
            return Ticket.route_id
        return func.to_char(Ticket.ticket_date, "YYYY-MM-DD")

    def _booking_group_expr():
        if group_by == "branch":
            return Booking.branch_id
        elif group_by == "route":
            return Booking.route_id
        return func.to_char(Booking.travel_date, "YYYY-MM-DD")

    # Tickets
    t_grp = _ticket_group_expr()
    tq = select(
        t_grp.label("grp"),
        func.count().filter(Ticket.is_cancelled == False).label("active"),
        func.count().filter(Ticket.is_cancelled == True).label("cancelled"),
        func.count().label("total"),
    ).group_by(t_grp)
    tq = _apply_ticket_filters(tq, date_from, date_to, branch_id, route_id)
    ticket_rows = (await db.execute(tq)).all()
    ticket_map = {}
    for r in ticket_rows:
        key = str(r.grp)
        ticket_map[key] = {"active": r.active, "cancelled": r.cancelled, "total": r.total}

    # Bookings
    b_grp = _booking_group_expr()
    bq = select(
        b_grp.label("grp"),
        func.count().filter(Booking.is_cancelled == False).label("active"),
        func.count().filter(Booking.is_cancelled == True).label("cancelled"),
        func.count().label("total"),
    ).group_by(b_grp)
    bq = _apply_booking_filters(bq, date_from, date_to, branch_id, route_id)
    booking_rows = (await db.execute(bq)).all()
    booking_map = {}
    for r in booking_rows:
        key = str(r.grp)
        booking_map[key] = {"active": r.active, "cancelled": r.cancelled, "total": r.total}

    all_keys = sorted(set(ticket_map.keys()) | set(booking_map.keys()))
    rows = []
    for key in all_keys:
        # Resolve group label
        if group_by == "branch":
            label = branch_names.get(int(key), f"Branch {key}")
        elif group_by == "route":
            label = route_names.get(int(key), f"Route {key}")
        else:
            label = key

        t = ticket_map.get(key, {"active": 0, "cancelled": 0, "total": 0})
        b = booking_map.get(key, {"active": 0, "cancelled": 0, "total": 0})
        rows.append({
            "group": label,
            "active_tickets": t["active"],
            "cancelled_tickets": t["cancelled"],
            "total_tickets": t["total"],
            "active_bookings": b["active"],
            "cancelled_bookings": b["cancelled"],
            "total_bookings": b["total"],
        })

    return {"date_from": date_from, "date_to": date_to, "group_by": group_by, "rows": rows}


# ---------------------------------------------------------------------------
# 3. Item Breakdown Report
# ---------------------------------------------------------------------------

async def get_item_breakdown_report(
    db: AsyncSession,
    date_from: datetime.date,
    date_to: datetime.date,
    branch_id: int | None = None,
    route_id: int | None = None,
) -> dict:
    # Ticket items
    tq = (
        select(
            TicketItem.item_id,
            func.coalesce(func.sum(
                case((TicketItem.is_cancelled == False, TicketItem.quantity), else_=0)
            ), 0).label("qty"),
            func.coalesce(func.sum(
                case(
                    (TicketItem.is_cancelled == False,
                     TicketItem.quantity * (TicketItem.rate + TicketItem.levy)),
                    else_=0,
                )
            ), 0).label("revenue"),
        )
        .join(Ticket, Ticket.id == TicketItem.ticket_id)
        .group_by(TicketItem.item_id)
    )
    tq = _apply_ticket_filters(tq, date_from, date_to, branch_id, route_id)
    ticket_items = (await db.execute(tq)).all()
    ticket_map = {r.item_id: {"qty": int(r.qty), "revenue": float(r.revenue)} for r in ticket_items}

    # Booking items
    bq = (
        select(
            BookingItem.item_id,
            func.coalesce(func.sum(
                case((BookingItem.is_cancelled == False, BookingItem.quantity), else_=0)
            ), 0).label("qty"),
            func.coalesce(func.sum(
                case(
                    (BookingItem.is_cancelled == False,
                     BookingItem.quantity * (BookingItem.rate + BookingItem.levy)),
                    else_=0,
                )
            ), 0).label("revenue"),
        )
        .join(Booking, Booking.id == BookingItem.booking_id)
        .group_by(BookingItem.item_id)
    )
    bq = _apply_booking_filters(bq, date_from, date_to, branch_id, route_id)
    booking_items_rows = (await db.execute(bq)).all()
    booking_map = {r.item_id: {"qty": int(r.qty), "revenue": float(r.revenue)} for r in booking_items_rows}

    # All items
    all_item_ids = set(ticket_map.keys()) | set(booking_map.keys())
    item_result = await db.execute(select(Item).where(Item.id.in_(all_item_ids)))
    items = {i.id: i for i in item_result.scalars().all()}

    rows = []
    grand_total = 0.0
    for iid in sorted(all_item_ids):
        item = items.get(iid)
        t = ticket_map.get(iid, {"qty": 0, "revenue": 0})
        b = booking_map.get(iid, {"qty": 0, "revenue": 0})
        total_rev = t["revenue"] + b["revenue"]
        grand_total += total_rev
        rows.append({
            "item_id": iid,
            "item_name": item.name if item else f"Item {iid}",
            "is_vehicle": bool(item.is_vehicle) if item else False,
            "ticket_qty": t["qty"],
            "ticket_revenue": t["revenue"],
            "booking_qty": b["qty"],
            "booking_revenue": b["revenue"],
            "total_qty": t["qty"] + b["qty"],
            "total_revenue": total_rev,
        })

    return {
        "date_from": date_from,
        "date_to": date_to,
        "rows": rows,
        "grand_total_revenue": grand_total,
    }


# ---------------------------------------------------------------------------
# 4. Branch Summary Report
# ---------------------------------------------------------------------------

async def get_branch_summary_report(
    db: AsyncSession,
    date_from: datetime.date,
    date_to: datetime.date,
) -> dict:
    branch_names = await _get_branch_name_map(db)

    # Tickets
    tq = select(
        Ticket.branch_id,
        func.count().filter(Ticket.is_cancelled == False).label("count"),
        func.coalesce(func.sum(
            case((Ticket.is_cancelled == False, Ticket.net_amount), else_=0)
        ), 0).label("revenue"),
    ).group_by(Ticket.branch_id)
    tq = _apply_ticket_filters(tq, date_from, date_to)
    ticket_rows = (await db.execute(tq)).all()
    ticket_map = {r.branch_id: {"count": r.count, "revenue": float(r.revenue)} for r in ticket_rows}

    # Bookings
    bq = select(
        Booking.branch_id,
        func.count().filter(Booking.is_cancelled == False).label("count"),
        func.coalesce(func.sum(
            case((Booking.is_cancelled == False, Booking.net_amount), else_=0)
        ), 0).label("revenue"),
    ).group_by(Booking.branch_id)
    bq = _apply_booking_filters(bq, date_from, date_to)
    booking_rows = (await db.execute(bq)).all()
    booking_map = {r.branch_id: {"count": r.count, "revenue": float(r.revenue)} for r in booking_rows}

    all_ids = sorted(set(ticket_map.keys()) | set(booking_map.keys()))
    rows = []
    for bid in all_ids:
        t = ticket_map.get(bid, {"count": 0, "revenue": 0})
        b = booking_map.get(bid, {"count": 0, "revenue": 0})
        rows.append({
            "branch_id": bid,
            "branch_name": branch_names.get(bid, f"Branch {bid}"),
            "ticket_count": t["count"],
            "ticket_revenue": t["revenue"],
            "booking_count": b["count"],
            "booking_revenue": b["revenue"],
            "total_count": t["count"] + b["count"],
            "total_revenue": t["revenue"] + b["revenue"],
        })

    return {"date_from": date_from, "date_to": date_to, "rows": rows}


# ---------------------------------------------------------------------------
# 5. Payment Mode Report
# ---------------------------------------------------------------------------

async def get_payment_mode_report(
    db: AsyncSession,
    date_from: datetime.date,
    date_to: datetime.date,
    branch_id: int | None = None,
    route_id: int | None = None,
) -> dict:
    # Load payment mode names
    pm_result = await db.execute(select(PaymentMode))
    pm_names = {pm.id: pm.description for pm in pm_result.scalars().all()}

    # Tickets
    tq = select(
        Ticket.payment_mode_id,
        func.coalesce(func.sum(
            case((Ticket.is_cancelled == False, Ticket.net_amount), else_=0)
        ), 0).label("revenue"),
        func.count().filter(Ticket.is_cancelled == False).label("count"),
    ).group_by(Ticket.payment_mode_id)
    tq = _apply_ticket_filters(tq, date_from, date_to, branch_id, route_id)
    ticket_rows = (await db.execute(tq)).all()
    ticket_map = {r.payment_mode_id: {"revenue": float(r.revenue), "count": r.count} for r in ticket_rows}

    # Bookings
    bq = select(
        Booking.payment_mode_id,
        func.coalesce(func.sum(
            case((Booking.is_cancelled == False, Booking.net_amount), else_=0)
        ), 0).label("revenue"),
        func.count().filter(Booking.is_cancelled == False).label("count"),
    ).group_by(Booking.payment_mode_id)
    bq = _apply_booking_filters(bq, date_from, date_to, branch_id, route_id)
    booking_rows = (await db.execute(bq)).all()
    booking_map = {r.payment_mode_id: {"revenue": float(r.revenue), "count": r.count} for r in booking_rows}

    all_ids = sorted(set(ticket_map.keys()) | set(booking_map.keys()))
    rows = []
    for pid in all_ids:
        t = ticket_map.get(pid, {"revenue": 0, "count": 0})
        b = booking_map.get(pid, {"revenue": 0, "count": 0})
        rows.append({
            "payment_mode_id": pid,
            "payment_mode_name": pm_names.get(pid, f"Payment Mode {pid}"),
            "ticket_revenue": t["revenue"],
            "ticket_count": t["count"],
            "booking_revenue": b["revenue"],
            "booking_count": b["count"],
            "total_revenue": t["revenue"] + b["revenue"],
            "total_count": t["count"] + b["count"],
        })

    return {"date_from": date_from, "date_to": date_to, "rows": rows}
