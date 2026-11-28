import fs from 'node:fs';
import path from 'node:path';
import Fastify, {
  type FastifyInstance,
  type FastifyReply,
  type FastifyServerOptions,
} from 'fastify';
import fastifyStatic from '@fastify/static';
import type { ApiErrorBody, Health, ImageStatusCounts } from '@gms/shared';
import type { Config } from './config.js';
import type { Db } from './db/open.js';
import { z } from 'zod';
import {
  OnTheWayError,
  getCard,
  getImportSummary,
  getLookups,
  getStats,
  listCards,
  setOnTheWay,
  setOwned,
} from './cards.js';
import {
  createCard,
  createFinish,
  createLanguage,
  deleteCard,
  EditError,
  updateCard,
  updateFinish,
} from './editing.js';
import { IMAGE_FILE_RE, type ImageCollector } from './images/index.js';
import { createHttp, type Http } from './images/http.js';
import {
  MANUAL_UPLOAD_SOURCE,
  MAX_MANUAL_BYTES,
  ManualImageError,
  parseImageUrl,
  setManualImage,
} from './images/manual.js';
import { WEB_DIST_DIR } from './paths.js';
import { backupStatus, isBackupRunning, runBackupExclusive } from './backup.js';
import { exportFileName, safeNamePart, toCsv, toXlsx, type ExportFormat } from './export.js';
import type { Card } from '@gms/shared';

export interface AppOptions {
  db: Db;
  config: Config;
  version: string;
  /** A React build mappája; ha nem létezik, csak az API fut. */
  webDistDir?: string | null;
  /** `true`: naplózás a standard kimenetre; objektum: pl. `{ stream }` a naplófájlhoz. */
  logger?: FastifyServerOptions['logger'];
  /** A képgyűjtő háttérsor; nélküle a kártyák `pending` állapotban várnak. */
  collector?: ImageCollector | null;
  /** HTTP-kliens a kézi képlinkek letöltéséhez (tesztben cserélhető). */
  imageHttp?: Http;
}

export function sendError(
  reply: FastifyReply,
  status: number,
  code: string,
  message: string,
  details?: unknown,
): FastifyReply {
  const body: ApiErrorBody = {
    error: { code, message, ...(details === undefined ? {} : { details }) },
  };
  return reply.code(status).send(body);
}

const ownedBodySchema = z.object({ owned: z.boolean() }).strict();
const onTheWayBodySchema = z.object({ onTheWay: z.boolean() }).strict();

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function allowedHosts(port: number): Set<string> {
  return new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
}

