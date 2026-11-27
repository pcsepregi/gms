import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Card, Health, ImportSummary } from '@gms/shared';
import { ApiError, getJson, sendJson } from './client';

export const CARDS_KEY = ['cards'] as const;

export const useCards = () =>
  useQuery({ queryKey: CARDS_KEY, queryFn: () => getJson<Card[]>('/api/cards') });

export const useHealth = () =>
  useQuery({ queryKey: ['health'], queryFn: () => getJson<Health>('/api/health') });

/** Az import összesítője; `null`, ha még nem volt import. */
export const useImportSummary = () =>
  useQuery({
    queryKey: ['import-summary'],
    queryFn: async () => {
      try {
        return await getJson<ImportSummary>('/api/import/summary');
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) return null;
        throw err;
      }
    },
  });

interface SetOwnedVars {
  id: number;
  owned: boolean;
}

function patchCard(list: Card[] | undefined, id: number, fn: (c: Card) => Card) {
  return list?.map((c) => (c.id === id ? fn(c) : c));
}

/**
 * Megvan / nincs meg jelölés optimista frissítéssel (S-20, technikai spec 8.3):
 * a lista azonnal átvált, hiba esetén az adott kártya visszaáll.
 */
export function useSetOwned(handlers: {
  onSuccess?: (card: Card, vars: SetOwnedVars) => void;
  onError?: (vars: SetOwnedVars) => void;
}) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, owned }: SetOwnedVars) =>
      sendJson<Card>('PUT', `/api/cards/${id}/owned`, { owned }),
    onMutate: async ({ id, owned }) => {
      await qc.cancelQueries({ queryKey: CARDS_KEY });
      qc.setQueryData<Card[]>(CARDS_KEY, (list) => patchCard(list, id, (c) => ({ ...c, owned })));
    },
    onError: (_err, vars) => {
      qc.setQueryData<Card[]>(CARDS_KEY, (list) =>
        patchCard(list, vars.id, (c) => ({ ...c, owned: !vars.owned })),
      );
      handlers.onError?.(vars);
    },
    onSuccess: (card, vars) => {
      qc.setQueryData<Card[]>(CARDS_KEY, (list) => patchCard(list, card.id, () => card));
      handlers.onSuccess?.(card, vars);
    },
  });
}
