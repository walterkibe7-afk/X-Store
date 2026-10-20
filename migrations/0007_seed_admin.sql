-- =========================
-- X ADMIN — SEED ADMIN USER
-- =========================
-- Migration: 0007_seed_admin
-- Description: Seed the default admin account (email: admin@elle.com)
-- Source: insert_admin.sql (consolidated here for reproducible migrations)

INSERT OR IGNORE INTO admin_users (id, email, password_hash, name, role)
VALUES ('admin-1', 'admin@elle.com', 'pbkdf2$100000$uZLYydR83ltUwOsOWCenAg==$WveXXBAxungHJPeiqAZNjV+YY5X9H1zzgiixBQS/FWY=', 'Admin', 'admin');
