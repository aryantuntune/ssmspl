#!/bin/bash
# Daily PostgreSQL backup script for SSMSPL
# Runs inside the db-backup container (postgres:16-alpine)
#
# Keeps last N daily backups, rotating out older ones.
# Backups are gzip-compressed pg_dump files.

set -euo pipefail

# BACKUP_OUTPUT_DIR is the new env var name (server-2 admin uses it).
# BACKUP_DIR is kept for backwards compatibility with the existing prod cron.
BACKUP_DIR="${BACKUP_OUTPUT_DIR:-${BACKUP_DIR:-/backups}}"
PGHOST="${PGHOST:-db}"
PGPORT="${PGPORT:-5432}"
PGUSER="${POSTGRES_USER:-ssmspl_user}"
PGPASSWORD="${POSTGRES_PASSWORD:-ssmspl_prod_pass}"
# BACKUP_DB_NAME lets us back up a different database than the one
# the backend connects to (e.g. ssmspl_admin on server 2). Falls back
# to POSTGRES_DB to preserve existing prod behavior.
PGDATABASE="${BACKUP_DB_NAME:-${POSTGRES_DB:-ssmspl_db_prod}}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"

export PGPASSWORD

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/${PGDATABASE}_${TIMESTAMP}.sql.gz"

# Ensure backup directory exists
mkdir -p "${BACKUP_DIR}"

# ── Trap: clean up partial file + write failure status on ANY error ──
cleanup_on_failure() {
    local exit_code=$?
    if [[ $exit_code -ne 0 ]]; then
        echo "[$(date)] ERROR: Backup failed with exit code ${exit_code}"
        # Remove partial/corrupt backup file
        if [[ -n "${BACKUP_FILE:-}" && -f "${BACKUP_FILE}" ]]; then
            rm -f "${BACKUP_FILE}"
            echo "[$(date)] Cleaned up partial backup file"
        fi
        # Write failure status so the API knows something went wrong
        cat > "${BACKUP_DIR}/.last_backup.json.tmp" <<STATUSEOF
{"time":"$(date -u +%Y-%m-%dT%H:%M:%SZ)","file":"","size_bytes":0,"size_human":"0","status":"failed","error":"exit code ${exit_code}"}
STATUSEOF
        mv "${BACKUP_DIR}/.last_backup.json.tmp" "${BACKUP_DIR}/.last_backup.json"
    fi
}
trap cleanup_on_failure EXIT

echo "[$(date)] Starting backup of ${PGDATABASE}..."

# Run pg_dump with compression
pg_dump -h "${PGHOST}" -p "${PGPORT}" -U "${PGUSER}" -d "${PGDATABASE}" \
    --no-owner --no-privileges --clean --if-exists \
    | gzip > "${BACKUP_FILE}"

# Verify backup is not empty
if [ ! -s "${BACKUP_FILE}" ]; then
    echo "[$(date)] ERROR: Backup file is empty!"
    exit 1
fi

# Verify gzip integrity (catches truncated/corrupt archives)
if ! gzip -t "${BACKUP_FILE}" 2>/dev/null; then
    echo "[$(date)] ERROR: Backup file failed gzip integrity check!"
    exit 1
fi

BACKUP_SIZE=$(du -h "${BACKUP_FILE}" | cut -f1)
echo "[$(date)] Backup complete: ${BACKUP_FILE} (${BACKUP_SIZE})"

# Write status file for backend API (atomic via tmp+mv)
BACKUP_SIZE_BYTES=$(wc -c < "${BACKUP_FILE}")
cat > "${BACKUP_DIR}/.last_backup.json.tmp" <<STATUSEOF
{"time":"$(date -u +%Y-%m-%dT%H:%M:%SZ)","file":"$(basename "${BACKUP_FILE}")","size_bytes":${BACKUP_SIZE_BYTES},"size_human":"${BACKUP_SIZE}","status":"success"}
STATUSEOF
mv "${BACKUP_DIR}/.last_backup.json.tmp" "${BACKUP_DIR}/.last_backup.json"

# Rotate old backups — keep last N days
find "${BACKUP_DIR}" -name "${PGDATABASE}_*.sql.gz" -mtime +${RETENTION_DAYS} -delete
REMAINING=$(find "${BACKUP_DIR}" -name "${PGDATABASE}_*.sql.gz" | wc -l)
echo "[$(date)] Retention: kept ${REMAINING} backups (max ${RETENTION_DAYS} days)"
