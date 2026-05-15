"""Backup-events API.

- ``POST /api/backups/events`` — laptop collector ingests one event per backup
  attempt. Auth via shared secret in ``X-Backup-Ingest-Secret`` header
  (``BACKUP_INGEST_SECRET`` setting). Idempotent on
  ``(server_id, file_name, sha256)`` so the laptop can safely retry.
- ``GET /api/backups/events`` — SuperAdmin/Admin mobile feed of recent events.
- ``GET /api/backups/events/summary`` — one row per (server_id, backup_type)
  for the dashboard tile, with ``freshness_hours`` since last success.
"""
from __future__ import annotations

import logging
import secrets
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.rbac import UserRole
from app.database import get_db
from app.dependencies import require_roles
from app.models.user import User
from app.schemas.backup_event import (
    BackupEventCreate,
    BackupEventIngestResponse,
    BackupEventRead,
    BackupSummaryRow,
)
from app.services import backup_event_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/backups", tags=["Backups"])

_admin_or_super = require_roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)


@router.post(
    "/events",
    response_model=BackupEventIngestResponse,
    status_code=status.HTTP_201_CREATED,
)
async def ingest_backup_event(
    body: BackupEventCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    x_backup_ingest_secret: Annotated[
        str | None, Header(alias="X-Backup-Ingest-Secret")
    ] = None,
):
    """Ingest a backup-completion event from the laptop collector.

    Auth: shared secret in ``X-Backup-Ingest-Secret`` header. Compared with
    ``secrets.compare_digest`` to avoid timing leaks. Idempotent on
    ``(server_id, file_name, sha256)`` when sha256 is non-null — a duplicate
    POST returns the existing row's id instead of creating a new event.
    """
    expected = getattr(settings, "BACKUP_INGEST_SECRET", None)
    if not expected:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="BACKUP_INGEST_SECRET not configured on this backend",
        )
    if not x_backup_ingest_secret or not secrets.compare_digest(
        x_backup_ingest_secret, expected
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid backup-ingest token",
        )

    existing = await backup_event_service.find_duplicate(db, body)
    if existing is not None:
        return BackupEventIngestResponse(
            id=existing.id, received_at=existing.received_at
        )

    row = await backup_event_service.create_event(db, body)
    return BackupEventIngestResponse(id=row.id, received_at=row.received_at)


@router.get("/events", response_model=list[BackupEventRead])
async def list_backup_events(
    _user: Annotated[User, Depends(_admin_or_super)],
    db: Annotated[AsyncSession, Depends(get_db)],
    limit: int = Query(30, ge=1, le=100),
    server_id: str | None = Query(None, max_length=60),
    status_filter: str | None = Query(
        None,
        alias="status",
        pattern=r"^(success|failed|partial)$",
    ),
):
    """Recent backup events, newest first."""
    rows = await backup_event_service.list_events(
        db, limit=limit, server_id=server_id, status=status_filter
    )
    return rows


@router.get("/events/summary", response_model=list[BackupSummaryRow])
async def backup_events_summary(
    _user: Annotated[User, Depends(_admin_or_super)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """One row per ``(server_id, backup_type)`` seen in the last 7 days."""
    return await backup_event_service.get_summary(db)
