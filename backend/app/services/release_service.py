"""Release manifest + rollback orchestration for the SuperAdmin app.

Why this exists:
- Each deploy bakes its git SHA / alembic head / build timestamp into the
  image (see backend/Dockerfile ARG/ENV). Reading those env vars tells us
  what code version is *actually running right now*.
- A JSON manifest at /var/www/ssmspl-admin/releases.json (mounted into the
  container at /app/releases.json — see docker-compose.admin.yml) lists
  every tagged release ever built. Reading that lets us show a rollback
  target list.
- Rollback is mediated through the host-action daemon (no in-container
  docker stop, because snap-docker + AppArmor blocks signals).

Conflict guards:
- Postgres advisory lock prevents concurrent rollbacks.
- Alembic head comparison blocks code-DB schema mismatch (unless `force`).
- Image-tag existence check before submitting host action.
- `release-*` tags are protected from `prune-images` (see system_actions_service).
"""
from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

# The manifest directory is mounted into the container by docker-compose.
# We read/write `releases.json` inside that directory.
MANIFEST_DIR = Path("/app/releases")
MANIFEST_PATH = MANIFEST_DIR / "releases.json"

# Postgres advisory lock key — arbitrary 32-bit int unique to "system rollback".
# Two SuperAdmins clicking rollback at the same time can't both succeed.
_ROLLBACK_LOCK_KEY = 8847_2026


def current_build() -> dict:
    """What's running right now — derived from baked env vars."""
    return {
        "git_sha": os.environ.get("BUILD_GIT_SHA", "unknown"),
        "build_ts": os.environ.get("BUILD_TS", "unknown"),
        "alembic_head": os.environ.get("BUILD_ALEMBIC_HEAD", "unknown"),
        "image_tag": os.environ.get("BUILD_IMAGE_TAG", "latest"),
    }


def list_releases(limit: int = 20) -> list[dict]:
    """Read the manifest from disk. Returns most-recent-first.

    Defends against:
    - Manifest missing (no deploys yet): returns []
    - Manifest path is unexpectedly a directory (a docker auto-create accident):
      returns [] rather than crashing
    - Malformed JSON: returns [], logs warning
    """
    if not MANIFEST_PATH.exists() or MANIFEST_PATH.is_dir():
        return []
    try:
        data = json.loads(MANIFEST_PATH.read_text())
    except (json.JSONDecodeError, OSError) as e:
        logger.warning("releases manifest unreadable: %s", e)
        return []
    entries = data.get("releases") or []
    # newest first
    entries.sort(key=lambda r: r.get("build_ts") or "", reverse=True)
    return entries[:limit]


def find_release(tag: str) -> dict | None:
    for r in list_releases(limit=200):
        if r.get("image_tag") == tag:
            return r
    return None


async def acquire_rollback_lock(db: AsyncSession) -> bool:
    """Try to grab the rollback advisory lock. Returns False if another
    rollback is already in flight."""
    r = await db.execute(text("SELECT pg_try_advisory_lock(:k)"), {"k": _ROLLBACK_LOCK_KEY})
    got = bool(r.scalar())
    return got


async def release_rollback_lock(db: AsyncSession) -> None:
    await db.execute(text("SELECT pg_advisory_unlock(:k)"), {"k": _ROLLBACK_LOCK_KEY})


def alembic_head_compatible(target_head: str | None, current_head: str | None) -> tuple[bool, str]:
    """Check whether rolling back to `target_head` is schema-safe.

    Returns (safe, reason).

    Rules:
    - target == current → safe (no schema change)
    - target unknown / current unknown → unsafe (we can't reason about it)
    - target != current → schema drift — caller must force-confirm
    """
    if not target_head or target_head == "unknown":
        return False, "target release has no recorded alembic head"
    if not current_head or current_head == "unknown":
        return False, "current build has no recorded alembic head"
    if target_head == current_head:
        return True, "same schema head"
    return False, f"schema drift: current head is {current_head}, target wants {target_head}"


def retag_as_latest(target_tag: str, repo: str = "ssmspl-admin-admin-backend") -> dict:
    """Move the `:latest` pointer to point at `target_tag`. Pure metadata op —
    no container restart yet. The follow-up force_recreate_admin_backend host
    action will then bring up a new container using the new `:latest`.

    Why this design:
    - Avoids extending the host-action daemon's allowlist with a new action.
    - Atomic from docker's perspective (a tag points to exactly one image).
    - Reversible: if rollback fails health, just retag `:latest` back to the
      original image and recreate again.
    """
    import docker  # type: ignore

    client = docker.from_env()
    src = client.images.get(target_tag)
    src.tag(repo, tag="latest", force=True)
    return {"ok": True, "now_latest": target_tag, "image_id": src.short_id}


def append_release(entry: dict) -> None:
    """Used by the deploy script (or a startup hook) to record a new release
    in the manifest. Also written here so test/dev can simulate it.

    The deploy script (scripts/build-tagged-release.sh) is the canonical writer
    on production; this function exists so backend code can record events too
    if needed later (e.g., an in-app deploy button).
    """
    if not MANIFEST_DIR.exists():
        return
    if MANIFEST_PATH.exists() and MANIFEST_PATH.is_dir():
        # docker auto-created it as a dir; don't try to overwrite
        logger.warning("manifest path is a directory; manual cleanup required: %s", MANIFEST_PATH)
        return
    data: dict = {"releases": []}
    if MANIFEST_PATH.exists():
        try:
            data = json.loads(MANIFEST_PATH.read_text()) or {"releases": []}
        except json.JSONDecodeError:
            data = {"releases": []}
    releases = data.get("releases") or []
    # de-dupe by image_tag
    releases = [r for r in releases if r.get("image_tag") != entry.get("image_tag")]
    releases.append(entry)
    data["releases"] = releases
    tmp = MANIFEST_PATH.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(data, indent=2))
    tmp.replace(MANIFEST_PATH)
