import json, urllib.request, urllib.error

BASE = "http://127.0.0.1:8787"
results = []

def call(method, path, body=None, headers=None, cookie=None):
    req = urllib.request.Request(BASE + path, method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={"Content-Type": "application/json", **(headers or {})})
    if cookie:
        req.add_header("Cookie", cookie)
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, json.loads(r.read() or b"{}"), r.headers
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read() or b"{}"), e.headers
        except Exception:
            return e.code, {}, e.headers

def check(name, cond, detail=""):
    results.append(("PASS" if cond else "FAIL", name, detail))

for page in ["/", "/admin/login.html", "/checkout.html", "/shop.html"]:
    try:
        with urllib.request.urlopen(BASE + page) as r:
            check(f"static {page}", r.status == 200, str(r.status))
    except Exception as e:
        check(f"static {page}", False, str(e))

code, data, _ = call("GET", "/api/health")
check("GET /api/health", code == 200 and data.get("status") == "ok")
code, data, _ = call("GET", "/api/products")
all_count = len(data.get("products", []))
check("GET /api/products returns all", code == 200 and all_count >= 8, f"count={all_count}")
code, data, _ = call("GET", "/api/products?active=true")
acts = set(p.get("active") for p in data.get("products", []))
check("filter active=true only actives", code == 200 and acts == {1} and 0 not in acts, f"actives={acts}")

code, _, _ = call("POST", "/api/products", {"name": "x"})
check("POST /api/products unauth -> 401", code == 401, str(code))
code, _, _ = call("GET", "/api/orders")
check("GET /api/orders unauth -> 401", code == 401, str(code))
code, _, _ = call("GET", "/api/customers")
check("GET /api/customers unauth -> 401", code == 401, str(code))
code, _, _ = call("GET", "/api/settings")
check("GET /api/settings unauth -> 401", code == 401, str(code))

code, data, hdr = call("POST", "/api/admin/login", {"email": "admin@elle.com", "password": "wrong"})
check("admin wrong pw -> 401", code == 401, str(code))
code, data, hdr = call("POST", "/api/admin/login", {"email": "admin@elle.com", "password": "admin123"})
admin_cookie = hdr.get("Set-Cookie", "").split(";")[0] if code == 200 else None
check("admin login -> 200 + cookie", code == 200 and bool(admin_cookie) and admin_cookie.startswith("x_admin_session="), f"code={code}")
code, data, _ = call("GET", "/api/admin/me", cookie=admin_cookie)
check("admin /me -> 200", code == 200 and "admin" in data, str(code))
code, data, _ = call("GET", "/api/admin/stats", cookie=admin_cookie)
check("admin /stats real numbers", code == 200 and data.get("totalProducts", 0) > 0 and data.get("orders", 0) > 0, json.dumps(data))
code, data, _ = call("POST", "/api/products", {"name": "Verify PW", "slug": f"verify-pw-{int(__import__('time').time())}", "category": "Intimate", "subcategory": "Toys", "price": 1}, cookie=admin_cookie)
check("POST /api/products authed -> 201", code == 201, f"code={code} {data}")
if code == 201:
    pid = data.get("product", {}).get("id")
    c2, _, _ = call("DELETE", f"/api/products/{pid}", cookie=admin_cookie)
    check("DELETE test product", c2 == 200, str(c2))

code, data, _ = call("POST", "/api/orders", {
    "email": "verify@test.com", "firstName": "V", "lastName": "T",
    "phone": "1", "address": "a", "city": "c", "postal": "1", "country": "KE",
    "items": [{"id": "silk-touch", "quantity": 2}],
    "delivery": {"method": "Express delivery"}})
o = data.get("order", {})
check("POST /api/orders guest -> 201", code == 201, f"code={code} {data}")
check("order pricing 7650*2+1550 express=16850",
      o.get("subtotal") == 15300 and o.get("shipping") == 1550 and o.get("total") == 16850,
      json.dumps({k: o.get(k) for k in ("subtotal", "shipping", "total")}))
