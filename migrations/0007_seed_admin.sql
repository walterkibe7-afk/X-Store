-- =========================
-- X ADMIN — SEED ADMIN USER
-- =========================
-- Migration: 0007_seed_admin
-- Description: Seed the default admin account (email: admin@elle.com)
-- Source: insert_admin.sql (consolidated here for reproducible migrations)

INSERT OR IGNORE INTO admin_users (id, email, password_hash, name, role)
VALUES ('admin-1', 'admin@elle.com', 'pbkdf2$100000$sz01TRzVTmmK2g2kx864AQ==$3OFj31R7GTfelySF2J3741IZiYbJ2u2YNG42k3dVjdM=', 'Admin', 'admin');
