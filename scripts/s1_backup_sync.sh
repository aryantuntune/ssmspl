#!/bin/bash
# Server 1 (carferry.online) DB-dump -> Google Drive sync + email notification.
#
# Runs as jetty_admin via cron. No sudo / no msmtp needed: sends status email
# via python smtplib using the SMTP creds already in ~/.config/ssmspl_monitor.conf
# (sender = carferry.server.health, recipient = ALERT_TO = personal inbox).
#
# Why this exists: the root-created DB dumps land in BACKUP_DIR (world-readable);
# jetty uploads them. A silent dump-stall or upload failure would otherwise go
# unnoticed on Server 1 (unlike Server 2 which has notify_backup.sh). This closes
# that gap so backup health for BOTH servers reaches the same inbox.
set -uo pipefail

BACKUP_DIR="/var/www/ssmspl/backups"
RCLONE="/usr/bin/rclone"
REMOTE="gdrive:SSMSPL-Server1-Backups"
CONF="$HOME/.config/ssmspl_monitor.conf"
LOG="$HOME/s1_backup_sync.log"
STALE_HOURS=26

ts() { date '+%Y-%m-%d %H:%M:%S %Z'; }

# Load SMTP creds: SMTP_HOST/PORT/USER/PASSWORD + ALERT_TO
[ -r "$CONF" ] && . "$CONF"

STATUS="SUCCESS"
DETAIL=""
NEWEST_NAME=""

# 1. Newest local dump + freshness
NEWEST=$(ls -t "$BACKUP_DIR"/*.sql.gz 2>/dev/null | head -1)
if [ -z "$NEWEST" ]; then
    STATUS="FAILED"
    DETAIL="No .sql.gz dumps found in $BACKUP_DIR (dump pipeline broken?)."
else
    NEWEST_NAME=$(basename "$NEWEST")
    AGE_H=$(( ( $(date +%s) - $(stat -c %Y "$NEWEST") ) / 3600 ))
    if [ "$AGE_H" -gt "$STALE_HOURS" ]; then
        STATUS="FAILED"
        DETAIL="Newest dump $NEWEST_NAME is ${AGE_H}h old (>${STALE_HOURS}h) - dump pipeline may have stalled."
    fi
fi

# 2. Upload to Drive (only if we have a dump to push)
if [ -n "$NEWEST" ]; then
    if "$RCLONE" copy "$BACKUP_DIR/" "$REMOTE/" --include '*.sql.gz' >> "$LOG" 2>&1; then
        REMOTE_COUNT=$("$RCLONE" lsf "$REMOTE/" --include '*.sql.gz' 2>/dev/null | wc -l)
        if "$RCLONE" lsf "$REMOTE/" --include '*.sql.gz' 2>/dev/null | grep -qF "$NEWEST_NAME"; then
            [ "$STATUS" = "SUCCESS" ] && DETAIL="Latest dump $NEWEST_NAME (${AGE_H}h old) uploaded. ${REMOTE_COUNT} dumps now on Drive."
        else
            STATUS="FAILED"
            DETAIL="Upload ran but $NEWEST_NAME not present on Drive afterwards."
        fi
    else
        STATUS="FAILED"
        DETAIL="rclone copy to $REMOTE failed (see $LOG)."
    fi
fi

echo "[$(ts)] S1 backup notify: $STATUS - $DETAIL" >> "$LOG"

# 3. Email the status (from health account -> personal inbox)
if [ -n "${SMTP_HOST:-}" ] && [ -n "${ALERT_TO:-}" ]; then
    PREFIX="[OK]"
    [ "$STATUS" = "FAILED" ] && PREFIX="[ALERT]"
    SMTP_USER="${SMTP_USER:-}" SMTP_PASSWORD="${SMTP_PASSWORD:-}" \
    SMTP_HOST="$SMTP_HOST" SMTP_PORT="${SMTP_PORT:-587}" ALERT_TO="$ALERT_TO" \
    STATUS="$STATUS" DETAIL="$DETAIL" PREFIX="$PREFIX" \
    python3 - <<'PYEOF'
import os, smtplib, ssl
from email.message import EmailMessage
m = EmailMessage()
m['Subject'] = f"{os.environ['PREFIX']} SSMSPL Server 1 Backup -- {os.environ['STATUS']}"
m['From'] = os.environ['SMTP_USER']
m['To'] = os.environ['ALERT_TO']
m.set_content(
    "SSMSPL Server 1 (carferry.online) database backup\n"
    f"Status:  {os.environ['STATUS']}\n"
    f"Details: {os.environ['DETAIL']}\n\n"
    "Automated notification from the Server 1 backup sync."
)
try:
    with smtplib.SMTP(os.environ['SMTP_HOST'], int(os.environ['SMTP_PORT']), timeout=25) as s:
        s.starttls(context=ssl.create_default_context())
        s.login(os.environ['SMTP_USER'], os.environ['SMTP_PASSWORD'])
        s.send_message(m)
    print("notify email sent ->", os.environ['ALERT_TO'])
except Exception as e:
    print("notify email FAILED:", type(e).__name__, str(e)[:160])
PYEOF
fi
