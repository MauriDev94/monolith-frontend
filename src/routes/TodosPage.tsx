import { useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/EmptyState';
import { Ornament } from '@/components/Ornament';
import { apiErrorMessage } from '@/api/apiErrors';
import { CreateTodoForm } from '@/todos/CreateTodoForm';
import { TodoCard } from '@/todos/TodoCard';
import { useTodos } from '@/todos/useTodos';

/**
 * `/todos` — the quest log (protected by `RequireAuth`).
 *
 * MVP scope (locked decision #11): list + create. The list is paginated
 * server-side; "Cargar más misiones" fetches the next page.
 */
export default function TodosPage() {
  const titleInputRef = useRef<HTMLInputElement>(null);
  const todos = useTodos();

  const pages = todos.data?.pages ?? [];
  const items = pages.flatMap((page) => page.todos);
  const total = pages[0]?.total ?? 0;

  return (
    <main className="container max-w-3xl px-4 py-10 sm:px-8 sm:py-12">
      <div className="space-y-8">
        <header className="space-y-3">
          <h1 className="text-3xl font-bold sm:text-4xl">Tus misiones</h1>
          <Ornament />
          <p className="text-muted-foreground" data-testid="todos-count">
            {todos.isSuccess ? questCount(total) : ' '}
          </p>
        </header>

        <CreateTodoForm ref={titleInputRef} />

        <section aria-label="Lista de misiones" className="space-y-4">
          {todos.isPending ? <ListSkeleton /> : null}

          {todos.isError ? (
            <div
              role="alert"
              className="flex flex-col items-center gap-3 rounded-lg border border-destructive/50 p-6 text-center"
            >
              <p className="text-sm">
                {apiErrorMessage(todos.error, 'No se pudieron cargar tus misiones.')}
              </p>
              <Button variant="outline" onClick={() => void todos.refetch()}>
                Reintentar
              </Button>
            </div>
          ) : null}

          {todos.isSuccess && items.length === 0 ? (
            <EmptyState
              heading="Tu bitácora está vacía"
              action={
                <Button variant="outline" onClick={() => titleInputRef.current?.focus()}>
                  Escribir mi primera misión
                </Button>
              }
            >
              Toda aventura empieza con una misión. Agrega la primera arriba.
            </EmptyState>
          ) : null}

          {items.length > 0 ? (
            <ul className="space-y-3" data-testid="todo-list">
              {items.map((todo) => (
                <TodoCard key={todo.id} todo={todo} />
              ))}
            </ul>
          ) : null}

          {todos.hasNextPage ? (
            <div className="flex justify-center">
              <Button
                variant="outline"
                onClick={() => void todos.fetchNextPage()}
                disabled={todos.isFetchingNextPage}
              >
                {todos.isFetchingNextPage ? 'Cargando...' : 'Cargar más misiones'}
              </Button>
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}

function questCount(total: number): string {
  if (total === 0) return 'Aún no tienes misiones.';
  return total === 1 ? '1 misión en tu bitácora' : `${total} misiones en tu bitácora`;
}

function ListSkeleton() {
  return (
    <div className="space-y-3" data-testid="todos-loading">
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-20 w-full" />
      ))}
    </div>
  );
}
