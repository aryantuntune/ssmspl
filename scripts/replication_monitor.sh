#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Replication health monitor — Server 2 (cron every 5 min)
#
# Catches two failure modes:
#   1. Subscription dead/disabled/lagging (the silent 14-hour outage we hit)
#   2. Replication INSERT skipped due to ID conflict (data loss risk)
#
# Both alert via email (SMTP creds in /etc/ssmspl_monitor.conf, root-only 600).
# State files in /var/lib/postgresql/ track baselines so each event alerts once.
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
LOG=/var/log/ssmspl_repl_monitor.log
STATE=/var/lib/postgresql/.repl_monitor_alert_state
SKIPS_STATE=/var/lib/postgresql/.repl_skips_last_id
CONF=/etc/ssmspl_monitor.conf
LAG_THRESHOLD=600
TS=$(date '+%F %T')

mkdir -p $(dirname $STATE) 2>/dev/null
[ -r $CONF ] && source $CONF

check_sub() {
    local DB="$1" SUB="$2"
    local SUB_EXISTS SUB_ENABLED WORKER_PID LAG
    SUB_EXISTS=$(sudo -u postgres psql -d "$DB" -t -A -c "SELECT count(*) FROM pg_subscription WHERE subname='$SUB';" 2>/dev/null)
    [ "$SUB_EXISTS" != '1' ] && { echo MISSING; return; }
    SUB_ENABLED=$(sudo -u postgres psql -d "$DB" -t -A -c "SELECT subenabled FROM pg_subscription WHERE subname='$SUB';" 2>/dev/null)
    [ "$SUB_ENABLED" != 't' ] && { echo DISABLED; return; }
    WORKER_PID=$(sudo -u postgres psql -d "$DB" -t -A -c "SELECT COALESCE(pid::text, '') FROM pg_stat_subscription WHERE subname='$SUB';" 2>/dev/null)
    [ -z "$WORKER_PID" ] && { echo WORKER_DEAD; return; }
    LAG=$(sudo -u postgres psql -d "$DB" -t -A -c "SELECT COALESCE(EXTRACT(EPOCH FROM (now() - latest_end_time))::int, 0) FROM pg_stat_subscription WHERE subname='$SUB';" 2>/dev/null)
    [ "$LAG" -gt $LAG_THRESHOLD ] 2>/dev/null && { echo "LAGGING:$LAG"; return; }
    echo OK
}

send_email() {
    local SUBJECT="$1" BODY="$2"
    [ -z "${SMTP_HOST:-}" ] && return
    SMTP_HOST="$SMTP_HOST" SMTP_PORT="$SMTP_PORT" SMTP_USER="$SMTP_USER" \
    SMTP_PASSWORD="$SMTP_PASSWORD" ALERT_TO="$ALERT_TO" \
    SUBJECT="$SUBJECT" BODY="$BODY" python3 - <<'PYEOF'
import os, smtplib, ssl
from email.message import EmailMessage
msg = EmailMessage()
msg['Subject'] = os.environ['SUBJECT']
msg['From'] = os.environ['SMTP_USER']
msg['To'] = os.environ['ALERT_TO']
msg.set_content(os.environ['BODY'])
ctx = ssl.create_default_context()
with smtplib.SMTP(os.environ['SMTP_HOST'], int(os.environ['SMTP_PORT'])) as s:
    s.starttls(context=ctx)
    s.login(os.environ['SMTP_USER'], os.environ['SMTP_PASSWORD'])
    s.send_message(msg)
PYEOF
}

# ─── Subscription health check ───────────────────────────────────────────
S1=$(check_sub ssmspl_sync ssmspl_sub)
S2=$(check_sub ssmspl_admin admin_sub)

if [ "$S1" = OK ] && [ "$S2" = OK ]; then
    if [ -f "$STATE" ]; then
        MSG="[$TS] RECOVERED — both subscriptions healthy"
        echo "$MSG" | tee -a $LOG
        send_email '[SSMSPL] Replication RECOVERED' "$MSG"
        rm -f $STATE
    fi
