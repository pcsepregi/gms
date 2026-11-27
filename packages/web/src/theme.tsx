import { useCallback, useEffect, useState } from 'react';
import { hu } from './i18n/hu';

/** Téma (S-62): alapból a rendszer beállítása, a választás a böngészőben megmarad. */
export type ThemeChoice = 'system' | 'light' | 'dark';

export const THEME_KEY = 'gms.theme';
const CHOICES: ThemeChoice[] = ['system', 'light', 'dark'];

export function readTheme(): ThemeChoice {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

/** A `data-theme` attribútum csak kézi választásnál kerül a <html>-re; rendszer módban a CSS média lekérdezés dönt. */
export function applyTheme(choice: ThemeChoice) {
  const root = document.documentElement;
  if (choice === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', choice);
}

export function useTheme() {
  const [theme, setThemeState] = useState<ThemeChoice>(readTheme);
  useEffect(() => applyTheme(theme), [theme]);
  const setTheme = useCallback((t: ThemeChoice) => {
    setThemeState(t);
    try {
      if (t === 'system') localStorage.removeItem(THEME_KEY);
      else localStorage.setItem(THEME_KEY, t);
    } catch {
      // A tárolás nem kötelező: a választás ilyenkor csak erre a megnyitásra él.
    }
  }, []);
  return [theme, setTheme] as const;
}

export function ThemeSwitch() {
  const [theme, setTheme] = useTheme();
  return (
    <div className="segmented segmented-small" role="group" aria-label={hu.theme.label}>
      {CHOICES.map((c) => (
        <button key={c} type="button" aria-pressed={theme === c} onClick={() => setTheme(c)}>
          {hu.theme[c]}
        </button>
      ))}
    </div>
  );
}
