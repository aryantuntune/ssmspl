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
from app.services import host_action_service, push_service, release_service, system_actions_service
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


@router.post("/events/ack-all", response_model=ActionResult)
async def ack_all_events(
    current_user: Annotated[User, Depends(_super_admin_only)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Mark every still-unacked event as acked. Useful after install when the
    feed is clogged with old test events."""
    from sqlalchemy import func

    r = await db.execute(
        update(SystemHealthEvent)
        .where(SystemHealthEvent.acked_at.is_(None))
        .values(acked_at=func.now(), acked_by=current_user.id)
        .returning(SystemHealthEvent.id)
    )
    ids = [row[0] for row in r.all()]
    await db.commit()
    await log_activity(
        getattr(current_user, "active_session_id", None),
        current_user.id,
        ActivityAction.SYSTEM_ACK_EVENT,
        {"event_ids_count": len(ids), "bulk": True},
    )
    return ActionResult(ok=True, detail={"acked_count": len(ids)})


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


# ─── version + releases + rollback ───────────────────────────────────


@router.get("/version")
async def get_current_version(_user: Annotated[User, Depends(_super_admin_only)]):
    """What's running right now — git SHA, build timestamp, alembic head, image tag."""
    return release_service.current_build()


@router.get("/releases")
async def list_releases(
    _user: Annotated[User, Depends(_super_admin_only)],
    limit: int = Query(20, ge=1, le=100),
):
    """All known release tags from the manifest, cross-checked against
    images actually present on the host."""
    manifest = release_service.list_releases(limit=limit)
    try:
        on_disk = {img["tag"]: img for img in system_actions_service.list_image_tags()}
    except Exception:  # noqa: BLE001 — docker socket may be unavailable
        on_disk = {}

    current = release_service.current_build()
    out = []
    for r in manifest:
        tag = r.get("image_tag")
        out.append(
            {
                **r,
                "image_present": tag in on_disk if tag else False,
                "is_current": tag == current.get("image_tag"),
            }
        )
    return {"current": current, "releases": out}


class RollbackBody(BaseModel):
    image_tag: str = Field(..., max_length=120)
    force_schema_drift: bool = Field(default=False)


@router.post("/rollback", response_model=ActionResult)
async def rollback_to_release(
    body: RollbackBody,
    current_user: Annotated[User, Depends(_super_admin_only)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Roll the admin-backend back to a previous image tag.

    Safety guarantees:
    - Postgres advisory lock — only one rollback in flight.
    - Validates the target image exists on disk before doing anything.
    - Refuses if alembic schema head differs (unless force_schema_drift=True).
    - No DB changes; this is a code-only rollback.
    - Audit-logged with both source and target tags.
    - Push-notifies all SuperAdmins so other operators see the change.
    """
    got_lock = await release_service.acquire_rollback_lock(db)
    if not got_lock:
        raise HTTPException(status_code=409, detail="Another rollback is already in progress")

    try:
        target_tag = body.image_tag.strip()
        target_release = release_service.find_release(target_tag)
        if not target_release:
            raise HTTPException(status_code=404, detail=f"tag {target_tag!r} is not in the release manifest")

        if not system_actions_service.image_tag_exists(target_tag):
            raise HTTPException(
                status_code=410,
                detail=f"image {target_tag!r} is no longer present on host (may have been pruned)",
            )

        current = release_service.current_build()
        current_tag = current.get("image_tag")

        if current_tag == target_tag:
            return ActionResult(
                ok=True,
                detail={"no_op": True, "reason": "already running this tag", "tag": target_tag},
            )

        # Schema-drift guard
        ok, reason = release_service.alembic_head_compatible(
            target_release.get("alembic_head"), current.get("alembic_head")
        )
        if not ok and not body.force_schema_drift:
            raise HTTPException(
                status_code=412,
                detail={
                    "schema_drift": True,
                    "message": reason,
                    "current_head": current.get("alembic_head"),
                    "target_head": target_release.get("alembic_head"),
                    "hint": "Re-submit with force_schema_drift=true if you understand the risk.",
                },
            )

        # Step 1: retag the target as :latest. Pure metadata; no restart yet.
        try:
            retag_result = release_service.retag_as_latest(target_tag)
        except Exception as e:  # noqa: BLE001
            logger.exception("retag failed")
            raise HTTPException(status_code=500, detail=f"retag failed: {e}")

        # Step 2: ask the host daemon to recreate admin-backend. It already
        # handles the snap-docker AppArmor zombie kill safely. Daemon
        # availability is checked here so the user gets a clean error if
        # the daemon isn't installed yet.
        if not host_action_service.is_queue_mounted():
            # We retagged but can't recreate — surface clearly. Image swap
            # alone doesn't actually swap the running container.
            raise HTTPException(
                status_code=503,
                detail={
                    "retagged": retag_result,
                    "message": "Host-action daemon not installed; container was NOT recreated. "
                               "Install the daemon (scripts/ssmspl-host-action-daemon.sh) "
                               "and retry, or SSH in and run "
                               "`docker compose up -d --force-recreate admin-backend`.",
                },
            )

        host_result = await host_action_service.submit_and_wait(
            "force_recreate_admin_backend", {}, timeout_s=120
        )

        await log_activity(
            getattr(current_user, "active_session_id", None),
            current_user.id,
            ActivityAction.SYSTEM_ROLLBACK,
            {
                "from_tag": current_tag,
                "to_tag": target_tag,
                "from_alembic_head": current.get("alembic_head"),
                "to_alembic_head": target_release.get("alembic_head"),
                "force_schema_drift": body.force_schema_drift,
                "host_request_id": host_result.get("request_id"),
            },
        )

        # Notify SuperAdmins about the rollback
        try:
            await push_service.send_push(
                db,
                title=f"Rollback {target_tag} → {target_release.get('git_sha', '?')[:7]}",
                body=f"by {current_user.username}: {current_tag} → {target_tag}",
                data={"kind": "rollback", "to": target_tag, "from": current_tag},
            )
        except Exception:  # noqa: BLE001 — push failures must not abort the action
            logger.exception("rollback push notify failed")

        return ActionResult(
            ok=host_result.get("ok", False),
            detail={
                "from_tag": current_tag,
                "to_tag": target_tag,
                "retagged": retag_result,
                "host": host_result,
            },
            error=host_result.get("error"),
        )
    finally:
        await release_service.release_rollback_lock(db)


# ─── incident report (one-tap diagnostic bundle) ─────────────────────


@router.get("/incident-report")
async def incident_report(
    current_user: Annotated[User, Depends(_super_admin_only)],
    db: Annotated[AsyncSession, Depends(get_db)],
    log_lines: int = Query(200, ge=20, le=2000),
):
    """One-shot diagnostic bundle: container logs, recent events, recent
    activity, and current snapshot — everything you'd ask for when
    something is broken."""
    from app.services import system_health_service

    # Container logs (best-effort; absence of socket → skip)
    containers_logs: dict[str, list[str]] = {}
    container_inspects: list[dict] = []
    for name in sorted(system_actions_service.allowed_containers()):
        try:
            container_inspects.append(system_actions_service.get_container_inspect(name))
        except Exception as e:  # noqa: BLE001
            container_inspects.append({"name": name, "error": str(e)[:200]})
        try:
            containers_logs[name] = system_actions_service.container_logs(name, lines=log_lines)
        except Exception as e:  # noqa: BLE001
            containers_logs[name] = [f"<failed to read logs: {e}>"]

    # Recent health events
    from sqlalchemy import desc, select

    events = (
        await db.execute(
            select(SystemHealthEvent)
            .order_by(desc(SystemHealthEvent.created_at))
            .limit(50)
        )
    ).scalars().all()

    # Recent activity (last hour-ish)
    from app.models.user_activity_log import UserActivityLog

    activity = (
        await db.execute(
            select(UserActivityLog)
            .order_by(desc(UserActivityLog.created_at))
            .limit(50)
        )
    ).scalars().all()

    snapshot = await system_health_service.get_status(db)

    await log_activity(
        getattr(current_user, "active_session_id", None),
        current_user.id,
        ActivityAction.SYSTEM_INCIDENT_REPORT,
        {"log_lines": log_lines},
    )

    return {
        "generated_at": __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat(),
        "version": release_service.current_build(),
        "snapshot": snapshot,
        "containers": container_inspects,
        "container_logs": containers_logs,
        "events": [
            {
                "id": e.id,
                "server_name": e.server_name,
                "severity": e.severity,
                "check_name": e.check_name,
                "message": e.message,
                "created_at": e.created_at.isoformat() if e.created_at else None,
                "acked_at": e.acked_at.isoformat() if e.acked_at else None,
            }
            for e in events
        ],
        "activity": [
            {
                "id": str(a.id) if a.id else None,
                "action_type": a.action_type,
                "user_id": str(a.user_id) if a.user_id else None,
                "created_at": a.created_at.isoformat() if a.created_at else None,
                "metadata": a.metadata_,
            }
            for a in activity
        ],
    }


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
