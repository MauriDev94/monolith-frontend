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
  TEST_PASSWORD_NO_DIGIT,
  TEST_PASSWORD_NO_LETTER,
  TEST_PASSWORD_REGISTER_OK,
} from './test-fixtures';

/**
 * Tests for `RegisterForm`.
 *
 * The form is a pure presentation component — it only calls `register` from
 * the auth context. We mock `useAuth` and assert on the call args. No
 * `AuthProvider`, no router, no axios traffic.
 */

// Imports MUST come after the mock below.
const registerMock = vi.fn();

vi.mock('@/auth/useAuth', () => ({
  useAuth: () => ({ register: registerMock }),
}));

import { RegisterForm } from '@/auth/RegisterForm';

const user = userEvent.setup();

const VALID_PAYLOAD = {
  name: 'Jane',
  lastname: 'Doe',
  email: 'jane@example.com',
  password: TEST_PASSWORD_REGISTER_OK,
  birthdate: '1990-05-12',
};

beforeEach(() => {
  registerMock.mockReset();
  registerMock.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
});

function getInputByLabel(label: RegExp): HTMLInputElement {
  return screen.getByLabelText(label) as HTMLInputElement;
}

async function fillValid() {
  await user.type(getInputByLabel(/^nombre$/i), VALID_PAYLOAD.name);
  await user.type(getInputByLabel(/^apellido$/i), VALID_PAYLOAD.lastname);
  await user.type(getInputByLabel(/^email$/i), VALID_PAYLOAD.email);
  await user.type(getInputByLabel(/^contraseña$/i), VALID_PAYLOAD.password);
  await user.type(
    getInputByLabel(/fecha de nacimiento/i),
    VALID_PAYLOAD.birthdate,
  );
}

describe('RegisterForm — rendering', () => {
  it('renders all five fields and the submit button', () => {
    render(<RegisterForm />);

    expect(getInputByLabel(/^nombre$/i)).toBeInTheDocument();
    expect(getInputByLabel(/^apellido$/i)).toBeInTheDocument();
    expect(getInputByLabel(/^email$/i)).toBeInTheDocument();
    expect(getInputByLabel(/^email$/i).type).toBe('email');
    expect(getInputByLabel(/^contraseña$/i)).toBeInTheDocument();
    expect(getInputByLabel(/^contraseña$/i).type).toBe('password');
    expect(
      getInputByLabel(/fecha de nacimiento/i),
    ).toBeInTheDocument();
    expect(
      getInputByLabel(/fecha de nacimiento/i).type,
    ).toBe('date');
    expect(
      screen.getByRole('button', { name: /crear cuenta/i }),
    ).toBeInTheDocument();
  });
});

describe('RegisterForm — schema validation', () => {
  it('does NOT call register when the password has no letters', async () => {
    render(<RegisterForm />);

    await user.type(getInputByLabel(/^nombre$/i), VALID_PAYLOAD.name);
    await user.type(getInputByLabel(/^apellido$/i), VALID_PAYLOAD.lastname);
    await user.type(getInputByLabel(/^email$/i), VALID_PAYLOAD.email);
    await user.type(getInputByLabel(/^contraseña$/i), TEST_PASSWORD_NO_LETTER);
    await user.type(
      getInputByLabel(/fecha de nacimiento/i),
      VALID_PAYLOAD.birthdate,
    );
    await user.click(screen.getByRole('button', { name: /crear cuenta/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/debe contener al menos una letra/i),
      ).toBeInTheDocument();
    });
    expect(registerMock).not.toHaveBeenCalled();
  });

  it('does NOT call register when the password has no digits', async () => {
    render(<RegisterForm />);

    await user.type(getInputByLabel(/^nombre$/i), VALID_PAYLOAD.name);
    await user.type(getInputByLabel(/^apellido$/i), VALID_PAYLOAD.lastname);
    await user.type(getInputByLabel(/^email$/i), VALID_PAYLOAD.email);
    await user.type(getInputByLabel(/^contraseña$/i), TEST_PASSWORD_NO_DIGIT);
    await user.type(
      getInputByLabel(/fecha de nacimiento/i),
      VALID_PAYLOAD.birthdate,
    );
    await user.click(screen.getByRole('button', { name: /crear cuenta/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/debe contener al menos un número/i),
      ).toBeInTheDocument();
    });
    expect(registerMock).not.toHaveBeenCalled();
  });

  it('does NOT call register when the birthdate is in the wrong format', async () => {
    render(<RegisterForm />);

    await user.type(getInputByLabel(/^nombre$/i), VALID_PAYLOAD.name);
    await user.type(getInputByLabel(/^apellido$/i), VALID_PAYLOAD.lastname);
    await user.type(getInputByLabel(/^email$/i), VALID_PAYLOAD.email);
    await user.type(getInputByLabel(/^contraseña$/i), VALID_PAYLOAD.password);
    await user.type(
      getInputByLabel(/fecha de nacimiento/i),
      '05/12/1990',
    );
    await user.click(screen.getByRole('button', { name: /crear cuenta/i }));

    await waitFor(() => {
      expect(screen.getByText(/fecha inválida/i)).toBeInTheDocument();
    });
    expect(registerMock).not.toHaveBeenCalled();
  });
});

describe('RegisterForm — submission', () => {
  it('calls register(values) when the form is fully valid', async () => {
    render(<RegisterForm />);

    await fillValid();
    await user.click(screen.getByRole('button', { name: /crear cuenta/i }));

    await waitFor(() => {
      expect(registerMock).toHaveBeenCalledTimes(1);
    });
    expect(registerMock).toHaveBeenCalledWith(VALID_PAYLOAD, undefined);
  });

  it('calls register(values, from) when from is provided', async () => {
    render(<RegisterForm from="/profile" />);

    await fillValid();
    await user.click(screen.getByRole('button', { name: /crear cuenta/i }));

    await waitFor(() => {
      expect(registerMock).toHaveBeenCalledTimes(1);
    });
    expect(registerMock).toHaveBeenCalledWith(VALID_PAYLOAD, '/profile');
  });

  it('renders an inline error when register rejects', async () => {
    registerMock.mockRejectedValue(new Error('email already registered'));

    render(<RegisterForm />);

    await fillValid();
    await user.click(screen.getByRole('button', { name: /crear cuenta/i }));

    await waitFor(() => {
      expect(screen.getByTestId('register-submit-error')).toBeInTheDocument();
    });
    expect(
      screen.getByTestId('register-submit-error').textContent,
    ).toMatch(/email already registered/i);
  });
});