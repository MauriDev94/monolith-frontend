/**
 * PR2 placeholder. The real page renders `<LoginForm />` (RHF + Zod + shadcn Form)
 * wired to `useAuth().login()` and reads `from` from the query string.
 * Lands in PR3 (FE-2-009).
 */
export default function LoginPage() {
  return (
    <main className="container py-12">
      <h1 className="text-2xl font-bold">Login</h1>
      <p className="mt-2 text-sm text-muted-foreground">Login form lands in PR3.</p>
    </main>
  );
}