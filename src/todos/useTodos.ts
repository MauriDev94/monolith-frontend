import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createTodo, listTodos, type CreateTodoInput } from '@/api/todosApi';

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
