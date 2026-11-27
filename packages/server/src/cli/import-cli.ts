import { parseArgs } from 'node:util';
import { loadConfig } from '../config.js';
import { openDatabase } from '../database.js';
import { ImportError } from '../import/errors.js';
import { formatSummary, importExcel } from '../import/run.js';

export interface CliIo {
  out: (line: string) => void;
  err: (line: string) => void;
  env?: NodeJS.ProcessEnv;
}

const USAGE = 'Használat: npm run import -- --file <excel.xlsx> [--data-dir <mappa>]';

/**
 * `npm run import -- --file …` (technikai spec 5.). Visszatérési érték: kilépési kód.
 */
export async function runImportCli(argv: string[], io: CliIo): Promise<number> {
  let args;
  try {
    args = parseArgs({
      args: argv,
      options: {
        file: { type: 'string', short: 'f' },
        'data-dir': { type: 'string' },
        force: { type: 'boolean', default: false },
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
  if (!args.file) {
    io.err(`Hiányzik a --file kapcsoló.\n${USAGE}`);
    return 2;
  }

  let db;
  try {
    const config = loadConfig({ dataDir: args['data-dir'], env: io.env });
    db = openDatabase(config).db;
    const summary = await importExcel(db, args.file, { force: args.force });
    io.out(formatSummary(summary));
    io.out(`Adatbázis: ${config.dbPath}`);
    return 0;
  } catch (err) {
    io.err(err instanceof ImportError ? err.message : `Hiba: ${(err as Error).message}`);
    return 1;
  } finally {
    db?.close();
  }
}
