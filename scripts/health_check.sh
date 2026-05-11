#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# SSMSPL Comprehensive Health & Monitoring Check
# ─────────────────────────────────────────────────────────────────────────────
# Runs a battery of checks against the local server. Designed to work on:
#   - Server 1 (carferry.online — production, jetty_admin user)
#   - Server 2 (admin.carferry.online — admin portal, root user)
#
# Detects:
#   1. Replication health (Server 2 only — subscriptions)
#   2. Sequence vs MAX(id) drift (early warning before duplicate-key crashes)
#   3. Container health (running, healthy, restart count)
#   4. Backend error rate (5xx, exceptions in last hour)
#   5. Disk space + memory
#   6. DB connection saturation
#   7. ticket_service code in running container — proves the fix is deployed
#   8. Recent ticket creation (proves ticketing endpoint works)
#
# Usage:
#   bash health_check.sh               # one-shot, exit 0=OK 1=issues
#   bash health_check.sh --verbose     # always print all results
#
# Email alerts: configure /etc/ssmspl_monitor.conf with SMTP creds.
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail

VERBOSE=false
[ "${1:-}" = "--verbose" ] && VERBOSE=true

# ─── Auto-detect server ───────────────────────────────────────────────────
if [ -d /var/www/ssmspl-admin ]; then
    SERVER_NAME="Server 2 (admin.carferry.online)"
    DB_NAME="ssmspl_admin"
    COMPOSE_FILE="/var/www/ssmspl-admin/docker-compose.admin.yml"
    BACKEND_CONTAINER="admin-backend"
    SUBSCRIPTIONS_CHECK=true
    PSQL_CMD="sudo -u postgres psql"
elif [ -d /var/www/ssmspl ]; then
    SERVER_NAME="Server 1 (carferry.online — PRODUCTION)"
    DB_NAME="ssmspl_db_prod"
    COMPOSE_FILE="/var/www/ssmspl/docker-compose.prod.yml"
    BACKEND_CONTAINER="ssmspl-backend-1"
    SUBSCRIPTIONS_CHECK=false  # prod is the publisher, no subscriptions
    PSQL_CMD="docker exec ssmspl-db-1 psql -U ssmspl_user"
else
    echo "ERROR: cannot detect server (neither /var/www/ssmspl nor /var/www/ssmspl-admin found)"
    exit 1
fi

# Conf can be in /etc/ (Server 2 root) or ~/.config/ (Server 1 jetty_admin)
CONF=/etc/ssmspl_monitor.conf
[ ! -r "$CONF" ] && CONF="$HOME/.config/ssmspl_monitor.conf"
LOG=/var/log/ssmspl_health.log
[ ! -w "$(dirname $LOG)" ] 2>/dev/null && LOG="$HOME/ssmspl_health.log"
if [ -w /var/lib/postgresql ] 2>/dev/null; then STATE_DIR=/var/lib/postgresql; else STATE_DIR=$HOME; fi
STATE=$STATE_DIR/.ssmspl_health_state
TS=$(date '+%F %T')

[ -r "$CONF" ] && source "$CONF" || true

# ─── Issue tracking ───────────────────────────────────────────────────────
ISSUES=()
DETAIL=""

issue() {
    local SEVERITY="$1" MSG="$2"
    ISSUES+=("[$SEVERITY] $MSG")
    DETAIL="$DETAIL\n[$SEVERITY] $MSG"
    echo "  ✗ [$SEVERITY] $MSG"
}

ok() {
    $VERBOSE && echo "  ✓ $1"
}

# ─── 0. EXTERNAL HTTPS PROBE ──────────────────────────────────────────────────
# Catches outages that localhost-only checks miss: DNS, SSL, nginx upstream,
# provider routing, anything between the public Internet and our backend.
# Runs FIRST so even if a later check explodes, this one is already done.
# Cross-server: each server also pings the other so when one is offline,
# the OTHER server's monitor catches it and pushes the alert from its
# own /api/system-health/events.
echo "── External HTTPS probe ──"
if [[ "$SERVER_NAME" == *"Server 1"* ]]; then
    SELF_URL="https://carferry.online"
    OTHER_URL="https://admin.carferry.online"
    SELF_LABEL="prod"
    OTHER_LABEL="admin"
else
    SELF_URL="https://admin.carferry.online"
    OTHER_URL="https://carferry.online"
    SELF_LABEL="admin"
    OTHER_LABEL="prod"
fi

