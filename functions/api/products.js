/**
 * Elle Store API Worker
 * Main entry point for Cloudflare Worker
 */

const ITERATIONS = 100000;
const KEY_LENGTH = 32;
const SALT_LENGTH = 16;
const ALGORITHM = "PBKDF2";
const HASH_ALGORITHM = "SHA-256";

async function hashPassword(password) {
    const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
        "raw",
        encoder.encode(password),
        { name: ALGORITHM },
        false,
        ["deriveBits"]
    );
    const hashBuffer = await crypto.subtle.deriveBits(
        {
            name: ALGORITHM,
            salt,
            iterations: ITERATIONS,
            hash: HASH_ALGORITHM
        },
        keyMaterial,
        KEY_LENGTH * 8
    );
    const hash = new Uint8Array(hashBuffer);
    const saltB64 = btoa(String.fromCharCode(...salt));
    const hashB64 = btoa(String.fromCharCode(...hash));
    return `pbkdf2$${ITERATIONS}$${saltB64}$${hashB64}`;
}

async function verifyPassword(password, storedHash) {
    if (!storedHash || !storedHash.startsWith("pbkdf2$")) {
        return false;
    }
    const parts = storedHash.split("$");
    if (parts.length !== 4) return false;
    const [, iterationsStr, saltB64, hashB64] = parts;
    const iterations = parseInt(iterationsStr, 10);
    const salt = new Uint8Array(atob(saltB64).split("").map(c => c.charCodeAt(0)));
    const expectedHash = new Uint8Array(atob(hashB64).split("").map(c => c.charCodeAt(0)));
    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
        "raw",
        encoder.encode(password),
        { name: ALGORITHM },
        false,
        ["deriveBits"]
    );
    const hashBuffer = await crypto.subtle.deriveBits(
        {
            name: ALGORITHM,
            salt,
            iterations,
            hash: HASH_ALGORITHM
        },
        keyMaterial,
        KEY_LENGTH * 8
    );
    const computedHash = new Uint8Array(hashBuffer);
    if (computedHash.length !== expectedHash.length) return false;
    let diff = 0;
    for (let i = 0; i < computedHash.length; i++) {
        diff |= computedHash[i] ^ expectedHash[i];
    }
    return diff === 0;
}

function parseCookies(cookieHeader) {
    const cookies = {};
    if (!cookieHeader) return cookies;
    cookieHeader.split(";").forEach(pair => {
        const [key, value] = pair.trim().split("=");
        if (key && value) cookies[key] = decodeURIComponent(value);
    });
    return cookies;
}

async function requireAdmin(request, env) {
    const cookies = parseCookies(request.headers.get("Cookie"));
    const sid = cookies.x_admin_session;
    if (!sid) {
        const authHeader = request.headers.get("Authorization");
        if (authHeader?.startsWith("Bearer ")) {
            return await validateSession(authHeader.slice(7), env);
        }
        return null;
    }
    return await validateSession(sid, env);
}

async function validateSession(sid, env) {
    const session = await env.SESSIONS.get(`admin:${sid}`);
    if (!session) return null;
    try {
        return JSON.parse(session);
    } catch {
        return null;
    }
}

async function createAdminSession(admin, env) {
    const sid = crypto.randomUUID();
    const sessionData = JSON.stringify({ email: admin.email, name: admin.name });
    await env.SESSIONS.put(`admin:${sid}`, sessionData, { expirationTtl: 43200 });
    return sid;
}

