import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { loadConfig } from '../config.js';
import { openDatabase } from '../database.js';
import { openDb } from '../db/open.js';
import { cardCount } from '../import/run.js';
import { renderLaunchAgent } from '../install/launchd.js';
import { checkHealth, formatHealth, type HealthIo } from './health.js';
import { setConfigValue } from './configure.js';
import { renameValues, summarizeRenames } from '../renames.js';

export interface OpsIo extends HealthIo {
  env?: NodeJS.ProcessEnv;
}

const USAGE = [
  'Használat:',
  '  npm run ops -- health [--wait <mp>] [--data-dir <mappa>]',
  '  npm run ops -- launch-agent --node <node> --app-dir <mappa> --log-dir <mappa>\n' +
    '                [--data-dir <mappa>] [--out <fájl>]',
  '  npm run ops -- config --data-dir <mappa> --set-backup-dir <mappa>',
  '  npm run ops -- config --data-dir <mappa> --get <mező>',
  '  npm run ops -- card-count [--data-dir <mappa>]',
  '  npm run ops -- snapshot --label <név> [--data-dir <mappa>]',
  '  npm run ops -- rename --file <átnevezések.json> [--apply] [--data-dir <mappa>]',
  '  npm run ops -- images-retry [--data-dir <mappa>]',
].join('\n');

/**
 * Üzemeltetési segédparancsok a telepítő szkriptekhez (M7). Visszatérési érték: kilépési kód.
 * - `health`: a futó szerver állapota (0: fut, 1: nem válaszol).
 * - `launch-agent`: a LaunchAgent plist kitöltése.
 * - `config`: a config.json olvasása / egy mező beállítása.
 * - `card-count`: a kártyák száma (a telepítő ebből dönti el, kell-e import).
 * - `snapshot`: helyi másolat az adatbázisról (frissítés előtt), futó szerver mellett is.
 * - `rename`: Pokémon-, setnév-, setkód-értékek átnevezése (alapból csak próbafuttatás).
 * - `images-retry`: a kép nélküli (hibás és nem talált) kártyák újra sorba állítása; a futó
 *   szerver képgyűjtője egy percen belül nekiáll (pl. a képkereső javítása után).
 */
export async function runOpsCli(argv: string[], io: OpsIo): Promise<number> {
  const [command, ...rest] = argv;
  let args;
  try {
    args = parseArgs({
      args: rest,
      options: {
        wait: { type: 'string', default: '0' },
        'data-dir': { type: 'string' },
        node: { type: 'string' },
        'app-dir': { type: 'string' },
        'log-dir': { type: 'string' },
        out: { type: 'string' },
        'set-backup-dir': { type: 'string' },
        get: { type: 'string' },
        label: { type: 'string' },
        file: { type: 'string' },
        apply: { type: 'boolean', default: false },
        quiet: { type: 'boolean', short: 'q', default: false },
      },
    }).values;
  } catch (err) {
    io.err(`${(err as Error).message}\n${USAGE}`);
    return 2;
  }

  try {
    switch (command) {
      case 'health': {
        const config = loadConfig({ dataDir: args['data-dir'], env: io.env });
        const wait = Number(args.wait);
        if (!Number.isFinite(wait) || wait < 0) {
          io.err(`Érvénytelen --wait érték: ${args.wait}`);
          return 2;
        }
        const report = await checkHealth({ port: config.port, waitSeconds: wait }, io);
        if (!report) {
          io.err(
            `A GMS nem válaszol a http://127.0.0.1:${config.port} címen` +
              (wait ? ` (${wait} mp várakozás után).` : '.') +
              ' Napló: ~/Library/Logs/GMS/gms.log',
          );
          return 1;
        }
        if (!args.quiet) formatHealth(report, config.port).lines.forEach((l) => io.out(l));
        return 0;
      }
      case 'launch-agent': {
        if (!args.node || !args['app-dir'] || !args['log-dir']) {
          io.err(`Hiányzó kapcsoló.\n${USAGE}`);
          return 2;
        }
        const xml = renderLaunchAgent({
          nodePath: args.node,
          appDir: args['app-dir'],
          logDir: args['log-dir'],
          dataDir: loadConfig({ dataDir: args['data-dir'], env: io.env }).dataDir,
        });
        if (args.out) {
          fs.mkdirSync(path.dirname(args.out), { recursive: true });
          fs.writeFileSync(args.out, xml);
          io.out(`LaunchAgent: ${args.out}`);
        } else {
          io.out(xml.trimEnd());
        }
        return 0;
      }
      case 'config': {
        const config = loadConfig({ dataDir: args['data-dir'], env: io.env });
        if (args['set-backup-dir'] !== undefined) {
          const dir = path.resolve(args['set-backup-dir']);
          const file = setConfigValue(config.dataDir, 'backupDir', dir);
          io.out(`Mentési mappa beállítva: ${dir} (${file})`);
          return 0;
        }
        if (args.get) {
          const value = (config as unknown as Record<string, unknown>)[args.get];
          if (value === undefined) {
            io.err(`Ismeretlen mező: ${args.get}`);
            return 2;
          }
          io.out(value === null ? '' : String(value));
          return 0;
        }
        io.err(USAGE);
        return 2;
      }
      case 'card-count': {
        const config = loadConfig({ dataDir: args['data-dir'], env: io.env });
        const { db } = openDatabase(config);
        try {
          io.out(String(cardCount(db)));
        } finally {
          db.close();
        }
        return 0;
      }
      case 'snapshot': {
        const config = loadConfig({ dataDir: args['data-dir'], env: io.env });
        if (!fs.existsSync(config.dbPath)) {
          io.out('Még nincs adatbázis, nincs mit menteni.');
          return 0;
        }
        const label = (args.label ?? 'snapshot').replace(/[^a-z0-9-]/giu, '');
        const stamp = new Date().toISOString().replace(/[:.]/gu, '-');
        const target = `${config.dbPath}.${label || 'snapshot'}-${stamp}`;
        const db = openDb(config.dbPath);
        try {
          await db.backup(target);
        } finally {
          db.close();
        }
        io.out(`Helyi másolat: ${target}`);
        return 0;
      }
      case 'rename': {
        if (!args.file) {
          io.err(`Hiányzik a --file.\n${USAGE}`);
          return 2;
        }
        const spec: unknown = JSON.parse(fs.readFileSync(args.file, 'utf8'));
        const config = loadConfig({ dataDir: args['data-dir'], env: io.env });
        const { db } = openDatabase(config);
        try {
          if (args.apply) {
            const stamp = new Date().toISOString().replace(/[:.]/gu, '-');
            const target = `${config.dbPath}.pre-rename-${stamp}`;
            await db.backup(target);
            io.out(`Helyi másolat: ${target}`);
          }
          summarizeRenames(renameValues(db, spec, args.apply)).forEach((l) => io.out(l));
        } finally {
          db.close();
        }
        return 0;
      }
      case 'images-retry': {
        const config = loadConfig({ dataDir: args['data-dir'], env: io.env });
        const { db } = openDatabase(config);
        try {
          const res = db
            .prepare(
              `UPDATE card SET image_status = 'pending' WHERE image_status IN ('error', 'none')`,
            )
            .run();
          io.out(`Újrakeresésre sorba állítva: ${res.changes} kártya.`);
        } finally {
          db.close();
        }
        return 0;
      }
      default:
        io.err(USAGE);
        return command === '--help' || command === '-h' ? 0 : 2;
    }
  } catch (err) {
    io.err(`Hiba: ${(err as Error).message}`);
    return 1;
  }
}
