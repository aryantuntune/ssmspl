#!/bin/bash
# Sync PostgreSQL backups to Google Drive
# Uploads ALL local backup files that aren't already on GDrive.
# Runs on the HOST via cron (every 5 minutes checking for .sync_needed,
# or daily at 2:15 AM as a safety net).
#
# Prerequisites:
#   - rclone installed and configured with a remote named "gdrive"
#   - jq installed (recommended) OR python3 (fallback for JSON log)
#
# Usage:
#   ./sync_backup_gdrive.sh              # Only syncs if .sync_needed exists
#   ./sync_backup_gdrive.sh --force      # Sync regardless of trigger file
#   ./sync_backup_gdrive.sh --dry-run    # Simulate upload (no changes)

set -euo pipefail

# ── Config ──────────────────────────────────────────────────────────────────
BACKUP_DIR="${BACKUP_DIR:-${BACKUP_OUTPUT_DIR:-/var/www/ssmspl/backups}}"
RCLONE_REMOTE="${RCLONE_REMOTE:-gdrive}"
GDRIVE_FOLDER="${GDRIVE_FOLDER:-${BACKUP_GDRIVE_REMOTE_DIR:-SSMSPL-Backups}}"
GDRIVE_RETENTION_DAYS="${GDRIVE_RETENTION_DAYS:-30}"
LOG_FILE="${LOG_FILE:-/var/log/ssmspl-backup-sync.log}"
NOTIFY_SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SYNC_NEEDED_FILE="${BACKUP_DIR}/.sync_needed"

DRY_RUN=""
FORCE=""
for arg in "$@"; do
    case "${arg}" in
        --dry-run) DRY_RUN="--dry-run" ;;
        --force)   FORCE="1" ;;
    esac
done

# ── Check if sync is needed ────────────────────────────────────────────────
if [[ -z "${FORCE}" && ! -f "${SYNC_NEEDED_FILE}" ]]; then
    # Nothing to sync — exit silently (cron runs this every 5 min)
    exit 0
fi

# ── Lock file — prevent concurrent sync runs ───────────────────────────────
LOCK_FILE="/tmp/ssmspl-backup-sync.lock"
exec 200>"${LOCK_FILE}"
if ! flock -n 200; then
    echo "[$(date)] Another sync is already running — exiting"
    exit 0
fi

# ── Logging ─────────────────────────────────────────────────────────────────
exec > >(tee -a "${LOG_FILE}") 2>&1

echo ""
echo "================================================================"
echo "[$(date)] Starting Google Drive backup sync"
echo "================================================================"

