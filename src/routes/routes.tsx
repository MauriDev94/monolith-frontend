import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { AuthProvider } from '@/auth/AuthProvider';
import LoginPage from '@/routes/LoginPage';
import RegisterPage from '@/routes/RegisterPage';
import NotFoundPage from '@/routes/NotFoundPage';
import { RequireAuth } from '@/auth/RequireAuth';

/**
 * Route table.
 *
 * `<AuthProvider>` wraps `<RouterProvider>` because `AuthProvider` calls
 * `useNavigate` for post-login navigation, post-logout navigation, and the
 * `'unauthorized'` event listener. React Router requires that hook to live
 * inside `<RouterProvider>`'s subtree; placing `AuthProvider` above the
 * router would break `useNavigate` and throw at runtime.
 *
 * Public routes (`/`, `/login`, `/register`) render outside `<RequireAuth>`.
 * Protected routes (`/todos`, future `/profile`, etc.) are children of the
 * `<RequireAuth />` layout route.
 */
const router = createBrowserRouter([
  { path: '/', element: <HomePage /> },
  { path: '/login', element: <LoginPage /> },
  { path: '/register', element: <RegisterPage /> },
  {
    element: <RequireAuth />,
    children: [{ path: '/todos', element: <RequireAuthPlaceholder /> }],
  },
  { path: '*', element: <NotFoundPage /> },
]);

function RequireAuthPlaceholder() {
  return (
    <main className="container py-12">
      <h1 className="text-2xl font-bold">Todos</h1>
      <p className="mt-2 text-sm text-muted-foreground">Todos page lands in PR4.</p>
    </main>
  );
}

/**
 * Public landing page.
 *
 * Mounted at `/` so `<Navbar>`'s logo `<Link to="/">` does not 404. Renders
 * a centered welcome card with two CTAs to the auth surface. No
 * authentication required.
 */
function HomePage() {
  return (
    <main className="container py-12">
      <h1 className="text-2xl font-bold">Monolith</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Welcome to the Monolith frontend. Pick an action to get started.
      </p>
      <div className="mt-6 flex gap-3">
        <a
          href="/login"
          className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Log in
        </a>
        <a
          href="/register"
          className="inline-flex h-10 items-center rounded-md border bg-background px-4 text-sm font-medium hover:bg-accent"
        >
          Create account
        </a>
      </div>
    </main>
  );
}

export function Router() {
  return (
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  );
}