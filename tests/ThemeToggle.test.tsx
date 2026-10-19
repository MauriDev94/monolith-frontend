import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider } from 'next-themes';
import { ThemeToggle } from '@/components/ThemeToggle';

/**
 * Tests for `ThemeToggle`, mounted inside a real `ThemeProvider` configured
 * exactly like `App.tsx` (dark default, no system preference, stored under
 * `monolith-theme`).
 */
const STORAGE_KEY = 'monolith-theme';

function renderToggle() {
  return render(
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem={false}
      storageKey={STORAGE_KEY}
    >
      <ThemeToggle />
    </ThemeProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.className = '';
});

afterEach(() => {
  cleanup();
});

describe('ThemeToggle', () => {
  it('starts in dark mode and offers to switch to light', async () => {
    renderToggle();

    const toggle = await screen.findByTestId('theme-toggle');
    expect(toggle).toHaveAccessibleName('Cambiar a modo claro');
    expect(document.documentElement).toHaveClass('dark');
  });

  it('switches to light on click, persists it, and flips its label', async () => {
    const user = userEvent.setup();
    renderToggle();

    await user.click(await screen.findByTestId('theme-toggle'));

    expect(document.documentElement).not.toHaveClass('dark');
    expect(document.documentElement).toHaveClass('light');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('light');
    expect(screen.getByTestId('theme-toggle')).toHaveAccessibleName('Cambiar a modo oscuro');
  });

  it('restores a stored light preference', async () => {
    localStorage.setItem(STORAGE_KEY, 'light');
    renderToggle();

    expect(await screen.findByTestId('theme-toggle')).toHaveAccessibleName('Cambiar a modo oscuro');
    expect(document.documentElement).toHaveClass('light');
  });
});
