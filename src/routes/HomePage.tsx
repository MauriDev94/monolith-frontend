import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Ornament } from '@/components/Ornament';

/**
 * Public landing page mounted at `/`.
 *
 * Two CTAs so the auth surface is reachable from any entry point. No
 * authentication required.
 */
export default function HomePage() {
  return (
    <main className="container px-4 py-16 sm:px-8 sm:py-24">
      <div className="mx-auto flex max-w-2xl flex-col items-center gap-8 text-center">
        <div className="space-y-4">
          <p className="text-sm uppercase tracking-[0.2em] text-muted-foreground">Monolith</p>
          <h1 className="text-4xl font-bold leading-tight text-primary sm:text-5xl">
            Tu bitácora de misiones
          </h1>
          <Ornament />
          <p className="text-lg text-muted-foreground">
            Organiza tus tareas en un solo lugar. Inicia sesión o crea una cuenta para empezar tu
            aventura.
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-3">
          <Button asChild size="lg">
            <Link to="/login">Iniciar sesión</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link to="/register">Crear cuenta</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
