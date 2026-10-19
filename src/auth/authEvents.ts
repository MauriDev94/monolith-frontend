/**
 * Module-scoped event bus.
 *
 * The axios response interceptor (lives outside the React tree) needs to
 * notify the `AuthProvider` (lives inside the React tree) when a refresh
 * fails and the session must be torn down. A 30-line emitter is the
 * smallest seam that works at module load.
 *
 * Currently one signal — `'unauthorized'` — flows in one direction
 * (interceptor → provider). The emitter is over-engineered for that single
 * use case on purpose: it costs almost nothing and prevents the
 * "callback-from-axios-into-React" wiring from being a refactor later.
 */

export type AuthEvent = 'unauthorized';

/**
 * Internal type alias that documents the `(event, callback)` contract. Kept
 * private because no consumer needs to extend the bus with new types.
 */
type EventListener = () => void;

/**
 * Per-event listener set. A `Set` makes add/delete idempotent and gives us
 * O(1) cleanup; the array snapshot on dispatch isolates the iteration from
 * re-entrant subscribe / unsubscribe calls.
 */
const registry = new Map<AuthEvent, Set<EventListener>>();

/**
 * Register a listener for an auth event. Returns an unsubscribe function —
 * the caller is expected to invoke it on cleanup so listeners do not leak.
 *
 * @param event - The auth event to subscribe to.
 * @param cb - Zero-arg callback invoked when the event fires.
 * @returns An unsubscribe function.
 */
export function on(event: AuthEvent, cb: EventListener): () => void {
  let set = registry.get(event);
  if (!set) {
    set = new Set();
    registry.set(event, set);
  }
  set.add(cb);
  return () => {
    set?.delete(cb);
  };
}

/**
 * Emit an auth event. Synchronous — listeners run inline. We deliberately do
 * not return a Promise: callers (the response interceptor) do not need to
 * await listeners, and a listener that throws must not block the next
 * refresh attempt.
 *
 * Listener exceptions are swallowed here. Browsers do this per spec, but
 * happy-dom (used in Vitest) propagates them and would let a buggy
 * subscriber crash the interceptor. Wrapping each listener keeps the bus
 * robust regardless of the runtime.
 */
export function emit(event: AuthEvent): void {
  const set = registry.get(event);
  if (!set) return;
  // Snapshot the listener list before iterating so a handler that subscribes
  // or unsubscribes during dispatch does not perturb the loop.
  for (const listener of [...set]) {
    try {
      listener();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`authEvents: listener for "${event}" threw`, err);
    }
  }
}

export const authEvents = { on, emit } as const;