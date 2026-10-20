# Google Sign-In (OAuth) — Setup & Fix Notes

## Why you saw "Error 400: invalid_request"

The login page uses **Google Identity Services (GIS)** — the "Sign in with
Google" button that returns an ID token (`credential`) to the page, which
`/api/auth/google` verifies server-side against Google's `tokeninfo` endpoint
and checks the `aud` claim against the client ID. That backend is correct and
did not need changing.

The 400 error comes from **Google's side of the flow, before any of our code
runs**:

1. `login.html` / `signup.html` embed `https://accounts.google.com/gsi/client`
   and render the sign-in button.
2. Google renders that button inside an iframe served from
   `accounts.google.com`. Before issuing any credential, Google verifies that
   the page's **origin** (scheme + host + port) is listed in the OAuth
   client's **Authorized JavaScript origins**.
3. The page was opened as `file:///D:/Web%20Designs/ST/login.html`. A `file:`
   URL is not a verifiable web origin, so Google stops the flow and shows
   **"Error 400: invalid_request … does not comply with Google's OAuth 2.0
   policy for secure response handling."**
   The same happens for any origin (e.g. a random local port or a staging
   host) that is not registered on the client.

The app now detects `file://` / unregistered protocols itself and shows a
clear message instead of letting Google render its error page.

## Minimum changes to run Google sign-in locally

Run the site from a real HTTP origin. The repo already contains Wrangler
(the Cloudflare Pages dev server, which also serves `/api/*` and D1):

```bash
npm run build      # node build.js -> dist/
npx wrangler dev   # serves http://127.0.0.1:8787 per wrangler.toml [dev]
```

(For pure styling work without the API, `npm run dev:static` — `npx serve .`
— is enough, but `/api/*` calls, including Google sign-in verification, will
404.)

### Google Cloud Console settings (required — cannot be automated in code)

Google Cloud Console → **APIs & Services → Credentials** → OAuth client ID
`540286988119-….apps.googleusercontent.com` (type must stay **Web
application**):

| Setting | Value |
|---|---|
| Application type | Web application |
| Authorized JavaScript origins | `http://127.0.0.1:8787`, `http://localhost:8787`, `https://x-store-prod.walterkibe7.workers.dev` (plus your real domain when it exists) |
| Authorized redirect URIs | Not used by this flow (GIS returns the token in the page's JavaScript callback, not via a redirect) — leave empty or keep your existing entries |

Notes:
- Origins must match **exactly** (scheme + host + port, no trailing slash).
  `http://127.0.0.1:8787` and `http://localhost:8787` are different origins.
- This app uses the GIS **JavaScript button flow**, so no client secret is
  involved on the frontend and none should be published.
- Changes can take 5 minutes to a few hours to propagate.

## Production

Add every https origin that will host the login page to **Authorized
JavaScript origins**, e.g.:

- `https://x-store-prod.walterkibe7.workers.dev`
- your custom domain, e.g. `https://elle.example.com`

Nothing else changes: the browser posts `{ credential }` to
`/api/auth/google`, which verifies the token via Google and checks
`tokenInfo.aud` against `GOOGLE_CLIENT_ID` (set in
`functions/api/products.js`, overridable per environment via the
`GOOGLE_CLIENT_ID` var).

## Code changes made in this fix

- `login.js` / `signup.js`
  - Guard: skip GIS init and explain the problem when the page runs on
    `file://` or a non-https/local origin.
  - `renderButton` width is now measured from the container (capped 200–400px)
    instead of a hard-coded `370` — a 370px button overflowed 320–430px
    viewports and caused **horizontal scrolling** on login/signup.
  - `use_fedcm_for_prompt: true` so the One Tap prompt keeps working under
    Chrome's FedCM policy.
  - Better error message if the GIS client itself fails to load.
- `package.json`: `npm run dev` now runs `npx wrangler dev` (the previous
  script pointed at a nonexistent `x-store` folder).

## What still needs a real run to verify

The client + Google Console combination can only be proven end-to-end with a
real registered origin and a signed-in Google test account:

1. `npx wrangler dev` → open `http://127.0.0.1:8787/login.html`.
2. Click **Continue with Google**, choose the account.
3. Expect: "Choose an account…" → "Verifying with Google…" → redirect to
   `account.html`, customer row created in D1 (`/api/auth/google`).
