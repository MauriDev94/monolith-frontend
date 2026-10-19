/**
 * Typed access to the Vite-injected environment.
 *
 * Vite injects any `VITE_*` variable from `.env` / `.env.local` at build time.
 * Reading them through this helper keeps the rest of the code free of `string | undefined`
 * checks and surfaces missing values at boot, not deep in an axios call.
 */
const VITE_API_URL =
  (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8000';

export const env = {
  /**
   * Base URL of the FastAPI backend.
   *
   * - Dev (no `.env.local`): falls back to `http://localhost:8000` (Vite proxy target).
   * - Production: MUST be set in Vercel to `https://api-monolith.onrender.com`.
   */
  VITE_API_URL,

  /**
   * Base URL the axios clients send requests to.
   *
   * - Dev: empty, so requests stay relative (`/auth/...`) and go through the
   *   Vite proxy to `VITE_API_URL`. Same-origin means no CORS preflight and the
   *   refresh cookie is first-party.
   * - Production: `VITE_API_URL`; the backend allows the Vercel origin via
   *   `CORS_ALLOWED_ORIGINS`.
   */
  API_BASE_URL: import.meta.env.DEV ? '' : VITE_API_URL,
} as const;

export type Env = typeof env;
