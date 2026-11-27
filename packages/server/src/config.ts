import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const DEFAULT_PORT = 4747;
export const BIND_HOST = '127.0.0.1';

export interface Config {
  /** Az adatmappa: adatbázis, képek, config.json. */
  dataDir: string;
  dbPath: string;
  imagesDir: string;
  host: typeof BIND_HOST;
  port: number;
  /** A OneDrive GMS mappa (a mentéshez, M6). */
  backupDir: string | null;
  appTitle: string;
}

export class ConfigError extends Error {}

/** Alapértelmezett adatmappa: macOS-en ~/Library/Application Support/GMS (technikai spec 9.1). */
export function defaultDataDir(
  platform: NodeJS.Platform = process.platform,
  home: string = os.homedir(),
): string {
  if (platform === 'darwin') return path.join(home, 'Library', 'Application Support', 'GMS');
  return path.join(home, '.local', 'share', 'gms');
}

interface ConfigFile {
  host?: unknown;
  port?: unknown;
  backupDir?: unknown;
  appTitle?: unknown;
}

/**
 * Beállítások betöltése. Sorrend: GMS_DATA_DIR környezeti változó vagy paraméter,
 * azon belül a config.json, végül a GMS_PORT környezeti változó.
 */
export function loadConfig(opts: { dataDir?: string; env?: NodeJS.ProcessEnv } = {}): Config {
  const env = opts.env ?? process.env;
  const dataDir = path.resolve(opts.dataDir ?? env.GMS_DATA_DIR ?? defaultDataDir());
  const file = path.join(dataDir, 'config.json');

  let raw: ConfigFile = {};
  if (fs.existsSync(file)) {
    try {
      raw = JSON.parse(fs.readFileSync(file, 'utf8')) as ConfigFile;
    } catch (err) {
      throw new ConfigError(`A config.json nem olvasható: ${(err as Error).message}`);
    }
  }

  // A szerver csak a 127.0.0.1 címen hallgathat (S-61, T-SEC-01).
  if (raw.host !== undefined && raw.host !== BIND_HOST) {
    throw new ConfigError(
      `A szerver csak a ${BIND_HOST} címen futhat; a config.json "host" értéke nem engedélyezett: ${String(raw.host)}`,
    );
  }

  const portValue = env.GMS_PORT ?? raw.port ?? DEFAULT_PORT;
  const port = Number(portValue);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new ConfigError(`Érvénytelen port: ${String(portValue)}`);
  }

  return {
    dataDir,
    dbPath: path.join(dataDir, 'gms.sqlite'),
    imagesDir: path.join(dataDir, 'images'),
    host: BIND_HOST,
    port,
    backupDir: typeof raw.backupDir === 'string' && raw.backupDir ? raw.backupDir : null,
    appTitle:
      typeof raw.appTitle === 'string' && raw.appTitle
        ? raw.appTitle
        : 'Lechonk & Oinkologne gyűjtemény',
  };
}

export function ensureDataDirs(config: Config): void {
  fs.mkdirSync(config.dataDir, { recursive: true });
  fs.mkdirSync(config.imagesDir, { recursive: true });
}
