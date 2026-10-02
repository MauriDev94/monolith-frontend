import { Outlet } from 'react-router-dom';

/**
 * PR2 skeleton — always renders `<Outlet />`.
 *
 * The real redirect logic lands in PR3 (FE-2-006): on `status === 'loading'`
 * show a skeleton; on `!user` navigate to `/login?from=<path>`; on `user`
 * render the outlet. Splitting the skeleton from the redirect keeps this PR
 * focused on routing shape (does the tree compile, do routes render?).
 */
export function RequireAuth() {
  return <Outlet />;
}