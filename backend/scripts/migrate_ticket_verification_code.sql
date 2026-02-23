-- Migration: Add verification_code to tickets table
-- This adds QR code support for billing operator tickets (same as portal bookings)

-- 1. Add the column
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS verification_code UUID DEFAULT uuid_generate_v4();

-- 2. Backfill existing tickets with unique UUIDs
UPDATE tickets SET verification_code = uuid_generate_v4() WHERE verification_code IS NULL;
