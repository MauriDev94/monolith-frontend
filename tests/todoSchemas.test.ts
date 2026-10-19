import { describe, expect, it } from 'vitest';
import { createTodoSchema, toCreateTodoInput, todayIso } from '@/todos/schemas';

/**
 * Tests for the create-quest schema and its payload mapping. Rules mirror
 * the backend's `CreateTodoRequest` and `Todo.create_new`.
 */
const base = { title: 'Revisar el PR', description: '', dueDate: '' };

describe('createTodoSchema', () => {
  it('accepts a title alone', () => {
    expect(createTodoSchema.safeParse(base).success).toBe(true);
  });

  it('rejects an empty or whitespace-only title', () => {
    expect(createTodoSchema.safeParse({ ...base, title: '   ' }).success).toBe(false);
  });

  it('rejects a title over 150 characters', () => {
    expect(createTodoSchema.safeParse({ ...base, title: 'x'.repeat(151) }).success).toBe(false);
    expect(createTodoSchema.safeParse({ ...base, title: 'x'.repeat(150) }).success).toBe(true);
  });

  it('rejects a description over 2000 characters', () => {
    expect(createTodoSchema.safeParse({ ...base, description: 'x'.repeat(2001) }).success).toBe(
      false,
    );
  });

  it('accepts today as due date and rejects yesterday', () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    expect(createTodoSchema.safeParse({ ...base, dueDate: todayIso() }).success).toBe(true);
    expect(createTodoSchema.safeParse({ ...base, dueDate: todayIso(yesterday) }).success).toBe(
      false,
    );
  });
});

describe('toCreateTodoInput', () => {
  it('trims the title and sends null for empty optional fields', () => {
    expect(toCreateTodoInput({ title: '  Misión  ', description: '  ', dueDate: '' })).toEqual({
      title: 'Misión',
      description: null,
      due_date: null,
    });
  });

  it('turns a due date into the end of that local day as ISO', () => {
    const input = toCreateTodoInput({ ...base, dueDate: '2030-05-17' });
    const due = new Date(input.due_date as string);

    expect(due.getFullYear()).toBe(2030);
    expect(due.getMonth()).toBe(4);
    expect(due.getDate()).toBe(17);
    expect(due.getHours()).toBe(23);
    expect(due.getMinutes()).toBe(59);
  });
});

describe('todayIso', () => {
  it('formats a local date as YYYY-MM-DD', () => {
    expect(todayIso(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});
