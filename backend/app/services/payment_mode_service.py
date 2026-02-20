from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_

from app.models.payment_mode import PaymentMode
from app.schemas.payment_mode import PaymentModeCreate, PaymentModeUpdate


async def get_payment_mode_by_id(db: AsyncSession, payment_mode_id: int) -> PaymentMode:
    result = await db.execute(select(PaymentMode).where(PaymentMode.id == payment_mode_id))
    payment_mode = result.scalar_one_or_none()
    if not payment_mode:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payment mode not found")
    return payment_mode


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
            query = query.where(PaymentMode.id >= id_filter, PaymentMode.id <= id_filter_end)
        elif id_op == "lt":
            query = query.where(PaymentMode.id < id_filter)
        elif id_op == "gt":
            query = query.where(PaymentMode.id > id_filter)
        else:
            query = query.where(PaymentMode.id == id_filter)

    if search:
        if match_type == "starts_with":
            pattern = f"{search}%"
        elif match_type == "ends_with":
            pattern = f"%{search}"
        else:
            pattern = f"%{search}%"

        if search_column == "description":
            query = query.where(PaymentMode.description.ilike(pattern))
        else:
            query = query.where(PaymentMode.description.ilike(pattern))

    if status == "active":
        query = query.where(PaymentMode.is_active == True)
    elif status == "inactive":
        query = query.where(PaymentMode.is_active == False)
    return query


async def count_payment_modes(
    db: AsyncSession, search: str | None = None, status: str | None = None,
    search_column: str = "all", match_type: str = "contains",
    id_filter: int | None = None, id_op: str = "eq", id_filter_end: int | None = None,
) -> int:
    query = select(func.count()).select_from(PaymentMode)
    query = _apply_filters(query, search, status, search_column, match_type, id_filter, id_op, id_filter_end)
    result = await db.execute(query)
    return result.scalar()


SORTABLE_COLUMNS = {
    "id": PaymentMode.id,
    "description": PaymentMode.description,
    "is_active": PaymentMode.is_active,
}


async def get_all_payment_modes(
    db: AsyncSession, skip: int = 0, limit: int = 50, sort_by: str = "id", sort_order: str = "asc",
    search: str | None = None, status: str | None = None,
    search_column: str = "all", match_type: str = "contains",
    id_filter: int | None = None, id_op: str = "eq", id_filter_end: int | None = None,
) -> list[PaymentMode]:
    column = SORTABLE_COLUMNS.get(sort_by, PaymentMode.id)
    order = column.desc() if sort_order == "desc" else column.asc()
    query = select(PaymentMode)
    query = _apply_filters(query, search, status, search_column, match_type, id_filter, id_op, id_filter_end)
    result = await db.execute(
        query.order_by(order).offset(skip).limit(limit)
    )
    return list(result.scalars().all())


async def create_payment_mode(db: AsyncSession, payment_mode_in: PaymentModeCreate) -> PaymentMode:
    # Check uniqueness of description
    existing = await db.execute(
        select(PaymentMode).where(PaymentMode.description == payment_mode_in.description)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Payment mode description already exists",
        )

    # Get next id
    result = await db.execute(select(func.coalesce(func.max(PaymentMode.id), 0)))
    next_id = result.scalar() + 1

    payment_mode = PaymentMode(
        id=next_id,
        description=payment_mode_in.description,
        is_active=True,
    )
    db.add(payment_mode)
    await db.commit()
    await db.refresh(payment_mode)
    return payment_mode


async def update_payment_mode(db: AsyncSession, payment_mode_id: int, payment_mode_in: PaymentModeUpdate) -> PaymentMode:
    payment_mode = await get_payment_mode_by_id(db, payment_mode_id)
    update_data = payment_mode_in.model_dump(exclude_unset=True)

    # Check uniqueness if description is being updated
    if "description" in update_data:
        existing = await db.execute(
            select(PaymentMode).where(PaymentMode.description == update_data["description"], PaymentMode.id != payment_mode_id)
        )
        if existing.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Payment mode description already exists",
            )

    for field, value in update_data.items():
        setattr(payment_mode, field, value)
    await db.commit()
    await db.refresh(payment_mode)
    return payment_mode
