import logging
import uuid
from datetime import date, time, datetime

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import aliased

from app.models.rate_change_log import RateChangeLog
from app.models.item import Item
from app.models.route import Route
from app.models.branch import Branch
from app.models.user import User
from app.core.rbac import UserRole

logger = logging.getLogger("ssmspl")


async def _apply_role_filter(db: AsyncSession, query, current_user: User):
    """Apply role-based visibility filter to a query."""
    if current_user.role == UserRole.MANAGER:
        query = query.where(RateChangeLog.updated_by_user == current_user.id)
    elif current_user.role == UserRole.ADMIN:
        manager_ids_result = await db.execute(
            select(User.id).where(User.role == UserRole.MANAGER)
        )
        manager_ids = [row[0] for row in manager_ids_result.all()]
        allowed_ids = manager_ids + [current_user.id]
        query = query.where(RateChangeLog.updated_by_user.in_(allowed_ids))
    # SUPER_ADMIN: no filter, sees all
    return query


def _apply_optional_filters(query, date_from, date_to, route_filter, item_filter):
    """Apply optional date, route, and item filters."""
    if date_from:
        query = query.where(RateChangeLog.date >= date_from)
    if date_to:
        query = query.where(RateChangeLog.date <= date_to)
    if route_filter:
        query = query.where(RateChangeLog.route_id == route_filter)
    if item_filter:
        query = query.where(RateChangeLog.item_id == item_filter)
    return query


async def insert_rate_change_log(
    db: AsyncSession,
    route_id: int,
    item_id: int,
    old_rate: float | None,
    new_rate: float | None,
    updated_by_user: uuid.UUID,
) -> None:
    """Insert a rate change log entry. Called from item_rate_service when rate changes."""
    now = datetime.now()
    log = RateChangeLog(
        date=now.date(),
        time=now.time().replace(microsecond=0),
        route_id=route_id,
        item_id=item_id,
        old_rate=old_rate,
        new_rate=new_rate,
        updated_by_user=updated_by_user,
    )
    db.add(log)


async def get_rate_change_logs(
    db: AsyncSession,
    current_user: User,
    skip: int = 0,
    limit: int = 50,
    date_from: date | None = None,
    date_to: date | None = None,
    route_filter: int | None = None,
    item_filter: int | None = None,
) -> list[dict]:
    """Fetch rate change logs with JOINs for related names."""
    BranchOne = aliased(Branch)
    BranchTwo = aliased(Branch)
    UpdatedByUser = aliased(User)

    query = (
        select(
            RateChangeLog.id,
            RateChangeLog.date,
            RateChangeLog.time,
            RateChangeLog.route_id,
            RateChangeLog.item_id,
            RateChangeLog.old_rate,
            RateChangeLog.new_rate,
            RateChangeLog.updated_by_user,
            RateChangeLog.created_at,
            Item.name.label("item_name"),
            BranchOne.name.label("branch_one_name"),
            BranchTwo.name.label("branch_two_name"),
            UpdatedByUser.full_name.label("updated_by_name"),
        )
        .outerjoin(Item, Item.id == RateChangeLog.item_id)
        .outerjoin(Route, Route.id == RateChangeLog.route_id)
        .outerjoin(BranchOne, BranchOne.id == Route.branch_id_one)
        .outerjoin(BranchTwo, BranchTwo.id == Route.branch_id_two)
        .outerjoin(UpdatedByUser, UpdatedByUser.id == RateChangeLog.updated_by_user)
    )

    query = await _apply_role_filter(db, query, current_user)
    query = _apply_optional_filters(query, date_from, date_to, route_filter, item_filter)
    query = query.order_by(RateChangeLog.id.desc()).offset(skip).limit(limit)

    result = await db.execute(query)
    rows = result.all()

    return [
        {
            "id": row.id,
            "date": row.date,
            "time": row.time,
            "route_id": row.route_id,
            "item_id": row.item_id,
            "old_rate": float(row.old_rate) if row.old_rate is not None else None,
            "new_rate": float(row.new_rate) if row.new_rate is not None else None,
            "updated_by_user": str(row.updated_by_user),
            "updated_by_name": row.updated_by_name,
            "item_name": row.item_name,
            "route_name": (
                f"{row.branch_one_name} - {row.branch_two_name}"
                if row.branch_one_name and row.branch_two_name
                else None
            ),
            "created_at": row.created_at,
        }
        for row in rows
    ]


async def count_rate_change_logs(
    db: AsyncSession,
    current_user: User,
    date_from: date | None = None,
    date_to: date | None = None,
    route_filter: int | None = None,
    item_filter: int | None = None,
) -> int:
    """Count rate change logs with role-based filtering."""
    query = select(func.count()).select_from(RateChangeLog)

    query = await _apply_role_filter(db, query, current_user)
    query = _apply_optional_filters(query, date_from, date_to, route_filter, item_filter)

    result = await db.execute(query)
    return result.scalar() or 0
