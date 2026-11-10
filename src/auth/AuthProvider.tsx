import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { AxiosError } from 'axios';
import { toast } from 'sonner';
import { authEvents } from '@/auth/authEvents';
import { createRefreshScheduler, type RefreshScheduler } from '@/auth/tokenRefreshScheduler';
import { tokenStore } from '@/api/tokenStore';
import { refreshAccessToken, isAuthFailure, SessionEndedError } from '@/api/refreshAccessToken';
import { decodeJwtSub } from '@/auth/jwtDecode';
import { queryClient } from '@/api/queryClient';
import {
  login as apiLogin,
  register as apiRegister,
  logout as apiLogout,
  me as apiMe,
} from '@/api/authApi';
import { AuthContext, type AuthContextValue } from '@/auth/AuthContext';
import type { LoginValues, RegisterValues } from '@/auth/schemas';

/**
 * Wait before retrying a proactive refresh that failed for a non-auth reason
 * (offline, 5xx, 429). Long enough to ride out a blip or a rate-limit window,
 * short enough to land well inside the 60 s lead before the token expires.
 */
const REFRESH_RETRY_DELAY_MS = 15_000;

/**
 * Floor for the delay when rescheduling after a refresh. If the client clock
 * runs more than ~14 min ahead, the computed delay is always 0 and
 * refresh → schedule(0) → refresh would loop and exhaust the per-IP refresh
 * rate limit. Login and bootstrap scheduling have no floor, so an overdue
 * timer on wake still fires immediately.
 */
const MIN_RESCHEDULE_DELAY_MS = 30_000;

