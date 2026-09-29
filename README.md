# monolith-frontend

Frontend SPA for the [Monolith](https://github.com/MauriDev94/Api_monolith) FastAPI backend.

> **Status**: planning phase. See the SDD change `frontend-monolith` in the backend repo (`openspec/changes/frontend-monolith/`) for the full proposal, specs, and architectural decisions.

## Stack (planned)

- **Build**: Vite + React 18 + TypeScript (strict)
- **Styling**: Tailwind CSS + shadcn/ui
- **Routing**: React Router 6
- **Data**: TanStack Query
- **HTTP**: axios with single-flight 401 interceptor
- **Forms**: React Hook Form + Zod
- **API types**: openapi-typescript (generated from backend `/openapi.json`)

## Backend

- API base URL (production): `https://api-monolith.onrender.com`
- OpenAPI schema: `https://api-monolith.onrender.com/openapi.json`
- Auth: HttpOnly cookie (refresh token) + Authorization header (access token)

## Phases

1. Setup — Vite + React + TS + Tailwind + shadcn/ui + Router + TanStack Query + axios
2. Auth — login, register, refresh, logout, protected routes
3. Todos — list (paginated) + create
4. Tests + polish + deploy (Vercel)
5. CRUD complete — edit, delete, toggle complete

## Development

Setup will land with Phase 1. Until then, the repo only contains this README and a placeholder `.gitignore`.

## Related

- Backend repo: <https://github.com/MauriDev94/Api_monolith>
- SDD change artifacts: `openspec/changes/frontend-monolith/` in the backend repo
