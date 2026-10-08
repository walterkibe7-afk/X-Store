-- 0005: sell in Kenyan Shillings.
-- Idempotent plain UPDATEs so re-running is harmless.
UPDATE settings SET value = 'KES' WHERE key = 'currency';
UPDATE settings SET value = '650' WHERE key = 'shipping_fee';
