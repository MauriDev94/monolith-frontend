import { AxiosError } from 'axios';

export type AuthAction = 'login' | 'register';

const FALLBACK: Record<AuthAction, string> = {
  login: 'No se pudo iniciar sesión. Inténtalo de nuevo.',
  register: 'No se pudo crear la cuenta. Inténtalo de nuevo.',
};

/**
 * Maps a failed login / register call to the Spanish copy shown inline under
 * the form.
 *
 * Never surfaces `err.message`: axios messages are English and technical
 * ("Request failed with status code 401"). Status codes follow the backend's
 * error handlers (`app/core/exceptions/error_handling.py`): 400 validation,
 * 401 bad credentials, 409 conflict, 429 rate limit.
 *
 * Returns `null` for a login 401 because `AuthProvider.login` already toasts
 * "Email o contraseña incorrectos"; repeating it inline would duplicate it.
 */
export function authErrorMessage(err: unknown, action: AuthAction): string | null {
  if (!(err instanceof AxiosError)) return FALLBACK[action];

  // No response at all: offline, DNS, CORS or the API is down.
  if (!err.response) {
    return 'No se pudo conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.';
  }

  const { status } = err.response;
  if (status === 401 && action === 'login') return null;
  if (status === 409 && action === 'register') {
    return 'Ya existe una cuenta con ese email. Inicia sesión o usa otro email.';
  }
  if (status === 400) return 'Revisa los datos ingresados e inténtalo de nuevo.';
  if (status === 429) return 'Demasiados intentos. Espera un momento e inténtalo de nuevo.';
  if (status >= 500) return 'El servidor tuvo un problema. Inténtalo de nuevo en unos minutos.';
  return FALLBACK[action];
}
