import uuid
from datetime import datetime, timezone, timedelta

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, update as sa_update, case

from app.config import settings
from app.database import AsyncSessionLocal
from app.models.user_session import UserSession
from app.models.user import User
from app.models.branch import Branch
from app.models.ticket import Ticket
from app.models.user_activity_log import UserActivityLog
from app.core.rbac import UserRole
from app.services.geo_service import resolve_geo

STALE_TIMEOUT = timedelta(minutes=15)


async def start_session(
    db: AsyncSession,
    user_id: uuid.UUID,
    session_id: str,
    ip_address: str | None = None,
    user_agent: str | None = None,
    branch_id: int | None = None,
    route_id: int | None = None,
) -> UserSession:
    """Create a new session row. Geo data resolved async from IP."""
    geo = await resolve_geo(ip_address)
    now = datetime.now(timezone.utc)
    session = UserSession(
        user_id=user_id,
        session_id=session_id,
        started_at=now,
        last_heartbeat=now,
        ip_address=ip_address,
        city=geo.get("city_display"),
        user_agent=user_agent[:255] if user_agent and len(user_agent) > 255 else user_agent,
        branch_id=branch_id,
        route_id=route_id,
        latitude=geo.get("latitude"),
        longitude=geo.get("longitude"),
        isp=geo.get("isp"),
        portal="admin" if settings.ADMIN_PORTAL_MODE else None,
    )
    db.add(session)
    return session


async def end_session(
    db: AsyncSession,
    session_id: str,
    reason: str,
) -> None:
    """Close an active session by session_id."""
    now = datetime.now(timezone.utc)
    await db.execute(
        sa_update(UserSession)
        .where(
            UserSession.session_id == session_id,
            UserSession.ended_at.is_(None),
        )
        .values(ended_at=now, end_reason=reason)
    )


async def update_heartbeat(db: AsyncSession, session_id: str) -> None:
    """Update last_heartbeat for the active session."""
    now = datetime.now(timezone.utc)
    await db.execute(
        sa_update(UserSession)
        .where(
            UserSession.session_id == session_id,
            UserSession.ended_at.is_(None),
        )
        .values(last_heartbeat=now)
    )


async def update_session_branch(db: AsyncSession, session_id: str, branch_id: int) -> None:
    """Update branch_id on the active session when user switches branch."""
    await db.execute(
        sa_update(UserSession)
        .where(
            UserSession.session_id == session_id,
            UserSession.ended_at.is_(None),
        )
        .values(branch_id=branch_id)
    )


async def close_stale_sessions(db: AsyncSession) -> int:
    """Close sessions with no heartbeat for >15 minutes. Returns count closed.

    Uses its own DB session so it never commits the caller's pending state.
    """
    cutoff = datetime.now(timezone.utc) - STALE_TIMEOUT
    async with AsyncSessionLocal() as _db:
        result = await _db.execute(
            sa_update(UserSession)
            .where(
                UserSession.ended_at.is_(None),
                UserSession.last_heartbeat < cutoff,
            )
            .values(ended_at=UserSession.last_heartbeat, end_reason="idle_timeout")
        )
        await _db.commit()
        return result.rowcount


def _ticket_count_subquery(user_id_col, started_at_col, ended_at_col, role_col):
    """Build a correlated subquery for ticket counts based on role."""
    # For BILLING_OPERATOR: tickets created during session
    billing_count = (
        select(func.count())
        .where(
            Ticket.created_by == user_id_col,
            Ticket.created_at >= started_at_col,
            Ticket.created_at <= func.coalesce(ended_at_col, func.now()),
        )
        .correlate(UserSession)
        .scalar_subquery()
    )
    # For TICKET_CHECKER: tickets verified during session
    checker_count = (
        select(func.count())
        .where(
            Ticket.status == "VERIFIED",
            Ticket.updated_by == user_id_col,
            Ticket.checked_in_at >= started_at_col,
            Ticket.checked_in_at <= func.coalesce(ended_at_col, func.now()),
        )
        .correlate(UserSession)
        .scalar_subquery()
    )
    return case(
        (role_col == UserRole.BILLING_OPERATOR.value, billing_count),
        (role_col == UserRole.TICKET_CHECKER.value, checker_count),
        else_=None,
    )


