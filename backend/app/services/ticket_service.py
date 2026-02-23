import datetime
import uuid as uuid_mod
from decimal import Decimal, ROUND_HALF_UP

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_, text

from app.models.ticket import Ticket, TicketItem
from app.models.ticket_payement import TicketPayement
from app.models.branch import Branch
from app.models.route import Route
from app.models.item import Item
from app.models.item_rate import ItemRate
from app.models.payment_mode import PaymentMode
from app.models.ferry_schedule import FerrySchedule
from app.models.company import Company
from app.schemas.ticket import TicketCreate, TicketUpdate


def _round2(value: float) -> float:
    return float(Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def _format_time(t: datetime.time | None) -> str | None:
    if t is None:
        return None
    return t.strftime("%H:%M")


def _parse_time(s: str) -> datetime.time:
    try:
        return datetime.datetime.strptime(s, "%H:%M").time()
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid time format: '{s}'. Expected HH:MM",
        )


async def _get_branch_name(db: AsyncSession, branch_id: int) -> str | None:
    result = await db.execute(select(Branch.name).where(Branch.id == branch_id))
    return result.scalar_one_or_none()


async def _get_route_display_name(db: AsyncSession, route_id: int) -> str | None:
    BranchOne = Branch.__table__.alias("b1")
    BranchTwo = Branch.__table__.alias("b2")
    result = await db.execute(
        select(
            BranchOne.c.name.label("branch_one_name"),
            BranchTwo.c.name.label("branch_two_name"),
        )
        .select_from(Route.__table__)
        .join(BranchOne, BranchOne.c.id == Route.branch_id_one)
        .join(BranchTwo, BranchTwo.c.id == Route.branch_id_two)
        .where(Route.id == route_id)
    )
    row = result.one_or_none()
    if not row:
        return None
    return f"{row.branch_one_name} - {row.branch_two_name}"


async def _get_payment_mode_name(db: AsyncSession, pm_id: int) -> str | None:
    result = await db.execute(select(PaymentMode.description).where(PaymentMode.id == pm_id))
    return result.scalar_one_or_none()


async def _get_item_name(db: AsyncSession, item_id: int) -> str | None:
    result = await db.execute(select(Item.name).where(Item.id == item_id))
    return result.scalar_one_or_none()


async def _enrich_ticket_item(db: AsyncSession, ti: TicketItem) -> dict:
    item_name = await _get_item_name(db, ti.item_id)
    rate = float(ti.rate) if ti.rate is not None else 0
    levy = float(ti.levy) if ti.levy is not None else 0
    quantity = ti.quantity or 0
    amount = _round2(quantity * (rate + levy))
    return {
        "id": ti.id,
        "ticket_id": ti.ticket_id,
        "item_id": ti.item_id,
        "rate": rate,
        "levy": levy,
        "quantity": quantity,
        "vehicle_no": ti.vehicle_no,
        "is_cancelled": ti.is_cancelled,
        "amount": amount,
        "item_name": item_name,
    }


async def _enrich_ticket_payement(db: AsyncSession, tp: TicketPayement) -> dict:
    pm_name = await _get_payment_mode_name(db, tp.payment_mode_id)
    return {
        "id": tp.id,
        "ticket_id": tp.ticket_id,
        "payment_mode_id": tp.payment_mode_id,
        "amount": float(tp.amount) if tp.amount is not None else 0,
        "ref_no": tp.ref_no,
        "payment_mode_name": pm_name,
    }


