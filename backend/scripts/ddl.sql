-- ============================================================
-- SSMSPL Ferry Boat Ticketing System
-- DDL Script – User Management & Authentication
-- Compatible with PostgreSQL 14+
-- ============================================================

-- Run this script against:
--   ssmspl_db_dev  (development)
--   ssmspl_db_test (testing)
--   ssmspl_db_prod (production)

-- ============================================================
-- EXTENSIONS
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- ENUMS
-- ============================================================
DO $$ BEGIN
    CREATE TYPE user_role_enum AS ENUM (
        'SUPER_ADMIN',
        'ADMIN',
        'MANAGER',
        'BILLING_OPERATOR',
        'TICKET_CHECKER'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- TABLES
-- ============================================================

-- Users table (authentication + RBAC)
CREATE TABLE IF NOT EXISTS users (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email           VARCHAR(255) NOT NULL UNIQUE,
    username        VARCHAR(100) NOT NULL UNIQUE,
    full_name       VARCHAR(255) NOT NULL,
    hashed_password VARCHAR(255) NOT NULL,
    role            user_role_enum NOT NULL DEFAULT 'TICKET_CHECKER',
    route_id        INTEGER REFERENCES routes(id),
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    is_verified     BOOLEAN NOT NULL DEFAULT FALSE,
    last_login      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Refresh tokens (optional persistent refresh token store)
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  VARCHAR(255) NOT NULL UNIQUE,  -- store hashed token
    expires_at  TIMESTAMPTZ NOT NULL,
    revoked     BOOLEAN NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Boats table (ferry/vessel management)
CREATE TABLE IF NOT EXISTS boats (
    id                  INTEGER PRIMARY KEY,
    name                VARCHAR(255) NOT NULL UNIQUE,
    no                  VARCHAR(100) NOT NULL UNIQUE,
    is_active           BOOLEAN DEFAULT TRUE
);

-- Branches table (jetty/location management)
CREATE TABLE IF NOT EXISTS branches (
    id                  INTEGER PRIMARY KEY,
    name                VARCHAR(15) NOT NULL UNIQUE,
    address             VARCHAR(255) NOT NULL,
    contact_nos         VARCHAR(255),
    latitude            NUMERIC(21,15),
    longitude           NUMERIC(21,15),
    sf_after            TIME WITHOUT TIME ZONE,
    sf_before           TIME WITHOUT TIME ZONE,
    is_active           BOOLEAN DEFAULT TRUE
);

-- Routes table (connects two branches)
CREATE TABLE IF NOT EXISTS routes (
    id                  INTEGER PRIMARY KEY,
    branch_id_one       INTEGER NOT NULL REFERENCES branches(id),
    branch_id_two       INTEGER NOT NULL REFERENCES branches(id),
    is_active           BOOLEAN DEFAULT TRUE
);

-- Items table (ticket item types)
CREATE TABLE IF NOT EXISTS items (
    id                  INTEGER PRIMARY KEY,
    name                VARCHAR(60) NOT NULL UNIQUE,
    short_name          VARCHAR(30) NOT NULL UNIQUE,
    online_visiblity    BOOLEAN,
    is_vehicle          BOOLEAN DEFAULT FALSE,
    is_active           BOOLEAN DEFAULT TRUE
);

-- Ferry schedules table (branch-wise departure times)
CREATE TABLE IF NOT EXISTS ferry_schedules (
    id                  INTEGER PRIMARY KEY,
    branch_id           INTEGER NOT NULL REFERENCES branches(id),
    departure           TIME NOT NULL,
    CONSTRAINT uq_ferry_schedules_branch_departure UNIQUE (branch_id, departure)
);

-- Portal users table (customer-facing authentication)
CREATE TABLE IF NOT EXISTS portal_users (
    id                  INTEGER PRIMARY KEY,
    first_name          VARCHAR(60) NOT NULL,
    last_name           VARCHAR(60) NOT NULL,
    email               VARCHAR(90) NOT NULL,
    password            VARCHAR(60) NOT NULL,
    mobile              VARCHAR(60) NOT NULL,
    remember_token      VARCHAR(100),
    created_at          TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMP WITHOUT TIME ZONE,
    profile_pic         BYTEA,
    CONSTRAINT portal_users_unique_email UNIQUE (email)
);

-- ============================================================
-- SEQUENCES
-- ============================================================
CREATE SEQUENCE IF NOT EXISTS portal_users_id_seq
    START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;

ALTER TABLE portal_users ALTER COLUMN id SET DEFAULT nextval('portal_users_id_seq');

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_users_email    ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_role     ON users(role);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token_hash ON refresh_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_boats_name ON boats(name);
CREATE INDEX IF NOT EXISTS idx_boats_no ON boats(no);
CREATE INDEX IF NOT EXISTS idx_branches_name ON branches(name);
CREATE INDEX IF NOT EXISTS idx_routes_branch_one ON routes(branch_id_one);
CREATE INDEX IF NOT EXISTS idx_routes_branch_two ON routes(branch_id_two);
CREATE INDEX IF NOT EXISTS idx_items_name ON items(name);
CREATE INDEX IF NOT EXISTS idx_items_short_name ON items(short_name);

CREATE INDEX IF NOT EXISTS idx_ferry_schedules_branch ON ferry_schedules(branch_id);
CREATE INDEX IF NOT EXISTS idx_portal_users_email ON portal_users(email);
CREATE INDEX IF NOT EXISTS idx_portal_users_mobile ON portal_users(mobile);

-- ============================================================
-- FUNCTIONS & TRIGGERS
-- ============================================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_users_updated_at ON users;
CREATE TRIGGER set_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS set_portal_users_updated_at ON portal_users;
CREATE TRIGGER set_portal_users_updated_at
    BEFORE UPDATE ON portal_users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- END OF DDL
-- ============================================================
