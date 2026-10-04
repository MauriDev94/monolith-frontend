import { decodeJwtExp } from '@/auth/jwtDecode';

/**
 * Cancelable proactive refresh scheduler.
 *
 * The frontend schedules a `setTimeout` to call `POST /auth/v1/refresh`
 * 60 seconds BEFORE the JWT `exp` claim (locked decision #7). The timer
 * must be:
 *
 * - **Cancelable** on logout and on session change.
 * - **Re-schedulable**: calling `schedule` again cancels the previous timer
 *   so we never have two refreshes racing.
 * - **Drift-tolerant**: clock skew between the server and the client can put
 *   the desired fire time in the past. `Math.max(0, …)` clamps to zero
 *   (immediate fire) instead of throwing or scheduling a negative delay.
 * - **Idempotent on cancel**: calling it after the timer already cleared, or
 *   after a fire, is a no-op.
 *
 * See `design.md §tokenRefreshScheduler` and the spec scenarios under
 * `frontend-auth > Proactive Refresh Timer`.
 */

export interface RefreshScheduler {
  /**
   * (Re)schedule a refresh timer for the given access token.
   *
   * Cancels any previously-scheduled timer first. Decodes `exp` via
   * `decodeJwtExp` (throws on malformed token). Calls `onRefresh` after
   * `max(0, exp * 1000 - 60_000 - Date.now())` milliseconds; any error
   * thrown by `onRefresh` is swallowed here because the 401 interceptor is
   * the next line of defense if the refresh fails.
   *
   * @param token - A signed access JWT whose `exp` claim we trust for timing.
   * @param onRefresh - The refresh action (typically `refreshAccessToken`).
   */
  schedule(token: string, onRefresh: () => Promise<void>): void;

  /**
   * Cancel any pending refresh timer. Safe to call multiple times.
   */
  cancel(): void;
}

const REFRESH_LEAD_MS = 60_000;

export function createRefreshScheduler(): RefreshScheduler {
  let handle: ReturnType<typeof setTimeout> | null = null;

  return {
    schedule(token, onRefresh) {
      // Always replace; the caller has no idea what is scheduled.
      if (handle !== null) {
        clearTimeout(handle);
        handle = null;
      }

      const expSec = decodeJwtExp(token);
      const fireAtMs = expSec * 1000 - REFRESH_LEAD_MS;
      const delayMs = Math.max(0, fireAtMs - Date.now());

      handle = setTimeout(() => {
        // Null the handle before invoking so a synchronous reschedule from
        // inside onRefresh does not see a stale handle.
        handle = null;
        onRefresh().catch(() => {
          // The 401 interceptor takes over; this scheduler does not need
          // to know whether refresh succeeded.
        });
      }, delayMs);
    },

    cancel() {
      if (handle !== null) {
        clearTimeout(handle);
        handle = null;
      }
    },
  };
}