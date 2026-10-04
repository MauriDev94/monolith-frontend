import { useContext } from 'react';
import { AuthContext, type AuthContextValue } from '@/auth/AuthContext';

/**
 * Hook that returns the current auth context value.
 *
 * Throws when called outside an `<AuthProvider />`. Loud-failing beats a
 * silent `undefined` — a missing provider is a programmer error, not a
 * runtime state. The error message points at the wrap site so a future
 * contributor does not have to spelunk the React tree.
 *
 * @throws if no `<AuthProvider />` ancestor is present.
 */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (ctx === null) {
    throw new Error('useAuth must be used within <AuthProvider>');
  }
  return ctx;
}