import { createContext } from 'react';
import type { MeResponse } from '@/api/authApi';
import type { LoginValues, RegisterValues } from '@/auth/schemas';

/**
 * Three-state auth lifecycle.
 *
 * - `loading` — `AuthProvider` has mounted and is probing `GET /auth/v1/me`
 *   to restore any existing session. UI should render a skeleton (see
 *   `RequireAuth`) instead of redirecting, so the user does not see a
 *   `/login` flash on a hard reload with a valid cookie.
 * - `authenticated` — `/me` returned 200; `user` is populated.
 * - `unauthenticated` — `/me` returned 401 (or threw); `user` is null.
 */
export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

export interface AuthContextValue {
  /** Current user, populated only when `status === 'authenticated'`. */
  user: MeResponse | null;
  /** Lifecycle status of the auth context. */
  status: AuthStatus;
  /**
   * Exchange credentials for tokens and bootstrap the session.
   *
   * On 200: stores the access token, fetches `/me`, schedules proactive
   * refresh, and navigates to `from ?? '/todos'`.
   * On 401: shows the localized error toast. Caller may re-throw the
   * underlying error so the form can stop its submit spinner.
   *
   * @param values - Zod-validated login form values.
   * @param from - Optional URL the user should land on after success. Used
   * by `RequireAuth` to send users back to the page they came from.
   */
  login: (values: LoginValues, from?: string) => Promise<void>;
  /**
   * Create a new account and immediately log in.
   *
   * The backend returns no tokens on register, so this composes two calls:
   * `POST /auth/v1/register` followed by `login(values, from)`.
   */
  register: (values: RegisterValues, from?: string) => Promise<void>;
  /**
   * Tear down the local session and request server-side revocation.
   *
   * The `/auth/v1/logout` request is fire-and-forget: local state (scheduler,
   * token store, user, status) is cleared regardless of the network result
   * because the user MUST be able to log out even when offline.
   */
  logout: () => Promise<void>;
}

/**
 * Module-level React context for the auth state. The shape matches
 * `AuthContextValue` but the default is `null` so consumers (the
 * `useAuth` hook) can detect "called without an `<AuthProvider />`" and
 * throw loudly instead of silently returning `undefined`.
 */
export const AuthContext = createContext<AuthContextValue | null>(null);