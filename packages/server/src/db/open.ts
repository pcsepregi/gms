import Database from 'better-sqlite3';

export type Db = Database.Database;

/** Adatbázis megnyitása WAL módban, idegen kulcs ellenőrzéssel. */
export function openDb(file: string): Db {
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  return db;
}
