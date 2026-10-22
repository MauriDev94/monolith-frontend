import { axiosClient } from '@/api/axiosClient';

/**
 * Typed wrappers around the todos endpoints (`/v1/todos`).
 *
 * Shapes mirror the backend's `TodoResponse` / `GetTodosResponse` /
 * `CreateTodoRequest` (`app/features/todos/presentation/schemas/`).
 * Hand-rolled until the planned openapi-typescript codegen (locked
 * decision #2); check them against the backend when it changes.
 *
 * Datetimes are ISO 8601 strings with a UTC offset. The list is ordered by
 * `created_at` ascending (oldest first) and paginated with `limit`/`offset`
 * (`limit` 1–100, default 20).
 */

export interface Todo {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  is_completed: boolean;
  due_date: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface TodosPage {
  todos: Todo[];
  total: number;
  limit: number;
  offset: number;
}

export interface CreateTodoInput {
  title: string;
  description?: string | null;
  /** ISO 8601 datetime; the backend rejects dates in the past (400). */
  due_date?: string | null;
}

/**
 * Body of `PUT /v1/todos/{id}`. It is a full replace, not a patch: the
 * backend's `UpdateTodoRequest` defaults `description` and `due_date` to
 * null, so leaving them out would clear them. Send every field.
 */
export interface UpdateTodoInput {
  title: string;
  description: string | null;
  is_completed: boolean;
  /**
   * Resend the string the API returned, untouched. The backend skips its
   * "not in the past" rule only when the date equals the stored one, so an
   * overdue quest stays updatable; a `Date` round-trip could drop precision
   * and turn the resend into a rejected new date.
   */
  due_date: string | null;
}

interface TodoEnvelope {
  todo: Todo;
}

export async function listTodos(params: { limit: number; offset: number }): Promise<TodosPage> {
  const { data } = await axiosClient.get<TodosPage>('/v1/todos', { params });
  return data;
}

export async function createTodo(input: CreateTodoInput): Promise<Todo> {
  const { data } = await axiosClient.post<TodoEnvelope>('/v1/todos', input);
  return data.todo;
}

export async function updateTodo(id: string, input: UpdateTodoInput): Promise<Todo> {
  const { data } = await axiosClient.put<TodoEnvelope>(`/v1/todos/${id}`, input);
  return data.todo;
}
