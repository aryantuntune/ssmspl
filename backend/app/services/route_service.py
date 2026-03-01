from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_

from app.models.route import Route
from app.models.branch import Branch
from app.schemas.route import RouteCreate, RouteUpdate


async def get_route_by_id(db: AsyncSession, route_id: int) -> dict:
    result = await db.execute(
        select(
            Route,
            Branch.name.label("branch_one_name"),
        )
        .join(Branch, Branch.id == Route.branch_id_one)
        .where(Route.id == route_id)
    )
    row = result.one_or_none()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Route not found")

    route = row[0]
    branch_one_name = row[1]

    # Get second branch name
    result2 = await db.execute(select(Branch.name).where(Branch.id == route.branch_id_two))
    branch_two_name = result2.scalar_one_or_none()

    return {
        "id": route.id,
        "branch_id_one": route.branch_id_one,
        "branch_id_two": route.branch_id_two,
        "is_active": route.is_active,
        "branch_one_name": branch_one_name,
        "branch_two_name": branch_two_name,
    }


def _apply_filters(
    query,
    status_filter: str | None = None,
    branch_filter: int | None = None,
    id_filter: int | None = None,
    id_op: str = "eq",
    id_filter_end: int | None = None,
):
    if id_filter is not None:
        if id_op == "between" and id_filter_end is not None:
            query = query.where(Route.id >= id_filter, Route.id <= id_filter_end)
        elif id_op == "lt":
            query = query.where(Route.id < id_filter)
        elif id_op == "gt":
            query = query.where(Route.id > id_filter)
        else:
            query = query.where(Route.id == id_filter)

    if branch_filter is not None:
        query = query.where(or_(
            Route.branch_id_one == branch_filter,
            Route.branch_id_two == branch_filter,
        ))

    if status_filter == "active":
        query = query.where(Route.is_active == True)
    elif status_filter == "inactive":
        query = query.where(or_(Route.is_active == False, Route.is_active.is_(None)))
    return query


async def count_routes(
    db: AsyncSession, status_filter: str | None = None,
    branch_filter: int | None = None,
    id_filter: int | None = None, id_op: str = "eq", id_filter_end: int | None = None,
) -> int:
    query = select(func.count()).select_from(Route)
    query = _apply_filters(query, status_filter, branch_filter, id_filter, id_op, id_filter_end)
    result = await db.execute(query)
    return result.scalar()


SORTABLE_COLUMNS = {
    "id": Route.id,
    "branch_id_one": Route.branch_id_one,
    "branch_id_two": Route.branch_id_two,
    "is_active": Route.is_active,
}


async def get_all_routes(
    db: AsyncSession, skip: int = 0, limit: int = 50, sort_by: str = "id", sort_order: str = "asc",
    status_filter: str | None = None,
    branch_filter: int | None = None,
    id_filter: int | None = None, id_op: str = "eq", id_filter_end: int | None = None,
) -> list[dict]:
    column = SORTABLE_COLUMNS.get(sort_by, Route.id)
    order = column.desc() if sort_order == "desc" else column.asc()

    # Alias Branch table for the two joins
    BranchOne = Branch.__table__.alias("branch_one")
    BranchTwo = Branch.__table__.alias("branch_two")

    query = (
        select(
            Route,
            BranchOne.c.name.label("branch_one_name"),
            BranchTwo.c.name.label("branch_two_name"),
        )
        .join(BranchOne, BranchOne.c.id == Route.branch_id_one)
        .join(BranchTwo, BranchTwo.c.id == Route.branch_id_two)
    )
    query = _apply_filters(query, status_filter, branch_filter, id_filter, id_op, id_filter_end)
    result = await db.execute(query.order_by(order).offset(skip).limit(limit))
    rows = result.all()
    return [
        {
            "id": row[0].id,
            "branch_id_one": row[0].branch_id_one,
            "branch_id_two": row[0].branch_id_two,
            "is_active": row[0].is_active,
            "branch_one_name": row[1],
            "branch_two_name": row[2],
        }
        for row in rows
    ]


async def _validate_branches(db: AsyncSession, branch_id_one: int, branch_id_two: int):
    if branch_id_one == branch_id_two:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A route must connect two different branches",
        )
    result = await db.execute(
        select(Branch.id).where(Branch.id.in_([branch_id_one, branch_id_two]))
    )
    found_ids = set(result.scalars().all())
    missing = {branch_id_one, branch_id_two} - found_ids
    if missing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Branch ID(s) not found: {', '.join(str(m) for m in missing)}",
        )


async def _check_duplicate_route(db: AsyncSession, branch_id_one: int, branch_id_two: int, exclude_id: int | None = None):
    query = select(Route).where(
        or_(
            (Route.branch_id_one == branch_id_one) & (Route.branch_id_two == branch_id_two),
            (Route.branch_id_one == branch_id_two) & (Route.branch_id_two == branch_id_one),
        )
    )
    if exclude_id is not None:
        query = query.where(Route.id != exclude_id)
    result = await db.execute(query)
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A route between these two branches already exists",
        )


async def create_route(db: AsyncSession, route_in: RouteCreate) -> dict:
    await _validate_branches(db, route_in.branch_id_one, route_in.branch_id_two)
    await _check_duplicate_route(db, route_in.branch_id_one, route_in.branch_id_two)

    # Get next id
    result = await db.execute(select(func.coalesce(func.max(Route.id), 0)))
    next_id = result.scalar() + 1

    route = Route(
        id=next_id,
        branch_id_one=route_in.branch_id_one,
        branch_id_two=route_in.branch_id_two,
        is_active=True,
    )
    db.add(route)
    await db.flush()  # get route.id before commit

    # Auto-create placeholder rates for all active items × both branches
    from app.services.item_rate_service import auto_create_rates_for_route
    await auto_create_rates_for_route(db, route.id)

    await db.commit()
    await db.refresh(route)
    return await get_route_by_id(db, route.id)


async def update_route(db: AsyncSession, route_id: int, route_in: RouteUpdate) -> dict:
    # Fetch the raw route model first
    result = await db.execute(select(Route).where(Route.id == route_id))
    route = result.scalar_one_or_none()
    if not route:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Route not found")

    update_data = route_in.model_dump(exclude_unset=True)

    new_b1 = update_data.get("branch_id_one", route.branch_id_one)
    new_b2 = update_data.get("branch_id_two", route.branch_id_two)

    if "branch_id_one" in update_data or "branch_id_two" in update_data:
        await _validate_branches(db, new_b1, new_b2)
        await _check_duplicate_route(db, new_b1, new_b2, exclude_id=route_id)

    for field, value in update_data.items():
        setattr(route, field, value)
    await db.commit()
    await db.refresh(route)
    return await get_route_by_id(db, route.id)