async def _enrich_ticket(db: AsyncSession, ticket: Ticket, include_items: bool = False) -> dict:
    branch_name = await _get_branch_name(db, ticket.branch_id)
    route_name = await _get_route_display_name(db, ticket.route_id)
    pm_name = await _get_payment_mode_name(db, ticket.payment_mode_id)

    data = {
        "id": ticket.id,
        "branch_id": ticket.branch_id,
        "ticket_no": ticket.ticket_no,
        "ticket_date": ticket.ticket_date,
        "departure": _format_time(ticket.departure),
        "route_id": ticket.route_id,
        "amount": float(ticket.amount) if ticket.amount is not None else 0,
        "discount": float(ticket.discount) if ticket.discount is not None else 0,
        "payment_mode_id": ticket.payment_mode_id,
        "is_cancelled": ticket.is_cancelled,
        "net_amount": float(ticket.net_amount) if ticket.net_amount is not None else 0,
        "status": ticket.status,
        "checked_in_at": ticket.checked_in_at,
        "branch_name": branch_name,
        "route_name": route_name,
        "payment_mode_name": pm_name,
        "verification_code": str(ticket.verification_code) if ticket.verification_code else None,
        "created_at": ticket.created_at,
    }

    if include_items:
        result = await db.execute(
            select(TicketItem).where(TicketItem.ticket_id == ticket.id)
        )
        items = result.scalars().all()
        data["items"] = [await _enrich_ticket_item(db, ti) for ti in items]

        pay_result = await db.execute(
            select(TicketPayement).where(TicketPayement.ticket_id == ticket.id)
        )
        payments = pay_result.scalars().all()
        data["payments"] = [await _enrich_ticket_payement(db, tp) for tp in payments]
    else:
        data["items"] = None
        data["payments"] = None

    return data


