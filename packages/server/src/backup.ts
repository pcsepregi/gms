import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import type { Card } from '@gms/shared';
import type { Config } from './config.js';
import type { Db } from './db/open.js';
import { getMeta, setMeta } from './db/meta.js';
import { listCards } from './cards.js';
import { dateStamp, toXlsx } from './export.js';

export const LAST_OK_KEY = 'last_backup_ok_at';
export const LAST_STATUS_KEY = 'last_backup_status';
/** Ennyi óra után a fejlécben figyelmeztetés (S-53/EF2). */
export const STALE_HOURS = 26;
export const KEEP_DAILY = 30;
export const KEEP_MONTHLY_MONTHS = 12;

export interface BackupStatus {
  configured: boolean;
  targetDir: string | null;
  lastOkAt: string | null;
  lastStatus: 'ok' | 'error' | null;
  lastError: string | null;
  stale: boolean;
  running: boolean;
}

/**
 * Egy napi mentés: SQLite online másolat, XLSX export, képtükör, ellenőrzés, megőrzés.
 * Hibánál `backup_log`-ba ír és dob; a hívó kezeli a állapotot.
 */
export async function runBackup(
  db: Db,
  config: Config,
  now: Date = new Date(),
): Promise<{ file: string; cards: number }> {
  const target = config.backupDir;
  if (!target) throw new Error('Nincs beállítva OneDrive mappa (config.json: backupDir).');
  const stamp = dateStamp(now);
  const dir = path.join(target, 'backups');
  const started = now.toISOString();
  const logId = db
    .prepare('INSERT INTO backup_log (started_at, status, target) VALUES (?, ?, ?)')
    .run(started, 'error', target).lastInsertRowid;
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.accessSync(target, fs.constants.W_OK);

    // 1. SQLite konzisztens másolat (futás közben is biztonságos).
    const tmp = path.join(dir, `.gms-${stamp}.tmp.sqlite`);
    fs.rmSync(tmp, { force: true });
    await db.backup(tmp);
    const check = new Database(tmp, { readonly: true });
    let integrity: string;
    let dbCards: number;
    try {
      integrity = check.pragma('integrity_check', { simple: true }) as string;
      dbCards = (check.prepare('SELECT COUNT(*) AS n FROM card').get() as { n: number }).n;
    } finally {
      check.close();
    }
    const liveCards = (db.prepare('SELECT COUNT(*) AS n FROM card').get() as { n: number }).n;
    if (integrity !== 'ok' || dbCards !== liveCards) {
      fs.rmSync(tmp, { force: true });
      throw new Error(`A mentés ellenőrzése nem sikerült (integritás: ${integrity}).`);
    }
    fs.renameSync(tmp, path.join(dir, `gms-${stamp}.sqlite`));

    // 2. Ember által olvasható XLSX.
    const cards: Card[] = listCards(db);
    fs.writeFileSync(path.join(dir, `gms-${stamp}.xlsx`), await toXlsx(cards));

    // 3. Képtükör: új/módosult másolása, törölt kép törlése.
    mirrorImages(config.imagesDir, path.join(target, 'images'));

    // 4. Megőrzés.
    prune(dir, now);

    db.prepare('UPDATE backup_log SET finished_at = ?, status = ?, message = ? WHERE id = ?').run(
      new Date().toISOString(),
      'ok',
      `${cards.length} kártya`,
      logId,
    );
    setMeta(db, LAST_OK_KEY, new Date().toISOString());
    setMeta(db, LAST_STATUS_KEY, 'ok');
    return { file: path.join(dir, `gms-${stamp}.sqlite`), cards: cards.length };
  } catch (err) {
    const message = (err as Error).message;
    db.prepare('UPDATE backup_log SET finished_at = ?, status = ?, message = ? WHERE id = ?').run(
      new Date().toISOString(),
      'error',
      message,
      logId,
    );
    setMeta(db, LAST_STATUS_KEY, `error:${message}`);
    throw err;
  }
}

let running = false;
export const isBackupRunning = () => running;

