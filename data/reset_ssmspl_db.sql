-- ============================================================
-- SSMSPL – Production Database Reset
-- ============================================================
-- Wipes ALL transactional and master data.
-- After running this, seed with: backend/scripts/seed_data.sql
--
-- Usage on VPS:
--   docker exec -i ssmspl-db-1 psql -U ssmspl_user -d ssmspl_db_prod < data/reset_ssmspl_db.sql
--   docker exec -i ssmspl-db-1 psql -U ssmspl_user -d ssmspl_db_prod < backend/scripts/seed_data.sql
-- ============================================================

-- Single TRUNCATE handles all FK dependencies automatically
TRUNCATE TABLE
    public.ticket_items,
    public.ticket_payement,
    public.tickets,
    public.booking_items,
    public.bookings,
    public.email_otps,
    public.refresh_tokens,
    public.sys_update_logs,
    public.portal_users,
    public.item_rates,
    public.ferry_schedules,
    public.items,
    public.boats,
    public.payment_modes,
    public.users,
    public.routes,
    public.branches,
    public.company
CASCADE;

-- Reset sequences
ALTER SEQUENCE IF EXISTS tickets_id_seq RESTART WITH 1;
ALTER SEQUENCE IF EXISTS ticket_items_id_seq RESTART WITH 1;
ALTER SEQUENCE IF EXISTS ticket_payement_id_seq RESTART WITH 1;
ALTER SEQUENCE IF EXISTS bookings_id_seq RESTART WITH 1;
ALTER SEQUENCE IF EXISTS booking_items_id_seq RESTART WITH 1;
ALTER SEQUENCE IF EXISTS portal_users_id_seq RESTART WITH 1;
ALTER SEQUENCE IF EXISTS email_otps_id_seq RESTART WITH 1;
ALTER SEQUENCE IF EXISTS sys_update_logs_id_seq RESTART WITH 1;

-- Verify clean state
SELECT 'tickets' AS tbl, COUNT(*) FROM tickets
UNION ALL SELECT 'users', COUNT(*) FROM users
UNION ALL SELECT 'branches', COUNT(*) FROM branches
UNION ALL SELECT 'items', COUNT(*) FROM items
UNION ALL SELECT 'item_rates', COUNT(*) FROM item_rates;