async def _validate_references(db: AsyncSession, branch_id: int, route_id: int, payment_mode_id: int):
    result = await db.execute(select(Branch.id).where(Branch.id == branch_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Branch ID {branch_id} not found")

    result = await db.execute(select(Route.id).where(Route.id == route_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Route ID {route_id} not found")

    result = await db.execute(select(PaymentMode.id).where(PaymentMode.id == payment_mode_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Payment Mode ID {payment_mode_id} not found")


async def _validate_items(db: AsyncSession, items: list) -> None:
    for item in items:
        result = await db.execute(select(Item.id).where(Item.id == item.item_id))
        if not result.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Item ID {item.item_id} not found",
            )


def _compute_amounts(items: list, discount: float | None) -> tuple[float, float]:
    total = 0.0
    for item in items:
        if getattr(item, "is_cancelled", False):
            continue
        rate = float(getattr(item, "rate", 0))
        quantity = int(getattr(item, "quantity", 0))
        levy = float(getattr(item, "levy", 0))
        total += quantity * (rate + levy)
    amount = _round2(total)
    disc = float(discount) if discount else 0
    net_amount = _round2(amount - disc)
    return amount, net_amount


def _cross_check_amounts(computed_amount: float, computed_net: float, submitted_amount: float, submitted_net: float):
    if abs(computed_amount - submitted_amount) > 0.01:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Amount mismatch: expected {computed_amount}, got {submitted_amount}",
        )
    if abs(computed_net - submitted_net) > 0.01:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Net amount mismatch: expected {computed_net}, got {submitted_net}",
        )


async def get_current_rate(db: AsyncSession, item_id: int, route_id: int) -> dict:
    today = datetime.date.today()
    result = await db.execute(
        select(ItemRate)
        .where(
            ItemRate.item_id == item_id,
            ItemRate.route_id == route_id,
            ItemRate.is_active == True,
            ItemRate.applicable_from_date.is_not(None),
            ItemRate.applicable_from_date <= today,
        )
        .order_by(ItemRate.applicable_from_date.desc())
        .limit(1)
    )
    ir = result.scalar_one_or_none()
    if not ir:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No active rate found for item {item_id} and route {route_id}",
        )
    return {
        "rate": float(ir.rate) if ir.rate is not None else 0,
        "levy": float(ir.levy) if ir.levy is not None else 0,
        "item_rate_id": ir.id,
    }


async def get_departure_options(db: AsyncSession, branch_id: int) -> list[dict]:
    now = datetime.datetime.now().time()
    result = await db.execute(
        select(FerrySchedule)
        .where(
            FerrySchedule.branch_id == branch_id,
            FerrySchedule.departure >= now,
        )
        .order_by(FerrySchedule.departure.asc())
    )
    schedules = result.scalars().all()
    return [
        {"id": s.id, "departure": _format_time(s.departure)}
        for s in schedules
    ]


async def get_multi_ticket_init(db: AsyncSession, user) -> dict:
    """Return all data needed to populate the multi-ticket form."""
    if not user.route_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User has no assigned route. Cannot use multi-ticketing.",
        )

    # Get route info
    route_result = await db.execute(select(Route).where(Route.id == user.route_id))
    route = route_result.scalar_one_or_none()
    if not route:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assigned route not found")

    route_name = await _get_route_display_name(db, route.id)

    # Determine branch: use branch_id_one as the user's operating branch
    branch_id = route.branch_id_one
    branch_name = await _get_branch_name(db, branch_id)

    # Get ferry time window for this branch
    first_result = await db.execute(
        select(func.min(FerrySchedule.departure)).where(FerrySchedule.branch_id == branch_id)
    )
    first_ferry = first_result.scalar_one_or_none()

    last_result = await db.execute(
        select(func.max(FerrySchedule.departure)).where(FerrySchedule.branch_id == branch_id)
    )
    last_ferry = last_result.scalar_one_or_none()

    # Determine if off-hours
    now = datetime.datetime.now().time()
    if first_ferry and last_ferry:
        is_off_hours = now < first_ferry or now > last_ferry
    else:
        # No ferry schedules — always off-hours
        is_off_hours = True

    # Get active items with their current rates for this route
    today = datetime.date.today()
    items_result = await db.execute(
        select(Item).where(Item.is_active == True).order_by(Item.id)
    )
    items = items_result.scalars().all()

    items_with_rates = []
    for item in items:
        rate_result = await db.execute(
            select(ItemRate)
            .where(
                ItemRate.item_id == item.id,
                ItemRate.route_id == user.route_id,
                ItemRate.is_active == True,
                ItemRate.applicable_from_date.is_not(None),
                ItemRate.applicable_from_date <= today,
            )
            .order_by(ItemRate.applicable_from_date.desc())
            .limit(1)
        )
        ir = rate_result.scalar_one_or_none()
        if ir:
            items_with_rates.append({
                "id": item.id,
                "name": item.name,
                "short_name": item.short_name,
                "is_vehicle": bool(item.is_vehicle),
                "rate": float(ir.rate) if ir.rate is not None else 0,
                "levy": float(ir.levy) if ir.levy is not None else 0,
            })

    # Get active payment modes
    pm_result = await db.execute(
        select(PaymentMode).where(PaymentMode.is_active == True).order_by(PaymentMode.id)
    )
    payment_modes = pm_result.scalars().all()

    # Get Special Ferry item ID from company config
    sf_item_id = None
    sf_rate = None
    sf_levy = None
    company_result = await db.execute(select(Company).limit(1))
    company = company_result.scalar_one_or_none()
    if company and company.sf_item_id:
        sf_item_id = company.sf_item_id
        # Look up the SF item's rate for this route
        sf_rate_result = await db.execute(
            select(ItemRate)
            .where(
                ItemRate.item_id == sf_item_id,
                ItemRate.route_id == user.route_id,
                ItemRate.is_active == True,
                ItemRate.applicable_from_date.is_not(None),
                ItemRate.applicable_from_date <= today,
            )
            .order_by(ItemRate.applicable_from_date.desc())
            .limit(1)
        )
        sf_ir = sf_rate_result.scalar_one_or_none()
        if sf_ir:
            sf_rate = float(sf_ir.rate) if sf_ir.rate is not None else None
            sf_levy = float(sf_ir.levy) if sf_ir.levy is not None else None

    return {
        "route_id": route.id,
        "route_name": route_name or "",
        "branch_id": branch_id,
        "branch_name": branch_name or "",
        "items": items_with_rates,
        "payment_modes": [{"id": pm.id, "description": pm.description} for pm in payment_modes],
        "first_ferry_time": _format_time(first_ferry),
        "last_ferry_time": _format_time(last_ferry),
        "is_off_hours": is_off_hours,
        "sf_item_id": sf_item_id,
        "sf_rate": sf_rate,
        "sf_levy": sf_levy,
    }


async def _validate_off_hours(db: AsyncSession, branch_id: int) -> None:
    """Raise 400 if current time is within ferry schedule hours."""
    first_result = await db.execute(
        select(func.min(FerrySchedule.departure)).where(FerrySchedule.branch_id == branch_id)
    )
    first_ferry = first_result.scalar_one_or_none()

    last_result = await db.execute(
        select(func.max(FerrySchedule.departure)).where(FerrySchedule.branch_id == branch_id)
    )
    last_ferry = last_result.scalar_one_or_none()

    if first_ferry and last_ferry:
        now = datetime.datetime.now().time()
        if first_ferry <= now <= last_ferry:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Multi-ticketing is only available outside ferry hours ({_format_time(first_ferry)} - {_format_time(last_ferry)}). Current time: {_format_time(now)}",
            )


