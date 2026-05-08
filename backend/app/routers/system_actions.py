"""SuperAdmin remote-control actions.

Delivers via the mobile app the ability to restart containers, view logs,
trigger backups, etc. — without SSH.

Security model:
- All endpoints require SUPER_ADMIN (NOT ADMIN). Highest blast radius, tightest gate.
- Every action audit-logged via UserActivityLog.
- Container ops are whitelist-restricted (admin-backend / admin-frontend, or prod equivalents).
- Rate-limited via slowapi.

Mounting required (docker-compose.admin.yml admin-backend service):
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - /var/lib/ssmspl-host-actions:/var/lib/ssmspl-host-actions   # optional, for v2.2 host actions
"""
from __future__ import annotations

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.rbac import UserRole
from app.database import get_db
from app.dependencies import require_roles
from app.middleware.rate_limit import limiter
from app.models.system_health_event import SystemHealthEvent
from app.models.user import User
from app.services import host_action_service, push_service, system_actions_service
from app.services.activity_log_service import ActivityAction, log_activity

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/system-health/actions", tags=["System Health · Actions"])

_super_admin_only = require_roles(UserRole.SUPER_ADMIN)


# ─── schemas ─────────────────────────────────────────────────────────


class ContainerActionBody(BaseModel):
    name: str = Field(..., max_length=80)


class ActionResult(BaseModel):
    ok: bool
    detail: dict | None = None
    error: str | None = None


# ─── helpers ─────────────────────────────────────────────────────────


def _check_container(name: str) -> None:
    allowed = system_actions_service.allowed_containers()
    if name not in allowed:
        raise HTTPException(
            status_code=400,
            detail=f"container {name!r} not allowed; permitted: {sorted(allowed)}",
        )


# ─── docker-socket actions ───────────────────────────────────────────


@router.post("/restart-container", response_model=ActionResult)
async def restart_container(
    body: ContainerActionBody,
    current_user: Annotated[User, Depends(_super_admin_only)],
):
    _check_container(body.name)
    try:
        result = system_actions_service.restart_container(body.name)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:  # noqa: BLE001
        logger.exception("restart_container failed")
        return ActionResult(ok=False, error=str(e))
    await log_activity(
        getattr(current_user, "active_session_id", None),
        current_user.id,
        ActivityAction.SYSTEM_RESTART_CONTAINER,
        {"container": body.name, "duration_s": result.get("duration_s")},
    )
    return ActionResult(ok=True, detail=result)


@router.post("/prune-images", response_model=ActionResult)
async def prune_images(
    current_user: Annotated[User, Depends(_super_admin_only)],
):
    result = system_actions_service.prune_docker_images()
    await log_activity(
        getattr(current_user, "active_session_id", None),
        current_user.id,
        ActivityAction.SYSTEM_PRUNE_IMAGES,
        result,
    )
    return ActionResult(ok=result.get("ok", False), detail=result, error=result.get("error"))


# ─── filesystem actions (no docker socket needed) ────────────────────


@router.post("/trigger-backup", response_model=ActionResult)
async def trigger_backup(
    current_user: Annotated[User, Depends(_super_admin_only)],
):
    result = system_actions_service.trigger_backup()
    await log_activity(
        getattr(current_user, "active_session_id", None),
        current_user.id,
        ActivityAction.SYSTEM_TRIGGER_BACKUP,
        result,
    )
    return ActionResult(ok=result.get("ok", False), detail=result, error=result.get("error"))


@router.post("/force-sync", response_model=ActionResult)
async def force_sync(
    current_user: Annotated[User, Depends(_super_admin_only)],
):
    result = system_actions_service.force_sync()
    await log_activity(
        getattr(current_user, "active_session_id", None),
        current_user.id,
        ActivityAction.SYSTEM_FORCE_SYNC,
        result,
    )
    return ActionResult(ok=result.get("ok", False), detail=result, error=result.get("error"))


# ─── DB-side actions ─────────────────────────────────────────────────