probe_url() {
    local URL="$1" LABEL="$2"
    local CODE
    CODE=$(curl -sS --max-time 5 -o /dev/null -w '%{http_code}' "$URL/api/version" 2>/dev/null || echo "TIMEOUT")
    if [ "$CODE" = "200" ]; then
        ok "$LABEL public URL responding ($URL)"
    else
        issue "CRIT" "$LABEL public URL DOWN — HTTP $CODE on $URL/api/version"
    fi
}

probe_url "$SELF_URL" "$SELF_LABEL (self)"
probe_url "$OTHER_URL" "$OTHER_LABEL (peer)"

# ─── 1. Container health ──────────────────────────────────────────────────
echo "── Container health ──"
if docker ps --filter "name=$BACKEND_CONTAINER" --filter "status=running" -q | grep -q .; then
    STATUS=$(docker inspect --format '{{.State.Health.Status}}' $BACKEND_CONTAINER 2>/dev/null || echo "unknown")
    if [ "$STATUS" = "healthy" ]; then
        ok "Backend container running and healthy"
    else
        issue WARN "Backend container running but health=$STATUS"
    fi
    RESTART_COUNT=$(docker inspect --format '{{.RestartCount}}' $BACKEND_CONTAINER 2>/dev/null || echo 0)
    if [ "$RESTART_COUNT" -gt 5 ]; then
        issue WARN "Backend container has restarted $RESTART_COUNT times"
    else
        ok "Backend restart count: $RESTART_COUNT"
    fi
else
    issue CRIT "Backend container NOT running"
fi

# ─── 2. Sequence health (early warning for ID-collision bug) ────────
# ticket_service.py allocates IDs via MAX(id)+1 inside pg_advisory_xact_lock
# instead of nextval(). The pattern is intentional and safe (the advisory
# lock serializes concurrent inserts), but it never advances the underlying
# sequence — so SEQ_VAL drifts below MAX(id) forever. We detect that pattern
# in the running container and downgrade the check to informational, since
# no code path that touches the sequence exists. If the codebase migrates to
# nextval() later, the detection flips off and the CRIT becomes meaningful.
echo ""
echo "── Sequence health (early warning for ID-collision bug) ──"
USES_MAX_PLUS_ONE=false
if docker exec $BACKEND_CONTAINER grep -qE 'next_(ticket|item)_id' /app/app/services/ticket_service.py 2>/dev/null; then
    USES_MAX_PLUS_ONE=true
fi
for tbl in tickets ticket_items; do
    SEQ=$($PSQL_CMD -d $DB_NAME -t -A -c "SELECT pg_get_serial_sequence('public.$tbl', 'id');" 2>/dev/null)
    if [ -z "$SEQ" ]; then continue; fi
    SEQ_VAL=$($PSQL_CMD -d $DB_NAME -t -A -c "SELECT last_value FROM $SEQ;" 2>/dev/null)
    MAX_ID=$($PSQL_CMD -d $DB_NAME -t -A -c "SELECT COALESCE(MAX(id), 0) FROM $tbl;" 2>/dev/null)
    if [ -z "$SEQ_VAL" ] || [ -z "$MAX_ID" ]; then continue; fi
    if [ "$SEQ_VAL" -lt "$MAX_ID" ]; then
        if [ "$USES_MAX_PLUS_ONE" = "true" ]; then
            ok "$tbl: seq=$SEQ_VAL < max=$MAX_ID (expected — code uses MAX+1+advisory_lock, no nextval call)"
        else
            issue CRIT "$tbl: sequence ($SEQ_VAL) is BELOW MAX(id) ($MAX_ID) — next INSERT will crash with duplicate key!"
        fi
    else
        ok "$tbl: sequence=$SEQ_VAL, max(id)=$MAX_ID, gap=$((SEQ_VAL - MAX_ID))"
    fi
done

# ─── 3. Replication health (Server 2 only) ───────────────────────────────
if [ "$SUBSCRIPTIONS_CHECK" = "true" ]; then
    echo ""
    echo "── Replication health ──"
    for SUB in ssmspl_sub admin_sub; do
        DB_FOR_SUB=$DB_NAME
        [ "$SUB" = "ssmspl_sub" ] && DB_FOR_SUB="ssmspl_sync"
        EXISTS=$($PSQL_CMD -d $DB_FOR_SUB -t -A -c "SELECT count(*) FROM pg_subscription WHERE subname='$SUB';" 2>/dev/null)
        if [ "$EXISTS" != "1" ]; then
            issue CRIT "Subscription $SUB does NOT exist"
            continue
        fi
        ENABLED=$($PSQL_CMD -d $DB_FOR_SUB -t -A -c "SELECT subenabled FROM pg_subscription WHERE subname='$SUB';" 2>/dev/null)
        if [ "$ENABLED" != "t" ]; then
            issue CRIT "Subscription $SUB is DISABLED"
            continue
        fi
        PID=$($PSQL_CMD -d $DB_FOR_SUB -t -A -c "SELECT COALESCE(pid::text, '') FROM pg_stat_subscription WHERE subname='$SUB';" 2>/dev/null)
        if [ -z "$PID" ]; then
            issue CRIT "Subscription $SUB worker is DEAD (no PID — likely crash-looping)"
            continue
        fi
        LAG=$($PSQL_CMD -d $DB_FOR_SUB -t -A -c "SELECT COALESCE(EXTRACT(EPOCH FROM (now() - latest_end_time))::int, 0) FROM pg_stat_subscription WHERE subname='$SUB';" 2>/dev/null)
        if [ "$LAG" -gt 600 ] 2>/dev/null; then
            issue WARN "Subscription $SUB lag is ${LAG}s (>10 min)"
        else
            ok "$SUB: alive, ${LAG}s lag"
        fi
    done
