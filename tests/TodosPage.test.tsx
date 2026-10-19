import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError } from 'axios';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Todo } from '@/api/todosApi';

/**
 * Tests for the `/todos` page (list + create).
 *
 * The network seam is `@/api/todosApi`, mocked per test. Each test gets a
 * fresh `QueryClient` with retries off so error states render immediately.
 */
const listTodosMock = vi.fn();
const createTodoMock = vi.fn();

vi.mock('@/api/todosApi', () => ({
  listTodos: (...args: unknown[]) => listTodosMock(...args),
  createTodo: (...args: unknown[]) => createTodoMock(...args),
}));

import TodosPage from '@/routes/TodosPage';

function todo(n: number, overrides: Partial<Todo> = {}): Todo {
  return {
    id: `t-${n}`,
    user_id: 'u-1',
    title: `Misión ${n}`,
    description: null,
    is_completed: false,
    due_date: null,
    created_at: '2026-10-19T03:00:00Z',
    updated_at: '2026-10-19T03:00:00Z',
    ...overrides,
  };
}

function page(todos: Todo[], total: number, offset = 0) {
  return { todos, total, limit: 20, offset };
}

function httpError(status: number) {
  return new AxiosError(
    `Request failed with status code ${status}`,
    'ERR_BAD_RESPONSE',
    undefined,
    undefined,
    {
      status,
    } as never,
  );
}

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <TodosPage />
    </QueryClientProvider>,
  );
}

const user = userEvent.setup();

beforeEach(() => {
  listTodosMock.mockReset();
  createTodoMock.mockReset();
});

afterEach(() => {
  cleanup();
});

describe('TodosPage — list', () => {
  it('shows a skeleton while the first page loads', () => {
    listTodosMock.mockReturnValue(new Promise(() => {}));

    renderPage();

    expect(screen.getByTestId('todos-loading')).toBeInTheDocument();
  });

  it('renders the quests and the total count', async () => {
    listTodosMock.mockResolvedValue(
      page([todo(1), todo(2, { description: 'Con pistas', is_completed: true })], 2),
    );

    renderPage();

    expect(await screen.findAllByTestId('todo-card')).toHaveLength(2);
    expect(screen.getByText('Misión 1')).toBeInTheDocument();
    expect(screen.getByText('Con pistas')).toBeInTheDocument();
    expect(screen.getByText('Completada')).toBeInTheDocument();
    expect(screen.getByTestId('todos-count')).toHaveTextContent('2 misiones en tu bitácora');
    expect(listTodosMock).toHaveBeenCalledWith({ limit: 20, offset: 0 });
  });

  it('shows the empty state and focuses the title input from its call to action', async () => {
    listTodosMock.mockResolvedValue(page([], 0));

    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Escribir mi primera misión' }));

    expect(screen.getByText('Tu bitácora está vacía')).toBeInTheDocument();
    expect(screen.getByLabelText('Nombre de la misión')).toHaveFocus();
  });

  it('loads the next page with "Cargar más misiones" until the total is reached', async () => {
    const first = Array.from({ length: 20 }, (_, i) => todo(i + 1));
    listTodosMock
      .mockResolvedValueOnce(page(first, 21, 0))
      .mockResolvedValueOnce(page([todo(21)], 21, 20));

    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Cargar más misiones' }));

    expect(await screen.findByText('Misión 21')).toBeInTheDocument();
    expect(listTodosMock).toHaveBeenLastCalledWith({ limit: 20, offset: 20 });
    expect(screen.getAllByTestId('todo-card')).toHaveLength(21);
    expect(screen.queryByRole('button', { name: 'Cargar más misiones' })).not.toBeInTheDocument();
  });

  it('shows Spanish copy and a retry button when the list fails', async () => {
    listTodosMock.mockRejectedValueOnce(httpError(500)).mockResolvedValueOnce(page([todo(1)], 1));

    renderPage();

    expect(await screen.findByText(/el servidor tuvo un problema/i)).toBeInTheDocument();
    expect(screen.queryByText(/request failed/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByText('Misión 1')).toBeInTheDocument();
  });
});

describe('TodosPage — create', () => {
  it('creates a quest, clears the form and refetches the list', async () => {
    listTodosMock
      .mockResolvedValueOnce(page([], 0))
      .mockResolvedValueOnce(page([todo(1, { title: 'Derrotar al jefe' })], 1));
    createTodoMock.mockResolvedValue(todo(1, { title: 'Derrotar al jefe' }));

    renderPage();

    const title = await screen.findByLabelText('Nombre de la misión');
    await user.type(title, '  Derrotar al jefe  ');
    await user.type(screen.getByLabelText('Descripción (opcional)'), 'Antes del viernes');
    await user.click(screen.getByRole('button', { name: 'Agregar misión' }));

    expect(await screen.findByText('Derrotar al jefe')).toBeInTheDocument();
    expect(createTodoMock).toHaveBeenCalledWith({
      title: 'Derrotar al jefe',
      description: 'Antes del viernes',
      due_date: null,
    });
    expect(listTodosMock).toHaveBeenCalledTimes(2);
    expect(screen.getByLabelText('Nombre de la misión')).toHaveValue('');
    expect(screen.getByTestId('todos-count')).toHaveTextContent('1 misión en tu bitácora');
  });

  it('does not call the API when the title is empty', async () => {
    listTodosMock.mockResolvedValue(page([], 0));

    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Agregar misión' }));

    expect(await screen.findByText('Ponle un nombre a la misión')).toBeInTheDocument();
    expect(createTodoMock).not.toHaveBeenCalled();
  });

  it('shows Spanish copy inline when the create call fails', async () => {
    listTodosMock.mockResolvedValue(page([], 0));
    createTodoMock.mockRejectedValue(httpError(400));

    renderPage();

    await user.type(await screen.findByLabelText('Nombre de la misión'), 'Misión imposible');
    await user.click(screen.getByRole('button', { name: 'Agregar misión' }));

    await waitFor(() => {
      expect(screen.getByTestId('create-todo-error')).toHaveTextContent(/revisa los datos/i);
    });
    expect(screen.getByLabelText('Nombre de la misión')).toHaveValue('Misión imposible');
  });
});
