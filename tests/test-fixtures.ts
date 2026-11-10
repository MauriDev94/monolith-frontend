import type { components } from '@/api/schema';

/**
 * Test-only password fixtures. NEVER real secrets. GitGuardian-safe.
 *
 * The `PLACEHOLDER_TEST_*` prefix marks these as obviously-fake placeholders
 * so secret scanners don't flag them. The fixtures satisfy the schema
 * complexity rules where needed so they exercise the production code paths:
 *
 *   - loginSchema: `min(8)`.
 *   - registerSchema: `min(8)` AND `[a-zA-Z]` AND `[0-9]`.
 *
 * Use these constants instead of inline literals in any test that needs a
 * password value. Do NOT introduce new inline password strings anywhere
 * in the test suite.
 */

export const TEST_PASSWORD_LOGIN_OK = 'PLACEHOLDER_TEST_LOGIN_OK'; // 25 chars, satisfies loginSchema (min 8)

export const TEST_PASSWORD_REGISTER_OK = 'PLACEHOLDER_TEST_REGISTER_OK_1'; // 34 chars, has [a-zA-Z] and [0-9], satisfies registerSchema

export const TEST_PASSWORD_SHORT = 'X'; // 1 char, fails loginSchema (min 8)

export const TEST_PASSWORD_NO_LETTER = '_________1'; // 10 chars, no [a-zA-Z] (underscore is not a letter), has [0-9]; fails registerSchema on the letter rule

export const TEST_PASSWORD_NO_DIGIT = 'PLACEHOLDER_TEST_NODIGITS'; // 25 chars, no [0-9], has [a-zA-Z]; fails registerSchema on the digit rule

/**
 * API response fixtures typed with the generated schema, so `pnpm typecheck`
 * fails when a fixture drifts from the backend contract (locked decision #2).
 */
type Schemas = components['schemas'];

export function userFixture(overrides: Partial<Schemas['AuthUserResponse']> = {}) {
  return {
    id: 'u-1',
    email: 'jane@example.com',
    name: 'Jane',
    lastname: 'Doe',
    birthdate: '1990-05-12',
    created_at: '2026-10-19T03:00:00Z',
    updated_at: '2026-10-19T03:00:00Z',
    ...overrides,
  } satisfies Schemas['AuthUserResponse'];
}

/** Login token response. Only the access token: the refresh token travels in the cookie. */
export function tokenPairFixture(access: string) {
  return {
    access_token: access,
    token_type: 'bearer',
  } satisfies Schemas['TokenPairResponse'];
}

/** Body of `POST /auth/v1/refresh`. */
export function refreshBody(access: string) {
  return { tokens: tokenPairFixture(access) } satisfies Schemas['RefreshTokenResponse'];
}
