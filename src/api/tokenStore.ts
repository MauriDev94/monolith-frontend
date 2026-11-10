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

/**
 * Session epoch: bumped whenever a session ends (logout, forced logout,
 * identity switch) or a new one starts (login). Async auth flows capture it
 * before they await and drop their result if it moved, so a flow that belongs
 * to an ended session can never write into the next one (a late `/me` probe, a
 * refresh that resolves after logout, a login interrupted by a logout).
 */
let sessionEpoch = 0;

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
  epoch(): number {
    return sessionEpoch;
  },
  /** Returns the new epoch, for flows that start a session and own it. */
  bumpEpoch(): number {
    sessionEpoch += 1;
    return sessionEpoch;
  },
} as const;