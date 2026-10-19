import axios, { AxiosError, type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';
import { env } from '@/lib/env';
import { tokenStore } from '@/api/tokenStore';
import { refreshClient } from '@/api/refreshClient';
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
 *     - `inflightRefresh` (module-scoped) coalesces concurrent 401s so
 *       exactly one `POST /auth/v1/refresh` is dispatched even if many
 *       requests 401 simultaneously.
 *     - On refresh success, retry the original request with the new
 *       `access_token`. The retry's own outcome (success or error) is
 *       returned as is; a failed retry never ends the session.
 *     - On refresh failure, emit `authEvents.emit('unauthorized')` (handled
 *       by `AuthProvider`) and rethrow the original 401, so callers see the
 *       error of the request they made rather than the refresh's.
 *     - The `_retried` flag prevents an infinite loop if the retry itself
 *       401s.
 *     - Credential endpoints (login, register) are skipped: their 401 means
 *       "wrong credentials", not "expired access token", so there is
 *       nothing to refresh.
 *
 * Refresh uses the bare `refreshClient` (no interceptors) — otherwise the
 * refresh call could trigger a 401 cycle (locked decision #4).
 *
 * Refresh contract: the backend returns `{ tokens: { access_token, refresh_token } }`
 * (RefreshTokenResponse in the OpenAPI schema). The browser ignores the
 * new refresh cookie; only `access_token` is read here.
 */

type RetriedConfig = InternalAxiosRequestConfig & { _retried?: boolean };

/** Endpoints whose 401 is a credential failure, never an expired session. */
const CREDENTIAL_PATHS = new Set(['/auth/v1/login', '/auth/v1/register']);

function isCredentialRequest(config: InternalAxiosRequestConfig): boolean {
  if (!config.url) return false;
  // `url` is relative in practice; the dummy base also handles an absolute one.
  return CREDENTIAL_PATHS.has(new URL(config.url, 'http://localhost').pathname);
}

let inflightRefresh: Promise<string> | null = null;

async function refreshAccessToken(): Promise<string> {
  if (inflightRefresh === null) {
    inflightRefresh = (async () => {
      try {
        // No body: the refresh token travels in the HttpOnly cookie.
        const { data } = await refreshClient.post<{
          tokens: { access_token: string; refresh_token: string };
        }>('/auth/v1/refresh');
        const newAccess = data.tokens.access_token;
        tokenStore.set(newAccess);
        return newAccess;
      } finally {
        // ALWAYS null, even on rejection — otherwise a failed refresh
        // would poison subsequent calls until the next page reload.
        inflightRefresh = null;
      }
    })();
  }
  return inflightRefresh;
}

export const axiosClient: AxiosInstance = axios.create({
  baseURL: env.API_BASE_URL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

axiosClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
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
  original._retried = true;

  let newAccess: string;
  try {
    newAccess = await refreshAccessToken();
  } catch {
    authEvents.emit('unauthorized');
    throw error;
  }

  // Outside the try: a failure of the retried request is that request's
  // error, not a lost session.
  original.headers.set('Authorization', `Bearer ${newAccess}`);
  return axiosClient(original);
});
