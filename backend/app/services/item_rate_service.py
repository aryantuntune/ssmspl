from datetime import date as date_type

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_, update as sa_update

from app.models.item_rate import ItemRate
from app.models.item import Item
from app.models.route import Route
from app.models.branch import Branch
from app.schemas.item_rate import ItemRateCreate, ItemRateUpdate


async def _get_route_display_name(db: AsyncSession, route_id: int) -> str | None:
    """Build a 'BranchOne - BranchTwo' display string for a route."""
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


async def _enrich_item_rate(db: AsyncSession, ir: ItemRate) -> dict:
    """Convert an ItemRate ORM object to a dict with item_name and route_name."""
    item_name = None
    if ir.item_id:
        res = await db.execute(select(Item.name).where(Item.id == ir.item_id))
        item_name = res.scalar_one_or_none()

    route_name = None
    if ir.route_id:
        route_name = await _get_route_display_name(db, ir.route_id)

    return {
        "id": ir.id,
        "applicable_from_date": ir.applicable_from_date,
        "levy": float(ir.levy) if ir.levy is not None else None,
        "rate": float(ir.rate) if ir.rate is not None else None,
        "item_id": ir.item_id,
        "route_id": ir.route_id,
        "is_active": ir.is_active,
        "item_name": item_name,
        "route_name": route_name,
    }


async def get_item_rate_by_id(db: AsyncSession, item_rate_id: int) -> dict:
    result = await db.execute(select(ItemRate).where(ItemRate.id == item_rate_id))
    ir = result.scalar_one_or_none()
    if not ir:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item rate not found")
    return await _enrich_item_rate(db, ir)


def _apply_filters(
    query,
    status_filter: str | None = None,
    item_filter: int | None = None,
    route_filter: int | None = None,
    id_filter: int | None = None,
    id_op: str = "eq",
    id_filter_end: int | None = None,
    from_date: date_type | None = None,
):
    if id_filter is not None:
        if id_op == "between" and id_filter_end is not None:
            query = query.where(ItemRate.id >= id_filter, ItemRate.id <= id_filter_end)
        elif id_op == "lt":
            query = query.where(ItemRate.id < id_filter)
        elif id_op == "gt":
            query = query.where(ItemRate.id > id_filter)
        else:
            query = query.where(ItemRate.id == id_filter)

    if item_filter is not None:
        query = query.where(ItemRate.item_id == item_filter)

    if route_filter is not None:
        query = query.where(ItemRate.route_id == route_filter)

    if from_date is not None:
        # Subquery: for each (item_id, route_id), find the latest
        # applicable_from_date that is <= the selected from_date.
        latest_subq = (
            select(
                ItemRate.item_id.label("sub_item_id"),
                ItemRate.route_id.label("sub_route_id"),
                func.max(ItemRate.applicable_from_date).label("max_date"),
            )
            .where(
                ItemRate.applicable_from_date.is_not(None),
                ItemRate.applicable_from_date <= from_date,
            )
            .group_by(ItemRate.item_id, ItemRate.route_id)
            .subquery()
        )
        # Keep only rows whose date matches the latest for their combo
        query = query.where(
            ItemRate.item_id == latest_subq.c.sub_item_id,
            ItemRate.route_id == latest_subq.c.sub_route_id,
            ItemRate.applicable_from_date == latest_subq.c.max_date,
        )

    if status_filter == "active":
        query = query.where(ItemRate.is_active == True)
    elif status_filter == "inactive":
        query = query.where(or_(ItemRate.is_active == False, ItemRate.is_active.is_(None)))
    return query


async def count_item_rates(
    db: AsyncSession, status_filter: str | None = None,
    item_filter: int | None = None, route_filter: int | None = None,
    id_filter: int | None = None, id_op: str = "eq", id_filter_end: int | None = None,
    from_date: date_type | None = None,
) -> int:
    query = select(func.count()).select_from(ItemRate)
    query = _apply_filters(query, status_filter, item_filter, route_filter, id_filter, id_op, id_filter_end, from_date)
    result = await db.execute(query)
    return result.scalar()


