import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';

/**
 * Dark / light switch for the navbar.
 *
 * `next-themes` only knows the stored theme after mount (it reads
 * localStorage in an effect), so the first render shows a same-size
 * placeholder instead of an icon that might be wrong for a frame. The
 * `.dark` class itself is already on `<html>` from `index.html`, so the
 * page never flashes light while this resolves.
 */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <span className="inline-block h-10 w-10" aria-hidden="true" />;
  }

  const isDark = resolvedTheme !== 'light';

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      data-testid="theme-toggle"
      aria-label={isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
    >
      {isDark ? <Sun /> : <Moon />}
    </Button>
  );
}
