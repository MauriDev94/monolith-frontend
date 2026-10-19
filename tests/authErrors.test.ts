import { describe, expect, it } from 'vitest';
import { AxiosError } from 'axios';
import { authErrorMessage } from '@/auth/authErrors';

/**
 * Tests for `authErrorMessage`: every failure maps to Spanish copy and the
 * raw axios message never leaks into the UI.
 */
function httpError(status: number): AxiosError {
  return new AxiosError(
    `Request failed with status code ${status}`,
    'ERR_BAD_RESPONSE',
    undefined,
    undefined,
    { status } as never,
  );
}

const networkError = () => new AxiosError('Network Error', 'ERR_NETWORK');

describe('authErrorMessage', () => {
  it('returns null for a login 401 (AuthProvider already toasts it)', () => {
    expect(authErrorMessage(httpError(401), 'login')).toBeNull();
  });

  it('explains a duplicate email on register 409', () => {
    expect(authErrorMessage(httpError(409), 'register')).toMatch(/ya existe una cuenta/i);
  });

  it.each([
    [400, /revisa los datos/i],
    [429, /demasiados intentos/i],
    [500, /el servidor tuvo un problema/i],
    [503, /el servidor tuvo un problema/i],
  ])('maps HTTP %i to Spanish copy', (status, expected) => {
    expect(authErrorMessage(httpError(status), 'login')).toMatch(expected);
    expect(authErrorMessage(httpError(status), 'register')).toMatch(expected);
  });

  it('reports a connection problem when there is no response', () => {
    expect(authErrorMessage(networkError(), 'login')).toMatch(/no se pudo conectar/i);
  });

  it('falls back per action for unknown errors', () => {
    expect(authErrorMessage(new Error('boom'), 'login')).toMatch(/no se pudo iniciar sesión/i);
    expect(authErrorMessage('boom', 'register')).toMatch(/no se pudo crear la cuenta/i);
    expect(authErrorMessage(httpError(418), 'register')).toMatch(/no se pudo crear la cuenta/i);
  });

  it('never returns the raw axios message', () => {
    for (const status of [400, 401, 403, 404, 409, 429, 500]) {
      for (const action of ['login', 'register'] as const) {
        expect(authErrorMessage(httpError(status), action) ?? '').not.toMatch(/request failed/i);
      }
    }
  });
});
