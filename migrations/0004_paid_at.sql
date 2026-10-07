-- 0004: record when a pending order is confirmed paid.
-- Used by the I&M Business Connect payment notification callback.
ALTER TABLE orders ADD COLUMN paid_at TEXT;
