'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';

// Flips `data-theme` on <html>, which is what the dark token block keys off.
// `system` removes the attribute and hands the decision back to the OS.
const ORDER = ['system', 'light', 'dark'] as const;
type Theme = (typeof ORDER)[number];

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('system');

  function next() {
    const chosen = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length];
    setTheme(chosen);
    if (chosen === 'system') {
      delete document.documentElement.dataset.theme;
    } else {
      document.documentElement.dataset.theme = chosen;
    }
  }

  return (
    <Button onClick={next} aria-label={`Theme: ${theme}. Click to change.`}>
      Theme: {theme}
    </Button>
  );
}
