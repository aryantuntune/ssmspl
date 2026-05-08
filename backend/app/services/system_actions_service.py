"""SuperAdmin remote actions: container restart, backup trigger, log tail, etc.

Requires the Docker socket to be mounted into the backend container:
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock

Whitelist-restricted; only the containers below can be acted on. Every
action is audit-logged via UserActivityLog. SUPER_ADMIN-only enforced at
the router layer.
"""
from __future__ import annotations

import logging
import os
import shutil
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

from app.config import settings

logger = logging.getLogger(__name__)


# Containers we're allowed to act on. Anything else is rejected at the router.
ADMIN_CONTAINERS = {"admin-backend", "admin-frontend"}
PROD_CONTAINERS = {"ssmspl-backend-1", "ssmspl-frontend-1"}


def allowed_containers() -> set[str]:
    return ADMIN_CONTAINERS if settings.ADMIN_PORTAL_MODE else PROD_CONTAINERS


def _docker_client():
    """Lazy import so the backend boots even when docker SDK isn't installed."""
    import docker  # type: ignore

    return docker.from_env()


def get_container_inspect(name: str) -> dict:
    """Return container status, restart count, started_at — read-only."""
    if name not in allowed_containers():
        raise ValueError(f"container {name!r} not in allow-list")
    client = _docker_client()
    c = client.containers.get(name)
    return {
        "name": name,
        "id": c.id[:12],
        "status": c.status,
        "health": c.attrs.get("State", {}).get("Health", {}).get("Status"),
        "restart_count": c.attrs.get("RestartCount", 0),
        "started_at": c.attrs.get("State", {}).get("StartedAt"),
        "image": (c.image.tags or [""])[0] if c.image else "",
    }


def restart_container(name: str, timeout: int = 30) -> dict:
    """Graceful restart. Audit at router."""
    if name not in allowed_containers():
        raise ValueError(f"container {name!r} not in allow-list")
    client = _docker_client()
    c = client.containers.get(name)
    started = datetime.now(timezone.utc)
    c.restart(timeout=timeout)
    elapsed = (datetime.now(timezone.utc) - started).total_seconds()
    c.reload()
    return {
        "name": name,
        "duration_s": round(elapsed, 2),
        "new_status": c.status,
        "new_health": c.attrs.get("State", {}).get("Health", {}).get("Status"),
    }


def container_logs(name: str, lines: int = 100) -> list[str]:
    if name not in allowed_containers():
        raise ValueError(f"container {name!r} not in allow-list")
    if lines < 1:
        lines = 1
    if lines > 2000:
        lines = 2000
    client = _docker_client()
    c = client.containers.get(name)
    raw = c.logs(tail=lines, timestamps=True)
    if isinstance(raw, bytes):
        raw = raw.decode("utf-8", errors="replace")
    return [ln for ln in raw.splitlines() if ln.strip()]


def container_stats(name: str) -> dict:
    """One-shot CPU/mem snapshot — non-streaming."""
    if name not in allowed_containers():
        raise ValueError(f"container {name!r} not in allow-list")
    client = _docker_client()
    c = client.containers.get(name)
    s = c.stats(stream=False)
    cpu = s.get("cpu_stats", {})
    pre = s.get("precpu_stats", {})
    cpu_delta = cpu.get("cpu_usage", {}).get("total_usage", 0) - pre.get("cpu_usage", {}).get("total_usage", 0)
    sys_delta = cpu.get("system_cpu_usage", 0) - pre.get("system_cpu_usage", 0)
    online_cpus = cpu.get("online_cpus") or len(cpu.get("cpu_usage", {}).get("percpu_usage", []) or []) or 1
    cpu_pct = (cpu_delta / sys_delta) * online_cpus * 100.0 if sys_delta > 0 else 0.0
    mem = s.get("memory_stats", {})
    mem_used = mem.get("usage", 0) - mem.get("stats", {}).get("cache", 0)
    return {
        "name": name,
        "cpu_pct": round(cpu_pct, 2),
        "mem_used_mb": round(mem_used / 2**20, 1),
        "mem_limit_mb": round(mem.get("limit", 0) / 2**20, 1),
    }


def trigger_backup() -> dict:
    """Drop a .trigger file in BACKUP_DIR — same path the existing /api/backup/trigger uses.

    Reuses the same atomic-create pattern so two trigger calls don't race.
    Catches every plausible OS error so the router gets a clean dict, never
    a 500 — the caller should never have to scrape stack traces from logs.
    """
    bdir = Path(os.environ.get("BACKUP_DIR", "/app/backups"))
    if not bdir.exists():
        return {"ok": False, "error": f"backup dir {bdir} is not mounted"}
    if not os.access(bdir, os.W_OK):
        return {
            "ok": False,
            "error": f"backup dir {bdir} is not writable by the backend container "
                     f"(uid {os.geteuid()}). Fix on host: chmod 1777 the host bind path.",
        }
    trigger = bdir / ".trigger"
    try:
        fd = os.open(str(trigger), os.O_CREAT | os.O_EXCL | os.O_WRONLY)
        os.write(fd, datetime.now(timezone.utc).isoformat().encode())
        os.close(fd)
        return {"ok": True, "triggered_at": datetime.now(timezone.utc).isoformat()}
    except FileExistsError:
        return {"ok": False, "error": "a backup is already in progress (.trigger marker exists)"}
    except PermissionError as e:
        return {"ok": False, "error": f"permission denied writing {trigger}: {e}"}
    except OSError as e:
        return {"ok": False, "error": f"OS error writing {trigger}: {e}"}


