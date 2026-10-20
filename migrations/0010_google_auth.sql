-- =========================
-- GOOGLE AUTH EXTENSION
-- =========================
-- Migration: 0010_google_auth
-- Description: Add google_id column and index to customers

ALTER TABLE customers ADD COLUMN google_id TEXT;
CREATE INDEX IF NOT EXISTS idx_customers_google_id ON customers(google_id);
