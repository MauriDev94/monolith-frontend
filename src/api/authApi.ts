import { axiosClient } from '@/api/axiosClient';
import type { LoginValues, RegisterValues } from '@/auth/schemas';

/**
 * Typed wrappers around the auth endpoints.
 *
 * Why wrap instead of calling axios directly from components / AuthProvider?
 *
 *  - Endpoint paths live in one place. Renaming `/auth/v1/me` to
 *    `/auth/v1/users/me` touches one file.
 *  - Request shapes (form-encoded vs JSON) live next to the URL, so the
 *    Content-Type / serialization mismatch on login (form) vs register (JSON)
 *    is impossible to forget.
 *  - Response types are co-located. Today these are hand-rolled; tomorrow
 *    openapi-typescript codegen (PR4 — FE-3-001) will replace the hand
 *    types with `paths['/auth/v1/login']['post']['responses']['200']` etc.
 *
 * `axiosClient` carries the request interceptor that attaches
 * `Authorization: Bearer <access_token>` and the response interceptor that
 * refreshes on 401. The wrappers below do not need to think about either.
 *
 * `logout()` and `me()` use the default JSON Content-Type. `login()` MUST
 * use `application/x-www-form-urlencoded` per OAuth2 password flow (the
 * backend's `OAuth2PasswordRequestForm` depends on it). `register()` is
 * JSON because the backend accepts a `UserCreateRequest` JSON body.
 */

/**
 * The authenticated user (backend `AuthUserResponse`). Hand-rolled until PR4
 * codegen lands. `birthdate` is null for users created through Google SSO.
 */
export interface MeResponse {
  id: string;
  email: string;
  name: string;
  lastname: string;
  birthdate: string | null;
}

/**
 * Wire shape of `GET /auth/v1/me` and `POST /auth/v1/register`: the backend
 * wraps the user in a `user` envelope. The wrappers unwrap it so callers get
 * a plain `MeResponse`.
 */
interface UserEnvelope {
  user: MeResponse;
}

/** Shape of `POST /auth/v1/login` response. */
export interface LoginResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

/**
 * `POST /auth/v1/login` (form-encoded).
 *
 * The backend expects `username` and `password` per OAuth2 password flow,
 * not `email` and `password`. We map our Zod-validated `email` into
 * `username` so the wire contract is satisfied without leaking the OAuth2
 * parameter name into the form UI.
 */
export async function login(values: LoginValues): Promise<LoginResponse> {
  const body = new URLSearchParams();
  body.set('username', values.email);
  body.set('password', values.password);
  const { data } = await axiosClient.post<LoginResponse>('/auth/v1/login', body, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  return data;
}

/**
 * `POST /auth/v1/register` (JSON).
 *
 * Returns the created user (no tokens). The caller is expected to
 * immediately call `login(values)` to bootstrap the session — see
 * `AuthProvider.register()` (FE-2-005 in PR3b).
 */
export async function register(values: RegisterValues): Promise<MeResponse> {
  const { data } = await axiosClient.post<UserEnvelope>('/auth/v1/register', {
    name: values.name,
    lastname: values.lastname,
    email: values.email,
    password: values.password,
    birthdate: values.birthdate,
  });
  return data.user;
}

/**
 * `POST /auth/v1/logout`.
 *
 * `withCredentials` MUST stay true here even though `axiosClient` already
 * has it as a default — being explicit on the wrapper protects against a
 * future refactor that touches the client's defaults. The refresh cookie
 * is what makes this call revoke the server-side session.
 *
 * Fire-and-forget: callers should not block logout on the network round
 * trip. The local cleanup (cancel scheduler, clear store, navigate) runs
 * regardless of the response.
 */
export async function logout(): Promise<void> {
  await axiosClient.post('/auth/v1/logout', undefined, { withCredentials: true });
}

/**
 * `GET /auth/v1/me` — session probe called by `AuthProvider` on mount.
 *
 * The 401 interceptor handles refresh transparently. If the user truly has
 * no session, the call returns 401 and the interceptor emits
 * `authEvents.emit('unauthorized')` so the provider can clear state.
 */
export async function me(): Promise<MeResponse> {
  const { data } = await axiosClient.get<UserEnvelope>('/auth/v1/me');
  return data.user;
}
