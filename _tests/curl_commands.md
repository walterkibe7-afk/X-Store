# Backend Reliability Validation — Curl Commands

> Run against a local dev server: `npx wrangler dev --local`
> Base URL: `http://127.0.0.1:8787`
> Dev webhook secret: `dev-webhook-secret-change-me`

## 1. Atomic Stock Control — Insufficient Stock → 409

```bash
# Set midnight-gummies stock to 1 (requires admin cookie)
curl -X PUT http://127.0.0.1:8787/api/products/midnight-gummies \
  -H "Content-Type: application/json" \
  -H "Cookie: x_admin_session=<ADMIN_COOKIE>" \
  -d '{"stock":1}'

# Attempt to order 2 → 409 Conflict
curl -X POST http://127.0.0.1:8787/api/orders \
  -H "Content-Type: application/json" \
  -d '{
    "email":"stock@test.com","firstName":"T","lastName":"T",
    "phone":"1","address":"a","city":"c","postal":"1","country":"KE",
    "items":[{"id":"midnight-gummies","quantity":2}],
    "delivery":{"method":"Standard delivery"}
  }'
# Expected: {"error":"Insufficient stock for item midnight-gummies"}  (HTTP 409)

# Order 1 → 201 Created (stock now 0)
curl -X POST http://127.0.0.1:8787/api/orders \
  -H "Content-Type: application/json" \
  -d '{
    "email":"stock@test.com","firstName":"T","lastName":"T",
    "phone":"1","address":"a","city":"c","postal":"1","country":"KE",
    "items":[{"id":"midnight-gummies","quantity":1}],
    "delivery":{"method":"Standard delivery"}
  }'

# Order 1 again → 409 (stock exhausted)
curl -X POST ...  # same as above
# Expected: HTTP 409

# Restore stock
curl -X PUT http://127.0.0.1:8787/api/products/midnight-gummies \
  -H "Content-Type: application/json" \
  -H "Cookie: x_admin_session=<ADMIN_COOKIE>" \
  -d '{"stock":100}'
```

## 2. Rate Limiting — Login (5 / 5 min per IP)

```bash
for i in $(seq 1 7); do
  curl -s -o /dev/null -w "%{http_code}\n" -X POST http://127.0.0.1:8787/api/auth/login \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"test$i@test.com\",\"password\":\"wrong\"}"
done
# Expected: 401, 401, 401, 401, 401, 429, 429
```

## 3. Rate Limiting — Signup (3 / hour per IP)

```bash
for i in $(seq 1 5); do
  curl -s -o /dev/null -w "%{http_code}\n" -X POST http://127.0.0.1:8787/api/auth/signup \
    -H "Content-Type: application/json" \
    -d "{\"firstName\":\"A\",\"lastName\":\"B\",\"email\":\"signup$i@test.com\",\"password\":\"password123\"}"
done
# Expected: 201, 201, 201, 429, 429
```

## 4. Rate Limiting — STK Push (2 / min per phone+IP)

```bash
for i in $(seq 1 4); do
  curl -s -o /dev/null -w "%{http_code}\n" -X POST http://127.0.0.1:8787/api/payments/stk \
    -H "Content-Type: application/json" \
    -d '{
      "email":"stk@test.com","firstName":"S","lastName":"T",
      "phone":"+254700000099","address":"a","city":"c","postal":"1","country":"KE",
      "items":[{"id":"the-duo","quantity":1}],
      "delivery":{"method":"Standard delivery"}
    }'
done
# Expected: 502 (M-Pesa not configured), 502, 429, 429
```

## 5. CSRF Origin Check — Foreign Origin Rejected

```bash
# Cross-origin POST with mismatched Origin -> 403
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://127.0.0.1:8787/api/auth/signup \
  -H "Content-Type: application/json" \
  -H "Origin: http://evil.example.com" \
  -d '{"firstName":"C","lastName":"S","email":"csrf@test.com","password":"password123"}'
# Expected: 403

# Same-origin POST with matching Origin -> not 403
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://127.0.0.1:8787/api/auth/signup \
  -H "Content-Type: application/json" \
  -H "Origin: http://127.0.0.1:8787" \
  -d '{"firstName":"C","lastName":"S","email":"csrf_ok@test.com","password":"password123"}'
# Expected: 201 (or 409 if email already exists — not 403)

# POST without Origin header -> not 403 (same-origin browser fetch)
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://127.0.0.1:8787/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"firstName":"N","lastName":"O","email":"csrf_none@test.com","password":"password123"}'
# Expected: 201 (or 409) — not 403

# Payment callback exempt from CSRF (foreign Origin, but reaches webhook check)
curl -s -o /dev/null -w "%{http_code}\n" -X POST "http://127.0.0.1:8787/api/payments/callback?secret=wrong" \
  -H "Content-Type: application/json" \
  -H "Origin: http://evil.example.com" \
  -d '{"account_reference":"CSRF123","transaction_id":"TXN_CSRF","amount":100}'
# Expected: 401 (not 403 — CSRF exempt, webhook secret check fails)
```

