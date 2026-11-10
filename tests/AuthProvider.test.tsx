import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { AxiosError } from 'axios';

/**
 * Mock the runtime seam that AuthProvider crosses into the outside world:
 *
 *   - `authApi` — the network wrappers. We don't want real axios traffic
 *     in tests; we assert on call args instead.
 *   - `refreshClient` — used by the scheduler's `onRefresh` callback.
 *     Stubbing it keeps the proactive refresh path from firing during
 *     tests.
 *   - `tokenRefreshScheduler` — replaced with a spy. Lets us assert on
 *     `schedule` / `cancel` calls without driving real timers.
 *   - `sonner` — the toast library. We replace `toast.error` with a spy
 *     so we can assert on it without producing real DOM toasts.
 *   - `authEvents` — replaced with a spy that captures listeners so we
 *     can fire `'unauthorized'` deterministically from the test.
 *   - `react-router-dom` — `useNavigate` replaced with a spy so we can
 *     assert on navigation calls. The rest of `react-router-dom` (the
 *     real exports) is preserved via `importActual` for any incidental
 *     usage by AuthProvider's children (none in these tests).
 *
 * We do NOT mock:
 *   - `@/api/tokenStore` — module-level closure; we reset it explicitly
 *     between tests via `tokenStore.clear()`.
 */
const apiLoginMock = vi.fn();
const apiRegisterMock = vi.fn();
const apiLogoutMock = vi.fn();
const apiMeMock = vi.fn();
const refreshPostMock = vi.fn();
const navigateMock = vi.fn();
const scheduleMock = vi.fn();
const cancelMock = vi.fn();
const toastErrorMock = vi.fn();
const authListeners = new Map<string, Set<(payload?: unknown) => void>>();

vi.mock('@/api/authApi', () => ({
  login: (...args: unknown[]) => apiLoginMock(...args),
  register: (...args: unknown[]) => apiRegisterMock(...args),
  logout: (...args: unknown[]) => apiLogoutMock(...args),
  me: (...args: unknown[]) => apiMeMock(...args),
}));

vi.mock('@/api/refreshClient', () => ({
  refreshClient: {
    post: (...args: unknown[]) => refreshPostMock(...args),
  },
}));

vi.mock('@/auth/tokenRefreshScheduler', () => ({
  createRefreshScheduler: () => ({
    schedule: (...args: unknown[]) => scheduleMock(...args),
    cancel: (...args: unknown[]) => cancelMock(...args),
  }),
}));

vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => toastErrorMock(...args),
    success: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock('@/auth/authEvents', () => ({
  authEvents: {
    on: (event: string, cb: (payload?: unknown) => void) => {
      if (!authListeners.has(event)) authListeners.set(event, new Set());
      authListeners.get(event)?.add(cb);
      return () => {
        authListeners.get(event)?.delete(cb);
      };
    },
    emit: (event: string, payload?: unknown) => {
      for (const cb of [...(authListeners.get(event) ?? [])]) {
        try {
          cb(payload);
        } catch {
          // swallow — mirrors real authEvents behavior
        }
      }
    },
  },
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

// Imports MUST come after the mocks above so the mocked modules are wired
// into the modules-under-test.
import { AuthProvider } from '@/auth/AuthProvider';
import { useAuth } from '@/auth/useAuth';
import { authEvents } from '@/auth/authEvents';
import { tokenStore } from '@/api/tokenStore';
import { axiosClient } from '@/api/axiosClient';
import MockAdapter from 'axios-mock-adapter';
import type { MeResponse } from '@/api/authApi';
import type { AuthContextValue } from '@/auth/AuthContext';
import {
  TEST_PASSWORD_LOGIN_OK,
  TEST_PASSWORD_REGISTER_OK,
  refreshBody,
  tokenPairFixture,
  userFixture,
} from './test-fixtures';

const USER: MeResponse = userFixture();

/**
 * Test probe — captures the latest `useAuth()` value via a callback so
 * tests can inspect state without rendering visible DOM.
 */
function CaptureAuth({ onValue }: { onValue: (v: AuthContextValue) => void }) {
  const value = useAuth();
  // Capture on every render so we observe status transitions.
  onValue(value);
  return null;
}

function getCaptured(capturedRef: { current: AuthContextValue | null }): AuthContextValue {
  if (capturedRef.current === null) {
    throw new Error('AuthProvider did not render a value');
  }
  return capturedRef.current;
}

beforeEach(() => {
  vi.clearAllMocks();
  authListeners.clear();
  tokenStore.clear();
  // Most tests do not care about refreshClient; the default is to reject
  // so any leak would throw loudly.
  refreshPostMock.mockRejectedValue(new Error('refresh not configured'));
  apiLogoutMock.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  tokenStore.clear();
  authListeners.clear();
});

describe('AuthProvider — mount /me probe', () => {
  it('starts with status="loading" before /me resolves', () => {
    // Never-resolving me() to keep status at 'loading'.
    apiMeMock.mockReturnValue(new Promise(() => {}));

    const captured = { current: null as AuthContextValue | null };
    render(
      <AuthProvider>
        <CaptureAuth onValue={(v) => (captured.current = v)} />
      </AuthProvider>,
    );

    expect(getCaptured(captured).status).toBe('loading');
    expect(getCaptured(captured).user).toBeNull();
  });

  it('transitions to "authenticated" with the user when /me succeeds', async () => {
    apiMeMock.mockResolvedValue(USER);
    tokenStore.set('access-from-cookie');

    const captured = { current: null as AuthContextValue | null };
    render(
      <AuthProvider>
        <CaptureAuth onValue={(v) => (captured.current = v)} />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(getCaptured(captured).status).toBe('authenticated');
    });
    expect(getCaptured(captured).user).toEqual(USER);
    expect(scheduleMock).toHaveBeenCalledTimes(1);
    expect(scheduleMock).toHaveBeenCalledWith('access-from-cookie', expect.any(Function));
  });

  it('transitions to "unauthenticated" when /me fails', async () => {
    apiMeMock.mockRejectedValue(
      new AxiosError('Request failed', '401', undefined, undefined, {
        status: 401,
        data: {},
      } as never),
    );

    const captured = { current: null as AuthContextValue | null };
    render(
      <AuthProvider>
        <CaptureAuth onValue={(v) => (captured.current = v)} />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(getCaptured(captured).status).toBe('unauthenticated');
    });
    expect(getCaptured(captured).user).toBeNull();
    expect(scheduleMock).not.toHaveBeenCalled();
  });
});

describe('AuthProvider — login()', () => {
  it('on success: stores token, fetches /me, schedules refresh, navigates', async () => {
    // First /me (mount probe) and second /me (post-login) both return USER.
    apiMeMock.mockResolvedValue(USER);
    apiLoginMock.mockResolvedValue(tokenPairFixture('fresh-access'));

    const captured = { current: null as AuthContextValue | null };
    render(
      <AuthProvider>
        <CaptureAuth onValue={(v) => (captured.current = v)} />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(getCaptured(captured).status).toBe('authenticated');
    });
    scheduleMock.mockClear();
    navigateMock.mockClear();

    await act(async () => {
      await getCaptured(captured).login({
        email: 'jane@example.com',
        password: TEST_PASSWORD_LOGIN_OK,
      });
    });

    expect(apiLoginMock).toHaveBeenCalledTimes(1);
    expect(apiLoginMock).toHaveBeenCalledWith({
      email: 'jane@example.com',
      password: TEST_PASSWORD_LOGIN_OK,
    });
    expect(tokenStore.get()).toBe('fresh-access');
    expect(getCaptured(captured).user).toEqual(USER);
    expect(scheduleMock).toHaveBeenCalledWith('fresh-access', expect.any(Function));
    expect(navigateMock).toHaveBeenCalledWith('/todos', { replace: true });
  });

  it('honors `from` over the default /todos on navigation', async () => {
    // Mount probe: no session. Post-login /me: USER.
    apiMeMock.mockImplementationOnce(() => Promise.reject(new Error('no session')));
    apiMeMock.mockResolvedValue(USER);
    apiLoginMock.mockResolvedValue(tokenPairFixture('fresh-access'));

    const captured = { current: null as AuthContextValue | null };
    render(
      <AuthProvider>
        <CaptureAuth onValue={(v) => (captured.current = v)} />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(getCaptured(captured).status).toBe('unauthenticated');
    });
    navigateMock.mockClear();

    await act(async () => {
      await getCaptured(captured).login(
        { email: 'a@b.com', password: TEST_PASSWORD_LOGIN_OK },
        '/profile',
      );
    });

    expect(navigateMock).toHaveBeenCalledWith('/profile', { replace: true });
  });

  it('on 401: shows the localized toast and re-throws', async () => {
    apiMeMock.mockImplementationOnce(() => Promise.reject(new Error('no session')));
    apiMeMock.mockResolvedValue(USER);
    apiLoginMock.mockRejectedValue(
      new AxiosError('Unauthorized', '401', undefined, undefined, {
        status: 401,
        data: {},
      } as never),
    );

    const captured = { current: null as AuthContextValue | null };
    render(
      <AuthProvider>
        <CaptureAuth onValue={(v) => (captured.current = v)} />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(getCaptured(captured).status).toBe('unauthenticated');
    });
    toastErrorMock.mockClear();

    await act(async () => {
      await expect(
        getCaptured(captured).login({
          email: 'a@b.com',
          password: TEST_PASSWORD_LOGIN_OK,
        }),
      ).rejects.toBeInstanceOf(AxiosError);
    });

    expect(toastErrorMock).toHaveBeenCalledWith('Email o contraseña incorrectos');
    expect(tokenStore.get()).toBeNull();
  });

  it('does NOT show the wrong-credentials toast on non-401 errors', async () => {
    apiMeMock.mockImplementationOnce(() => Promise.reject(new Error('no session')));
    apiMeMock.mockResolvedValue(USER);
    apiLoginMock.mockRejectedValue(
      new AxiosError('Server', '500', undefined, undefined, {
        status: 500,
        data: {},
      } as never),
    );

    const captured = { current: null as AuthContextValue | null };
    render(
      <AuthProvider>
        <CaptureAuth onValue={(v) => (captured.current = v)} />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(getCaptured(captured).status).toBe('unauthenticated');
    });
    toastErrorMock.mockClear();

    await act(async () => {
      await expect(
        getCaptured(captured).login({
          email: 'a@b.com',
          password: TEST_PASSWORD_LOGIN_OK,
        }),
      ).rejects.toBeInstanceOf(AxiosError);
    });

    expect(toastErrorMock).not.toHaveBeenCalled();
  });
});

