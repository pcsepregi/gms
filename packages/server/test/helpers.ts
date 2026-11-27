import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach } from 'vitest';
import { loadConfig, type Config } from '../src/config.js';
import { openDatabase } from '../src/database.js';
import type { Db } from '../src/db/open.js';

export const FIXTURES = fileURLToPath(new URL('../../../fixtures/', import.meta.url));
export const fixture = (name: string) => path.join(FIXTURES, name);

const cleanups: (() => void)[] = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
});

export function tempDir(prefix = 'gms-test-'): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  cleanups.push(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

export function testConfig(extra: Record<string, unknown> = {}): Config {
  const dir = tempDir();
  if (Object.keys(extra).length) {
    fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify(extra));
  }
  return loadConfig({ dataDir: dir, env: {} });
}

export function testDb(config: Config = testConfig()): { db: Db; config: Config } {
  const { db } = openDatabase(config);
  cleanups.push(() => db.open && db.close());
  return { db, config };
}

export const LOCAL_HEADERS = { host: '127.0.0.1:4747' };
