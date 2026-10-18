import { Link } from 'react-router-dom';

/**
 * Public landing page mounted at `/`.
 *
 * Two CTAs so the auth surface is reachable from any entry point. No
 * authentication required.
 */
export default function HomePage() {
  return (
    <main className="container py-12">
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold">Monolith</h1>
          <p className="text-sm text-muted-foreground">
            Organiza tus tareas en un solo lugar. Inicia sesión o crea una cuenta para empezar.
          </p>
        </div>
        <div className="flex gap-3">
          <Link
            to="/login"
            className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Iniciar sesión
          </Link>
          <Link
            to="/register"
            className="inline-flex h-10 items-center rounded-md border bg-background px-4 text-sm font-medium hover:bg-accent"
          >
            Crear cuenta
          </Link>
        </div>
      </div>
    </main>
  );
}
