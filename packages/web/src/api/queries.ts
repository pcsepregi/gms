import { useQuery } from '@tanstack/react-query';
import type { Card, Health, ImportSummary } from '@gms/shared';
import { ApiError, getJson } from './client';

export const useCards = () =>
  useQuery({ queryKey: ['cards'], queryFn: () => getJson<Card[]>('/api/cards') });

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
