"""Live system-health snapshot for the SuperAdmin app dashboard.

Read-only. Reads:
- DB connection saturation
- disk + memory + load avg + uptime + network via psutil
- backup recency + history from BACKUP_DIR
- recent ticket activity + today's revenue from DB
- replication state (admin DB only)

Container-level health is reported via the host-side health_check.sh, which
POSTs events to /api/system-health/events. We don't introspect Docker from
inside the container — keeps this service unprivileged.
"""
from __future__ import annotations

import logging
import os
import shutil
import time
from datetime import datetime, timezone
from pathlib import Path

import psutil
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings

logger = logging.getLogger(__name__)

_NET_BASELINE: dict[str, float] = {}


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


def _system_info() -> dict:
    """Uptime, load avg, CPU pct, net throughput delta since last call."""
    try:
        boot_ts = psutil.boot_time()
        uptime_s = int(time.time() - boot_ts)
        days, rem = divmod(uptime_s, 86400)
        hours, rem = divmod(rem, 3600)
        minutes = rem // 60
        if days > 0:
            uptime_str = f"{days}d {hours}h"
        elif hours > 0:
            uptime_str = f"{hours}h {minutes}m"
        else:
            uptime_str = f"{minutes}m"

        # Load avg only on Linux/macOS (returns 0,0,0 on Windows but won't crash)
        try:
            la1, la5, la15 = os.getloadavg()
        except (AttributeError, OSError):
            la1 = la5 = la15 = 0.0

        cpu_count = psutil.cpu_count() or 1
        cpu_pct = psutil.cpu_percent(interval=0.2)

        # Net throughput: rate since last call (best-effort; first call shows 0).
        nio = psutil.net_io_counters()
        now = time.time()
        prev_t = _NET_BASELINE.get("t", 0)
        prev_rx = _NET_BASELINE.get("rx", 0)
        prev_tx = _NET_BASELINE.get("tx", 0)
        elapsed = now - prev_t if prev_t else 0
        rx_kbs = round((nio.bytes_recv - prev_rx) / max(elapsed, 1) / 1024, 1) if elapsed else 0
        tx_kbs = round((nio.bytes_sent - prev_tx) / max(elapsed, 1) / 1024, 1) if elapsed else 0
        _NET_BASELINE.update({"t": now, "rx": nio.bytes_recv, "tx": nio.bytes_sent})

        # Severity: load avg / cpu count > 1.5x means saturated
        load_ratio = la1 / cpu_count if cpu_count else 0
        sev = "CRIT" if load_ratio > 2.0 or cpu_pct > 95 else "WARN" if load_ratio > 1.5 or cpu_pct > 85 else "OK"

        return {
            "uptime_s": uptime_s,
            "uptime_str": uptime_str,
            "boot_at": datetime.fromtimestamp(boot_ts, timezone.utc).isoformat(),
            "load_avg_1": round(la1, 2),
            "load_avg_5": round(la5, 2),
            "load_avg_15": round(la15, 2),
            "cpu_count": cpu_count,
            "cpu_pct": cpu_pct,
            "net_rx_kbs": rx_kbs,
            "net_tx_kbs": tx_kbs,
            "severity": sev,
        }
    except Exception as e:  # noqa: BLE001
        return {"severity": "WARN", "error": str(e)[:120]}


async def _today_activity(db: AsyncSession) -> dict:
    """Today's ticket count + revenue + active users — cheap dashboard glance."""
    out: dict = {}
    try:
        from zoneinfo import ZoneInfo

        now_ist = datetime.now(ZoneInfo("Asia/Kolkata"))
        today_start = now_ist.replace(hour=0, minute=0, second=0, microsecond=0).astimezone(timezone.utc)

        r = await db.execute(
            text(
                """
                SELECT
                  count(*) AS total,
                  COALESCE(sum(net_amount), 0) AS revenue,
                  count(*) FILTER (WHERE created_at > now() - interval '1 hour') AS last_hour
                FROM tickets
                WHERE created_at >= :since
                  AND COALESCE(is_cancelled, false) = false
                """
            ),
            {"since": today_start},
        )
        row = r.first()
        if row:
            out["tickets_today"] = int(row.total or 0)
            out["revenue_today"] = float(row.revenue or 0)
            out["tickets_last_hour"] = int(row.last_hour or 0)

        r = await db.execute(
            text(
                "SELECT count(DISTINCT user_id) FROM user_sessions WHERE expires_at > now() AND COALESCE(revoked_at, 'epoch'::timestamptz) < now()"
            )
        )
        out["active_sessions"] = int(r.scalar() or 0)

        out["severity"] = "OK"
    except Exception as e:  # noqa: BLE001
        return {"severity": "WARN", "error": str(e)[:120]}
    return out


def _backup_history(limit: int = 5) -> list[dict]:
    """Last N pg_dumps — used by /backups endpoint and dashboard tile."""
    d = _backup_dir()
    if not d.exists():
        return []
    try:
        dumps = sorted(d.glob("*.sql.gz"), key=lambda p: p.stat().st_mtime, reverse=True)[:limit]
    except Exception:  # noqa: BLE001
        return []
    out = []
    now = datetime.now().timestamp()
    for p in dumps:
        st = p.stat()
        out.append(
            {
                "name": p.name,
                "size_mb": round(st.st_size / 2**20, 1),
                "age_hours": round((now - st.st_mtime) / 3600, 1),
                "mtime": datetime.fromtimestamp(st.st_mtime, timezone.utc).isoformat(),
            }
        )
    return out


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
        "system": _system_info(),
        "db": await _db_status(db),
        "backup": _backup_status(),
        "today": await _today_activity(db),
        "ticketing": await _ticket_freshness(db),
        "replication": await _replication_status(db),
    }
    severities = [v["severity"] for v in payload.values() if isinstance(v, dict) and "severity" in v]
    payload["overall_severity"] = (
        "CRIT" if "CRIT" in severities else "WARN" if "WARN" in severities else "OK"
    )
    return payload


def get_backup_history(limit: int = 10) -> list[dict]:
    return _backup_history(limit=limit)