/** Egyszerre csak egy mentés futhat (kézi gomb és ütemező között). */
export async function runBackupExclusive(db: Db, config: Config, now = new Date()) {
  if (running) throw new Error('Már fut egy mentés.');
  running = true;
  try {
    return await runBackup(db, config, now);
  } finally {
    running = false;
  }
}

/** Képtükör: a forrásból másolja az új vagy módosult fájlokat, a forrásban már nem létezőket törli. */
export function mirrorImages(src: string, dst: string): { copied: number; removed: number } {
  fs.mkdirSync(dst, { recursive: true });
  const srcFiles = fs.existsSync(src) ? fs.readdirSync(src) : [];
  const wanted = new Set(srcFiles);
  let copied = 0;
  for (const name of srcFiles) {
    const s = path.join(src, name);
    const d = path.join(dst, name);
    const ss = fs.statSync(s);
    if (!ss.isFile()) continue;
    const ds = fs.existsSync(d) ? fs.statSync(d) : null;
    if (!ds || ds.size !== ss.size || ds.mtimeMs < ss.mtimeMs) {
      fs.copyFileSync(s, d);
      copied++;
    }
  }
  let removed = 0;
  for (const name of fs.readdirSync(dst)) {
    if (!wanted.has(name)) {
      fs.rmSync(path.join(dst, name), { force: true });
      removed++;
    }
  }
  return { copied, removed };
}

/** Megőrzési szabály (S-52/EF3): az utolsó 30 napi mentés, azon túl havonta az első, 12 hónapig. */
export function retentionKeep(stamps: string[], now: Date): Set<string> {
  const keep = new Set<string>();
  const sorted = [...new Set(stamps)].sort().reverse();
  const cutoff = new Date(now.getTime() - KEEP_DAILY * 86_400_000);
  const cutoffStamp = dateStamp(cutoff);
  const monthFirst = new Map<string, string>();
  for (const s of sorted) {
    if (s >= cutoffStamp) keep.add(s);
    const month = s.slice(0, 7);
    const cur = monthFirst.get(month);
    if (!cur || s < cur) monthFirst.set(month, s);
  }
  const monthCutoff = dateStamp(
    new Date(now.getFullYear(), now.getMonth() - KEEP_MONTHLY_MONTHS, now.getDate()),
  ).slice(0, 7);
  for (const [month, first] of monthFirst) if (month >= monthCutoff) keep.add(first);
  return keep;
}

function prune(dir: string, now: Date): void {
  const re = /^gms-(\d{4}-\d{2}-\d{2})\.(sqlite|xlsx)$/u;
  const files = fs.readdirSync(dir).filter((f) => re.test(f));
  const stamps = files.map((f) => re.exec(f)![1]!);
  const keep = retentionKeep(stamps, now);
  for (const f of files) {
    if (!keep.has(re.exec(f)![1]!)) fs.rmSync(path.join(dir, f), { force: true });
  }
}

export function backupStatus(
  db: Db,
  config: Config,
  now = new Date(),
  running = false,
): BackupStatus {
  const lastOkAt = getMeta(db, LAST_OK_KEY);
  const rawStatus = getMeta(db, LAST_STATUS_KEY);
  const lastStatus = rawStatus === null ? null : rawStatus === 'ok' ? 'ok' : 'error';
  const lastError = rawStatus && rawStatus.startsWith('error:') ? rawStatus.slice(6) : null;
  const ageH = lastOkAt ? (now.getTime() - Date.parse(lastOkAt)) / 3_600_000 : Infinity;
  return {
    configured: config.backupDir !== null,
    targetDir: config.backupDir,
    lastOkAt,
    lastStatus,
    lastError,
    stale: config.backupDir !== null && (lastStatus === 'error' || ageH > STALE_HOURS),
    running,
  };
}

/**
 * Ütemező: óránként megnéz, volt-e már aznap sikeres mentés (helyi idő). Ha nem, ment.
 * Így a felébredt vagy éjjel kikapcsolt Mac is pótolja a mentést (S-52/EF1).
 */
export function needsBackup(db: Db, now: Date): boolean {
  const last = getMeta(db, LAST_OK_KEY);
  if (!last) return true;
  return dateStamp(new Date(last)) !== dateStamp(now);
}