## 6. CORS — Foreign Origin Gets No Allow-Origin

```bash
# Cross-origin GET (no CSRF check for GET) -> no Access-Control-Allow-Origin
curl -s -D - -o /dev/null -X GET http://127.0.0.1:8787/api/products \
  -H "Origin: http://evil.example.com"
# Expected: no "Access-Control-Allow-Origin" header in response

# Same-origin GET with matching Origin -> Allow-Origin echoes the origin
curl -s -D - -o /dev/null -X GET http://127.0.0.1:8787/api/products \
  -H "Origin: http://127.0.0.1:8787"
# Expected: Access-Control-Allow-Origin: http://127.0.0.1:8787

# OPTIONS preflight, cross-origin -> no Allow-Origin (browser blocks)
curl -s -D - -o /dev/null -X OPTIONS http://127.0.0.1:8787/api/products \
  -H "Origin: http://evil.example.com" \
  -H "Access-Control-Request-Method: POST"
# Expected: no "Access-Control-Allow-Origin" header

# OPTIONS preflight, same-origin -> Allow-Origin echoes
curl -s -D - -o /dev/null -X OPTIONS http://127.0.0.1:8787/api/products \
  -H "Origin: http://127.0.0.1:8787" \
  -H "Access-Control-Request-Method: POST"
# Expected: Access-Control-Allow-Origin: http://127.0.0.1:8787
```

## 7. CSP — 'unsafe-inline' Removed from script-src

```bash
# CSP header: script-src uses hash instead of 'unsafe-inline'
curl -s -D - -o /dev/null http://127.0.0.1:8787/api/health | grep -i "content-security-policy"
# Expected: script-src 'self' 'sha256-GN17Af5JTCgsTuG7anjYPflH/7ifBbNYYalLV2mGIwU=' https://fonts.googleapis.com ...

# Verify 'unsafe-inline' is NOT in script-src (only in style-src)
curl -s -D - -o /dev/null http://127.0.0.1:8787/api/health | grep -oiP "script-src [^;]*"
# Expected: script-src 'self' 'sha256-GN17Af5JTCgsTuG7anjYPflH/7ifBbNYYalLV2mGIwU=' https://fonts.googleapis.com https://accounts.google.com https://challenges.cloudflare.com
```

## 8. Turnstile (C3) — Gated Bot Protection

```bash
# Turnstile widget is present on signup.html and checkout.html with
# data-sitekey filled by serveAsset from TURNSTILE_SITE_KEY env var.
# If TURNSTILE_SECRET is not configured (demo mode), requests without a
# token still succeed — the demo must not break.

# Signup without Turnstile token -> 200/201/209 (secret absent)
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://127.0.0.1:8787/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"firstName":"T","lastName":"S","email":"turnstile@test.com","password":"password123"}'
# Expected: 200 or 409 (not 403)

# When TURNSTILE_SECRET is set, add to wrangler.toml:
#   TURNSTILE_SECRET (via `wrangler secret put TURNSTILE_SECRET`)
#   TURNSTILE_SITE_KEY = "your-public-site-key"
```

## 9. Webhook Verification — Unauthorized Callbacks Rejected

```bash
# Daraja result without secret → 401
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://127.0.0.1:8787/api/payments/daraja/result \
  -H "Content-Type: application/json" \
  -d '{"Body":{"stkCallback":{}}}'

# Daraja result with wrong secret → 401
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://127.0.0.1:8787/api/payments/daraja/result?secret=wrong \
  -H "Content-Type: application/json" \
  -d '{"Body":{"stkCallback":{}}}'

# Bank callback with correct secret → 200
curl -X POST "http://127.0.0.1:8787/api/payments/callback?secret=dev-webhook-secret-change-me" \
  -H "Content-Type: application/json" \
  -d '{"account_reference":"ELLETEST1234","transaction_id":"TXN001","amount":5050}'
```
