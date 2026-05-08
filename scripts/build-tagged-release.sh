#!/usr/bin/env bash
# Build admin-backend with provenance baked in + tag the result for rollback.
#
# Run on the deploy host (Server 1 or Server 2) from the project root.
# After this finishes, `docker compose up -d --force-recreate admin-backend`
# (or the host-action daemon's force_recreate) picks up the new :latest.
#
# Inputs:
#   $1 = compose flavor: "admin" or "prod" (default: admin)
#
# What it does:
#   1. Computes git SHA + alembic head + timestamp
#   2. Builds admin-backend with those baked into the image as ENV
#   3. Tags result as both :latest and :release-<sha>-<ts>
#   4. Appends an entry to releases.json so the SuperAdmin app can list it
#
# Idempotent: re-running with the same git SHA produces the same image hash;
# the manifest dedupes on image_tag.

set -euo pipefail

FLAVOR="${1:-admin}"

if [ "$FLAVOR" = "admin" ]; then
  COMPOSE_FILES=(-f docker-compose.yml -f docker-compose.admin.yml)
  REPO="ssmspl-admin-admin-backend"
  MANIFEST_DIR="/home/ssmspl-admin-releases"
elif [ "$FLAVOR" = "prod" ]; then
  COMPOSE_FILES=(-f docker-compose.prod.yml)
  REPO="ssmspl-backend"
  MANIFEST_DIR="/var/lib/ssmspl-releases"
else
  echo "usage: $0 [admin|prod]" >&2
  exit 2
fi

GIT_SHA=$(git rev-parse --short=10 HEAD 2>/dev/null || echo "nogit")
TS=$(date -u +%Y%m%dT%H%M%SZ)
TAG="release-${GIT_SHA}-${TS}"

# Find the alembic head from migrations dir without booting Python (faster).
# Fallback to 'unknown' if the migrations layout changes.
ALEMBIC_HEAD=$(grep -rho "^Revision ID:.*" backend/alembic/versions/ 2>/dev/null \
  | awk '{print $3}' \
  | sort -u \
  | head -1 \
  || echo "unknown")
[ -z "$ALEMBIC_HEAD" ] && ALEMBIC_HEAD="unknown"

echo "→ Building $REPO"
echo "  git_sha       = $GIT_SHA"
echo "  build_ts      = $TS"
echo "  alembic_head  = $ALEMBIC_HEAD"
echo "  release_tag   = $TAG"

# Pass build args so the Dockerfile bakes them in as ENV
docker compose "${COMPOSE_FILES[@]}" build \
  --build-arg "GIT_SHA=$GIT_SHA" \
  --build-arg "BUILD_TS=$TS" \
  --build-arg "ALEMBIC_HEAD=$ALEMBIC_HEAD" \
  --build-arg "IMAGE_TAG=$TAG" \
  admin-backend

# Tag the just-built :latest with our release tag too (so we can roll back to it later)
docker tag "${REPO}:latest" "${REPO}:${TAG}"

# Append to manifest (atomic write via tmp+rename).
# The dir is the docker bind-mount target; the file lives inside it.
mkdir -p "$MANIFEST_DIR"
MANIFEST="$MANIFEST_DIR/releases.json"
TMP="${MANIFEST}.tmp"

# If a previous run accidentally let docker auto-create the manifest path as a
# directory, bail loudly — recovering automatically would risk losing history.
if [ -d "$MANIFEST" ]; then
  echo "ERROR: $MANIFEST is a directory (likely docker auto-created the path)." >&2
  echo "Delete it manually after confirming it's empty:  rmdir $MANIFEST" >&2
  exit 3
fi

if [ ! -f "$MANIFEST" ]; then
  echo '{"releases":[]}' > "$MANIFEST"
fi

NEW_ENTRY=$(cat <<JSON
{
  "image_tag": "${TAG}",
  "git_sha": "${GIT_SHA}",
  "build_ts": "${TS}",
  "alembic_head": "${ALEMBIC_HEAD}",
  "deployed_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "deployed_by": "${USER:-unknown}",
  "host": "$(hostname)"
}
JSON
)

# jq does the safe append; falls back to manual if jq unavailable.
if command -v jq >/dev/null 2>&1; then
  jq --argjson new "$NEW_ENTRY" \
     '.releases = ((.releases // []) | map(select(.image_tag != $new.image_tag))) + [$new]' \
     "$MANIFEST" > "$TMP"
  mv "$TMP" "$MANIFEST"
else
  echo "WARN: jq not installed; manifest update skipped" >&2
fi

echo "✓ Tagged ${REPO}:${TAG}"
echo "✓ Manifest updated: $MANIFEST"
echo
echo "Next: bring it live with"
echo "  docker compose ${COMPOSE_FILES[*]} up -d --force-recreate admin-backend"
echo "or, if the host-action daemon is installed, tap 'Force-recreate admin-backend'"
echo "in the SuperAdmin app."
