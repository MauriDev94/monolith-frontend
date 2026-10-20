import { CalendarDays, CheckCircle2, Circle } from 'lucide-react';
import { toast } from 'sonner';
import { apiErrorMessage } from '@/api/apiErrors';
import type { Todo } from '@/api/todosApi';
import { cn } from '@/lib/utils';
import { useToggleTodo } from '@/todos/useTodos';

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
 * One quest in the list. The seal on the left completes or reopens it
 * (ADR 0003); editing and deleting are still deferred (locked decision #11).
 */
export function TodoCard({ todo }: { todo: Todo }) {
  const toggle = useToggleTodo();
  const created = formatDate(todo.created_at);
  const due = formatDate(todo.due_date);
  const overdue =
    !todo.is_completed && todo.due_date !== null && new Date(todo.due_date).getTime() < Date.now();

  function handleToggle() {
    // aria-disabled instead of disabled: a disabled button drops keyboard
    // focus mid-request, so the guard lives here.
    if (toggle.isPending) return;
    const completing = !todo.is_completed;
    toggle.mutate(todo, {
      onSuccess: () => {
        if (completing) toast.success('¡Misión cumplida!');
      },
      onError: (err) => {
        toast.error(apiErrorMessage(err, 'No se pudo actualizar la misión. Inténtalo de nuevo.'));
      },
    });
  }

  return (
    <li
      data-testid="todo-card"
      // No opacity on completed cards: fading the whole card dropped the
      // secondary text to ~3.7:1 in the light theme. The title is muted
      // and struck through instead, which keeps every pair at 4.5:1.
      className="flex items-start gap-3 rounded-lg border bg-card p-4 sm:gap-4 sm:p-5"
    >
      {/* p-2/-m-2 keeps a 44 px touch target around the 28 px seal. */}
      <button
        type="button"
        role="checkbox"
        aria-checked={todo.is_completed}
        aria-disabled={toggle.isPending}
        aria-label={`Marcar como completada: ${todo.title}`}
        onClick={handleToggle}
        className={cn(
          '-m-2 shrink-0 rounded-full p-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          todo.is_completed ? 'text-primary' : 'text-muted-foreground hover:text-primary',
          toggle.isPending && 'cursor-wait',
        )}
      >
        {todo.is_completed ? (
          <CheckCircle2 className="h-7 w-7" aria-hidden="true" />
        ) : (
          <Circle className="h-7 w-7" aria-hidden="true" />
        )}
      </button>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex items-start justify-between gap-3">
          <h3
            className={cn(
              'font-sans text-lg font-medium leading-snug [overflow-wrap:anywhere]',
              todo.is_completed && 'text-muted-foreground line-through decoration-primary/60',
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
      </div>
    </li>
  );
}