def force_sync() -> dict:
    """Drop .sync_needed marker — host cron's gdrive sync picks it up within 5 min."""
    bdir = Path(os.environ.get("BACKUP_DIR", "/app/backups"))
    if not bdir.exists():
        return {"ok": False, "error": f"backup dir {bdir} is not mounted"}
    if not os.access(bdir, os.W_OK):
        return {
            "ok": False,
            "error": f"backup dir {bdir} is not writable by the backend container",
        }
    marker = bdir / ".sync_needed"
    try:
        marker.touch()
        return {"ok": True, "marker": str(marker)}
    except OSError as e:
        return {"ok": False, "error": f"failed to write {marker}: {e}"}


def prune_docker_images() -> dict:
    """Remove ONLY truly dangling images (tag = <none>). We never delete tagged
    images because rollback targets are kept by tag — accidental garbage-collection
    of a release tag would silently break rollback.
    """
    client = _docker_client()
    try:
        # `dangling: True` filter restricts to images with no repo tag at all
        # (the literal `<none>:<none>` rows). Any image we explicitly tagged
        # for a release survives.
        result = client.images.prune(filters={"dangling": True})
        return {
            "ok": True,
            "images_deleted": len(result.get("ImagesDeleted") or []),
            "space_reclaimed_mb": round((result.get("SpaceReclaimed") or 0) / 2**20, 1),
            "note": "release-tagged images preserved",
        }
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": str(e)}


def list_image_tags(repo_pattern: str = "ssmspl") -> list[dict]:
    """List image tags on host matching a repo pattern. Used by /releases to
    cross-check that manifest entries still have a real image to roll back to."""
    client = _docker_client()
    out: list[dict] = []
    try:
        for img in client.images.list():
            for tag in img.tags or []:
                if repo_pattern in tag:
                    out.append(
                        {
                            "tag": tag,
                            "id": img.short_id,
                            "created": img.attrs.get("Created"),
                            "size_mb": round((img.attrs.get("Size") or 0) / 2**20, 1),
                        }
                    )
    except Exception as e:  # noqa: BLE001
        logger.warning("list_image_tags failed: %s", e)
    return out


def image_tag_exists(tag: str) -> bool:
    """Pre-rollback validation: refuse to start if the target image is gone."""
    client = _docker_client()
    try:
        client.images.get(tag)
        return True
    except Exception:  # noqa: BLE001 — docker.errors.ImageNotFound or daemon errors
        return False


def disk_cleanup_logs() -> dict:
    """Truncate log files in /var/log over 100MB. Best-effort, doesn't error out if not allowed."""
    if not os.path.isdir("/var/log"):
        return {"ok": False, "error": "/var/log not accessible"}
    truncated = []
    try:
        for entry in os.listdir("/var/log"):
            full = os.path.join("/var/log", entry)
            if os.path.isfile(full):
                try:
                    size = os.path.getsize(full)
                    if size > 100 * 2**20:
                        with open(full, "w") as f:
                            f.truncate(0)
                        truncated.append({"file": full, "freed_mb": round(size / 2**20, 1)})
                except (OSError, PermissionError):
                    continue
    except OSError as e:
        return {"ok": False, "error": str(e)}
    return {"ok": True, "truncated_count": len(truncated), "truncated": truncated[:10]}


def run_iptables_fix() -> dict:
    """Server 2 only. Re-runs the systemd drop-in script."""
    if not settings.ADMIN_PORTAL_MODE:
        return {"ok": False, "error": "iptables fix is Server 2 only"}
    script = "/usr/local/bin/admin-iptables-fix.sh"
    if not os.path.exists(script):
        return {"ok": False, "error": f"{script} not present (mount /usr/local/bin into container or run on host via cron)"}
    try:
        r = subprocess.run([script], capture_output=True, text=True, timeout=30)
        return {
            "ok": r.returncode == 0,
            "stdout": (r.stdout or "")[-500:],
            "stderr": (r.stderr or "")[-500:],
            "return_code": r.returncode,
        }
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": str(e)}


def run_health_check_script() -> dict:
    """Re-run the host-side health_check.sh on demand — useful right after a fix."""
    candidates = [
        "/var/www/ssmspl-admin/scripts/health_check.sh",
        "/var/www/ssmspl/scripts/health_check.sh",
        "/host-scripts/health_check.sh",
    ]
    for path in candidates:
        if os.path.exists(path):
            try:
                r = subprocess.run([path], capture_output=True, text=True, timeout=60)
                return {
                    "ok": r.returncode == 0,
                    "exit_code": r.returncode,
                    "stdout": (r.stdout or "")[-1000:],
                    "stderr": (r.stderr or "")[-500:],
                }
            except Exception as e:  # noqa: BLE001
                return {"ok": False, "error": str(e)}
    return {"ok": False, "error": "health_check.sh not found at any known path"}
