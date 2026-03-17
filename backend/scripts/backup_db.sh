#!/bin/bash
# Daily PostgreSQL backup script for SSMSPL
# Runs inside the db container or with access to pg_dump
#
# Keeps last 7 daily backups, rotating out older ones.
# Backups are gzip-compressed pg_dump files.

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/backups}"
PGHOST="${PGHOST:-db}"
PGPORT="${PGPORT:-5432}"
PGUSER="${POSTGRES_USER:-ssmspl_user}"
PGPASSWORD="${POSTGRES_PASSWORD:-ssmspl_prod_pass}"
PGDATABASE="${POSTGRES_DB:-ssmspl_db_prod}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"

export PGPASSWORD

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/${PGDATABASE}_${TIMESTAMP}.sql.gz"

# Ensure backup directory exists
mkdir -p "${BACKUP_DIR}"

echo "[$(date)] Starting backup of ${PGDATABASE}..."

# Run pg_dump with compression
pg_dump -h "${PGHOST}" -p "${PGPORT}" -U "${PGUSER}" -d "${PGDATABASE}" \
    --no-owner --no-privileges --clean --if-exists \
    | gzip > "${BACKUP_FILE}"

# Verify backup is not empty
if [ ! -s "${BACKUP_FILE}" ]; then
    echo "[$(date)] ERROR: Backup file is empty!"
    rm -f "${BACKUP_FILE}"
    exit 1
fi

BACKUP_SIZE=$(du -h "${BACKUP_FILE}" | cut -f1)
echo "[$(date)] Backup complete: ${BACKUP_FILE} (${BACKUP_SIZE})"

# Rotate old backups — keep last N days
find "${BACKUP_DIR}" -name "${PGDATABASE}_*.sql.gz" -mtime +${RETENTION_DAYS} -delete
REMAINING=$(find "${BACKUP_DIR}" -name "${PGDATABASE}_*.sql.gz" | wc -l)
echo "[$(date)] Retention: kept ${REMAINING} backups (max ${RETENTION_DAYS} days)"
