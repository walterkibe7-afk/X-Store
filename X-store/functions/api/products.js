/**
 * X Store API Worker
 * Main entry point for Cloudflare Worker
 */

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
            } else if (path.match(/^\/api\/orders\/[^/]+$/) && method === "GET") {
                const id = path.split("/").pop();
                response = await handleGetOrder(id, env);
            } else if (path.match(/^\/api\/orders\/[^/]+$/) && method === "PUT") {
                const id = path.split("/").pop();
                response = await handleUpdateOrder(id, request, env);
            }
            // Customers routes
            else if (path === "/api/customers" && method === "GET") {
                response = await handleGetCustomers(request, env);
            } else if (path.match(/^\/api\/customers\/[^/]+$/) && method === "GET") {
                const id = path.split("/").pop();
                response = await handleGetCustomer(id, env);
            }
            // Settings routes
            else if (path === "/api/settings" && method === "GET") {
                response = await handleGetSettings(env);
            } else if (path === "/api/settings" && method === "PUT") {
                response = await handleUpdateSettings(request, env);
            }
            // Health check
            else if (path === "/api/health" && method === "GET") {
                response = new Response(JSON.stringify({ status: "ok", timestamp: new Date().toISOString() }), {
                    headers: { "Content-Type": "application/json", ...corsHeaders }
                });
            }
            else {
                response = new Response(JSON.stringify({ error: "Not found" }), {
                    status: 404,
                    headers: { "Content-Type": "application/json", ...corsHeaders }
                });
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
    const limit = parseInt(url.searchParams.get("limit") || "100");
    const offset = parseInt(url.searchParams.get("offset") || "0");

    let query = "SELECT * FROM products WHERE 1=1";
    const params = [];

    if (category) {
        query += " AND category = ?";
        params.push(category);
    }
    if (active !== null) {
        query += " AND active = ?";
        params.push(active === "true" ? 1 : 0);
    }
    if (featured !== null) {
        query += " AND featured = ?";
        params.push(featured === "true" ? 1 : 0);
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