SORTABLE_COLUMNS = {
    "id": ItemRate.id,
    "applicable_from_date": ItemRate.applicable_from_date,
    "levy": ItemRate.levy,
    "rate": ItemRate.rate,
    "item_id": ItemRate.item_id,
    "route_id": ItemRate.route_id,
    "is_active": ItemRate.is_active,
}


async def get_all_item_rates(
    db: AsyncSession, skip: int = 0, limit: int = 50, sort_by: str = "id", sort_order: str = "asc",
    status_filter: str | None = None,
    item_filter: int | None = None, route_filter: int | None = None,
    id_filter: int | None = None, id_op: str = "eq", id_filter_end: int | None = None,
    from_date: date_type | None = None,
) -> list[dict]:
    column = SORTABLE_COLUMNS.get(sort_by, ItemRate.id)
    order = column.desc() if sort_order == "desc" else column.asc()

    query = select(ItemRate)
    query = _apply_filters(query, status_filter, item_filter, route_filter, id_filter, id_op, id_filter_end, from_date)
    result = await db.execute(query.order_by(order).offset(skip).limit(limit))
    rows = result.scalars().all()

    enriched = []
    for ir in rows:
        enriched.append(await _enrich_item_rate(db, ir))
    return enriched


async def _validate_references(db: AsyncSession, item_id: int | None, route_id: int | None):
    if item_id is not None:
        result = await db.execute(select(Item.id).where(Item.id == item_id))
        if not result.scalar_one_or_none():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Item ID {item_id} not found")
    if route_id is not None:
        result = await db.execute(select(Route).where(Route.id == route_id))
        if not result.scalar_one_or_none():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Route ID {route_id} not found")


async def _check_duplicate(db: AsyncSession, item_id: int, route_id: int, applicable_from_date, exclude_id: int | None = None):
    query = select(ItemRate).where(
        ItemRate.item_id == item_id,
        ItemRate.route_id == route_id,
        ItemRate.applicable_from_date == applicable_from_date,
    )
    if exclude_id is not None:
        query = query.where(ItemRate.id != exclude_id)
    result = await db.execute(query)
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An item rate with the same item, route, and applicable date already exists",
        )


async def create_item_rate(db: AsyncSession, data: ItemRateCreate) -> dict:
    await _validate_references(db, data.item_id, data.route_id)
    await _check_duplicate(db, data.item_id, data.route_id, data.applicable_from_date)

    result = await db.execute(select(func.coalesce(func.max(ItemRate.id), 0)))
    next_id = result.scalar() + 1

    ir = ItemRate(
        id=next_id,
        applicable_from_date=data.applicable_from_date,
        levy=data.levy,
        rate=data.rate,
        item_id=data.item_id,
        route_id=data.route_id,
        is_active=True,
    )
    db.add(ir)
    await db.commit()
    await db.refresh(ir)
    return await get_item_rate_by_id(db, ir.id)


async def bulk_create_for_upcoming_date(db: AsyncSession, new_date: date_type) -> int:
    """Duplicate all active item rates with a new applicable_from_date. Returns count created."""
    # Fetch all active item rates
    result = await db.execute(
        select(ItemRate).where(ItemRate.is_active == True)
    )
    active_rates = result.scalars().all()
    if not active_rates:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No active item rates found to duplicate",
        )

    # Check which (item_id, route_id) combos already exist for the new date
    existing = await db.execute(
        select(ItemRate.item_id, ItemRate.route_id).where(
            ItemRate.applicable_from_date == new_date,
        )
    )
    existing_combos = {(row[0], row[1]) for row in existing.all()}

    # Get next id
    id_result = await db.execute(select(func.coalesce(func.max(ItemRate.id), 0)))
    next_id = id_result.scalar() + 1

    created = 0
    for rate in active_rates:
        if (rate.item_id, rate.route_id) in existing_combos:
            continue
        ir = ItemRate(
            id=next_id,
            applicable_from_date=new_date,
            levy=rate.levy,
            rate=rate.rate,
            item_id=rate.item_id,
            route_id=rate.route_id,
            is_active=True,
        )
        db.add(ir)
        next_id += 1
        created += 1

    if created == 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="All active item rates already have entries for this date",
        )

    await db.commit()
    return created


