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
const updateTodoMock = vi.fn();
const toastSuccessMock = vi.fn();
const toastErrorMock = vi.fn();

vi.mock('@/api/todosApi', () => ({
  listTodos: (...args: unknown[]) => listTodosMock(...args),
  createTodo: (...args: unknown[]) => createTodoMock(...args),
  updateTodo: (...args: unknown[]) => updateTodoMock(...args),
}));

vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccessMock(...args),
    error: (...args: unknown[]) => toastErrorMock(...args),
  },
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
  updateTodoMock.mockReset();
  toastSuccessMock.mockReset();
  toastErrorMock.mockReset();
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

describe('TodosPage — complete', () => {
  function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  }

  const seal = (title: string) =>
    screen.findByRole('checkbox', { name: `Marcar como completada: ${title}` });

  it('completes a quest optimistically, resending every field, and celebrates', async () => {
    // An overdue quest with a description: both must survive the full-replace PUT.
    const quest = todo(1, {
      description: 'Antes del viernes',
      due_date: '2026-10-01T03:00:00.123456Z',
    });
    listTodosMock.mockResolvedValue(page([quest], 1));
    const server = deferred<Todo>();
    updateTodoMock.mockReturnValue(server.promise);

    renderPage();
    const checkbox = await seal('Misión 1');
    expect(checkbox).toHaveAttribute('aria-checked', 'false');

    await user.click(checkbox);

    expect(updateTodoMock).toHaveBeenCalledWith('t-1', {
      title: 'Misión 1',
      description: 'Antes del viernes',
      is_completed: true,
      due_date: '2026-10-01T03:00:00.123456Z',
    });
    // Flipped before the server answers.
    expect(checkbox).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText('Completada')).toBeInTheDocument();
    expect(toastSuccessMock).not.toHaveBeenCalled();

    server.resolve({ ...quest, is_completed: true });

    await waitFor(() => expect(toastSuccessMock).toHaveBeenCalledWith('¡Misión cumplida!'));
    expect(checkbox).toHaveAttribute('aria-checked', 'true');
  });

  it('reopens a completed quest without a celebration', async () => {
    const quest = todo(1, { is_completed: true });
    listTodosMock.mockResolvedValue(page([quest], 1));
    updateTodoMock.mockResolvedValue({ ...quest, is_completed: false });

    renderPage();
    const checkbox = await seal('Misión 1');
    await user.click(checkbox);

    expect(updateTodoMock).toHaveBeenCalledWith(
      't-1',
      expect.objectContaining({ is_completed: false }),
    );
    await waitFor(() => expect(checkbox).toHaveAttribute('aria-checked', 'false'));
    expect(screen.queryByText('Completada')).not.toBeInTheDocument();
    expect(toastSuccessMock).not.toHaveBeenCalled();
  });

  it('rolls the quest back, shows Spanish copy and refetches when the update fails', async () => {
    listTodosMock.mockResolvedValue(page([todo(1)], 1));
    updateTodoMock.mockRejectedValue(httpError(500));

    renderPage();
    const checkbox = await seal('Misión 1');
    await user.click(checkbox);

    await waitFor(() =>
      expect(toastErrorMock).toHaveBeenCalledWith(
        'El servidor tuvo un problema. Inténtalo de nuevo en unos minutos.',
      ),
    );
    expect(checkbox).toHaveAttribute('aria-checked', 'false');
    expect(toastSuccessMock).not.toHaveBeenCalled();
    await waitFor(() => expect(listTodosMock).toHaveBeenCalledTimes(2));
  });

  it('only rolls back the quest that failed', async () => {
    listTodosMock.mockResolvedValueOnce(page([todo(1), todo(2)], 2));
    const first = deferred<Todo>();
    updateTodoMock
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce(todo(2, { is_completed: true }));
    // The refetch after the failure must not hide a wrong rollback.
    listTodosMock.mockReturnValue(new Promise(() => {}));

    renderPage();
    const one = await seal('Misión 1');
    const two = await seal('Misión 2');
    await user.click(one);
    await user.click(two);
    await waitFor(() => expect(two).toHaveAttribute('aria-checked', 'true'));

    first.reject(httpError(500));

    await waitFor(() => expect(one).toHaveAttribute('aria-checked', 'false'));
    expect(two).toHaveAttribute('aria-checked', 'true');
  });

  it('ignores clicks while the quest is saving', async () => {
    listTodosMock.mockResolvedValue(page([todo(1)], 1));
    updateTodoMock.mockReturnValue(new Promise(() => {}));

    renderPage();
    const checkbox = await seal('Misión 1');
    await user.click(checkbox);
    await user.click(checkbox);

    expect(updateTodoMock).toHaveBeenCalledTimes(1);
    expect(checkbox).toHaveAttribute('aria-disabled', 'true');
    expect(checkbox).toHaveAttribute('aria-checked', 'true');
  });
});
