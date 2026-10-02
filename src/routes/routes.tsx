import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import LoginPage from '@/routes/LoginPage';
import RegisterPage from '@/routes/RegisterPage';
import NotFoundPage from '@/routes/NotFoundPage';
import { RequireAuth } from '@/auth/RequireAuth';

/**
 * Placeholder route table. The real `TodosPage` (PR4) replaces the `element`
 * under `<RequireAuth />`.
 */
const router = createBrowserRouter([
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

export function Router() {
  return <RouterProvider router={router} />;
}