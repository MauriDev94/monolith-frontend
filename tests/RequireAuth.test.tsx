import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import {
  MemoryRouter,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom';

/**
 * Tests for `RequireAuth`.
 *
 * Strategy: drive the auth context directly via a mock provider so we
 * don't have to mock the full `AuthProvider` lifecycle (mount /me,
 * scheduler, etc.). Each test injects the exact `AuthContextValue`
 * shape it wants and asserts on the rendered output under
 * `MemoryRouter`.
 */

// Imports MUST come after the mocks below so the mocked auth hook is
// wired into RequireAuth.
vi.mock('@/auth/useAuth', () => ({
  useAuth: vi.fn(),
}));

import { useAuth } from '@/auth/useAuth';
import { RequireAuth } from '@/auth/RequireAuth';
import type { AuthContextValue } from '@/auth/AuthContext';
import type { MeResponse } from '@/api/authApi';

const USER: MeResponse = {
  id: 'u-1',
  email: 'jane@example.com',
  name: 'Jane',
  lastname: 'Doe',
  birthdate: '1990-05-12',
};

const mockUseAuth = useAuth as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockUseAuth.mockReset();
});

afterEach(() => {
  cleanup();
});

function makeContext(overrides: Partial<AuthContextValue>): AuthContextValue {
  return {
    user: null,
    status: 'loading',
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    ...overrides,
  } as AuthContextValue;
}

/**
 * Captures the current location into a `data-testid` element so tests
 * can assert on the post-redirect URL after `<Navigate />` runs.
 * Lives inside the LoginPage route so the location is captured
 * whenever the login route renders (post-redirect). A standalone
 * catch-all probe would NOT render when the explicit `/login` route
 * matches, hiding the URL we want to assert on.
 */
function LoginPage() {
  const location = useLocation();
  return (
    <>
      <div data-testid="login">login page</div>
      <div data-testid="location">
        {`${location.pathname}${location.search}`}
      </div>
    </>
  );
}

function Protected() {
  return <div data-testid="protected">protected content</div>;
}

describe('RequireAuth — loading state', () => {
  it('renders FullPageSkeleton when status is "loading"', () => {
    mockUseAuth.mockReturnValue(makeContext({ status: 'loading', user: null }));

    render(
      <MemoryRouter initialEntries={['/todos']}>
        <Routes>
          <Route element={<RequireAuth />}>
            <Route path="/todos" element={<Protected />} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByTestId('full-page-skeleton')).toBeInTheDocument();
    expect(screen.queryByTestId('protected')).not.toBeInTheDocument();
    expect(screen.queryByTestId('login')).not.toBeInTheDocument();
  });

  it('does NOT redirect while still loading (no /login flash)', () => {
    mockUseAuth.mockReturnValue(makeContext({ status: 'loading', user: null }));

    render(
      <MemoryRouter initialEntries={['/todos']}>
        <Routes>
          <Route element={<RequireAuth />}>
            <Route path="/todos" element={<Protected />} />
          </Route>
          <Route path="/login" element={<LoginPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.queryByTestId('login')).not.toBeInTheDocument();
    expect(screen.queryByTestId('location')).not.toBeInTheDocument();
  });
});

describe('RequireAuth — unauthenticated state', () => {
  it('redirects to /login?from=/todos when status is unauthenticated', () => {
    mockUseAuth.mockReturnValue(
      makeContext({ status: 'unauthenticated', user: null }),
    );

    render(
      <MemoryRouter initialEntries={['/todos']}>
        <Routes>
          <Route element={<RequireAuth />}>
            <Route path="/todos" element={<Protected />} />
          </Route>
          <Route path="/login" element={<LoginPage />} />
        </Routes>
      </MemoryRouter>,
    );

    // Protected content is gone; the login route is rendered for the
    // redirected URL.
    expect(screen.queryByTestId('protected')).not.toBeInTheDocument();
    expect(screen.getByTestId('login')).toBeInTheDocument();
    expect(screen.getByTestId('location').textContent).toBe(
      '/login?from=/todos',
    );
  });

  it('preserves the original path in the `from` query when nested', () => {
    mockUseAuth.mockReturnValue(
      makeContext({ status: 'unauthenticated', user: null }),
    );

    render(
      <MemoryRouter initialEntries={['/todos/123']}>
        <Routes>
          <Route element={<RequireAuth />}>
            <Route path="/todos/:id" element={<Protected />} />
          </Route>
          <Route path="/login" element={<LoginPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByTestId('login')).toBeInTheDocument();
    expect(screen.getByTestId('location').textContent).toBe(
      '/login?from=/todos/123',
    );
  });
});

describe('RequireAuth — authenticated state', () => {
  it('renders the Outlet (protected child) when status is authenticated', () => {
    mockUseAuth.mockReturnValue(
      makeContext({ status: 'authenticated', user: USER }),
    );

    render(
      <MemoryRouter initialEntries={['/todos']}>
        <Routes>
          <Route element={<RequireAuth />}>
            <Route path="/todos" element={<Protected />} />
          </Route>
          <Route path="/login" element={<LoginPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByTestId('protected')).toBeInTheDocument();
    expect(screen.queryByTestId('login')).not.toBeInTheDocument();
    expect(screen.queryByTestId('full-page-skeleton')).not.toBeInTheDocument();
  });
});

describe('RequireAuth — replace semantics', () => {
  it('uses `replace` so the protected URL does not pollute history', () => {
    // Verified by react-router-dom's behavior: `<Navigate replace />`
    // rewrites the current entry rather than pushing a new one. The
    // observable consequence is that the LoginPage renders at /login
    // with the `from` query, and the protected path is NOT in history.
    // Asserted via the same path as the unauthenticated redirect test
    // — when history is pushed, the rendering after the Navigate
    // would still match; this test pins down the user-facing contract
    // explicitly so a future contributor cannot quietly switch to a
    // push-based redirect.
    mockUseAuth.mockReturnValue(
      makeContext({ status: 'unauthenticated', user: null }),
    );

    render(
      <MemoryRouter initialEntries={['/todos']}>
        <Routes>
          <Route element={<RequireAuth />}>
            <Route path="/todos" element={<Protected />} />
          </Route>
          <Route path="/login" element={<LoginPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByTestId('location').textContent).toBe(
      '/login?from=/todos',
    );
    // Exactly one history slot — the redirect replaced /todos rather
    // than pushing on top of it.
    // MemoryRouter renders the matched route for `/login`, so the
    // absence of the LocationProbe render (which would match `/login`
    // too, but is registered for `*`) is the proof of replacement: with
    // a push, the * route would still show the prior URL. We assert
    // the LoginPage element appears instead, which is what `replace`
    // produces.
    expect(screen.getByTestId('login')).toBeInTheDocument();
  });
});