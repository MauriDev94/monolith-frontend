import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Ornament } from '@/components/Ornament';

/**
 * Catch-all 404 page. Public route — no auth check.
 */
export default function NotFoundPage() {
  return (
    <main className="container px-4 py-16 sm:px-8 sm:py-24">
      <div className="mx-auto flex max-w-xl flex-col items-center gap-6 text-center">
        <p className="font-display text-6xl font-bold text-primary">404</p>
        <h1 className="text-2xl font-bold">Te perdiste en la mazmorra</h1>
        <Ornament />
        <p className="text-muted-foreground">Esta página no existe o cambió de lugar.</p>
        <Button asChild variant="outline">
          <Link to="/">Volver al inicio</Link>
        </Button>
      </div>
    </main>
  );
}