def _build_session_query(*, include_ended: bool = False):
    """Build the base SELECT for session queries with user info, branch, and ticket counts."""
    ticket_count = _ticket_count_subquery(
        User.id, UserSession.started_at, UserSession.ended_at, User.role
    )
    cols = [
        UserSession.id,
        UserSession.user_id,
        UserSession.session_id,
        UserSession.started_at,
        UserSession.last_heartbeat,
        UserSession.ip_address,
        UserSession.city,
        UserSession.user_agent,
        UserSession.branch_id,
        UserSession.route_id,
        UserSession.latitude,
        UserSession.longitude,
        UserSession.isp,
        UserSession.portal,
        User.full_name,
        User.username,
        User.role,
        Branch.name.label("branch_name"),
        ticket_count.label("ticket_count"),
    ]
    if include_ended:
        cols.insert(5, UserSession.ended_at)
        cols.insert(6, UserSession.end_reason)

    query = (
        select(*cols)
        .join(User, User.id == UserSession.user_id)
        .outerjoin(Branch, Branch.id == UserSession.branch_id)
    )
    return query


def _row_to_dict(row, *, include_ended: bool = False) -> dict:
    """Convert a query row to a dict for API response."""
    d = {
        "id": row.id,
        "user_id": str(row.user_id),
        "session_id": row.session_id,
        "started_at": row.started_at.isoformat() if row.started_at else None,
        "last_heartbeat": row.last_heartbeat.isoformat() if row.last_heartbeat else None,
        "ip_address": row.ip_address,
        "city": row.city,
        "user_agent": row.user_agent,
        "branch_id": row.branch_id,
        "branch_name": row.branch_name,
        "route_id": row.route_id,
        "latitude": float(row.latitude) if row.latitude is not None else None,
        "longitude": float(row.longitude) if row.longitude is not None else None,
        "isp": row.isp,
        "portal": row.portal,
        "full_name": row.full_name,
        "username": row.username,
        "role": row.role.value if hasattr(row.role, "value") else row.role,
        "ticket_count": row.ticket_count,
    }
    if include_ended:
        d["ended_at"] = row.ended_at.isoformat() if row.ended_at else None
        d["end_reason"] = row.end_reason
    return d


async def get_active_sessions(db: AsyncSession) -> list[dict]:
    """Return all active sessions with user info, branch, and ticket counts."""
    query = (
        _build_session_query(include_ended=False)
        .where(UserSession.ended_at.is_(None))
        .order_by(UserSession.started_at.desc())
    )
    result = await db.execute(query)
    return [_row_to_dict(row) for row in result.all()]


async def get_session_history(
    db: AsyncSession,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    user_id_filter: uuid.UUID | None = None,
    skip: int = 0,
    limit: int = 20,
) -> list[dict]:
    """Return paginated session history with user info, branch, and ticket counts."""
    query = _build_session_query(include_ended=True)
    if date_from:
        query = query.where(UserSession.started_at >= date_from)
    if date_to:
        query = query.where(UserSession.started_at <= date_to)
    if user_id_filter:
        query = query.where(UserSession.user_id == user_id_filter)

    query = query.order_by(UserSession.started_at.desc()).offset(skip).limit(limit)
    result = await db.execute(query)
    return [_row_to_dict(row, include_ended=True) for row in result.all()]


async def count_session_history(
    db: AsyncSession,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    user_id_filter: uuid.UUID | None = None,
) -> int:
    """Count total sessions matching filters (for pagination)."""
    query = select(func.count()).select_from(UserSession)
    if date_from:
        query = query.where(UserSession.started_at >= date_from)
    if date_to:
        query = query.where(UserSession.started_at <= date_to)
    if user_id_filter:
        query = query.where(UserSession.user_id == user_id_filter)
    result = await db.execute(query)
    return result.scalar() or 0


async def get_session_activity_summary(db: AsyncSession, session_id: str) -> list[dict]:
    """Return activity counts grouped by action_type for a session."""
    result = await db.execute(
        select(
            UserActivityLog.action_type,
            func.count().label("count"),
        )
        .where(UserActivityLog.session_id == session_id)
        .group_by(UserActivityLog.action_type)
        .order_by(UserActivityLog.action_type)
    )
    return [{"action_type": row.action_type, "count": row.count} for row in result.all()]
