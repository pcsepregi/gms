import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { runRestoreCli } from '../src/cli/restore.js';
import { checkBackupFile, restoreFromBackup, RestoreError } from '../src/restore.js';
import { runBackupExclusive } from '../src/backup.js';
import { openDatabase } from '../src/database.js';
import { setOwned } from '../src/cards.js';
import { importExcel } from '../src/import/run.js';
import { fixture, tempDir, testConfig, testDb } from './helpers.js';

const captured = () => {
  const out: string[] = [];
  const err: string[] = [];
  return {
    out,
    err,
    io: { out: (l: string) => out.push(l), err: (l: string) => err.push(l), env: {} },
  };
};

describe('visszaállítás mentésből (S-54)', () => {
  it('T-BAK-08: mentés, módosítás, visszaállítás: a régi állapot tér vissza, a módosított félretéve marad', async () => {
    const config = testConfig({ backupDir: tempDir() });
    const first = testDb(config);
    await importExcel(first.db, fixture('sample-master.xlsx'));
    const day = new Date(2026, 10, 27, 9);
    await runBackupExclusive(first.db, config, day);
    setOwned(first.db, 1, false);
    expect(first.db.prepare('SELECT owned FROM card WHERE id = 1').get()).toEqual({ owned: 0 });
    first.db.close();

    const res = restoreFromBackup(config, { date: '2026-11-27' });
    expect(res.cards).toBe(43);
    expect(res.beforeRestore).toBeTruthy();
    expect(fs.existsSync(res.beforeRestore!)).toBe(true);

    const { db } = openDatabase(config);
    expect(db.prepare('SELECT owned FROM card WHERE id = 1').get()).toEqual({ owned: 1 });
    db.close();
    // a félretett fájlban a módosított állapot van
    const old = new Database(res.beforeRestore!, { readonly: true });
    expect(old.prepare('SELECT owned FROM card WHERE id = 1').get()).toEqual({ owned: 0 });
    old.close();
  });

  it('hiányzó mentés és nem GMS fájl elutasítva', () => {
    const config = testConfig({ backupDir: tempDir() });
    expect(() => restoreFromBackup(config, { date: '2026-01-01' })).toThrow(RestoreError);
    const bogus = path.join(tempDir(), 'bogus.sqlite');
    const other = new Database(bogus);
    other.exec('CREATE TABLE x (a)');
    other.close();
    expect(() => checkBackupFile(bogus)).toThrow(/nem GMS/u);
    expect(() => restoreFromBackup(config, {})).toThrow(/--date vagy a --file/u);
  });

  it('backupDir nélkül dátumos visszaállítás nem indul', () => {
    const config = testConfig();
    expect(() => restoreFromBackup(config, { date: '2026-11-27' })).toThrow(/backupDir/u);
  });
});

describe('restore CLI', () => {
  it('hiányzó kapcsoló és hibás dátum: 2-es kilépési kód', async () => {
    const c = captured();
    expect(await runRestoreCli([], c.io)).toBe(2);
    expect(c.err[0]).toMatch(/Hiányzik/u);
    const d = captured();
    expect(await runRestoreCli(['--date', '2026/11/27'], d.io)).toBe(2);
    expect(d.err[0]).toMatch(/Hibás dátum/u);
  });

  it('fut a szerver: nem állítja vissza, 1-es kód', async () => {
    const dataDir = tempDir();
    const c = captured();
    const code = await runRestoreCli(['--file', '/x.sqlite', '--data-dir', dataDir], {
      ...c.io,
      isServerRunning: async () => true,
    });
    expect(code).toBe(1);
    expect(c.err[0]).toMatch(/A szerver fut/u);
  });

  it('hibás fájl: 1-es kód és üzenet', async () => {
    const dataDir = tempDir();
    const c = captured();
    const code = await runRestoreCli(['--file', '/nincs/ilyen.sqlite', '--data-dir', dataDir], {
      ...c.io,
      isServerRunning: async () => false,
    });
    expect(code).toBe(1);
    expect(c.err[0]).toMatch(/Nincs ilyen mentés/u);
  });

  it('sikeres visszaállítás: kiírja a forrást és a félretett fájlt', async () => {
    const config = testConfig({ backupDir: tempDir() });
    const { db } = testDb(config);
    await importExcel(db, fixture('sample-master.xlsx'));
    await runBackupExclusive(db, config, new Date(2026, 10, 28, 9));
    db.close();
    const c = captured();
    const code = await runRestoreCli(['--date', '2026-11-28', '--data-dir', config.dataDir], {
      ...c.io,
      isServerRunning: async () => false,
    });
    expect(code).toBe(0);
    expect(c.out.join('\n')).toMatch(/A korábbi adatbázis félretéve/u);
  });
});
