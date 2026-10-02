import { Link } from 'react-router-dom';

/**
 * Catch-all 404 page. Public route — no auth check.
 */
export default function NotFoundPage() {
  return (
    <main className="container flex flex-col items-start gap-4 py-12">
      <h1 className="text-3xl font-bold">404</h1>
      <p className="text-sm text-muted-foreground">This page does not exist.</p>
      <Link to="/" className="text-sm text-primary underline">
        Go home
      </Link>
    </main>
  );
}