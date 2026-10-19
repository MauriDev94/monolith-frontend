# monolith-frontend

React SPA for the [Monolith](https://github.com/MauriDev94/Api_monolith) FastAPI backend.

> **Status**: scaffold (PR2), auth (PR3: login, register, logout, session refresh, auth-aware navbar), the "Grimorio" theme and todos list + create (PR4, the `/todos` quest log) complete. The Vercel deploy (PR5) is the last MVP item; later features are in [`docs/roadmap.md`](docs/roadmap.md). The original SDD artifacts (OpenSpec proposal, specs, design) were not preserved; the locked decisions below and the code comments are the source of truth. New architectural decisions go in `docs/adr/`.

## Stack

- **Build**: Vite + React 18 + TypeScript (strict)
- **Styling**: Tailwind CSS + shadcn/ui primitives, "Grimorio" RPG theme with dark mode by default (`next-themes`, [ADR 0001](docs/adr/0001-rpg-visual-identity.md))
- **Routing**: React Router 6
- **Data**: TanStack Query (PR3+) + axios with single-flight 401 interceptor (PR3)
- **Forms**: React Hook Form + Zod + shadcn `Form` (PR3+)
- **API types**: openapi-typescript codegen (PR3+)
- **Toasts**: Sonner
- **Tests**: Vitest + happy-dom + @testing-library/react (PR5)

## Architectural decisions (locked, do not reopen)

The 12 decisions from the backend design session are immutable. One-line rationale:

1. **Refresh token in HttpOnly cookie** set by the backend; browser auto-sends it for `/refresh`.
2. **API types via `openapi-typescript` codegen** from `/openapi.json` — never hand-typed.
3. **axios with interceptors** for transport; no `fetch` wrappers.
4. **Single-flight 401 pattern**: concurrent 401s share one `/refresh` Promise — backend reuse detection mandates it.
5. **Google OAuth is OUT of MVP** — backend endpoints exist but the frontend waits until v2.
6. **Auth state split**: Context holds `user`; module-level variable holds `access_token` (no Context re-renders on refresh).
7. **Proactive refresh via `setTimeout` 60s before JWT `exp`** — fires the request before the user sees a 401.
8. **React Hook Form + Zod + shadcn `Form`** — same form layer across login, register, and create-todo.
9. **Real logout endpoint** `POST /auth/v1/logout` (idempotent, clears cookie + revokes refresh tokens server-side).
10. **Vercel free tier + free subdomain** `monolith-frontend.vercel.app`.
11. **Phase 3 scope: list + create todos ONLY** — edit/delete deferred.
12. **Phase 4: 20–30 Vitest tests + Vercel deploy**.

## Local dev

```bash
pnpm install
cp .env.example .env.local       # adjust VITE_API_URL if needed
pnpm dev                          # http://localhost:5173
```

The Vite dev server proxies `/auth`, `/users`, and `/v1/todos` to `VITE_API_URL` (default `http://localhost:8000`). In dev the axios clients use relative URLs (`env.API_BASE_URL` is empty) so every request goes through this proxy: no CORS preflight, and the refresh cookie stays first-party. Production builds call `VITE_API_URL` directly and rely on the backend's `CORS_ALLOWED_ORIGINS`.

## Build & test

```bash
pnpm build          # tsc --noEmit && vite build
pnpm typecheck      # tsc --noEmit (no emit)
pnpm lint           # eslint with --max-warnings 0
pnpm test           # vitest; PR5 wires the full 20–30 test suite
```

## Deploy (Vercel)

- Import the repo in Vercel, framework preset **Vite**.
- Set `VITE_API_URL=https://api-monolith.onrender.com` in **Environment Variables**.
- Every PR gets a preview URL automatically.
- `vercel.json` ships SPA rewrites (so React Router handles hard reloads) plus security headers (`X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`).

## Cookie transport notes

- `refresh_token` is an HttpOnly cookie set by the backend with `SameSite=None; Secure` in production (mandatory for Vercel ↔ Render cross-origin).
- In dev the backend sends `SameSite=Lax` without `Secure` ([Api_monolith#127](https://github.com/MauriDev94/Api_monolith/pull/127)). Chromium browsers reject `SameSite=None` cookies that are not `Secure`, and `Lax` is enough because dev requests are same-origin through the Vite proxy.
- The frontend NEVER reads `refresh_token` from `document.cookie`. The cookie is purely a transport for `/auth/v1/refresh`.
- `LoginResponse.refresh_token` (in the JSON body) is also never read by the frontend — it exists for non-browser clients (mobile/CLI). The access token in the body is the only credential the SPA extracts.

## Related

- Backend repo: <https://github.com/MauriDev94/Api_monolith>