describe('AuthProvider — register()', () => {
  it('on success: calls /register then immediately logs the user in', async () => {
    apiMeMock.mockImplementationOnce(() => Promise.reject(new Error('no session')));
    apiMeMock.mockResolvedValue(USER);
    apiRegisterMock.mockResolvedValue(userFixture({ id: 'u-new', email: 'new@example.com' }));
    apiLoginMock.mockResolvedValue(tokenPairFixture('new-access'));

    const captured = { current: null as AuthContextValue | null };
    render(
      <AuthProvider>
        <CaptureAuth onValue={(v) => (captured.current = v)} />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(getCaptured(captured).status).toBe('unauthenticated');
    });
    navigateMock.mockClear();
    scheduleMock.mockClear();

    await act(async () => {
      await getCaptured(captured).register({
        name: 'Jane',
        lastname: 'Doe',
        email: 'new@example.com',
        password: TEST_PASSWORD_REGISTER_OK,
        birthdate: '1990-05-12',
      });
    });

    expect(apiRegisterMock).toHaveBeenCalledTimes(1);
    expect(apiLoginMock).toHaveBeenCalledTimes(1);
    expect(apiLoginMock).toHaveBeenCalledWith({
      name: 'Jane',
      lastname: 'Doe',
      email: 'new@example.com',
      password: TEST_PASSWORD_REGISTER_OK,
      birthdate: '1990-05-12',
    });
    expect(tokenStore.get()).toBe('new-access');
    expect(navigateMock).toHaveBeenCalledWith('/todos', { replace: true });
    expect(scheduleMock).toHaveBeenCalledWith('new-access', expect.any(Function));
  });
});

