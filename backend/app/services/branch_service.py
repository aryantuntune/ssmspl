from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_

from app.models.branch import Branch
from app.schemas.branch import BranchCreate, BranchUpdate


async def get_branch_by_id(db: AsyncSession, branch_id: int) -> Branch:
    result = await db.execute(select(Branch).where(Branch.id == branch_id))
    branch = result.scalar_one_or_none()
    if not branch:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Branch not found")
    return branch


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
            query = query.where(Branch.id >= id_filter, Branch.id <= id_filter_end)
        elif id_op == "lt":
            query = query.where(Branch.id < id_filter)
        elif id_op == "gt":
            query = query.where(Branch.id > id_filter)
        else:
            query = query.where(Branch.id == id_filter)

    if search:
        if match_type == "starts_with":
            pattern = f"{search}%"
        elif match_type == "ends_with":
            pattern = f"%{search}"
        else:
            pattern = f"%{search}%"

        if search_column == "name":
            query = query.where(Branch.name.ilike(pattern))
        elif search_column == "address":
            query = query.where(Branch.address.ilike(pattern))
        elif search_column == "contact_nos":
            query = query.where(Branch.contact_nos.ilike(pattern))
        else:
            query = query.where(or_(
                Branch.name.ilike(pattern),
                Branch.address.ilike(pattern),
                Branch.contact_nos.ilike(pattern),
            ))

    if status == "active":
        query = query.where(Branch.is_active == True)
    elif status == "inactive":
        query = query.where(or_(Branch.is_active == False, Branch.is_active.is_(None)))
    return query


async def count_branches(
    db: AsyncSession, search: str | None = None, status: str | None = None,
    search_column: str = "all", match_type: str = "contains",
    id_filter: int | None = None, id_op: str = "eq", id_filter_end: int | None = None,
) -> int:
    query = select(func.count()).select_from(Branch)
    query = _apply_filters(query, search, status, search_column, match_type, id_filter, id_op, id_filter_end)
    result = await db.execute(query)
    return result.scalar()


SORTABLE_COLUMNS = {
    "id": Branch.id,
    "name": Branch.name,
    "address": Branch.address,
    "contact_nos": Branch.contact_nos,
    "is_active": Branch.is_active,
}


async def get_all_branches(
    db: AsyncSession, skip: int = 0, limit: int | None = 50, sort_by: str = "id", sort_order: str = "asc",
    search: str | None = None, status: str | None = None,
    search_column: str = "all", match_type: str = "contains",
    id_filter: int | None = None, id_op: str = "eq", id_filter_end: int | None = None,
) -> list[Branch]:
    column = SORTABLE_COLUMNS.get(sort_by, Branch.id)
    order = column.desc() if sort_order == "desc" else column.asc()
    query = select(Branch)
    query = _apply_filters(query, search, status, search_column, match_type, id_filter, id_op, id_filter_end)
    query = query.order_by(order).offset(skip)
    if limit is not None:
        query = query.limit(limit)
    result = await db.execute(query)
    return list(result.scalars().all())


async def create_branch(db: AsyncSession, branch_in: BranchCreate) -> Branch:
    # Check uniqueness of name
    existing = await db.execute(
        select(Branch).where(Branch.name == branch_in.name)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Branch name already exists",
        )

    # Get next id
    result = await db.execute(select(func.coalesce(func.max(Branch.id), 0)))
    next_id = result.scalar() + 1

    branch = Branch(
        id=next_id,
        name=branch_in.name,
        address=branch_in.address,
        contact_nos=branch_in.contact_nos,
        latitude=branch_in.latitude,
        longitude=branch_in.longitude,
        sf_after=branch_in.sf_after,
        sf_before=branch_in.sf_before,
        is_active=True,
    )
    db.add(branch)
    await db.commit()
    await db.refresh(branch)
    return branch


async def update_branch(db: AsyncSession, branch_id: int, branch_in: BranchUpdate) -> Branch:
    branch = await get_branch_by_id(db, branch_id)
    update_data = branch_in.model_dump(exclude_unset=True)

    # Check uniqueness if name is being updated
    if "name" in update_data:
        existing = await db.execute(
            select(Branch).where(Branch.name == update_data["name"], Branch.id != branch_id)
        )
        if existing.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Branch name already exists",
            )

    for field, value in update_data.items():
        setattr(branch, field, value)
    await db.commit()
    await db.refresh(branch)
    return branch
