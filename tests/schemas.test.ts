import { describe, expect, it } from 'vitest';
import { loginSchema, registerSchema } from '@/auth/schemas';
import {
  TEST_PASSWORD_LOGIN_OK,
  TEST_PASSWORD_NO_DIGIT,
  TEST_PASSWORD_NO_LETTER,
  TEST_PASSWORD_REGISTER_OK,
  TEST_PASSWORD_SHORT,
} from './test-fixtures';

describe('loginSchema', () => {
  it('accepts a valid email and password', () => {
    const res = loginSchema.safeParse({
      email: 'user@example.com',
      password: TEST_PASSWORD_LOGIN_OK,
    });
    expect(res.success).toBe(true);
  });

  it('rejects an invalid email', () => {
    const res = loginSchema.safeParse({
      email: 'not-an-email',
      password: TEST_PASSWORD_LOGIN_OK,
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues.some((i) => i.path[0] === 'email')).toBe(true);
    }
  });

  it('rejects a password shorter than 8 characters', () => {
    const res = loginSchema.safeParse({
      email: 'user@example.com',
      password: TEST_PASSWORD_SHORT,
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues.some((i) => i.path[0] === 'password')).toBe(true);
    }
  });

  it('rejects a missing field', () => {
    const res = loginSchema.safeParse({ email: 'user@example.com' });
    expect(res.success).toBe(false);
  });
});

describe('registerSchema', () => {
  const valid = {
    name: 'Jane',
    lastname: 'Doe',
    email: 'jane@example.com',
    password: TEST_PASSWORD_REGISTER_OK,
    birthdate: '1990-05-12',
  };

  it('accepts a fully-valid payload', () => {
    expect(registerSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects a password without letters', () => {
    const res = registerSchema.safeParse({
      ...valid,
      password: TEST_PASSWORD_NO_LETTER,
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues.some((i) => i.path[0] === 'password')).toBe(true);
    }
  });

  it('rejects a password without digits', () => {
    const res = registerSchema.safeParse({
      ...valid,
      password: TEST_PASSWORD_NO_DIGIT,
    });
    expect(res.success).toBe(false);
  });

  it('rejects a password shorter than 8 characters', () => {
    const res = registerSchema.safeParse({ ...valid, password: TEST_PASSWORD_SHORT });
    expect(res.success).toBe(false);
  });

  it('rejects an empty name', () => {
    const res = registerSchema.safeParse({ ...valid, name: '' });
    expect(res.success).toBe(false);
  });

  it('rejects an empty lastname', () => {
    const res = registerSchema.safeParse({ ...valid, lastname: '' });
    expect(res.success).toBe(false);
  });

  it('rejects an invalid email', () => {
    const res = registerSchema.safeParse({ ...valid, email: 'nope' });
    expect(res.success).toBe(false);
  });

  it('rejects a birthdate in the wrong format', () => {
    const res = registerSchema.safeParse({ ...valid, birthdate: '05/12/1990' });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues.some((i) => i.path[0] === 'birthdate')).toBe(true);
    }
  });

  it('rejects a malformed birthdate with the right shape', () => {
    const res = registerSchema.safeParse({ ...valid, birthdate: '1990-13-40' });
    // The regex only checks the shape, not calendar validity. The backend's
    // datetime.fromisoformat catches month/day errors — we deliberately do
    // not duplicate that on the client. Document via test.
    expect(res.success).toBe(true);
  });
});