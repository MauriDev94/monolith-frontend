import { createBrowserRouter, Outlet, RouterProvider } from 'react-router-dom';
import { AuthProvider } from '@/auth/AuthProvider';
import LoginPage from '@/routes/LoginPage';
import RegisterPage from '@/routes/RegisterPage';
import HomePage from '@/routes/HomePage';
import NotFoundPage from '@/routes/NotFoundPage';
import TodosPage from '@/routes/TodosPage';
import { RequireAuth } from '@/auth/RequireAuth';
import { Navbar } from '@/components/Navbar';

/**
 * Route table.
 *
 * `<AuthProvider>` is mounted by the root layout route (`AuthLayout`) so it
 * lives inside `<RouterProvider>`'s subtree. The layout also renders the
 * `<Navbar />` once for every page, inside the provider because it reads
 * `useAuth()`. `AuthProvider` calls
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
        children: [{ path: '/todos', element: <TodosPage /> }],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);

function AuthLayout() {
  return (
    <AuthProvider>
      <Navbar />
      <Outlet />
    </AuthProvider>
  );
}

export function Router() {
  return <RouterProvider router={router} />;
}
