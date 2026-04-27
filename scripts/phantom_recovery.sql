-- ═══════════════════════════════════════════════════════════════════════
-- PHANTOM RECOVERY SCRIPT (Option A — preserve admin work + restore prod data)
-- ═══════════════════════════════════════════════════════════════════════
--
-- WHAT IT DOES (all inside one transaction):
--   1. Creates admin_phantom_recovery_backup table (full rollback safety net)
--   2. Materializes conflict data into a temp table (phantom + matching prod row)
--   3. For each conflict (~23-24 rows):
--      a. INSERT phantom copy at new high ID (1B+) preserving ALL metadata
--         (timestamps, ticket_id, qty, rate, etc.) → admin's adjustment moves to safe ID
--      b. DELETE the original phantom at the low conflict ID
--      c. INSERT prod's data at the now-free low conflict ID, preserving
--         original prod timestamps (created_at = prod's actual sale moment)
--      d. Backup table records both old and new state for rollback
--   4. Recompute tickets.amount + tickets.net_amount for prod tickets that
--      gained items (yogesh's old tickets unchanged — luggage just moved IDs,
--      sum of item values stays the same)
--   5. Show before/after summary
--   6. WAITS for COMMIT or ROLLBACK from human operator
--
-- WHY DATES STAY CORRECT:
--   - Phantom rows keep their original ticket_id (yogesh's old tickets like
--     28722 from Apr 9). Reports group by parent ticket date → reports stay
--     on Apr 9 for these.
--   - Restored prod rows keep prod's original ticket_id (recent tickets like
--     86206 from Apr 26). Reports show them on Apr 26.
--   - All created_at timestamps preserved verbatim from source.
--
-- ROLLBACK SAFETY:
--   - Runs in BEGIN ... (you decide) COMMIT/ROLLBACK
--   - admin_phantom_recovery_backup table preserves everything for forensic
--     reversal even after COMMIT.
--   - Skip trigger left in place — will catch any unexpected re-collision.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1. BACKUP TABLE ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admin_phantom_recovery_backup (
    backup_id BIGSERIAL PRIMARY KEY,
    backed_up_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    conflict_id BIGINT NOT NULL,
    phantom_new_id BIGINT,                  -- new high ID where phantom was moved
    phantom_original JSONB NOT NULL,        -- yogesh's row before move
    prod_inserted JSONB NOT NULL,           -- prod's row before insert (source of truth)
    parent_ticket_admin BIGINT,             -- yogesh's parent ticket (e.g., 28722)
    parent_ticket_prod BIGINT,              -- prod's parent ticket (e.g., 86206)
    notes TEXT
);

-- Bump backup table sequence to safety zone (admin-local table)
SELECT setval('admin_phantom_recovery_backup_backup_id_seq', GREATEST(nextval('admin_phantom_recovery_backup_backup_id_seq'), 1000000000));

-- ─── 2. MATERIALIZE CONFLICTS ──────────────────────────────────────────
-- Single dblink query into a temp table so we don't repeat the cross-DB call
CREATE TEMP TABLE _recovery_data AS
SELECT
    a.id                          AS conflict_id,
    -- Phantom (admin) full row data
    a.ticket_id                   AS p_tkt,
    a.item_id                     AS p_item,
    a.rate                        AS p_rate,
    a.levy                        AS p_levy,
    a.quantity                    AS p_qty,
    a.vehicle_no                  AS p_veh_no,
    a.vehicle_name                AS p_veh_name,
    a.is_cancelled                AS p_cancelled,
    a.created_at                  AS p_created,
    a.updated_at                  AS p_updated,
    a.created_by                  AS p_creator,
    a.updated_by                  AS p_updater,
    a.last_adjustment_id          AS p_adj,
    a.item_name_snapshot          AS p_item_snap,
    a.item_short_name_snapshot    AS p_short_snap,
    -- Prod (sync) full row data
    s.ticket_id                   AS x_tkt,
    s.item_id                     AS x_item,
    s.rate                        AS x_rate,
    s.levy                        AS x_levy,
    s.quantity                    AS x_qty,
    s.vehicle_no                  AS x_veh_no,
    s.vehicle_name                AS x_veh_name,
    s.is_cancelled                AS x_cancelled,
    s.created_at                  AS x_created,
    s.updated_at                  AS x_updated,
    s.created_by                  AS x_creator,
    s.updated_by                  AS x_updater,
    s.item_name_snapshot          AS x_item_snap,
    s.item_short_name_snapshot    AS x_short_snap