@router.post("/test-push", response_model=ActionResult)
async def test_push(
    current_user: Annotated[User, Depends(_super_admin_only)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Fire a test push to all registered devices. Useful to verify the chain after install."""
    result = await push_service.send_push(
        db,
        title="SSMSPL — test push",
        body="If you see this, your SuperAdmin app + backend chain is healthy.",
        data={"kind": "test"},
    )
    await log_activity(
        getattr(current_user, "active_session_id", None),
        current_user.id,
        ActivityAction.SYSTEM_TEST_PUSH,
        result,
    )
    return ActionResult(ok=result["sent"] > 0, detail=result)


class AckBody(BaseModel):
    note: str | None = Field(None, max_length=500)


@router.post("/events/{event_id}/ack", response_model=ActionResult)
async def ack_event(
    event_id: int,
    current_user: Annotated[User, Depends(_super_admin_only)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Mark an alert as acknowledged (read). Doesn't delete; just hides from unacked queries."""
    from sqlalchemy import func

    r = await db.execute(
        update(SystemHealthEvent)
        .where(SystemHealthEvent.id == event_id)
        .where(SystemHealthEvent.acked_at.is_(None))
        .values(acked_at=func.now(), acked_by=current_user.id)
        .returning(SystemHealthEvent.id)
    )
    if r.scalar() is None:
        raise HTTPException(status_code=404, detail="Event not found or already acked")
    await db.commit()
    await log_activity(
        getattr(current_user, "active_session_id", None),
        current_user.id,
        ActivityAction.SYSTEM_ACK_EVENT,
        {"event_id": event_id},
    )
    return ActionResult(ok=True, detail={"event_id": event_id})


# ─── container introspection ─────────────────────────────────────────


@router.get("/containers")
async def list_containers(_user: Annotated[User, Depends(_super_admin_only)]):
    """List the whitelisted containers + their health (via docker socket)."""
    out = []
    for name in sorted(system_actions_service.allowed_containers()):
        try:
            out.append(system_actions_service.get_container_inspect(name))
        except Exception as e:  # noqa: BLE001
            out.append({"name": name, "error": str(e)})
    return out


@router.get("/containers/{name}/logs")
async def container_logs(
    name: str,
    _user: Annotated[User, Depends(_super_admin_only)],
    lines: int = Query(100, ge=1, le=2000),
):
    _check_container(name)
    try:
        log_lines = system_actions_service.container_logs(name, lines=lines)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=str(e))
    return {"name": name, "lines": log_lines, "count": len(log_lines)}


@router.get("/containers/{name}/stats")
async def container_stats(name: str, _user: Annotated[User, Depends(_super_admin_only)]):
    _check_container(name)
    try:
        return system_actions_service.container_stats(name)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=str(e))


# ─── host-daemon actions (only enabled when daemon + queue volume present) ─


@router.get("/host-daemon-status", response_model=ActionResult)
async def host_daemon_status(_user: Annotated[User, Depends(_super_admin_only)]):
    """Tells the app whether host-action endpoints will work."""
    return ActionResult(
        ok=host_action_service.is_queue_mounted(),
        detail={
            "queue_mounted": host_action_service.is_queue_mounted(),
            "queue_root": str(host_action_service.QUEUE_ROOT),
            "allowed_actions": sorted(host_action_service.ALLOWED_ACTIONS),
        },
    )


class HostActionBody(BaseModel):
    action: str = Field(..., max_length=80)
    params: dict = Field(default_factory=dict)
    timeout_s: float = Field(30.0, ge=2, le=120)


@router.post("/host", response_model=ActionResult)
async def submit_host_action(
    body: HostActionBody,
    current_user: Annotated[User, Depends(_super_admin_only)],
):
    """Submit a host-side action via queue daemon (run_iptables_fix, force_recreate_admin_backend, etc.)."""
    if body.action not in host_action_service.ALLOWED_ACTIONS:
        raise HTTPException(
            status_code=400,
            detail=f"action {body.action!r} not whitelisted; allowed: {sorted(host_action_service.ALLOWED_ACTIONS)}",
        )
    result = await host_action_service.submit_and_wait(body.action, body.params, timeout_s=body.timeout_s)
    action_const = {
        "kill_pid": ActivityAction.SYSTEM_RESTART_CONTAINER,
        "force_recreate_admin_backend": ActivityAction.SYSTEM_RESTART_CONTAINER,
        "run_iptables_fix": ActivityAction.SYSTEM_IPTABLES_FIX,
        "run_health_check": ActivityAction.SYSTEM_RUN_HEALTH_CHECK,
        "cleanup_logs": ActivityAction.SYSTEM_PRUNE_IMAGES,
    }.get(body.action, ActivityAction.SYSTEM_HOST_ACTION)
    await log_activity(
        getattr(current_user, "active_session_id", None),
        current_user.id,
        action_const,
        {"action": body.action, "params": body.params, "request_id": result.get("request_id")},
    )
    return ActionResult(ok=result.get("ok", False), detail=result, error=result.get("error"))
