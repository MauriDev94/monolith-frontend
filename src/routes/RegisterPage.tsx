import { Link, useSearchParams } from 'react-router-dom';
import { RegisterForm } from '@/auth/RegisterForm';
import { Ornament } from '@/components/Ornament';

/**
 * `/register` page.
 *
 * Reads `?from=<path>` via `useSearchParams` and forwards it to
 * `RegisterForm`. After a successful registration, `AuthProvider.register`
 * bootstraps a session via `login(values, from)` and navigates to `from ??
 * '/todos'`.
 *
 * The cross-link to `/login` is rendered below the form so users who
 * already have an account can pivot without using the navbar.
 */
export default function RegisterPage() {
  const [searchParams] = useSearchParams();
  const from = searchParams.get('from') ?? undefined;

  return (
    <main className="container flex min-h-[calc(100vh-3.5rem)] items-center justify-center px-4 py-12 sm:px-8">
      <div className="w-full max-w-md space-y-6 rounded-lg border bg-card p-6 shadow-lg shadow-black/20 sm:p-8">
        <div className="space-y-3 text-center">
          <h1 className="text-2xl font-bold">Crear cuenta</h1>
          <Ornament />
          <p className="text-muted-foreground">Empieza tu bitácora de misiones en segundos.</p>
        </div>
        <RegisterForm from={from} />
        <p className="text-center text-sm text-muted-foreground">
          ¿Ya tienes cuenta?{' '}
          <Link to="/login" className="font-medium text-primary underline-offset-4 hover:underline">
            Inicia sesión
          </Link>
        </p>
      </div>
    </main>
  );
}
