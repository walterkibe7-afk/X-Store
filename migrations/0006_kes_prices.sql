-- 0006: USD -> KES repricing (x130, rounded to nearest 50).
-- Conditional updates: only convert rows still holding the old USD values,
-- so prices edited in admin are never overwritten. Safe to re-run.
UPDATE products SET price = 7650 WHERE id = 'silk-touch' AND price = 59;
UPDATE products SET price = 3650 WHERE id = 'after-dark-oil' AND price = 28;
UPDATE products SET price = 3100 WHERE id = 'midnight-gummies' AND price = 24;
UPDATE products SET price = 5850 WHERE id = 'velvet-mini' AND price = 45;
UPDATE products SET price = 2850, compare_price = 3900 WHERE id = 'slow-down-oil' AND price = 22;
UPDATE products SET price = 8300 WHERE id = 'luna' AND price = 64;
UPDATE products SET price = 4400 WHERE id = 'night-ritual' AND price = 34;
UPDATE products SET price = 9350 WHERE id = 'the-duo' AND price = 72;
