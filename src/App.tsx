import { Toaster } from '@/components/ui/sonner';

/**
 * App shell. Mounts Sonner's `<Toaster />` once and renders a placeholder.
 *
 * PR3 (auth wiring) will wrap this in `<QueryClientProvider>` + `<AuthProvider>`
 * and replace the placeholder with the React Router outlet.
 */
export default function App() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b p-4">
        <h1 className="text-xl font-semibold">Monolith Frontend</h1>
        <p className="text-sm text-muted-foreground">Scaffold OK — auth lands in PR3.</p>
      </header>
      <main className="container py-8">
        <p className="text-sm">
          Routes, AuthProvider, and Sonner toasts will land in PR3 (auth) and PR4 (todos).
        </p>
      </main>
      <Toaster richColors position="top-right" />
    </div>
  );
}