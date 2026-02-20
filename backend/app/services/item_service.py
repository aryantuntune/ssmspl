from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_

from app.models.item import Item
from app.schemas.item import ItemCreate, ItemUpdate


async def get_item_by_id(db: AsyncSession, item_id: int) -> Item:
    result = await db.execute(select(Item).where(Item.id == item_id))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found")
    return item


def _apply_filters(
    query,
    search: str | None = None,
    status: str | None = None,
    search_column: str = "all",
    match_type: str = "contains",
    id_filter: int | None = None,
    id_op: str = "eq",
    id_filter_end: int | None = None,
    online_visibility: str | None = None,
    is_vehicle: str | None = None,
):
    if id_filter is not None:
        if id_op == "between" and id_filter_end is not None:
            query = query.where(Item.id >= id_filter, Item.id <= id_filter_end)
        elif id_op == "lt":
            query = query.where(Item.id < id_filter)
        elif id_op == "gt":
            query = query.where(Item.id > id_filter)
        else:
            query = query.where(Item.id == id_filter)

    if search:
        if match_type == "starts_with":
            pattern = f"{search}%"
        elif match_type == "ends_with":
            pattern = f"%{search}"
        else:
            pattern = f"%{search}%"

        if search_column == "name":
            query = query.where(Item.name.ilike(pattern))
        elif search_column == "short_name":
            query = query.where(Item.short_name.ilike(pattern))
        else:
            query = query.where(or_(
                Item.name.ilike(pattern),
                Item.short_name.ilike(pattern),
            ))

    if status == "active":
        query = query.where(Item.is_active == True)
    elif status == "inactive":
        query = query.where(or_(Item.is_active == False, Item.is_active.is_(None)))

    if online_visibility == "visible":
        query = query.where(Item.online_visibility == True)
    elif online_visibility == "hidden":
        query = query.where(or_(Item.online_visibility == False, Item.online_visibility.is_(None)))

    if is_vehicle == "yes":
        query = query.where(Item.is_vehicle == True)
    elif is_vehicle == "no":
        query = query.where(or_(Item.is_vehicle == False, Item.is_vehicle.is_(None)))

    return query


async def count_items(
    db: AsyncSession, search: str | None = None, status: str | None = None,
    search_column: str = "all", match_type: str = "contains",
    id_filter: int | None = None, id_op: str = "eq", id_filter_end: int | None = None,
    online_visibility: str | None = None, is_vehicle: str | None = None,
) -> int:
    query = select(func.count()).select_from(Item)
    query = _apply_filters(query, search, status, search_column, match_type, id_filter, id_op, id_filter_end, online_visibility, is_vehicle)
    result = await db.execute(query)
    return result.scalar()


SORTABLE_COLUMNS = {
    "id": Item.id,
    "name": Item.name,
    "short_name": Item.short_name,
    "online_visibility": Item.online_visibility,
    "is_vehicle": Item.is_vehicle,
    "is_active": Item.is_active,
}


async def get_all_items(
    db: AsyncSession, skip: int = 0, limit: int = 50, sort_by: str = "id", sort_order: str = "asc",
    search: str | None = None, status: str | None = None,
    search_column: str = "all", match_type: str = "contains",
    id_filter: int | None = None, id_op: str = "eq", id_filter_end: int | None = None,
    online_visibility: str | None = None, is_vehicle: str | None = None,
) -> list[Item]:
    column = SORTABLE_COLUMNS.get(sort_by, Item.id)
    order = column.desc() if sort_order == "desc" else column.asc()
    query = select(Item)
    query = _apply_filters(query, search, status, search_column, match_type, id_filter, id_op, id_filter_end, online_visibility, is_vehicle)
    result = await db.execute(
        query.order_by(order).offset(skip).limit(limit)
    )
    return list(result.scalars().all())


async def create_item(db: AsyncSession, item_in: ItemCreate) -> Item:
    # Check uniqueness of name
    existing = await db.execute(
        select(Item).where(Item.name == item_in.name)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Item name already exists",
        )

    # Check uniqueness of short_name
    existing = await db.execute(
        select(Item).where(Item.short_name == item_in.short_name)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Item short name already exists",
        )

    # Get next id
    result = await db.execute(select(func.coalesce(func.max(Item.id), 0)))
    next_id = result.scalar() + 1

    item = Item(
        id=next_id,
        name=item_in.name,
        short_name=item_in.short_name,
        online_visibility=item_in.online_visibility,
        is_vehicle=item_in.is_vehicle,
        is_active=True,
    )
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return item


async def update_item(db: AsyncSession, item_id: int, item_in: ItemUpdate) -> Item:
    item = await get_item_by_id(db, item_id)
    update_data = item_in.model_dump(exclude_unset=True)

    # Check uniqueness if name is being updated
    if "name" in update_data:
        existing = await db.execute(
            select(Item).where(Item.name == update_data["name"], Item.id != item_id)
        )
        if existing.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Item name already exists",
            )

    # Check uniqueness if short_name is being updated
    if "short_name" in update_data:
        existing = await db.execute(
            select(Item).where(Item.short_name == update_data["short_name"], Item.id != item_id)
        )
        if existing.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Item short name already exists",
            )

    for field, value in update_data.items():
        setattr(item, field, value)
    await db.commit()
    await db.refresh(item)
    return item