async function deleteAdminSession(sid, env) {
    await env.SESSIONS.delete(`admin:${sid}`);
}

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        const path = url.pathname;
        const method = request.method;

        // CORS headers
        const corsHeaders = {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
        };

        if (method === "OPTIONS") {
            return new Response(null, { headers: corsHeaders });
        }

        // Auth middleware - check protected routes
        const protectedPaths = [
            { path: /^\/api\/products/, methods: ["POST", "PUT", "DELETE"] },
            { path: /^\/api\/orders/, methods: ["GET", "PUT"] },
            { path: /^\/api\/customers/, methods: ["GET"] },
            { path: /^\/api\/settings/, methods: ["GET", "PUT"] },
            { path: /^\/api\/admin\/me/, methods: ["GET"] },
            { path: /^\/api\/admin\/stats/, methods: ["GET"] },
        ];

        const isProtected = protectedPaths.some(p => p.path.test(path) && p.methods.includes(method));
        if (isProtected) {
            const admin = await requireAdmin(request, env);
            if (!admin) {
                return jsonResponse({ error: "Unauthorized" }, 401);
            }
        }

        try {
            let response;

            // Products routes
            if (path === "/api/products" && method === "GET") {
                response = await handleGetProducts(request, env);
            } else if (path.match(/^\/api\/products\/[^/]+$/) && method === "GET") {
                const id = path.split("/").pop();
                response = await handleGetProduct(id, env);
            } else if (path === "/api/products" && method === "POST") {
                response = await handleCreateProduct(request, env);
            } else if (path.match(/^\/api\/products\/[^/]+$/) && method === "PUT") {
                const id = path.split("/").pop();
                response = await handleUpdateProduct(id, request, env);
            } else if (path.match(/^\/api\/products\/[^/]+$/) && method === "DELETE") {
                const id = path.split("/").pop();
                response = await handleDeleteProduct(id, env);
            }
            // Orders routes
            else if (path === "/api/orders" && method === "GET") {
                response = await handleGetOrders(request, env);
            } else if (path === "/api/orders" && method === "POST") {
                response = await handleCreateOrder(request, env);
            } else if (path.match(/^\/api\/orders\/[^/]+$/) && method === "GET") {
                const id = path.split("/").pop();
                response = await handleGetOrder(id, env);
            } else if (path.match(/^\/api\/orders\/[^/]+$/) && method === "PUT") {
                const id = path.split("/").pop();
                response = await handleUpdateOrder(id, request, env);
            }
            // Payments callback (bank-verified, public route with its own secret)
            else if (path === "/api/payments/callback" && method === "POST") {
                response = await handlePaymentCallback(request, env);
            }
            // Daraja STK + C2B (public; Daraja signs nothing, strict matching only)
            else if (path === "/api/payments/stk" && method === "POST") {
                response = await handleStkPush(request, env);
            } else if (path === "/api/payments/daraja/result" && method === "POST") {
                response = await handleDarajaResult(request, env);
            } else if (path === "/api/payments/daraja/timeout" && method === "POST") {
                response = await handleDarajaResult(request, env);
            } else if (path === "/api/payments/daraja/validate" && method === "POST") {
                response = await handleDarajaValidate(request, env);
            } else if (path === "/api/payments/daraja/confirm" && method === "POST") {
                response = await handleDarajaConfirm(request, env);
            } else if (path.match(/^\/api\/payments\/status\/[^/]+$/) && method === "GET") {
                response = await handlePaymentStatus(request, env, path.split("/").pop());
            }
            // Customers routes
            else if (path === "/api/customers" && method === "GET") {
                response = await handleGetCustomers(request, env);
            } else if (path === "/api/customers" && method === "POST") {
                response = await handleCreateCustomer(request, env);
            } else if (path.match(/^\/api\/customers\/[^/]+$/) && method === "GET") {
                const id = path.split("/").pop();
                response = await handleGetCustomer(id, env);
            } else if (path.match(/^\/api\/customers\/[^/]+$/) && method === "PUT") {
                const id = path.split("/").pop();
                response = await handleUpdateCustomer(id, request, env);
            }
            // Settings routes
            else if (path === "/api/settings" && method === "GET") {
                response = await handleGetSettings(env);
            } else if (path === "/api/settings" && method === "PUT") {
                response = await handleUpdateSettings(request, env);
            }
            // Admin auth routes
            else if (path === "/api/admin/login" && method === "POST") {
                response = await handleAdminLogin(request, env);
            } else if (path === "/api/admin/logout" && method === "POST") {
                response = await handleAdminLogout(request, env);
            } else if (path === "/api/admin/me" && method === "GET") {
                response = await handleAdminMe(request, env);
            } else if (path === "/api/admin/stats" && method === "GET") {
                response = await handleAdminStats(request, env);
            }
            // Customer auth routes (public)
            else if (path === "/api/auth/signup" && method === "POST") {
                response = await handleCustomerSignup(request, env);
            } else if (path === "/api/auth/login" && method === "POST") {
                response = await handleCustomerLogin(request, env);
            } else if (path === "/api/auth/logout" && method === "POST") {
                response = await handleCustomerLogout(request, env);
            } else if (path === "/api/auth/me" && method === "GET") {
                response = await handleCustomerMe(request, env);
            } else if (path === "/api/my-orders" && method === "GET") {
                response = await handleMyOrders(request, env);
            }
            // Health check
            else if (path === "/api/health" && method === "GET") {
                response = new Response(JSON.stringify({ status: "ok", timestamp: new Date().toISOString() }), {
                    headers: { "Content-Type": "application/json", ...corsHeaders }
                });
            }
            // Fall through to assets for static files (HTML, CSS, JS, etc.)
            else {
                return env.ASSETS.fetch(request);
            }

            // Add CORS headers to all responses
            Object.entries(corsHeaders).forEach(([key, value]) => {
                response.headers.set(key, value);
            });

            return response;
        } catch (error) {
            console.error("API Error:", error);
            return new Response(JSON.stringify({
                error: "Internal server error",
                message: error.message
            }), {
                status: 500,
                headers: { "Content-Type": "application/json", ...corsHeaders }
            });
        }
    }
};

// =========================
// PRODUCTS HANDLERS
// =========================

async function handleGetProducts(request, env) {
    const url = new URL(request.url);
    const category = url.searchParams.get("category");
    const active = url.searchParams.get("active");
    const featured = url.searchParams.get("featured");
    const search = url.searchParams.get("search");
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "100"), 100);
    const offset = parseInt(url.searchParams.get("offset") || "0");

    let query = "SELECT * FROM products WHERE 1=1";
    const params = [];

    if (category) {
        query += " AND category = ?";
        params.push(category);
    }
    if (active !== null && active !== "") {
        query += " AND active = ?";
        params.push(active === "true" ? 1 : 0);
    }
    if (featured !== null && featured !== "") {
        query += " AND featured = ?";
        params.push(featured === "true" ? 1 : 0);
    }
    if (search) {
        query += " AND (name LIKE ? OR description LIKE ?)";
        const term = `%${search}%`;
        params.push(term, term);
    }

    query += " ORDER BY created_at DESC LIMIT ? OFFSET ?";
    params.push(limit, offset);

    const { results } = await env.DB.prepare(query).bind(...params).all();

    return new Response(JSON.stringify({ products: results }), {
        headers: { "Content-Type": "application/json" }
    });
}

async function handleGetProduct(id, env) {
    const product = await env.DB.prepare("SELECT * FROM products WHERE id = ?").bind(id).first();

    if (!product) {
        return new Response(JSON.stringify({ error: "Product not found" }), {
            status: 404,
            headers: { "Content-Type": "application/json" }
        });
    }

    return new Response(JSON.stringify({ product }), {
        headers: { "Content-Type": "application/json" }
    });
}

