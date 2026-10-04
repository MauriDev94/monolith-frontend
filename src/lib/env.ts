/**
 * Typed access to the Vite-injected environment.
 *
 * Vite injects any `VITE_*` variable from `.env` / `.env.local` at build time.
 * Reading them through this helper keeps the rest of the code free of `string | undefined`
 * checks and surfaces missing values at boot, not deep in an axios call.
 */
export const env = {
  /**
   * Base URL of the FastAPI backend.
   *
   * - Dev (no `.env.local`): falls back to `http://localhost:8000` (Vite proxy target).
   * - Production: MUST be set in Vercel to `https://api-monolith.onrender.com`.
   */
  VITE_API_URL: (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8000',
} as const;

export type Env = typeof env;