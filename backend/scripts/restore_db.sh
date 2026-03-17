#!/bin/bash
# PostgreSQL restore script for SSMSPL
# Usage: ./restore_db.sh <backup_file.sql.gz>

set -euo pipefail

if [ $# -eq 0 ]; then
    echo "Usage: $0 <backup_file.sql.gz>"
    echo ""
    echo "Available backups:"
    ls -lh /backups/*.sql.gz 2>/dev/null || echo "  No backups found in /backups/"
    exit 1
fi

BACKUP_FILE="$1"
PGHOST="${PGHOST:-db}"
PGPORT="${PGPORT:-5432}"
PGUSER="${POSTGRES_USER:-ssmspl_user}"
PGPASSWORD="${POSTGRES_PASSWORD:-ssmspl_prod_pass}"
PGDATABASE="${POSTGRES_DB:-ssmspl_db_prod}"

export PGPASSWORD

if [ ! -f "${BACKUP_FILE}" ]; then
    echo "ERROR: Backup file not found: ${BACKUP_FILE}"
    exit 1
fi

echo "WARNING: This will overwrite the database '${PGDATABASE}'!"
echo "Backup file: ${BACKUP_FILE}"
echo ""
echo "Press Ctrl+C to cancel, or wait 5 seconds to proceed..."
sleep 5

echo "[$(date)] Restoring ${PGDATABASE} from ${BACKUP_FILE}..."

gunzip -c "${BACKUP_FILE}" | psql -h "${PGHOST}" -p "${PGPORT}" -U "${PGUSER}" -d "${PGDATABASE}" --single-transaction

echo "[$(date)] Restore complete."
