import { QueryClient } from '@tanstack/react-query';

/**
 * Shared TanStack Query client.
 *
 * Defaults:
 * - `retry: 1` — one automatic retry per failing query, then surface the error.
 *   Auth-relevant requests (authApi.me, etc.) live outside queries so this
 *   only affects data fetches like todosApi.list.
 * - `refetchOnWindowFocus: false` — background refetch on tab focus would be
 *   wasteful for a small todos app and could surface flicker mid-edit.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});