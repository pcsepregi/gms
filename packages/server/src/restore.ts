import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import type { Config } from './config.js';

export class RestoreError extends Error {}

export interface RestoreResult {
  source: string;
  beforeRestore: string | null;
  cards: number;
  imagesCopied: number;
}

/** Egy mentési fájl ellenőrzése: nyitható, integritás ok, GMS séma, kártyaszám. */
export function checkBackupFile(file: string): number {
  const db = new Database(file, { readonly: true, fileMustExist: true });
  try {
    const integrity = db.pragma('integrity_check', { simple: true });
    if (integrity !== 'ok') {
      throw new RestoreError(`A mentés sérült (integritás: ${String(integrity)}).`);
    }
    const hasCard = db
      .prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name = 'card'")
      .get() as { n: number };
    if (hasCard.n === 0) throw new RestoreError('A fájl nem GMS adatbázis (nincs "card" tábla).');
    return (db.prepare('SELECT COUNT(*) AS n FROM card').get() as { n: number }).n;
  } finally {
    db.close();
  }
}

/**
 * Visszaállítás mentésből (S-54, technikai spec 11.). A szervernek állnia kell (ezt a CLI ellenőrzi).
 * A jelenlegi adatbázist `gms.sqlite.before-restore-<időbélyeg>` néven félreteszi, így a
 * visszaállítás is visszafordítható. Napi mentésnél a képtükör visszakerül az image-mappába.
 * Az újraindítás a hívó dolga (launchd).
 */
export function restoreFromBackup(
  config: Config,
  opts: { date?: string; file?: string; now?: Date },
): RestoreResult {
  const now = opts.now ?? new Date();
  let source: string;
  if (opts.file) {
    source = path.resolve(opts.file);
  } else if (opts.date) {
    if (!config.backupDir) throw new RestoreError('Nincs beállítva OneDrive mappa (backupDir).');
    source = path.join(config.backupDir, 'backups', `gms-${opts.date}.sqlite`);
  } else {
    throw new RestoreError('Meg kell adni a --date vagy a --file kapcsolót.');
  }
  if (!fs.existsSync(source)) throw new RestoreError(`Nincs ilyen mentés: ${source}`);
  const cards = checkBackupFile(source);

  // Jelenlegi állapot félretétele (S-54/EF2).
  let beforeRestore: string | null = null;
  if (fs.existsSync(config.dbPath)) {
    beforeRestore = `${config.dbPath}.before-restore-${now.toISOString().replace(/[:.]/gu, '-')}`;
    fs.renameSync(config.dbPath, beforeRestore);
    for (const ext of ['-wal', '-shm']) {
      if (fs.existsSync(config.dbPath + ext))
        fs.renameSync(config.dbPath + ext, beforeRestore + ext);
    }
  }
  fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });
  fs.copyFileSync(source, config.dbPath);

  // Képek: a napi mentés képtükre (a backups/ melletti images/ mappa) visszakerül.
  let imagesCopied = 0;
  const backupImages = path.join(path.dirname(source), '..', 'images');
  if (!opts.file && fs.existsSync(backupImages)) {
    fs.mkdirSync(config.imagesDir, { recursive: true });
    for (const name of fs.readdirSync(backupImages)) {
      fs.copyFileSync(path.join(backupImages, name), path.join(config.imagesDir, name));
      imagesCopied++;
    }
  }
  return { source, beforeRestore, cards, imagesCopied };
}
