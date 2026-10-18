import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

/**
 * Tests for `LoginPage`.
 *
 * Strategy: mock `<LoginForm>` so the page test does not need the full
 * auth/RHF machinery. Assert on what the page renders and how it forwards
 * `from` to the form.
 */

vi.mock('@/auth/LoginForm', () => ({
  LoginForm: ({ from }: { from?: string }) => (
    <div data-testid="login-form" data-from={from ?? ''} />
  ),
}));

import LoginPage from '@/routes/LoginPage';

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe('LoginPage', () => {
  it('renders the login form and the cross-link to /register', () => {
    render(
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByTestId('login-form')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /regístrate/i })).toHaveAttribute('href', '/register');
  });

  it('forwards ?from=<path> to the LoginForm', () => {
    render(
      <MemoryRouter initialEntries={['/login?from=/profile']}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByTestId('login-form').dataset.from).toBe('/profile');
  });

  it('forwards undefined to the LoginForm when ?from is absent', () => {
    render(
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByTestId('login-form').dataset.from).toBe('');
  });
});
