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
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  TEST_PASSWORD_LOGIN_OK,
  TEST_PASSWORD_SHORT,
} from './test-fixtures';

/**
 * Tests for `LoginForm`.
 *
 * The form is a pure presentation component — it only calls `login` from
 * the auth context, never reads `status` or `user`. So we mock `useAuth`
 * with just the `login` callback and assert on its call args. No
 * `AuthProvider`, no router, no axios traffic.
 */

// Imports MUST come after the mock below so the mocked hook is wired into the
// module under test.
const loginMock = vi.fn();

vi.mock('@/auth/useAuth', () => ({
  useAuth: () => ({ login: loginMock }),
}));

import { LoginForm } from '@/auth/LoginForm';

const user = userEvent.setup();

beforeEach(() => {
  loginMock.mockReset();
  // Default to "login succeeds"; individual tests override.
  loginMock.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
});

function getEmailInput(): HTMLInputElement {
  return screen.getByLabelText(/email/i) as HTMLInputElement;
}

function getPasswordInput(): HTMLInputElement {
  return screen.getByLabelText(/contraseña/i) as HTMLInputElement;
}

async function fillValidCredentials() {
  await user.type(getEmailInput(), 'user@example.com');
  await user.type(getPasswordInput(), TEST_PASSWORD_LOGIN_OK);
}

describe('LoginForm — rendering', () => {
  it('renders email and password fields and the submit button', () => {
    render(<LoginForm />);

    expect(getEmailInput()).toBeInTheDocument();
    expect(getEmailInput().type).toBe('email');
    expect(getPasswordInput()).toBeInTheDocument();
    expect(getPasswordInput().type).toBe('password');
    expect(
      screen.getByRole('button', { name: /ingresar/i }),
    ).toBeInTheDocument();
  });

  it('uses localized labels', () => {
    render(<LoginForm />);

    expect(screen.getByText('Email')).toBeInTheDocument();
    expect(screen.getByText('Contraseña')).toBeInTheDocument();
  });
});

describe('LoginForm — schema validation', () => {
  it('does NOT call login when the email is invalid', async () => {
    render(<LoginForm />);

    await user.type(getEmailInput(), 'not-an-email');
    await user.type(getPasswordInput(), TEST_PASSWORD_LOGIN_OK);
    await user.click(screen.getByRole('button', { name: /ingresar/i }));

    await waitFor(() => {
      expect(screen.getByText(/email inválido/i)).toBeInTheDocument();
    });
    expect(loginMock).not.toHaveBeenCalled();
  });

  it('does NOT call login when the password is shorter than 8 chars', async () => {
    render(<LoginForm />);

    await user.type(getEmailInput(), 'user@example.com');
    await user.type(getPasswordInput(), TEST_PASSWORD_SHORT);
    await user.click(screen.getByRole('button', { name: /ingresar/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/la contraseña debe tener al menos 8 caracteres/i),
      ).toBeInTheDocument();
    });
    expect(loginMock).not.toHaveBeenCalled();
  });
});

describe('LoginForm — submission', () => {
  it('calls login(values) when the form is valid and from is absent', async () => {
    render(<LoginForm />);

    await fillValidCredentials();
    await user.click(screen.getByRole('button', { name: /ingresar/i }));

    await waitFor(() => {
      expect(loginMock).toHaveBeenCalledTimes(1);
    });
    expect(loginMock).toHaveBeenCalledWith(
      { email: 'user@example.com', password: TEST_PASSWORD_LOGIN_OK },
      undefined,
    );
  });

  it('calls login(values, from) when the form is valid and from is provided', async () => {
    render(<LoginForm from="/profile" />);

    await fillValidCredentials();
    await user.click(screen.getByRole('button', { name: /ingresar/i }));

    await waitFor(() => {
      expect(loginMock).toHaveBeenCalledTimes(1);
    });
    expect(loginMock).toHaveBeenCalledWith(
      { email: 'user@example.com', password: TEST_PASSWORD_LOGIN_OK },
      '/profile',
    );
  });

  it('disables the submit button while the request is in flight', async () => {
    // Never-resolving login keeps isSubmitting true.
    loginMock.mockReturnValue(new Promise(() => {}));

    render(<LoginForm />);

    await fillValidCredentials();
    await user.click(screen.getByRole('button', { name: /ingresar/i }));

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /ingresando/i }),
      ).toBeDisabled();
    });
  });

  it('renders an inline error when login rejects with a non-Error value', async () => {
    loginMock.mockRejectedValue('network down');

    render(<LoginForm />);

    await fillValidCredentials();
    await user.click(screen.getByRole('button', { name: /ingresar/i }));

    await waitFor(() => {
      expect(screen.getByTestId('login-submit-error')).toBeInTheDocument();
    });
    expect(
      screen.getByTestId('login-submit-error').textContent,
    ).toMatch(/no se pudo iniciar sesión/i);
  });
});