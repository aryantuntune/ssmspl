"""Host-action queue: backend writes JSON requests, host daemon executes them.

Why: the backend container can't run `kill -9 <host_pid>`, `systemctl restart`,
`certbot renew`, etc. — those need host-level privileges. We solve it by
mounting a shared queue dir and having a tiny systemd-managed daemon on the
host pick up requests, execute whitelisted actions, and write results back.

Layout:
  /var/lib/ssmspl-host-actions/
    queue/<request_id>.json       <- backend writes
    results/<request_id>.json     <- daemon writes
    inflight/                     <- daemon move-to-while-executing

Whitelist of actions enforced by the daemon (see scripts/host_action_daemon.sh).
"""
from __future__ import annotations

import asyncio
import json
import logging
import time
import uuid
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

QUEUE_ROOT = Path("/var/lib/ssmspl-host-actions")
QUEUE_DIR = QUEUE_ROOT / "queue"
RESULTS_DIR = QUEUE_ROOT / "results"

# Allowed actions — also enforced daemon-side, double-checked here so a
# router caller can't enqueue something arbitrary.
ALLOWED_ACTIONS = {
    "kill_pid",
    "run_iptables_fix",
    "restart_docker",
    "restart_nginx",
    "certbot_renew",
    "cleanup_logs",
    "force_recreate_admin_backend",
    "run_health_check",
}


def is_queue_mounted() -> bool:
    return QUEUE_DIR.exists() and RESULTS_DIR.exists()


def submit_action(action: str, params: dict[str, Any] | None = None) -> str:
    """Drop a request file into the queue. Returns request_id."""
    if action not in ALLOWED_ACTIONS:
        raise ValueError(f"action {action!r} not whitelisted")
    if not is_queue_mounted():
        raise RuntimeError(
            "host-action queue not mounted; ensure /var/lib/ssmspl-host-actions is mounted into the container"
        )
    request_id = str(uuid.uuid4())
    payload = {
        "request_id": request_id,
        "action": action,
        "params": params or {},
        "submitted_at": time.time(),
    }
    QUEUE_DIR.mkdir(parents=True, exist_ok=True)
    out = QUEUE_DIR / f"{request_id}.json"
    tmp = out.with_suffix(".tmp")
    tmp.write_text(json.dumps(payload))
    tmp.replace(out)  # atomic
    return request_id


async def wait_result(request_id: str, timeout_s: float = 30.0) -> dict | None:
    """Poll for the result file. Returns parsed JSON or None on timeout."""
    deadline = time.monotonic() + timeout_s
    target = RESULTS_DIR / f"{request_id}.json"
    while time.monotonic() < deadline:
        if target.exists():
            try:
                return json.loads(target.read_text())
            except json.JSONDecodeError:
                pass
        await asyncio.sleep(0.4)
    return None


async def submit_and_wait(action: str, params: dict | None = None, timeout_s: float = 30.0) -> dict:
    """Convenience: submit + wait + return wrapped result.

    Always returns a dict with at least {ok: bool, request_id, ...}.
    """
    try:
        rid = submit_action(action, params)
    except (ValueError, RuntimeError) as e:
        return {"ok": False, "error": str(e), "request_id": None}

    result = await wait_result(rid, timeout_s=timeout_s)
    if result is None:
        return {
            "ok": False,
            "error": "host action timed out — daemon may not be running",
            "request_id": rid,
        }
    return {"ok": result.get("exit_code") == 0, "request_id": rid, **result}
