import { Toaster } from '@/components/ui/sonner';
import { Router } from '@/routes/routes';

/**
 * App shell. Mounts Sonner's `<Toaster />` once and the React Router.
 *
 * PR3 (auth wiring) will wrap this in `<QueryClientProvider>` + `<AuthProvider>`
 * and replace the placeholder RequireAuth skeleton with the real redirect logic.
 */
export default function App() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Router />
      <Toaster richColors position="top-right" />
    </div>
  );
}