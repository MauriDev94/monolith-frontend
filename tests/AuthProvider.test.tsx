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

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const CREDENTIALS = { email: 'jane@example.com', password: TEST_PASSWORD_LOGIN_OK };

function renderAnonymousProbePending() {
  const probe = deferred<MeResponse>();
  apiMeMock.mockReturnValueOnce(probe.promise);
  const captured = { current: null as AuthContextValue | null };
  render(
    <AuthProvider>
      <CaptureAuth onValue={(v) => (captured.current = v)} />
    </AuthProvider>,
  );
  return { probe, captured };
}

describe('AuthProvider — a late bootstrap probe must not undo a login', () => {
  // On a cold Render instance the mount /me can take ~50 s, so the user may
  // log in while it is still in flight.
  it('ignores a probe failure (and its refresh 401) that lands after login', async () => {
    // Drive the probe through the real interceptor: /me 401s, the refresh is
    // held open, and only then does the user log in.
    const refresh = deferred<never>();
    refreshPostMock.mockReturnValue(refresh.promise);
    const http = new MockAdapter(axiosClient);
    http.onGet('/auth/v1/me').reply(401);
    let probeCall!: Promise<unknown>;
    apiMeMock.mockImplementationOnce(() => (probeCall = axiosClient.get('/auth/v1/me')));
    const captured = { current: null as AuthContextValue | null };
    render(
      <AuthProvider>
        <CaptureAuth onValue={(v) => (captured.current = v)} />
      </AuthProvider>,
    );
    await vi.waitFor(() => expect(refreshPostMock).toHaveBeenCalledTimes(1));
    apiLoginMock.mockResolvedValue(tokenPairFixture('fresh-access'));
    apiMeMock.mockResolvedValue(USER);

    await act(async () => {
      await getCaptured(captured).login(CREDENTIALS);
    });
    expect(getCaptured(captured).status).toBe('authenticated');
    navigateMock.mockClear();

    await act(async () => {
      refresh.reject(httpError(401));
      // The probe settling proves the rejection went through the interceptor.
      await probeCall.catch(() => undefined);
    });

    expect(getCaptured(captured).status).toBe('authenticated');
    expect(getCaptured(captured).user).toEqual(USER);
    expect(tokenStore.get()).toBe('fresh-access');
    expect(navigateMock).not.toHaveBeenCalled();
    http.restore();
  });

  it('ignores a stale probe success that lands after login', async () => {
    const { probe, captured } = renderAnonymousProbePending();
    apiLoginMock.mockResolvedValue(tokenPairFixture('fresh-access'));
    apiMeMock.mockResolvedValue(USER);

    await act(async () => {
      await getCaptured(captured).login(CREDENTIALS);
    });
    scheduleMock.mockClear();

    await act(async () => {
      probe.resolve(userFixture({ id: 'u-stale' }));
      await probe.promise;
    });

    expect(getCaptured(captured).user).toEqual(USER);
    expect(scheduleMock).not.toHaveBeenCalled();
  });
});

