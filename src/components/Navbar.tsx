import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

/**
 * Top navigation bar.
 *
 * Renders the app name and a right-aligned slot reserved for auth-aware
 * actions. The real `<LogoutButton />` slot is wired in PR4 (FE-3-005).
 */
export function Navbar({ slot }: { slot?: ReactNode }) {
  return (
    <nav className="border-b bg-background">
      <div className="container flex h-14 items-center justify-between">
        <Link to="/" className="text-base font-semibold">
          Monolith
        </Link>
        <div className="flex items-center gap-2">{slot}</div>
      </div>
    </nav>
  );
}