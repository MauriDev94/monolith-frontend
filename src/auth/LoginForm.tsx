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
import { authErrorMessage } from '@/auth/authErrors';
import { loginSchema, type LoginValues } from '@/auth/schemas';
import { useAuth } from '@/auth/useAuth';

/**
 * Login form.
 *
 * Renders two labeled fields (email, password) wired to `useAuth().login()`.
 * Schema-validated via `@hookform/resolvers/zod`. The 401 toast for invalid
 * credentials is fired inside `AuthProvider` so this component does not
 * need to render its own toast for that case. Non-401 failures (network
 * errors, 429, 500s) re-throw so the form can stop its submit spinner and
 * show Spanish copy from `authErrorMessage` inline.
 *
 * The `from` prop is the URL to navigate to after a successful login. The
 * page (`LoginPage.tsx`) reads it from `useSearchParams().get('from')` and
 * passes it down. When `from` is absent the `AuthProvider` falls back to
 * `/todos`.
 */
export function LoginForm({ from }: { from?: string }) {
  const { login } = useAuth();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    setSubmitError(null);
    try {
      await login(values, from);
    } catch (err) {
      // 401 is already toasted by AuthProvider (null here); anything else
      // surfaces inline in Spanish.
      setSubmitError(authErrorMessage(err, 'login'));
    }
  });

  return (
    <Form {...form}>
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input type="email" autoComplete="email" placeholder="tu@email.com" {...field} />
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
                <Input type="password" autoComplete="current-password" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        {submitError ? (
          <p
            role="alert"
            data-testid="login-submit-error"
            className="text-sm font-medium text-destructive"
          >
            {submitError}
          </p>
        ) : null}
        <Button type="submit" disabled={form.formState.isSubmitting} className="w-full">
          {form.formState.isSubmitting ? 'Ingresando...' : 'Ingresar'}
        </Button>
      </form>
    </Form>
  );
}
