# AGENT INSTRUCTIONS — X-Store security + legal + reliability fixes
# Generated 2026-10-09 from 7 transcribed WhatsApp videos (D:\FW_work\transcripts_2026-10-09.txt).
# REPORT-ONLY audit is done. This file tells the implementing agent exactly what to change.

## 0. Ground rules (do not violate)
1. Canonical root ONLY: `D:\Web Designs\ST\`. NEVER edit `x-store/`, `dist/`, `.kilo/worktrees/`, `.wrangler/`, `node_modules/`.
2. Small edits, one phase at a time. Verify after each phase with `node build.js` + `_tests/run-all-tests.bat` (or at minimum `node _tests/link-check.js`).
3. Never break the demo: every API fetch keeps its existing localStorage fallback.
4. Never store passwords/secrets in localStorage or code. Hashes in D1 only; real secrets via `wrangler secret put`.
5. Keep the visual design identical. Backend/behaviour work only.
6. No new npm dependencies unless the owner approves. Cloudflare Workers runtime only (no Node-only APIs in `functions/`).

## 1. Context: what the videos demand
- V1 (IDOR+logout): server must enforce per-user access; logout must invalidate server session AND clear all client auth traces; replayed URLs must 401.
- V2+V3 (hardening): server-side permissions, hashed passwords, HttpOnly cookies, secrets server-side, parameterized SQL, input sanitising, XSS, webhook signatures, rate limits, tight CORS, security headers, no prod debug, updated deps.
- V4 (legal): real privacy/terms/cookie/refund content, consent, minimal data, accessible forms.
- V5 (10 checks): HTTPS, hashed pw, bot protection, expiring sessions, CSRF, expiring single-use reset, least-privilege DB, clean logs, billing alerts, backups.
- V6 (logging): structured server logs with timestamp/requestId/user, levels, no secrets, no frontend debug noise in prod.
- V7 (idempotency): checkout must survive double-click/refresh/retry without duplicate orders/payments (idempotency key end-to-end).

## 2. PHASE A — Auth correctness (V1) [HIGHEST PRIORITY]
A1. `account.js` logout (lines ~155-167): also `localStorage.removeItem("xUser")`. Keep `xCart`, `xWishlist`, `xOrders` (device data, not auth). Redirect stays `index.html`.
- Accept: after logout, `xUser`, `xLoggedIn`, `xRememberLogin` are all absent.
A2. `checkout.js` gate (lines 5-20) + `account.js` gate (lines 37-46): do NOT trust `xLoggedIn==="true"` alone. On page load, call `fetch("/api/auth/me",{credentials:"include"})`; if 200 continue; if 401 clear `xLoggedIn/xUser` and redirect `login.html`. Only if fetch throws (offline) may you fall back to the localStorage flag.
- Accept: revoked server session + stale `xLoggedIn=true` bounces to login.
A3. `functions/api/products.js` order/customer reads: verify `handleGetOrder` (~:652), `handleGetOrders` (~:644+), `handleMyOrders` (~:1684+) scope every row to the session identity (customer sees ONLY rows where customer email/customer_id == session; admin path stays behind `requireAdmin`). Add a test: user B `GET /api/orders/<A-order-id>` returns 401/404, never 200.
- Accept: no cross-user order read; existing admin reads unchanged.

## 3. PHASE B — Secrets + headers + debug (V2+V3+V5) [HIGH]
B1. `wrangler.toml`: DELETE the line `WEBHOOK_SECRET = "dev-webhook-secret-change-me"`. Keep only the comment telling ops to run `wrangler secret put WEBHOOK_SECRET`. Confirm `env.production.vars` has no secrets. Grep repo for the literal `dev-webhook-secret` afterwards: 0 hits outside docs.
B2. `functions/api/products.js` CORS (~:184-188): replace `"Access-Control-Allow-Origin": "*"` with echo-origin-only-if-allowlisted (allow same-origin + `https://<prod-domain>` from env, else omit header). Keep methods/headers lists. OPTIONS handler unchanged otherwise.
- Accept: cross-origin fetch from random origin gets no Allow-Origin; same-origin still works.
B3. CSP (`products.js` ~:127 and ~:198, same string twice): keep everything, but plan removal of `'unsafe-inline'` from `script-src`. First move inline page scripts to real files if trivial; if a page breaks, STOP and report which page. Both copies must stay identical.
B4. Remove prod debug noise: delete `console.log` in `product.js:96,98,110`; downgrade `shop.js:386 console.error` to silent fallback (keep fallback catalogue); keep `console.error(JSON.stringify(entry))` server log ONLY. `build.js` logs stay (build-time only).
B5. `admin/login.html` + `admin/js/admin.js`: confirm NO hardcoded `admin@elle.com/admin123` and no `xAdminAuth` bypass (current `admin/login.html` already posts to `/api/admin/login` — keep it). Grep `admin123|xAdminAuth` in `admin/` returns 0 hits.

