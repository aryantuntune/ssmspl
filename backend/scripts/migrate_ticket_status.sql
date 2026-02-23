-- Migration: Add status and checked_in_at columns to tickets table
-- Run this against the development/production database

-- Add status column (default CONFIRMED for billing operator tickets)
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'CONFIRMED';

-- Add checked_in_at column for verification timestamp
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS checked_in_at TIMESTAMPTZ;

-- Backfill: cancelled tickets get CANCELLED status
UPDATE tickets SET status = 'CANCELLED' WHERE is_cancelled = TRUE AND status = 'CONFIRMED';

-- Also add VERIFIED as a valid status for bookings that are already checked in
UPDATE bookings SET status = 'VERIFIED' WHERE checked_in_at IS NOT NULL AND status = 'CONFIRMED';
