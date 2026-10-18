import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { AxiosError } from 'axios';
import { toast } from 'sonner';
import { authEvents } from '@/auth/authEvents';
import { createRefreshScheduler, type RefreshScheduler } from '@/auth/tokenRefreshScheduler';
import { tokenStore } from '@/api/tokenStore';
import { refreshClient } from '@/api/refreshClient';
import {
  login as apiLogin,
  register as apiRegister,
  logout as apiLogout,
  me as apiMe,
} from '@/api/authApi';
import { AuthContext, type AuthContextValue } from '@/auth/AuthContext';
import type { LoginValues, RegisterValues } from '@/auth/schemas';

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
 *     and outlet (see `FE-2-006`).
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
 *     and runs the same cleanup. The 401 interceptor in `axiosClient`
 *     emits `'unauthorized'` when the proactive refresh fails (no valid
 *     refresh cookie / reuse detection triggered / server revoked the
 *     session). Without this listener the user would sit on a half-broken
 *     page; with it, the SPA tears itself down deterministically.
 *
 * Design references:
 *   - `design.md §AuthProvider — Context + lifecycle`
 *   - `design.md §tokenRefreshScheduler`
 *   - spec `frontend-auth > Session Validation on Mount`,
 *     `User Login and Cookie-based Token Delivery > Invalid credentials`,
 *     `Logout Endpoint > Frontend logout side effects`.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthContextValue['user']>(null);
  const [status, setStatus] = useState<AuthContextValue['status']>('loading');
  const navigate = useNavigate();

  // One scheduler per mount. useMemo with `[]` guarantees the same
  // instance across renders so `schedule` / `cancel` calls hit the same
  // closure. The scheduler is cancelled on unmount (see effect below).
  const scheduler = useMemo<RefreshScheduler>(() => createRefreshScheduler(), []);

  // Proactive refresh callback. Fires when the scheduler's timer pops.
  // Calls `refreshClient.post('/auth/v1/refresh')` directly so we own the
  // re-schedule loop without coupling to `axiosClient`'s internal
  // `refreshAccessToken`. The interceptor on `axiosClient` is not
  // involved: `refreshClient` is bare by construction (see
  // `src/api/refreshClient.ts`) and so cannot cascade.
  const onRefresh = useCallback(async () => {
    try {
      const { data } = await refreshClient.post<{
        tokens: { access_token: string; refresh_token: string };
      }>('/auth/v1/refresh');
      const newAccess = data.tokens.access_token;
      tokenStore.set(newAccess);
      // Re-schedule with the new token so the next refresh fires
      // 60s before the new exp. `onRefresh` is stable (closure over the
      // memoized `scheduler`) so passing it back to `schedule` keeps the
      // loop going.
      scheduler.schedule(newAccess, onRefresh);
    } catch {
      // The 401 interceptor on `axiosClient` will emit `'unauthorized'`
      // when any user-facing request 401s against the (now invalid)
      // token store. The listener below runs the cleanup. Swallowing
      // here keeps the scheduler from holding a stale timer.
    }
  }, [scheduler]);

  // Cancel the scheduler on unmount so a logout that happens during
  // a page transition (e.g., user navigates away) doesn't leave a
  // dangling timer.
  useEffect(() => {
    return () => {
      scheduler.cancel();
    };
  }, [scheduler]);

  // Mount: probe session via /auth/v1/me. Transitions status from
  // `loading` to `authenticated` or `unauthenticated` based on the result.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const me = await apiMe();
        if (cancelled) return;
        setUser(me);
        setStatus('authenticated');
        const token = tokenStore.get();
        if (token !== null) {
          scheduler.schedule(token, onRefresh);
        }
      } catch {
        if (cancelled) return;
        setUser(null);
        setStatus('unauthenticated');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [scheduler, onRefresh]);

  // Centralized cleanup. Used by `logout()` AND by the `'unauthorized'`
  // listener so both paths produce identical post-conditions.
  const cleanup = useCallback(() => {
    scheduler.cancel();
    tokenStore.clear();
    setUser(null);
    setStatus('unauthenticated');
  }, [scheduler]);

  // Subscribe to `authEvents` so the 401 interceptor can tear the SPA
  // down when refresh fails. The unsubscribe is returned by `on()`.
  useEffect(() => {
    return authEvents.on('unauthorized', () => {
      cleanup();
      navigate('/login', { replace: true });
    });
  }, [cleanup, navigate]);

  const login = useCallback(
    async (values: LoginValues, from?: string): Promise<void> => {
      try {
        const { access_token } = await apiLogin(values);
        tokenStore.set(access_token);
        const meUser = await apiMe();
        setUser(meUser);
        setStatus('authenticated');
        scheduler.schedule(access_token, onRefresh);
        navigate(from ?? '/todos', { replace: true });
      } catch (err) {
        // The 401 interceptor may have ALREADY fired `cleanup()` via the
        // `'unauthorized'` event (when the refresh attempt itself 401'd).
        // Our job here is to surface a localized error so the form knows
        // the submit did not succeed.
        const status = err instanceof AxiosError ? err.response?.status : undefined;
        if (status === 401) {
          toast.error('Email o contraseña incorrectos');
        }
        // Re-throw so the calling form (FE-2-008) can stop its spinner
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
