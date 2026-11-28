import fs from 'node:fs';
import path from 'node:path';

export class ConfigureError extends Error {}

/**
 * A `config.json` egy mezőjének beállítása úgy, hogy a többi mező megmaradjon.
 * A telepítő ezzel írja be a OneDrive GMS mappát (`backupDir`).
 */
export function setConfigValue(dataDir: string, key: string, value: unknown): string {
  const file = path.join(dataDir, 'config.json');
  let current: Record<string, unknown> = {};
  if (fs.existsSync(file)) {
    try {
      current = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>;
    } catch (err) {
      throw new ConfigureError(`A config.json nem olvasható: ${(err as Error).message}`);
    }
  }
  fs.mkdirSync(dataDir, { recursive: true });
  const next = { ...current, [key]: value };
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(next, null, 2)}\n`);
  fs.renameSync(tmp, file);
  return file;
}