describe('AuthProvider — a refresh in flight when the session ends', () => {
  it('leaves the token store empty and does not retry the request after logout', async () => {
    const { captured } = await renderAuthenticated();
    const refresh = deferred<{ data: ReturnType<typeof refreshBody> }>();
    refreshPostMock.mockReturnValue(refresh.promise);
    const http = new MockAdapter(axiosClient);
    http.onGet('/todos').replyOnce(401).onGet('/todos').reply(200, { ok: 1 });

    let request!: Promise<unknown>;
    await act(async () => {
      request = axiosClient.get('/todos').catch((e: unknown) => e);
      await vi.waitFor(() => expect(refreshPostMock).toHaveBeenCalledTimes(1));
      await getCaptured(captured).logout();
    });
    scheduleMock.mockClear();

    await act(async () => {
      refresh.resolve(refreshReply(makeJwt(USER.id)));
      await request;
    });

    expect(tokenStore.get()).toBeNull();
    expect(http.history.get).toHaveLength(1);
    expect(await request).toMatchObject({ response: { status: 401 } });
    expect(scheduleMock).not.toHaveBeenCalled();
    http.restore();
  });

  it('does not end a newer session when the old refresh is rejected after a new login', async () => {
    const { captured } = await renderAuthenticated();
    const refresh = deferred<never>();
    refreshPostMock.mockReturnValue(refresh.promise);
    const http = new MockAdapter(axiosClient);
    http.onGet('/todos').reply(401);

    let request!: Promise<unknown>;
    await act(async () => {
      request = axiosClient.get('/todos').catch((e: unknown) => e);
      await vi.waitFor(() => expect(refreshPostMock).toHaveBeenCalledTimes(1));
      await getCaptured(captured).logout();
      apiLoginMock.mockResolvedValue(tokenPairFixture('second-access'));
      await getCaptured(captured).login(CREDENTIALS);
    });
    expect(getCaptured(captured).status).toBe('authenticated');
    navigateMock.mockClear();

    await act(async () => {
      refresh.reject(httpError(401));
      await request;
    });

    expect(getCaptured(captured).status).toBe('authenticated');
    expect(tokenStore.get()).toBe('second-access');
    expect(navigateMock).not.toHaveBeenCalled();
    http.restore();
  });
});

describe('AuthProvider — a request from an ended session never refreshes', () => {
  /** Mount with a probe that goes through the real interceptor and 401s on demand. */
  async function renderWithGatedProbe() {
    const gate = deferred<void>();
    const http = new MockAdapter(axiosClient);
    http.onGet('/auth/v1/me').reply(async () => {
      await gate.promise;
      return [401];
    });
    let probeCall!: Promise<unknown>;
    apiMeMock.mockImplementationOnce(() => (probeCall = axiosClient.get('/auth/v1/me')));
    const captured = { current: null as AuthContextValue | null };
    render(
      <AuthProvider>
        <CaptureAuth onValue={(v) => (captured.current = v)} />
      </AuthProvider>,
    );
    const probeSettled = () => probeCall.catch(() => undefined);
    // Let the probe leave (axios runs request interceptors in a microtask) so it
    // is tagged with the anonymous epoch before the login bumps it.
    await vi.waitFor(() => expect(http.history.get).toHaveLength(1));
    return { gate, http, captured, probeSettled };
  }

  // Cold start: the probe's 401 and its refresh 401 both land while the slow
  // login (Argon2) is still in flight. They belong to the anonymous visit and
  // must not abort the login.
  it('lets a login finish when the probe 401s and its refresh fails before /login answers', async () => {
    const { gate, http, captured, probeSettled } = await renderWithGatedProbe();
    refreshPostMock.mockRejectedValue(httpError(401));
    const loginCall = deferred<ReturnType<typeof tokenPairFixture>>();
    apiLoginMock.mockReturnValue(loginCall.promise);
    apiMeMock.mockResolvedValue(USER);

    let result!: Promise<void>;
    await act(async () => {
      result = getCaptured(captured).login(CREDENTIALS);
      gate.resolve();
      // The probe settling means its 401 went through the interceptor; a wrongly
      // started refresh would already have hit the client by now.
      await probeSettled();
    });
    // No login has been established yet, so the epoch has not moved: the probe
    // legitimately refreshes (and fails), and that anonymous teardown must not
    // abort the login that is still waiting for /login.
    expect(refreshPostMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      loginCall.resolve(tokenPairFixture('fresh-access'));
      await result;
    });

    expect(getCaptured(captured).status).toBe('authenticated');
    expect(getCaptured(captured).user).toEqual(USER);
    expect(tokenStore.get()).toBe('fresh-access');
    expect(navigateMock).toHaveBeenCalledTimes(1);
    expect(navigateMock).toHaveBeenCalledWith('/todos', { replace: true });
    http.restore();
  });

  it('lets a login finish when the probe 401s after /login answered but before /me does', async () => {
    const { gate, http, captured, probeSettled } = await renderWithGatedProbe();
    refreshPostMock.mockRejectedValue(httpError(401));
    apiLoginMock.mockResolvedValue(tokenPairFixture('fresh-access'));
    const meCall = deferred<MeResponse>();
    apiMeMock.mockReturnValue(meCall.promise);

    let result!: Promise<void>;
    await act(async () => {
      result = getCaptured(captured).login(CREDENTIALS);
      await vi.waitFor(() => expect(apiMeMock).toHaveBeenCalledTimes(2));
      gate.resolve();
      await probeSettled();
    });
    expect(refreshPostMock).not.toHaveBeenCalled();

    await act(async () => {
      meCall.resolve(USER);
      await result;
    });

    expect(getCaptured(captured).status).toBe('authenticated');
    expect(getCaptured(captured).user).toEqual(USER);
    expect(navigateMock).toHaveBeenCalledWith('/todos', { replace: true });
    http.restore();
  });

  it('sends no refresh for a request that 401s after the session was replaced', async () => {
    const { captured } = await renderAuthenticated();
    const gate = deferred<void>();
    const http = new MockAdapter(axiosClient);
    http.onGet('/todos').reply(async () => {
      await gate.promise;
      return [401];
    });

    let request!: Promise<unknown>;
    await act(async () => {
      request = axiosClient.get('/todos').catch((e: unknown) => e);
      await vi.waitFor(() => expect(http.history.get).toHaveLength(1));
      await getCaptured(captured).logout();
      apiLoginMock.mockResolvedValue(tokenPairFixture('second-access'));
      await getCaptured(captured).login(CREDENTIALS);
    });

    await act(async () => {
      gate.resolve();
      await request;
    });

    expect(refreshPostMock).not.toHaveBeenCalled();
    expect(await request).toMatchObject({ response: { status: 401 } });
    expect(http.history.get).toHaveLength(1);
    expect(getCaptured(captured).status).toBe('authenticated');
    http.restore();
  });

  it('sends no refresh for a request that 401s after logout', async () => {
    const { captured } = await renderAuthenticated();
    const gate = deferred<void>();
    const http = new MockAdapter(axiosClient);
    http.onGet('/todos').reply(async () => {
      await gate.promise;
      return [401];
    });

    let request!: Promise<unknown>;
    await act(async () => {
      request = axiosClient.get('/todos').catch((e: unknown) => e);
      await vi.waitFor(() => expect(http.history.get).toHaveLength(1));
      await getCaptured(captured).logout();
      gate.resolve();
      await request;
    });

    expect(refreshPostMock).not.toHaveBeenCalled();
    expect(await request).toMatchObject({ response: { status: 401 } });
    http.restore();
  });
});

