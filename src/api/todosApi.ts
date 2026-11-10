import { axiosClient } from '@/api/axiosClient';
import type { components } from '@/api/schema';

/**
 * Typed wrappers around the todos endpoints (`/v1/todos`).
 *
 * Types are aliased from the generated schema (`schema.d.ts`, locked
 * decision #2); never hand-write them here.
 *
 * Datetimes are ISO 8601 strings with a UTC offset. The list is ordered by
 * `created_at` ascending (oldest first) and paginated with `limit`/`offset`
 * (`limit` 1–100, default 20).
 */

type Schemas = components['schemas'];

export type Todo = Schemas['TodoResponse'];

export type TodosPage = Schemas['GetTodosResponse'];

/** `due_date` is an ISO 8601 datetime; the backend rejects dates in the past (400). */
export type CreateTodoInput = Schemas['CreateTodoRequest'];

/**
 * Body of `PUT /v1/todos/{id}`. It is a full replace, not a patch: the
 * backend's `UpdateTodoRequest` defaults `description` and `due_date` to
 * null, so leaving them out would clear them. The generated type marks them
 * optional, so `Required` restores the "send every field" guarantee.
 *
 * `due_date`: resend the string the API returned, untouched. The backend
 * skips its "not in the past" rule only when the date equals the stored one,
 * so an overdue quest stays updatable; a `Date` round-trip could drop
 * precision and turn the resend into a rejected new date.
 */
export type UpdateTodoInput = Required<Schemas['UpdateTodoRequest']>;

export async function listTodos(params: { limit: number; offset: number }): Promise<TodosPage> {
  const { data } = await axiosClient.get<TodosPage>('/v1/todos', { params });
  return data;
}

export async function createTodo(input: CreateTodoInput): Promise<Todo> {
  const { data } = await axiosClient.post<Schemas['CreateTodoResponse']>('/v1/todos', input);
  return data.todo;
}

export async function updateTodo(id: string, input: UpdateTodoInput): Promise<Todo> {
  const { data } = await axiosClient.put<Schemas['UpdateTodoResponse']>(`/v1/todos/${id}`, input);
  return data.todo;
}
