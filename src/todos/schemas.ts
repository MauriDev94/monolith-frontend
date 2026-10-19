import { z } from 'zod';

/**
 * Zod schema for the create-quest form.
 *
 * Mirrors the backend's `CreateTodoRequest`
 * (`app/features/todos/presentation/schemas/todo_requests.py`): title 1–150
 * chars after trimming, optional description up to 2000 chars, optional due
 * date. The backend also rejects a due date in the past (`Todo.create_new`),
 * so the form blocks days before today.
 *
 * `dueDate` is the raw `YYYY-MM-DD` value of a `type="date"` input (empty
 * string when unset); `toCreateTodoInput` turns it into the API payload.
 */
export const createTodoSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, { message: 'Ponle un nombre a la misión' })
    .max(150, { message: 'Máximo 150 caracteres' }),
  description: z.string().trim().max(2000, { message: 'Máximo 2000 caracteres' }),
  dueDate: z
    .string()
    .refine((value) => value === '' || /^\d{4}-\d{2}-\d{2}$/.test(value), {
      message: 'Fecha inválida',
    })
    .refine((value) => value === '' || value >= todayIso(), {
      message: 'La fecha no puede ser anterior a hoy',
    }),
});

export type CreateTodoValues = z.infer<typeof createTodoSchema>;

export const emptyCreateTodoValues: CreateTodoValues = { title: '', description: '', dueDate: '' };

/**
 * Form values → API payload. A due date means "by the end of that day" in
 * the user's time zone, so a quest due today is never already in the past.
 */
export function toCreateTodoInput(values: CreateTodoValues) {
  return {
    title: values.title.trim(),
    description: values.description.trim() || null,
    due_date: values.dueDate ? new Date(`${values.dueDate}T23:59:59`).toISOString() : null,
  };
}

/** Today's date as `YYYY-MM-DD` in local time (what a date input emits). */
export function todayIso(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}
