import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/auth/useAuth';
import { FullPageSkeleton } from '@/components/FullPageSkeleton';

/**
 * Layout route that gates a tree of protected routes.
 *
 * Three states, evaluated in this order:
 *
 *  1. `status === 'loading'` → render `<FullPageSkeleton />`. The
 *     `AuthProvider` is still probing `GET /auth/v1/me`; redirecting now
 *     would cause a `/login` flash on a hard reload with a valid cookie.
 *  2. `!user` → redirect to `/login?from=${location.pathname}` with
 *     `replace` so the protected URL does not pollute history. The `from`
 *     param is consumed by `LoginPage` to send the user back after a
 *     successful login (see `spec frontend-auth > Protected Routes
 *     Redirect > Unauthenticated access to /todos`).
 *  3. Otherwise → render `<Outlet />` so the matched child route renders.
 *
 * Mounted as a layout route (parent with no `path`, only `element`) in
 * `src/routes/routes.tsx` so any child path is gated by the same logic.
 */
export function RequireAuth() {
  const { user, status } = useAuth();
  const location = useLocation();

  if (status === 'loading') {
    return <FullPageSkeleton />;
  }

  if (!user) {
    return (
      <Navigate to={`/login?from=${location.pathname}`} replace />
    );
  }

  return <Outlet />;
}