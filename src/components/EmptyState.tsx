import type { ReactNode } from 'react';

/**
 * Empty-state placeholder.
 *
 * PR4 (todos list + create) replaces this with the real CTA: a "Crear mi primer todo"
 * button that focuses/scrolls to `<CreateTodoForm />`. The current shape
 * keeps every call site working with just heading + body.
 */
export function EmptyState({ heading, children }: { heading: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-12 text-center">
      <h2 className="text-lg font-semibold">{heading}</h2>
      {children ? <div className="text-sm text-muted-foreground">{children}</div> : null}
    </div>
  );
}