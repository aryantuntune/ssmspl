"""Live system-health snapshot for the SuperAdmin app dashboard.

Read-only. Reads:
- DB connection saturation
- disk + memory via psutil
- backup recency from BACKUP_DIR
- recent ticket activity from DB
- replication state (admin DB only)

Container-level health is reported via the host-side health_check.sh, which
POSTs events to /api/system-health/events. We don't introspect Docker from
inside the container — keeps this service unprivileged.
"""
from __future__ import annotations

import logging
import os
import shutil
from datetime import datetime, timezone
from pathlib import Path

import psutil
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings

logger = logging.getLogger(__name__)


def _server_name() -> str:
    return "server-2-admin" if settings.ADMIN_PORTAL_MODE else "server-1-prod"


def _backup_dir() -> Path:
    return Path(os.environ.get("BACKUP_DIR", "/app/backups"))


def _disk_status() -> dict:
    total, used, free = shutil.disk_usage("/")
    pct = round(used / total * 100, 1)
    return {
        "total_gb": round(total / 2**30, 2),
        "used_gb": round(used / 2**30, 2),
        "free_gb": round(free / 2**30, 2),
        "pct_used": pct,
        "severity": "CRIT" if pct > 90 else "WARN" if pct > 75 else "OK",
    }


def _memory_status() -> dict:
    m = psutil.virtual_memory()
    return {
        "total_mb": round(m.total / 2**20, 0),
        "used_mb": round(m.used / 2**20, 0),
        "available_mb": round(m.available / 2**20, 0),
        "pct_used": m.percent,
        "severity": "WARN" if m.percent > 90 else "OK",
    }


def _backup_status() -> dict:
    d = _backup_dir()
    if not d.exists():
        return {"present": False, "severity": "WARN", "message": f"{d} not mounted"}
    try:
        dumps = sorted(d.glob("*.sql.gz"), key=lambda p: p.stat().st_mtime, reverse=True)
    except Exception as e:  # noqa: BLE001
        return {"present": True, "severity": "WARN", "error": str(e)}
    if not dumps:
        return {"present": True, "count": 0, "severity": "WARN", "message": "no .sql.gz files"}
    latest = dumps[0]
    age_h = (datetime.now().timestamp() - latest.stat().st_mtime) / 3600
    return {
        "present": True,
        "count": len(dumps),
        "latest_file": latest.name,
        "latest_size_mb": round(latest.stat().st_size / 2**20, 1),
        "age_hours": round(age_h, 1),
        "severity": "CRIT" if age_h > 30 else "WARN" if age_h > 26 else "OK",
    }


async def _db_status(db: AsyncSession) -> dict:
    out: dict = {}
    try:
        r = await db.execute(text("SELECT count(*) FROM pg_stat_activity"))
        out["connections"] = r.scalar()
        r = await db.execute(text("SELECT setting::int FROM pg_settings WHERE name='max_connections'"))
        out["max_connections"] = r.scalar()
        out["pct_used"] = (
            round(out["connections"] / out["max_connections"] * 100, 1)
            if out["max_connections"]
            else None
        )
        out["severity"] = "WARN" if out["pct_used"] and out["pct_used"] > 80 else "OK"
    except Exception as e:  # noqa: BLE001
        return {"severity": "WARN", "error": str(e)}
    return out


async def _ticket_freshness(db: AsyncSession) -> dict:
    try:
        r = await db.execute(
            text("SELECT EXTRACT(EPOCH FROM (now() - max(created_at)))::int FROM tickets")
        )
        secs = r.scalar() or 0
        from zoneinfo import ZoneInfo

        now_ist = datetime.now(ZoneInfo("Asia/Kolkata"))
        in_business_hours = 9 <= now_ist.hour <= 21
        sev = "OK"
        if in_business_hours and secs > 7200:
            sev = "WARN"
        return {
            "seconds_since_last_ticket": int(secs),
            "minutes_since_last_ticket": round(secs / 60, 1),
            "in_business_hours": in_business_hours,
            "severity": sev,
        }
    except Exception as e:  # noqa: BLE001
        return {"severity": "WARN", "error": str(e)}


async def _replication_status(db: AsyncSession) -> dict:
    if not settings.ADMIN_PORTAL_MODE:
        return {"applicable": False}
    out: dict = {"applicable": True, "subscriptions": []}
    try:
        r = await db.execute(
            text(
                """
                SELECT s.subname, s.subenabled, st.pid,
                  COALESCE(EXTRACT(EPOCH FROM (now() - st.latest_end_time))::int, 0) AS lag_s
                FROM pg_subscription s
                LEFT JOIN pg_stat_subscription st ON st.subname = s.subname
                """
            )
        )
        worst = "OK"
        for name, enabled, pid, lag in r.all():
            sev = "OK"
            if not enabled:
                sev = "CRIT"
            elif pid is None:
                sev = "CRIT"
            elif lag and lag > 600:
                sev = "WARN"
            if sev == "CRIT":
                worst = "CRIT"
            elif sev == "WARN" and worst != "CRIT":
                worst = "WARN"
            out["subscriptions"].append(
                {
                    "name": name,
                    "enabled": bool(enabled),
                    "alive": pid is not None,
                    "lag_s": int(lag or 0),
                    "severity": sev,
                }
            )
        out["severity"] = worst
    except Exception as e:  # noqa: BLE001
        out["severity"] = "WARN"
        out["error"] = str(e)
    return out


async def get_status(db: AsyncSession) -> dict:
    payload = {
        "server": _server_name(),
        "checked_at": datetime.now(timezone.utc).isoformat(),
        "disk": _disk_status(),
        "memory": _memory_status(),
        "db": await _db_status(db),
        "backup": _backup_status(),
        "ticketing": await _ticket_freshness(db),
        "replication": await _replication_status(db),
    }
    severities = [v["severity"] for v in payload.values() if isinstance(v, dict) and "severity" in v]
    payload["overall_severity"] = (
        "CRIT" if "CRIT" in severities else "WARN" if "WARN" in severities else "OK"
    )
    return payload