/**
 * Top-level auth state container.
 *
 * Mounted once by the root layout route in `routes.tsx`, inside
 * `<RouterProvider>`, so it can call `useNavigate`.
 *
 * Responsibilities:
 *
 *  1. **Session probe on mount** — `GET /auth/v1/me`. Sets `user` + status.
 *     `RequireAuth` uses this status to decide between skeleton, redirect,
 *     and outlet.
 *  2. **Login** — `POST /auth/v1/login` (form-encoded via `authApi.login`,
 *     which uses `axiosClient`). Stores the access token, fetches `/me`,
 *     schedules proactive refresh, navigates to `from ?? '/todos'`.
 *     On 401: shows `Email o contraseña incorrectos` toast. Re-throws so
 *     the calling form can stop its submit spinner.
 *  3. **Register** — `POST /auth/v1/register` followed by `login(values)`
 *     to bootstrap the session, because the backend returns no tokens on
 *     registration (locked decision #1: refresh is on success, not on
 *     registration).
 *  4. **Logout** — fire-and-forget `POST /auth/v1/logout`; cancel scheduler;
 *     clear token store; reset state; navigate to `/login`. Local cleanup
 *     runs even when the network request fails because users MUST be able
 *     to log out offline.
 *  5. **Forced logout** — subscribes to `authEvents.on('unauthorized', …)`
 *     and runs the same cleanup. `'unauthorized'` is emitted only when a
 *     refresh is rejected with 401/403 (no valid refresh cookie / reuse
 *     detection / revoked session); a network error or 5xx keeps the session.
 *     Without this listener the user would sit on a half-broken page; with
 *     it, the SPA tears itself down deterministically.
 *  6. **Refresh bookkeeping** — `'refreshed'` fires for every refresh,
 *     proactive or reactive. The listener checks the token's `sub` against
 *     the current user (identity switch → forced logout) and reschedules.
 *
 * Implements locked decisions #6 (auth state split), #7 (proactive
 * refresh) and #9 (real logout endpoint); see README.md.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthContextValue['user']>(null);
  const [status, setStatus] = useState<AuthContextValue['status']>('loading');
  const navigate = useNavigate();

  // One scheduler per mount. useMemo with `[]` guarantees the same
  // instance across renders so `schedule` / `cancel` calls hit the same
  // closure. The scheduler is cancelled on unmount (see effect below).
  const scheduler = useMemo<RefreshScheduler>(() => createRefreshScheduler(), []);

  // Pending retry of a failed proactive refresh (see `onRefresh`).
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearRetry = useCallback(() => {
    if (retryTimer.current !== null) {
      clearTimeout(retryTimer.current);
      retryTimer.current = null;
    }
  }, []);

  // Proactive refresh callback. Fires when the scheduler's timer pops and goes
  // through the same single-flight `refreshAccessToken` as the 401
  // interceptor, so an overlapping reactive refresh shares the request. The
  // new token is picked up by the `'refreshed'` listener below, which owns
  // rescheduling for both paths.
  const onRefresh = useCallback(async (): Promise<void> => {
    try {
      await refreshAccessToken();
      return;
    } catch (err) {
      // Terminal: cleanup already ran and must not be re-armed by a retry.
      if (err instanceof SessionEndedError) return;
      if (isAuthFailure(err)) {
        authEvents.emit('unauthorized');
        return;
      }
    }
    // Network error, 5xx or 429: the session is fine, the server was just
    // unreachable. Retry once after a bounded delay; if that fails too, the
    // 401 interceptor is the next line of defense on the next request.
    clearRetry();
    retryTimer.current = setTimeout(() => {
      retryTimer.current = null;
      refreshAccessToken().catch((err: unknown) => {
        if (!(err instanceof SessionEndedError) && isAuthFailure(err)) {
          authEvents.emit('unauthorized');
        }
      });
    }, REFRESH_RETRY_DELAY_MS);
  }, [clearRetry]);

  // Cancel the scheduler on unmount so a logout that happens during
  // a page transition (e.g., user navigates away) doesn't leave a
  // dangling timer.
  useEffect(() => {
    return () => {
      scheduler.cancel();
      clearRetry();
    };
  }, [scheduler, clearRetry]);

  // Mount: probe session via /auth/v1/me. Transitions status from
  // `loading` to `authenticated` or `unauthenticated` based on the result.
  useEffect(() => {
    let cancelled = false;
    // A login or logout during the probe (on a cold Render instance it can take
    // ~50 s) moves the epoch; the probe's result then belongs to a session that
    // no longer exists and must not overwrite the current one.
    const epoch = tokenStore.epoch();
    void (async () => {
      try {
        const me = await apiMe();
        if (cancelled || tokenStore.epoch() !== epoch) return;
        setUser(me);
        setStatus('authenticated');
        const token = tokenStore.get();
        if (token !== null) {
          scheduler.schedule(token, onRefresh);
        }
      } catch {
        if (cancelled || tokenStore.epoch() !== epoch) return;
        setUser(null);
        setStatus('unauthenticated');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [scheduler, onRefresh]);

  // Latest status, readable from the `'unauthorized'` listener without
  // re-subscribing on every status change.
  const statusRef = useRef(status);
  statusRef.current = status;
  const userRef = useRef(user);
  userRef.current = user;

  // Epoch set by the latest teardown. A login that aborts compares it with the
  // current epoch to tell "the session was torn down, nothing replaced it"
  // (revoke the cookie it just got) from "a newer login superseded me" (do not).
  const endedEpoch = useRef(-1);

  // Centralized cleanup. Used by `logout()` AND by the `'unauthorized'`
  // listener so both paths produce identical post-conditions.
  //
  // `endSession` is false only for an `'unauthorized'` with no session: nothing
  // ended, so the epoch must not move. Bumping would abort a login in flight
  // for an anonymous failure; a login whose own request was rejected fails with
  // its own error instead. Stale anonymous failures never get this far (the
  // interceptor drops requests of an older epoch), so what reaches here belongs
  // to the current epoch.
  const cleanup = useCallback(
    (endSession = true) => {
      scheduler.cancel();
      clearRetry();
      // Refs update synchronously: they otherwise lag until the next render, so
      // a second event or a refresh landing in the same tick would still see an
      // authenticated session.
      statusRef.current = 'unauthenticated';
      userRef.current = null;
      // Invalidate every async flow still in flight for the session that just
      // ended (probe, login, refresh) before clearing, so none can write back.
      if (endSession) endedEpoch.current = tokenStore.bumpEpoch();
      tokenStore.clear();
      // Drop every cached query (todos, …) so the next user who logs in on
      // this browser never sees the previous user's data, even for a frame.
      queryClient.clear();
      setUser(null);
      setStatus('unauthenticated');
    },
    [scheduler, clearRetry],
  );

  // Subscribe to `authEvents` so the 401 interceptor can tear the SPA
  // down when refresh fails. The unsubscribe is returned by `on()`.
  //
  // Only a session that was actually lost redirects to `/login`. An
  // anonymous visitor also triggers this event: the mount `/me` probe 401s,
  // the refresh attempt fails for lack of a cookie, and the interceptor
  // emits. Redirecting then would bounce every public page (`/register`,
  // `/`) to `/login`. Protected routes still redirect via `RequireAuth`.
  useEffect(() => {
    return authEvents.on('unauthorized', () => {
      const hadSession = statusRef.current === 'authenticated';
      cleanup(hadSession);
      if (hadSession) {
        navigate('/login', { replace: true });
      }
    });
  }, [cleanup, navigate]);

  // Every successful refresh, proactive or reactive, lands here with the new
  // token. Two jobs: (1) detect an identity switch and (2) rearm the timer.
  //
  // The refresh cookie can change under the SPA (login-CSRF, or another tab
  // logging in as someone else). The next refresh then returns a token for
  // user B while the UI still shows user A, and writes would go to B under A's
  // email. `sub` is the user id, the same value as `id` in `/auth/v1/me`.
  // No current user (bootstrap probe) means nothing to compare. An unreadable
  // token fails closed.
  useEffect(() => {
    return authEvents.on('refreshed', (token) => {
      // A refresh that resolved after logout must not revive the timer.
      if (statusRef.current === 'unauthenticated') return;
      // Any refresh supersedes a pending proactive retry.
      clearRetry();
      const current = userRef.current;
      if (current !== null) {
        let sub: string | null;
        try {
          sub = decodeJwtSub(token);
        } catch {
          sub = null;
        }
        if (sub !== current.id) {
          cleanup();
          toast.error('Tu sesión cambió. Vuelve a ingresar.');
          navigate('/login', { replace: true });
          return;
        }
      }
      scheduler.schedule(token, onRefresh, MIN_RESCHEDULE_DELAY_MS);
    });
  }, [cleanup, navigate, scheduler, onRefresh, clearRetry]);

  const login = useCallback(
    async (values: LoginValues, from?: string): Promise<void> => {
      // The epoch moves only when a session is actually established (below),
      // not when an attempt starts: a failed login (wrong password, network)
      // must leave the bootstrap probe and any running session untouched, or
      // the probe would drop its result and status would stay 'loading'.
      const startEpoch = tokenStore.epoch();
      let epoch = startEpoch;
      // Quiet abort: the session we were building was torn down. Resolve (not
      // reject) so the form just stops its spinner, with no toast or error.
      // The login response already set a refresh cookie that a reload would
      // turn back into a session, so revoke it, but only when nothing replaced
      // the torn-down session. A newer login (double submit) owns the cookie
      // now, and the backend logout revokes every refresh token of the user.
      const abort = () => {
        if (tokenStore.epoch() === endedEpoch.current) {
          void apiLogout().catch(() => {
            // Best effort; the local session is gone either way.
          });
        }
      };
      try {
        const { access_token } = await apiLogin(values);
        if (tokenStore.epoch() !== startEpoch) return abort();
        epoch = tokenStore.bumpEpoch();
        tokenStore.set(access_token);
        const meUser = await apiMe();
        if (tokenStore.epoch() !== epoch) return abort();
        setUser(meUser);
        setStatus('authenticated');
        scheduler.schedule(access_token, onRefresh);
        navigate(from ?? '/todos', { replace: true });
      } catch (err) {
        // The session ended while we awaited: whatever failed is moot.
        if (tokenStore.epoch() !== epoch) return;
        // The 401 interceptor may have ALREADY fired `cleanup()` via the
        // `'unauthorized'` event (when the refresh attempt itself 401'd).
        // Our job here is to surface a localized error so the form knows
        // the submit did not succeed.
        const status = err instanceof AxiosError ? err.response?.status : undefined;
        if (status === 401) {
          toast.error('Email o contraseña incorrectos');
        }
        // Re-throw so the calling form (`LoginForm`, or `RegisterForm` via
        // `register()`) can stop its spinner
        // and surface its own error UI for non-401 failures.
        throw err;
      }
    },
    [navigate, scheduler, onRefresh],
  );

  const register = useCallback(
    async (values: RegisterValues, from?: string): Promise<void> => {
      // Register returns no tokens; bootstrap the session immediately.
      await apiRegister(values);
      await login(values, from);
    },
    [login],
  );

  const logout = useCallback(async (): Promise<void> => {
    // Fire-and-forget. Local cleanup MUST run regardless of the network
    // result — the user clicked "Log out", so the local session is gone.
    // A 204 / refresh-cookie-clear is the success path; a network error
    // is acceptable because the server-side revocation depends on the
    // refresh cookie which the SPA cannot inspect directly anyway.
    void apiLogout().catch(() => {
      // Swallowed intentionally. Local cleanup below runs unconditionally.
    });
    cleanup();
    navigate('/login', { replace: true });
  }, [cleanup, navigate]);

  const value = useMemo<AuthContextValue>(
    () => ({ user, status, login, register, logout }),
    [user, status, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
