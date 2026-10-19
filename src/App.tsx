import { QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import { queryClient } from '@/api/queryClient';
import { Router } from '@/routes/routes';
import { Toaster } from '@/components/ui/sonner';

/**
 * App shell.
 *
 * Provider order:
 *
 *  1. `ThemeProvider` (next-themes) — toggles the `.dark` class on `<html>`.
 *     Dark is the default and the OS preference is ignored on purpose (ADR
 *     0001); the choice persists in localStorage under `monolith-theme`.
 *     Outermost because it has no router dependency and both the navbar's
 *     `ThemeToggle` and the `Toaster` read it.
 *  2. `QueryClientProvider` — TanStack Query is shared across all routes.
 *     Mounted first so any child can call `useQuery`.
 *  3. `<Router />` — exports the data-router-driven `RouterProvider`.
 *     `<AuthProvider>` is mounted by its root layout route, inside
 *     `<RouterProvider>`, because `AuthProvider` calls `useNavigate`
 *     (post-login / post-logout / on the `'unauthorized'` event) and React
 *     Router requires that hook to live inside the router's subtree.
 *  4. `<Toaster />` — leaf component.
 *
 * If a future refactor splits `AuthProvider` away from the router, the
 * `useNavigate` calls inside `AuthProvider` will throw and that will be the
 * signal to re-co-locate them.
 */
export default function App() {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem={false}
      storageKey="monolith-theme"
      disableTransitionOnChange
    >
      <QueryClientProvider client={queryClient}>
        <Router />
        <Toaster richColors position="top-right" />
      </QueryClientProvider>
    </ThemeProvider>
  );
}
