-- 0009: Checkout idempotency
-- Adds an `idempotency_key` column to orders and enforces uniqueness.
ALTER TABLE orders ADD COLUMN idempotency_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_idem ON orders(idempotency_key) WHERE idempotency_key IS NOT NULL;
