import { ensureDataDirs, type Config } from './config.js';
import { migrate, type MigrationResult } from './db/migrate.js';
import { openDb, type Db } from './db/open.js';
import { MIGRATIONS_DIR } from './paths.js';

/** Megnyitja (szükség esetén létrehozza) az adatbázist és lefuttatja a migrációkat. */
export function openDatabase(
  config: Config,
  migrationsDir: string = MIGRATIONS_DIR,
): { db: Db; migration: MigrationResult } {
  ensureDataDirs(config);
  const db = openDb(config.dbPath);
  try {
    const migration = migrate(db, migrationsDir);
    return { db, migration };
  } catch (err) {
    db.close();
    throw err;
  }
}
