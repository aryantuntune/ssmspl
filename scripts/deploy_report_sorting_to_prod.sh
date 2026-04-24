#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Deploy report-sorting changes to PRODUCTION (Server 1 — carferry.online)
#
# Pulls only the 4 shared report files from origin/feature/report-sorting,
# rebuilds the backend container, runs sanity checks. No DB changes, no
# migrations, no frontend rebuild.
#
# Usage (from /var/www/ssmspl on Server 1):
#   bash scripts/deploy_report_sorting_to_prod.sh
#
# Rollback (within 24h): the script keeps a backup at /root/.report_sort_backup_<TS>/
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

REPO_DIR="${REPO_DIR:-/var/www/ssmspl}"
COMPOSE="docker compose -f docker-compose.prod.yml"
BRANCH="origin/feature/report-sorting"
TS="$(date +%Y%m%d_%H%M%S)"
BACKUP_DIR="/root/.report_sort_backup_${TS}"

FILES=(
    "backend/app/reporting/reports/ferry_wise_item_summary.py"
    "backend/app/reporting/reports/item_wise_summary.py"
    "backend/app/reporting/sorting.py"
    "backend/app/schemas/report.py"
)

cd "$REPO_DIR"

echo "[1/5] Backing up current files to ${BACKUP_DIR}/"
mkdir -p "$BACKUP_DIR"
for f in "${FILES[@]}"; do
    if [ -f "$f" ]; then
        mkdir -p "$BACKUP_DIR/$(dirname "$f")"
        cp "$f" "$BACKUP_DIR/$f"
    fi
done

echo "[2/5] Fetching feature/report-sorting from origin"
git fetch origin feature/report-sorting

echo "[3/5] Pulling 4 shared report files (no migrations, no other code)"
git checkout "$BRANCH" -- "${FILES[@]}"

echo "[4/5] Rebuilding backend container"
$COMPOSE build backend
$COMPOSE up -d backend

echo "[5/5] Waiting for healthcheck and scanning logs for errors"
sleep 20
$COMPOSE ps backend
ERR=$($COMPOSE logs --tail 80 backend 2>&1 | grep -iE 'error|traceback' | head -5 || true)
if [ -n "$ERR" ]; then
    echo ""
    echo "WARNING — possible errors in backend logs:"
    echo "$ERR"
    echo ""
    echo "To rollback:  cp -r ${BACKUP_DIR}/* . && ${COMPOSE} up -d --build backend"
    exit 1
fi

echo ""
echo "DONE. Report sorting deployed."
echo "Backup kept at: ${BACKUP_DIR}"
echo ""
echo "To rollback within 24h:"
echo "  cp -r ${BACKUP_DIR}/* . && ${COMPOSE} up -d --build backend"