code, data, _ = call("POST", "/api/orders", {"email": "x@y.z", "items": [{"id": "fake-item", "quantity": 1}]})
check("order unknown product -> 400", code == 400, str(code))

code, data, hdr = call("POST", "/api/auth/signup", {"firstName": "Ver", "lastName": "Ify", "email": "verify_cust@test.com", "password": "password123"})
if code == 409:
    code, data, hdr = call("POST", "/api/auth/login", {"email": "verify_cust@test.com", "password": "password123"})
cust_cookie = hdr.get("Set-Cookie", "").split(";")[0] if code == 200 else None
check("customer signup/login -> 200 + cookie", code == 200 and bool(cust_cookie) and cust_cookie.startswith("x_cust_session="), f"code={code}")
code, data, _ = call("GET", "/api/auth/me", cookie=cust_cookie)
check("customer /me -> 200", code == 200 and "customer" in data, str(code))
code, data, _ = call("GET", "/api/my-orders", cookie=cust_cookie)
check("customer /my-orders -> 200", code == 200 and "orders" in data, str(code))
code, _, _ = call("POST", "/api/auth/logout", cookie=cust_cookie)
check("customer logout -> 200", code == 200, str(code))
code, _, _ = call("GET", "/api/auth/me", cookie=cust_cookie)
check("customer /me after logout -> 401", code == 401, str(code))

# === CSRF Origin Check ===
print("\n--- CSRF Origin Check Tests ---")

# Cross-origin POST with mismatched Origin -> 403 (CSRF blocked)
ts = int(__import__('time').time())
code, data, _ = call("POST", "/api/auth/signup", {
    "firstName": "C", "lastName": "S", "email": f"csrf_evil_{ts}@test.com",
    "password": "password123"
}, headers={"Origin": "http://evil.example.com"})
check("CSRF: cross-origin Origin rejected -> 403", code == 403, f"code={code} data={data}")

# Cross-origin POST with mismatched Referer -> 403 (CSRF blocked)
code, data, _ = call("POST", "/api/auth/login", {
    "email": "csrf_evil@test.com", "password": "password123"
}, headers={"Referer": "http://evil.example.com/login"})
check("CSRF: cross-origin Referer rejected -> 403", code == 403, f"code={code} data={data}")

# Same-origin POST with matching Origin -> not 403 (not blocked by CSRF)
code, data, hdr = call("POST", "/api/auth/signup", {
    "firstName": "C", "lastName": "S", "email": f"csrf_ok_{ts}@test.com",
    "password": "password123"
}, headers={"Origin": BASE})
check("CSRF: same-origin Origin allowed (not 403)", code != 403, f"code={code} data={data}")

# POST without Origin/Referer -> not 403 (same-origin browser fetch, no Origin header)
code, data, _ = call("POST", "/api/auth/signup", {
    "firstName": "N", "lastName": "O", "email": f"csrf_none_{ts}@test.com",
    "password": "password123"
})
check("CSRF: no Origin header allowed (not 403)", code != 403, f"code={code} data={data}")

# Payment callback exempt from CSRF even with foreign Origin
code, data, _ = call("POST", "/api/payments/callback?secret=wrong", {
    "account_reference": "CSRF123", "transaction_id": "TXN_CSRF", "amount": 100
}, headers={"Origin": "http://evil.example.com"})
check("CSRF: payment callback exempt from Origin check", code != 403,
      f"code={code} data={data}")

# === CORS Origin Check ===
print("\n--- CORS Origin Tests ---")

# Cross-origin GET (no CSRF check for GET) -> no Allow-Origin header
code, data, hdr = call("GET", "/api/products", headers={"Origin": "http://evil.example.com"})
cors_hdr = hdr.get("Access-Control-Allow-Origin")
check("CORS: cross-origin GET gets no Allow-Origin", cors_hdr is None,
      f"code={code} Allow-Origin={cors_hdr}")