describe('AuthProvider — logout()', () => {
  it('cancels the scheduler, clears the token store, resets state, navigates to /login', async () => {
    apiMeMock.mockResolvedValue(USER);
    tokenStore.set('current-access');

    const captured = { current: null as AuthContextValue | null };
    render(
      <AuthProvider>
        <CaptureAuth onValue={(v) => (captured.current = v)} />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(getCaptured(captured).status).toBe('authenticated');
    });
    scheduleMock.mockClear();
    cancelMock.mockClear();
    navigateMock.mockClear();

    await act(async () => {
      await getCaptured(captured).logout();
    });

    expect(apiLogoutMock).toHaveBeenCalledTimes(1);
    expect(cancelMock).toHaveBeenCalled();
    expect(tokenStore.get()).toBeNull();
    expect(getCaptured(captured).user).toBeNull();
    expect(getCaptured(captured).status).toBe('unauthenticated');
    expect(navigateMock).toHaveBeenCalledWith('/login', { replace: true });
  });

  it('drops cached queries so the next user never sees the previous data', async () => {
    const { queryClient } = await import('@/api/queryClient');
    queryClient.setQueryData(['todos'], { pages: [{ todos: [{ id: 't-1' }] }] });
    apiMeMock.mockResolvedValue(USER);
    tokenStore.set('current-access');

    const captured = { current: null as AuthContextValue | null };
    render(
      <AuthProvider>
        <CaptureAuth onValue={(v) => (captured.current = v)} />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(getCaptured(captured).status).toBe('authenticated');
    });

    await act(async () => {
      await getCaptured(captured).logout();
    });

    expect(queryClient.getQueryData(['todos'])).toBeUndefined();
  });

  it('cleans up locally even when /logout fails on the server', async () => {
    apiMeMock.mockResolvedValue(USER);
    tokenStore.set('current-access');
    apiLogoutMock.mockRejectedValue(new Error('network down'));

    const captured = { current: null as AuthContextValue | null };
    render(
      <AuthProvider>
        <CaptureAuth onValue={(v) => (captured.current = v)} />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(getCaptured(captured).status).toBe('authenticated');
    });
    cancelMock.mockClear();
    navigateMock.mockClear();

    await act(async () => {
      await getCaptured(captured).logout();
    });

    expect(cancelMock).toHaveBeenCalled();
    expect(tokenStore.get()).toBeNull();
    expect(getCaptured(captured).status).toBe('unauthenticated');
    expect(navigateMock).toHaveBeenCalledWith('/login', { replace: true });
  });
});

describe('AuthProvider — authEvents unauthorized listener', () => {
  it('cleans up and navigates to /login when "unauthorized" fires', async () => {
    apiMeMock.mockResolvedValue(USER);
    tokenStore.set('current-access');

    const captured = { current: null as AuthContextValue | null };
    render(
      <AuthProvider>
        <CaptureAuth onValue={(v) => (captured.current = v)} />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(getCaptured(captured).status).toBe('authenticated');
    });
    cancelMock.mockClear();
    navigateMock.mockClear();

    // The 401 interceptor fires `'unauthorized'` when refresh fails.
    // `cleanup()` calls `setUser`/`setStatus`; wrap in `act` so React
    // flushes the state update before we assert.
    act(() => {
      authEvents.emit('unauthorized');
    });

    expect(cancelMock).toHaveBeenCalled();
    expect(tokenStore.get()).toBeNull();
    expect(getCaptured(captured).user).toBeNull();
    expect(getCaptured(captured).status).toBe('unauthenticated');
    expect(navigateMock).toHaveBeenCalledWith('/login', { replace: true });
  });

  it('does not navigate when "unauthorized" fires for an anonymous visitor', async () => {
    // Anonymous boot: /me 401s, the interceptor's refresh fails and emits.
    // A public page must stay where it is.
    apiMeMock.mockRejectedValue(new AxiosError('Unauthorized'));

    const captured = { current: null as AuthContextValue | null };
    render(
      <AuthProvider>
        <CaptureAuth onValue={(v) => (captured.current = v)} />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(getCaptured(captured).status).toBe('unauthenticated');
    });
    navigateMock.mockClear();

    act(() => {
      authEvents.emit('unauthorized');
    });

    expect(getCaptured(captured).status).toBe('unauthenticated');
    expect(navigateMock).not.toHaveBeenCalled();
  });
});

/**
 * Fake access token built at runtime: base64url header + payload and a
 * dummy signature. Only `sub` and `exp` matter to the code under test.
 */
