-- ============================================================
-- SSMSPL – Seed Data Script
-- User Management & Authentication
-- ============================================================
-- Default password for ALL seed users: Password@123
-- IMPORTANT: Change all passwords before deploying to staging/production!
-- ============================================================

-- Truncate for idempotent re-seeding (dev/test only)
-- TRUNCATE TABLE refresh_tokens, users RESTART IDENTITY CASCADE;

INSERT INTO users (id, email, username, full_name, hashed_password, role, is_active, is_verified)
VALUES
    -- Super Admin
    (
        uuid_generate_v4(),
        'superadmin@ssmspl.com',
        'superadmin',
        'Super Administrator',
        '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewFg/L8Qv1QK6Ny2',  -- Password@123
        'super_admin',
        TRUE,
        TRUE
    ),
    -- Admin
    (
        uuid_generate_v4(),
        'admin@ssmspl.com',
        'admin',
        'System Administrator',
        '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewFg/L8Qv1QK6Ny2',
        'admin',
        TRUE,
        TRUE
    ),
    -- Manager
    (
        uuid_generate_v4(),
        'manager@ssmspl.com',
        'manager',
        'Operations Manager',
        '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewFg/L8Qv1QK6Ny2',
        'manager',
        TRUE,
        TRUE
    ),
    -- Billing Operator
    (
        uuid_generate_v4(),
        'billing@ssmspl.com',
        'billing_op',
        'Billing Operator',
        '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewFg/L8Qv1QK6Ny2',
        'billing_operator',
        TRUE,
        TRUE
    ),
    -- Ticket Checker
    (
        uuid_generate_v4(),
        'checker@ssmspl.com',
        'ticket_checker',
        'Ticket Checker',
        '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewFg/L8Qv1QK6Ny2',
        'ticket_checker',
        TRUE,
        TRUE
    )
ON CONFLICT (username) DO NOTHING;

-- ============================================================
-- VERIFICATION QUERY
-- ============================================================
SELECT id, username, email, role, is_active FROM users ORDER BY role;
