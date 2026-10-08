-- =========================
-- X ADMIN — AUTH & ORDER EXTENSIONS
-- =========================
-- Migration: 0002_auth
-- Description: Add password_hash to customers, phone/address fields, order customer_email and number

-- Customers table extensions
ALTER TABLE customers ADD COLUMN password_hash TEXT;
ALTER TABLE customers ADD COLUMN phone TEXT;
ALTER TABLE customers ADD COLUMN address TEXT;
ALTER TABLE customers ADD COLUMN city TEXT;
ALTER TABLE customers ADD COLUMN country TEXT;

-- Orders table extensions
ALTER TABLE orders ADD COLUMN customer_email TEXT;
ALTER TABLE orders ADD COLUMN number TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_number ON orders(number);
CREATE INDEX IF NOT EXISTS idx_orders_email ON orders(customer_email);

-- Customer sessions table (for customer auth)
CREATE TABLE IF NOT EXISTS customer_sessions (
    id TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL,
    email TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_customer_sessions_email ON customer_sessions(email);
CREATE INDEX IF NOT EXISTS idx_customer_sessions_expires ON customer_sessions(expires_at);