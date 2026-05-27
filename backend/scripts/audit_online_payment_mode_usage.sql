-- ============================================================================
-- audit_online_payment_mode_usage.sql
-- ----------------------------------------------------------------------------
-- READ-ONLY audit of payment_modes.id = 4 ("Online", show_at_pos = FALSE)
-- usage in production. No DDL, no DML, no temp tables. Only SELECTs.
--
-- Context
-- -------
-- Online is a portal-only payment mode. After a recent fix in
-- backend/app/services/ticket_service.py, _validate_references and
-- update_ticket now reject any cashier-side write whose target
-- payment_mode_id has show_at_pos=FALSE. Existing data may still carry
-- spillover from before the guard was in place — this script measures
-- that historical leak.
--
-- How to run on Server 1 (carferry.online):
--   cd /var/www/ssmspl
--   docker compose -f docker-compose.prod.yml exec -T db psql \
--     -U ssmspl_user -d ssmspl_db_prod < backend/scripts/audit_online_payment_mode_usage.sql
--
-- To capture output to a file:
--   docker compose -f docker-compose.prod.yml exec -T db psql \
--     -U ssmspl_user -d ssmspl_db_prod \
--     < backend/scripts/audit_online_payment_mode_usage.sql \
--     > /tmp/online_pm_audit_$(date +%F).txt 2>&1
--
-- The -T flag (no TTY) is required so the redirected stdin pipes cleanly.
-- ============================================================================

\timing on
\pset border 2

-- Sanity: confirm the payment_modes catalogue still matches the assumption.
\echo '────────────────────────────────────────────────────────────────────────'
\echo 'PRECHECK: payment_modes catalog (id, description, is_active, show_at_pos)'
\echo '  Expect: 1=Cash T/T, 2=UPI T/T, 3=Card T/T, 4=Online T/F'
\echo '────────────────────────────────────────────────────────────────────────'
SELECT id, description, is_active, show_at_pos
FROM payment_modes
ORDER BY id;


-- ┌────────────────────────────────────────────────────────────────────────┐
-- │ QUERY 1                                                                │
-- │ Count tickets with payment_mode_id=4 grouped by created_by user,       │
-- │ joined to users to surface username + role.                            │
-- │                                                                        │
-- │ Interpretation:                                                        │
-- │ - rows where users.id IS NOT NULL  → ticket created by a known staff   │
-- │   user (SPILLOVER — staff should never produce Online tickets).        │
-- │ - rows where users.id IS NULL      → created_by holds a random UUID    │
-- │   (default uuid_generate_v4 in DDL line 223). Either a portal/admin    │
-- │   path that didn't pass user_id, or a deleted user. Cross-check        │
-- │   query 2 for transaction orphan status.                               │
-- └────────────────────────────────────────────────────────────────────────┘
\echo ''
\echo '────────────────────────────────────────────────────────────────────────'
\echo 'Q1: tickets w/ payment_mode_id=4 BY CREATED_BY USER (staff spillover)'
\echo '────────────────────────────────────────────────────────────────────────'
SELECT
    t.created_by                                          AS created_by_uuid,
    u.username,
    u.role,
    COUNT(*)                                              AS ticket_count,
    MIN(t.created_at)                                     AS first_seen,
    MAX(t.created_at)                                     AS last_seen
FROM tickets t
LEFT JOIN users u ON u.id = t.created_by
WHERE t.payment_mode_id = 4
GROUP BY t.created_by, u.username, u.role
ORDER BY ticket_count DESC, last_seen DESC;