## 4. PHASE C — Input validation + CSRF + bot protection (V2+V3+V5) [MEDIUM-HIGH]
C1. Server validation in `functions/api/products.js`: on `handleCreateOrder`, `handleCustomerSignup` (~:1604+), `handleCustomerLogin` (~:1645+): trim names, run email regex server-side (frontend uses `checkout.js:659` — mirror it), reject `password.length<8` (already at :1613, keep), cap string lengths (names 100, address 500, quantity 1..99), reject unknown payment.method. Return 400 with plain message.
C2. CSRF: sessions are `SameSite=Lax` (good). ADD: for state-changing routes (`POST/PUT/DELETE /api/*`), reject when `Origin`/`Referer` header is present AND its origin differs from request origin. Same-origin fetch (no Origin header) keeps working. Do NOT break M-Pesa server-to-server callbacks (they use `verifyWebhookSecret`, not cookies — exempt them).
C3. Bot protection: Cloudflare Turnstile on `signup.html` + `checkout.html` contact section is the V5 ask. This needs a Turnstile site key + server verify. DO NOT hardcode keys. Implement frontend widget + server check against `TURNSTILE_SECRET` (via `wrangler secret put`), but gate it: if keys absent, log + allow (demo must not break). If owner has no keys, implement code + report "keys needed", leave disabled by default.

## 5. PHASE D — Checkout idempotency (V7) [HIGH]
D1. Migration `migrations/0009_idempotency.sql`: `ALTER TABLE orders ADD COLUMN idempotency_key TEXT; CREATE UNIQUE INDEX idx_orders_idem ON orders(idempotency_key) WHERE idempotency_key IS NOT NULL;`
D2. `checkout.js`: generate `crypto.randomUUID()` once per checkout attempt; send as `Idempotency-Key` header AND `payload.idempotencyKey` on `POST /api/orders`, `POST /api/payments/stk`, and paybill confirm. Disable `.place-order` via existing `setPlacing(true)` until response settles (already exists — keep, extend to classic flow too).
D3. `functions/api/products.js` `handleCreateOrder` + STK handler: if `idempotencyKey` present and an order with that key exists, return the EXISTING order (200, not new row). Else store key with the new row. Concurrent duplicates: one row wins (unique index), other gets existing.
- Accept: double-click / refresh / retry with same key creates exactly ONE order row; M-Pesa `CheckoutRequestID` still saved as `payment_reference`.

## 6. PHASE E — Logging (V6) [MEDIUM]
E1. `functions/api/products.js` `logError` (~:932-943): emit ONE JSON line per event: `{ts, level, reqId, route, user, msg, context(scrubbed)}`. Generate `reqId = crypto.randomUUID()` per request in `fetch()`. Levels: `info` (order created, payment confirmed), `warn` (validation/401/429), `error` (500/stock fail). NEVER log password/token/card — `scrubSensitive` stays.
E2. Frontend: keep `console.warn("API unavailable...")` fallbacks (needed for demo), remove all other `console.log` in root `*.js`.
- Accept: `wrangler tail` shows queryable JSON lines; no secret values in output.

## 7. PHASE F — Legal pages (V4) [MEDIUM — needs owner input]
F1. `privacy.html`, `terms.html` are placeholders ("before launch"). `help.html` Returns section is 2 sentences. There is NO cookie page/banner and NO refund page.
F2. Agent: draft real content SCAFFOLD in the existing `help-*` CSS style covering: data collected (contact/delivery/order), use, storage (D1/KV), marketing opt-in (`marketingOptIn` checkbox already exists in `checkout.html:27`), contact for deletion, terms (using store, orders/delivery/returns), cookie statement (sessions `x_cust_session`/`x_admin_session`, no tracking cookies — TRUE today, verify no analytics added), returns/refunds (hygiene exclusions already hinted in `help.html:82` — expand, do NOT invent a returns address). Add footer links (all pages share the same footer — update consistently) + `link-check.js` must pass.
F3. STOP and ask owner to review/approve legal text before calling it done. Flag: business details, applicable law (Kenya/EU?), image copyright — agent cannot know these.

## 8. Verify (must all pass before done)
- [ ] `node build.js` succeeds; `dist/` fresh; no `functions/` inside `dist/`.
- [ ] `npx wrangler dev --local` boots :8787.
- [ ] IDOR: B cannot read A's order → 401/404.
- [ ] Logout clears `xUser/xLoggedIn/xRememberLogin` + server session revoked; replayed URL → login.
- [ ] `POST /api/products` without admin cookie → 401.
- [ ] Duplicate `POST /api/orders` with same `Idempotency-Key` → 1 row.
- [ ] Rate-limit: 6th login in 5 min → 429.
- [ ] No `dev-webhook-secret-change-me`, `admin123`, `xAdminAuth` in repo (outside these instructions).
- [ ] `_tests/` suite passes with localStorage fallback intact.
- [ ] Owner approved legal text.

## 9. File map (absolute)
- API: `D:\Web Designs\ST\functions\api\products.js` | entry `D:\Web Designs\ST\functions\api\[[path]].js`
- Frontend auth: `D:\Web Designs\ST\login.js`, `signup.js`, `account.js`
- Checkout: `D:\Web Designs\ST\checkout.js`, `checkout.html`
- Legal: `D:\Web Designs\ST\privacy.html`, `terms.html`, `help.html`
- Config: `D:\Web Designs\ST\wrangler.toml`, `D:\Web Designs\ST\migrations\0001_initial.sql` to `0008_stock.sql` (+ new `0009_idempotency.sql`)
- Transcripts (read-only context): `D:\FW_work\transcripts_2026-10-09.txt`
- NEVER touch: `D:\Web Designs\ST\x-store\`, `dist\`, `.wrangler\`, `.kilo\`