# Same-origin GET with matching Origin -> Allow-Origin echoes the origin
code, data, hdr = call("GET", "/api/products", headers={"Origin": BASE})
cors_hdr = hdr.get("Access-Control-Allow-Origin")
check("CORS: same-origin GET echoes Allow-Origin", cors_hdr == BASE,
      f"code={code} Allow-Origin={cors_hdr}")

# GET without Origin -> no Allow-Origin header
code, data, hdr = call("GET", "/api/products")
cors_hdr = hdr.get("Access-Control-Allow-Origin")
check("CORS: GET without Origin has no Allow-Origin", cors_hdr is None,
      f"code={code} Allow-Origin={cors_hdr}")

# OPTIONS preflight, cross-origin -> no Allow-Origin (browser blocks)
code, _, hdr = call("OPTIONS", "/api/products", headers={"Origin": "http://evil.example.com"})
cors_hdr = hdr.get("Access-Control-Allow-Origin")
check("CORS: OPTIONS preflight cross-origin -> no Allow-Origin", cors_hdr is None,
      f"code={code} Allow-Origin={cors_hdr}")

# OPTIONS preflight, same-origin -> Allow-Origin echoes
code, _, hdr = call("OPTIONS", "/api/products", headers={"Origin": BASE})
cors_hdr = hdr.get("Access-Control-Allow-Origin")
check("CORS: OPTIONS preflight same-origin -> echoes Allow-Origin", cors_hdr == BASE,
      f"code={code} Allow-Origin={cors_hdr}")

# === CSP (B3): 'unsafe-inline' removed from script-src ===
print("\n--- CSP Tests ---")

# Check CSP header on health endpoint
code, _, hdr = call("GET", "/api/health")
csp = hdr.get("Content-Security-Policy")
if csp is None:
    csp = next((v for k, v in hdr.items() if k.lower() == "content-security-policy"), None)
check("CSP: header present on /api/health", csp is not None, f"code={code} csp={csp}")

if csp:
    # 'unsafe-inline' must NOT be in script-src
    import re as _re
    script_src_match = _re.search(r"script-src\s+([^;]+)", csp)
    script_src_val = script_src_match.group(1) if script_src_match else ""
    check("CSP: script-src has no 'unsafe-inline'", "'unsafe-inline'" not in script_src_val,
          f"script-src={script_src_val}")
    # The intro bootstrap hash must be in script-src
    check("CSP: intro bootstrap hash present in script-src", "sha256-GN17Af5JTCgsTuG7anjYPflH/7ifBbNYYalLV2mGIwU=" in script_src_val,
          f"script-src={script_src_val}")
    # 'unsafe-inline' IS still allowed in style-src (acceptable for now)
    style_src_match = _re.search(r"style-src\s+([^;]+)", csp)
    style_src_val = style_src_match.group(1) if style_src_match else ""
    check("CSP: style-src still allows 'unsafe-inline' (deferred to B3b)", "'unsafe-inline'" in style_src_val,
          f"style-src={style_src_val}")

# === Turnstile (C3): gated — no secret configured means requests pass ===
print("\n--- Turnstile Gate Tests ---")

# Signup without Turnstile token succeeds when TURNSTILE_SECRET is absent (demo mode)
ts = int(__import__('time').time())
code, data, _ = call("POST", "/api/auth/signup", {
    "firstName": "T", "lastName": "S", "email": f"turnstile_{ts}@test.com",
    "password": "password123"
})
check("Turnstile: signup without token allowed (secret absent)", code in (200, 201, 409),
      f"code={code} data={data}")

# Checkout (classic card flow) without Turnstile token succeeds (secret absent)
code, data, _ = call("POST", "/api/orders", {
    "email": f"turnstile_{ts}@test.com", "firstName": "T", "lastName": "S",
    "phone": "+254700000000", "address": "1 Test St", "city": "Nairobi",
    "postal": "00100", "country": "Kenya",
    "items": [{"id": "silk-touch", "quantity": 1}],
    "delivery": {"method": "Standard delivery"},
    "payment": {"method": "card", "reference": ""},
    "turnstileToken": ""
})
check("Turnstile: order without token allowed (secret absent)", code in (200, 201, 409),
      f"code={code} data={data}")

