import { parseArgs } from 'node:util';
import { loadConfig } from '../config.js';
import { restoreFromBackup, RestoreError } from '../restore.js';

export interface RestoreIo {
  out: (line: string) => void;
  err: (line: string) => void;
  env?: NodeJS.ProcessEnv;
  /** Igaz, ha a szerver fut (a 127.0.0.1 health végpontja válaszol). */
  isServerRunning?: (port: number) => Promise<boolean>;
}

const USAGE =
  'Használat: npm run restore -- --date ÉÉÉÉ-HH-NN | --file <mentés.sqlite> [--data-dir <mappa>]';

/** Alapértelmezett ellenőrzés: a szerver health végpontja válaszol-e. */
export async function serverRunning(port: number): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/health`, {
      signal: AbortSignal.timeout(1000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** `npm run restore -- --date …` (technikai spec 11., S-54). Visszatérési érték: kilépési kód. */
export async function runRestoreCli(argv: string[], io: RestoreIo): Promise<number> {
  let args;
  try {
    args = parseArgs({
      args: argv,
      options: {
        date: { type: 'string' },
        file: { type: 'string', short: 'f' },
        'data-dir': { type: 'string' },
        help: { type: 'boolean', short: 'h', default: false },
      },
    }).values;
  } catch (err) {
    io.err(`${(err as Error).message}\n${USAGE}`);
    return 2;
  }
  if (args.help) {
    io.out(USAGE);
    return 0;
  }
  if (!args.date && !args.file) {
    io.err(`Hiányzik a --date vagy a --file kapcsoló.\n${USAGE}`);
    return 2;
  }
  if (args.date && !/^\d{4}-\d{2}-\d{2}$/u.test(args.date)) {
    io.err(`Hibás dátum (ÉÉÉÉ-HH-NN várt): ${args.date}`);
    return 2;
  }

  try {
    const config = loadConfig({ dataDir: args['data-dir'], env: io.env });
    const running = await (io.isServerRunning ?? serverRunning)(config.port);
    if (running) {
      io.err(
        'A szerver fut. Előbb állítsd le (launchctl bootout gui/$UID/local.gms.server), utána futtasd újra a visszaállítást.',
      );
      return 1;
    }
    const result = restoreFromBackup(config, { date: args.date, file: args.file });
    io.out(`Mentés: ${result.source} (${result.cards} kártya)`);
    if (result.beforeRestore) io.out(`A korábbi adatbázis félretéve: ${result.beforeRestore}`);
    if (result.imagesCopied) io.out(`Képek visszamásolva: ${result.imagesCopied}`);
    io.out('Kész. Indítsd újra a szervert (launchctl kickstart -k gui/$UID/local.gms.server).');
    return 0;
  } catch (err) {
    io.err(err instanceof RestoreError ? err.message : `Hiba: ${(err as Error).message}`);
    return 1;
  }
}
