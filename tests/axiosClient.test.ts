import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';

/**
 * The interceptor is wired at module load (singleton). We use
 * `vi.resetModules()` + dynamic `await import()` so each test starts from a
 * clean module graph with a fresh `inflightRefresh` closure AND a fresh
 * `tokenStore` / `authEvents` / `refreshClient`. The test never imports those
 * names at module top — only inside `beforeEach` after the reset — so the
 * references line up with the imported `axiosClient` module.
 *
 * After reset:
 *
 *   - `axiosClient` — the interceptor singleton under test.
 *   - `refreshClient` — the bare axios instance it uses for `/refresh`.
 *   - `tokenStore` — module-level access token (singleton in the new graph).
 *   - `authEvents` — the event bus.
 *
 * `MockAdapter` is attached to `axiosClient` (main traffic) and to
 * `refreshClient` (refresh path) separately because `axios.create()` produces
 * distinct axios instances that do not share adapters.
 */

vi.mock('@/api/refreshClient', () => ({
  refreshClient: axios.create(),
}));

describe('axiosClient — single-flight 401 interceptor', () => {
  let mock: MockAdapter;
  let refreshMock: MockAdapter;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let axiosClient: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let tokenStore: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let authEvents: any;

  beforeEach(async () => {
    vi.resetModules();

    const clientMod = await import('@/api/axiosClient');
    axiosClient = clientMod.axiosClient;
    const refreshMod = await import('@/api/refreshClient');
    const eventsMod = await import('@/auth/authEvents');
    const tokenMod = await import('@/api/tokenStore');

    tokenStore = tokenMod.tokenStore;
    authEvents = eventsMod.authEvents;

    tokenStore.clear();

    refreshMock = new MockAdapter(refreshMod.refreshClient);
    mock = new MockAdapter(axiosClient);
  });

  afterEach(() => {
    mock?.reset();
    refreshMock?.reset();
  });

  it('attaches Authorization header when tokenStore has a token', async () => {
    tokenStore.set('access-1');
    mock.onGet('/me').reply((config) => {
      // axios normalizes headers to lowercase internally.
      expect(config.headers?.authorization ?? config.headers?.Authorization).toBe(
        'Bearer access-1',
      );
      return [200, { id: 'u-1' }];
    });

    const res = await axiosClient.get('/me');
    expect(res.status).toBe(200);
  });

  it('does not attach Authorization when tokenStore is empty', async () => {
    tokenStore.clear();
    mock.onGet('/me').reply((config) => {
      const auth = config.headers?.authorization ?? config.headers?.Authorization;
      expect(auth).toBeUndefined();
      return [200, { id: 'u-1' }];
    });

    await axiosClient.get('/me');
  });

  it('coalesces three concurrent 401s into a single /refresh call', async () => {
    tokenStore.set('old-access');

    let refreshCalls = 0;
    refreshMock.onPost('/auth/v1/refresh').reply(() => {
      refreshCalls += 1;
      return [200, { tokens: { access_token: 'new-access', refresh_token: 'new-refresh' } }];
    });

    mock.onGet('/a').replyOnce(401).onGet('/a').reply(200, { ok: 1 });
    mock.onGet('/b').replyOnce(401).onGet('/b').reply(200, { ok: 1 });
    mock.onGet('/c').replyOnce(401).onGet('/c').reply(200, { ok: 1 });

    const [a, b, c] = await Promise.all([
      axiosClient.get('/a'),
      axiosClient.get('/b'),
      axiosClient.get('/c'),
    ]);

    expect(refreshCalls).toBe(1);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(c.status).toBe(200);
    expect(tokenStore.get()).toBe('new-access');
  });

  it('emits unauthorized when refresh fails', async () => {
    tokenStore.set('old-access');

    const onUnauth = vi.fn();
    const off = authEvents.on('unauthorized', onUnauth);

    refreshMock.onPost('/auth/v1/refresh').reply(401);
    mock.onGet('/x').reply(401);

    await expect(axiosClient.get('/x')).rejects.toThrow();
    expect(onUnauth).toHaveBeenCalledTimes(1);

    off();
  });

  it('rejects all queued requests when the refresh call fails', async () => {
    tokenStore.set('old-access');

    refreshMock.onPost('/auth/v1/refresh').reply(500);
    mock.onGet('/a').replyOnce(401).onGet('/a').reply(200, { ok: 1 });
    mock.onGet('/b').replyOnce(401).onGet('/b').reply(200, { ok: 1 });
    mock.onGet('/c').replyOnce(401).onGet('/c').reply(200, { ok: 1 });

    const settled = await Promise.allSettled([
      axiosClient.get('/a'),
      axiosClient.get('/b'),
      axiosClient.get('/c'),
    ]);
    expect(settled.every((s) => s.status === 'rejected')).toBe(true);
  });

  it('posts the refresh without a body', async () => {
    // The refresh token travels in the HttpOnly cookie; the backend accepts a
    // bodyless POST since Api_monolith#128.
    tokenStore.set('old-access');

    let capturedBody: unknown;
    refreshMock.onPost('/auth/v1/refresh').reply((config) => {
      capturedBody = config.data;
      return [200, { tokens: { access_token: 'new-access', refresh_token: 'new-refresh' } }];
    });
    mock.onGet('/me').replyOnce(401).onGet('/me').reply(200, {});

    await axiosClient.get('/me');

    expect(capturedBody).toBeUndefined();
  });

  it('does not loop forever when the retry itself 401s', async () => {
    tokenStore.set('old-access');

    refreshMock.onPost('/auth/v1/refresh').reply(200, {
      tokens: { access_token: 'new-access', refresh_token: 'new-refresh' },
    });
    mock.onGet('/forever').reply(401);

    await expect(axiosClient.get('/forever')).rejects.toThrow();
  });

  it('re-arms inflightRefresh after a failed refresh so a later call can succeed', async () => {
    tokenStore.set('old-access');

    let refreshCalls = 0;
    refreshMock.onPost('/auth/v1/refresh').reply(() => {
      refreshCalls += 1;
      if (refreshCalls === 1) return [401];
      return [200, { tokens: { access_token: 'later-access', refresh_token: 'later-refresh' } }];
    });

    // First 401 — first GET /x (refresh fails, request rejected).
    mock.onGet('/x').replyOnce(401);
    // Second 401 — second GET /x triggers a fresh refresh.
    mock.onGet('/x').replyOnce(401);
    // Final 200 — retry of the second GET /x succeeds with the new token.
    mock.onGet('/x').reply(200, { ok: 1 });

    await expect(axiosClient.get('/x')).rejects.toThrow();
    const ok = await axiosClient.get('/x');
    expect(ok.status).toBe(200);
    expect(refreshCalls).toBe(2);
    expect(tokenStore.get()).toBe('later-access');
  });

  it('passes through non-401 errors without invoking refresh', async () => {
    tokenStore.set('access');

    let refreshCalls = 0;
    refreshMock.onPost('/auth/v1/refresh').reply(() => {
      refreshCalls += 1;
      return [200, { tokens: { access_token: 'x', refresh_token: 'y' } }];
    });
    mock.onGet('/server-error').reply(500);

    await expect(axiosClient.get('/server-error')).rejects.toThrow();
    expect(refreshCalls).toBe(0);
  });

  it('passes through network errors without invoking refresh', async () => {
    tokenStore.set('access');

    let refreshCalls = 0;
    refreshMock.onPost('/auth/v1/refresh').reply(() => {
      refreshCalls += 1;
      return [200, { tokens: { access_token: 'x', refresh_token: 'y' } }];
    });
    mock.onGet('/network').networkError();

    await expect(axiosClient.get('/network')).rejects.toThrow();
    expect(refreshCalls).toBe(0);
  });

  it.each(['/auth/v1/login', '/auth/v1/register'])(
    'does not refresh on a 401 from the credential endpoint %s',
    async (path) => {
      tokenStore.set('access');
      const onUnauth = vi.fn();
      const off = authEvents.on('unauthorized', onUnauth);

      let refreshCalls = 0;
      refreshMock.onPost('/auth/v1/refresh').reply(() => {
        refreshCalls += 1;
        return [200, { tokens: { access_token: 'x', refresh_token: 'y' } }];
      });
      mock.onPost(path).reply(401);

      await expect(axiosClient.post(path, {})).rejects.toMatchObject({
        response: { status: 401 },
      });
      expect(refreshCalls).toBe(0);
      expect(onUnauth).not.toHaveBeenCalled();

      off();
    },
  );

  it('rethrows the original 401 (not the refresh error) when the refresh fails', async () => {
    tokenStore.set('old-access');

    refreshMock.onPost('/auth/v1/refresh').reply(429);
    mock.onGet('/x').reply(401);

    await expect(axiosClient.get('/x')).rejects.toMatchObject({
      response: { status: 401 },
      config: { url: '/x' },
    });
  });

  it('does not end the session when the retried request fails after a successful refresh', async () => {
    tokenStore.set('old-access');
    const onUnauth = vi.fn();
    const off = authEvents.on('unauthorized', onUnauth);

    refreshMock.onPost('/auth/v1/refresh').reply(200, {
      tokens: { access_token: 'new-access', refresh_token: 'new-refresh' },
    });
    mock.onGet('/flaky').replyOnce(401).onGet('/flaky').reply(500);

    await expect(axiosClient.get('/flaky')).rejects.toMatchObject({
      response: { status: 500 },
    });
    expect(onUnauth).not.toHaveBeenCalled();
    expect(tokenStore.get()).toBe('new-access');

    off();
  });
});
