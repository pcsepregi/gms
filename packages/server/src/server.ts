import fs from 'node:fs';
import type { FastifyInstance } from 'fastify';
import { buildApp, type AppOptions } from './app.js';
import { loadConfig, type Config } from './config.js';
import { needsBackup, runBackupExclusive } from './backup.js';
import { openDatabase } from './database.js';
import { createImageCollector, type ImageCollector } from './images/index.js';
import { SERVER_PACKAGE_JSON } from './paths.js';

export function readVersion(): string {
  return (JSON.parse(fs.readFileSync(SERVER_PACKAGE_JSON, 'utf8')) as { version: string }).version;
}

/** Elindítja a szervert a 127.0.0.1 címen. A hívó felel a folyamat leállításáért. */
export async function startServer(
  config: Config = loadConfig(),
  opts: {
    logger?: AppOptions['logger'];
    webDistDir?: string | null;
    /** Egyedi képgyűjtő (tesztekhez); `false` kikapcsolja a háttérgyűjtést. */
    collector?: ImageCollector | false;
  } = {},
): Promise<FastifyInstance> {
  const { db, migration } = openDatabase(config);
  const collector =
    opts.collector === false
      ? null
      : (opts.collector ??
        createImageCollector({
          db,
          imagesDir: config.imagesDir,
          log: (msg, extra) => app.log.info(extra ?? {}, msg),
        }));
  const app = await buildApp({
    db,
    config,
    version: readVersion(),
    logger: opts.logger ?? true,
    webDistDir: opts.webDistDir,
    collector,
  });
  // Napi mentés ütemezője (S-52): induláskor és óránként ellenőriz, ha kell, ment.
  const tick = () => {
    if (!config.backupDir || !needsBackup(db, new Date())) return;
    runBackupExclusive(db, config).catch((err: Error) =>
      app.log.error({ err: err.message }, 'napi mentés sikertelen'),
    );
  };
  const timer = setInterval(tick, 60 * 60 * 1000);
  timer.unref();
  app.addHook('onClose', async () => {
    clearInterval(timer);
    await collector?.stop();
    db.close();
  });
  if (migration.applied.length) {
    app.log.info({ migration }, 'adatbázis-migrációk lefutottak');
  }
  try {
    await app.listen({ host: config.host, port: config.port });
  } catch (err) {
    await app.close();
    throw err;
  }
  setImmediate(tick);
  collector?.start();
  return app;
}
