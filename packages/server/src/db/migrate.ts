import fs from 'node:fs';
import path from 'node:path';
import type { Db } from './open.js';

export interface Migration {
  version: number;
  name: string;
  sql: string;
}

export interface MigrationResult {
  from: number;
  to: number;
  applied: string[];
  backupFile: string | null;
}

export class MigrationError extends Error {}

const FILE_PATTERN = /^(\d+)_[\w-]+\.sql$/u;

export function loadMigrations(dir: string): Migration[] {
  const migrations = fs
    .readdirSync(dir)
    .filter((f) => FILE_PATTERN.test(f))
    .map((name) => ({
      version: Number(FILE_PATTERN.exec(name)![1]),
      name,
      sql: fs.readFileSync(path.join(dir, name), 'utf8'),
    }))
    .sort((a, b) => a.version - b.version);

  migrations.forEach((m, i) => {
    if (m.version !== i + 1) {
      throw new MigrationError(`A migrációk sorszáma nem folytonos: ${m.name}`);
    }
  });
  return migrations;
}

export function schemaVersion(db: Db): number {
  return db.pragma('user_version', { simple: true }) as number;
}

/**
 * Lefuttatja a még nem futott migrációkat egyetlen tranzakcióban (technikai spec 9.3).
 * Meglévő (nem üres) adatbázisnál előtte másolatot készít:
 * `<db>.pre-migration-<célverzió>`.
 */
export function migrate(db: Db, dir: string): MigrationResult {
  const all = loadMigrations(dir);
  const from = schemaVersion(db);
  const pending = all.filter((m) => m.version > from);
  const to = all.length ? all[all.length - 1]!.version : from;

  if (from > to) {
    throw new MigrationError(
      `Az adatbázis újabb verziójú (${from}), mint amit ez a program ismer (${to}).`,
    );
  }
  if (!pending.length) return { from, to: from, applied: [], backupFile: null };

  let backupFile: string | null = null;
  if (from > 0 && db.name && db.name !== ':memory:') {
    backupFile = `${db.name}.pre-migration-${to}`;
    fs.rmSync(backupFile, { force: true });
    db.exec(`VACUUM INTO '${backupFile.replaceAll("'", "''")}'`);
  }

  const run = db.transaction(() => {
    for (const m of pending) {
      try {
        db.exec(m.sql);
      } catch (err) {
        throw new MigrationError(`Hibás migráció (${m.name}): ${(err as Error).message}`);
      }
    }
    db.pragma(`user_version = ${to}`);
    db.prepare(
      `INSERT INTO app_meta (key, value) VALUES ('schema_version', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    ).run(String(to));
  });
  run();

  return { from, to, applied: pending.map((m) => m.name), backupFile };
}
