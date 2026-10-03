import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  act,
  cleanup,
  render,
  waitFor,
} from '@testing-library/react';
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
const authListeners = new Set<() => void>();

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
    on: (event: string, cb: () => void) => {
      if (event === 'unauthorized') authListeners.add(cb);
      return () => {
        authListeners.delete(cb);
      };
    },
    emit: (event: string) => {
      if (event !== 'unauthorized') return;
      for (const cb of [...authListeners]) {
        try {
          cb();
        } catch {
          // swallow — mirrors real authEvents behavior
        }
      }
    },
  },
}));

vi.mock('react-router-dom', async () => {
  const actual =
    await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
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
import type { MeResponse } from '@/api/authApi';
import type { AuthContextValue } from '@/auth/AuthContext';
import {
  TEST_PASSWORD_LOGIN_OK,
  TEST_PASSWORD_REGISTER_OK,
} from './test-fixtures';

const USER: MeResponse = {
  id: 'u-1',
  email: 'jane@example.com',
  name: 'Jane',
  lastname: 'Doe',
  birthdate: '1990-05-12',
};

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

function getCaptured(
  capturedRef: { current: AuthContextValue | null },
): AuthContextValue {
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
    expect(scheduleMock).toHaveBeenCalledWith(
      'access-from-cookie',
      expect.any(Function),
    );
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
    apiLoginMock.mockResolvedValue({
      access_token: 'fresh-access',
      refresh_token: 'fresh-refresh',
      token_type: 'bearer',
    });

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
    expect(scheduleMock).toHaveBeenCalledWith(
      'fresh-access',
      expect.any(Function),
    );
    expect(navigateMock).toHaveBeenCalledWith('/todos', { replace: true });
  });

  it('honors `from` over the default /todos on navigation', async () => {
    // Mount probe: no session. Post-login /me: USER.
    apiMeMock.mockImplementationOnce(() =>
      Promise.reject(new Error('no session')),
    );
    apiMeMock.mockResolvedValue(USER);
    apiLoginMock.mockResolvedValue({
      access_token: 'fresh-access',
      refresh_token: 'fresh-refresh',
      token_type: 'bearer',
    });

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
    apiMeMock.mockImplementationOnce(() =>
      Promise.reject(new Error('no session')),
    );
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

    expect(toastErrorMock).toHaveBeenCalledWith(
      'Email o contraseña incorrectos',
    );
    expect(tokenStore.get()).toBeNull();
  });

  it('does NOT show the wrong-credentials toast on non-401 errors', async () => {
    apiMeMock.mockImplementationOnce(() =>
      Promise.reject(new Error('no session')),
    );
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
    apiMeMock.mockImplementationOnce(() =>
      Promise.reject(new Error('no session')),
    );
    apiMeMock.mockResolvedValue(USER);
    apiRegisterMock.mockResolvedValue({ id: 'u-new', email: 'new@example.com' });
    apiLoginMock.mockResolvedValue({
      access_token: 'new-access',
      refresh_token: 'new-refresh',
      token_type: 'bearer',
    });

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
    expect(scheduleMock).toHaveBeenCalledWith(
      'new-access',
      expect.any(Function),
    );
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
});

describe('useAuth', () => {
  it('throws when called outside an AuthProvider', () => {
    // Suppress React's error-boundary noise from the expected throw.
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    function Naked() {
      useAuth();
      return null;
    }

    expect(() => render(<Naked />)).toThrow(
      'useAuth must be used within <AuthProvider>',
    );

    consoleError.mockRestore();
  });
});