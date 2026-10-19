/**
 * Zero-dependency JWT `exp` decoder.
 *
 * Parses a JWT (JWS in compact serialization: `header.payload.signature`) and
 * returns the `exp` claim as Unix seconds. The signature is **not** verified —
 * the server validated it at issue and we only need the timestamp to schedule
 * a proactive refresh. Re-checking locally would add complexity without
 * security value for an SPA. See `tokenRefreshScheduler.ts` and locked
 * decision #7.
 *
 * Throws on:
 * - Non-string input.
 * - A JWT with fewer than 3 segments (header.payload.signature).
 * - A header/payload that is not valid base64url.
 * - A payload that does not parse as JSON.
 * - A missing `exp` claim (we cannot schedule a refresh without it).
 */

/**
 * Decode the `exp` claim (Unix seconds) from a JWT.
 *
 * @param token - Compact-serialized JWT string.
 * @returns `exp` claim as Unix seconds (number).
 * @throws Error when the token cannot be decoded or `exp` is missing.
 */
export function decodeJwtExp(token: string): number {
  if (typeof token !== 'string' || token.length === 0) {
    throw new Error('decodeJwtExp: token must be a non-empty string');
  }

  const segments = token.split('.');
  if (segments.length !== 3) {
    throw new Error(
      `decodeJwtExp: expected 3 segments, got ${segments.length}`,
    );
  }

  const payloadSegment = segments[1];
  let payloadJson: string;
  try {
    payloadJson = base64UrlDecode(payloadSegment);
  } catch (cause) {
    throw new Error('decodeJwtExp: payload is not valid base64url', { cause });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(payloadJson);
  } catch (cause) {
    throw new Error('decodeJwtExp: payload is not valid JSON', { cause });
  }

  if (
    payload === null ||
    typeof payload !== 'object' ||
    !('exp' in payload)
  ) {
    throw new Error('decodeJwtExp: payload is missing the exp claim');
  }

  const exp = (payload as { exp: unknown }).exp;
  if (typeof exp !== 'number' || !Number.isFinite(exp)) {
    throw new Error('decodeJwtExp: exp claim is not a finite number');
  }

  return exp;
}

/**
 * Decode a base64url-encoded string into the underlying bytes interpreted as
 * UTF-8. Accepts the base64url alphabet (RFC 4648 §5) with optional padding.
 *
 * `atob` is available in every browser and in Node >= 16 (the SPA targets
 * modern browsers; Vite uses Node 18+ for build, happy-dom uses Node 18+
 * for tests). The base64url alphabet is mapped to base64 first, padding is
 * restored, then we binary-decode and re-percent-escape each byte so the
 * resulting `decodeURIComponent` produces a clean UTF-8 string (a JWT
 * payload can contain non-ASCII characters in theory).
 */
function base64UrlDecode(input: string): string {
  // Translate base64url → base64.
  let normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  // Re-add stripped padding so `atob` accepts it.
  while (normalized.length % 4 !== 0) {
    normalized += '=';
  }
  const binary = atob(normalized);
  return decodeURIComponent(
    binary
      .split('')
      .map((c) => `%${c.charCodeAt(0).toString(16).padStart(2, '0')}`)
      .join(''),
  );
}