export async function buildApp(opts: AppOptions): Promise<FastifyInstance> {
  const { db, config } = opts;
  const app = Fastify({ logger: opts.logger ?? false });
  const hosts = allowedHosts(config.port);
  const origins = new Set([...hosts].map((h) => `http://${h}`));

  // DNS-rebinding és idegen oldalak elleni védelem (technikai spec 6., S-61).
  app.addHook('onRequest', async (req, reply) => {
    const host = (req.headers.host ?? '').toLowerCase();
    if (!hosts.has(host)) {
      return sendError(reply, 403, 'FORBIDDEN_HOST', 'A kérés nem engedélyezett címről érkezett.');
    }
    const origin = req.headers.origin;
    if (
      !SAFE_METHODS.has(req.method) &&
      origin !== undefined &&
      !origins.has(origin.toLowerCase())
    ) {
      return sendError(
        reply,
        403,
        'FORBIDDEN_ORIGIN',
        'A kérés nem engedélyezett oldalról érkezett.',
      );
    }
  });

  app.get('/api/health', async (): Promise<Health> => {
    db.prepare('SELECT 1').get();
    return { ok: true, version: opts.version, dbPath: config.dbPath, appTitle: config.appTitle };
  });

  app.get('/api/cards', async () => listCards(db));

  app.get('/api/stats', async () => getStats(db));

  app.get<{ Params: { id: string } }>('/api/cards/:id', async (req, reply) => {
    const id = Number(req.params.id);
    const card = Number.isInteger(id) && id > 0 ? getCard(db, id) : null;
    if (!card) return sendError(reply, 404, 'NOT_FOUND', 'A kártya nem található.');
    return card;
  });

  app.put<{ Params: { id: string } }>('/api/cards/:id/owned', async (req, reply) => {
    const id = Number(req.params.id);
    const body = ownedBodySchema.safeParse(req.body);
    if (!body.success) {
      return sendError(reply, 400, 'VALIDATION', 'Hibás kérés: az "owned" mező igaz/hamis legyen.');
    }
    const card = Number.isInteger(id) && id > 0 ? setOwned(db, id, body.data.owned) : null;
    if (!card) return sendError(reply, 404, 'NOT_FOUND', 'A kártya nem található.');
    return card;
  });

  app.put<{ Params: { id: string } }>('/api/cards/:id/on-the-way', async (req, reply) => {
    const id = Number(req.params.id);
    const body = onTheWayBodySchema.safeParse(req.body);
    if (!body.success) {
      return sendError(
        reply,
        400,
        'VALIDATION',
        'Hibás kérés: az "onTheWay" mező igaz/hamis legyen.',
      );
    }
    try {
      const card = Number.isInteger(id) && id > 0 ? setOnTheWay(db, id, body.data.onTheWay) : null;
      if (!card) return sendError(reply, 404, 'NOT_FOUND', 'A kártya nem található.');
      return card;
    } catch (err) {
      if (err instanceof OnTheWayError) return sendError(reply, 400, 'VALIDATION', err.message);
      throw err;
    }
  });

  /** Pozitív egész azonosító az útvonalból; ha nem az, `null` (→ 404). */
  const idParam = (raw: string): number | null => {
    const id = Number(raw);
    return Number.isInteger(id) && id > 0 ? id : null;
  };
  const cardNotFound = (reply: FastifyReply) =>
    sendError(reply, 404, 'NOT_FOUND', 'A kártya nem található.');

  app.post('/api/cards', async (req, reply) => {
    const card = createCard(db, req.body ?? {});
    opts.collector?.kick();
    return reply.code(201).send(card);
  });

  app.patch<{ Params: { id: string } }>('/api/cards/:id', async (req, reply) => {
    const id = idParam(req.params.id);
    if (id === null) return cardNotFound(reply);
    const card = updateCard(db, config.imagesDir, id, req.body ?? {});
    if (card.image.status === 'pending') opts.collector?.kick();
    return card;
  });

  app.delete<{ Params: { id: string } }>('/api/cards/:id', async (req, reply) => {
    const id = idParam(req.params.id);
    if (id === null) return cardNotFound(reply);
    deleteCard(db, config.imagesDir, id);
    return reply.code(204).send();
  });

  app.post<{ Params: { id: string } }>('/api/cards/:id/image/refresh', async (req, reply) => {
    const id = idParam(req.params.id);
    if (id === null) return cardNotFound(reply);
    if (opts.collector) {
      if (!opts.collector.requestRefresh(id)) return cardNotFound(reply);
    } else {
      db.prepare(`UPDATE card SET image_status = 'pending' WHERE id = ?`).run(id);
    }
    const card = getCard(db, id);
    return card ?? cardNotFound(reply);
  });

  // Kézi kép: a törzs maga a képfájl (image/*), vagy JSON { url } képlink.
  app.addContentTypeParser(
    /^image\/[\w.+-]+$/u,
    { parseAs: 'buffer', bodyLimit: MAX_MANUAL_BYTES },
    (_req, body, done) => done(null, body),
  );
  let imageHttp = opts.imageHttp;
  app.put<{ Params: { id: string } }>('/api/cards/:id/image', async (req, reply) => {
    const id = idParam(req.params.id);
    if (id === null) return cardNotFound(reply);
    try {
      let bytes: Buffer | null;
      let source = MANUAL_UPLOAD_SOURCE;
      if (Buffer.isBuffer(req.body)) {
        bytes = req.body;
      } else {
        source = parseImageUrl((req.body as { url?: unknown } | null)?.url);
        imageHttp ??= createHttp({ delayMs: 0 });
        try {
          bytes = await imageHttp.bytes(source);
        } catch {
          bytes = null;
        }
        if (!bytes) {
          throw new ManualImageError(400, 'DOWNLOAD', 'A kép nem tölthető le erről a linkről.');
        }
      }
      if (!(await setManualImage(db, config.imagesDir, id, bytes, source))) {
        return cardNotFound(reply);
      }
    } catch (err) {
      if (err instanceof ManualImageError) {
        return sendError(reply, err.status, err.code, err.message);
      }
      throw err;
    }
    return getCard(db, id) ?? cardNotFound(reply);
  });

  app.get('/api/images/status', async (): Promise<ImageStatusCounts> => {
    const out: ImageStatusCounts = {
      total: 0,
      pending: 0,
      exact: 0,
      fallback: 0,
      none: 0,
      error: 0,
    };
    const rows = db
      .prepare('SELECT image_status AS s, COUNT(*) AS n FROM card GROUP BY image_status')
      .all() as { s: Exclude<keyof ImageStatusCounts, 'total'>; n: number }[];
    for (const r of rows) {
      out[r.s] = r.n;
      out.total += r.n;
    }
    return out;
  });

  app.get<{ Params: { file: string } }>('/api/images/:file', async (req, reply) => {
    const file = req.params.file;
    if (!IMAGE_FILE_RE.test(file)) {
      return sendError(reply, 400, 'BAD_FILE', 'Érvénytelen képfájlnév.');
    }
    const full = path.join(config.imagesDir, file);
    if (!fs.existsSync(full)) return sendError(reply, 404, 'NOT_FOUND', 'A kép nem található.');
    return reply
      .header('cache-control', 'public, max-age=31536000, immutable')
      .type('image/webp')
      .send(fs.createReadStream(full));
  });

  app.get('/api/lookups', async () => getLookups(db));

  app.post('/api/finishes', async (req, reply) =>
    reply.code(201).send(createFinish(db, req.body ?? {})),
  );

  app.patch<{ Params: { id: string } }>('/api/finishes/:id', async (req, reply) => {
    const id = idParam(req.params.id);
    if (id === null) return sendError(reply, 404, 'NOT_FOUND', 'A nyomási változat nem található.');
    return updateFinish(db, id, req.body ?? {});
  });

  app.post('/api/languages', async (req, reply) =>
    reply.code(201).send(createLanguage(db, req.body ?? {})),
  );

  // Export (S-50, S-51): ids nélkül a teljes gyűjtemény; ids esetén a megadott sorrendben.
  const exportCards = async (
    reply: FastifyReply,
    format: string | undefined,
    rawIds: string[] | undefined,
    name: string | undefined,
  ) => {
    if (format !== 'xlsx' && format !== 'csv') {
      return sendError(reply, 400, 'VALIDATION', 'A formátum xlsx vagy csv lehet.');
    }
    const all = listCards(db);
    let cards: Card[] = all;
    if (rawIds !== undefined) {
      const byId = new Map(all.map((c) => [c.id, c]));
      const ids = rawIds
        .flatMap((v) => String(v).split(','))
        .filter(Boolean)
        .map(Number);
      if (ids.some((id) => !Number.isInteger(id) || id <= 0)) {
        return sendError(reply, 400, 'VALIDATION', 'Hibás kártyaazonosító a listában.');
      }
      cards = ids.map((id) => byId.get(id)).filter((c): c is Card => c !== undefined);
    }
    const fmt = format as ExportFormat;
    const fileName = exportFileName(fmt, cards === all ? null : safeNamePart(name));
    const body = fmt === 'xlsx' ? await toXlsx(cards) : toCsv(cards);
    const type =
      fmt === 'xlsx'
        ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        : 'text/csv; charset=utf-8';
    return reply
      .header('content-type', type)
      .header('content-disposition', `attachment; filename="${fileName}"`)
      .send(body);
  };

  app.get<{ Querystring: { format?: string; ids?: string; name?: string } }>(
    '/api/export',
    async (req, reply) =>
      exportCards(
        reply,
        req.query.format,
        req.query.ids === undefined ? undefined : [req.query.ids],
        req.query.name,
      ),
  );

  app.post<{ Body: { format?: string; ids?: number[]; name?: string } }>(
    '/api/export',
    async (req, reply) => {
      const b = req.body ?? {};
      const ids = Array.isArray(b.ids) ? b.ids.map(String) : undefined;
      return exportCards(reply, b.format, ids, typeof b.name === 'string' ? b.name : undefined);
    },
  );

  app.get('/api/backup/status', async () =>
    backupStatus(db, config, new Date(), isBackupRunning()),
  );

  app.post('/api/backup/run', async (_req, reply) => {
    if (isBackupRunning()) return sendError(reply, 409, 'BUSY', 'Már fut egy mentés.');
    try {
      const result = await runBackupExclusive(db, config);
      return { ok: true, ...result, status: backupStatus(db, config) };
    } catch (err) {
      return sendError(
        reply,
        500,
        'BACKUP_FAILED',
        `A mentés nem sikerült: ${(err as Error).message}`,
      );
    }
  });

  app.get('/api/import/summary', async (_req, reply) => {
    const summary = getImportSummary(db);
    if (!summary) return sendError(reply, 404, 'NOT_IMPORTED', 'Még nem volt import.');
    return summary;
  });

  const webDir = opts.webDistDir === undefined ? WEB_DIST_DIR : opts.webDistDir;
  const hasWeb = webDir !== null && fs.existsSync(`${webDir}/index.html`);
  if (hasWeb) {
    await app.register(fastifyStatic, { root: webDir, wildcard: false });
  }

  app.setNotFoundHandler((req, reply) => {
    // A kliensoldali útvonalak (pl. /beallitasok) az index.html-t kapják.
    if (hasWeb && req.method === 'GET' && !req.url.startsWith('/api/')) {
      return reply.type('text/html').sendFile('index.html');
    }
    return sendError(reply, 404, 'NOT_FOUND', 'Nincs ilyen végpont.');
  });

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof EditError) {
      return sendError(reply, err.status, err.code, err.message, err.details);
    }
    app.log.error(err);
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    if (status < 500) return sendError(reply, status, 'BAD_REQUEST', 'Hibás kérés.');
    return sendError(reply, 500, 'INTERNAL', 'Váratlan hiba történt.');
  });

  return app;
}
