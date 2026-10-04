import { Skeleton } from '@/components/ui/skeleton';

/**
 * Full-page loading skeleton used by `RequireAuth` while
 * `status === 'loading'` (the `AuthProvider` is probing `GET /auth/v1/me`).
 *
 * Skeleton-on-load over a spinner-on-load per locked decision #7 in the
 * design (no spinners; shadcn `Skeleton` is the chosen primitive). The
 * layout approximates the eventual page chrome (navbar row + card) so the
 * first paint after auth resolves has minimal layout shift.
 */
export function FullPageSkeleton() {
  return (
    <div className="min-h-screen bg-background" data-testid="full-page-skeleton">
      <div className="border-b">
        <div className="container flex h-14 items-center">
          <Skeleton className="h-6 w-32" />
        </div>
      </div>
      <div className="container py-12">
        <Skeleton className="mb-4 h-8 w-64" />
        <Skeleton className="mb-2 h-4 w-full" />
        <Skeleton className="mb-2 h-4 w-5/6" />
        <Skeleton className="h-4 w-3/4" />
      </div>
    </div>
  );
}