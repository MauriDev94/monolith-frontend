import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError } from 'axios';

/**
 * Smoke test for the real route table.
 *
 * Every other suite mounts components inside its own `MemoryRouter`, so none
 * of them catches a provider placed outside `<RouterProvider>`. This one
 * renders the production `<Router />` to prove `AuthProvider` can call
 * `useNavigate` at boot.
 *
 * The network seam is mocked so the session probe resolves as anonymous.
 * The router is a module-level singleton created at import (starting at `/`),
 * so tests move between pages by clicking links, not via `history.pushState`.
 */
const unauthorized = () =>
  Promise.reject(
    new AxiosError('Unauthorized', '401', undefined, undefined, {
      status: 401,
    } as never),
  );

vi.mock('@/api/authApi', () => ({
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
  me: () => unauthorized(),
}));

vi.mock('@/api/refreshClient', () => ({
  refreshClient: { post: () => unauthorized() },
}));

import { Router } from '@/routes/routes';

describe('Router — real route table', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders the home page without throwing', async () => {
    render(<Router />);

    expect(
      await screen.findByRole('heading', { name: 'Tu bitácora de misiones' }),
    ).toBeInTheDocument();
  });

  it('renders the navbar in the root layout', async () => {
    render(<Router />);

    expect(await screen.findByTestId('navbar-login-link')).toHaveAttribute('href', '/login');
  });

  it('navigates to the register page from the navbar CTA', async () => {
    const user = userEvent.setup();
    render(<Router />);

    await user.click(await screen.findByTestId('navbar-register-link'));

    expect(await screen.findByRole('heading', { name: 'Crear cuenta' })).toBeInTheDocument();
  });
});
