from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_

from app.models.boat import Boat
from app.models.branch import Branch
from app.models.route import Route
from app.schemas.boat import BoatCreate, BoatUpdate


def _serialize_boat(boat: Boat, branch_one_name: str | None, branch_two_name: str | None) -> dict:
    if branch_one_name and branch_two_name:
        route_name = f"{branch_one_name} - {branch_two_name}"
    else:
        route_name = None
    return {
        "id": boat.id,
        "name": boat.name,
        "no": boat.no,
        "is_active": boat.is_active,
        "route_id": boat.route_id,
        "route_name": route_name,
        "created_at": boat.created_at,
        "updated_at": boat.updated_at,
    }


def _boat_with_route_query():
    """Base SELECT that joins routes + branches so route_name can be rendered.

    Outer joins are intentional so boats with a NULL route_id still appear.
    """
    BranchOne = Branch.__table__.alias("boat_branch_one")
    BranchTwo = Branch.__table__.alias("boat_branch_two")
    return (
        select(
            Boat,
            BranchOne.c.name.label("branch_one_name"),
            BranchTwo.c.name.label("branch_two_name"),
        )
        .outerjoin(Route, Route.id == Boat.route_id)
        .outerjoin(BranchOne, BranchOne.c.id == Route.branch_id_one)
        .outerjoin(BranchTwo, BranchTwo.c.id == Route.branch_id_two)
    )


async def get_boat_by_id(db: AsyncSession, boat_id: int) -> dict:
    query = _boat_with_route_query().where(Boat.id == boat_id)
    result = await db.execute(query)
    row = result.one_or_none()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Boat not found")
    return _serialize_boat(row[0], row[1], row[2])


async def _validate_route_exists(db: AsyncSession, route_id: int) -> None:
    """Ensure the given route_id refers to an actual route, otherwise 404."""
    result = await db.execute(select(Route.id).where(Route.id == route_id))
    if not result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Route ID {route_id} not found",
        )


def _apply_filters(
    query,
    search: str | None = None,
    status: str | None = None,
    search_column: str = "all",
    match_type: str = "contains",
    id_filter: int | None = None,
    id_op: str = "eq",
    id_filter_end: int | None = None,
    route_id: int | None = None,
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

    if route_id is not None:
        query = query.where(Boat.route_id == route_id)

    return query


async def count_boats(
    db: AsyncSession, search: str | None = None, status: str | None = None,
    search_column: str = "all", match_type: str = "contains",
    id_filter: int | None = None, id_op: str = "eq", id_filter_end: int | None = None,
    route_id: int | None = None,
) -> int:
    query = select(func.count()).select_from(Boat)
    query = _apply_filters(
        query, search, status, search_column, match_type,
        id_filter, id_op, id_filter_end, route_id,
    )
    result = await db.execute(query)
    return result.scalar()


SORTABLE_COLUMNS = {
    "id": Boat.id,
    "name": Boat.name,
    "no": Boat.no,
    "is_active": Boat.is_active,
    "route_id": Boat.route_id,
}


async def get_all_boats(
    db: AsyncSession, skip: int = 0, limit: int = 50, sort_by: str = "id", sort_order: str = "asc",
    search: str | None = None, status: str | None = None,
    search_column: str = "all", match_type: str = "contains",
    id_filter: int | None = None, id_op: str = "eq", id_filter_end: int | None = None,
    route_id: int | None = None,
) -> list[dict]:
    column = SORTABLE_COLUMNS.get(sort_by, Boat.id)
    order = column.desc() if sort_order == "desc" else column.asc()

    query = _boat_with_route_query()
    query = _apply_filters(
        query, search, status, search_column, match_type,
        id_filter, id_op, id_filter_end, route_id,
    )
    result = await db.execute(query.order_by(order).offset(skip).limit(limit))
    rows = result.all()
    return [_serialize_boat(row[0], row[1], row[2]) for row in rows]


async def create_boat(db: AsyncSession, boat_in: BoatCreate) -> dict:
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

    if boat_in.route_id is not None:
        await _validate_route_exists(db, boat_in.route_id)

    # Get next id
    result = await db.execute(select(func.coalesce(func.max(Boat.id), 0)))
    next_id = result.scalar() + 1

    boat = Boat(
        id=next_id,
        name=boat_in.name,
        no=boat_in.no,
        is_active=True,
        route_id=boat_in.route_id,
    )
    db.add(boat)
    await db.commit()
    await db.refresh(boat)
    return await get_boat_by_id(db, boat.id)


async def update_boat(db: AsyncSession, boat_id: int, boat_in: BoatUpdate) -> dict:
    result = await db.execute(select(Boat).where(Boat.id == boat_id))
    boat = result.scalar_one_or_none()
    if not boat:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Boat not found")

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

    if "route_id" in update_data and update_data["route_id"] is not None:
        await _validate_route_exists(db, update_data["route_id"])

    for field, value in update_data.items():
        setattr(boat, field, value)
    await db.commit()
    await db.refresh(boat)
    return await get_boat_by_id(db, boat.id)