async def update_item_rate(db: AsyncSession, item_rate_id: int, data: ItemRateUpdate) -> dict:
    result = await db.execute(select(ItemRate).where(ItemRate.id == item_rate_id))
    ir = result.scalar_one_or_none()
    if not ir:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item rate not found")

    update_data = data.model_dump(exclude_unset=True)

    new_item_id = update_data.get("item_id", ir.item_id)
    new_route_id = update_data.get("route_id", ir.route_id)
    new_date = update_data.get("applicable_from_date", ir.applicable_from_date)

    if "item_id" in update_data or "route_id" in update_data:
        await _validate_references(db, new_item_id, new_route_id)

    if "item_id" in update_data or "route_id" in update_data or "applicable_from_date" in update_data:
        await _check_duplicate(db, new_item_id, new_route_id, new_date, exclude_id=item_rate_id)

    for field, value in update_data.items():
        setattr(ir, field, value)
    await db.commit()
    await db.refresh(ir)
    return await get_item_rate_by_id(db, ir.id)


# ── Auto-populate helpers ──


async def auto_create_rates_for_route(db: AsyncSession, route_id: int) -> int:
    """Create placeholder item_rate rows for all active items on a route.
    Called after route creation. Uses rate=None, levy=None (NULL bypasses CHECK rate > 1).
    Returns count of rows created.
    """
    import datetime
    today = datetime.date.today()

    # Get all active items
    result = await db.execute(select(Item.id).where(Item.is_active == True))
    item_ids = [row[0] for row in result.all()]
    if not item_ids:
        return 0

    # Get next id
    id_result = await db.execute(select(func.coalesce(func.max(ItemRate.id), 0)))
    next_id = id_result.scalar() + 1

    created = 0
    for item_id in item_ids:
        ir = ItemRate(
            id=next_id,
            applicable_from_date=today,
            levy=None,
            rate=None,
            item_id=item_id,
            route_id=route_id,
            is_active=True,
        )
        db.add(ir)
        next_id += 1
        created += 1

    return created


async def auto_create_rates_for_new_item(db: AsyncSession, item_id: int, route_ids: list[int]) -> int:
    """Create placeholder item_rate rows for a new item across specified route IDs.
    Called after item creation. Uses rate=None, levy=None.
    Returns count of rows created.
    """
    import datetime
    today = datetime.date.today()

    if not route_ids:
        return 0

    # Get next id
    id_result = await db.execute(select(func.coalesce(func.max(ItemRate.id), 0)))
    next_id = id_result.scalar() + 1

    created = 0
    for route_id in route_ids:
        ir = ItemRate(
            id=next_id,
            applicable_from_date=today,
            levy=None,
            rate=None,
            item_id=item_id,
            route_id=route_id,
            is_active=True,
        )
        db.add(ir)
        next_id += 1
        created += 1

    return created


async def deactivate_rates_for_route(db: AsyncSession, item_id: int, route_id: int) -> int:
    """Set is_active=False on all item_rate rows matching (item_id, route_id).
    Used by managers to soft-delete rates for their route only.
    Returns count of rows deactivated.
    """
    result = await db.execute(
        sa_update(ItemRate)
        .where(
            ItemRate.item_id == item_id,
            ItemRate.route_id == route_id,
            ItemRate.is_active == True,
        )
        .values(is_active=False)
    )
    await db.commit()
    return result.rowcount