async def create_multi_tickets(db: AsyncSession, data, user) -> list[dict]:
    """Create multiple tickets in a single transaction."""
    if not user.route_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User has no assigned route.",
        )

    # Determine branch from user's route
    route_result = await db.execute(select(Route).where(Route.id == user.route_id))
    route = route_result.scalar_one_or_none()
    if not route:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assigned route not found")

    branch_id = route.branch_id_one

    # Validate off-hours
    await _validate_off_hours(db, branch_id)

    created_tickets = []
    for ticket_data in data.tickets:
        result = await create_ticket(db, ticket_data)
        created_tickets.append(result)

    return created_tickets


def _apply_filters(
    query,
    status_filter: str | None = None,
    branch_filter: int | None = None,
    route_filter: int | None = None,
    date_from: datetime.date | None = None,
    date_to: datetime.date | None = None,
    id_filter: int | None = None,
    id_op: str = "eq",
    id_filter_end: int | None = None,
    ticket_no_filter: int | None = None,
):
    if id_filter is not None:
        if id_op == "between" and id_filter_end is not None:
            query = query.where(Ticket.id >= id_filter, Ticket.id <= id_filter_end)
        elif id_op == "lt":
            query = query.where(Ticket.id < id_filter)
        elif id_op == "gt":
            query = query.where(Ticket.id > id_filter)
        else:
            query = query.where(Ticket.id == id_filter)

    if branch_filter is not None:
        query = query.where(Ticket.branch_id == branch_filter)

    if route_filter is not None:
        query = query.where(Ticket.route_id == route_filter)

    if ticket_no_filter is not None:
        query = query.where(Ticket.ticket_no == ticket_no_filter)

    if date_from is not None:
        query = query.where(Ticket.ticket_date >= date_from)

    if date_to is not None:
        query = query.where(Ticket.ticket_date <= date_to)

    if status_filter == "active":
        query = query.where(Ticket.is_cancelled == False)
    elif status_filter == "cancelled":
        query = query.where(Ticket.is_cancelled == True)

    return query


async def count_tickets(
    db: AsyncSession,
    status_filter: str | None = None,
    branch_filter: int | None = None,
    route_filter: int | None = None,
    date_from: datetime.date | None = None,
    date_to: datetime.date | None = None,
    id_filter: int | None = None,
    id_op: str = "eq",
    id_filter_end: int | None = None,
    ticket_no_filter: int | None = None,
) -> int:
    query = select(func.count()).select_from(Ticket)
    query = _apply_filters(query, status_filter, branch_filter, route_filter, date_from, date_to, id_filter, id_op, id_filter_end, ticket_no_filter)
    result = await db.execute(query)
    return result.scalar()


SORTABLE_COLUMNS = {
    "id": Ticket.id,
    "ticket_no": Ticket.ticket_no,
    "ticket_date": Ticket.ticket_date,
    "branch_id": Ticket.branch_id,
    "route_id": Ticket.route_id,
    "departure": Ticket.departure,
    "amount": Ticket.amount,
    "discount": Ticket.discount,
    "net_amount": Ticket.net_amount,
    "is_cancelled": Ticket.is_cancelled,
}


