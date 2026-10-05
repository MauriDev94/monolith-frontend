import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/api/queryClient';
import { Router } from '@/routes/routes';
import { Toaster } from '@/components/ui/sonner';

/**
 * App shell.
 *
 * Provider order:
 *
 *  1. `QueryClientProvider` — TanStack Query is shared across all routes.
 *     Mounted first so any child can call `useQuery`.
 *  2. `<Router />` — exports the data-router-driven `RouterProvider`.
 *     Internally it wraps `<AuthProvider>` around `<RouterProvider>` because
 *     `AuthProvider` calls `useNavigate` (post-login / post-logout / on the
 *     `'unauthorized'` event) and React Router requires that hook to live
 *     inside `<RouterProvider>`'s subtree.
 *  3. `<Toaster />` — leaf component.
 *
 * If a future refactor splits `AuthProvider` away from the router, the
 * `useNavigate` calls inside `AuthProvider` will throw and that will be the
 * signal to re-co-locate them.
 */
export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router />
      <Toaster richColors position="top-right" />
    </QueryClientProvider>
  );
}