describe('AuthProvider — a failed login must not disturb what is already running', () => {
  it('lets the probe settle as unauthenticated when login fails before the probe answers', async () => {
    const { probe, captured } = renderAnonymousProbePending();
    apiLoginMock.mockRejectedValue(httpError(401));

    await act(async () => {
      await expect(getCaptured(captured).login(CREDENTIALS)).rejects.toBeDefined();
    });
    await act(async () => {
      probe.reject(httpError(401));
      await probe.promise.catch(() => undefined);
    });

    expect(getCaptured(captured).status).toBe('unauthenticated');
  });

  it('lets the probe authenticate when login fails but the cookie was valid', async () => {
    const { probe, captured } = renderAnonymousProbePending();
    apiLoginMock.mockRejectedValue(httpError(401));
    tokenStore.set('cookie-access');

    await act(async () => {
      await expect(getCaptured(captured).login(CREDENTIALS)).rejects.toBeDefined();
    });
    await act(async () => {
      probe.resolve(USER);
      await probe.promise;
    });

    expect(getCaptured(captured).status).toBe('authenticated');
    expect(getCaptured(captured).user).toEqual(USER);
    expect(scheduleMock).toHaveBeenCalledWith('cookie-access', expect.any(Function));
  });

  it('keeps the session and its timer when an authenticated user submits a failing login', async () => {
    const { captured } = await renderAuthenticated();
    apiLoginMock.mockRejectedValue(httpError(401));
    const epochBefore = tokenStore.epoch();

    await act(async () => {
      await expect(getCaptured(captured).login(CREDENTIALS)).rejects.toBeDefined();
    });

    expect(getCaptured(captured).status).toBe('authenticated');
    expect(getCaptured(captured).user).toEqual(USER);
    expect(cancelMock).not.toHaveBeenCalled();
    expect(tokenStore.epoch()).toBe(epochBefore);
  });
});