# === Stock & Rate Limiting Integration Tests ===
print("\n--- Stock & Rate Limiting Tests ---")

# ---- Rate Limiting: Customer login (5 per 5 min per IP) ----
# Send enough wrong-password attempts to exceed the 5/5-min limit.
login_429 = False
login_code = 0
for i in range(12):
    login_code, _, _ = call("POST", "/api/auth/login", {
        "email": f"rl_login_{i}@test.com", "password": "wrong"
    })
    if login_code == 429:
        login_429 = True
        break
check("login rate limit (5/5min) -> 429", login_429, f"last code={login_code}")

# ---- Rate Limiting: Customer signup (3 per hour per IP) ----
signup_429 = False
signup_code = 0
for i in range(8):
    signup_code, _, _ = call("POST", "/api/auth/signup", {
        "firstName": "R", "lastName": "L",
        "email": f"rl_signup_{i}_{int(__import__('time').time())}@test.com",
        "password": "password123"
    })
    if signup_code == 429:
        signup_429 = True
        break
check("signup rate limit (3/hr) -> 429", signup_429, f"last code={signup_code}")

# ---- Rate Limiting: STK push (2/min per phone+IP) ----
# Same phone number across requests; dev server IP is constant.
# Note: STK test may create up to 2 orders for the-duo; stock is
# restored later alongside midnight-gummies after admin login.
stk_429 = False
stk_code = 0
for i in range(6):
    stk_code, _, _ = call("POST", "/api/payments/stk", {
        "email": f"stk_{i}@test.com", "firstName": "S", "lastName": "T",
        "phone": "+254700000099", "address": "a", "city": "c", "postal": "1",
        "country": "KE",
        "items": [{"id": "the-duo", "quantity": 1}],
        "delivery": {"method": "Standard delivery"}
    })
    if stk_code == 429:
        stk_429 = True
        break
check("STK rate limit (2/min) -> 429", stk_429, f"last code={stk_code}")

# ---- Webhook Verification: Unauthorized callbacks rejected ----
code, data, _ = call("POST", "/api/payments/daraja/result", {"Body": {"stkCallback": {}}})
check("Daraja result without secret -> 401", code == 401, str(code))

code, data, _ = call("POST", "/api/payments/daraja/result?secret=wrong", {"Body": {"stkCallback": {}}})
check("Daraja result wrong secret -> 401", code == 401, str(code))

code, data, _ = call("POST", "/api/payments/daraja/confirm", {"BillRefNumber": "ELLE12345678"})
check("Daraja confirm without secret -> 401/503", code in (401, 503), str(code))

code, data, _ = call("POST", "/api/payments/callback", {"account_reference": "ELLE12345678"})
check("Bank callback without secret -> 401/503", code in (401, 503), str(code))

# ---- Stock: insufficient stock returns 409 ----
# Re-login as admin (admin login is not rate-limited by the new guard).
code, _, hdr = call("POST", "/api/admin/login", {"email": "admin@elle.com", "password": "admin123"})
stock_cookie = hdr.get("Set-Cookie", "").split(";")[0] if code == 200 else admin_cookie

# Read current stock of midnight-gummies
code, data, _ = call("GET", "/api/products/midnight-gummies")
current_stock = data.get("product", {}).get("stock", 0)
check("midnight-gummies has stock", current_stock > 0, f"stock={current_stock}")

# Set stock to 1
call("PUT", "/api/products/midnight-gummies", {"stock": 1}, cookie=stock_cookie)

