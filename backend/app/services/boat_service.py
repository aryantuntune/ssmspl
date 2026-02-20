from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_

from app.models.boat import Boat
from app.schemas.boat import BoatCreate, BoatUpdate


async def get_boat_by_id(db: AsyncSession, boat_id: int) -> Boat:
    result = await db.execute(select(Boat).where(Boat.id == boat_id))
    boat = result.scalar_one_or_none()
    if not boat:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Boat not found")
    return boat


def _apply_filters(
    query,
    search: str | None = None,
    status: str | None = None,
    search_column: str = "all",
    match_type: str = "contains",
    id_filter: int | None = None,
    id_op: str = "eq",
    id_filter_end: int | None = None,
):
    if id_filter is not None:
        if id_op == "between" and id_filter_end is not None:
            query = query.where(Boat.id >= id_filter, Boat.id <= id_filter_end)
        elif id_op == "lt":
            query = query.where(Boat.id < id_filter)
        elif id_op == "gt":
            query = query.where(Boat.id > id_filter)
        else:
            query = query.where(Boat.id == id_filter)

    if search:
        if match_type == "starts_with":
            pattern = f"{search}%"
        elif match_type == "ends_with":
            pattern = f"%{search}"
        else:
            pattern = f"%{search}%"

        if search_column == "name":
            query = query.where(Boat.name.ilike(pattern))
        elif search_column == "no":
            query = query.where(Boat.no.ilike(pattern))
        else:
            query = query.where(or_(Boat.name.ilike(pattern), Boat.no.ilike(pattern)))

    if status == "active":
        query = query.where(Boat.is_active == True)
    elif status == "inactive":
        query = query.where(or_(Boat.is_active == False, Boat.is_active.is_(None)))
    return query


async def count_boats(
    db: AsyncSession, search: str | None = None, status: str | None = None,
    search_column: str = "all", match_type: str = "contains",
    id_filter: int | None = None, id_op: str = "eq", id_filter_end: int | None = None,
) -> int:
    query = select(func.count()).select_from(Boat)
    query = _apply_filters(query, search, status, search_column, match_type, id_filter, id_op, id_filter_end)
    result = await db.execute(query)
    return result.scalar()


SORTABLE_COLUMNS = {"id": Boat.id, "name": Boat.name, "no": Boat.no, "is_active": Boat.is_active}


async def get_all_boats(
    db: AsyncSession, skip: int = 0, limit: int = 50, sort_by: str = "id", sort_order: str = "asc",
    search: str | None = None, status: str | None = None,
    search_column: str = "all", match_type: str = "contains",
    id_filter: int | None = None, id_op: str = "eq", id_filter_end: int | None = None,
) -> list[Boat]:
    column = SORTABLE_COLUMNS.get(sort_by, Boat.id)
    order = column.desc() if sort_order == "desc" else column.asc()
    query = select(Boat)
    query = _apply_filters(query, search, status, search_column, match_type, id_filter, id_op, id_filter_end)
    result = await db.execute(
        query.order_by(order).offset(skip).limit(limit)
    )
    return list(result.scalars().all())


async def create_boat(db: AsyncSession, boat_in: BoatCreate) -> Boat:
    # Check uniqueness of name and no
    existing = await db.execute(
        select(Boat).where(
            (Boat.name == boat_in.name) | (Boat.no == boat_in.no)
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Boat name or number already exists",
        )

    # Get next id
    result = await db.execute(select(func.coalesce(func.max(Boat.id), 0)))
    next_id = result.scalar() + 1

    boat = Boat(
        id=next_id,
        name=boat_in.name,
        no=boat_in.no,
        is_active=True,
    )
    db.add(boat)
    await db.commit()
    await db.refresh(boat)
    return boat


async def update_boat(db: AsyncSession, boat_id: int, boat_in: BoatUpdate) -> Boat:
    boat = await get_boat_by_id(db, boat_id)
    update_data = boat_in.model_dump(exclude_unset=True)

    # Check uniqueness if name or no is being updated
    if "name" in update_data or "no" in update_data:
        conditions = []
        if "name" in update_data:
            conditions.append(Boat.name == update_data["name"])
        if "no" in update_data:
            conditions.append(Boat.no == update_data["no"])

        existing = await db.execute(
            select(Boat).where(or_(*conditions), Boat.id != boat_id)
        )
        if existing.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Boat name or number already exists",
            )

    for field, value in update_data.items():
        setattr(boat, field, value)
    await db.commit()
    await db.refresh(boat)
    return boat
