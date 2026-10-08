-- =========================
-- X ADMIN — D1 INITIAL SCHEMA
-- =========================
-- Migration: 0001_initial
-- Description: Create core tables for products, customers, orders, order_items

-- Products table
CREATE TABLE products (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    category TEXT NOT NULL,
    subcategory TEXT NOT NULL,
    price REAL NOT NULL,
    compare_price REAL,
    description TEXT,
    details TEXT,
    image_hero TEXT,
    image_lifestyle TEXT,
    image_detail TEXT,
    badge TEXT,
    rating REAL DEFAULT 0,
    review_count INTEGER DEFAULT 0,
    featured INTEGER DEFAULT 0,
    active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Index for category filtering
CREATE INDEX idx_products_category ON products(category);
CREATE INDEX idx_products_active ON products(active);
CREATE INDEX idx_products_featured ON products(featured);
CREATE INDEX idx_products_slug ON products(slug);

-- Customers table
CREATE TABLE customers (
    id TEXT PRIMARY KEY,
    first_name TEXT,
    last_name TEXT,
    email TEXT NOT NULL UNIQUE,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Index for email lookups
CREATE INDEX idx_customers_email ON customers(email);

-- Orders table
CREATE TABLE orders (
    id TEXT PRIMARY KEY,
    customer_id TEXT,
    status TEXT DEFAULT 'pending',
    subtotal REAL NOT NULL,
    shipping REAL DEFAULT 5,
    total REAL NOT NULL,
    shipping_name TEXT,
    shipping_email TEXT,
    shipping_phone TEXT,
    shipping_address TEXT,
    shipping_city TEXT,
    shipping_country TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Index for order lookups
CREATE INDEX idx_orders_customer ON orders(customer_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_created ON orders(created_at);

-- Order items table
CREATE TABLE order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    product_name TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    price REAL NOT NULL,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);

-- Index for order items
CREATE INDEX idx_order_items_order ON order_items(order_id);
CREATE INDEX idx_order_items_product ON order_items(product_id);

-- Settings table (single row, key-value)
CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

-- Insert default settings
INSERT INTO settings (key, value) VALUES
    ('store_name', 'Elle'),
    ('store_email', 'hello@elle.com'),
    ('currency', 'USD'),
    ('shipping_fee', '5');

-- Admin users table (for future authentication)
CREATE TABLE admin_users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    name TEXT,
    role TEXT DEFAULT 'admin',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    last_login_at TEXT
);

-- Create trigger to update updated_at timestamp
CREATE TRIGGER update_products_timestamp
AFTER UPDATE ON products
BEGIN
    UPDATE products SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER update_orders_timestamp
AFTER UPDATE ON orders
BEGIN
    UPDATE orders SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- Seed initial products (matching the existing storefront catalogue)
INSERT INTO products (id, name, slug, category, subcategory, price, compare_price, description, details, image_hero, image_lifestyle, image_detail, badge, rating, review_count, featured, active) VALUES
    ('silk-touch', 'Silk Touch', 'silk-touch', 'Intimate', 'Toys', 7650, NULL, 'Thoughtfully designed for a more personal kind of self-care.', 'Premium materials, compact design and a smooth easy-to-clean surface. Designed for personal use.', 'https://via.placeholder.com/600x600', '', '', 'BEST SELLER', 5, 42, 1, 1),
    ('after-dark-oil', 'After Dark Oil', 'after-dark-oil', 'Wellness', 'Body & Massage', 3650, NULL, 'A rich, fast-absorbing body oil for after-hours rituals.', 'A lightweight oil that sinks in fast, with a warm cedar and vetiver scent and no greasy finish.', 'https://via.placeholder.com/600x600', '', '', NULL, 5, 28, 0, 1),
    ('midnight-gummies', 'Midnight Gummies', 'midnight-gummies', 'Wellness', 'Gummies', 3100, NULL, 'A gentle nightly gummy to help you unwind.', 'A soft berry-flavoured gummy taken in the evening, with no aftertaste and no added caffeine.', 'https://via.placeholder.com/600x600', '', '', 'NEW', 5, 19, 0, 1),
    ('velvet-mini', 'Velvet Mini', 'velvet-mini', 'Intimate', 'Toys', 5850, NULL, 'Compact, discreet and quietly powerful.', 'A compact size with a soft-touch finish that is easy to hold, easier to store and fully discreet.', 'https://via.placeholder.com/600x600', '', '', NULL, 5, 36, 1, 1),
    ('slow-down-oil', 'Slow Down Oil', 'slow-down-oil', 'Wellness', 'Body & Massage', 2850, 3900, 'Warm, slow-burning massage oil with a soft finish.', 'A slow-burning massage oil that warms between the palms and leaves a soft, low sheen.', 'https://via.placeholder.com/600x600', '', '', 'SALE', 5, 51, 0, 1),
    ('luna', 'Luna', 'luna', 'Intimate', 'Toys', 8300, NULL, 'Sculpted, smooth and made to be kept on the nightstand.', 'A weighted, sculpted form with a smooth surface, designed to stay where you left it.', 'https://via.placeholder.com/600x600', '', '', NULL, 5, 17, 1, 1),
    ('night-ritual', 'Night Ritual', 'night-ritual', 'Wellness', 'Self-Care', 4400, NULL, 'A pillow mist and body serum pair for winding down.', 'Two complementary steps for the end of the day: a light pillow mist and a smoothing body serum.', 'https://via.placeholder.com/600x600', '', '', 'NEW', 5, 12, 0, 1),
    ('the-duo', 'The Duo', 'the-duo', 'Intimate', 'Accessories', 9350, NULL, 'Two best sellers, boxed and ready to gift.', 'Two of our most reordered products, chosen together and packed as a single gift set.', 'https://via.placeholder.com/600x600', '', '', NULL, 5, 31, 1, 1);