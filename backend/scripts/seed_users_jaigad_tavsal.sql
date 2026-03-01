-- ============================================================
-- TEMP SEED: Jaigad - Tavsal (Route 3) Users
-- Password for all: Password@123
-- Run: docker compose -f docker-compose.prod.yml exec db psql -U ssmspl_user -d ssmspl_db_prod -f /docker-entrypoint-initdb.d/seed_users_jaigad_tavsal.sql
-- ============================================================

-- Manager
INSERT INTO users (id, email, username, full_name, hashed_password, role, route_id, is_active, is_verified)
VALUES
    (uuid_generate_v4(), 'sandip.pawar@ssmspl.com', 'sandip.pawar', 'Sandip Gajanan Pawar',
     '$2b$12$40jxkhNDTRR7btlgX0mTIuom3jXuB3r5OT0J2dh0ep5Q3iK3YDUD.', 'MANAGER', 3, TRUE, TRUE)
ON CONFLICT (username) DO NOTHING;

-- Billing Operators
INSERT INTO users (id, email, username, full_name, hashed_password, role, route_id, is_active, is_verified)
VALUES
    (uuid_generate_v4(), 'prashant.gadade@ssmspl.com', 'prashant.gadade', 'Prashant Chandrkant Gadade',
     '$2b$12$40jxkhNDTRR7btlgX0mTIuom3jXuB3r5OT0J2dh0ep5Q3iK3YDUD.', 'BILLING_OPERATOR', 3, TRUE, TRUE),

    (uuid_generate_v4(), 'prakash.surve@ssmspl.com', 'prakash.surve', 'Prakash Vasant Surve',
     '$2b$12$40jxkhNDTRR7btlgX0mTIuom3jXuB3r5OT0J2dh0ep5Q3iK3YDUD.', 'BILLING_OPERATOR', 3, TRUE, TRUE),

    (uuid_generate_v4(), 'sudesh.surve@ssmspl.com', 'sudesh.surve', 'Sudesh Nandkumar Surve',
     '$2b$12$40jxkhNDTRR7btlgX0mTIuom3jXuB3r5OT0J2dh0ep5Q3iK3YDUD.', 'BILLING_OPERATOR', 3, TRUE, TRUE),

    (uuid_generate_v4(), 'pravin.bagkar@ssmspl.com', 'pravin.bagkar', 'Pravin Prakash Bagkar',
     '$2b$12$40jxkhNDTRR7btlgX0mTIuom3jXuB3r5OT0J2dh0ep5Q3iK3YDUD.', 'BILLING_OPERATOR', 3, TRUE, TRUE)
ON CONFLICT (username) DO NOTHING;
