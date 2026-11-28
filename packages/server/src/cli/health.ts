import type { Health, ImageStatusCounts, Stats } from '@gms/shared';
import type { BackupStatus } from '../backup.js';

export interface HealthIo {
  out: (line: string) => void;
  err: (line: string) => void;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

export interface HealthOptions {
  port: number;
  /** Ennyi másodpercig vár, amíg a szerver válaszol (0: egyszer próbál). */
  waitSeconds: number;
}

export interface HealthReport {
  health: Health;
  stats: (Pick<Stats['total'], 'all' | 'owned'> & { onTheWay?: number }) | null;
  images: ImageStatusCounts | null;
  backup: BackupStatus | null;
}

const sleepMs = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function getJson<T>(f: typeof fetch, url: string): Promise<T | null> {
  try {
    const res = await f(url, { signal: AbortSignal.timeout(3000) });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

/** A futó szerver állapota a 127.0.0.1 címen; `null`, ha a megadott időn belül nem válaszol. */
export async function checkHealth(opts: HealthOptions, io: HealthIo): Promise<HealthReport | null> {
  const f = io.fetch ?? fetch;
  const sleep = io.sleep ?? sleepMs;
  const base = `http://127.0.0.1:${opts.port}`;
  const deadline = Date.now() + opts.waitSeconds * 1000;
  let health: Health | null;
  for (;;) {
    health = await getJson<Health>(f, `${base}/api/health`);
    if (health?.ok || Date.now() >= deadline) break;
    await sleep(500);
  }
  if (!health?.ok) return null;
  const [stats, images, backup] = await Promise.all([
    getJson<Stats>(f, `${base}/api/stats`),
    getJson<ImageStatusCounts>(f, `${base}/api/images/status`),
    getJson<BackupStatus>(f, `${base}/api/backup/status`),
  ]);
  return { health, stats: stats?.total ?? null, images, backup };
}

/** Magyar nyelvű összefoglaló sorok; a második elem a figyelmeztetések száma. */
export function formatHealth(r: HealthReport, port: number): { lines: string[]; warnings: number } {
  const lines = [
    `A GMS fut: http://127.0.0.1:${port} (verzió: ${r.health.version})`,
    `Adatbázis: ${r.health.dbPath}`,
  ];
  let warnings = 0;
  if (r.stats) {
    lines.push(
      `Kártyák: ${r.stats.all} (megvan: ${r.stats.owned}, hiányzik: ${r.stats.all - r.stats.owned}${r.stats.onTheWay ? `, ebből úton: ${r.stats.onTheWay}` : ''})`,
    );
    if (r.stats.all === 0) {
      lines.push('FIGYELEM: az adatbázis üres, még nem volt import.');
      warnings++;
    }
  }
  if (r.images) {
    const i = r.images;
    lines.push(
      `Képek: pontos ${i.exact}, más nyelvű ${i.fallback}, nincs ${i.none}, hibás ${i.error}, folyamatban ${i.pending}`,
    );
  }
  if (r.backup) {
    const b = r.backup;
    if (!b.configured) {
      lines.push('FIGYELEM: a napi mentés nincs beállítva (backupDir a config.json-ban).');
      warnings++;
    } else if (b.lastStatus === 'error') {
      lines.push(`FIGYELEM: az utolsó mentés hibás: ${b.lastError ?? 'ismeretlen hiba'}`);
      warnings++;
    } else if (!b.lastOkAt) {
      lines.push(`Mentés: még nem volt (cél: ${b.targetDir ?? '-'})`);
    } else {
      lines.push(`Mentés: utolsó sikeres ${b.lastOkAt} (cél: ${b.targetDir ?? '-'})`);
      if (b.stale) {
        lines.push('FIGYELEM: az utolsó sikeres mentés 26 óránál régebbi.');
        warnings++;
      }
    }
  }
  return { lines, warnings };
}