describe('AuthProvider — an aborted login revokes the cookie it created', () => {
  it('logs out on the server when a logout landed while /login was pending', async () => {
    const { captured } = await renderAuthenticated();
    const loginCall = deferred<ReturnType<typeof tokenPairFixture>>();
    apiLoginMock.mockReturnValue(loginCall.promise);

    let result!: Promise<void>;
    await act(async () => {
      result = getCaptured(captured).login(CREDENTIALS);
      await getCaptured(captured).logout();
    });
    expect(apiLogoutMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      loginCall.resolve(tokenPairFixture('late-access'));
      await result;
    });

    // The late response set a refresh cookie that a reload would resurrect.
    expect(apiLogoutMock).toHaveBeenCalledTimes(2);
  });

  it('does not log out when a newer login superseded this one (double submit)', async () => {
    const { captured } = await renderAuthenticated();
    const first = deferred<ReturnType<typeof tokenPairFixture>>();
    const second = deferred<ReturnType<typeof tokenPairFixture>>();
    apiLoginMock.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);

    let a!: Promise<void>;
    let b!: Promise<void>;
    await act(async () => {
      a = getCaptured(captured).login(CREDENTIALS);
      b = getCaptured(captured).login(CREDENTIALS);
    });
    await act(async () => {
      second.resolve(tokenPairFixture('winner-access'));
      await b;
    });
    await act(async () => {
      first.resolve(tokenPairFixture('loser-access'));
      await a;
    });

    // The backend logout revokes every refresh token of the user, the winner's too.
    expect(apiLogoutMock).not.toHaveBeenCalled();
    expect(tokenStore.get()).toBe('winner-access');
    expect(getCaptured(captured).status).toBe('authenticated');
  });
});

describe('AuthProvider — the session ends while login() is awaiting', () => {
  it('aborts quietly when the user logs out before the credentials answer', async () => {
    const { captured } = await renderAuthenticated();
    const loginCall = deferred<ReturnType<typeof tokenPairFixture>>();
    apiLoginMock.mockReturnValue(loginCall.promise);

    let result!: Promise<void>;
    await act(async () => {
      result = getCaptured(captured).login(CREDENTIALS);
      await getCaptured(captured).logout();
    });
    navigateMock.mockClear();
    scheduleMock.mockClear();

    await act(async () => {
      loginCall.resolve(tokenPairFixture('late-access'));
      await result;
    });

    expect(tokenStore.get()).toBeNull();
    expect(getCaptured(captured).status).toBe('unauthenticated');
    expect(getCaptured(captured).user).toBeNull();
    expect(scheduleMock).not.toHaveBeenCalled();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('aborts quietly when a forced logout lands between the token and /me', async () => {
    const { captured } = await renderAuthenticated();
    apiLoginMock.mockResolvedValue(tokenPairFixture('late-access'));
    const meCall = deferred<MeResponse>();
    apiMeMock.mockReturnValue(meCall.promise);

    let result!: Promise<void>;
    await act(async () => {
      result = getCaptured(captured).login(CREDENTIALS);
      await vi.waitFor(() => expect(apiMeMock).toHaveBeenCalledTimes(2));
      authEvents.emit('unauthorized');
    });
    navigateMock.mockClear();
    scheduleMock.mockClear();

    await act(async () => {
      meCall.resolve(USER);
      await result;
    });

    expect(tokenStore.get()).toBeNull();
    expect(getCaptured(captured).status).toBe('unauthenticated');
    expect(getCaptured(captured).user).toBeNull();
    expect(scheduleMock).not.toHaveBeenCalled();
    expect(navigateMock).not.toHaveBeenCalled();
    expect(toastErrorMock).not.toHaveBeenCalled();
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
