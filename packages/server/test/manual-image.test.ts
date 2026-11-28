import fs from 'node:fs';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import type { Card } from '@gms/shared';
import { buildApp } from '../src/app.js';
import type { Http } from '../src/images/http.js';
import { importExcel } from '../src/import/run.js';
import { fixture, LOCAL_HEADERS, testDb } from './helpers.js';

const png = () =>
  sharp({ create: { width: 630, height: 880, channels: 3, background: '#4a7' } })
    .png()
    .toBuffer();

const HEADERS = { ...LOCAL_HEADERS, origin: 'http://127.0.0.1:4747' };

async function setup(routes: Record<string, Buffer | Error | null> = {}) {
  const { db, config } = testDb();
  await importExcel(db, fixture('sample-master.xlsx'));
  const http: Http = {
    json: async () => null,
    text: async () => null,
    bytes: async (url) => {
      const r = routes[url];
      if (r instanceof Error) throw r;
      return r ?? null;
    },
  };
  const app = await buildApp({ db, config, version: '1', webDistDir: null, imageHttp: http });
  return { app, db, config };
}

describe('kézi kártyakép: PUT /api/cards/:id/image', () => {
  it('feltöltött fájl: pontos kép a kártya nyelvén, a régi fájl törlődik', async () => {
    const { app, config } = await setup();
    const put = async (body: Buffer) =>
      app.inject({
        method: 'PUT',
        url: '/api/cards/1/image',
        headers: { ...HEADERS, 'content-type': 'image/png' },
        payload: body,
      });
    const first = await put(await png());
    expect(first.statusCode).toBe(200);
    const card = first.json() as Card;
    expect(card.image.status).toBe('exact');
    expect(card.image.url).toMatch(/^\/api\/images\/1-[0-9a-f]{8}\.webp$/u);
    const oldFile = card.image.url!.split('/').pop()!;
    expect(fs.existsSync(`${config.imagesDir}/${oldFile}`)).toBe(true);

    const other = await sharp({
      create: { width: 630, height: 880, channels: 3, background: '#a47' },
    })
      .png()
      .toBuffer();
    const second = (await put(other)).json() as Card;
    expect(second.image.url).not.toBe(card.image.url);
    expect(fs.existsSync(`${config.imagesDir}/${oldFile}`)).toBe(false);
  });

  it('képlink: a szerver letölti; hibás link, letöltési hiba, nem kép: érthető hiba', async () => {
    const { app } = await setup({
      'https://example.org/card.png': await png(),
      'https://example.org/notimage': Buffer.from('hello'),
      'https://example.org/down': new Error('timeout'),
    });
    const send = (body: unknown) =>
      app.inject({
        method: 'PUT',
        url: '/api/cards/2/image',
        headers: HEADERS,
        payload: body as object,
      });
    const ok = await send({ url: 'https://example.org/card.png' });
    expect(ok.statusCode).toBe(200);
    expect((ok.json() as Card).image.status).toBe('exact');

    const codes = async (body: unknown) => {
      const r = await send(body);
      return [r.statusCode, (r.json() as { error: { code: string } }).error.code];
    };
    expect(await codes({ url: 'ftp://x/y.png' })).toEqual([400, 'VALIDATION']);
    expect(await codes({ url: 'nem link' })).toEqual([400, 'VALIDATION']);
    expect(await codes({})).toEqual([400, 'VALIDATION']);
    expect(await codes({ url: 'https://example.org/missing' })).toEqual([400, 'DOWNLOAD']);
    expect(await codes({ url: 'https://example.org/down' })).toEqual([400, 'DOWNLOAD']);
    expect(await codes({ url: 'https://example.org/notimage' })).toEqual([400, 'BAD_IMAGE']);
  });

  it('ismeretlen kártya 404, idegen Origin elutasítva', async () => {
    const { app } = await setup();
    const res = await app.inject({
      method: 'PUT',
      url: '/api/cards/99999/image',
      headers: { ...HEADERS, 'content-type': 'image/png' },
      payload: await png(),
    });
    expect(res.statusCode).toBe(404);
    const foreign = await app.inject({
      method: 'PUT',
      url: '/api/cards/1/image',
      headers: { ...LOCAL_HEADERS, origin: 'http://evil.example', 'content-type': 'image/png' },
      payload: await png(),
    });
    expect(foreign.statusCode).toBe(403);
  });
});
