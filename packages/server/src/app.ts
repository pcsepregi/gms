import fs from 'node:fs';
import Fastify, { type FastifyInstance, type FastifyReply } from 'fastify';
import fastifyStatic from '@fastify/static';
import type { ApiErrorBody, Health } from '@gms/shared';
import type { Config } from './config.js';
import type { Db } from './db/open.js';
import { z } from 'zod';
import { getCard, getImportSummary, getLookups, listCards, setOwned } from './cards.js';
import { WEB_DIST_DIR } from './paths.js';

export interface AppOptions {
  db: Db;
  config: Config;
  version: string;
  /** A React build mappája; ha nem létezik, csak az API fut. */
  webDistDir?: string | null;
  logger?: boolean;
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

  app.get('/api/lookups', async () => getLookups(db));

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
    app.log.error(err);
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    if (status < 500) return sendError(reply, status, 'BAD_REQUEST', 'Hibás kérés.');
    return sendError(reply, 500, 'INTERNAL', 'Váratlan hiba történt.');
  });

  return app;
}
