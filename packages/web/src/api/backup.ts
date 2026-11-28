import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getJson, sendJson } from './client';

export interface BackupStatus {
  configured: boolean;
  targetDir: string | null;
  lastOkAt: string | null;
  lastStatus: 'ok' | 'error' | null;
  lastError: string | null;
  stale: boolean;
  running: boolean;
}

export const BACKUP_KEY = ['backup-status'] as const;

export const useBackupStatus = () =>
  useQuery({
    queryKey: BACKUP_KEY,
    queryFn: () => getJson<BackupStatus>('/api/backup/status'),
    refetchInterval: (q) => (q.state.data?.running ? 2000 : 60_000),
  });

export function useRunBackup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => sendJson<{ ok: true; cards: number }>('POST', '/api/backup/run', {}),
    onSettled: () => qc.invalidateQueries({ queryKey: BACKUP_KEY }),
  });
}
