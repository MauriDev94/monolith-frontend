/**
 * Decorative divider from the Grimorio theme (ADR 0001): two hairlines
 * around a gold diamond. Purely visual, hidden from assistive tech.
 */
export function Ornament() {
  return (
    <div className="flex items-center justify-center gap-3" aria-hidden="true">
      <span className="h-px w-16 bg-primary/40" />
      <span className="h-2 w-2 rotate-45 bg-primary" />
      <span className="h-px w-16 bg-primary/40" />
    </div>
  );
}
