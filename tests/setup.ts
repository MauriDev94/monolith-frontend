import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

/**
 * Global Vitest setup.
 *
 * - Imports `@testing-library/jest-dom` so matchers like `toBeInTheDocument`
 *   are available globally (vitest config has `globals: true`).
 * - Auto-cleans the DOM after every test so React components do not leak
 *   between tests.
 */
afterEach(() => {
  cleanup();
});