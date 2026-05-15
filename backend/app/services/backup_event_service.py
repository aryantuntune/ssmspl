"""DB helpers for the backup-events API.

Keeps the router thin and isolates the dedupe + summary query logic so it's
testable independently. All operations are async (AsyncSession).
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Iterable

from sqlalchemy import and_, desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.backup_event import BackupEvent
from app.schemas.backup_event import BackupEventCreate, BackupSummaryRow


async def find_duplicate(
    db: AsyncSession, payload: BackupEventCreate
) -> BackupEvent | None:
    """Return an existing event that's effectively the same as ``payload``.

    Two dedupe modes:

    1. Strong match (sha256 present): ``(server_id, file_name, sha256)``. Two
       successful uploads of the exact same byte sequence are one event.

    2. Weak match (sha256 None, common on failed downloads): same
       ``(server_id, file_name, status)`` within a 1-hour window. Retry loops
       on the laptop side often POST the same failure 3–4 times in seconds
       (network blip, scp timeout); we don't want each retry as its own row.
       file_name itself must be non-null — a generic "host unreachable" with
       no file context still gets its own row so operators see every attempt.
    """
    if payload.sha256:
        stmt = (
            select(BackupEvent)
            .where(
                and_(
                    BackupEvent.server_id == payload.server_id,
                    BackupEvent.file_name == payload.file_name,
                    BackupEvent.sha256 == payload.sha256,
                )
            )
            .limit(1)
        )
        return (await db.execute(stmt)).scalar_one_or_none()

    if not payload.file_name:
        return None

    window_start = payload.occurred_at - timedelta(hours=1)
    stmt = (
        select(BackupEvent)
        .where(
            and_(
                BackupEvent.server_id == payload.server_id,
                BackupEvent.file_name == payload.file_name,
                BackupEvent.status == payload.status,
                BackupEvent.sha256.is_(None),
                BackupEvent.occurred_at >= window_start,
            )
        )
        .order_by(desc(BackupEvent.occurred_at))
        .limit(1)
    )
    return (await db.execute(stmt)).scalar_one_or_none()


async def create_event(
    db: AsyncSession, payload: BackupEventCreate
) -> BackupEvent:
    """Insert a new BackupEvent row. Caller is responsible for dedupe check."""
    row = BackupEvent(
        server_id=payload.server_id,
        backup_type=payload.backup_type,
        status=payload.status,
        file_name=payload.file_name,
        file_size_bytes=payload.file_size_bytes,
        sha256=payload.sha256,
        message=payload.message,
        occurred_at=payload.occurred_at,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


async def list_events(
    db: AsyncSession,
    *,
    limit: int = 30,
    server_id: str | None = None,
    status: str | None = None,
) -> list[BackupEvent]:
    stmt = select(BackupEvent).order_by(
        desc(BackupEvent.occurred_at), desc(BackupEvent.id)
    ).limit(limit)
    if server_id:
        stmt = stmt.where(BackupEvent.server_id == server_id)
    if status:
        stmt = stmt.where(BackupEvent.status == status)
    rows = (await db.execute(stmt)).scalars().all()
    return list(rows)


async def get_summary(db: AsyncSession) -> list[BackupSummaryRow]:
    """One row per (server_id, backup_type) seen in the last 7 days.

    For each combo we expose:
    - ``latest_attempt_at`` — most recent event regardless of status
    - ``latest_success_at`` — most recent success only
    - ``latest_status`` / ``latest_size_bytes`` — pulled from the latest attempt
    - ``freshness_hours`` — hours since latest success (None if never)
    """
    since = datetime.now(timezone.utc) - timedelta(days=7)
    stmt = (
        select(BackupEvent)
        .where(BackupEvent.occurred_at >= since)
        .order_by(desc(BackupEvent.occurred_at), desc(BackupEvent.id))
    )
    rows: Iterable[BackupEvent] = (await db.execute(stmt)).scalars().all()

    # Group in Python — volume is tiny (one backup per server per type per
    # day → ~14 rows in the worst case), and it keeps the SQL portable.
    by_key: dict[tuple[str, str], dict] = {}
    for ev in rows:
        key = (ev.server_id, ev.backup_type)
        bucket = by_key.setdefault(
            key,
            {
                "server_id": ev.server_id,
                "backup_type": ev.backup_type,
                "latest_success_at": None,
                "latest_attempt_at": None,
                "latest_status": None,
                "latest_size_bytes": None,
            },
        )
        # Rows arrive newest-first; only fill latest_* once per key.
        if bucket["latest_attempt_at"] is None:
            bucket["latest_attempt_at"] = ev.occurred_at
            bucket["latest_status"] = ev.status
            bucket["latest_size_bytes"] = ev.file_size_bytes
        if ev.status == "success" and bucket["latest_success_at"] is None:
            bucket["latest_success_at"] = ev.occurred_at

    now = datetime.now(timezone.utc)
    result: list[BackupSummaryRow] = []
    for bucket in by_key.values():
        last_ok = bucket["latest_success_at"]
        freshness = (
            round((now - last_ok).total_seconds() / 3600, 2) if last_ok else None
        )
        result.append(
            BackupSummaryRow(
                server_id=bucket["server_id"],
                backup_type=bucket["backup_type"],
                latest_success_at=last_ok,
                latest_attempt_at=bucket["latest_attempt_at"],
                latest_status=bucket["latest_status"],
                latest_size_bytes=bucket["latest_size_bytes"],
                freshness_hours=freshness,
            )
        )
    # Stable order for clients: server_id then backup_type.
    result.sort(key=lambda r: (r.server_id, r.backup_type))
    return result