-- ┌────────────────────────────────────────────────────────────────────────┐
-- │ QUERY 2                                                                │
-- │ Tickets with payment_mode_id=4 that have NO matching                   │
-- │ payment_transactions row.                                              │
-- │                                                                        │
-- │ Online tickets are produced when a booking's payment succeeds and the  │
-- │ portal converts the booking → ticket. payment_transactions is keyed    │
-- │ by booking_id, not ticket_id, so the linkage is indirect:              │
-- │   tickets ↔ (ref_no / verification_code / booking_no via branch+date)  │
-- │ The cleanest cross-check is: every legitimate Online ticket should     │
-- │ correspond to AT LEAST one bookings row whose payment_transactions     │
-- │ status = 'SUCCESS'. Tickets that fail that linkage are spillover.      │
-- │                                                                        │
-- │ We approximate by joining tickets → bookings on                        │
-- │   (branch_id, ticket_date, route_id) AND comparable amounts            │
-- │ then LEFT JOIN to payment_transactions and flag rows where             │
-- │ pt.id IS NULL or pt.status <> 'SUCCESS'.                               │
-- └────────────────────────────────────────────────────────────────────────┘
\echo ''
\echo '────────────────────────────────────────────────────────────────────────'
\echo 'Q2: payment_mode_id=4 tickets w/ NO SUCCESS payment_transactions row'
\echo '    (joined heuristically by branch+date+route+amount → booking → tx)'
\echo '────────────────────────────────────────────────────────────────────────'
SELECT
    t.id                                                  AS ticket_id,
    t.ticket_no,
    t.branch_id,
    t.ticket_date,
    t.amount,
    t.net_amount,
    t.ref_no,
    t.created_at,
    t.created_by                                          AS created_by_uuid,
    u.username                                            AS created_by_username,
    b.id                                                  AS matched_booking_id,
    pt.status                                             AS tx_status,
    pt.client_txn_id
FROM tickets t
LEFT JOIN users u ON u.id = t.created_by
LEFT JOIN bookings b
       ON b.branch_id     = t.branch_id
      AND b.travel_date   = t.ticket_date
      AND b.route_id      = t.route_id
      AND b.net_amount    = t.net_amount
      AND b.payment_mode_id = 4
LEFT JOIN payment_transactions pt
       ON pt.booking_id = b.id
      AND pt.status     = 'SUCCESS'
WHERE t.payment_mode_id = 4
  AND pt.id IS NULL
ORDER BY t.created_at DESC
LIMIT 200;

-- Companion summary for Q2: just the count of orphan-Online tickets.
\echo '   ↳ Q2 summary: total orphan-Online tickets (no matching SUCCESS tx)'
SELECT COUNT(*) AS orphan_online_ticket_count
FROM tickets t
LEFT JOIN bookings b
       ON b.branch_id     = t.branch_id
      AND b.travel_date   = t.ticket_date
      AND b.route_id      = t.route_id
      AND b.net_amount    = t.net_amount
      AND b.payment_mode_id = 4
LEFT JOIN payment_transactions pt
       ON pt.booking_id = b.id
      AND pt.status     = 'SUCCESS'
WHERE t.payment_mode_id = 4
  AND pt.id IS NULL;


-- ┌────────────────────────────────────────────────────────────────────────┐
-- │ QUERY 3                                                                │
-- │ Tickets with payment_mode_id=4 grouped by created_at::date.            │
-- │ Reveals whether spillover is historical (pre-fix) or still happening.  │
-- └────────────────────────────────────────────────────────────────────────┘
\echo ''
\echo '────────────────────────────────────────────────────────────────────────'
\echo 'Q3: payment_mode_id=4 tickets BY CREATION DATE (last 180 days)'
\echo '────────────────────────────────────────────────────────────────────────'
SELECT
    (t.created_at AT TIME ZONE 'Asia/Kolkata')::date  AS created_on_ist,
    COUNT(*)                                          AS ticket_count,
    SUM(t.net_amount)                                 AS total_net_amount,
    COUNT(DISTINCT t.created_by)                      AS distinct_creators,
    -- Anyone who is a real staff user → spillover that day
    COUNT(*) FILTER (
        WHERE t.created_by IN (SELECT id FROM users)
    )                                                 AS staff_attributed_count
FROM tickets t
WHERE t.payment_mode_id = 4
  AND t.created_at >= (NOW() - INTERVAL '180 days')
GROUP BY (t.created_at AT TIME ZONE 'Asia/Kolkata')::date
ORDER BY created_on_ist DESC;


-- ┌────────────────────────────────────────────────────────────────────────┐
-- │ QUERY 4                                                                │
-- │ Bookings audit. The bookings table has no staff user_id column         │
-- │ (only portal_user_id FK → portal_users), so "staff spillover" can't    │
-- │ happen by the same vector as tickets. Two anomalies are still worth    │
-- │ surfacing:                                                             │
-- │   (a) Bookings with payment_mode_id != 4 — should never happen,        │
-- │       the portal only writes Online.                                   │
-- │   (b) Bookings with payment_mode_id = 4 whose portal_user_id is        │
-- │       orphaned (referenced row missing).                               │
-- └────────────────────────────────────────────────────────────────────────┘
\echo ''
\echo '────────────────────────────────────────────────────────────────────────'
\echo 'Q4a: bookings GROUPED BY payment_mode_id (anything not =4 is anomaly)'
\echo '────────────────────────────────────────────────────────────────────────'
SELECT
    b.payment_mode_id,
    pm.description                                     AS payment_mode_name,
    pm.show_at_pos,
    COUNT(*)                                           AS booking_count,
    MIN(b.created_at)                                  AS first_seen,
    MAX(b.created_at)                                  AS last_seen
