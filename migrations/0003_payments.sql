-- 0003: manual M-Pesa Paybill payments.
-- Orders paid via Paybill stay 'pending' until confirmed in admin.
ALTER TABLE orders ADD COLUMN payment_method TEXT DEFAULT 'card';
ALTER TABLE orders ADD COLUMN payment_reference TEXT;
