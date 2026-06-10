'use client';

import React, { useState } from 'react';

type Theme = 'light' | 'dark';

export const ThemeToggle: React.FC = () => {
  // Read the attribute the no-flash <head> script already set before hydration,
  // so the button label matches the rendered theme right away. (Falls back to
  // 'dark' during SSR where `document` is unavailable.)
  const [theme, setTheme] = useState<Theme>(() =>
    typeof document !== 'undefined'
      ? ((document.documentElement.dataset.theme as Theme) || 'dark')
      : 'dark'
  );

  const toggle = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem('theme', next);
    } catch {
      // ignore storage failures (private mode, etc.)
    }
    setTheme(next);
  };

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggle}
      aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
      suppressHydrationWarning
    >
      {theme === 'dark' ? '☀' : '☾'}
    </button>
  );
};

export default ThemeToggle;
