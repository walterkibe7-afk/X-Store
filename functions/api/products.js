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

// =========================
// ASSET RESPONSE CACHE + GZIP
// =========================

// Content types worth gzipping (text-ish only; images/videos stay as-is).
const COMPRESSIBLE_TYPES = /^(text\/|application\/json|application\/javascript|application\/x-javascript|text\/css|text\/xml|application\/xml|application\/manifest\+json|image\/svg\+xml)/i;

// Cache-Control per component type (the "Expires header" requirement):
//   HTML pages      -> no-cache, so edits show up immediately
//   CSS / JS / JSON -> 30 days + immutable (content is rebuilt into dist/)
//   images / fonts  -> 1 year + immutable
//   everything else -> 1 day
function assetCacheControl(contentType) {
    if (!contentType) return "public, max-age=3600";
    if (contentType.includes("text/html")) return "no-cache";
    if (/(javascript|css|json)/.test(contentType)) return "public, max-age=2592000, immutable";
    if (/(image\/|font\/|woff|svg)/.test(contentType)) return "public, max-age=31536000, immutable";
    return "public, max-age=86400";
}

// Serve a static asset with Cache-Control (compression handled by Cloudflare edge).
async function serveAsset(request, env) {
    const response = await env.ASSETS.fetch(request);
    const headers = new Headers(response.headers);
    let contentType = headers.get("Content-Type") || "";
    
    // Ensure charset for text/html
    if (contentType.includes("text/html") && !contentType.includes("charset")) {
        contentType = contentType + "; charset=utf-8";
    }
    headers.set("Content-Type", contentType);
    headers.set("Cache-Control", assetCacheControl(contentType));
    headers.set("Vary", "Accept-Encoding");

    // Security headers for assets
    const isProduction = request.url.startsWith("https://");
    const securityHeaders = {
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
        "X-XSS-Protection": "1; mode=block",
        "Referrer-Policy": "strict-origin-when-cross-origin",
        "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
        "Content-Security-Policy": "default-src 'self'; script-src 'self' 'sha256-GN17Af5JTCgsTuG7anjYPflH/7ifBbNYYalLV2mGIwU=' https://fonts.googleapis.com https://accounts.google.com https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https: https://lh3.googleusercontent.com; connect-src 'self' https://fonts.googleapis.com https://accounts.google.com https://challenges.cloudflare.com; frame-src 'self' https://accounts.google.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
    };
    if (isProduction) {
        securityHeaders["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains; preload";
    }
    Object.entries(securityHeaders).forEach(([key, value]) => {
        headers.set(key, value);
    });

    // Inject Turnstile site key into HTML (placeholder is empty-safe for demo)
    let finalBody;
    if (contentType.includes("text/html")) {
        let body = await response.text();
        const siteKey = env.TURNSTILE_SITE_KEY || "";
        body = body.replace(/__TURNSTILE_SITE_KEY__/g, siteKey);
        finalBody = body;
    } else {
        finalBody = response.body;
    }

    return new Response(finalBody, {
        status: response.status,
        statusText: response.statusText,
        headers
    });
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

        // Correlate all log lines emitted during this request.
        currentReqId = crypto.randomUUID();

        // CSRF: reject state-changing requests whose Origin/Referer is a
        // foreign origin (classic CSRF). Same-origin requests pass with or
        // without an Origin header; only a present, MISMATCHED origin is
        // rejected. Server-to-server payment callbacks are exempt (they carry
        // their own webhook signature, not a browser cookie session).
        const reqOrigin = new URL(request.url).origin;
        const isPaymentCallback = path.startsWith("/api/payments/callback")
            || path.startsWith("/api/payments/daraja/");
        if (["POST", "PUT", "DELETE"].includes(method) && !isPaymentCallback) {
            const origin = request.headers.get("Origin") || request.headers.get("Referer");
            if (origin) {
                let requestedOrigin = "";
                try { requestedOrigin = new URL(origin).origin; } catch { requestedOrigin = ""; }
                if (requestedOrigin && requestedOrigin !== reqOrigin) {
                    logReq("warn", "CSRF: rejected cross-origin request", { path, method, origin });
                    return jsonResponse({ error: "Cross-origin request not allowed" }, 403);
                }
            }
        }

        // CORS: echo Origin only if same-origin or matching PROD_DOMAIN;
        // otherwise omit Allow-Origin so the browser blocks the cross-origin
        // read. Methods/headers lists stay constant.
        const origin = request.headers.get("Origin");
        const prodDomain = env.PROD_DOMAIN ? `https://${env.PROD_DOMAIN}` : "";
        const corsOrigin = (origin && (origin === reqOrigin || (prodDomain && origin === prodDomain)))
            ? origin : null;
        const corsHeaders = {
            "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
        };
        if (corsOrigin) {
            corsHeaders["Access-Control-Allow-Origin"] = corsOrigin;
            corsHeaders["Vary"] = "Origin";
        }

        // Security headers for all responses
        const isProduction = request.url.startsWith("https://");
        const securityHeaders = {
            "X-Content-Type-Options": "nosniff",
            "X-Frame-Options": "DENY",
            "X-XSS-Protection": "1; mode=block",
            "Referrer-Policy": "strict-origin-when-cross-origin",
            "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
            "Content-Security-Policy": "default-src 'self'; script-src 'self' 'sha256-GN17Af5JTCgsTuG7anjYPflH/7ifBbNYYalLV2mGIwU=' https://fonts.googleapis.com https://accounts.google.com https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https: https://lh3.googleusercontent.com; connect-src 'self' https://fonts.googleapis.com https://accounts.google.com https://challenges.cloudflare.com; frame-src 'self' https://accounts.google.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
        };
        if (isProduction) {
            securityHeaders["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains; preload";
        }

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
                logReq("warn", "Unauthorized access attempt", { path, method });
                return jsonResponse({ error: "Unauthorized" }, 401);
            }
        }

        try {
            let response;

            // Products routes
            if (path === "/api/products" && method === "GET") {
                response = await handleGetProducts(request, env);
                // Admin dashboard must always see fresh prices: never let a
                // logged-in admin read sit in any cache. Public storefront can
                // still use the short 60s CDN cache.
                const authed = await requireAdmin(request, env);
                if (authed) {
                    response.headers.set("Cache-Control", "no-store");
                    response.headers.delete("CDN-Cache-Control");
                } else {
                    response.headers.set("Cache-Control", "public, max-age=60");
                    response.headers.set("CDN-Cache-Control", "public, max-age=60");
                    response.headers.set("Vary", "Accept-Encoding");
                }
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
            } else if (path === "/api/auth/google" && method === "POST") {
                response = await handleGoogleAuth(request, env);
            } else if (path === "/api/auth/forgot-password" && method === "POST") {
                response = await handleForgotPassword(request, env);
            } else if (path === "/api/auth/reset-password" && method === "POST") {
                response = await handleResetPassword(request, env);
            } else if (path === "/api/auth/logout" && method === "POST") {
                response = await handleCustomerLogout(request, env);
            } else if (path === "/api/auth/me" && method === "GET") {
                response = await handleCustomerMe(request, env);
            } else if (path === "/api/my-orders" && method === "GET") {
                response = await handleMyOrders(request, env);
            }
            // Health check
            else if (path === "/api/health" && method === "GET") {
                response = jsonResponse({ status: "ok", timestamp: new Date().toISOString() });
                Object.entries(corsHeaders).forEach(([key, value]) => {
                    if (key === "Vary" && response.headers.has(key)) {
                        response.headers.append(key, value);
                    } else {
                        response.headers.set(key, value);
                    }
                });
            }
            // Unknown /api/* path -> JSON 404 (never HTML for API clients)
            else if (path.startsWith("/api/")) {
                logReq("warn", "Unknown API route", { path, method });
                response = jsonResponse({ error: "Not found" }, 404);
            }
            // Static files served directly (robots.txt, llms.txt)
            else if (path === "/robots.txt" && method === "GET") {
                response = new Response(`User-agent: *
Allow: /
Disallow: /admin/
Disallow: /api/
Sitemap: https://x-store-prod.walterkibe7.workers.dev/sitemap.xml
`, {
                    headers: { "Content-Type": "text/plain" }
                });
            }
            else if (path === "/llms.txt" && method === "GET") {
                response = new Response(`# Elle Store
An intimate wellness store offering curated personal care products.

## Products
- [Silk Touch](https://x-store-prod.walterkibe7.workers.dev/product.html?id=silk-touch) - Premium intimate toy
- [After Dark Oil](https://x-store-prod.walterkibe7.workers.dev/product.html?id=after-dark-oil) - Body & massage oil
- [Midnight Gummies](https://x-store-prod.walterkibe7.workers.dev/product.html?id=midnight-gummies) - Nightly wellness gummies
- [Velvet Mini](https://x-store-prod.walterkibe7.workers.dev/product.html?id=velvet-mini) - Compact intimate toy
- [Slow Down Oil](https://x-store-prod.walterkibe7.workers.dev/product.html?id=slow-down-oil) - Warm massage oil
- [Luna](https://x-store-prod.walterkibe7.workers.dev/product.html?id=luna) - Sculpted intimate toy
- [Night Ritual](https://x-store-prod.walterkibe7.workers.dev/product.html?id=night-ritual) - Pillow mist & body serum
- [The Duo](https://x-store-prod.walterkibe7.workers.dev/product.html?id=the-duo) - Gift set of best sellers

## Pages
- [Home](https://x-store-prod.walterkibe7.workers.dev/)
- [Shop](https://x-store-prod.walterkibe7.workers.dev/shop.html)
- [Product](https://x-store-prod.walterkibe7.workers.dev/product.html?id=silk-touch)
- [Cart](https://x-store-prod.walterkibe7.workers.dev/cart.html)
- [Checkout](https://x-store-prod.walterkibe7.workers.dev/checkout.html)
- [Account](https://x-store-prod.walterkibe7.workers.dev/account.html)
- [Login](https://x-store-prod.walterkibe7.workers.dev/login.html)
- [Signup](https://x-store-prod.walterkibe7.workers.dev/signup.html)

## API
- Products: GET /api/products ([docs](https://x-store-prod.walterkibe7.workers.dev/shop.html))
- Orders: POST /api/orders
- Admin: POST /api/admin/login
`, {
                    headers: { "Content-Type": "text/plain" }
                });
            }
            // Fall through to assets for static files (HTML, CSS, JS, etc.)
            // with Cache-Control + gzip applied.
            else {
                return serveAsset(request, env);
            }

            // Add CORS headers to all responses
            Object.entries(corsHeaders).forEach(([key, value]) => {
                if (key === "Vary" && response.headers.has(key)) {
                    response.headers.append(key, value);
                } else {
                    response.headers.set(key, value);
                }
            });

            // Add security headers to all responses
            Object.entries(securityHeaders).forEach(([key, value]) => {
                response.headers.set(key, value);
            });

            // Cache policy for API responses: respect Cache-Control set above
            // (admin product reads = no-store from the auth check above,
            // product lookups = no-store from handleGetProduct); only apply
            // the public 60s CDN cache for unauthenticated product-list reads.
            if (path === "/api/products" || path.match(/^\/api\/products\/[^/]+$/)) {
                if (!response.headers.get("Cache-Control")) {
                    response.headers.set("Cache-Control", "public, max-age=60");
                }
            } else {
                response.headers.set("Cache-Control", "no-store");
            }

            return response;
        } catch (error) {
            logError(error, { path, method });
            return new Response(JSON.stringify({
                error: "Internal server error"
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
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
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
    const defaultStock = typeof data.stock === "number" ? data.stock : 1000;

    await env.DB.prepare(`
        INSERT INTO products (id, name, slug, category, subcategory, price, compare_price, description, details,
            image_hero, image_lifestyle, image_detail, badge, rating, review_count, featured, active, stock, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        defaultStock,
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
        "badge", "rating", "review_count", "featured", "active", "stock"
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
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
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
        headers: { "Content-Type": "application/json; charset=utf-8" }
    });
}

// =========================
// SHARED HELPERS (IP, RATE LIMIT, SAFE LOGGING, WEBHOOK VERIFICATION)
// =========================

// Extract the real client IP from Cloudflare edge headers.
function getClientIP(request) {
    return request.headers.get("CF-Connecting-IP") ||
        (request.headers.get("X-Forwarded-For") || "").split(",")[0].trim() ||
        "unknown";
}

// KV-backed sliding-window rate limiter.
// Returns true when the request is allowed (and increments the counter),
// false when the limit has been exceeded.
async function rateLimit(env, key, maxRequests, windowSeconds) {
    if (!env || !env.SESSIONS) return true;
    try {
        const current = parseInt(await env.SESSIONS.get(key) || "0", 10);
        if (current >= maxRequests) {
            return false;
        }
        await env.SESSIONS.put(key, String(current + 1), { expirationTtl: windowSeconds });
        return true;
    } catch (e) {
        return true;
    }
}

// Sensitive field names that must never appear in logs.
const SENSITIVE_FIELDS = [
    "password", "password_hash", "mpesa_passkey", "auth_token",
    "token", "authorization", "secret", "x-callback-secret",
];

// Recursively redact sensitive keys from an object/array before logging.
function scrubSensitive(obj) {
    if (obj === null || typeof obj !== "object") return obj;
    if (Array.isArray(obj)) return obj.map(scrubSensitive);
    const scrubbed = {};
    for (const [key, value] of Object.entries(obj)) {
        if (SENSITIVE_FIELDS.some(s => key.toLowerCase() === s)) {
            scrubbed[key] = "[REDACTED]";
        } else {
            scrubbed[key] = scrubSensitive(value);
        }
    }
    return scrubbed;
}

// Per-request correlation id. Set once per request in fetch() so every
// log line emitted during that request can be traced together.
let currentReqId = "";

// Central structured logger. Emits one JSON line per event with a level,
// the current request id, and context scrubbed of sensitive fields
// (passwords, tokens, secrets, etc.) so they can never leak into logs.
function logReq(level, message, extra = {}) {
    const con = level === "info" ? console.info : level === "warn" ? console.warn : console.error;
    const entry = {
        timestamp: new Date().toISOString(),
        level,
        reqId: currentReqId,
        message,
        ...scrubSensitive(extra),
    };
    con(JSON.stringify(entry));
}

// Backwards-compatible error logger -> delegates to logReq("error", ...).
function logError(error, context = {}) {
    const extra = { path: context.path, method: context.method, context: context.context || {} };
    if (error instanceof Error && error.stack) extra.stack = error.stack;
    logReq("error", error instanceof Error ? error.message : String(error), extra);
}

// Verify a shared webhook secret from one of: query param, Authorization:
// Bearer, x-webhook-secret, or the legacy x-callback-secret header.
// Returns { valid: true } on success, { valid: false, reason } otherwise.
function verifyWebhookSecret(request, env) {
    const secret = env.WEBHOOK_SECRET || env.PAYMENT_CALLBACK_SECRET || "";
    if (!secret) {
        return { valid: false, reason: "not_configured" };
    }
    // URL query parameter
    const url = new URL(request.url);
    const querySecret = url.searchParams.get("secret") ||
        url.searchParams.get("webhook_secret") ||
        url.searchParams.get("token") || "";
    if (querySecret && querySecret === secret) {
        return { valid: true };
    }
    // Authorization: Bearer <secret>
    const auth = request.headers.get("Authorization") || "";
    if (auth.toLowerCase().startsWith("bearer ") && auth.slice(7).trim() === secret) {
        return { valid: true };
    }
    // x-webhook-secret header
    const hw = request.headers.get("x-webhook-secret") || "";
    if (hw && hw.trim() === secret) {
        return { valid: true };
    }
    // Legacy x-callback-secret header
    const cb = request.headers.get("x-callback-secret") || "";
    if (cb && cb.trim() === secret) {
        return { valid: true };
    }
    return { valid: false, reason: "invalid_secret" };
}

// Verify Cloudflare Turnstile token. Gated: if TURNSTILE_SECRET is not
// configured (demo mode), returns {valid: true} so the storefront never breaks.
// Configured via: wrangler secret put TURNSTILE_SECRET
async function verifyTurnstile(token, env) {
    const secret = env.TURNSTILE_SECRET;
    if (!secret) {
        return { valid: true, reason: "not_configured" };
    }
    if (!token) {
        return { valid: false, reason: "no_token" };
    }
    try {
        const resp = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({ secret, response: token })
        });
        const result = await resp.json();
        return {
            valid: !!result.success,
            reason: result["error-codes"] ? result["error-codes"].join(",") : ""
        };
    } catch (e) {
        logError(e, { context: "verifyTurnstile" });
        return { valid: false, reason: "verify_error" };
    }
}

// =========================
// ORDER CREATION (PUBLIC)
// =========================

function orderError(status, message) {
    const err = new Error(message);
    err.httpStatus = status;
    return err;
}

// Roll back a batch that partially decremented stock: restore stock for
// items that WERE decremented, then delete the order (cascades to
// order_items via the FK in 0001).  Called when the post-batch check
// detects a zero-changes stock UPDATE (concurrent sale race).
async function rollbackStockUpdate(env, orderId, stockUpdates, batchResults) {
    const restoreBatch = [];
    for (let i = 0; i < stockUpdates.length; i++) {
        const changes = batchResults[i]?.meta?.changes || 0;
        if (changes > 0) {
            restoreBatch.push(env.DB.prepare(
                "UPDATE products SET stock = stock + ? WHERE id = ?"
            ).bind(stockUpdates[i].quantity, stockUpdates[i].product_id));
        }
    }
    restoreBatch.push(env.DB.prepare("DELETE FROM orders WHERE id = ?").bind(orderId));
    try {
        await env.DB.batch(restoreBatch);
    } catch (e) {
        // Best-effort rollback; log but don't mask the original 409 error.
        logError(e, { path: "createPendingOrder.rollback", context: { orderId } });
    }
}

// Shared order-creation core: validates, prices from D1, inserts the
// pending order. Used by plain checkout AND the Daraja STK route so both
// paths produce identical orders. Throws orderError on validation issues.
async function createPendingOrder(env, data) {
    const { email, firstName, lastName, phone, address, city, postal, country, items, delivery, payment, number, idempotencyKey } = data || {};

    if (!email || !firstName || !lastName || !address || !city || !postal || !country || !items || !items.length) {
        throw orderError(400, "Missing required fields");
    }

    const deliveryMethod = delivery?.method || "Standard delivery";
    const shipping = deliveryMethod.toLowerCase().includes("express") ? 1550 : 650;

    // Look up products and compute subtotal from D1 prices
    let subtotal = 0;
    const orderItems = [];

    for (const item of items) {
        const product = await env.DB.prepare("SELECT id, name, price, active, stock FROM products WHERE id = ?").bind(item.id).first();
        if (!product) {
            throw orderError(400, `Product not found: ${item.id}`);
        }
        if (product.active !== 1) {
            throw orderError(400, `Product not available: ${item.name}`);
        }
        const quantity = Math.min(99, Math.max(1, parseInt(item.quantity) || 1));
        // Pre-check stock sufficiency (race-safe guard in the batch below
        // catches any item sold between this check and the UPDATE).
        if ((product.stock || 0) < quantity) {
            throw orderError(409, `Insufficient stock for item ${product.id}`);
        }
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

    // ---- Atomic inventory + order creation via a single batched TX ----
    // Stock UPDATEs (guarded by `WHERE stock >= ?`) run FIRST so that if any
    // product lacks sufficient stock the UPDATE simply affects zero rows
    // (instead of throwing).  The post-batch check below detects that and
    // rolls everything back — order insert + partial stock decrements — so the
    // storefront never oversells.
    const batch = [];
    const stockUpdates = [];
    for (const item of orderItems) {
        const stmt = env.DB.prepare(
            "UPDATE products SET stock = stock - ? WHERE id = ? AND stock >= ?"
        ).bind(item.quantity, item.product_id, item.quantity);
        stockUpdates.push({ product_id: item.product_id, quantity: item.quantity });
        batch.push(stmt);
    }

    // Order insert
    batch.push(env.DB.prepare(`
        INSERT INTO orders (id, customer_id, customer_email, number, status, subtotal, shipping, total,
            shipping_name, shipping_email, shipping_phone, shipping_address, shipping_city, shipping_country,
            payment_method, payment_reference, idempotency_key, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(orderId, customer.id, email, orderNumber, subtotal, shipping, total,
        `${firstName} ${lastName}`, email, phone || null, address, city, country,
        payMethod, payReference, idempotencyKey || null, now, now));

    // Order items inserts
    for (const item of orderItems) {
        batch.push(env.DB.prepare(`
            INSERT INTO order_items (order_id, product_id, product_name, quantity, price)
            VALUES (?, ?, ?, ?, ?)
        `).bind(orderId, item.product_id, item.product_name, item.quantity, item.price));
    }

    const results = await env.DB.batch(batch);

    // Post-check: every stock UPDATE must have decrement at least one row.
    // A zero-changes result means a concurrent sale drained stock between the
    // pre-check above and this batch — roll back to keep inventory exact.
    for (let i = 0; i < stockUpdates.length; i++) {
        const changes = results[i]?.meta?.changes || 0;
        if (changes === 0) {
            await rollbackStockUpdate(env, orderId, stockUpdates, results);
            throw orderError(409, `Insufficient stock for item ${stockUpdates[i].product_id}`);
        }
    }

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
    // Verify Turnstile (gated: skips if secret not configured — demo mode)
    const ts = await verifyTurnstile(data.turnstileToken, env);
    if (!ts.valid) {
        return jsonResponse({ error: "Please complete the security check." }, 403);
    }
    try {
        // Idempotency: if this checkout was already submitted (double-click /
        // refresh / retry), return the existing order instead of creating a
        // duplicate row.
        const idemKey = data.idempotencyKey || request.headers.get("Idempotency-Key") || null;
        if (idemKey) {
            const existing = await env.DB.prepare("SELECT * FROM orders WHERE idempotency_key = ?").bind(idemKey).first();
            if (existing) {
                const { results: items } = await env.DB.prepare("SELECT * FROM order_items WHERE order_id = ?").bind(existing.id).all();
                return jsonResponse({
                    order: {
                        id: existing.id,
                        number: existing.number,
                        subtotal: existing.subtotal,
                        shipping: existing.shipping,
                        total: existing.total,
                        items: items.map(i => ({ ...i, lineTotal: i.price * i.quantity }))
                    },
                    existing: true
                }, 200);
            }
        }
        const rec = await createPendingOrder(env, Object.assign({}, data, { idempotencyKey: idemKey }));
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
//        OR  x-webhook-secret: <secret>  OR  ?secret=<secret> (query param)
// =========================

async function handlePaymentCallback(request, env) {
    const ws = verifyWebhookSecret(request, env);
    if (!ws.valid) {
        return jsonResponse({ error: "Unauthorized" }, ws.reason === "not_configured" ? 503 : 401);
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

    // Idempotency: if this transaction ID was already credited to a paid
    // order, reject the callback to prevent double-crediting.
    if (txId) {
        const dupe = await env.DB.prepare(
            "SELECT number FROM orders WHERE payment_reference = ? AND status = 'paid'"
        ).bind(txId).first();
        if (dupe) {
            return jsonResponse({ ok: true, already: true, number: dupe.number });
        }
    }

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
    const webhookSecret = env.WEBHOOK_SECRET || env.PAYMENT_CALLBACK_SECRET || "";
    const callbackURL = origin.replace(/\/+$/, "") + "/api/payments/daraja/result" +
        (webhookSecret ? "?secret=" + encodeURIComponent(webhookSecret) : "");
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
    // Verify Turnstile (gated: skips if secret not configured — demo mode)
    const ts = await verifyTurnstile(data.turnstileToken, env);
    if (!ts.valid) {
        return jsonResponse({ error: "Please complete the security check." }, 403);
    }
    const phone = normalizeMsisdn((data && (data.msisdn || data.phone)) || "");
    if (!phone) {
        return jsonResponse({ error: "Enter a valid M-Pesa phone number (07… or 01…)" }, 400);
    }

    // Rate limit: 2 requests per minute per phone + IP (prevents toll fraud /
    // SMS flooding).
    const ip = getClientIP(request);
    const phoneKey = `ratelimit:stk:phone:${phone}`;
    const ipKey = `ratelimit:stk:ip:${ip}`;
    const phoneCount = parseInt(await env.SESSIONS.get(phoneKey) || "0", 10);
    const ipCount = parseInt(await env.SESSIONS.get(ipKey) || "0", 10);
    if (phoneCount >= 2 || ipCount >= 2) {
        return jsonResponse({ error: "Too many payment attempts. Please try again in 1 minute." }, 429);
    }
    await Promise.all([
        env.SESSIONS.put(phoneKey, String(phoneCount + 1), { expirationTtl: 60 }),
        env.SESSIONS.put(ipKey, String(ipCount + 1), { expirationTtl: 60 }),
    ]);

    // Idempotency: if this checkout was already submitted (double-click /
    // refresh / retry), reuse the existing pending order instead of
    // creating a duplicate. We still (re)push the STK prompt so the
    // customer can complete payment.
    const idemKey = data.idempotencyKey || request.headers.get("Idempotency-Key") || null;
    if (idemKey) {
        const existing = await env.DB.prepare("SELECT * FROM orders WHERE idempotency_key = ?").bind(idemKey).first();
        if (existing) {
            const origin = new URL(request.url).origin;
            let stk = null;
            try {
                stk = await darajaStkPush(env, origin, { phone, amount: existing.total, reference: existing.number });
            } catch (e) {
                return jsonResponse({ error: e.message || "Could not reach M-Pesa", number: existing.number }, e.httpStatus || 502);
            }
            try {
                await env.DB.prepare("UPDATE orders SET payment_reference = ? WHERE id = ?")
                    .bind(stk.CheckoutRequestID, existing.id).run();
            } catch (e) {}
            return jsonResponse({
                ok: true,
                number: existing.number,
                total: existing.total,
                checkoutRequestId: stk.CheckoutRequestID,
                existing: true
            }, 200);
        }
    }

    let rec = null;
    try {
        rec = await createPendingOrder(env, Object.assign({}, data, {
            payment: { method: "stk", reference: "" },
            idempotencyKey: idemKey
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
    // Verify webhook secret (query param, Bearer, or x-webhook-secret header)
    const ws = verifyWebhookSecret(request, env);
    if (!ws.valid) {
        return jsonResponse({ error: "Unauthorized" }, ws.reason === "not_configured" ? 503 : 401);
    }
    let body = null;
    try {
        body = await request.json();
    } catch (e) {
        // Daraja expects 200 OK even for malformed bodies.
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
    // Verify webhook secret (query param, Bearer, or x-webhook-secret header)
    const ws = verifyWebhookSecret(request, env);
    if (!ws.valid) {
        return jsonResponse({ ResultCode: 1, ResultDesc: "Unauthorized" }, ws.reason === "not_configured" ? 503 : 401);
    }
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
    try {
        // Rate limit: 20 accounts per hour per IP (safe fallback if KV down)
        const ip = getClientIP(request);
        const rlKey = `ratelimit:auth:signup:${ip}`;
        if (!(await rateLimit(env, rlKey, 20, 3600))) {
            return jsonResponse({ error: "Too many signup attempts. Please try again later." }, 429);
        }

        let body;
        try {
            body = await request.json();
        } catch (e) {
            return jsonResponse({ error: "Invalid JSON format" }, 400);
        }

        // Verify Turnstile (gated: skips if secret not configured — demo mode)
        const ts = await verifyTurnstile(body.cf_turnstile_response, env);
        if (!ts.valid) {
            return jsonResponse({ error: "Please complete the security check." }, 403);
        }

        const firstName = String(body.firstName || "").trim();
        const lastName = String(body.lastName || "").trim();
        const email = String(body.email || "").trim().toLowerCase();
        const password = String(body.password || "");

        if (!firstName || !lastName || !email || !password) {
            return jsonResponse({ error: "All fields are required" }, 400);
        }
        if (password.length < 8) {
            return jsonResponse({ error: "Password must be at least 8 characters" }, 400);
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return jsonResponse({ error: "Please enter a valid email address" }, 400);
        }
        
        const existing = await env.DB.prepare("SELECT id FROM customers WHERE email = ?").bind(email).first();
        if (existing) {
            return jsonResponse({ error: "An account with this email already exists" }, 409);
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
    } catch (err) {
        logError(err, { context: "handleCustomerSignup" });
        return jsonResponse({ error: "Unable to create account right now. Please try again." }, 500);
    }
}

async function handleCustomerLogin(request, env) {
    try {
        // Rate limit: 15 attempts per 5 minutes per IP
        const ip = getClientIP(request);
        const rlKey = `ratelimit:auth:login:${ip}`;
        if (!(await rateLimit(env, rlKey, 15, 300))) {
            return jsonResponse({ error: "Too many login attempts. Please try again in 5 minutes." }, 429);
        }

        let body;
        try {
            body = await request.json();
        } catch (e) {
            return jsonResponse({ error: "Invalid JSON format" }, 400);
        }

        const email = String(body.email || "").trim().toLowerCase();
        const password = String(body.password || "");

        if (!email || !password) {
            return jsonResponse({ error: "Email and password required" }, 400);
        }
        
        const customer = await env.DB.prepare("SELECT * FROM customers WHERE email = ?").bind(email).first();
        if (!customer || !customer.password_hash) {
            logReq("warn", "Login failed: unknown account", { path: "/api/auth/login", method: "POST" });
            return jsonResponse({ error: "The email or password is incorrect." }, 401);
        }
        
        const valid = await verifyPassword(password, customer.password_hash);
        if (!valid) {
            logReq("warn", "Login failed: bad password", { path: "/api/auth/login", method: "POST" });
            return jsonResponse({ error: "The email or password is incorrect." }, 401);
        }
        
        const sid = await createCustomerSession(customer, env);
        const headers = { "Content-Type": "application/json" };
        headers["Set-Cookie"] = `x_cust_session=${sid}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000`;
        
        return new Response(JSON.stringify({ ok: true, customer: { firstName: customer.first_name, lastName: customer.last_name, email: customer.email } }), { headers });
    } catch (err) {
        logError(err, { context: "handleCustomerLogin" });
        return jsonResponse({ error: "Unable to log in right now. Please try again." }, 500);
    }
}

// Google OAuth verification and sign-in/up
const GOOGLE_CLIENT_ID = "540286988119-l52h6ls3vn3d1uiq25elt3hbdv1cdd85.apps.googleusercontent.com";

async function handleGoogleAuth(request, env) {
    try {
        let body;
        try {
            body = await request.json();
        } catch {
            return jsonResponse({ error: "Invalid JSON format" }, 400);
        }

        const credential = body && body.credential;
        if (!credential) {
            return jsonResponse({ error: "Missing Google credential token" }, 400);
        }

        // Verify ID token via Google's tokeninfo API
        let tokenInfo;
        try {
            const googleRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`);
            if (!googleRes.ok) {
                return jsonResponse({ error: "Invalid Google credential" }, 401);
            }
            tokenInfo = await googleRes.json();
        } catch (e) {
            logError(e, { context: "Google tokeninfo fetch" });
            return jsonResponse({ error: "Failed to communicate with Google authentication services" }, 502);
        }

        const expectedAud = env.GOOGLE_CLIENT_ID || GOOGLE_CLIENT_ID;
        if (tokenInfo.aud !== expectedAud && tokenInfo.aud !== GOOGLE_CLIENT_ID) {
            return jsonResponse({ error: "Token audience does not match configured Google Client ID" }, 401);
        }

        const googleId = tokenInfo.sub;
        const email = String(tokenInfo.email || "").trim().toLowerCase();
        const firstName = String(tokenInfo.given_name || tokenInfo.name || "Customer").trim();
        const lastName = String(tokenInfo.family_name || "").trim();

        if (!email) {
            return jsonResponse({ error: "Google account did not provide a verified email" }, 400);
        }

        // Check if customer already exists by google_id or email
        let customer = await env.DB.prepare("SELECT * FROM customers WHERE google_id = ? OR email = ?")
            .bind(googleId, email).first();

        if (customer) {
            // Update google_id if account was originally registered via email/password
            if (!customer.google_id) {
                await env.DB.prepare("UPDATE customers SET google_id = ? WHERE id = ?")
                    .bind(googleId, customer.id).run();
            }
        } else {
            // Create new customer
            const id = crypto.randomUUID();
            const now = new Date().toISOString();
            await env.DB.prepare(`
                INSERT INTO customers (id, first_name, last_name, email, google_id, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
            `).bind(id, firstName, lastName, email, googleId, now).run();

            customer = { id, first_name: firstName, last_name: lastName, email };
        }

        const sessionCust = {
            id: customer.id,
            firstName: customer.first_name || firstName,
            lastName: customer.last_name || lastName,
            email: customer.email
        };

        const sid = await createCustomerSession(sessionCust, env);
        const headers = { "Content-Type": "application/json" };
        headers["Set-Cookie"] = `x_cust_session=${sid}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000`;

        return new Response(JSON.stringify({ ok: true, customer: sessionCust }), { headers });
    } catch (err) {
        logError(err, { context: "handleGoogleAuth" });
        return jsonResponse({ error: "Google sign-in encountered an error. Please try again." }, 500);
    }
}

async function sendPasswordResetEmail(env, { toEmail, toName, resetLink }) {
    const apiKey = env.RESEND_API_KEY;
    if (!apiKey) {
        logError(new Error("RESEND_API_KEY is not configured"), { context: "sendPasswordResetEmail" });
        return { ok: false, error: "Resend API key missing" };
    }

    const html = `
<!doctype html>
<html><head><meta charset="utf-8"><title>Reset your password</title></head>
<body style="font-family:Arial,Helvetica,sans-serif;line-height:1.6;">
<h2>Reset your password</h2>
<p>Hi${toName ? ` ${toName}` : ""},</p>
<p>We received a request to reset your password for your X-Store account. Click the button below to choose a new password. The link expires in 1 hour.</p>
<p style="text-align:center;margin:24px 0;">
<a href="${resetLink}" style="display:inline-block;background:#000;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;">Reset password</a>
</p>
<p>If you didn't request this, you can ignore this email. Your password won't change.</p>
<p><small>If the button above doesn't work, copy and paste this URL into your browser: ${resetLink}</small></p>
</body></html>`;

    try {
        const res = await fetch("https://api.resend.com/email", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                from: env.RESEND_FROM || "X-Store <noreply@resend.dev>",
                to: toEmail,
                subject: "Reset your password",
                html
            })
        });

        if (!res.ok) {
            const detail = await res.text().catch(() => "");
            logError(new Error(`Resend error ${res.status}: ${detail}`), { context: "sendPasswordResetEmail" });
            return { ok: false, error: `Resend ${res.status}` };
        }
        return { ok: true };
    } catch (err) {
        logError(err, { context: "sendPasswordResetEmail" });
        return { ok: false, error: err.message };
    }
}

// Request password reset link
async function handleForgotPassword(request, env) {
    try {
        let body;
        try {
            body = await request.json();
        } catch {
            return jsonResponse({ error: "Invalid JSON format" }, 400);
        }

        const email = String(body.email || "").trim().toLowerCase();
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return jsonResponse({ error: "Please enter a valid email address" }, 400);
        }

        const customer = await env.DB.prepare("SELECT id, first_name, email FROM customers WHERE email = ?").bind(email).first();
        if (customer) {
            const token = crypto.randomUUID();
            if (env.SESSIONS) {
                await env.SESSIONS.put(`reset:${token}`, JSON.stringify({
                    customerId: customer.id,
                    email: customer.email,
                    created: Date.now()
                }), { expirationTtl: 3600 }); // 1 hour
            }

            const origin = new URL(request.url).origin;
            const resetLink = `${origin}/login.html?reset_token=${token}`;
            await sendPasswordResetEmail(env, {
                toEmail: customer.email,
                toName: (customer.first_name || "").trim(),
                resetLink
            });
            logReq("info", "Password reset link issued", { path: "/api/auth/forgot-password", method: "POST" });
        }

        // Always return success to protect privacy
        return jsonResponse({
            ok: true,
            message: "A password reset link has been sent to your email address. Please check your inbox and spam folder."
        });
    } catch (err) {
        logError(err, { context: "handleForgotPassword" });
        return jsonResponse({ error: "Unable to process password reset request. Please try again." }, 500);
    }
}

// Reset password with token
async function handleResetPassword(request, env) {
    try {
        let body;
        try {
            body = await request.json();
        } catch {
            return jsonResponse({ error: "Invalid JSON format" }, 400);
        }

        const token = String(body.token || "").trim();
        const newPassword = String(body.newPassword || "");

        if (!token) {
            return jsonResponse({ error: "Reset token is required or expired" }, 400);
        }
        if (!newPassword || newPassword.length < 8) {
            return jsonResponse({ error: "New password must be at least 8 characters" }, 400);
        }

        if (!env.SESSIONS) {
            return jsonResponse({ error: "Session storage unavailable" }, 503);
        }

        const raw = await env.SESSIONS.get(`reset:${token}`);
        if (!raw) {
            return jsonResponse({ error: "This password reset link is invalid or has expired. Please request a new one." }, 400);
        }

        let resetData;
        try {
            resetData = JSON.parse(raw);
        } catch {
            return jsonResponse({ error: "Invalid reset token data" }, 400);
        }

        const passwordHash = await hashPassword(newPassword);
        await env.DB.prepare("UPDATE customers SET password_hash = ? WHERE id = ?")
            .bind(passwordHash, resetData.customerId).run();

        // Invalidate token
        await env.SESSIONS.delete(`reset:${token}`);

        return jsonResponse({
            ok: true,
            message: "Your password has been reset successfully. You can now log in with your new password."
        });
    } catch (err) {
        logError(err, { context: "handleResetPassword" });
        return jsonResponse({ error: "Unable to reset password. Please try again." }, 500);
    }
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