FROM bookings b
LEFT JOIN payment_modes pm ON pm.id = b.payment_mode_id
GROUP BY b.payment_mode_id, pm.description, pm.show_at_pos
ORDER BY booking_count DESC;

\echo ''
\echo 'Q4b: bookings w/ payment_mode_id=4 BUT portal_user_id has no portal_users row'
\echo '     (FK is NOT NULL so any rows here means a deleted portal_user — odd)'
SELECT
    b.id                                               AS booking_id,
    b.booking_no,
    b.branch_id,
    b.travel_date,
    b.net_amount,
    b.portal_user_id,
    b.status,
    b.created_at
FROM bookings b
LEFT JOIN portal_users pu ON pu.id = b.portal_user_id
WHERE b.payment_mode_id = 4
  AND pu.id IS NULL
ORDER BY b.created_at DESC
LIMIT 100;


-- ┌────────────────────────────────────────────────────────────────────────┐
-- │ QUERY 5                                                                │
-- │ Distinct payment_mode_id usage in tickets / bookings over the last     │
-- │ 30 days — sanity check on what modes are actively in use today.        │
-- └────────────────────────────────────────────────────────────────────────┘
\echo ''
\echo '────────────────────────────────────────────────────────────────────────'
\echo 'Q5a: tickets — payment modes used in last 30 days'
\echo '────────────────────────────────────────────────────────────────────────'
SELECT
    t.payment_mode_id,
    pm.description,
    pm.show_at_pos,
    COUNT(*)                                           AS ticket_count,
    SUM(t.net_amount)                                  AS total_net_amount
FROM tickets t
LEFT JOIN payment_modes pm ON pm.id = t.payment_mode_id
WHERE t.created_at >= (NOW() - INTERVAL '30 days')
GROUP BY t.payment_mode_id, pm.description, pm.show_at_pos
ORDER BY ticket_count DESC;

\echo ''
\echo 'Q5b: bookings — payment modes used in last 30 days'
SELECT
    b.payment_mode_id,
    pm.description,
    pm.show_at_pos,
    COUNT(*)                                           AS booking_count,
    SUM(b.net_amount)                                  AS total_net_amount
FROM bookings b
LEFT JOIN payment_modes pm ON pm.id = b.payment_mode_id
WHERE b.created_at >= (NOW() - INTERVAL '30 days')
GROUP BY b.payment_mode_id, pm.description, pm.show_at_pos
ORDER BY booking_count DESC;


-- ┌────────────────────────────────────────────────────────────────────────┐
-- │ QUERY 6                                                                │
-- │ Card usage. The admin D-Drive screen historically mis-bucketed Card    │
-- │ payments; the magnitude of that misbucketing equals the Card volume.   │
-- └────────────────────────────────────────────────────────────────────────┘
\echo ''
\echo '────────────────────────────────────────────────────────────────────────'
\echo 'Q6: Card (payment_mode_id=3) usage in tickets — all-time & last-30'
\echo '────────────────────────────────────────────────────────────────────────'
SELECT
    'all_time'                                          AS bucket,
    COUNT(*)                                            AS ticket_count,
    COALESCE(SUM(net_amount), 0)                        AS total_net_amount,
    MIN(created_at)                                     AS first_seen,
    MAX(created_at)                                     AS last_seen
FROM tickets
WHERE payment_mode_id = 3
UNION ALL
SELECT
    'last_30_days'                                      AS bucket,
    COUNT(*)                                            AS ticket_count,
    COALESCE(SUM(net_amount), 0)                        AS total_net_amount,
    MIN(created_at)                                     AS first_seen,
    MAX(created_at)                                     AS last_seen
FROM tickets
WHERE payment_mode_id = 3
  AND created_at >= (NOW() - INTERVAL '30 days');

\echo ''
\echo '────────────────────────────────────────────────────────────────────────'
\echo 'AUDIT COMPLETE.'
\echo '────────────────────────────────────────────────────────────────────────'