function makeJwt(sub: string): string {
  const b64 = (obj: object) =>
    btoa(JSON.stringify(obj)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const exp = Math.floor(Date.now() / 1000) + 900;
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub, exp })}.sig`;
}

function refreshReply(access: string) {
  return { data: refreshBody(access) };
}

function httpError(status: number): AxiosError {
  return new AxiosError('failed', String(status), undefined, undefined, {
    status,
    data: {},
  } as never);
}

/** Render the provider in an authenticated state and return the scheduled callback. */
async function renderAuthenticated() {
  apiMeMock.mockResolvedValue(USER);
  tokenStore.set(makeJwt(USER.id));
  const captured = { current: null as AuthContextValue | null };
  render(
    <AuthProvider>
      <CaptureAuth onValue={(v) => (captured.current = v)} />
    </AuthProvider>,
  );
  await waitFor(() => {
    expect(getCaptured(captured).status).toBe('authenticated');
  });
  const onRefresh = scheduleMock.mock.calls[0][1] as () => Promise<void>;
  scheduleMock.mockClear();
  cancelMock.mockClear();
  navigateMock.mockClear();
  return { captured, onRefresh };
}

describe('AuthProvider — single refresh path', () => {
  it('sends one /refresh when the proactive timer and a 401 overlap', async () => {
    const { onRefresh } = await renderAuthenticated();
    refreshPostMock.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 20));
      return refreshReply(makeJwt(USER.id));
    });
    const http = new MockAdapter(axiosClient);
    http.onGet('/todos').replyOnce(401).onGet('/todos').reply(200, { ok: 1 });

    await act(async () => {
      await Promise.all([onRefresh(), axiosClient.get('/todos')]);
    });

    expect(refreshPostMock).toHaveBeenCalledTimes(1);
    http.restore();
  });

  it('reschedules the timer after a reactive (interceptor) refresh', async () => {
    await renderAuthenticated();
    const fresh = makeJwt(USER.id);
    refreshPostMock.mockResolvedValue(refreshReply(fresh));
    const http = new MockAdapter(axiosClient);
    http.onGet('/todos').replyOnce(401).onGet('/todos').reply(200, { ok: 1 });

    await act(async () => {
      await axiosClient.get('/todos');
    });

    expect(scheduleMock).toHaveBeenCalledWith(fresh, expect.any(Function), 30_000);
    http.restore();
  });
});

describe('AuthProvider — identity switch after a refresh', () => {
  it('tears the session down when the refreshed token belongs to another user', async () => {
    const { captured, onRefresh } = await renderAuthenticated();
    refreshPostMock.mockResolvedValue(refreshReply(makeJwt('u-other')));

    await act(async () => {
      await onRefresh();
    });

    expect(tokenStore.get()).toBeNull();
    expect(cancelMock).toHaveBeenCalled();
    expect(getCaptured(captured).user).toBeNull();
    expect(getCaptured(captured).status).toBe('unauthenticated');
    expect(navigateMock).toHaveBeenCalledWith('/login', { replace: true });
    expect(toastErrorMock).toHaveBeenCalledWith('Tu sesión cambió. Vuelve a ingresar.');
    expect(scheduleMock).not.toHaveBeenCalled();
  });

  it('keeps the session when the refreshed token is for the same user', async () => {
    const { captured, onRefresh } = await renderAuthenticated();
    const fresh = makeJwt(USER.id);
    refreshPostMock.mockResolvedValue(refreshReply(fresh));

    await act(async () => {
      await onRefresh();
    });

    expect(getCaptured(captured).status).toBe('authenticated');
    expect(navigateMock).not.toHaveBeenCalled();
    expect(toastErrorMock).not.toHaveBeenCalled();
    expect(scheduleMock).toHaveBeenCalledWith(fresh, expect.any(Function), 30_000);
  });

  it('does not compare identities when there is no current user (bootstrap probe)', async () => {
    // The mount /me 401s, the interceptor refreshes, and only then does the
    // user load: a refreshed token with no user yet is not a switch.
    apiMeMock.mockReturnValue(new Promise(() => {}));
    render(
      <AuthProvider>
        <CaptureAuth onValue={() => undefined} />
      </AuthProvider>,
    );

    act(() => {
      authEvents.emit('refreshed', makeJwt('u-other'));
    });

    expect(navigateMock).not.toHaveBeenCalled();
    expect(toastErrorMock).not.toHaveBeenCalled();
  });
});

describe('AuthProvider — identity switch must not leak the retry', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not retry the original request with the other user token', async () => {
    // The cookie was swapped: A's write 401s, the refresh returns B's token.
    // Retrying would write A's data into B's account.
    const { captured } = await renderAuthenticated();
    refreshPostMock.mockResolvedValue(refreshReply(makeJwt('u-other')));
    const http = new MockAdapter(axiosClient);
    http.onPost('/v1/todos').replyOnce(401).onPost('/v1/todos').reply(201, { todo: {} });

    await act(async () => {
      await expect(axiosClient.post('/v1/todos', { title: 'x' })).rejects.toMatchObject({
        response: { status: 401 },
      });
    });

    expect(http.history.post).toHaveLength(1);
    expect(tokenStore.get()).toBeNull();
    expect(getCaptured(captured).status).toBe('unauthenticated');
    expect(navigateMock).toHaveBeenCalledTimes(1);
    http.restore();
  });

  it('does not arm the retry timer after a proactive refresh tore the session down', async () => {
    const { onRefresh } = await renderAuthenticated();
    vi.useFakeTimers();
    refreshPostMock.mockResolvedValue(refreshReply(makeJwt('u-other')));

    await act(async () => {
      await onRefresh();
      await vi.advanceTimersByTimeAsync(60_000);
    });

    expect(refreshPostMock).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('AuthProvider — refresh bookkeeping', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('cancels a pending proactive retry when another refresh succeeds', async () => {
    const { onRefresh } = await renderAuthenticated();
    vi.useFakeTimers();
    refreshPostMock.mockRejectedValue(new AxiosError('Network Error'));
    await act(async () => {
      await onRefresh();
    });

    act(() => {
      authEvents.emit('refreshed', makeJwt(USER.id));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });

    expect(refreshPostMock).toHaveBeenCalledTimes(1);
  });

  it('navigates once when "unauthorized" is emitted twice in the same tick', async () => {
    await renderAuthenticated();

    act(() => {
      authEvents.emit('unauthorized');
      authEvents.emit('unauthorized');
    });

    expect(navigateMock).toHaveBeenCalledTimes(1);
  });

  it('does not rearm the timer for a refresh that lands right after a teardown', async () => {
    await renderAuthenticated();

    act(() => {
      authEvents.emit('unauthorized');
      authEvents.emit('refreshed', makeJwt(USER.id));
    });

    expect(scheduleMock).not.toHaveBeenCalled();
  });
});

describe('AuthProvider — proactive refresh failures', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps the session and retries once after a delay on a non-auth failure', async () => {
    const { captured, onRefresh } = await renderAuthenticated();
    vi.useFakeTimers();
    const fresh = makeJwt(USER.id);
    refreshPostMock
      .mockRejectedValueOnce(httpError(502))
      .mockResolvedValueOnce(refreshReply(fresh));

    await act(async () => {
      await onRefresh();
    });
    expect(getCaptured(captured).status).toBe('authenticated');
    expect(refreshPostMock).toHaveBeenCalledTimes(1);
    expect(scheduleMock).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });

    expect(refreshPostMock).toHaveBeenCalledTimes(2);
    expect(scheduleMock).toHaveBeenCalledWith(fresh, expect.any(Function), 30_000);
    expect(getCaptured(captured).status).toBe('authenticated');
  });

  it('retries only once, and a network error never ends the session', async () => {
    const { captured, onRefresh } = await renderAuthenticated();
    vi.useFakeTimers();
    refreshPostMock.mockRejectedValue(new AxiosError('Network Error'));

    await act(async () => {
      await onRefresh();
      await vi.advanceTimersByTimeAsync(60_000);
    });

    expect(refreshPostMock).toHaveBeenCalledTimes(2);
    expect(getCaptured(captured).status).toBe('authenticated');
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it.each([401, 403])('logs out immediately when the refresh fails with %i', async (code) => {
    const { captured, onRefresh } = await renderAuthenticated();
    refreshPostMock.mockRejectedValue(httpError(code));

    await act(async () => {
      await onRefresh();
    });

    expect(getCaptured(captured).status).toBe('unauthenticated');
    expect(navigateMock).toHaveBeenCalledWith('/login', { replace: true });
    expect(refreshPostMock).toHaveBeenCalledTimes(1);
  });

  it('cancels a pending retry when the session is torn down', async () => {
    const { onRefresh, captured } = await renderAuthenticated();
    vi.useFakeTimers();
    refreshPostMock.mockRejectedValue(new AxiosError('Network Error'));

    await act(async () => {
      await onRefresh();
    });
    await act(async () => {
      await getCaptured(captured).logout();
      await vi.advanceTimersByTimeAsync(60_000);
    });

    expect(refreshPostMock).toHaveBeenCalledTimes(1);
  });
});

describe('useAuth', () => {
  it('throws when called outside an AuthProvider', () => {
    // Suppress React's error-boundary noise from the expected throw.
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    function Naked() {
      useAuth();
      return null;
    }

    expect(() => render(<Naked />)).toThrow('useAuth must be used within <AuthProvider>');

    consoleError.mockRestore();
  });
});
