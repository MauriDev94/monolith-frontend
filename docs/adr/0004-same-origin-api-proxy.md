# ADR 0004 — Same-origin API through a Vercel proxy

- **Status:** Accepted
- **Date:** 2026-11-09
- **Supersedes:** [ADR 0002](0002-cross-site-refresh-cookie.md)

## Context

ADR 0002 kept the API cross-site (Vercel ↔ Render) because it needed no code or backend change. A security audit disproved that premise. With a `SameSite=None` refresh cookie and no `Origin` check:

- **Login CSRF.** `/auth/v1/login` is form-urlencoded, so any page can POST attacker credentials and overwrite the victim's refresh cookie in Chrome and Edge. The SPA then refreshes into the attacker's account.
- **Logout and reuse CSRF.** Cross-site POSTs to `/logout`, or two parallel `/refresh` calls, revoke every session of the victim.

Safari, iOS, Brave and Chrome incognito still drop the cookie, so the session ends on reload. `SameSite=Lax` alone does not stop login CSRF: a cross-site top-level form POST may set a Lax or Strict cookie (RFC 6265bis-22 §5.7). CHIPS (`Partitioned`) is unreliable in Safari (pulled in 18.5, back in 26.2) and Starlette only emits it on Python 3.14+.

ADR 0002 rejected the proxy because the backend's rate limits would see one Vercel IP. That now has a documented answer: Vercel forwards `x-real-ip` with the visitor's IP, and `vercel.json` route transforms can attach a secret request header taken from an environment variable.

## Decision

The decision holds only while it stays free: Vercel Hobby plus Render's free plan, no purchased domain.

1. **In every transport:** the backend rejects `/login`, `/refresh` and `/logout` when `Origin` is present and not in `CORS_ALLOWED_ORIGINS` (`null` included). The SPA checks the refreshed token's `sub` against `user.id`. Token responses send `Cache-Control: no-store`. The SPA sends `frame-ancestors 'none'`.
2. **`refresh_token` leaves the JSON bodies** of `/login`, `/refresh` and the Google callback. No non-browser client exists; only the backend's own tests read it.
3. **Proxy the API through Vercel**, on the paths the Vite dev proxy forwards (`/auth`, `/users`, `/v1/todos`):
   - `vercel.json` routes them to Render, sets `x-origin-secret` from the `ORIGIN_SECRET` environment variable (Production only) and disables rewrite caching. The SPA catch-all stays last.
   - `env.API_BASE_URL` is empty in every build; `VITE_API_URL` only feeds the Vite proxy.
   - The refresh cookie is `SameSite=Lax` and host-only in every environment.
   - `get_client_ip` trusts `x-real-ip` only when `x-origin-secret` matches (constant-time); otherwise it keeps the right-most `X-Forwarded-For`.
4. **Preview deployments cannot log in, by design.** With the proxy they would reach the production API and database, and the `Origin` check keeps rejecting their origins.
5. Locked decision #10 stays. A custom domain remains possible later without changing this design.

## Status of the work

Decided, not implemented. Order:

1. Backend `Origin` check (`BACKEND_PENDIENTES` item 5), `refresh_token` removal and `no-store` (item 6).
2. Frontend `sub` check (branch `fix/frontend-single-refresh`, in review).
3. Backend proxy readiness (item 8: `get_client_ip` with the secret, `SameSite=Lax`), deployed first; then the frontend proxy PR (`vercel.json` routes, `env.ts`, CSP).

Before relying on the proxy, verify in a preview that `Set-Cookie` passes through, that `Origin` and `Sec-Fetch-Site` are forwarded, that Render does not rewrite `x-real-ip`, and that `routes` wins over the SPA catch-all.

## Consequences

- Safari, iOS, Brave and incognito keep the session: the cookie is first-party.
- Dev and production use the same relative URLs; CSP `connect-src` can be `'self'`.
- Every user logs in once after the switch (the cookie moves from Render's host to Vercel's).
- **Accepted risk until step 1 is in production.** After a refresh the SPA compares the new token's `sub` with the current user. On a mismatch it tears the session down locally and redirects to `/login`. It deliberately does not call `/logout`: in the legitimate multi-tab case (the user switched accounts in another tab), that would revoke every session of the other user. So, without the backend `Origin` check, a login-CSRF victim who reloads after the mismatch ends up silently signed in to the attacker's account. The backend check is the real fix.
- Cost: Hobby is free and non-commercial; a portfolio qualifies. Over the included usage, Hobby is not billed: in most cases the feature stays unavailable for 30 days. External rewrites are documented without a plan restriction. Revisit if usage approaches the Hobby limits.
- Previews also proxy to the production API; the `Origin` check keeps them from logging in.
- Requests slower than 120 s (a long Render cold start) are expected to fail with `ROUTER_EXTERNAL_TARGET_ERROR`; not confirmed in the current docs.
- `ORIGIN_SECRET` lives in two dashboards; rotating it means Render accepts two values for one deploy.
- Browsers no longer exercise CORS; `CORS_ALLOWED_ORIGINS` remains the `Origin` allowlist.
- API routing depends on Vercel; leaving Vercel means another same-origin proxy or a custom domain.

## Rejected alternatives

- **Option 1 hardened only** (stay cross-site, add the `Origin` check): closes the CSRF holes, but Safari, iOS and Brave stay broken.
- **CHIPS (`Partitioned`)**: needs Python 3.14 in Starlette and Safari support is unreliable.
- **Custom domain**: reopens locked decision #10 and costs money. It stays compatible with this design later.

## References

- [Vercel Hobby plan](https://vercel.com/docs/plans/hobby): included usage and the 30-day wait after exceeding it.
- [Fair use guidelines](https://vercel.com/docs/limits/fair-use-guidelines): Hobby is non-commercial personal use only.
- [Rewrites on Vercel](https://vercel.com/docs/routing/rewrites): external origins, `x-real-ip`, restricting the origin with a secret header.
