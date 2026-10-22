import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';

/**
 * Todos-API wrapper tests. Same pattern as `authApi.test.ts`: a fresh module
 * graph per test and a MockAdapter on the real `axiosClient`.
 */

vi.mock('@/api/refreshClient', () => ({
  refreshClient: axios.create(),
}));

const TODO = {
  id: 't-1',
  user_id: 'u-1',
  title: 'Derrotar al jefe del sprint',
  description: null,
  is_completed: false,
  due_date: null,
  created_at: '2026-10-19T03:00:00Z',
  updated_at: '2026-10-19T03:00:00Z',
};

describe('todosApi wrappers', () => {
  let mock: MockAdapter;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let todosApi: any;

  beforeEach(async () => {
    vi.resetModules();
    const clientMod = await import('@/api/axiosClient');
    todosApi = await import('@/api/todosApi');
    mock = new MockAdapter(clientMod.axiosClient);
  });

  afterEach(() => {
    mock?.reset();
  });

  it('listTodos sends limit/offset and returns the page as is', async () => {
    let params: unknown;
    mock.onGet('/v1/todos').reply((config) => {
      params = config.params;
      return [200, { todos: [TODO], total: 21, limit: 20, offset: 20 }];
    });

    const page = await todosApi.listTodos({ limit: 20, offset: 20 });

    expect(params).toEqual({ limit: 20, offset: 20 });
    expect(page).toEqual({ todos: [TODO], total: 21, limit: 20, offset: 20 });
  });

  it('createTodo posts the payload and unwraps the { todo } envelope', async () => {
    let body: unknown;
    mock.onPost('/v1/todos').reply((config) => {
      body = JSON.parse(config.data);
      return [201, { todo: TODO }];
    });

    const created = await todosApi.createTodo({
      title: TODO.title,
      description: null,
      due_date: null,
    });

    expect(body).toEqual({ title: TODO.title, description: null, due_date: null });
    expect(created).toEqual(TODO);
  });

  it('updateTodo PUTs the full payload to the quest URL and unwraps { todo }', async () => {
    const saved = { ...TODO, is_completed: true };
    let body: unknown;
    mock.onPut('/v1/todos/t-1').reply((config) => {
      body = JSON.parse(config.data);
      return [200, { todo: saved }];
    });

    const input = {
      title: TODO.title,
      description: 'Antes del viernes',
      is_completed: true,
      due_date: '2026-10-25T03:00:00.123456Z',
    };
    const updated = await todosApi.updateTodo('t-1', input);

    // The date string travels untouched (microseconds included).
    expect(body).toEqual(input);
    expect(updated).toEqual(saved);
  });
});