async function handleCreateProduct(request, env) {
    const data = await request.json();

    // Validate required fields
    const required = ["name", "slug", "category", "subcategory", "price"];
    for (const field of required) {
        if (!data[field]) {
            return new Response(JSON.stringify({ error: `Missing required field: ${field}` }), {
                status: 400,
                headers: { "Content-Type": "application/json" }
            });
        }
    }

    // Check slug uniqueness
    const existing = await env.DB.prepare("SELECT id FROM products WHERE slug = ?").bind(data.slug).first();
    if (existing) {
        return new Response(JSON.stringify({ error: "Slug already exists" }), {
            status: 409,
            headers: { "Content-Type": "application/json" }
        });
    }

    const id = data.slug; // Use slug as ID for simplicity
    const now = new Date().toISOString();

    await env.DB.prepare(`
        INSERT INTO products (id, name, slug, category, subcategory, price, compare_price, description, details,
            image_hero, image_lifestyle, image_detail, badge, rating, review_count, featured, active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
        id,
        data.name,
        data.slug,
        data.category,
        data.subcategory,
        data.price,
        data.compare_price || null,
        data.description || null,
        data.details || null,
        data.image_hero || null,
        data.image_lifestyle || null,
        data.image_detail || null,
        data.badge || null,
        data.rating || 0,
        data.review_count || 0,
        data.featured ? 1 : 0,
        data.active ? 1 : 0,
        now,
        now
    ).run();

    const product = await env.DB.prepare("SELECT * FROM products WHERE id = ?").bind(id).first();

    return new Response(JSON.stringify({ product }), {
        status: 201,
        headers: { "Content-Type": "application/json" }
    });
}

async function handleUpdateProduct(id, request, env) {
    const data = await request.json();

    const product = await env.DB.prepare("SELECT * FROM products WHERE id = ?").bind(id).first();
    if (!product) {
        return new Response(JSON.stringify({ error: "Product not found" }), {
            status: 404,
            headers: { "Content-Type": "application/json" }
        });
    }

    // Check slug uniqueness if changing
    if (data.slug && data.slug !== product.slug) {
        const existing = await env.DB.prepare("SELECT id FROM products WHERE slug = ?").bind(data.slug).first();
        if (existing) {
            return new Response(JSON.stringify({ error: "Slug already exists" }), {
                status: 409,
                headers: { "Content-Type": "application/json" }
            });
        }
    }

    const now = new Date().toISOString();
    const updates = [];
    const params = [];

    const allowedFields = [
        "name", "slug", "category", "subcategory", "price", "compare_price",
        "description", "details", "image_hero", "image_lifestyle", "image_detail",
        "badge", "rating", "review_count", "featured", "active"
    ];

    for (const field of allowedFields) {
        if (data[field] !== undefined) {
            updates.push(`${field} = ?`);
            params.push(field === "featured" || field === "active" ? (data[field] ? 1 : 0) : data[field]);
        }
    }

    if (updates.length === 0) {
        return new Response(JSON.stringify({ error: "No valid fields to update" }), {
            status: 400,
            headers: { "Content-Type": "application/json" }
        });
    }

    updates.push("updated_at = ?");
    params.push(now);
    params.push(id);

    await env.DB.prepare(`UPDATE products SET ${updates.join(", ")} WHERE id = ?`).bind(...params).run();

    const updated = await env.DB.prepare("SELECT * FROM products WHERE id = ?").bind(id).first();

    return new Response(JSON.stringify({ product: updated }), {
        headers: { "Content-Type": "application/json" }
    });
}

async function handleDeleteProduct(id, env) {
    // Soft delete - set active = 0
    const product = await env.DB.prepare("SELECT * FROM products WHERE id = ?").bind(id).first();
    if (!product) {
        return new Response(JSON.stringify({ error: "Product not found" }), {
            status: 404,
            headers: { "Content-Type": "application/json" }
        });
    }

    await env.DB.prepare("UPDATE products SET active = 0, updated_at = ? WHERE id = ?")
        .bind(new Date().toISOString(), id).run();

    return new Response(JSON.stringify({ success: true, message: "Product deactivated" }), {
        headers: { "Content-Type": "application/json" }
    });
}

// =========================
// ORDERS HANDLERS
// =========================

async function handleGetOrders(request, env) {
    const url = new URL(request.url);
    const status = url.searchParams.get("status");
    const limit = parseInt(url.searchParams.get("limit") || "100");
    const offset = parseInt(url.searchParams.get("offset") || "0");

    let query = `
        SELECT o.*, COUNT(oi.id) as item_count
        FROM orders o
        LEFT JOIN order_items oi ON o.id = oi.order_id
        WHERE 1=1
    `;
    const params = [];

    if (status) {
        query += " AND o.status = ?";
        params.push(status);
    }

    query += " GROUP BY o.id ORDER BY o.created_at DESC LIMIT ? OFFSET ?";
    params.push(limit, offset);

    const { results } = await env.DB.prepare(query).bind(...params).all();

    return new Response(JSON.stringify({ orders: results }), {
        headers: { "Content-Type": "application/json" }
    });
}

async function handleGetOrder(id, env) {
    const order = await env.DB.prepare("SELECT * FROM orders WHERE id = ?").bind(id).first();
    if (!order) {
        return new Response(JSON.stringify({ error: "Order not found" }), {
            status: 404,
            headers: { "Content-Type": "application/json" }
        });
    }

    const { results: items } = await env.DB.prepare("SELECT * FROM order_items WHERE order_id = ?").bind(id).all();

    return new Response(JSON.stringify({ order: { ...order, items } }), {
        headers: { "Content-Type": "application/json" }
    });
}

async function handleUpdateOrder(id, request, env) {
    const data = await request.json();

    const order = await env.DB.prepare("SELECT * FROM orders WHERE id = ?").bind(id).first();
    if (!order) {
        return new Response(JSON.stringify({ error: "Order not found" }), {
            status: 404,
            headers: { "Content-Type": "application/json" }
        });
    }

    const allowedFields = ["status", "shipping_name", "shipping_email", "shipping_phone", "shipping_address", "shipping_city", "shipping_country"];
    const updates = [];
    const params = [];

    for (const field of allowedFields) {
        if (data[field] !== undefined) {
            updates.push(`${field} = ?`);
            params.push(data[field]);
        }
    }

    if (updates.length === 0) {
        return new Response(JSON.stringify({ error: "No valid fields to update" }), {
            status: 400,
            headers: { "Content-Type": "application/json" }
        });
    }

    updates.push("updated_at = ?");
    params.push(new Date().toISOString());
    params.push(id);

    await env.DB.prepare(`UPDATE orders SET ${updates.join(", ")} WHERE id = ?`).bind(...params).run();

    const updated = await env.DB.prepare("SELECT * FROM orders WHERE id = ?").bind(id).first();

    return new Response(JSON.stringify({ order: updated }), {
        headers: { "Content-Type": "application/json" }
    });
}

// =========================
// CUSTOMERS HANDLERS
// =========================

async function handleGetCustomers(request, env) {
    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get("limit") || "100");
    const offset = parseInt(url.searchParams.get("offset") || "0");

    const query = `
        SELECT c.*,
            COUNT(o.id) as order_count,
            COALESCE(SUM(o.total), 0) as total_spent
        FROM customers c
        LEFT JOIN orders o ON c.id = o.customer_id
        GROUP BY c.id
        ORDER BY c.created_at DESC
        LIMIT ? OFFSET ?
    `;

    const { results } = await env.DB.prepare(query).bind(limit, offset).all();

    return new Response(JSON.stringify({ customers: results }), {
        headers: { "Content-Type": "application/json" }
    });
}

async function handleGetCustomer(id, env) {
    const customer = await env.DB.prepare("SELECT * FROM customers WHERE id = ?").bind(id).first();
    if (!customer) {
        return new Response(JSON.stringify({ error: "Customer not found" }), {
            status: 404,
            headers: { "Content-Type": "application/json" }
        });
    }

    const { results: orders } = await env.DB.prepare("SELECT * FROM orders WHERE customer_id = ? ORDER BY created_at DESC").bind(id).all();

    return new Response(JSON.stringify({ customer: { ...customer, orders } }), {
        headers: { "Content-Type": "application/json" }
    });
}

// =========================
// SETTINGS HANDLERS
// =========================

async function handleGetSettings(env) {
    const { results } = await env.DB.prepare("SELECT * FROM settings").all();
    const settings = {};
    results.forEach(row => {
        settings[row.key] = row.value;
    });

    return new Response(JSON.stringify({ settings }), {
        headers: { "Content-Type": "application/json" }
    });
}

async function handleUpdateSettings(request, env) {
    const data = await request.json();

    const allowedKeys = ["store_name", "store_email", "currency", "shipping_fee"];
    const updates = [];

    for (const key of allowedKeys) {
        if (data[key] !== undefined) {
            await env.DB.prepare("UPDATE settings SET value = ? WHERE key = ?").bind(String(data[key]), key).run();
            updates.push(key);
        }
    }

    const { results } = await env.DB.prepare("SELECT * FROM settings").all();
    const settings = {};
    results.forEach(row => {
        settings[row.key] = row.value;
    });

    return new Response(JSON.stringify({ settings, updated: updates }), {
        headers: { "Content-Type": "application/json" }
    });
}

// =========================
// ADMIN AUTH HANDLERS
// =========================

async function handleAdminLogin(request, env) {
    const { email, password } = await request.json();
    if (!email || !password) {
        return jsonResponse({ error: "Email and password required" }, 400);
    }

    const admin = await env.DB.prepare("SELECT * FROM admin_users WHERE email = ?").bind(email).first();
    if (!admin) {
        await incrementFailedLogin(request, env);
        return jsonResponse({ error: "Invalid credentials" }, 401);
    }

    const valid = await verifyPassword(password, admin.password_hash);
    if (!valid) {
        await incrementFailedLogin(request, env);
        return jsonResponse({ error: "Invalid credentials" }, 401);
    }

    await resetFailedLogin(request, env);
    await env.DB.prepare("UPDATE admin_users SET last_login_at = ? WHERE id = ?")
        .bind(new Date().toISOString(), admin.id).run();

    const sid = await createAdminSession(admin, env);
    const headers = { "Content-Type": "application/json" };
    headers["Set-Cookie"] = `x_admin_session=${sid}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=43200`;

    return new Response(JSON.stringify({ ok: true, admin: { email: admin.email, name: admin.name } }), { headers });
}

async function handleAdminLogout(request, env) {
    const cookies = parseCookies(request.headers.get("Cookie"));
    const sid = cookies.x_admin_session;
    if (sid) {
        await deleteAdminSession(sid, env);
    }
    const headers = { "Content-Type": "application/json" };
    headers["Set-Cookie"] = "x_admin_session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0";
    return new Response(JSON.stringify({ ok: true }), { headers });
}

async function handleAdminMe(request, env) {
    const admin = await requireAdmin(request, env);
    if (!admin) {
        return jsonResponse({ error: "Unauthorized" }, 401);
    }
    return jsonResponse({ admin });
}

async function handleAdminStats(request, env) {
    const admin = await requireAdmin(request, env);
    if (!admin) {
        return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const [productsRes, activeRes, ordersRes, customersRes, revenueRes] = await Promise.all([
        env.DB.prepare("SELECT COUNT(*) as c FROM products").first(),
        env.DB.prepare("SELECT COUNT(*) as c FROM products WHERE active = 1").first(),
        env.DB.prepare("SELECT COUNT(*) as c FROM orders").first(),
        env.DB.prepare("SELECT COUNT(*) as c FROM customers").first(),
        env.DB.prepare("SELECT COALESCE(SUM(total), 0) as total FROM orders WHERE status != 'cancelled'").first()
    ]);

    return jsonResponse({
        totalProducts: productsRes?.c ?? 0,
        activeProducts: activeRes?.c ?? 0,
        orders: ordersRes?.c ?? 0,
        customers: customersRes?.c ?? 0,
        revenue: revenueRes?.total ?? 0
    });
}

async function incrementFailedLogin(request, env) {
    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    const key = `ratelimit:login:${ip}`;
    const current = parseInt(await env.SESSIONS.get(key) || "0");
    await env.SESSIONS.put(key, String(current + 1), { expirationTtl: 600 });
}

async function resetFailedLogin(request, env) {
    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    const key = `ratelimit:login:${ip}`;
    await env.SESSIONS.delete(key);
}

function jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { "Content-Type": "application/json" }
    });
}

// =========================
// ORDER CREATION (PUBLIC)
// =========================

function orderError(status, message) {
    const err = new Error(message);
    err.httpStatus = status;
    return err;
}

// Shared order-creation core: validates, prices from D1, inserts the
// pending order. Used by plain checkout AND the Daraja STK route so both
// paths produce identical orders. Throws orderError on validation issues.
async function createPendingOrder(env, data) {
    const { email, firstName, lastName, phone, address, city, postal, country, items, delivery, payment, number } = data || {};

    if (!email || !firstName || !lastName || !address || !city || !postal || !country || !items || !items.length) {
        throw orderError(400, "Missing required fields");
    }

    const deliveryMethod = delivery?.method || "Standard delivery";
    const shipping = deliveryMethod.toLowerCase().includes("express") ? 12 : 5;

    // Look up products and compute subtotal from D1 prices
    let subtotal = 0;
    const orderItems = [];

    for (const item of items) {
        const product = await env.DB.prepare("SELECT id, name, price, active FROM products WHERE id = ?").bind(item.id).first();
        if (!product) {
            throw orderError(400, `Product not found: ${item.id}`);
        }
        if (product.active !== 1) {
            throw orderError(400, `Product not available: ${item.name}`);
        }
        const quantity = Math.max(1, parseInt(item.quantity) || 1);
        const lineTotal = product.price * quantity;
        subtotal += lineTotal;
        orderItems.push({
            product_id: product.id,
            product_name: product.name,
            quantity,
            price: product.price
        });
    }

    const total = subtotal + shipping;
    const orderId = crypto.randomUUID();
    let orderNumber = (typeof number === "string" && /^ELLE[0-9A-Z]{8}$/.test(number.trim().toUpperCase()))
        ? number.trim().toUpperCase()
        : `ELLE${Date.now().toString(36).toUpperCase().slice(-4)}${Math.floor(1000 + Math.random() * 9000)}`;
    const now = new Date().toISOString();
    const payMethod = (payment && payment.method) || "card";
    const payReference = (payment && payment.reference) || null;
    if (payMethod === "paybill" && !payReference) {
        throw orderError(400, "M-Pesa transaction code is required for Paybill orders");
    }

    // Upsert customer by email
    let customer = await env.DB.prepare("SELECT id FROM customers WHERE email = ?").bind(email).first();
    if (!customer) {
        const customerId = crypto.randomUUID();
        await env.DB.prepare(`
            INSERT INTO customers (id, first_name, last_name, email, phone, address, city, country, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(customerId, firstName, lastName, email, phone || null, address, city, country, now).run();
        customer = { id: customerId };
    }

    // Client-supplied order number (Paybill pre-generate flow): keep it when
    // still unused, otherwise fall back to a fresh one.
    try {
        const clash = await env.DB.prepare("SELECT id FROM orders WHERE number = ?").bind(orderNumber).first();
        if (clash) {
            orderNumber = `ELLE${Date.now().toString(36).toUpperCase().slice(-4)}${Math.floor(1000 + Math.random() * 9000)}`;
        }
    } catch (e) {}

    // Insert order and order_items in a batch
    const batch = [];
    batch.push(env.DB.prepare(`
        INSERT INTO orders (id, customer_id, customer_email, number, status, subtotal, shipping, total,
            shipping_name, shipping_email, shipping_phone, shipping_address, shipping_city, shipping_country,
            payment_method, payment_reference, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(orderId, customer.id, email, orderNumber, subtotal, shipping, total,
        `${firstName} ${lastName}`, email, phone || null, address, city, country,
        payMethod, payReference, now, now));

    for (const item of orderItems) {
        batch.push(env.DB.prepare(`
            INSERT INTO order_items (order_id, product_id, product_name, quantity, price)
            VALUES (?, ?, ?, ?, ?)
        `).bind(orderId, item.product_id, item.product_name, item.quantity, item.price));
    }

    await env.DB.batch(batch);

    return {
        orderId, orderNumber, subtotal, shipping, total, orderItems,
        customer: { id: customer.id, email, firstName, lastName, phone: phone || null }
    };
}

async function handleCreateOrder(request, env) {
    let data = null;
    try {
        data = await request.json();
    } catch (e) {
        return jsonResponse({ error: "Invalid JSON body" }, 400);
    }
    try {
        const rec = await createPendingOrder(env, data);
        return jsonResponse({
            order: {
                id: rec.orderId,
                number: rec.orderNumber,
                subtotal: rec.subtotal,
                shipping: rec.shipping,
                total: rec.total,
                items: rec.orderItems.map(i => ({ ...i, lineTotal: i.price * i.quantity }))
            }
        }, 201);
    } catch (e) {
        return jsonResponse({ error: e.message || "Failed to create order" }, e.httpStatus || 500);
    }
}

// =========================
// BANK PAYMENT CALLBACK (PUBLIC, SECRET-VERIFIED)
// Receives I&M Business Connect instant payment notifications for M-Pesa
// Paybill collections. The customer pays with the Elle order number as the
// account reference; this endpoint matches it and flips pending -> paid.
//
// Configure in Cloudflare (never commit the real value):
//   wrangler secret put PAYMENT_CALLBACK_SECRET
// I&M sends: POST /api/payments/callback with a shared-secret header.
// Accepted (flexible keys, since bank specs vary by onboarding):
//   { account_reference | BillRefNumber | account,
//     transaction_id | TransID | transaction,
//     amount | TransAmount, msisdn | MSISDN, business_number }
// Auth:  Authorization: Bearer <secret>  OR  x-callback-secret: <secret>
// =========================

async function handlePaymentCallback(request, env) {
    const secret = env.PAYMENT_CALLBACK_SECRET || env.PAYMENT_SECRET || "";
    if (!secret) {
        return jsonResponse({ error: "Payment callbacks are not configured" }, 503);
    }

    const auth = request.headers.get("authorization") || "";
    const headerSecret = request.headers.get("x-callback-secret") || "";
    const provided = auth.toLowerCase().startsWith("bearer ")
        ? auth.slice(7).trim()
        : headerSecret.trim();
    if (!provided || provided !== secret) {
        return jsonResponse({ error: "Unauthorized" }, 401);
    }

    let body = null;
    try {
        body = await request.json();
    } catch (e) {
        return jsonResponse({ error: "Invalid JSON body" }, 400);
    }
    const data = (body && typeof body === "object") ? body : {};

    const ref = String(
        data.account_reference ?? data.BillRefNumber ?? data.account ??
        data.reference ?? ""
    ).trim().toUpperCase();
    const txId = String(
        data.transaction_id ?? data.TransID ?? data.transaction ??
        data.receipt ?? ""
    ).trim();
    const amountRaw = data.amount ?? data.TransAmount ?? null;
    const amount = amountRaw === null || amountRaw === "" ? null : Number(amountRaw);

    if (!ref) {
        return jsonResponse({ error: "Missing account reference" }, 400);
    }

    return confirmOrderPayment(env, { ref, txId, amount });
}

// Shared paid-flip used by the bank callback, Daraja STK results and C2B
// confirmations. Match by STK checkout id first, else by order number.
// Only ever pending -> paid; amount mismatches are held for manual review.
async function confirmOrderPayment(env, match) {
    const checkoutId = match && match.checkoutId ? String(match.checkoutId) : "";
    const ref = match && match.ref ? String(match.ref).trim().toUpperCase() : "";
    const txId = match && match.txId ? String(match.txId) : "";
    const amount = match ? match.amount : null;

    let order = null;
    if (checkoutId) {
        order = await env.DB.prepare(
            "SELECT * FROM orders WHERE payment_reference = ?"
        ).bind(checkoutId).first();
    }
    if (!order && ref) {
        order = await env.DB.prepare(
            "SELECT * FROM orders WHERE UPPER(number) = ?"
        ).bind(ref).first();
    }
    if (!order) {
        return jsonResponse({ error: "Order not found for reference", reference: ref || checkoutId }, 404);
    }
    if (order.status === "paid") {
        return jsonResponse({ ok: true, already: true, number: order.number });
    }
    if (order.status !== "pending") {
        return jsonResponse({ error: "Order is not payable", status: order.status }, 409);
    }

    // Amount mismatch: record the receipt but keep the order pending for
    // manual review instead of marking the wrong amount paid.
    if (amount !== null && amount !== undefined && Number.isFinite(Number(amount)) &&
        Math.abs(Number(amount) - Number(order.total)) > 0.01) {
        await env.DB.prepare(
            "UPDATE orders SET payment_reference = ?, updated_at = ? WHERE id = ?"
        ).bind(txId || order.payment_reference || null, new Date().toISOString(), order.id).run();
        return jsonResponse({ ok: true, held: true, reason: "amount mismatch", number: order.number }, 202);
    }

    const now = new Date().toISOString();
    await env.DB.prepare(
        "UPDATE orders SET status = 'paid', payment_reference = ?, paid_at = ?, updated_at = ? WHERE id = ?"
    ).bind(txId || order.payment_reference || null, now, now, order.id).run();
    return jsonResponse({ ok: true, number: order.number, paid_at: now });
}

// =========================
// DARAJA (SAFARICOM) INTEGRATION
// All secrets stay server-side. Sandbox by default; set DARAJA_BASE to
// https://api.safaricom.co.ke at go-live (plus production secrets).
// Callback URLs derive from the incoming request origin, so dev and prod
// each register their own host with Safaricom.
// =========================

function darajaBase(env) {
    return (env.DARAJA_BASE || "https://sandbox.safaricom.co.ke").replace(/\/+$/, "");
}

// Nairobi wall-clock in Safaricom's YYYYMMDDHHmmss format.
function darajaTimestamp() {
    const parts = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Africa/Nairobi",
        year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", second: "2-digit",
        hour12: false
    }).formatToParts(new Date());
    const get = (t) => (parts.find((p) => p.type === t) || {}).value || "";
    return get("year") + get("month") + get("day") + get("hour") + get("minute") + get("second");
}

function normalizeMsisdn(raw) {
    const digits = String(raw || "").replace(/\D/g, "");
    let msisdn = "";
    if (/^0[17]\d{8}$/.test(digits)) msisdn = "254" + digits.slice(1);
    else if (/^254[17]\d{8}$/.test(digits)) msisdn = digits;
    return /^254[17]\d{8}$/.test(msisdn) ? msisdn : null;
}

// OAuth token, cached in KV (tokens live ~1 hour).
async function getDarajaToken(env) {
    const key = env.DARAJA_CONSUMER_KEY || "";
    const secret = env.DARAJA_CONSUMER_SECRET || "";
    if (!key || !secret) {
        throw orderError(503, "M-Pesa payments are not configured");
    }
    try {
        const cached = await env.SESSIONS.get("daraja:token", { type: "json" });
        if (cached && cached.token && cached.exp > Date.now() + 60000) {
            return cached.token;
        }
    } catch (e) {}
    const creds = btoa(key + ":" + secret);
    const res = await fetch(darajaBase(env) + "/oauth/v1/generate?grant_type=client_credentials", {
        headers: { Authorization: "Basic " + creds }
    });
    if (!res.ok) {
        throw orderError(502, "Could not reach M-Pesa. Try again or use Paybill.");
    }
    const data = await res.json();
    if (!data.access_token) {
        throw orderError(502, "Could not reach M-Pesa. Try again or use Paybill.");
    }
    const token = data.access_token;
    try {
        await env.SESSIONS.put("daraja:token",
            JSON.stringify({ token, exp: Date.now() + 3500 * 1000 }),
            { expirationTtl: 3500 });
    } catch (e) {}
    return token;
}

async function darajaStkPush(env, origin, { phone, amount, reference }) {
    const shortcode = env.DARAJA_SHORTCODE || "";
    const passkey = env.DARAJA_PASSKEY || "";
    if (!shortcode || !passkey) {
        throw orderError(503, "M-Pesa payments are not configured");
    }
    const token = await getDarajaToken(env);
    const timestamp = darajaTimestamp();
    const password = btoa(shortcode + passkey + timestamp);
    const callbackURL = origin.replace(/\/+$/, "") + "/api/payments/daraja/result";
    const res = await fetch(darajaBase(env) + "/mpesa/stkpush/v1/processrequest", {
        method: "POST",
        headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify({
            BusinessShortCode: shortcode,
            Password: password,
            Timestamp: timestamp,
            TransactionType: "CustomerPayBillOnline",
            Amount: Math.max(1, Math.round(Number(amount) || 0)),
            PartyA: phone,
            PartyB: shortcode,
            PhoneNumber: phone,
            CallBackURL: callbackURL,
            AccountReference: reference,
            TransactionDesc: "Elle order " + reference
        })
    });
    let data = null;
    try {
        data = await res.json();
    } catch (e) {
        throw orderError(502, "Could not reach M-Pesa. Try again or use Paybill.");
    }
    if (!res.ok || String(data.ResponseCode) !== "0" || !data.CheckoutRequestID) {
        throw orderError(502, "M-Pesa did not accept the request. Try again or use Paybill.");
    }
    return data;
}

// POST /api/payments/stk — creates the pending order, then pushes the STK
// prompt. Body = same order fields as /api/orders, plus msisdn.
async function handleStkPush(request, env) {
    let data = null;
    try {
        data = await request.json();
    } catch (e) {
        return jsonResponse({ error: "Invalid JSON body" }, 400);
    }
    const phone = normalizeMsisdn((data && (data.msisdn || data.phone)) || "");
    if (!phone) {
        return jsonResponse({ error: "Enter a valid M-Pesa phone number (07… or 01…)" }, 400);
    }
    let rec = null;
    try {
        rec = await createPendingOrder(env, Object.assign({}, data, {
            payment: { method: "stk", reference: "" }
        }));
    } catch (e) {
        return jsonResponse({ error: e.message || "Failed to create order" }, e.httpStatus || 500);
    }
    const origin = new URL(request.url).origin;
    let stk = null;
    try {
        stk = await darajaStkPush(env, origin, { phone, amount: rec.total, reference: rec.orderNumber });
    } catch (e) {
        return jsonResponse({ error: e.message || "Could not reach M-Pesa", number: rec.orderNumber }, e.httpStatus || 502);
    }
    try {
        await env.DB.prepare("UPDATE orders SET payment_reference = ? WHERE id = ?")
            .bind(stk.CheckoutRequestID, rec.orderId).run();
    } catch (e) {}
    return jsonResponse({
        ok: true,
        number: rec.orderNumber,
        total: rec.total,
        checkoutRequestId: stk.CheckoutRequestID
    }, 201);
}

// Daraja STK result + timeout callbacks. Failures simply leave the order
// pending so the customer can retry; only exact-amount successes flip paid.
async function handleDarajaResult(request, env) {
    let body = null;
    try {
        body = await request.json();
    } catch (e) {
        return jsonResponse({ ok: true });
    }
    const cb = body && body.Body && body.Body.stkCallback;
    if (!cb) {
        return jsonResponse({ ok: true });
    }
    if (Number(cb.ResultCode) !== 0) {
        return jsonResponse({ ok: true, noted: cb.ResultDesc || "failed" });
    }
    const meta = {};
    const items = (cb.CallbackMetadata && cb.CallbackMetadata.Item) || [];
    items.forEach((entry) => {
        if (entry && entry.Name) meta[entry.Name] = entry.Value;
    });
    return confirmOrderPayment(env, {
        checkoutId: cb.CheckoutRequestID || "",
        txId: meta.MpesaReceiptNumber ? String(meta.MpesaReceiptNumber) : "",
        amount: meta.Amount !== undefined ? Number(meta.Amount) : null
    });
}

// C2B validation: accept anything well-formed; matching happens on confirm.
async function handleDarajaValidate(request, env) {
    return jsonResponse({ ResultCode: 0, ResultDesc: "Accepted" });
}

// C2B confirmation: manual 542542 payments auto-confirm here.
async function handleDarajaConfirm(request, env) {
    let data = null;
    try {
        data = await request.json();
    } catch (e) {
        return jsonResponse({ ResultCode: 1, ResultDesc: "Rejected" });
    }
    const ref = String(data.BillRefNumber ?? data.reference ?? "").trim();
    if (!ref) {
        return jsonResponse({ ResultCode: 1, ResultDesc: "Rejected" });
    }
    const res = await confirmOrderPayment(env, {
        ref,
        txId: String(data.TransID ?? data.transaction ?? ""),
        amount: data.TransAmount !== undefined ? Number(data.TransAmount) : null
    });
    // C2B expects ResultCode semantics; a held/missing match stays pending
    // for review, which C2B treats as completion of the callback either way.
    return jsonResponse({ ResultCode: 0, ResultDesc: "Accepted" });
}

// Public order-status peek for the checkout waiting room: number + status
// only, so nothing sensitive leaks.
async function handlePaymentStatus(request, env, number) {
    const ref = String(number || "").trim().toUpperCase();
    if (!/^ELLE[0-9A-Z]{8}$/.test(ref)) {
        return jsonResponse({ error: "Unknown order" }, 404);
    }
    const order = await env.DB.prepare(
        "SELECT number, status, total FROM orders WHERE number = ?"
    ).bind(ref).first();
    if (!order) {
        return jsonResponse({ error: "Unknown order" }, 404);
    }
    return jsonResponse({ number: order.number, status: order.status, total: order.total });
}

// =========================
// CUSTOMER CREATE/UPDATE (PROTECTED)
// =========================

async function handleCreateCustomer(request, env) {
    const data = await request.json();
    const { email, firstName, lastName, phone, address, city, country } = data;
    
    if (!email || !firstName || !lastName) {
        return jsonResponse({ error: "Missing required fields" }, 400);
    }
    
    const existing = await env.DB.prepare("SELECT id FROM customers WHERE email = ?").bind(email).first();
    if (existing) {
        return jsonResponse({ error: "Customer with this email already exists" }, 409);
    }
    
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    
    await env.DB.prepare(`
        INSERT INTO customers (id, first_name, last_name, email, phone, address, city, country, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(id, firstName, lastName, email, phone || null, address || null, city || null, country || null, now).run();
    
    const customer = await env.DB.prepare("SELECT * FROM customers WHERE id = ?").bind(id).first();
    return jsonResponse({ customer }, 201);
}

async function handleUpdateCustomer(id, request, env) {
    const data = await request.json();
    
    const customer = await env.DB.prepare("SELECT * FROM customers WHERE id = ?").bind(id).first();
    if (!customer) {
        return jsonResponse({ error: "Customer not found" }, 404);
    }
    
    const allowedFields = ["first_name", "last_name", "email", "phone", "address", "city", "country"];
    const updates = [];
    const params = [];
    
    for (const field of allowedFields) {
        if (data[field] !== undefined) {
            updates.push(`${field} = ?`);
            params.push(data[field]);
        }
    }
    
    if (updates.length === 0) {
        return jsonResponse({ error: "No valid fields to update" }, 400);
    }
    
    params.push(id);
    await env.DB.prepare(`UPDATE customers SET ${updates.join(", ")} WHERE id = ?`).bind(...params).run();
    
    const updated = await env.DB.prepare("SELECT * FROM customers WHERE id = ?").bind(id).first();
    return jsonResponse({ customer: updated });
}

// =========================
// CUSTOMER AUTH HANDLERS
// =========================

async function createCustomerSession(customer, env) {
    const sid = crypto.randomUUID();
    const sessionData = JSON.stringify({ id: customer.id, email: customer.email });
    await env.SESSIONS.put(`cust:${sid}`, sessionData, { expirationTtl: 2592000 });
    return sid;
}

async function deleteCustomerSession(sid, env) {
    await env.SESSIONS.delete(`cust:${sid}`);
}

async function validateCustomerSession(sid, env) {
    const session = await env.SESSIONS.get(`cust:${sid}`);
    if (!session) return null;
    try { return JSON.parse(session); } catch { return null; }
}

async function requireCustomer(request, env) {
    const cookies = parseCookies(request.headers.get("Cookie"));
    const sid = cookies.x_cust_session;
    if (!sid) return null;
    return await validateCustomerSession(sid, env);
}

async function handleCustomerSignup(request, env) {
    const { firstName, lastName, email, password } = await request.json();
    if (!firstName || !lastName || !email || !password) {
        return jsonResponse({ error: "All fields required" }, 400);
    }
    if (password.length < 8) {
        return jsonResponse({ error: "Password must be at least 8 characters" }, 400);
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return jsonResponse({ error: "Invalid email format" }, 400);
    }
    
    const existing = await env.DB.prepare("SELECT id FROM customers WHERE email = ?").bind(email).first();
    if (existing) {
        return jsonResponse({ error: "Email already registered" }, 409);
    }
    
    const passwordHash = await hashPassword(password);
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    
    await env.DB.prepare(`
        INSERT INTO customers (id, first_name, last_name, email, password_hash, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
    `).bind(id, firstName, lastName, email, passwordHash, now).run();
    
    const customer = { id, firstName, lastName, email };
    const sid = await createCustomerSession(customer, env);
    const headers = { "Content-Type": "application/json" };
    headers["Set-Cookie"] = `x_cust_session=${sid}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000`;
    
    return new Response(JSON.stringify({ ok: true, customer: { firstName, lastName, email } }), { headers });
}

async function handleCustomerLogin(request, env) {
    const { email, password } = await request.json();
    if (!email || !password) {
        return jsonResponse({ error: "Email and password required" }, 400);
    }
    
    const customer = await env.DB.prepare("SELECT * FROM customers WHERE email = ?").bind(email).first();
    if (!customer || !customer.password_hash) {
        return jsonResponse({ error: "Invalid credentials" }, 401);
    }
    
    const valid = await verifyPassword(password, customer.password_hash);
    if (!valid) {
        return jsonResponse({ error: "Invalid credentials" }, 401);
    }
    
    const sid = await createCustomerSession(customer, env);
    const headers = { "Content-Type": "application/json" };
    headers["Set-Cookie"] = `x_cust_session=${sid}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000`;
    
    return new Response(JSON.stringify({ ok: true, customer: { firstName: customer.first_name, lastName: customer.last_name, email: customer.email } }), { headers });
}

async function handleCustomerLogout(request, env) {
    const cookies = parseCookies(request.headers.get("Cookie"));
    const sid = cookies.x_cust_session;
    if (sid) await deleteCustomerSession(sid, env);
    const headers = { "Content-Type": "application/json" };
    headers["Set-Cookie"] = "x_cust_session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0";
    return new Response(JSON.stringify({ ok: true }), { headers });
}

async function handleCustomerMe(request, env) {
    const customer = await requireCustomer(request, env);
    if (!customer) return jsonResponse({ error: "Unauthorized" }, 401);
    const full = await env.DB.prepare("SELECT id, first_name, last_name, email, phone, address, city, country FROM customers WHERE id = ?").bind(customer.id).first();
    return jsonResponse({ customer: full });
}

async function handleMyOrders(request, env) {
    const customer = await requireCustomer(request, env);
    if (!customer) return jsonResponse({ error: "Unauthorized" }, 401);
    
    const { results } = await env.DB.prepare(`
        SELECT o.*, COUNT(oi.id) as item_count
        FROM orders o
        LEFT JOIN order_items oi ON o.id = oi.order_id
        WHERE o.customer_email = ?
        GROUP BY o.id
        ORDER BY o.created_at DESC
    `).bind(customer.email).all();
    
    return jsonResponse({ orders: results });
}