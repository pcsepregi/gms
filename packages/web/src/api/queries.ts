import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  Card,
  CardInput,
  Finish,
  FinishInput,
  Health,
  ImageStatusCounts,
  ImportSummary,
  Language,
  LanguageInput,
  Lookups,
  Stats,
} from '@gms/shared';
import { ApiError, deleteJson, getJson, sendJson } from './client';

export const CARDS_KEY = ['cards'] as const;
export const LOOKUPS_KEY = ['lookups'] as const;

/** Nyelvek, finish-ek, meglévő Pokémon- és setnevek az űrlap javaslataihoz. */
export const useLookups = () =>
  useQuery({ queryKey: LOOKUPS_KEY, queryFn: () => getJson<Lookups>('/api/lookups') });

/** Amíg van képre váró kártya, a lista 3 másodpercenként frissül (S-41/EF2). */
const POLL_MS = 3000;

export const useCards = () =>
  useQuery({
    queryKey: CARDS_KEY,
    queryFn: () => getJson<Card[]>('/api/cards'),
    refetchInterval: (q) =>
      q.state.data?.some((c) => c.image.status === 'pending') ? POLL_MS : false,
  });

export const IMAGE_STATUS_KEY = ['image-status'] as const;

/** A képgyűjtés állapota (darabszámok), a Beállításokhoz. */
export const useImageStatus = () =>
  useQuery({
    queryKey: IMAGE_STATUS_KEY,
    queryFn: () => getJson<ImageStatusCounts>('/api/images/status'),
    refetchInterval: (q) => ((q.state.data?.pending ?? 0) > 0 ? POLL_MS : false),
  });

/** Kép újrakeresése (S-43): a kártya `pending` lesz, a lista pollozása hozza az eredményt. */
export function useRefreshImage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => sendJson<Card>('POST', `/api/cards/${id}/image/refresh`, {}),
    onSuccess: (card) => {
      qc.setQueryData<Card[]>(CARDS_KEY, (list) => patchCard(list, card.id, () => card));
      void qc.invalidateQueries({ queryKey: IMAGE_STATUS_KEY });
    },
  });
}

/** Dashboard statisztikák; minden megnyitáskor frissül (S-31/EF3). */
export const useStats = () =>
  useQuery({
    queryKey: ['stats'],
    queryFn: () => getJson<Stats>('/api/stats'),
    staleTime: 0,
    refetchOnMount: 'always',
  });

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

/** A kártyák és a javaslatok frissítése egy módosítás után (a azonosítók is változhatnak). */
function useRefreshAll() {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: CARDS_KEY }),
      qc.invalidateQueries({ queryKey: LOOKUPS_KEY }),
    ]);
}

export function useSaveCard() {
  const qc = useQueryClient();
  const refresh = useRefreshAll();
  return useMutation({
    mutationFn: ({ id, input }: { id: number | null; input: CardInput }) =>
      id === null
        ? sendJson<Card>('POST', '/api/cards', input)
        : sendJson<Card>('PATCH', `/api/cards/${id}`, input),
    onSuccess: async (card) => {
      // Azonnal látszik (S-23/EF4), a háttérben a teljes lista is frissül.
      qc.setQueryData<Card[]>(
        CARDS_KEY,
        (list) =>
          list &&
          (list.some((c) => c.id === card.id)
            ? patchCard(list, card.id, () => card)
            : [...list, card]),
      );
      await refresh();
    },
  });
}

export function useDeleteCard() {
  const qc = useQueryClient();
  const refresh = useRefreshAll();
  return useMutation({
    mutationFn: (id: number) => deleteJson(`/api/cards/${id}`),
    onSuccess: async (_v, id) => {
      qc.setQueryData<Card[]>(CARDS_KEY, (list) => list?.filter((c) => c.id !== id));
      await refresh();
    },
  });
}

export function useCreateFinish() {
  const refresh = useRefreshAll();
  return useMutation({
    mutationFn: (input: FinishInput) => sendJson<Finish>('POST', '/api/finishes', input),
    onSuccess: () => refresh(),
  });
}

export function useUpdateFinish() {
  const refresh = useRefreshAll();
  return useMutation({
    mutationFn: ({ id, description }: { id: number; description: string }) =>
      sendJson<Finish>('PATCH', `/api/finishes/${id}`, { description }),
    onSuccess: () => refresh(),
  });
}

export function useCreateLanguage() {
  const refresh = useRefreshAll();
  return useMutation({
    mutationFn: (input: LanguageInput) => sendJson<Language>('POST', '/api/languages', input),
    onSuccess: () => refresh(),
  });
}
