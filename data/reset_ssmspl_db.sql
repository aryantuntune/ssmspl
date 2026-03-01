-- ============================================================
-- SSMSPL – Production Database Reset
-- ============================================================
-- Wipes ALL transactional and master data, then re-seeds
-- from backend/scripts/seed_data.sql.
--
-- Usage on VPS:
--   docker exec -i <postgres_container> psql -U <user> -d ssmspl_db_prod < data/reset_ssmspl_db.sql
--   docker exec -i <postgres_container> psql -U <user> -d ssmspl_db_prod < backend/scripts/seed_data.sql
-- ============================================================

-- Transactional data (order matters due to FK constraints)
TRUNCATE TABLE public.ticket_items CASCADE;
TRUNCATE TABLE public.ticket_payement CASCADE;
TRUNCATE TABLE public.tickets CASCADE;
TRUNCATE TABLE public.booking_items CASCADE;
TRUNCATE TABLE public.bookings CASCADE;
TRUNCATE TABLE public.email_otps CASCADE;
TRUNCATE TABLE public.refresh_tokens CASCADE;
TRUNCATE TABLE public.sys_update_logs CASCADE;
TRUNCATE TABLE public.portal_users CASCADE;

-- Master data
TRUNCATE TABLE public.item_rates CASCADE;
TRUNCATE TABLE public.ferry_schedules CASCADE;
TRUNCATE TABLE public.items CASCADE;
TRUNCATE TABLE public.boats CASCADE;
TRUNCATE TABLE public.payment_modes CASCADE;
TRUNCATE TABLE public.users CASCADE;
TRUNCATE TABLE public.routes CASCADE;
TRUNCATE TABLE public.branches CASCADE;
TRUNCATE TABLE public.company CASCADE;

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