fi

# ─── 4. Backend error rate ───────────────────────────────────────────────
echo ""
echo "── Backend errors (last 1 hour) ──"
ERRORS=$(docker logs $BACKEND_CONTAINER --since 1h 2>&1 | grep -ciE 'error|traceback|exception' 2>/dev/null | head -1 | tr -dc '0-9')
ERRORS=${ERRORS:-0}
if [ "$ERRORS" -gt 50 ] 2>/dev/null; then
    issue CRIT "$ERRORS errors in last hour (>50)"
elif [ "$ERRORS" -gt 10 ] 2>/dev/null; then
    issue WARN "$ERRORS errors in last hour"
else
    ok "$ERRORS errors in last hour"
fi

# ─── 5. Disk + memory ─────────────────────────────────────────────────────
echo ""
echo "── System resources ──"
DISK_USED=$(df / | awk 'NR==2 {print $5}' | tr -d '%')
if [ "$DISK_USED" -gt 90 ]; then
    issue CRIT "Disk usage at ${DISK_USED}% (>90%)"
elif [ "$DISK_USED" -gt 75 ]; then
    issue WARN "Disk usage at ${DISK_USED}%"
else
    ok "Disk usage: ${DISK_USED}%"
fi

MEM_PCT=$(free | awk '/^Mem:/ {printf "%.0f", $3/$2*100}')
if [ "$MEM_PCT" -gt 90 ]; then
    issue WARN "Memory usage at ${MEM_PCT}%"
else
    ok "Memory usage: ${MEM_PCT}%"
fi

# ─── 6. DB connections ────────────────────────────────────────────────────
echo ""
echo "── DB connection saturation ──"
CONNECTIONS=$($PSQL_CMD -t -A -c "SELECT count(*) FROM pg_stat_activity;" 2>/dev/null)
MAX_CONN=$($PSQL_CMD -t -A -c "SELECT setting FROM pg_settings WHERE name='max_connections';" 2>/dev/null)
if [ -n "$CONNECTIONS" ] && [ -n "$MAX_CONN" ]; then
    PCT=$((CONNECTIONS * 100 / MAX_CONN))
    if [ "$PCT" -gt 80 ]; then
        issue WARN "DB connections at $CONNECTIONS/$MAX_CONN (${PCT}%)"
    else
        ok "DB connections: $CONNECTIONS/$MAX_CONN (${PCT}%)"
    fi
fi

# ─── 7. ID-allocation pattern in running container (informational) ────────
# MAX+1 + pg_advisory_xact_lock is the accepted pattern in ticket_service.
# This block reports which pattern the live container is on — useful for
# noticing accidental code regressions, but never an issue by itself.
echo ""
echo "── ID-allocation pattern (ticket_service.py) ──"
PATTERN_REFS=$(docker exec $BACKEND_CONTAINER grep -c 'next_item_id\|next_ticket_id' /app/app/services/ticket_service.py 2>/dev/null || echo "skip")
if [ "$PATTERN_REFS" = "skip" ]; then
    ok "Container not accessible for code check (skipping)"
elif [ "$PATTERN_REFS" -gt 0 ]; then
    ok "Container uses MAX+1+advisory_lock pattern ($PATTERN_REFS refs) — sequence drift is expected"
else
    ok "Container uses sequence-based ID allocation (nextval)"
fi

