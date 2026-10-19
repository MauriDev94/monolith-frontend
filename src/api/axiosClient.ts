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
 *       `access_token`.
 *     - On refresh failure, emit `authEvents.emit('unauthorized')` (handled
 *       by `AuthProvider`) and rethrow the original error.
 *     - The `_retried` flag prevents an infinite loop if the retry itself
 *       401s.
 *
 * Refresh uses the bare `refreshClient` (no interceptors) — otherwise the
 * refresh call could trigger a 401 cycle (locked decision #4).
 *
 * Refresh contract: the backend returns `{ tokens: { access_token, refresh_token } }`
 * (RefreshTokenResponse in the OpenAPI schema). The browser ignores the
 * new refresh cookie; only `access_token` is read here.
 */

type RetriedConfig = InternalAxiosRequestConfig & { _retried?: boolean };

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
  if (error.response?.status !== 401 || !original || original._retried) {
    throw error;
  }
  original._retried = true;

  try {
    const newAccess = await refreshAccessToken();
    original.headers.set('Authorization', `Bearer ${newAccess}`);
    return axiosClient(original);
  } catch (refreshErr) {
    authEvents.emit('unauthorized');
    throw refreshErr;
  }
});
