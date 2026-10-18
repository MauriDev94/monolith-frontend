import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

/**
 * Tests for `RegisterPage`.
 *
 * Strategy: mock `<RegisterForm>` so the page test does not need the full
 * auth/RHF machinery. Assert on what the page renders and how it forwards
 * `from` to the form.
 */

vi.mock('@/auth/RegisterForm', () => ({
  RegisterForm: ({ from }: { from?: string }) => (
    <div data-testid="register-form" data-from={from ?? ''} />
  ),
}));

import RegisterPage from '@/routes/RegisterPage';

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe('RegisterPage', () => {
  it('renders the register form and the cross-link to /login', () => {
    render(
      <MemoryRouter initialEntries={['/register']}>
        <Routes>
          <Route path="/register" element={<RegisterPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByTestId('register-form')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /inicia sesión/i })).toHaveAttribute('href', '/login');
  });

  it('forwards ?from=<path> to the RegisterForm', () => {
    render(
      <MemoryRouter initialEntries={['/register?from=/todos']}>
        <Routes>
          <Route path="/register" element={<RegisterPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByTestId('register-form').dataset.from).toBe('/todos');
  });

  it('forwards undefined to the RegisterForm when ?from is absent', () => {
    render(
      <MemoryRouter initialEntries={['/register']}>
        <Routes>
          <Route path="/register" element={<RegisterPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByTestId('register-form').dataset.from).toBe('');
  });
});
