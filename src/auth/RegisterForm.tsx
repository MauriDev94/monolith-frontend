import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { registerSchema, type RegisterValues } from '@/auth/schemas';
import { useAuth } from '@/auth/useAuth';

/**
 * Register form.
 *
 * Renders five labeled fields (name, lastname, email, password, birthdate)
 * wired to `useAuth().register()`. Schema-validated via Zod, including the
 * password complexity rules (≥8 chars + at least one letter + at least one
 * digit) and the ISO `YYYY-MM-DD` birthdate shape that the Python backend
 * parses via `datetime.fromisoformat`.
 *
 * The `from` prop is the URL to navigate to after the auto-login that
 * `AuthProvider.register()` performs (register returns no tokens, so the
 * provider bootstraps a session via `login(values, from)` immediately).
 *
 * The browser emits ISO dates natively for `type="date"` inputs, so the
 * schema's strict regex matches without any client-side munging.
 */
export function RegisterForm({ from }: { from?: string }) {
  const { register } = useAuth();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const form = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      name: '',
      lastname: '',
      email: '',
      password: '',
      birthdate: '',
    },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    setSubmitError(null);
    try {
      await register(values, from);
    } catch (err) {
      // 409 (email already registered) is a normal failure — surface inline.
      // 500 / network errors also surface inline.
      setSubmitError(
        err instanceof Error ? err.message : 'No se pudo crear la cuenta',
      );
    }
  });

  return (
    <Form {...form}>
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nombre</FormLabel>
                <FormControl>
                  <Input autoComplete="given-name" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="lastname"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Apellido</FormLabel>
                <FormControl>
                  <Input autoComplete="family-name" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input
                  type="email"
                  autoComplete="email"
                  placeholder="tu@email.com"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Contraseña</FormLabel>
              <FormControl>
                <Input
                  type="password"
                  autoComplete="new-password"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="birthdate"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Fecha de nacimiento</FormLabel>
              <FormControl>
                <Input type="date" autoComplete="bday" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        {submitError ? (
          <p
            role="alert"
            data-testid="register-submit-error"
            className="text-sm font-medium text-destructive"
          >
            {submitError}
          </p>
        ) : null}
        <Button
          type="submit"
          disabled={form.formState.isSubmitting}
          className="w-full"
        >
          {form.formState.isSubmitting ? 'Creando cuenta...' : 'Crear cuenta'}
        </Button>
      </form>
    </Form>
  );
}