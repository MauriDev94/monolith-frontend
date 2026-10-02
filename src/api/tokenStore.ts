/**
 * Module-level access token storage.
 *
 * Why module-level (not React Context, not Zustand)?
 *
 * - The token is read on EVERY API call via the axios request interceptor.
 *   A refresh fires every ~14 minutes (15 min token lifetime − 60s early window).
 * - Putting it in Context would re-render the entire React tree on every
 *   refresh — invalidating TanStack Query hooks, form state, scroll position,
 *   and focus for a value the UI never displays.
 * - The user identity (User object) lives in AuthProvider Context because
 *   components DO react to it. The token and the identity are orthogonal
 *   dimensions and use orthogonal storage strategies (locked decision #6).
 *
 * React DevTools cannot inspect this. That is by design.
 */

let accessToken: string | null = null;

export const tokenStore = {
  get(): string | null {
    return accessToken;
  },
  set(token: string | null): void {
    accessToken = token;
  },
  clear(): void {
    accessToken = null;
  },
} as const;