else
    SUMMARY="ssmspl_sub=$S1 admin_sub=$S2"
    LAST=$(cat $STATE 2>/dev/null || echo '')
    if [ "$SUMMARY" != "$LAST" ]; then
        MSG="[$TS] REPLICATION ALERT — $SUMMARY"
        echo "$MSG" | tee -a $LOG
        send_email '[SSMSPL] Replication ALERT' "$MSG

Server 2: admin.carferry.online
Time: $TS
ssmspl_sub: $S1
admin_sub: $S2

Check on Server 2:
  tail /var/log/ssmspl_repl_monitor.log
  sudo -u postgres psql -d ssmspl_admin -c 'SELECT * FROM pg_stat_subscription;'"
        echo "$SUMMARY" > $STATE
    fi
fi

# ─── Replication-skip alert (catches data conflicts) ──────────────────────
LAST_SEEN_SKIP=$(cat $SKIPS_STATE 2>/dev/null || echo 0)
NEW_SKIPS=$(sudo -u postgres psql -d ssmspl_admin -t -A -c "
    SELECT count(*) FROM replication_skipped_inserts WHERE id > $LAST_SEEN_SKIP;
" 2>/dev/null)

if [ "${NEW_SKIPS:-0}" -gt 0 ] 2>/dev/null; then
    DETAIL=$(sudo -u postgres psql -d ssmspl_admin -t -c "
        SELECT '  - ' || skipped_at::text || ' | ' || table_name || ' id=' || row_id ||
               ' | INCOMING: ' || (incoming_data->>'net_amount') || ' (' || (incoming_data->>'ticket_no') || ')' ||
               ' | EXISTING: ' || (existing_data->>'net_amount') || ' (' || (existing_data->>'ticket_no') || ')'
        FROM replication_skipped_inserts
        WHERE id > $LAST_SEEN_SKIP AND table_name = 'tickets'
        ORDER BY id DESC LIMIT 20;
    " 2>/dev/null)
    NEW_MAX_ID=$(sudo -u postgres psql -d ssmspl_admin -t -A -c "SELECT max(id) FROM replication_skipped_inserts;" 2>/dev/null)

    MSG="[$TS] REPLICATION SKIP — $NEW_SKIPS new conflict(s) since last check. Production INSERTs were dropped because admin already had a row at the same ID."
    echo "$MSG" | tee -a $LOG
    send_email "[SSMSPL] Replication conflict: $NEW_SKIPS skipped row(s)" "$MSG

WHAT THIS MEANS
Production tried to send new INSERT(s) to admin, but admin's database already had a different row at the same primary-key ID. The trigger preserved admin's data and dropped the production data. This typically means revenue from production won't show on admin reports for those specific IDs.

ACTION REQUIRED
Open admin DB and review the conflict(s):

  ssh root@194.164.148.228
  sudo -u postgres psql -d ssmspl_admin

  -- Recent ticket conflicts (most concerning — these are sales)
  SELECT skipped_at,
         (incoming_data->>'ticket_no') AS prod_ticket_no,
         (incoming_data->>'branch_id') AS prod_branch,
         (incoming_data->>'net_amount') AS prod_amount,
         (existing_data->>'ticket_no') AS admin_ticket_no,
         (existing_data->>'net_amount') AS admin_amount
  FROM replication_skipped_inserts
  WHERE id > $LAST_SEEN_SKIP AND table_name = 'tickets'
  ORDER BY id DESC;

RECENT TICKET CONFLICTS (top 20):
$DETAIL"

    [ -n "$NEW_MAX_ID" ] && echo "$NEW_MAX_ID" > $SKIPS_STATE
fi

# Exit code: 0 if both healthy AND no new skips, 1 otherwise
[ "$S1" = OK ] && [ "$S2" = OK ] && [ "${NEW_SKIPS:-0}" -eq 0 ] && exit 0 || exit 1
