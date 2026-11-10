import { isAxiosError } from 'axios';
import type { components } from '@/api/schema';
import { tokenStore } from '@/api/tokenStore';
import { refreshClient } from '@/api/refreshClient';
import { authEvents } from '@/auth/authEvents';

/**
 * The one and only way to call `POST /auth/v1/refresh` (locked decision #4).
 *
 * Both the 401 interceptor in `axiosClient` and the proactive timer in
 * `AuthProvider` go through here, so concurrent callers share a single
 * request. Two refreshes with the same cookie would look like token reuse to
 * the backend, which revokes every session of the user.
 *
 * Refresh contract: the backend returns `{ tokens: { access_token, refresh_token } }`
 * (`RefreshTokenResponse` in the generated schema). The browser ignores the new
 * refresh cookie; only `access_token` is read.
 */

/**
 * Thrown when the refreshed token was discarded because the session was torn
 * down while announcing it (the token belongs to a different user). Cleanup
 * already ran, so callers must neither retry nor emit `'unauthorized'`.
 */
export class IdentityChangedError extends Error {
  constructor() {
    super('The refreshed token was discarded: the session changed.');
    this.name = 'IdentityChangedError';
  }
}

type RefreshTokenResponse = components['schemas']['RefreshTokenResponse'];

let inflightRefresh: Promise<string> | null = null;

export async function refreshAccessToken(): Promise<string> {
  if (inflightRefresh === null) {
    inflightRefresh = (async () => {
      try {
        // No body: the refresh token travels in the HttpOnly cookie.
        const { data } = await refreshClient.post<RefreshTokenResponse>('/auth/v1/refresh');
        const newAccess = data.tokens.access_token;
        tokenStore.set(newAccess);
        // Single place that announces a new token, so the provider
        // reschedules the proactive timer and checks the identity whichever
        // caller (timer or interceptor) triggered the refresh.
        authEvents.emit('refreshed', newAccess);
        // A listener may have torn the session down (identity switch). The
        // token then belongs to another user: reject so no waiter, neither the
        // interceptor retry nor the proactive timer, ever uses it.
        if (tokenStore.get() !== newAccess) {
          throw new IdentityChangedError();
        }
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

/**
 * True only when the server said the refresh credentials are no good (401 or
 * 403). A network error, a 5xx (e.g. a Render 502 during a deploy) or a 429
 * (refresh rate limit) says nothing about the session, so callers keep it.
 */
export function isAuthFailure(err: unknown): boolean {
  if (!isAxiosError(err)) return false;
  const status = err.response?.status;
  return status === 401 || status === 403;
}