# ─── 8. Ticketing freshness ──────────────────────────────────────────────
echo ""
echo "── Ticketing freshness (proves ticket creation works) ──"
LATEST_TICKET=$($PSQL_CMD -d $DB_NAME -t -A -c "SELECT EXTRACT(EPOCH FROM (now() - max(created_at)))::int FROM tickets;" 2>/dev/null | head -1 | tr -dc '0-9')
LATEST_TICKET=${LATEST_TICKET:-0}
if [ "$LATEST_TICKET" -gt 0 ] 2>/dev/null; then
    if [ "$LATEST_TICKET" -gt 7200 ] 2>/dev/null; then
        # Only worry about "no recent tickets" during business hours (9am-9pm IST)
        HOUR_IST=$(TZ=Asia/Kolkata date +%H)
        if [ "$HOUR_IST" -ge 9 ] && [ "$HOUR_IST" -le 21 ]; then
            issue WARN "No tickets created in last $((LATEST_TICKET / 60)) minutes during business hours"
        else
            ok "Last ticket ${LATEST_TICKET}s ago (off hours, expected)"
        fi
    else
        ok "Last ticket ${LATEST_TICKET}s ago"
    fi
fi

# ─── Email alerting (only CRIT-level issues trigger email; WARN logged only) ─
CRIT_COUNT=$(printf '%s\n' "${ISSUES[@]}" 2>/dev/null | grep -c '\[CRIT\]' | head -1 | tr -dc '0-9')
CRIT_COUNT=${CRIT_COUNT:-0}

