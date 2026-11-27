import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadMigrations, migrate, MigrationError, schemaVersion } from '../src/db/migrate.js';
import { openDb } from '../src/db/open.js';
import { MIGRATIONS_DIR } from '../src/paths.js';
import { tempDir } from './helpers.js';

function migrationsDir(files: Record<string, string>): string {
  const dir = tempDir('gms-mig-');
  for (const [name, sql] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), sql);
  return dir;
}

const V1 = fs.readFileSync(path.join(MIGRATIONS_DIR, '001_init.sql'), 'utf8');

describe('migrációk (T-MIG-01, T-MIG-02)', () => {
  it('üres adatbázison létrejön a séma, a 13 nyelv, nincs pre-migration másolat', () => {
    const file = path.join(tempDir(), 'gms.sqlite');
    const db = openDb(file);
    const r = migrate(db, MIGRATIONS_DIR);
    expect(r).toMatchObject({ from: 0, to: 1, applied: ['001_init.sql'], backupFile: null });
    expect(schemaVersion(db)).toBe(1);
    const tables = (
      db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as {
        name: string;
      }[]
    ).map((t) => t.name);
    expect(tables).toEqual(['app_meta', 'backup_log', 'card', 'finish', 'language']);
    expect((db.prepare('SELECT COUNT(*) n FROM language').get() as { n: number }).n).toBe(13);
    expect(db.pragma('journal_mode', { simple: true })).toBe('wal');
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
    // Ismételt futtatás: nincs teendő.
    expect(migrate(db, MIGRATIONS_DIR).applied).toEqual([]);
    db.close();
  });

  it('korábbi verziójú adatbázis: az adatok megmaradnak, pre-migration másolat készül', () => {
    const file = path.join(tempDir(), 'gms.sqlite');
    const dir = migrationsDir({ '001_init.sql': V1 });
    const db = openDb(file);
    migrate(db, dir);
    db.prepare("INSERT INTO app_meta (key, value) VALUES ('marker', 'régi')").run();

    fs.writeFileSync(path.join(dir, '002_extra.sql'), 'ALTER TABLE finish ADD COLUMN extra TEXT;');
    const r = migrate(db, dir);
    expect(r).toMatchObject({ from: 1, to: 2, applied: ['002_extra.sql'] });
    expect(r.backupFile).toBe(`${file}.pre-migration-2`);
    expect(fs.existsSync(r.backupFile!)).toBe(true);
    expect(db.prepare("SELECT value FROM app_meta WHERE key='marker'").get()).toEqual({
      value: 'régi',
    });
    expect(db.prepare("SELECT value FROM app_meta WHERE key='schema_version'").get()).toEqual({
      value: '2',
    });
    const copy = openDb(r.backupFile!);
    expect(schemaVersion(copy)).toBe(1);
    copy.close();
    db.close();
  });

  it('hibás migráció: visszagörgetés, az adatbázis változatlan', () => {
    const file = path.join(tempDir(), 'gms.sqlite');
    const dir = migrationsDir({ '001_init.sql': V1 });
    const db = openDb(file);
    migrate(db, dir);
    fs.writeFileSync(path.join(dir, '002_ok.sql'), 'CREATE TABLE should_not_exist (id INTEGER);');
    fs.writeFileSync(path.join(dir, '003_bad.sql'), 'ALTER TABLE nincs_ilyen ADD COLUMN x;');
    expect(() => migrate(db, dir)).toThrow(MigrationError);
    expect(() => migrate(db, dir)).toThrow(/003_bad\.sql/u);
    expect(schemaVersion(db)).toBe(1);
    expect(
      db.prepare("SELECT name FROM sqlite_master WHERE name='should_not_exist'").get(),
    ).toBeUndefined();
    db.close();
  });

  it('nem folytonos sorszám és újabb adatbázis-verzió hibát ad', () => {
    expect(() => loadMigrations(migrationsDir({ '001_a.sql': '', '003_b.sql': '' }))).toThrow(
      /nem folytonos/u,
    );
    const db = openDb(':memory:');
    db.pragma('user_version = 5');
    expect(() => migrate(db, migrationsDir({ '001_a.sql': '' }))).toThrow(/újabb verziójú/u);
    db.close();
  });

  it('a nem SQL fájlokat figyelmen kívül hagyja; memóriában nincs másolat', () => {
    const dir = migrationsDir({ '001_init.sql': V1, 'README.md': '# x' });
    const db = openDb(':memory:');
    expect(migrate(db, dir).applied).toEqual(['001_init.sql']);
    fs.writeFileSync(path.join(dir, '002_x.sql'), 'CREATE TABLE x (id INTEGER);');
    expect(migrate(db, dir).backupFile).toBeNull();
    db.close();
  });

  it('T-DUP-04: a természetes kulcs UNIQUE megkötése közvetlen beszúrásnál is véd', () => {
    const db = openDb(':memory:');
    migrate(db, MIGRATIONS_DIR);
    db.prepare("INSERT INTO finish (name, sort_order) VALUES ('Normal', 1)").run();
    const insert = db.prepare(`INSERT INTO card (pokemon, set_name, card_number, finish_id,
      language_id, display_id, created_at, updated_at, natural_key)
      VALUES ('Lechonk', 'S', '1', 1, 1, 'x', 't', 't', 'k')`);
    insert.run();
    expect(() => insert.run()).toThrow(/UNIQUE/u);
    expect(() =>
      db
        .prepare(
          `INSERT INTO card (pokemon, set_name, card_number, finish_id, language_id,
          display_id, created_at, updated_at, natural_key) VALUES ('L','S','1',99,1,'x','t','t','k2')`,
        )
        .run(),
    ).toThrow(/FOREIGN KEY/u);
    db.close();
  });
});
