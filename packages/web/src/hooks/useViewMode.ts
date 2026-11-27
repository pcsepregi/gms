import { useCallback, useState } from 'react';

export type ViewMode = 'grid' | 'table';
export const VIEW_KEY = 'gms.cardView';

function read(): ViewMode {
  try {
    return localStorage.getItem(VIEW_KEY) === 'table' ? 'table' : 'grid';
  } catch {
    return 'grid';
  }
}

/** Rács / táblázat választás, a böngészőben megmarad (S-11/EF3). */
export function useViewMode() {
  const [mode, setModeState] = useState<ViewMode>(read);
  const setMode = useCallback((m: ViewMode) => {
    setModeState(m);
    try {
      localStorage.setItem(VIEW_KEY, m);
    } catch {
      // nem kötelező
    }
  }, []);
  return [mode, setMode] as const;
}
