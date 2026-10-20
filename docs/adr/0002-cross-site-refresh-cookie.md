# ADR 0002 — Cross-site refresh cookie between Vercel and Render

- **Status:** Accepted
- **Date:** 2026-10-20

## Context

The SPA is deployed on Vercel (`*.vercel.app`) and the API on Render (`api-monolith.onrender.com`). Both domains are on the Public Suffix List, so the browser treats them as **different sites**, not just different origins.

The refresh token travels as an HttpOnly cookie set by the API. From the SPA's point of view that cookie is a **third-party cookie**, which the backend already sends as `SameSite=None; Secure` in production (Api_monolith#127). Browsers treat third-party cookies differently:

| Browser (default settings)        | Third-party refresh cookie     | Session after a reload |
| --------------------------------- | ------------------------------ | ---------------------- |
| Chrome, Edge                      | Allowed                        | Kept                   |
| Firefox                           | Partitioned per top-level site | Kept                   |
| Safari (macOS, every iOS browser) | Blocked (ITP)                  | Lost                   |
| Brave, Chrome incognito           | Blocked                        | Lost                   |

Where the cookie is blocked, login still works because the access token comes in the response body. The session ends on the next page reload, or when the proactive refresh fires about 14 minutes later and gets a 401.

Three options were considered:

1. **Call the API cross-site (the existing design).** `VITE_API_URL` points at Render, and the API allows the Vercel origin through `CORS_ALLOWED_ORIGINS`.
2. **Proxy the API through Vercel.** Rewrites in `vercel.json` (like the Vite dev proxy) would make every request same-origin and the cookie first-party in every browser. The cost is on the backend: its rate limits key on the rightmost `X-Forwarded-For`, which becomes Vercel's egress IP. All users would share one bucket (for example, 5 registrations per minute in total). Fixing that means trusting a header set by Vercel, which needs its own security review in the backend.
3. **A custom domain for both** (for example `app.<domain>` and `api.<domain>`). Same site, so the cookie is first-party, the rate limits keep working, and no proxy is needed. Needs a purchased domain and reopens locked decision #10 (free `vercel.app` subdomain).

## Decision

Ship option 1 for the MVP deploy. It needs no code change and no backend change, and keeps locked decision #10.

- Vercel: `VITE_API_URL=https://api-monolith.onrender.com`, baked in at build time.
- Render: `CORS_ALLOWED_ORIGINS` set to the production Vercel origin as a JSON list, today `["https://monolith-frontend-delta.vercel.app"]` (exact origin, no trailing slash).

## Consequences

- Safari, iOS and Brave users lose the session on reload. This is a known limitation of the MVP, not a bug to fix in the frontend.
- **Vercel preview deployments cannot log in.** Their URLs are not in the CORS allowlist, and the backend matches exact origins only. Previews are useful for checking the UI, not the API flow.
- The API on Render's free plan sleeps when idle. The first request after a pause took about 50 s in testing; axios has no timeout, so the request waits rather than failing.
- **Path forward:** option 3 when a domain is available. A cheaper interim step worth testing is adding the `Partitioned` attribute (CHIPS) to the refresh cookie in the backend. Safari's CHIPS support has been shipped, pulled and restored across 18.x and 26.x, so it needs verifying on real devices before relying on it.