async def get_all_tickets(
    db: AsyncSession,
    skip: int = 0,
    limit: int = 50,
    sort_by: str = "id",
    sort_order: str = "desc",
    status_filter: str | None = None,
    branch_filter: int | None = None,
    route_filter: int | None = None,
    date_from: datetime.date | None = None,
    date_to: datetime.date | None = None,
    id_filter: int | None = None,
    id_op: str = "eq",
    id_filter_end: int | None = None,
    ticket_no_filter: int | None = None,
) -> list[dict]:
    column = SORTABLE_COLUMNS.get(sort_by, Ticket.id)
    order = column.desc() if sort_order == "desc" else column.asc()

    query = select(Ticket)
    query = _apply_filters(query, status_filter, branch_filter, route_filter, date_from, date_to, id_filter, id_op, id_filter_end, ticket_no_filter)
    result = await db.execute(query.order_by(order).offset(skip).limit(limit))
    tickets = result.scalars().all()

    return [await _enrich_ticket(db, t, include_items=False) for t in tickets]


async def get_ticket_by_id(db: AsyncSession, ticket_id: int) -> dict:
    result = await db.execute(select(Ticket).where(Ticket.id == ticket_id))
    ticket = result.scalar_one_or_none()
    if not ticket:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found")
    return await _enrich_ticket(db, ticket, include_items=True)


async def create_ticket(db: AsyncSession, data: TicketCreate) -> dict:
    await _validate_references(db, data.branch_id, data.route_id, data.payment_mode_id)
    await _validate_items(db, data.items)

    computed_amount, computed_net = _compute_amounts(data.items, data.discount)
    _cross_check_amounts(computed_amount, computed_net, data.amount, data.net_amount)

    result = await db.execute(
        select(Branch).where(Branch.id == data.branch_id).with_for_update()
    )
    branch = result.scalar_one()
    next_ticket_no = (branch.last_ticket_no or 0) + 1

    id_result = await db.execute(select(func.coalesce(func.max(Ticket.id), 0)))
    next_ticket_id = id_result.scalar() + 1

    departure_time = _parse_time(data.departure) if data.departure else None

    ticket = Ticket(
        id=next_ticket_id,
        branch_id=data.branch_id,
        ticket_no=next_ticket_no,
        ticket_date=data.ticket_date,
        departure=departure_time,
        route_id=data.route_id,
        amount=computed_amount,
        discount=float(data.discount) if data.discount else 0,
        payment_mode_id=data.payment_mode_id,
        is_cancelled=False,
        net_amount=computed_net,
        verification_code=uuid_mod.uuid4(),
    )
    db.add(ticket)

    item_id_result = await db.execute(select(func.coalesce(func.max(TicketItem.id), 0)))
    next_item_id = item_id_result.scalar() + 1

    for item_data in data.items:
        ti = TicketItem(
            id=next_item_id,
            ticket_id=next_ticket_id,
            item_id=item_data.item_id,
            rate=item_data.rate,
            levy=item_data.levy,
            quantity=item_data.quantity,
            vehicle_no=item_data.vehicle_no,
            is_cancelled=False,
        )
        db.add(ti)
        next_item_id += 1

    branch.last_ticket_no = next_ticket_no

    # Insert ticket_payement rows
    if data.payments:
        pay_id_result = await db.execute(select(func.coalesce(func.max(TicketPayement.id), 0)))
        next_pay_id = pay_id_result.scalar() + 1

        for pay_data in data.payments:
            # Validate payment_mode_id exists
            pm_check = await db.execute(select(PaymentMode.id).where(PaymentMode.id == pay_data.payment_mode_id))
            if not pm_check.scalar_one_or_none():
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Payment Mode ID {pay_data.payment_mode_id} not found",
                )
            tp = TicketPayement(
                id=next_pay_id,
                ticket_id=next_ticket_id,
                payment_mode_id=pay_data.payment_mode_id,
                amount=pay_data.amount,
                ref_no=pay_data.ref_no,
            )
            db.add(tp)
            next_pay_id += 1

    await db.flush()
    return await _enrich_ticket(db, ticket, include_items=True)


