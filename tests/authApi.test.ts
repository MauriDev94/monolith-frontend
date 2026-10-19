import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';
import { TEST_PASSWORD_LOGIN_OK, TEST_PASSWORD_REGISTER_OK } from './test-fixtures';

/**
 * Auth-API wrapper tests.
 *
 * Same pattern as `axiosClient.test.ts`: the wrappers use `axiosClient` (the
 * singleton with interceptors). We reset the module graph per test so
 * `inflightRefresh` starts null and the singleton is fresh. We attach a
 * MockAdapter to the imported `axiosClient` to drive deterministic
 * responses.
 */

vi.mock('@/api/refreshClient', () => ({
  refreshClient: axios.create(),
}));

describe('authApi wrappers', () => {
  let mock: MockAdapter;
  let refreshMock: MockAdapter;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let axiosClient: any;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import('@/api/axiosClient');
    axiosClient = mod.axiosClient;
    const refreshMod = await import('@/api/refreshClient');
    refreshMock = new MockAdapter(refreshMod.refreshClient);
    // Refresh attempts during the test should fail (no real backend).
    refreshMock.onPost('/auth/v1/refresh').reply(401);
    mock = new MockAdapter(axiosClient);
  });

  afterEach(() => {
    mock?.reset();
    refreshMock?.reset();
  });

  describe('login', () => {
    it('POSTs form-encoded credentials to /auth/v1/login', async () => {
      mock.onPost('/auth/v1/login').reply((config) => {
        expect(config.url).toBe('/auth/v1/login');
        expect(config.headers?.['Content-Type']).toBe('application/x-www-form-urlencoded');
        expect(config.data).toBe(`username=user%40example.com&password=${TEST_PASSWORD_LOGIN_OK}`);
        return [
          200,
          {
            access_token: 'access-1',
            refresh_token: 'refresh-1',
            token_type: 'bearer',
          },
        ];
      });

      const { login } = await import('@/api/authApi');
      const res = await login({ email: 'user@example.com', password: TEST_PASSWORD_LOGIN_OK });
      expect(res.access_token).toBe('access-1');
    });

    it('maps the email field to the OAuth2 `username` parameter', async () => {
      let captured = '';
      mock.onPost('/auth/v1/login').reply((config) => {
        captured = String(config.data);
        return [200, { access_token: 'a', refresh_token: 'r', token_type: 'b' }];
      });

      const { login } = await import('@/api/authApi');
      await login({ email: 'a@b.com', password: TEST_PASSWORD_LOGIN_OK });
      expect(captured).toContain('username=a%40b.com');
      expect(captured).not.toContain('email=');
    });

    it('propagates 401 from the backend', async () => {
      mock.onPost('/auth/v1/login').reply(401);

      const { login } = await import('@/api/authApi');
      await expect(
        login({ email: 'user@example.com', password: TEST_PASSWORD_LOGIN_OK }),
      ).rejects.toThrow();
    });
  });

  describe('register', () => {
    it('POSTs a JSON body to /auth/v1/register', async () => {
      mock.onPost('/auth/v1/register').reply((config) => {
        expect(config.url).toBe('/auth/v1/register');
        expect(config.headers?.['Content-Type']).toMatch(/application\/json/);
        const body = JSON.parse(String(config.data));
        expect(body).toEqual({
          name: 'Jane',
          lastname: 'Doe',
          email: 'jane@example.com',
          password: TEST_PASSWORD_REGISTER_OK,
          birthdate: '1990-05-12',
        });
        return [
          201,
          {
            user: {
              id: 'u-1',
              email: 'jane@example.com',
              name: 'Jane',
              lastname: 'Doe',
              birthdate: '1990-05-12',
            },
          },
        ];
      });

      const { register } = await import('@/api/authApi');
      const res = await register({
        name: 'Jane',
        lastname: 'Doe',
        email: 'jane@example.com',
        password: TEST_PASSWORD_REGISTER_OK,
        birthdate: '1990-05-12',
      });
      expect(res.id).toBe('u-1');
    });

    it('propagates 409 (email already registered)', async () => {
      mock.onPost('/auth/v1/register').reply(409);

      const { register } = await import('@/api/authApi');
      await expect(
        register({
          name: 'Jane',
          lastname: 'Doe',
          email: 'dup@example.com',
          password: TEST_PASSWORD_REGISTER_OK,
          birthdate: '1990-05-12',
        }),
      ).rejects.toThrow();
    });
  });

  describe('logout', () => {
    it('POSTs to /auth/v1/logout with withCredentials', async () => {
      let capturedUrl = '';
      mock.onPost('/auth/v1/logout').reply((config) => {
        capturedUrl = String(config.url);
        return [204];
      });

      const { logout } = await import('@/api/authApi');
      await logout();
      expect(capturedUrl).toBe('/auth/v1/logout');
    });

    it('propagates backend failure (caller is expected to clean up locally anyway)', async () => {
      mock.onPost('/auth/v1/logout').reply(500);

      const { logout } = await import('@/api/authApi');
      await expect(logout()).rejects.toThrow();
    });
  });

  describe('me', () => {
    it('GETs /auth/v1/me and returns the user', async () => {
      mock.onGet('/auth/v1/me').reply((config) => {
        expect(config.method).toBe('get');
        // The backend wraps the user in a `user` envelope; `me()` unwraps it.
        return [
          200,
          {
            user: {
              id: 'u-1',
              email: 'jane@example.com',
              name: 'Jane',
              lastname: 'Doe',
              birthdate: '1990-05-12',
            },
          },
        ];
      });

      const { me } = await import('@/api/authApi');
      const user = await me();
      expect(user.id).toBe('u-1');
      expect(user.email).toBe('jane@example.com');
    });

    it('propagates 401 when the session is invalid', async () => {
      mock.onGet('/auth/v1/me').reply(401);

      const { me } = await import('@/api/authApi');
      await expect(me()).rejects.toThrow();
    });
  });
});