echo ""
echo "── Summary ──"
if [ ${#ISSUES[@]} -eq 0 ]; then
    echo "✓ ALL HEALTHY ($SERVER_NAME at $TS)"
    if [ -f "$STATE" ]; then
        # Was unhealthy, now healthy → send recovery email
        if [ -n "${SMTP_HOST:-}" ] && [ -n "${ALERT_TO:-}" ]; then
            python3 - <<PYEOF 2>/dev/null
import os, smtplib, ssl
from email.message import EmailMessage
m = EmailMessage()
m['Subject'] = '[SSMSPL] $SERVER_NAME RECOVERED'
m['From'] = '$SMTP_USER'
m['To'] = '$ALERT_TO'
m.set_content('All checks passing again at $TS')
with smtplib.SMTP('$SMTP_HOST', $SMTP_PORT) as s:
    s.starttls(context=ssl.create_default_context())
    s.login('$SMTP_USER', '$SMTP_PASSWORD')
    s.send_message(m)
PYEOF
        fi
        rm -f "$STATE"
    fi
    exit 0
fi

echo "✗ ${#ISSUES[@]} ISSUES found ($CRIT_COUNT CRIT)"
SUMMARY=$(printf '%s\n' "${ISSUES[@]}")

# State-based deduplication — only email if the SET of distinct problems
# changes. Compare on a stable signature: severity + the leading words of
# each issue with all numbers stripped. Without this, a CRIT like
# "N errors in last hour" produces a fresh signature every minute as the
# error count climbs — that's how 36 emails went out during the /me-500
# storm. The signature is also lowercased to ignore stylistic drift.
SIGNATURE=$(printf '%s\n' "${ISSUES[@]}" \
    | sed -E 's/[0-9]+//g; s/[[:space:]]+/ /g' \
    | tr '[:upper:]' '[:lower:]' \
    | sort -u)
LAST_STATE=$(cat "$STATE" 2>/dev/null || echo "")
if [ "$SIGNATURE" = "$LAST_STATE" ]; then
    echo "(same problems as previous alert — not re-sending email)"
    exit 1
fi
echo "$SIGNATURE" > "$STATE"

echo "[$TS] $SERVER_NAME — ${#ISSUES[@]} issues ($CRIT_COUNT crit)" >> $LOG 2>/dev/null
printf '%s\n' "${ISSUES[@]}" >> $LOG 2>/dev/null

# Only email on CRIT-level issues to avoid alert fatigue (WARN logged only)
if [ "$CRIT_COUNT" -gt 0 ] 2>/dev/null && [ -n "${SMTP_HOST:-}" ] && [ -n "${ALERT_TO:-}" ]; then
    BODY="$SERVER_NAME health check ($TS)

${#ISSUES[@]} issues detected:

$SUMMARY

Investigate on the server:
  ssh \$(hostname)
  bash $0 --verbose

Recent backend logs:
  docker logs $BACKEND_CONTAINER --tail 50

Replication state (Server 2 only):
  sudo -u postgres psql -d ssmspl_admin -c 'SELECT * FROM pg_stat_subscription;'
"
    SUBJECT="[SSMSPL] $SERVER_NAME — ${#ISSUES[@]} issues"
    SMTP_HOST="$SMTP_HOST" SMTP_PORT="$SMTP_PORT" SMTP_USER="$SMTP_USER" \
    SMTP_PASSWORD="$SMTP_PASSWORD" ALERT_TO="$ALERT_TO" \
    SUBJECT="$SUBJECT" BODY="$BODY" python3 - <<'PYEOF' 2>&1 | tail -2
import os, smtplib, ssl
from email.message import EmailMessage
m = EmailMessage()
m['Subject'] = os.environ['SUBJECT']
m['From'] = os.environ['SMTP_USER']
m['To'] = os.environ['ALERT_TO']
m.set_content(os.environ['BODY'])
with smtplib.SMTP(os.environ['SMTP_HOST'], int(os.environ['SMTP_PORT'])) as s:
    s.starttls(context=ssl.create_default_context())
    s.login(os.environ['SMTP_USER'], os.environ['SMTP_PASSWORD'])
    s.send_message(m)
print('Alert email sent')
PYEOF
fi

# ─── SuperAdmin mobile app — push notification via /api/system-health/events ─
# Configured via /etc/ssmspl_monitor.conf (or ~/.config/ssmspl_monitor.conf):
#   HEALTH_INGEST_URL=https://admin.carferry.online/api/system-health/events
#   HEALTH_INGEST_SECRET=<same value as backend's HEALTH_INGEST_SECRET env>
# Same dedup state as email — won't re-fire if issue list is unchanged.
if [ "$CRIT_COUNT" -gt 0 ] 2>/dev/null && [ -n "${HEALTH_INGEST_URL:-}" ] && [ -n "${HEALTH_INGEST_SECRET:-}" ]; then
    if [[ "$SERVER_NAME" == *"Server 1"* ]]; then
        SERVER_ID="server-1-prod"
    else
        SERVER_ID="server-2-admin"
    fi
    FIRST_CRIT=$(printf '%s\n' "${ISSUES[@]}" | grep '\[CRIT\]' | head -1 | sed 's/^\[CRIT\] //' | head -c 200)
    JSON=$(SERVER_ID="$SERVER_ID" FIRST_CRIT="$FIRST_CRIT" \
           CRIT_COUNT="$CRIT_COUNT" TOTAL="${#ISSUES[@]}" \
           ALL_ISSUES="$SUMMARY" \
           python3 -c "
import json, os
print(json.dumps({
    'server_name': os.environ['SERVER_ID'],
    'severity': 'CRIT',
    'check_name': 'health_check.batch',
    'message': os.environ['FIRST_CRIT'] or 'health_check found CRIT issues',
    'details': {
        'crit_count': int(os.environ['CRIT_COUNT']),
        'total_issues': int(os.environ['TOTAL']),
        'all_issues': os.environ['ALL_ISSUES'][:1500],
    },
}))
")
    PUSH_RESULT=$(curl -s -m 5 -o /dev/null -w '%{http_code}' \
        -X POST \
        -H 'Content-Type: application/json' \
        -H "X-Health-Token: $HEALTH_INGEST_SECRET" \
        -d "$JSON" "$HEALTH_INGEST_URL" 2>>$LOG)
    if [ "$PUSH_RESULT" = "201" ]; then
        echo "[$TS] push event ingested OK" >> $LOG
    else
        echo "[$TS] push event ingest HTTP $PUSH_RESULT" >> $LOG
    fi
fi

# --- DIY uptime relay: push to ntfy.sh on CRIT (no EAS, no third-party signup)
# Topic configured in /etc/ssmspl_monitor.conf as NTFY_TOPIC=...
# User's phone subscribes via the free ntfy.sh Android app.
if [ "$CRIT_COUNT" -gt 0 ] 2>/dev/null && [ -n "${NTFY_TOPIC:-}" ]; then
    NTFY_BASE_URL="${NTFY_BASE:-https://ntfy.sh}"
    NTFY_TITLE="ALERT [$SERVER_ID] $CRIT_COUNT CRIT"
    FIRST_CRIT_LINE=$(printf '%s
' "${ISSUES[@]}" | grep '\[CRIT\]' | head -1 | sed 's/^\[CRIT\] //' | head -c 240)
    NTFY_HTTP=$(curl -sS -m 5 -o /dev/null -w '%{http_code}'         -H "Title: $NTFY_TITLE"         -H "Priority: max"         -H "Tags: rotating_light,warning"         -H "Click: https://carferry.online/dashboard"         -d "$FIRST_CRIT_LINE"         "$NTFY_BASE_URL/$NTFY_TOPIC" 2>>$LOG)
    if [ "$NTFY_HTTP" = "200" ]; then
        echo "[$TS] ntfy push OK ($NTFY_TOPIC)" >> $LOG
    else
        echo "[$TS] ntfy push FAILED HTTP $NTFY_HTTP" >> $LOG
    fi
fi


exit 1
