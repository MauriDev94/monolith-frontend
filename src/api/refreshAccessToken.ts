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
 * Refresh contract: the backend returns `{ tokens: { access_token, token_type } }`
 * (`RefreshTokenResponse` in the generated schema) and rotates the refresh token
 * in the HttpOnly cookie, its only transport since Api_monolith#130.
 */

/**
 * Thrown when a refresh result was discarded because the session it belonged
 * to is gone (see the session epoch in `tokenStore`). Terminal: whoever ended
 * the session already cleaned up, so callers must neither retry nor emit
 * `'unauthorized'`.
 */
export class SessionEndedError extends Error {
  constructor(message = 'The refresh was discarded: its session ended.') {
    super(message);
    this.name = 'SessionEndedError';
  }
}

/**
 * The refreshed token was discarded because a listener tore the session down
 * while announcing it (the token belongs to a different user).
 */
export class IdentityChangedError extends SessionEndedError {
  constructor() {
    super('The refreshed token was discarded: the session changed.');
    this.name = 'IdentityChangedError';
  }
}

type RefreshTokenResponse = components['schemas']['RefreshTokenResponse'];

let inflightRefresh: Promise<string> | null = null;

export async function refreshAccessToken(): Promise<string> {
  if (inflightRefresh === null) {
    // The epoch is captured by the one request that actually goes out. A caller
    // that joins it from a newer epoch (a login that started meanwhile) may get
    // SessionEndedError: acceptable, because that request would be answering
    // the old session's cookie, and a second concurrent refresh is never an
    // option (locked decision #4).
    const epoch = tokenStore.epoch();
    inflightRefresh = (async () => {
      try {
        // No body: the refresh token travels in the HttpOnly cookie.
        let data: RefreshTokenResponse;
        try {
          ({ data } = await refreshClient.post<RefreshTokenResponse>('/auth/v1/refresh'));
        } catch (err) {
          // A 401 for a session that already ended is not news: swallowing it
          // as SessionEndedError keeps callers from emitting 'unauthorized',
          // which would tear down whatever session replaced it.
          if (tokenStore.epoch() !== epoch) throw new SessionEndedError();
          throw err;
        }
        // Resolved after logout / a newer login: writing the token would leave
        // a live credential behind, and the interceptor would retry with it.
        if (tokenStore.epoch() !== epoch) throw new SessionEndedError();
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
