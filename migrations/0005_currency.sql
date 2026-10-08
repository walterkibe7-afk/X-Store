-- 0005: sell in Kenyan Shillings (+ finish the Elle rebrand inside settings).
-- Idempotent plain UPDATEs so re-running is harmless.
UPDATE settings SET value = 'Elle' WHERE key = 'store_name';
UPDATE settings SET value = 'hello@elle.com' WHERE key = 'store_email';
UPDATE settings SET value = 'KES' WHERE key = 'currency';
UPDATE settings SET value = '650' WHERE key = 'shipping_fee';
