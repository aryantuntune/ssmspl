#!/bin/bash
# refresh_admin_db.sh — Full reset of ssmspl_admin from ssmspl_sync
# Run on Server 2 as root or postgres user
#
# WARNING: This script is for EMERGENCY RESETS ONLY.
# Normal operation uses cascading logical replication (ssmspl_sync → ssmspl_admin)
# which keeps ssmspl_admin in real-time sync automatically.
#
# Running this script will:
#   1. Drop and recreate the admin_sub subscription
#   2. Overwrite ALL data in ssmspl_admin (including admin edits)
#   3. Restore real-time replication afterward
#
# Usage:
#   sudo ./refresh_admin_db.sh
#
# Only run this if:
#   - Replication is broken and cannot be repaired
#   - ssmspl_admin has become corrupted
#   - You explicitly want to discard all admin edits

set -euo pipefail

SYNC_DB="ssmspl_sync"
ADMIN_DB="ssmspl_admin"
ADMIN_USER="ssmspl_admin_user"
DUMP_FILE="/tmp/ssmspl_sync_dump_$(date +%Y%m%d_%H%M%S).sql"

echo "[$(date)] === EMERGENCY RESET: $SYNC_DB → $ADMIN_DB ==="
echo "[$(date)] WARNING: This will overwrite all admin edits and reset replication."
echo "[$(date)] Waiting 5 seconds — press Ctrl+C to abort..."
sleep 5

# Step 1: Stop admin containers to free DB connections
echo "[$(date)] Stopping admin containers..."
docker stop admin-backend admin-frontend 2>/dev/null || true

# Step 2: Drop existing subscription (if any)
echo "[$(date)] Dropping existing subscription..."
sudo -u postgres psql -d "$ADMIN_DB" -c "
    ALTER SUBSCRIPTION admin_sub DISABLE;
    ALTER SUBSCRIPTION admin_sub SET (slot_name = NONE);
    DROP SUBSCRIPTION admin_sub;
" 2>/dev/null || true
# Drop the replication slot in ssmspl_sync
sudo -u postgres psql -d "$SYNC_DB" -c "
    SELECT pg_drop_replication_slot('admin_sub');
" 2>/dev/null || true

# Step 3: Dump ssmspl_sync (excluding replication objects)
echo "[$(date)] Dumping $SYNC_DB..."
sudo -u postgres pg_dump -d "$SYNC_DB" \
    --no-owner --no-privileges \
    --clean --if-exists \
    --no-publications --no-subscriptions \
    > "$DUMP_FILE"

DUMP_SIZE=$(du -h "$DUMP_FILE" | cut -f1)
echo "[$(date)] Dump complete: $DUMP_FILE ($DUMP_SIZE)"

# Step 4: Restore into ssmspl_admin
echo "[$(date)] Restoring into $ADMIN_DB..."
ERRORS=$(sudo -u postgres psql -d "$ADMIN_DB" -f "$DUMP_FILE" 2>&1 | grep -cE "^(ERROR|FATAL)" || true)
if [ "$ERRORS" -gt 0 ]; then
    echo "[$(date)] WARNING: $ERRORS error(s) during restore — check logs"
fi

# Step 5: Re-grant permissions to admin user
echo "[$(date)] Re-granting permissions to $ADMIN_USER..."
sudo -u postgres psql -d "$ADMIN_DB" -c "GRANT ALL ON ALL TABLES IN SCHEMA public TO $ADMIN_USER;"
sudo -u postgres psql -d "$ADMIN_DB" -c "GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO $ADMIN_USER;"

# Step 6: Reset all sequences to match restored data
echo "[$(date)] Resetting sequences..."
sudo -u postgres psql -d "$ADMIN_DB" -c "
DO \$\$
DECLARE
    r RECORD;
    max_val BIGINT;
BEGIN
    FOR r IN
        SELECT s.relname AS seqname, t.relname AS tablename, a.attname AS colname
        FROM pg_class s
        JOIN pg_depend d ON d.objid = s.oid
        JOIN pg_class t ON t.oid = d.refobjid
        JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = d.refobjsubid
        WHERE s.relkind = 'S'
    LOOP
        EXECUTE format('SELECT COALESCE(MAX(%I), 0) FROM %I', r.colname, r.tablename) INTO max_val;
        IF max_val > 0 THEN
            PERFORM setval(r.seqname::regclass, max_val);
        END IF;
    END LOOP;
END \$\$;
"

# Step 6b: Offset sequences for locally-written tables to prevent ID collisions with replicated data
echo "[$(date)] Offsetting admin-local sequences to 10M+..."
sudo -u postgres psql -d "$ADMIN_DB" -c "
    SELECT setval('user_sessions_id_seq', GREATEST(nextval('user_sessions_id_seq'), 10000000));
    SELECT setval('user_activity_logs_id_seq', GREATEST(nextval('user_activity_logs_id_seq'), 10000000));
    SELECT setval('daily_report_log_id_seq', GREATEST(nextval('daily_report_log_id_seq'), 10000000));
    SELECT setval('rate_change_logs_id_seq', GREATEST(nextval('rate_change_logs_id_seq'), 10000000));
    SELECT setval('sys_update_logs_id_seq', GREATEST(nextval('sys_update_logs_id_seq'), 10000000));
    SELECT setval('admin_screen_toggles_id_seq', GREATEST(nextval('admin_screen_toggles_id_seq'), 10000000));
"

# Step 7: Recreate cascading replication (ssmspl_sync → ssmspl_admin)
echo "[$(date)] Re-creating replication slot..."
sudo -u postgres psql -d "$SYNC_DB" -c "SELECT pg_create_logical_replication_slot('admin_sub', 'pgoutput');"

echo "[$(date)] Re-creating subscription..."
sudo -u postgres psql -d "$ADMIN_DB" -c "
    CREATE SUBSCRIPTION admin_sub
    CONNECTION 'dbname=ssmspl_sync host=/var/run/postgresql'
    PUBLICATION admin_pub
    WITH (copy_data = false, create_slot = false, slot_name = 'admin_sub');
"

# Step 8: Post-restore health check
echo "[$(date)] Verifying..."
TABLE_COUNT=$(sudo -u postgres psql -d "$ADMIN_DB" -t -c "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE';")
SYNC_TICKETS=$(sudo -u postgres psql -d "$SYNC_DB" -t -c "SELECT count(*) FROM tickets;")
ADMIN_TICKETS=$(sudo -u postgres psql -d "$ADMIN_DB" -t -c "SELECT count(*) FROM tickets;")
echo "[$(date)] Tables: $TABLE_COUNT | Sync tickets: $SYNC_TICKETS | Admin tickets: $ADMIN_TICKETS"

SUB_STATUS=$(sudo -u postgres psql -d "$ADMIN_DB" -t -c "SELECT pid FROM pg_stat_subscription WHERE subname='admin_sub';")
if [ -n "$SUB_STATUS" ]; then
    echo "[$(date)] Replication: ACTIVE (worker PID: $SUB_STATUS)"
else
    echo "[$(date)] WARNING: Replication worker not started — check pg logs"
fi

# Step 9: Restart admin containers
echo "[$(date)] Restarting admin containers..."
docker start admin-backend admin-frontend

# Step 10: Cleanup
rm -f "$DUMP_FILE"

echo "[$(date)] === Reset complete ==="
