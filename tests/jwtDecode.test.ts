import { describe, expect, it } from 'vitest';
import { decodeJwtExp } from '@/auth/jwtDecode';

/**
 * Build a JWT string from arbitrary claims. Encodes `header` and `payload`
 * as base64url (matching RFC 7519). The signature segment is a placeholder
 * because `decodeJwtExp` does not verify it.
 */
function makeJwt(payload: Record<string, unknown>, header: object = { alg: 'HS256', typ: 'JWT' }): string {
  const b64 = (obj: object) =>
    btoa(JSON.stringify(obj))
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
  return `${b64(header)}.${b64(payload)}.signature`;
}

describe('decodeJwtExp', () => {
  it('returns the exp claim from a well-formed JWT', () => {
    const token = makeJwt({ sub: 'user-1', exp: 1_700_000_000 });
    expect(decodeJwtExp(token)).toBe(1_700_000_000);
  });

  it('handles base64url alphabet (- and _) in the payload', () => {
    // Encode the payload manually to force base64url-only chars in the segment.
    const payload = JSON.stringify({ exp: 1_700_000_123 });
    const b64 = btoa(payload).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    const token = `header.${b64}.sig`;
    expect(decodeJwtExp(token)).toBe(1_700_000_123);
  });

  it('throws when input is empty', () => {
    expect(() => decodeJwtExp('')).toThrow(/non-empty string/);
  });

  it('throws when input is not a string', () => {
    // @ts-expect-error — testing runtime guard against non-string.
    expect(() => decodeJwtExp(null)).toThrow(/non-empty string/);
    // @ts-expect-error — testing runtime guard against non-string.
    expect(() => decodeJwtExp(undefined)).toThrow(/non-empty string/);
    // @ts-expect-error — testing runtime guard against non-string.
    expect(() => decodeJwtExp(42)).toThrow(/non-empty string/);
  });

  it('throws when token has fewer than 3 segments', () => {
    expect(() => decodeJwtExp('a.b')).toThrow(/3 segments/);
    expect(() => decodeJwtExp('onlyone')).toThrow(/3 segments/);
  });

  it('throws when the payload segment is not valid base64url', () => {
    expect(() => decodeJwtExp('header.!!!.sig')).toThrow(/base64url/);
  });

  it('throws when the payload does not parse as JSON', () => {
    // base64url of "not json" with padding stripped.
    const bad = btoa('not json').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    expect(() => decodeJwtExp(`header.${bad}.sig`)).toThrow(/JSON/);
  });

  it('throws when the payload is missing the exp claim', () => {
    const token = makeJwt({ sub: 'user-1' });
    expect(() => decodeJwtExp(token)).toThrow(/missing the exp claim/);
  });

  it('throws when the payload is not an object', () => {
    const token = makeJwt('a string' as unknown as Record<string, unknown>);
    expect(() => decodeJwtExp(token)).toThrow(/missing the exp claim/);
  });

  it('throws when exp is not a finite number', () => {
    const token = makeJwt({ exp: 'soon' as unknown as number });
    expect(() => decodeJwtExp(token)).toThrow(/finite number/);

    const infToken = makeJwt({ exp: Infinity as unknown as number });
    expect(() => decodeJwtExp(infToken)).toThrow(/finite number/);
  });
});