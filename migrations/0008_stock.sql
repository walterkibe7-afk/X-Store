-- 0008: Inventory stock tracking + payment reference optimisation
-- Adds a `stock` column to products for atomic inventory control.
-- Existing seeded products receive a generous default so storefront
-- behaviour is unchanged until an admin sets explicit levels.

ALTER TABLE products ADD COLUMN stock INTEGER NOT NULL DEFAULT 1000;

-- Set explicit stock levels for the seeded catalogue (safe to re-run).
UPDATE products SET stock = 50  WHERE id = 'silk-touch';
UPDATE products SET stock = 30  WHERE id = 'after-dark-oil';
UPDATE products SET stock = 100 WHERE id = 'midnight-gummies';
UPDATE products SET stock = 25  WHERE id = 'velvet-mini';
UPDATE products SET stock = 40  WHERE id = 'slow-down-oil';
UPDATE products SET stock = 20  WHERE id = 'luna';
UPDATE products SET stock = 60  WHERE id = 'night-ritual';
UPDATE products SET stock = 15  WHERE id = 'the-duo';

-- Index to accelerate payment_reference lookups (idempotency checks).
CREATE INDEX IF NOT EXISTS idx_orders_payment_reference ON orders(payment_reference);
