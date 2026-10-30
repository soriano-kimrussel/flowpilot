'use client';

import { useSyncExternalStore } from 'react';
import { Moon, Sun } from 'lucide-react';
import { cn } from '@/lib/utils/format';
import { THEME_STORAGE_KEY } from './init-script';

function subscribe(onChange) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  return () => observer.disconnect();
}

const getTheme = () => (document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');

/** Current theme; 'dark' during server render and hydration. */
export function useTheme() {
  return useSyncExternalStore(subscribe, getTheme, () => 'dark');
}

export function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Private mode / blocked storage: the choice just won't persist.
  }
}

export function ThemeToggle({ className }) {
  const theme = useTheme();
  const next = theme === 'dark' ? 'light' : 'dark';
  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      className={cn(
        'inline-flex h-8 w-8 items-center justify-center rounded-md text-ink-subtle transition-colors hover:bg-gray-100 hover:text-ink',
        className,
      )}
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
    >
      {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}