async def update_ticket(db: AsyncSession, ticket_id: int, data: TicketUpdate) -> dict:
    result = await db.execute(select(Ticket).where(Ticket.id == ticket_id))
    ticket = result.scalar_one_or_none()
    if not ticket:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found")

    if ticket.is_cancelled:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot update a cancelled ticket")

    update_data = data.model_dump(exclude_unset=True)

    if update_data.get("is_cancelled") is True:
        ticket.is_cancelled = True
        ticket.status = "CANCELLED"
        items_result = await db.execute(
            select(TicketItem).where(TicketItem.ticket_id == ticket_id)
        )
        for ti in items_result.scalars().all():
            ti.is_cancelled = True
        await db.flush()
        return await _enrich_ticket(db, ticket, include_items=True)

    if "route_id" in update_data:
        r = await db.execute(select(Route.id).where(Route.id == update_data["route_id"]))
        if not r.scalar_one_or_none():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Route ID {update_data['route_id']} not found")

    if "payment_mode_id" in update_data:
        r = await db.execute(select(PaymentMode.id).where(PaymentMode.id == update_data["payment_mode_id"]))
        if not r.scalar_one_or_none():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Payment Mode ID {update_data['payment_mode_id']} not found")

    if "departure" in update_data and update_data["departure"] is not None:
        ticket.departure = _parse_time(update_data["departure"])
    elif "departure" in update_data:
        ticket.departure = None

    for field in ("route_id", "payment_mode_id", "discount"):
        if field in update_data:
            setattr(ticket, field, update_data[field])

    if "items" in update_data and data.items is not None:
        await _validate_items(db, [i for i in data.items if not i.is_cancelled])

        existing_result = await db.execute(
            select(TicketItem).where(TicketItem.ticket_id == ticket_id)
        )
        existing_items = {ti.id: ti for ti in existing_result.scalars().all()}

        item_id_result = await db.execute(select(func.coalesce(func.max(TicketItem.id), 0)))
        next_item_id = item_id_result.scalar() + 1

        for item_update in data.items:
            if item_update.id and item_update.id in existing_items:
                ti = existing_items[item_update.id]
                ti.item_id = item_update.item_id
                ti.rate = item_update.rate
                ti.levy = item_update.levy
                ti.quantity = item_update.quantity
                ti.vehicle_no = item_update.vehicle_no
                ti.is_cancelled = item_update.is_cancelled
            else:
                ti = TicketItem(
                    id=next_item_id,
                    ticket_id=ticket_id,
                    item_id=item_update.item_id,
                    rate=item_update.rate,
                    levy=item_update.levy,
                    quantity=item_update.quantity,
                    vehicle_no=item_update.vehicle_no,
                    is_cancelled=item_update.is_cancelled,
                )
                db.add(ti)
                next_item_id += 1

        computed_amount, computed_net = _compute_amounts(
            data.items, update_data.get("discount", ticket.discount)
        )
        if "amount" in update_data and "net_amount" in update_data:
            _cross_check_amounts(computed_amount, computed_net, update_data["amount"], update_data["net_amount"])
        ticket.amount = computed_amount
        ticket.net_amount = computed_net
    elif "discount" in update_data:
        current_amount = float(ticket.amount)
        new_discount = float(update_data["discount"]) if update_data["discount"] else 0
        ticket.net_amount = _round2(current_amount - new_discount)
        if "net_amount" in update_data:
            _cross_check_amounts(current_amount, ticket.net_amount, update_data.get("amount", current_amount), update_data["net_amount"])

    await db.flush()
    return await _enrich_ticket(db, ticket, include_items=True)
