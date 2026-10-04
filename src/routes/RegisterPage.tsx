/**
 * PR2 placeholder. The real page renders `<RegisterForm />` (RHF + Zod + shadcn Form)
 * wired to `useAuth().register()` and reads `from` from the query string.
 * Lands in PR3 (FE-2-009).
 */
export default function RegisterPage() {
  return (
    <main className="container py-12">
      <h1 className="text-2xl font-bold">Register</h1>
      <p className="mt-2 text-sm text-muted-foreground">Register form lands in PR3.</p>
    </main>
  );
}