# Order 2 -> should fail with 409 Conflict
code, data, _ = call("POST", "/api/orders", {
    "email": "stock_test@test.com", "firstName": "S", "lastName": "T",
    "phone": "1", "address": "a", "city": "c", "postal": "1", "country": "KE",
    "items": [{"id": "midnight-gummies", "quantity": 2}],
    "delivery": {"method": "Standard delivery"}
})
check("insufficient stock -> 409 Conflict", code == 409, f"code={code} data={data}")

# Order 1 -> should succeed (201)
code, data, _ = call("POST", "/api/orders", {
    "email": "stock_test@test.com", "firstName": "S", "lastName": "T",
    "phone": "1", "address": "a", "city": "c", "postal": "1", "country": "KE",
    "items": [{"id": "midnight-gummies", "quantity": 1}],
    "delivery": {"method": "Standard delivery"}
})
check("sufficient stock -> 201 Created", code == 201, f"code={code} data={data}")

# Order 1 again -> should fail (stock now 0, atomic decrement verified)
code, data, _ = call("POST", "/api/orders", {
    "email": "stock_test2@test.com", "firstName": "S", "lastName": "T",
    "phone": "1", "address": "a", "city": "c", "postal": "1", "country": "KE",
    "items": [{"id": "midnight-gummies", "quantity": 1}],
    "delivery": {"method": "Standard delivery"}
})
check("stock exhausted after first order -> 409", code == 409, f"code={code} data={data}")

# Restore stock to original value for subsequent test runs
call("PUT", "/api/products/midnight-gummies", {"stock": current_stock}, cookie=stock_cookie)

# ---- Idempotency: duplicate payment callback not double-credited ----
# Create a paybill order whose amount we know exactly.
stock_total = 3100 + 650  # midnight-gummies price + standard shipping
code, data, _ = call("POST", "/api/orders", {
    "email": "idem_test@test.com", "firstName": "I", "lastName": "D",
    "phone": "1", "address": "a", "city": "c", "postal": "1", "country": "KE",
    "items": [{"id": "midnight-gummies", "quantity": 1}],
    "delivery": {"method": "Standard delivery"},
    "payment": {"method": "paybill", "reference": "IDEM123456"}
})
order_number = data.get("order", {}).get("number") if code == 201 else None

if order_number:
    # First payment callback (with correct webhook secret and matching amount)
    code, data, _ = call("POST",
        "/api/payments/callback?secret=dev-webhook-secret-change-me", {
            "account_reference": order_number,
            "transaction_id": "TXN_IDEM_001",
            "amount": stock_total
        })
    check("first paybill callback -> ok", code == 200 and data.get("ok") is True, f"code={code} data={data}")

    # Second callback with same txId -> should be idempotent (already: true)
    code, data, _ = call("POST",
        "/api/payments/callback?secret=dev-webhook-secret-change-me", {
            "account_reference": order_number,
            "transaction_id": "TXN_IDEM_001",
            "amount": stock_total
        })
    check("duplicate callback -> already credited (idempotent)", code == 200 and data.get("already") is True,
          f"code={code} data={data}")

    # Verify order status stayed 'paid' (not double-credited)
    code, data, _ = call("GET", "/api/orders", cookie=stock_cookie)
    my_order = next((o for o in data.get("orders", []) if o.get("number") == order_number), None)
    check("order marked paid once (idempotent)", my_order and my_order.get("status") == "paid",
          f"status={my_order.get('status') if my_order else 'not found'}")
else:
    check("idempotency order created", False, "could not create paybill order")

# Restore stock (both products used in tests)
call("PUT", "/api/products/midnight-gummies", {"stock": current_stock}, cookie=stock_cookie)
call("PUT", "/api/products/the-duo", {"stock": 15}, cookie=stock_cookie)

print("\n===== VERIFY RESULTS =====")
fails = 0
for status, name, detail in results:
    if status == "FAIL":
        fails += 1
    print(f"[{status}] {name}" + (f"  -> {detail}" if status == "FAIL" else ""))
print(f"\n{len(results)-fails}/{len(results)} passed, {fails} failed")
