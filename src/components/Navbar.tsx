import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/auth/useAuth';

/**
 * Top navigation bar.
 *
 * Auth-aware: three branches on `useAuth().status`.
 *
 *  - `loading` — render a neutral skeleton in the right slot. The `AuthProvider`
 *    is still probing `GET /auth/v1/me`; showing real auth controls here would
 *    flicker between unauthenticated and authenticated on hard reload.
 *  - `authenticated` — render the user's email (truncated to 24 chars if
 *    longer) plus an inline `<LogoutButton />` that calls `useAuth().logout()`.
 *  - `unauthenticated` — render two `<Link>` components: one to `/login` and
 *    one to `/register`.
 *
 * The logo always links to `/`, which is the public `HomePage` mounted in
 * PR3b2a.
 */
export function Navbar({ slot }: { slot?: ReactNode }) {
  const { user, status, logout } = useAuth();

  return (
    <nav className="border-b bg-background">
      <div className="container flex h-14 items-center justify-between">
        <Link to="/" className="text-base font-semibold">
          Monolith
        </Link>
        <div className="flex items-center gap-2" data-testid="navbar-slot">
          {slot}
          {status === 'loading' ? (
            <Skeleton
              className="h-9 w-24"
              data-testid="navbar-loading-skeleton"
            />
          ) : null}
          {status === 'authenticated' && user ? (
            <>
              <span
                className="hidden text-sm text-muted-foreground sm:inline"
                data-testid="navbar-user-email"
              >
                {truncate(user.email, 24)}
              </span>
              <LogoutButton onLogout={logout} />
            </>
          ) : null}
          {status === 'unauthenticated' ? (
            <>
              <Button asChild variant="ghost" size="sm">
                <Link to="/login" data-testid="navbar-login-link">
                  Iniciar sesión
                </Link>
              </Button>
              <Button asChild size="sm">
                <Link to="/register" data-testid="navbar-register-link">
                  Crear cuenta
                </Link>
              </Button>
            </>
          ) : null}
        </div>
      </div>
    </nav>
  );
}

/**
 * Inline logout button. Kept in the same file because it is 12 lines of code
 * and only the Navbar needs it. If a future PR adds a separate
 * `<LogoutButton />` on a settings page, extract then.
 */
function LogoutButton({ onLogout }: { onLogout: () => Promise<void> }) {
  const navigate = useNavigate();
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      data-testid="navbar-logout-button"
      onClick={() => {
        void onLogout().then(() => {
          // AuthProvider already navigates to /login on logout, but
          // `then` here gives us a deterministic re-render after the
          // cleanup runs. No-op when the provider's navigation wins.
          if (window.location.pathname !== '/login') {
            navigate('/login', { replace: true });
          }
        });
      }}
    >
      Cerrar sesión
    </Button>
  );
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}