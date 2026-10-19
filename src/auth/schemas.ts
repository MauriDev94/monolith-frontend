import { z } from 'zod';

/**
 * Zod schemas for the auth forms.
 *
 * Field rules mirror the backend validators at
 * `app/features/auth/presentation/schemas/auth_requests.py:9-17`:
 *
 *   - email: must be a syntactically valid email.
 *   - password (login): minimum 8 characters (server-side check is also
 *     `min_length=8`).
 *   - password (register): min 8 chars AND contains at least one letter AND
 *     at least one digit. The regex test mirrors the Python validator
 *     exactly so client-side and server-side rules agree.
 *   - birthdate: ISO date `YYYY-MM-DD`. The backend parses it via
 *     `datetime.fromisoformat` which accepts only this format.
 *
 * These schemas are imported by the React Hook Form forms (`LoginForm`, `RegisterForm`)
 * via `@hookform/resolvers/zod`. Keep them dependency-free of UI code so
 * they can be unit-tested in isolation.
 */

export const loginSchema = z.object({
  email: z.string().email({ message: 'Email inválido' }),
  password: z.string().min(8, { message: 'La contraseña debe tener al menos 8 caracteres' }),
});

export type LoginValues = z.infer<typeof loginSchema>;

// Password rules — factored so registerSchema's messages stay readable.
const passwordWithComplexity = z
  .string()
  .min(8, { message: 'La contraseña debe tener al menos 8 caracteres' })
  .regex(/[a-zA-Z]/, { message: 'Debe contener al menos una letra' })
  .regex(/[0-9]/, { message: 'Debe contener al menos un número' });

export const registerSchema = z.object({
  name: z.string().min(1, { message: 'El nombre es obligatorio' }),
  lastname: z.string().min(1, { message: 'El apellido es obligatorio' }),
  email: z.string().email({ message: 'Email inválido' }),
  password: passwordWithComplexity,
  // YYYY-MM-DD; backend uses datetime.fromisoformat which only accepts this.
  birthdate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'Fecha inválida (formato YYYY-MM-DD)',
  }),
});

export type RegisterValues = z.infer<typeof registerSchema>;