FROM ticket_items a
JOIN dblink(
    'dbname=ssmspl_sync',
    'SELECT id, ticket_id, item_id, rate, levy, quantity, vehicle_no, vehicle_name, is_cancelled, created_at, updated_at, created_by, updated_by, item_name_snapshot, item_short_name_snapshot FROM ticket_items'
) AS s(
    id bigint, ticket_id bigint, item_id int, rate numeric, levy numeric,
    quantity int, vehicle_no varchar, vehicle_name varchar, is_cancelled boolean,
    created_at timestamptz, updated_at timestamptz, created_by uuid, updated_by uuid,
    item_name_snapshot varchar, item_short_name_snapshot varchar
) ON s.id = a.id
WHERE a.id BETWEEN 117000 AND 200000
  AND NOT (a.ticket_id = s.ticket_id AND a.quantity = s.quantity AND a.item_id = s.item_id);

\echo
\echo '── Conflicts found ──'
SELECT count(*) AS conflicts_to_process,
       sum((p_rate + p_levy) * p_qty)::numeric(12,2) AS total_phantom_value,
       sum((x_rate + x_levy) * x_qty)::numeric(12,2) AS total_prod_value_to_restore
FROM _recovery_data;

\echo
\echo '── Affected admin (yogesh) parent tickets ──'
SELECT count(DISTINCT p_tkt) AS yogesh_tickets FROM _recovery_data;

\echo
\echo '── Affected prod parent tickets that will gain items ──'
SELECT count(DISTINCT x_tkt) AS prod_tickets_restored FROM _recovery_data;

-- ─── 3. PER-CONFLICT PROCESSING (the actual work) ───────────────────────
DO $$
DECLARE
    r RECORD;
    new_phantom_id BIGINT;
BEGIN
    FOR r IN SELECT * FROM _recovery_data ORDER BY conflict_id LOOP

        -- 3a. Backup BEFORE any change
        INSERT INTO admin_phantom_recovery_backup (
            conflict_id, phantom_original, prod_inserted,
            parent_ticket_admin, parent_ticket_prod, notes
        ) VALUES (
            r.conflict_id,
            jsonb_build_object(
                'id', r.conflict_id, 'ticket_id', r.p_tkt, 'item_id', r.p_item,
                'rate', r.p_rate, 'levy', r.p_levy, 'quantity', r.p_qty,
                'vehicle_no', r.p_veh_no, 'vehicle_name', r.p_veh_name,
                'is_cancelled', r.p_cancelled, 'created_at', r.p_created::text,
                'updated_at', r.p_updated::text, 'created_by', r.p_creator,
                'updated_by', r.p_updater, 'last_adjustment_id', r.p_adj,
                'item_name_snapshot', r.p_item_snap,
                'item_short_name_snapshot', r.p_short_snap
            ),
            jsonb_build_object(
                'id', r.conflict_id, 'ticket_id', r.x_tkt, 'item_id', r.x_item,
                'rate', r.x_rate, 'levy', r.x_levy, 'quantity', r.x_qty,
                'vehicle_no', r.x_veh_no, 'vehicle_name', r.x_veh_name,
                'is_cancelled', r.x_cancelled, 'created_at', r.x_created::text,
                'updated_at', r.x_updated::text, 'created_by', r.x_creator,
                'updated_by', r.x_updater,
                'item_name_snapshot', r.x_item_snap,
                'item_short_name_snapshot', r.x_short_snap
            ),
            r.p_tkt, r.x_tkt,
            'Option A recovery — phantom moved to high ID, prod data restored'
        );

        -- 3b. INSERT yogesh's phantom at a NEW high ID (sequence at 1B+ from earlier setup)
        --     preserving ALL original fields (created_at, ticket_id, qty, etc.)
        INSERT INTO ticket_items (
            ticket_id, item_id, rate, levy, vehicle_no, vehicle_name,
            is_cancelled, quantity, created_at, updated_at,
            created_by, updated_by, item_name_snapshot,
            item_short_name_snapshot, last_adjustment_id
        ) VALUES (
            r.p_tkt, r.p_item, r.p_rate, r.p_levy, r.p_veh_no, r.p_veh_name,
            r.p_cancelled, r.p_qty, r.p_created, r.p_updated,
            r.p_creator, r.p_updater, r.p_item_snap,
            r.p_short_snap, r.p_adj
        ) RETURNING id INTO new_phantom_id;

        -- 3c. Record the new ID in backup
        UPDATE admin_phantom_recovery_backup
        SET phantom_new_id = new_phantom_id
        WHERE conflict_id = r.conflict_id AND phantom_new_id IS NULL;

        -- 3d. DELETE the phantom at the conflict ID (frees it for prod data)
        DELETE FROM ticket_items WHERE id = r.conflict_id;

        -- 3e. INSERT prod's data at the now-free conflict ID with original metadata
        INSERT INTO ticket_items (
            id, ticket_id, item_id, rate, levy, vehicle_no, vehicle_name,
            is_cancelled, quantity, created_at, updated_at,
            created_by, updated_by, item_name_snapshot,
            item_short_name_snapshot, last_adjustment_id
        ) VALUES (
            r.conflict_id, r.x_tkt, r.x_item, r.x_rate, r.x_levy,
            r.x_veh_no, r.x_veh_name, r.x_cancelled, r.x_qty,
            r.x_created, r.x_updated, r.x_creator, r.x_updater,
            r.x_item_snap, r.x_short_snap, NULL
        );

    END LOOP;
