import { AxiosError } from 'axios';

/**
 * Spanish copy for a failed API call, shared by every form and page.
 *
 * Never surfaces `err.message`: axios messages are English and technical
 * ("Request failed with status code 500"). Status codes follow the
 * backend's error handlers (`app/core/exceptions/error_handling.py`): 400
 * validation / domain rule, 401 unauthenticated, 404 not found, 409
 * conflict, 429 rate limit. Callers handle their own special cases (e.g.
 * login 401, register 409) before falling back to this.
 */
export function apiErrorMessage(err: unknown, fallback: string): string {
  if (!(err instanceof AxiosError)) return fallback;

  // No response at all: offline, DNS, CORS or the API is down.
  if (!err.response) {
    return 'No se pudo conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.';
  }

  const { status } = err.response;
  if (status === 400) return 'Revisa los datos ingresados e inténtalo de nuevo.';
  if (status === 429) return 'Demasiados intentos. Espera un momento e inténtalo de nuevo.';
  if (status >= 500) return 'El servidor tuvo un problema. Inténtalo de nuevo en unos minutos.';
  return fallback;
}

/** HTTP status of a failed axios call, or `undefined` for anything else. */
export function errorStatus(err: unknown): number | undefined {
  return err instanceof AxiosError ? err.response?.status : undefined;
}
