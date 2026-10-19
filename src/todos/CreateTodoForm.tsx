import { forwardRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { apiErrorMessage } from '@/api/apiErrors';
import {
  createTodoSchema,
  emptyCreateTodoValues,
  toCreateTodoInput,
  todayIso,
  type CreateTodoValues,
} from '@/todos/schemas';
import { useCreateTodo } from '@/todos/useTodos';

/**
 * "Nueva misión" form: title (required), description and due date
 * (optional). On success it clears itself, toasts, and the list refetches
 * through `useCreateTodo`'s invalidation. Failures show Spanish copy inline.
 *
 * The forwarded ref points at the title input so the empty state's call to
 * action can focus it.
 */
export const CreateTodoForm = forwardRef<HTMLInputElement>(
  function CreateTodoForm(_props, titleRef) {
    const createTodo = useCreateTodo();
    const [submitError, setSubmitError] = useState<string | null>(null);

    const form = useForm<CreateTodoValues>({
      resolver: zodResolver(createTodoSchema),
      defaultValues: emptyCreateTodoValues,
    });

    const onSubmit = form.handleSubmit(async (values) => {
      setSubmitError(null);
      try {
        await createTodo.mutateAsync(toCreateTodoInput(values));
        form.reset(emptyCreateTodoValues);
        toast.success('Misión agregada a tu bitácora');
      } catch (err) {
        setSubmitError(apiErrorMessage(err, 'No se pudo agregar la misión. Inténtalo de nuevo.'));
      }
    });

    return (
      <Form {...form}>
        <form
          onSubmit={onSubmit}
          noValidate
          aria-labelledby="create-todo-heading"
          className="space-y-4 rounded-lg border bg-card p-5 sm:p-6"
        >
          <h2 id="create-todo-heading" className="text-lg font-bold">
            Nueva misión
          </h2>
          <FormField
            control={form.control}
            name="title"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nombre de la misión</FormLabel>
                <FormControl>
                  <Input
                    placeholder="Ej: Derrotar al jefe del sprint"
                    maxLength={150}
                    autoComplete="off"
                    {...field}
                    ref={(element) => {
                      field.ref(element);
                      if (typeof titleRef === 'function') titleRef(element);
                      else if (titleRef) titleRef.current = element;
                    }}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_12rem]">
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Descripción (opcional)</FormLabel>
                  <FormControl>
                    <Textarea
                      rows={2}
                      maxLength={2000}
                      placeholder="Detalles, pistas o recompensas"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="dueDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Fecha límite (opcional)</FormLabel>
                  <FormControl>
                    <Input type="date" min={todayIso()} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          {submitError ? (
            <p
              role="alert"
              data-testid="create-todo-error"
              className="text-sm font-medium text-destructive"
            >
              {submitError}
            </p>
          ) : null}
          <Button type="submit" disabled={form.formState.isSubmitting} className="w-full sm:w-auto">
            {form.formState.isSubmitting ? 'Agregando...' : 'Agregar misión'}
          </Button>
        </form>
      </Form>
    );
  },
);