END $$;

-- ─── 4. RECOMPUTE tickets.amount + net_amount for prod tickets that gained items ───
-- (yogesh's old tickets are unchanged — luggage just moved IDs, sum stays same)
UPDATE tickets t
SET
    amount     = COALESCE(items.sum_amount, 0),
    net_amount = COALESCE(items.sum_amount, 0) - COALESCE(t.discount, 0)
FROM (
    SELECT ticket_id, SUM((rate + levy) * quantity) AS sum_amount
    FROM ticket_items
    WHERE is_cancelled = false
    GROUP BY ticket_id
) items
WHERE t.id = items.ticket_id
  AND t.id IN (SELECT DISTINCT x_tkt FROM _recovery_data);

-- ─── 5. VERIFICATION ────────────────────────────────────────────────────
\echo
\echo '═══════════════════════════ VERIFICATION ═══════════════════════════'

\echo
\echo '── Backup table — should match conflicts count ──'
SELECT count(*) AS rows_backed_up FROM admin_phantom_recovery_backup;

\echo
\echo '── New phantom locations (1B+ range) ──'
SELECT count(*) AS phantoms_at_safe_ids FROM admin_phantom_recovery_backup WHERE phantom_new_id >= 1000000000;

\echo
\echo '── Restored prod data at original IDs — should equal sync ──'
SELECT count(*) AS conflicts_now_match_sync
FROM ticket_items a
JOIN dblink('dbname=ssmspl_sync',
    'SELECT id, ticket_id, item_id, quantity FROM ticket_items')
    AS s(id bigint, ticket_id bigint, item_id int, quantity int)
ON s.id = a.id
WHERE a.id IN (SELECT conflict_id FROM admin_phantom_recovery_backup WHERE backed_up_at > now() - interval '5 minutes')
  AND a.ticket_id = s.ticket_id AND a.item_id = s.item_id AND a.quantity = s.quantity;

\echo
\echo '── Yogesh tickets total value (should be UNCHANGED) ──'
SELECT t.id, t.ticket_no, t.amount, t.ticket_date,
       (SELECT count(*) FROM ticket_items WHERE ticket_id = t.id AND NOT is_cancelled) AS items_count
FROM tickets t
WHERE t.id IN (SELECT DISTINCT parent_ticket_admin FROM admin_phantom_recovery_backup WHERE backed_up_at > now() - interval '5 minutes')
ORDER BY t.id LIMIT 5;

\echo
\echo '── Prod tickets that gained items — should have correct totals now ──'
SELECT t.id, t.ticket_no, t.amount, t.ticket_date,
       (SELECT count(*) FROM ticket_items WHERE ticket_id = t.id AND NOT is_cancelled) AS items_count
FROM tickets t
WHERE t.id IN (SELECT DISTINCT parent_ticket_prod FROM admin_phantom_recovery_backup WHERE backed_up_at > now() - interval '5 minutes')
ORDER BY t.id LIMIT 5;

\echo
\echo '═══════════════════════════════════════════════════════════════════'
\echo 'TRANSACTION OPEN. Review the verification above.'
\echo
\echo 'To accept:  COMMIT;'
\echo 'To revert:  ROLLBACK;'
\echo '═══════════════════════════════════════════════════════════════════'
