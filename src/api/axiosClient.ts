import axios, { AxiosError, type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';
import { env } from '@/lib/env';
import { tokenStore } from '@/api/tokenStore';
import { refreshAccessToken, isAuthFailure } from '@/api/refreshAccessToken';
import { authEvents } from '@/auth/authEvents';

/**
 * Main axios client for all authenticated API traffic.
 *
 * Two interceptors:
 *
 *  1. **Request** — attach `Authorization: Bearer <access_token>` when the
 *     module-level `tokenStore` has a token. Read-only — never triggers a
 *     refresh.
 *  2. **Response** — single-flight 401 refresh:
 *     - On the first 401 for a request, mark it `_retried` and call
 *       `refreshAccessToken()`.
 *     - Its module-scoped single-flight promise coalesces concurrent 401s
 *       (and the proactive timer) so exactly one `POST /auth/v1/refresh` is
 *       dispatched even if many callers need it simultaneously.
 *     - On refresh success, retry the original request with the new
 *       `access_token`. The retry's own outcome (success or error) is
 *       returned as is; a failed retry never ends the session.
 *     - On refresh failure, rethrow the original 401, so callers see the
 *       error of the request they made rather than the refresh's. Only when
 *       the refresh itself was rejected (401/403) also emit
 *       `authEvents.emit('unauthorized')` (handled by `AuthProvider`); a
 *       network error, 5xx or 429 keeps the session.
 *     - The `_retried` flag prevents an infinite loop if the retry itself
 *       401s.
 *     - Credential endpoints (login, register) are skipped: their 401 means
 *       "wrong credentials", not "expired access token", so there is
 *       nothing to refresh.
 *
 * `refreshAccessToken` uses the bare `refreshClient` (no interceptors) —
 * otherwise the refresh call could trigger a 401 cycle (locked decision #4).
 */

/**
 * `_epoch` is the session epoch (see `tokenStore`) when the request was sent.
 * A refresh is attributed to the request that triggered it, not to the epoch
 * at refresh start: otherwise a 401 from an anonymous visit that lands while a
 * login is in flight would refresh and tear down the session being built.
 */
type RetriedConfig = InternalAxiosRequestConfig & { _retried?: boolean; _epoch?: number };

/** Endpoints whose 401 is a credential failure, never an expired session. */
const CREDENTIAL_PATHS = new Set(['/auth/v1/login', '/auth/v1/register']);

function isCredentialRequest(config: InternalAxiosRequestConfig): boolean {
  if (!config.url) return false;
  // `url` is relative in practice; the dummy base also handles an absolute one.
  return CREDENTIAL_PATHS.has(new URL(config.url, 'http://localhost').pathname);
}

export const axiosClient: AxiosInstance = axios.create({
  baseURL: env.API_BASE_URL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

axiosClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  // Also re-tags the retry of a refreshed request with the then-current epoch.
  (config as RetriedConfig)._epoch = tokenStore.epoch();
  const token = tokenStore.get();
  if (token) {
    config.headers.set('Authorization', `Bearer ${token}`);
  }
  return config;
});

axiosClient.interceptors.response.use(undefined, async (error: AxiosError) => {
  const original = error.config as RetriedConfig | undefined;
  if (
    error.response?.status !== 401 ||
    !original ||
    original._retried ||
    isCredentialRequest(original)
  ) {
    throw error;
  }
  // A request sent by a session that has since ended or been replaced is moot:
  // no refresh (its 401 says nothing about the current session, and a failed
  // refresh would emit 'unauthorized' against it), no retry, no event.
  if (original._epoch !== tokenStore.epoch()) throw error;
  // A request that left with a Bearer token from a session that has since been
  // torn down (logout, forced logout, identity change) must not start a new
  // refresh: it could resurrect the session with a stale or hostile cookie.
  // The bootstrap /me probe leaves without Authorization and still refreshes.
  if (original.headers.has('Authorization') && tokenStore.get() === null) throw error;
  original._retried = true;

  let newAccess: string;
  try {
    newAccess = await refreshAccessToken();
  } catch (refreshErr) {
    // The session moved on while the refresh was in flight: its failure is not
    // about the current one.
    if (original._epoch !== tokenStore.epoch()) throw error;
    // A SessionEndedError needs nothing here and is not an auth failure, so it
    // falls through to the rethrow: no event, no retry. Usually cleanup already
    // ran (identity switch, logout). The one exception is a current-epoch
    // request that joined a refresh started by an older epoch; it surfaces as
    // the request's own 401 (very unlikely, and no retry logic is needed).
    // Otherwise, only a rejected refresh credential ends the session. A network
    // error, a 5xx or a 429 leaves it intact: the caller gets its own 401 and
    // the query shows an error state instead of the user being logged out.
    if (isAuthFailure(refreshErr)) {
      authEvents.emit('unauthorized');
    }
    throw error;
  }

  // Never retry a request of an ended session with the new token.
  if (original._epoch !== tokenStore.epoch()) throw error;

  // Outside the try: a failure of the retried request is that request's
  // error, not a lost session.
  original.headers.set('Authorization', `Bearer ${newAccess}`);
  return axiosClient(original);
});
