import datetime

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.models.ferry_schedule import FerrySchedule
from app.models.branch import Branch
from app.schemas.ferry_schedule import FerryScheduleCreate, FerryScheduleUpdate


def _format_time(t: datetime.time) -> str:
    return t.strftime("%H:%M")


def _parse_time(s: str) -> datetime.time:
    try:
        return datetime.datetime.strptime(s, "%H:%M").time()
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid time format: '{s}'. Expected HH:MM",
        )


async def get_schedule_by_id(db: AsyncSession, schedule_id: int) -> dict:
    result = await db.execute(
        select(FerrySchedule, Branch.name.label("branch_name"))
        .join(Branch, Branch.id == FerrySchedule.branch_id)
        .where(FerrySchedule.id == schedule_id)
    )
    row = result.one_or_none()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Schedule not found")

    schedule = row[0]
    return {
        "id": schedule.id,
        "branch_id": schedule.branch_id,
        "departure": _format_time(schedule.departure),
        "branch_name": row[1],
    }


def _apply_filters(
    query,
    branch_filter: int | None = None,
    id_filter: int | None = None,
    id_op: str = "eq",
    id_filter_end: int | None = None,
):
    if id_filter is not None:
        if id_op == "between" and id_filter_end is not None:
            query = query.where(FerrySchedule.id >= id_filter, FerrySchedule.id <= id_filter_end)
        elif id_op == "lt":
            query = query.where(FerrySchedule.id < id_filter)
        elif id_op == "gt":
            query = query.where(FerrySchedule.id > id_filter)
        else:
            query = query.where(FerrySchedule.id == id_filter)

    if branch_filter is not None:
        query = query.where(FerrySchedule.branch_id == branch_filter)

    return query


async def count_schedules(
    db: AsyncSession,
    branch_filter: int | None = None,
    id_filter: int | None = None, id_op: str = "eq", id_filter_end: int | None = None,
) -> int:
    query = select(func.count()).select_from(FerrySchedule)
    query = _apply_filters(query, branch_filter, id_filter, id_op, id_filter_end)
    result = await db.execute(query)
    return result.scalar()


SORTABLE_COLUMNS = {
    "id": FerrySchedule.id,
    "branch_id": FerrySchedule.branch_id,
    "departure": FerrySchedule.departure,
}


async def get_all_schedules(
    db: AsyncSession, skip: int = 0, limit: int = 50, sort_by: str = "id", sort_order: str = "asc",
    branch_filter: int | None = None,
    id_filter: int | None = None, id_op: str = "eq", id_filter_end: int | None = None,
) -> list[dict]:
    column = SORTABLE_COLUMNS.get(sort_by, FerrySchedule.id)
    order = column.desc() if sort_order == "desc" else column.asc()

    query = (
        select(FerrySchedule, Branch.name.label("branch_name"))
        .join(Branch, Branch.id == FerrySchedule.branch_id)
    )
    query = _apply_filters(query, branch_filter, id_filter, id_op, id_filter_end)
    result = await db.execute(query.order_by(order).offset(skip).limit(limit))
    rows = result.all()
    return [
        {
            "id": row[0].id,
            "branch_id": row[0].branch_id,
            "departure": _format_time(row[0].departure),
            "branch_name": row[1],
        }
        for row in rows
    ]


async def _validate_branch(db: AsyncSession, branch_id: int):
    result = await db.execute(select(Branch.id).where(Branch.id == branch_id))
    if not result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Branch ID not found: {branch_id}",
        )


async def _check_duplicate(db: AsyncSession, branch_id: int, departure: datetime.time, exclude_id: int | None = None):
    query = select(FerrySchedule).where(
        FerrySchedule.branch_id == branch_id,
        FerrySchedule.departure == departure,
    )
    if exclude_id is not None:
        query = query.where(FerrySchedule.id != exclude_id)
    result = await db.execute(query)
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A schedule with this branch and departure time already exists",
        )


async def create_schedule(db: AsyncSession, schedule_in: FerryScheduleCreate) -> dict:
    departure_time = _parse_time(schedule_in.departure)
    await _validate_branch(db, schedule_in.branch_id)
    await _check_duplicate(db, schedule_in.branch_id, departure_time)

    # Get next id
    result = await db.execute(select(func.coalesce(func.max(FerrySchedule.id), 0)))
    next_id = result.scalar() + 1

    schedule = FerrySchedule(
        id=next_id,
        branch_id=schedule_in.branch_id,
        departure=departure_time,
    )
    db.add(schedule)
    await db.commit()
    await db.refresh(schedule)
    return await get_schedule_by_id(db, schedule.id)


async def update_schedule(db: AsyncSession, schedule_id: int, schedule_in: FerryScheduleUpdate) -> dict:
    result = await db.execute(select(FerrySchedule).where(FerrySchedule.id == schedule_id))
    schedule = result.scalar_one_or_none()
    if not schedule:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Schedule not found")

    update_data = schedule_in.model_dump(exclude_unset=True)

    new_branch_id = update_data.get("branch_id", schedule.branch_id)
    new_departure = _parse_time(update_data["departure"]) if "departure" in update_data else schedule.departure

    if "branch_id" in update_data:
        await _validate_branch(db, new_branch_id)

    if "branch_id" in update_data or "departure" in update_data:
        await _check_duplicate(db, new_branch_id, new_departure, exclude_id=schedule_id)

    if "branch_id" in update_data:
        schedule.branch_id = new_branch_id
    if "departure" in update_data:
        schedule.departure = new_departure

    await db.commit()
    await db.refresh(schedule)
    return await get_schedule_by_id(db, schedule.id)
