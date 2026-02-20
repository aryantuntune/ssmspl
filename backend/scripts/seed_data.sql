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
        '$2b$12$40jxkhNDTRR7btlgX0mTIuom3jXuB3r5OT0J2dh0ep5Q3iK3YDUD.',  -- Password@123
        'SUPER_ADMIN',
        TRUE,
        TRUE
    ),
    -- Admin
    (
        uuid_generate_v4(),
        'admin@ssmspl.com',
        'admin',
        'System Administrator',
        '$2b$12$40jxkhNDTRR7btlgX0mTIuom3jXuB3r5OT0J2dh0ep5Q3iK3YDUD.',
        'ADMIN',
        TRUE,
        TRUE
    ),
    -- Manager
    (
        uuid_generate_v4(),
        'manager@ssmspl.com',
        'manager',
        'Operations Manager',
        '$2b$12$40jxkhNDTRR7btlgX0mTIuom3jXuB3r5OT0J2dh0ep5Q3iK3YDUD.',
        'MANAGER',
        TRUE,
        TRUE
    ),
    -- Billing Operator
    (
        uuid_generate_v4(),
        'billing@ssmspl.com',
        'billing_operator',
        'Billing Operator',
        '$2b$12$40jxkhNDTRR7btlgX0mTIuom3jXuB3r5OT0J2dh0ep5Q3iK3YDUD.',
        'BILLING_OPERATOR',
        TRUE,
        TRUE
    ),
    -- Ticket Checker
    (
        uuid_generate_v4(),
        'checker@ssmspl.com',
        'ticket_checker',
        'Ticket Checker',
        '$2b$12$40jxkhNDTRR7btlgX0mTIuom3jXuB3r5OT0J2dh0ep5Q3iK3YDUD.',
        'TICKET_CHECKER',
        TRUE,
        TRUE
    )
ON CONFLICT (username) DO NOTHING;

-- ============================================================
-- BOATS SEED DATA
-- ============================================================

INSERT INTO boats (id, name, no, is_active)
VALUES
    (1, 'SHANTADURGA', 'RTN-IV-03-00001', TRUE),
    (2, 'SONIA', 'RTN-IV-03-00007', TRUE),
    (3, 'PRIYANKA', 'RTN-IV-08-00010', TRUE),
    (4, 'SUPRIYA', 'RTN-IV-08-00011', TRUE),
    (5, 'AISHWARYA', 'RTN-IV-08-00030', TRUE),
    (6, 'AVANTIKA', 'RTN-IV-03-00082', TRUE),
    (7, 'ISHWARI', 'RTN-IV-118', TRUE),
    (8, 'VAIBHAVI', 'RTN-IV-124', TRUE),
    (9, 'AAROHI', 'RTN-IV-125', TRUE),
    (10, 'GIRIJA', 'RTN-IV-136', TRUE),
    (11, 'JANHVI', 'RTN-IV-137', TRUE),
    (12, 'DEVIKA', 'RTN-IV-159', TRUE)
ON CONFLICT (name) DO NOTHING;

-- ============================================================
-- BRANCHES SEED DATA
-- ============================================================

INSERT INTO branches (id, name, address, contact_nos, latitude, longitude, sf_after, sf_before, is_active)
VALUES
    (1, 'Old Goa', 'Old Goa Jetty, Goa 403402', '0832-2456789', 15.501330000000000, 73.911090000000000, '18:00:00', '06:00:00', TRUE),
    (2, 'Panaji', 'Panaji Jetty, Goa 403001', '0832-2224123', 15.496394000000000, 73.810982000000000, '18:30:00', '05:30:00', TRUE),
    (3, 'Ribander', 'Ribander Ferry Point, Goa 403006', NULL, 15.492580000000000, 73.870250000000000, NULL, NULL, TRUE),
    (4, 'Chorao', 'Chorao Island Jetty, Goa 403102', '0832-2414567', 15.517000000000000, 73.875000000000000, '18:00:00', '06:30:00', TRUE),
    (5, 'Divar', 'Divar Island Jetty, Goa 403403', NULL, 15.516000000000000, 73.894000000000000, NULL, NULL, TRUE),
    (6, 'Aldona', 'Aldona Ferry Point, Goa 403508', '0832-2892345', 15.587000000000000, 73.874000000000000, '17:30:00', '06:00:00', TRUE)
ON CONFLICT (name) DO NOTHING;

-- ============================================================
-- FERRY SCHEDULES SEED DATA
-- ============================================================

INSERT INTO ferry_schedules (id, branch_id, departure)
VALUES
    (1, 1, '07:00'),
    (2, 1, '08:30'),
    (3, 1, '10:00'),
    (4, 1, '14:00'),
    (5, 1, '16:30'),
    (6, 2, '07:15'),
    (7, 2, '09:00'),
    (8, 2, '11:00'),
    (9, 2, '14:30'),
    (10, 2, '17:00'),
    (11, 3, '06:45'),
    (12, 3, '09:30'),
    (13, 3, '13:00'),
    (14, 3, '16:00'),
    (15, 4, '07:30'),
    (16, 4, '10:30'),
    (17, 4, '15:00'),
    (18, 5, '08:00'),
    (19, 5, '12:00'),
    (20, 5, '17:30')
ON CONFLICT ON CONSTRAINT uq_ferry_schedules_branch_departure DO NOTHING;

-- ============================================================
-- VERIFICATION QUERIES
-- ============================================================
SELECT id, username, email, role, is_active FROM users ORDER BY role;
SELECT id, name, no, is_active FROM boats ORDER BY name;
SELECT id, name, address, contact_nos, is_active FROM branches ORDER BY name;
SELECT fs.id, b.name AS branch, fs.departure FROM ferry_schedules fs JOIN branches b ON b.id = fs.branch_id ORDER BY b.name, fs.departure;
