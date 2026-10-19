import { CalendarDays, CheckCircle2 } from 'lucide-react';
import type { Todo } from '@/api/todosApi';
import { cn } from '@/lib/utils';

const dateFormat = new Intl.DateTimeFormat('es', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : dateFormat.format(date);
}

/**
 * One quest in the list. Read-only for now: completing, editing and
 * deleting are deferred (locked decision #11, see docs/roadmap.md).
 */
export function TodoCard({ todo }: { todo: Todo }) {
  const created = formatDate(todo.created_at);
  const due = formatDate(todo.due_date);
  const overdue =
    !todo.is_completed && todo.due_date !== null && new Date(todo.due_date).getTime() < Date.now();

  return (
    <li
      data-testid="todo-card"
      className={cn(
        'flex flex-col gap-2 rounded-lg border bg-card p-4 sm:p-5',
        todo.is_completed && 'opacity-75',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <h3
          className={cn(
            'font-sans text-lg font-medium leading-snug [overflow-wrap:anywhere]',
            todo.is_completed && 'line-through decoration-primary/60',
          )}
        >
          {todo.title}
        </h3>
        {todo.is_completed ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-primary/50 px-2 py-0.5 text-xs font-bold text-primary">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
            Completada
          </span>
        ) : null}
      </div>
      {todo.description ? (
        <p className="whitespace-pre-line text-sm text-muted-foreground [overflow-wrap:anywhere]">
          {todo.description}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
        {created ? <span>Creada el {created}</span> : null}
        {due ? (
          <span
            className={cn('inline-flex items-center gap-1', overdue && 'font-medium text-wine')}
          >
            <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
            {overdue ? `Venció el ${due}` : `Vence el ${due}`}
          </span>
        ) : null}
      </div>
    </li>
  );
}
