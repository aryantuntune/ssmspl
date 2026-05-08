"""SuperAdmin system-health API.

- Read-only status endpoint for the mobile dashboard.
- Push-device registration so the app receives Expo push notifications.
- Event ingestion (host-side health_check.sh POSTs CRIT/WARN events here).
- Audit-friendly: every write is RBAC-gated; ingest uses a shared secret.
"""
from __future__ import annotations

import logging
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from sqlalchemy import desc, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.rbac import UserRole
from app.database import get_db
from app.dependencies import get_current_user, require_roles
from app.models.push_device import PushDevice
from app.models.system_health_event import SystemHealthEvent
from app.models.user import User
from app.schemas.system_health import (
    HealthEventCreate,
    HealthEventIngestResponse,
    HealthEventRead,
    PushDeviceCreate,
    PushDeviceRead,
)
from app.services import push_service, system_health_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/system-health", tags=["System Health"])

_admin_or_super = require_roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)


# ─── Push device registration ────────────────────────────────────────────


@router.post("/devices", response_model=PushDeviceRead, status_code=status.HTTP_201_CREATED)
async def register_device(
    body: PushDeviceCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Register or refresh a mobile device's Expo push token.

    Idempotent on `expo_push_token` — re-registering refreshes label and
    re-activates if previously deactivated. Available to any authenticated
    user; the dashboard itself is RBAC-gated to ADMIN+.
    """
    existing = (
        await db.execute(
            select(PushDevice).where(PushDevice.expo_push_token == body.expo_push_token)
        )
    ).scalar_one_or_none()

    if existing:
        existing.user_id = current_user.id
        existing.device_label = body.device_label or existing.device_label
        existing.platform = body.platform
        existing.is_active = True
        from sqlalchemy import func

        await db.execute(
            update(PushDevice).where(PushDevice.id == existing.id).values(last_seen_at=func.now())
        )
        await db.commit()
        await db.refresh(existing)
        return existing

    dev = PushDevice(
        user_id=current_user.id,
        expo_push_token=body.expo_push_token,
        device_label=body.device_label,
        platform=body.platform,
        is_active=True,
    )
    db.add(dev)
    await db.commit()
    await db.refresh(dev)
    return dev


@router.delete("/devices/{device_id}", status_code=status.HTTP_204_NO_CONTENT)
async def unregister_device(
    device_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    dev = (await db.execute(select(PushDevice).where(PushDevice.id == device_id))).scalar_one_or_none()
    if not dev:
        raise HTTPException(status_code=404, detail="Device not found")
    if dev.user_id != current_user.id and current_user.role not in (UserRole.SUPER_ADMIN, UserRole.ADMIN):
        raise HTTPException(status_code=403, detail="Not your device")
    dev.is_active = False
    await db.commit()


@router.get("/devices", response_model=list[PushDeviceRead])
async def list_devices(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    rows = (
        await db.execute(
            select(PushDevice).where(PushDevice.user_id == current_user.id).order_by(desc(PushDevice.last_seen_at))
        )
    ).scalars().all()
    return list(rows)


# ─── Status snapshot (dashboard) ────────────────────────────────────────


@router.get("/status")
async def status_snapshot(
    _user: Annotated[User, Depends(_admin_or_super)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    return await system_health_service.get_status(db)


# ─── Events: list (dashboard feed) and ingest (from health_check.sh) ────


@router.get("/events", response_model=list[HealthEventRead])
async def list_events(
    _user: Annotated[User, Depends(_admin_or_super)],
    db: Annotated[AsyncSession, Depends(get_db)],
    severity: str | None = Query(None, pattern=r"^(INFO|WARN|CRIT)$"),
    server_name: str | None = Query(None, max_length=40),
    limit: int = Query(50, ge=1, le=500),
    unacked_only: bool = Query(False),
):
    q = select(SystemHealthEvent).order_by(desc(SystemHealthEvent.created_at)).limit(limit)
    if severity:
        q = q.where(SystemHealthEvent.severity == severity)
    if server_name:
        q = q.where(SystemHealthEvent.server_name == server_name)
    if unacked_only:
        q = q.where(SystemHealthEvent.acked_at.is_(None))
    rows = (await db.execute(q)).scalars().all()
    return list(rows)


@router.get("/backups")
async def list_backups(
    _user: Annotated[User, Depends(_admin_or_super)],
    limit: int = Query(10, ge=1, le=50),
):
    """Returns recent pg_dump files in BACKUP_DIR — name, size, age."""
    return system_health_service.get_backup_history(limit=limit)


@router.post("/events", response_model=HealthEventIngestResponse, status_code=status.HTTP_201_CREATED)
async def ingest_event(
    body: HealthEventCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    x_health_token: Annotated[str | None, Header(alias="X-Health-Token")] = None,
):
    """Ingest a CRIT/WARN event from the host-side health_check.sh.

    Auth: shared secret in X-Health-Token header (env: HEALTH_INGEST_SECRET).
    Side effect: fans out a push notification to every registered device on CRIT.
    """
    expected = getattr(settings, "HEALTH_INGEST_SECRET", None)
    if not expected:
        raise HTTPException(
            status_code=503,
            detail="HEALTH_INGEST_SECRET not configured on this backend",
        )
    if x_health_token != expected:
        raise HTTPException(status_code=401, detail="Invalid health-ingest token")

    ev = SystemHealthEvent(
        server_name=body.server_name,
        severity=body.severity,
        check_name=body.check_name,
        message=body.message,
        details=body.details,
    )
    db.add(ev)
    await db.commit()
    await db.refresh(ev)

    push_result = {"sent": 0, "devices": 0, "errors": []}
    if body.severity == "CRIT":
        push_result = await push_service.send_push(
            db,
            title=f"[{body.server_name}] {body.check_name}",
            body=body.message[:240],
            data={"event_id": ev.id, "severity": body.severity, "check": body.check_name},
        )

    return HealthEventIngestResponse(
        event_id=ev.id,
        push_sent=push_result["sent"],
        push_devices=push_result["devices"],
        push_errors=push_result.get("errors", []),
    )
