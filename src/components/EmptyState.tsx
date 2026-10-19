import type { ReactNode } from 'react';

/**
 * Empty-state panel: heading, optional body and an optional call to action
 * (e.g. the todos page's "Escribir mi primera misión" button).
 */
export function EmptyState({
  heading,
  children,
  action,
}: {
  heading: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-input p-12 text-center">
      <h2 className="text-lg font-semibold">{heading}</h2>
      {children ? <div className="text-sm text-muted-foreground">{children}</div> : null}
      {action ? <div className="pt-2">{action}</div> : null}
    </div>
  );
}
