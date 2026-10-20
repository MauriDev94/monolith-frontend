# CLAUDE.md — monolith-frontend

React SPA for the Monolith FastAPI backend (`../monolith-backend`, GitHub repo `MauriDev94/Api_monolith`). Deployed on Vercel; the API runs on Render. `README.md` has the stack, the 12 locked architectural decisions and deploy notes. This file covers how to work in the repo. The workspace-level `dev/CLAUDE.md` rules (Git, secrets, no AI attribution) also apply.

## Commands

pnpm is not installed globally. Run it through corepack:

```bash
corepack pnpm install
corepack pnpm dev          # http://localhost:5173
corepack pnpm test         # vitest run
corepack pnpm typecheck    # tsc --noEmit
corepack pnpm lint         # eslint, --max-warnings 0
corepack pnpm build        # tsc --noEmit && vite build
```

CI (`.github/workflows/ci.yml`) runs lint, typecheck, test and build on every PR. Run all four before opening one.

`.env.local` is created from `.env.example`. Never read or print `.env*` files other than `.env.example`.

## Running the full stack locally

1. Postgres: `docker compose -f docker-compose-dev.yaml up -d` from `../monolith-backend` (container `monolith_db`).
2. API: from `../monolith-backend`, `.venv\Scripts\uvicorn.exe app.main:app --reload --port 8000`.
3. Frontend: `corepack pnpm dev`.

On Windows, `uvicorn --reload` can log "Reloading..." after a branch switch without starting a new worker, so the old code keeps serving. If a backend change seems to have no effect, restart uvicorn.

Docker Desktop's WSL VM is capped at 4 GB (`~/.wslconfig`). The machine has 16 GB of RAM; Claude Code may kill idle background servers when memory runs low.

## Architecture

```
src/
  api/          axios clients, typed endpoint wrappers (authApi, todosApi), token store,
                query client, apiErrors (Spanish copy for failed calls)
  auth/         AuthProvider, RequireAuth, forms, Zod schemas, refresh scheduler, events
  todos/        quest log: CreateTodoForm, TodoCard, Zod schema, TanStack Query hooks
  components/   app components (Navbar, ThemeToggle, EmptyState, Ornament…) + ui/ (shadcn primitives)
  routes/       router + one file per page
  lib/          env, cn() helper
  styles/       globals.css (Tailwind + shadcn HSL tokens)
tests/          Vitest specs, one file per unit; setup.ts, test-fixtures.ts
```

### Requests and the dev proxy

- `env.API_BASE_URL` is empty in dev and `VITE_API_URL` in production builds. In dev every request is a relative URL that the Vite proxy forwards (`/auth`, `/users`, `/v1/todos` → `VITE_API_URL`, default `http://localhost:8000`).
- Never call `VITE_API_URL` directly from browser code in dev. The backend's default CORS allowlist is `localhost:3000` only, and going through the proxy keeps the refresh cookie first-party.
- New backend path prefixes must be added to the proxy in `vite.config.ts`.

### Auth flow