# ── List local backup files ─────────────────────────────────────────────────
LOCAL_FILES=$(ls -t "${BACKUP_DIR}"/*.sql.gz 2>/dev/null) || true

if [[ -z "${LOCAL_FILES}" ]]; then
    echo "[$(date)] ERROR: No backup files found in ${BACKUP_DIR}"
    if [[ -x "${NOTIFY_SCRIPT_DIR}/notify_backup.sh" ]]; then
        "${NOTIFY_SCRIPT_DIR}/notify_backup.sh" "FAILED" "No backup files found in ${BACKUP_DIR}" || true
    fi
    rm -f "${SYNC_NEEDED_FILE}"
    exit 1
fi

# ── Get list of files already on Google Drive (single rclone call) ──────────
echo "[$(date)] Fetching remote file list..."
REMOTE_FILE_LIST=$(rclone ls "${RCLONE_REMOTE}:${GDRIVE_FOLDER}/" --include "*.sql.gz" 2>/dev/null | awk '{print $NF}') || true

# ── Check which files need the latest backup to be confirmed complete ───────
LATEST_LOCAL=$(echo "${LOCAL_FILES}" | head -1)
LATEST_NAME=$(basename "${LATEST_LOCAL}")

BACKUP_STATUS_FILE="${BACKUP_DIR}/.last_backup.json"
LATEST_CONFIRMED=false
if [[ -f "${BACKUP_STATUS_FILE}" ]]; then
    CONFIRMED_FILE=$(grep -o '"file":"[^"]*"' "${BACKUP_STATUS_FILE}" | head -1 | cut -d'"' -f4)
    CONFIRMED_STATUS=$(grep -o '"status":"[^"]*"' "${BACKUP_STATUS_FILE}" | head -1 | cut -d'"' -f4)
    if [[ "${CONFIRMED_FILE}" == "${LATEST_NAME}" && "${CONFIRMED_STATUS}" == "success" ]]; then
        LATEST_CONFIRMED=true
    fi
fi

# ── Upload all missing files ────────────────────────────────────────────────
UPLOADED_COUNT=0
UPLOADED_FILES=""
UPLOAD_ERRORS=0

for LOCAL_FILE in ${LOCAL_FILES}; do
    FILE_NAME=$(basename "${LOCAL_FILE}")

    # Skip if already on GDrive
    if echo "${REMOTE_FILE_LIST}" | grep -qF "${FILE_NAME}"; then
        continue
    fi

    # For the latest file, verify it's confirmed complete
    if [[ "${FILE_NAME}" == "${LATEST_NAME}" && "${LATEST_CONFIRMED}" != "true" ]]; then
        # Fall back to age check
        BACKUP_MTIME=$(stat -c%Y "${LOCAL_FILE}" 2>/dev/null || date -r "${LOCAL_FILE}" +%s)
        BACKUP_AGE_SECS=$(( $(date +%s) - BACKUP_MTIME ))
        if [[ ${BACKUP_AGE_SECS} -lt 120 ]]; then
            echo "[$(date)] Skipping ${FILE_NAME} — latest backup not confirmed complete (${BACKUP_AGE_SECS}s old)"
            continue
        fi
    fi

    # Skip empty files
    if [[ ! -s "${LOCAL_FILE}" ]]; then
        echo "[$(date)] Skipping ${FILE_NAME} — file is empty"
        continue
    fi

    FILE_SIZE=$(du -h "${LOCAL_FILE}" | cut -f1)
    echo "[$(date)] Uploading ${FILE_NAME} (${FILE_SIZE}) to ${RCLONE_REMOTE}:${GDRIVE_FOLDER}/ ..."

    if rclone copy ${DRY_RUN} \
        "${LOCAL_FILE}" \
        "${RCLONE_REMOTE}:${GDRIVE_FOLDER}/" \
        --progress \
        --stats-one-line \
        --retries 3 \
        --retries-sleep 10s; then

        echo "[$(date)] Uploaded ${FILE_NAME} successfully"
        UPLOADED_COUNT=$((UPLOADED_COUNT + 1))
        UPLOADED_FILES="${UPLOADED_FILES} ${FILE_NAME}"

        # Verify upload size (only if not dry-run)
        if [[ -z "${DRY_RUN}" ]]; then
            REMOTE_SIZE=$(rclone size "${RCLONE_REMOTE}:${GDRIVE_FOLDER}/${FILE_NAME}" --json 2>/dev/null | grep -o '"bytes":[0-9]*' | cut -d: -f2)
            LOCAL_SIZE=$(stat -c%s "${LOCAL_FILE}" 2>/dev/null || stat -f%z "${LOCAL_FILE}")

            if [[ -n "${REMOTE_SIZE}" && "${REMOTE_SIZE}" != "${LOCAL_SIZE}" ]]; then
                echo "[$(date)] WARNING: Size mismatch for ${FILE_NAME}! local=${LOCAL_SIZE}, remote=${REMOTE_SIZE}"
                UPLOAD_ERRORS=$((UPLOAD_ERRORS + 1))
            elif [[ -n "${REMOTE_SIZE}" ]]; then
                echo "[$(date)] Verified ${FILE_NAME}: ${LOCAL_SIZE} bytes OK"
            fi
        fi
    else
        echo "[$(date)] ERROR: Failed to upload ${FILE_NAME}"
        UPLOAD_ERRORS=$((UPLOAD_ERRORS + 1))
    fi
done

if [[ ${UPLOADED_COUNT} -eq 0 ]]; then
    echo "[$(date)] No new files to upload — all local backups already on GDrive"
fi

# ── Write sync status for backend API ───────────────────────────────────────
REMOTE_COUNT=$(rclone ls "${RCLONE_REMOTE}:${GDRIVE_FOLDER}/" --include "*.sql.gz" 2>/dev/null | wc -l)
SYNC_TIME="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

# Status file shows latest synced file (for the UI status card)
LAST_SYNCED="${LATEST_NAME}"
SYNC_STATUS="success"
if [[ ${UPLOAD_ERRORS} -gt 0 ]]; then
    SYNC_STATUS="partial"
fi

cat > "${BACKUP_DIR}/.sync_status.json.tmp" <<STATUSEOF
{"time":"${SYNC_TIME}","file":"${LAST_SYNCED}","status":"${SYNC_STATUS}","gdrive_count":${REMOTE_COUNT}}
STATUSEOF
mv "${BACKUP_DIR}/.sync_status.json.tmp" "${BACKUP_DIR}/.sync_status.json"

# ── Update sync log (tracks all synced files for the history API) ───────────
SYNC_LOG="${BACKUP_DIR}/.sync_log.json"

if [[ ${UPLOADED_COUNT} -gt 0 ]]; then
    # Build new entries for all uploaded files
    if command -v jq &>/dev/null; then
        # Build entries JSON array from uploaded files
        ENTRIES="[]"
        for FNAME in ${UPLOADED_FILES}; do
            ENTRIES=$(echo "${ENTRIES}" | jq --arg file "${FNAME}" --arg time "${SYNC_TIME}" \
                '. + [{"file": $file, "time": $time, "status": "success"}]')
        done
        # Prepend to existing log
        if [ -f "${SYNC_LOG}" ] && [ -s "${SYNC_LOG}" ]; then
            jq --argjson new "${ENTRIES}" '$new + . | .[0:60]' \
                "${SYNC_LOG}" > "${SYNC_LOG}.tmp" 2>/dev/null \
                && mv "${SYNC_LOG}.tmp" "${SYNC_LOG}" \
                || echo "[$(date)] WARNING: jq failed to update sync log"
        else
            echo "${ENTRIES}" | jq '.[0:60]' > "${SYNC_LOG}"
        fi
    elif command -v python3 &>/dev/null; then
        SYNC_LOG_PATH="${SYNC_LOG}" SYNC_FILES="${UPLOADED_FILES}" SYNC_TIME="${SYNC_TIME}" \
        python3 << 'PYEOF'
import json, os
log_file = os.environ['SYNC_LOG_PATH']
try:
    with open(log_file) as f:
        log = json.load(f)
except (FileNotFoundError, json.JSONDecodeError, ValueError):
    log = []
for fname in os.environ['SYNC_FILES'].split():
    log.insert(0, {'file': fname, 'time': os.environ['SYNC_TIME'], 'status': 'success'})
log = log[:60]
with open(log_file, 'w') as f:
    json.dump(log, f)
PYEOF
    else
        # Last resort: overwrite with uploaded files only
        ENTRIES="["
        FIRST=true
        for FNAME in ${UPLOADED_FILES}; do
            if [[ "${FIRST}" == "true" ]]; then FIRST=false; else ENTRIES="${ENTRIES},"; fi
            ENTRIES="${ENTRIES}{\"file\":\"${FNAME}\",\"time\":\"${SYNC_TIME}\",\"status\":\"success\"}"
        done
        ENTRIES="${ENTRIES}]"
        echo "${ENTRIES}" > "${SYNC_LOG}"
        echo "[$(date)] WARNING: Neither jq nor python3 found — sync log has only current entries"
    fi
fi

# ── Remove sync trigger ────────────────────────────────────────────────────
rm -f "${SYNC_NEEDED_FILE}"

# ── Notification ────────────────────────────────────────────────────────────
if [[ ${UPLOADED_COUNT} -gt 0 && -x "${NOTIFY_SCRIPT_DIR}/notify_backup.sh" ]]; then
    if [[ ${UPLOAD_ERRORS} -eq 0 ]]; then
        "${NOTIFY_SCRIPT_DIR}/notify_backup.sh" "SUCCESS" \
            "${UPLOADED_COUNT} backup(s) uploaded to Google Drive. ${REMOTE_COUNT} total on GDrive." || true
    else
        "${NOTIFY_SCRIPT_DIR}/notify_backup.sh" "WARNING" \
            "${UPLOADED_COUNT} uploaded, ${UPLOAD_ERRORS} error(s). ${REMOTE_COUNT} total on GDrive." || true
    fi
fi

# ── Rotate old backups on Google Drive (non-fatal) ──────────────────────────
echo "[$(date)] Cleaning up backups older than ${GDRIVE_RETENTION_DAYS} days on Google Drive..."

if ! rclone delete ${DRY_RUN} \
    "${RCLONE_REMOTE}:${GDRIVE_FOLDER}/" \
    --min-age "${GDRIVE_RETENTION_DAYS}d" \
    --include "*.sql.gz"; then
    echo "[$(date)] WARNING: Google Drive cleanup failed (non-fatal)"
fi

REMOTE_COUNT=$(rclone ls "${RCLONE_REMOTE}:${GDRIVE_FOLDER}/" --include "*.sql.gz" 2>/dev/null | wc -l)
echo "[$(date)] Google Drive: ${REMOTE_COUNT} backups remaining"

echo "[$(date)] Sync complete — uploaded ${UPLOADED_COUNT}, errors ${UPLOAD_ERRORS}"
