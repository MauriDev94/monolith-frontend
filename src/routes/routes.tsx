import { createBrowserRouter, Outlet, RouterProvider } from 'react-router-dom';
import { AuthProvider } from '@/auth/AuthProvider';
import LoginPage from '@/routes/LoginPage';
import RegisterPage from '@/routes/RegisterPage';
import HomePage from '@/routes/HomePage';
import NotFoundPage from '@/routes/NotFoundPage';
import { RequireAuth } from '@/auth/RequireAuth';

/**
 * Route table.
 *
 * `<AuthProvider>` is mounted by the root layout route (`AuthLayout`) so it
 * lives inside `<RouterProvider>`'s subtree. `AuthProvider` calls
 * `useNavigate` for post-login navigation, post-logout navigation, and the
 * `'unauthorized'` event listener, and React Router only allows that hook
 * inside the router; wrapping `<RouterProvider>` from the outside throws at
 * runtime and leaves a blank page.
 *
 * Public routes (`/`, `/login`, `/register`) render outside `<RequireAuth>`.
 * Protected routes (`/todos`, future `/profile`, etc.) are children of the
 * `<RequireAuth />` layout route.
 */
const router = createBrowserRouter([
  {
    element: <AuthLayout />,
    children: [
      { path: '/', element: <HomePage /> },
      { path: '/login', element: <LoginPage /> },
      { path: '/register', element: <RegisterPage /> },
      {
        element: <RequireAuth />,
        children: [{ path: '/todos', element: <RequireAuthPlaceholder /> }],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);

function AuthLayout() {
  return (
    <AuthProvider>
      <Outlet />
    </AuthProvider>
  );
}

function RequireAuthPlaceholder() {
  return (
    <main className="container py-12">
      <h1 className="text-2xl font-bold">Todos</h1>
      <p className="mt-2 text-sm text-muted-foreground">Todos page lands in PR4.</p>
    </main>
  );
}

export function Router() {
  return <RouterProvider router={router} />;
}