- **Two axios clients.** `axiosClient` attaches `Authorization: Bearer` and refreshes on 401 with a single-flight promise (concurrent 401s share one `/refresh` call; the backend's reuse detection requires it). Login and register 401s skip the refresh (wrong credentials, not an expired token), and a failed refresh rethrows the original request's error. `refreshClient` has no interceptors and is used only for `/auth/v1/refresh`, which avoids recursion.
- **Token storage.** The access token lives in a module variable (`api/tokenStore.ts`), never in React state or storage. The `user` lives in `AuthContext`.
- **Refresh cookie.** The refresh token is an HttpOnly cookie that the frontend never reads. The backend sends `Secure; SameSite=None` in production and `SameSite=Lax` without `Secure` in dev (Api_monolith#127). In production it is a third-party cookie (Vercel ↔ Render), so Safari, iOS and Brave drop it and the session ends on reload; ADR 0002 records why this is accepted for the MVP.
- **Refresh body.** `/auth/v1/refresh` is posted without a body; the backend reads the cookie (bodyless requests accepted since Api_monolith#128).
- **Proactive refresh.** `tokenRefreshScheduler` fires 60 s before the JWT `exp`.
- **Forced logout.** `authEvents` emits `'unauthorized'` when a refresh fails. `AuthProvider` redirects to `/login` only if a session was active (it reads status through a ref). Anonymous visitors on `/` or `/register` must stay put.
- **Logout clears the query cache.** `AuthProvider`'s cleanup calls `queryClient.clear()` so the next user on the same browser never sees the previous user's todos. Any new per-user query is covered automatically.
- **Provider placement.** `AuthProvider` is mounted by the root layout route (`AuthLayout` in `routes/routes.tsx`), inside `RouterProvider`, because it calls `useNavigate`. Moving it above the router renders a blank page.

### Backend contract gotchas

- `/auth/v1/me` and `/auth/v1/register` wrap the user: `{ "user": { … } }`. `authApi` unwraps it.
- `/auth/v1/login` is `application/x-www-form-urlencoded` with `username` + `password` (OAuth2 password flow). Register is JSON.
- `birthdate` is `null` for Google SSO users.
- Validation errors come back as **400** (not 422) with `{ message, errors: [{ field, message, type }] }`. Domain rule violations (e.g. a todo `due_date` in the past) are also 400.
- Never show `err.message` to users (axios messages are English). Use `apiErrorMessage(err, fallback)` from `api/apiErrors.ts`; handle endpoint-specific statuses first (see `auth/authErrors.ts`).
- Todos: `GET /v1/todos?limit&offset` returns `{ todos, total, limit, offset }`, oldest first (`limit` 1–100). `POST /v1/todos` takes `{ title, description?, due_date? }` and returns `{ todo }`. Datetimes are ISO strings with a UTC offset.
- Response types are hand-written in `api/authApi.ts` and `api/todosApi.ts` (openapi-typescript codegen is planned, not wired). When adding or changing a type, check it against the backend's `/openapi.json` or its Pydantic schemas. The mocked tests will not catch a wrong shape.

## Testing

- Vitest + happy-dom + Testing Library, `globals: true`. Mock HTTP with `axios-mock-adapter` or `vi.mock` of the API module.
- Use the password constants in `tests/test-fixtures.ts`. Do not inline password literals; GitGuardian runs on PRs.
- The router in `routes/routes.tsx` is a module singleton created at import time. In tests it ignores `history.pushState`, so navigate by clicking links instead.
- Prefer `data-testid` for app-level elements (e.g. `navbar-login-link`, `navbar-user-email`, `navbar-logout-button`) and accessible roles/labels for form controls.
- Every spec in this repo was written against mocked HTTP, and four integration bugs reached a running backend unnoticed (PR #7). For anything touching the API, also verify manually against the real backend: Playwright MCP is configured to use Edge, and screenshots go in `.playwright-mcp/` (gitignored).

## Code conventions

- TypeScript strict. Import from `src` through the `@/` alias.
- Prettier (`.prettierrc`: single quotes, semicolons, trailing commas, width 100). A global hook formats files after each edit.
- Comments explain why, often citing the locked decision they implement. Match that density in new code.
- UI primitives come from shadcn (`components.json`, base color slate). Add new ones under `src/components/ui/`.

## UI copy

- All user-facing text is in **neutral Spanish with tú**: "Ingresa", "Regístrate", "¿No tienes cuenta?". Never use voseo ("Ingresá", "Registrate", "tenés").
- Code, comments, test names and docs are in English.

## Design

- Visual identity "Grimorio" (ink, parchment, gold): see `docs/adr/0001-rpg-visual-identity.md`, which also records the two alternative directions.
- Theme tokens are HSL CSS variables in `src/styles/globals.css` (`.dark` = default, `:root` = light). Use the tokens (`bg-card`, `text-primary`, `border-input`, `text-wine`…), never hard-coded colors. Keep text/background pairs at 4.5:1 or more.
- Fonts: `font-display` (Cinzel; `h1`–`h3` default to it) and `font-sans` (Alegreya Sans), self-hosted via `@fontsource/*` imported in `src/main.tsx`.
- Theme switching: `next-themes` in `App.tsx` (dark default, system preference ignored, key `monolith-theme`); the switch is `components/ThemeToggle.tsx` in the navbar. `index.html` ships `class="dark"` to avoid a light flash.
- UI copy keeps the RPG voice (tasks are "misiones") in neutral Spanish with tú. Layouts must work at 390 px wide without horizontal scroll.
- Feature ideas beyond the MVP (complete quests, XP, rarity, mascot) and their order live in `docs/roadmap.md`.

## Scope

- Locked decisions in `README.md` are not reopened without the user asking. In particular: no Google OAuth in the MVP, and todos are list + create only (edit/delete deferred).
- The original SDD artifacts (OpenSpec proposal, specs, `design.md`) were not preserved. Code comments that cite them (`design.md §…`, `spec frontend-auth > …`, `FE-…` task IDs) point to documents that no longer exist; `README.md` and the code are the source of truth.
- Record new architectural decisions as ADRs in `docs/adr/` (one short file per decision: context, decision, consequences).

## Git and PRs

- Branches: `feature/frontend-…` for features (history uses `feature/`, not `feat/`), `fix/frontend-…`, `docs/…`, `chore/…`. Never push to `main`.
- Conventional Commits with the `frontend` scope: `feat(frontend): …`, `fix(frontend): …`, `chore(frontend): …`.
- PR bodies are in English with these sections: **Summary**, **Changes** (a `File | Change` table), **Verification** (test counts, typecheck, lint, manual steps), and **Out of scope**.
- Commits are authored by the user (MauriDev94). No AI attribution anywhere.

## Backend issues

Do not fix the backend from this repo's sessions. Write the issue up in `../BACKEND_PENDIENTES.md` (outside both repos) with the symptom, the cause (file:line), a proposed fix and how to verify it. The user fixes it in a session started from `../monolith-backend`, which loads that repo's own `AGENTS.md` harness and `backend-developer` agent.
