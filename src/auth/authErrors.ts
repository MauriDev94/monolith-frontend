import { apiErrorMessage, errorStatus } from '@/api/apiErrors';

export type AuthAction = 'login' | 'register';

const FALLBACK: Record<AuthAction, string> = {
  login: 'No se pudo iniciar sesión. Inténtalo de nuevo.',
  register: 'No se pudo crear la cuenta. Inténtalo de nuevo.',
};

/**
 * Maps a failed login / register call to the Spanish copy shown inline under
 * the form. Auth-specific cases first, then the shared `apiErrorMessage`.
 *
 * Returns `null` for a login 401 because `AuthProvider.login` already toasts
 * "Email o contraseña incorrectos"; repeating it inline would duplicate it.
 */
export function authErrorMessage(err: unknown, action: AuthAction): string | null {
  const status = errorStatus(err);
  if (status === 401 && action === 'login') return null;
  if (status === 409 && action === 'register') {
    return 'Ya existe una cuenta con ese email. Inicia sesión o usa otro email.';
  }
  return apiErrorMessage(err, FALLBACK[action]);
}
