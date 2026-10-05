import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  cleanup,
  render,
  screen,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

/**
 * Tests for `Navbar`.
 *
 * Strategy: mock `useAuth` to return a controlled auth context per test.
 * Assert on what the navbar renders under each `status` value.
 */

// Imports MUST come after the mock below.
const useAuthMock = vi.fn();

vi.mock('@/auth/useAuth', () => ({
  useAuth: () => useAuthMock(),
}));

import { Navbar } from '@/components/Navbar';

beforeEach(() => {
  useAuthMock.mockReset();
});

afterEach(() => {
  cleanup();
});

function renderNavbar() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Navbar />
    </MemoryRouter>,
  );
}

describe('Navbar — loading state', () => {
  it('renders the loading skeleton and no auth controls', () => {
    useAuthMock.mockReturnValue({
      user: null,
      status: 'loading',
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
    });

    renderNavbar();

    expect(screen.getByTestId('navbar-loading-skeleton')).toBeInTheDocument();
    expect(screen.queryByTestId('navbar-login-link')).not.toBeInTheDocument();
    expect(screen.queryByTestId('navbar-register-link')).not.toBeInTheDocument();
    expect(screen.queryByTestId('navbar-user-email')).not.toBeInTheDocument();
    expect(screen.queryByTestId('navbar-logout-button')).not.toBeInTheDocument();
  });
});

describe('Navbar — unauthenticated state', () => {
  it('renders login and register links, no skeleton, no user email', () => {
    useAuthMock.mockReturnValue({
      user: null,
      status: 'unauthenticated',
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
    });

    renderNavbar();

    expect(screen.getByTestId('navbar-login-link')).toBeInTheDocument();
    expect(screen.getByTestId('navbar-login-link')).toHaveAttribute(
      'href',
      '/login',
    );
    expect(screen.getByTestId('navbar-register-link')).toBeInTheDocument();
    expect(screen.getByTestId('navbar-register-link')).toHaveAttribute(
      'href',
      '/register',
    );
    expect(
      screen.queryByTestId('navbar-loading-skeleton'),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId('navbar-user-email')).not.toBeInTheDocument();
    expect(screen.queryByTestId('navbar-logout-button')).not.toBeInTheDocument();
  });
});

describe('Navbar — authenticated state', () => {
  it('renders the user email and a logout button, no skeleton, no links', () => {
    useAuthMock.mockReturnValue({
      user: { id: 'u-1', email: 'jane@example.com', name: 'Jane', lastname: 'Doe', birthdate: '1990-05-12' },
      status: 'authenticated',
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
    });

    renderNavbar();

    expect(screen.getByTestId('navbar-user-email')).toHaveTextContent(
      'jane@example.com',
    );
    expect(screen.getByTestId('navbar-logout-button')).toBeInTheDocument();
    expect(
      screen.queryByTestId('navbar-loading-skeleton'),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId('navbar-login-link')).not.toBeInTheDocument();
    expect(screen.queryByTestId('navbar-register-link')).not.toBeInTheDocument();
  });

  it('truncates the email to 24 chars when longer', () => {
    useAuthMock.mockReturnValue({
      user: {
        id: 'u-1',
        email: 'a.very.long.email.address.that.exceeds.the.limit@example.com',
        name: 'Jane',
        lastname: 'Doe',
        birthdate: '1990-05-12',
      },
      status: 'authenticated',
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
    });

    renderNavbar();

    const text = screen.getByTestId('navbar-user-email').textContent ?? '';
    expect(text.length).toBeLessThanOrEqual(24);
    expect(text.endsWith('…')).toBe(true);
  });

  it('calls logout when the logout button is clicked', async () => {
    const user = userEvent.setup();
    const logoutMock = vi.fn().mockResolvedValue(undefined);

    useAuthMock.mockReturnValue({
      user: { id: 'u-1', email: 'jane@example.com', name: 'Jane', lastname: 'Doe', birthdate: '1990-05-12' },
      status: 'authenticated',
      login: vi.fn(),
      register: vi.fn(),
      logout: logoutMock,
    });

    renderNavbar();

    await user.click(screen.getByTestId('navbar-logout-button'));

    expect(logoutMock).toHaveBeenCalledTimes(1);
  });
});

describe('Navbar — logo link', () => {
  it('always links to / regardless of auth status', () => {
    useAuthMock.mockReturnValue({
      user: null,
      status: 'unauthenticated',
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
    });

    renderNavbar();

    const logo = screen.getByRole('link', { name: /monolith/i });
    expect(logo).toHaveAttribute('href', '/');
  });
});