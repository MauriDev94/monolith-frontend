import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
} from '@tanstack/react-query';
import {
  createTodo,
  listTodos,
  updateTodo,
  type CreateTodoInput,
  type Todo,
  type TodosPage,
} from '@/api/todosApi';

export const TODOS_PAGE_SIZE = 20;
export const todosQueryKey = ['todos'] as const;

/**
 * Paginated quest list. Each page is one `GET /v1/todos?limit&offset`;
 * `fetchNextPage` loads the next block until `offset + loaded >= total`.
 */
export function useTodos() {
  return useInfiniteQuery({
    queryKey: todosQueryKey,
    queryFn: ({ pageParam }) => listTodos({ limit: TODOS_PAGE_SIZE, offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => {
      const next = lastPage.offset + lastPage.todos.length;
      return next < lastPage.total ? next : undefined;
    },
  });
}

/**
 * Creates a quest and refetches the list so totals and pagination stay in
 * sync with the server (it orders by `created_at`, so the new quest lands
 * on the last page).
 */
export function useCreateTodo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTodoInput) => createTodo(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: todosQueryKey }),
  });
}

/**
 * Completes a pending quest or reopens a completed one (ADR 0003).
 *
 * Optimistic: the card flips at once and the server's copy replaces it on
 * success. On failure only this quest is rolled back, not a snapshot of the
 * whole list, so toggling two quests quickly cannot undo the other one; the
 * list is then refetched in case the quest changed or vanished server-side.
 *
 * `onMutate` cancels in-flight list fetches so a stale response cannot
 * overwrite the optimistic flip. That would also kill the refetch a create
 * just started (the new quest would not show up until some later refetch), so
 * when a fetch was in flight the list is invalidated again once the toggle
 * settles.
 *
 * Accepted narrow race: if a second toggle starts while that invalidation's
 * refetch is in flight, the refetch can briefly overwrite the second quest's
 * optimistic flip until its own `onSuccess` lands. Not worth extra machinery.
 */
export function useToggleTodo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (todo: Todo) =>
      updateTodo(todo.id, {
        title: todo.title,
        description: todo.description,
        is_completed: !todo.is_completed,
        due_date: todo.due_date,
      }),
    onMutate: async (todo) => {
      // Read before cancelling: afterwards nothing is fetching any more.
      const listWasFetching = queryClient.isFetching({ queryKey: todosQueryKey }) > 0;
      await queryClient.cancelQueries({ queryKey: todosQueryKey });
      replaceTodo(queryClient, { ...todo, is_completed: !todo.is_completed });
      return { listWasFetching };
    },
    onSuccess: (saved) => replaceTodo(queryClient, saved),
    // Restart the fetch the cancel dropped. On error `onError` already
    // invalidates, so this covers only the success path.
    onSettled: (_saved, err, _todo, context) => {
      if (err === null && context?.listWasFetching) {
        void queryClient.invalidateQueries({ queryKey: todosQueryKey });
      }
    },
    onError: (_err, todo) => {
      replaceTodo(queryClient, todo);
      void queryClient.invalidateQueries({ queryKey: todosQueryKey });
    },
  });
}

function replaceTodo(queryClient: QueryClient, next: Todo) {
  queryClient.setQueryData<InfiniteData<TodosPage>>(todosQueryKey, (data) =>
    data
      ? {
          ...data,
          pages: data.pages.map((page) => ({
            ...page,
            todos: page.todos.map((todo) => (todo.id === next.id ? next : todo)),
          })),
        }
      : data,
  );
}
