import { Link, useSearchParams } from 'react-router-dom';
import { LoginForm } from '@/auth/LoginForm';
import { Ornament } from '@/components/Ornament';

/**
 * `/login` page.
 *
 * Reads `?from=<path>` via `useSearchParams` and forwards it to `LoginForm`
 * so post-login navigation honors the original target. When `from` is
 * absent, `AuthProvider` falls back to `/todos`.
 *
 * The cross-link to `/register` is rendered below the form so users who
 * landed here by mistake can pivot without using the navbar.
 */
export default function LoginPage() {
  const [searchParams] = useSearchParams();
  const from = searchParams.get('from') ?? undefined;

  return (
    <main className="container flex min-h-[calc(100vh-3.5rem)] items-center justify-center px-4 py-12 sm:px-8">
      <div className="w-full max-w-sm space-y-6 rounded-lg border bg-card p-6 shadow-lg shadow-black/20 sm:p-8">
        <div className="space-y-3 text-center">
          <h1 className="text-2xl font-bold">Iniciar sesión</h1>
          <Ornament />
          <p className="text-muted-foreground">Ingresa para continuar tu aventura.</p>
        </div>
        <LoginForm from={from} />
        <p className="text-center text-sm text-muted-foreground">
          ¿No tienes cuenta?{' '}
          <Link
            to="/register"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Regístrate
          </Link>
        </p>
      </div>
    </main>
  );
}
