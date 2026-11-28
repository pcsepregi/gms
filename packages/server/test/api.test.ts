import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Card, ImportSummary, Lookups } from '@gms/shared';
import { buildApp } from '../src/app.js';
import { importExcel } from '../src/import/run.js';
import { fixture, LOCAL_HEADERS, tempDir, testDb } from './helpers.js';

async function setup({ imported = true, webDistDir = null as string | null } = {}) {
  const { db, config } = testDb();
  if (imported) await importExcel(db, fixture('sample-master.xlsx'));
  const app = await buildApp({ db, config, version: '9.9.9', webDistDir });
  return { app, db, config };
}

describe('API alap', () => {
  it('GET /api/health', async () => {
    const { app, config } = await setup({ imported: false });
    const res = await app.inject({ url: '/api/health', headers: LOCAL_HEADERS });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      ok: true,
      version: '9.9.9',
      dbPath: config.dbPath,
      appTitle: 'Lechonk & Oinkologne gyűjtemény',
    });
  });

  it('GET /api/cards: minden kártya, joinolt nyelv és finish, kép állapot', async () => {
    const { app } = await setup();
    const res = await app.inject({ url: '/api/cards', headers: LOCAL_HEADERS });
    expect(res.statusCode).toBe(200);
    const cards = res.json() as Card[];
    expect(cards).toHaveLength(43);
    expect(cards[0]).toMatchObject({
      id: 1,
      displayId: 'EN-Lechonk-154/198-Normal',
      owned: true,
      pokemon: 'Lechonk',
      setName: 'Scarlet & Violet',
      setCode: 'SVI',
      cardNumber: '154/198',
      finish: { name: 'Normal', description: 'Standard non-holo printing.' },
      language: { name: 'English', nameHu: 'Angol', shortCode: 'EN' },
      image: {
        status: 'pending',
        url: null,
        thumbUrl: null,
        languageId: null,
        languageNameHu: null,
      },
    });
  });

  it('GET /api/cards/:id és 404', async () => {
    const { app, db } = await setup();
    db.prepare(
      "UPDATE card SET image_file = 'a b.webp', image_status = 'exact' WHERE id = 2",
    ).run();
    const ok = await app.inject({ url: '/api/cards/2', headers: LOCAL_HEADERS });
    expect(ok.json()).toMatchObject({
      id: 2,
      image: { status: 'exact', url: '/api/images/a%20b.webp' },
    });
    for (const id of ['999', 'abc', '0']) {
      const res = await app.inject({ url: `/api/cards/${id}`, headers: LOCAL_HEADERS });
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe('NOT_FOUND');
    }
  });

  it('GET /api/lookups: nyelvek sorrendben, finish-ek, Pokémonok, setek kódokkal', async () => {
    const { app } = await setup();
    const res = await app.inject({ url: '/api/lookups', headers: LOCAL_HEADERS });
    const l = res.json() as Lookups;
    expect(l.languages.map((x) => x.shortCode)).toEqual([
      'EN',
      'FR',
      'DE',
      'IT',
      'ES',
      'LA',
      'PT',
      'JA',
      'KO',
      'ZHS',
      'ZHT',
      'TH',
      'ID',
    ]);
    expect(l.pokemon).toEqual(['Lechonk', 'Oinkologne', 'Oinkologne ex']);
    expect(l.sets).toContainEqual({ name: 'Scarlet & Violet', codes: ['SVI'] });
    expect(l.sets).toContainEqual({ name: 'Synthetic League Promo', codes: [] });
    expect(l.finishes).toHaveLength(6);
  });

  it('S-02/EF3: GET /api/import/summary import után és előtt', async () => {
    const before = await setup({ imported: false });
    const none = await before.app.inject({ url: '/api/import/summary', headers: LOCAL_HEADERS });
    expect(none.statusCode).toBe(404);
    expect(none.json().error.code).toBe('NOT_IMPORTED');

    const { app } = await setup();
    const res = await app.inject({ url: '/api/import/summary', headers: LOCAL_HEADERS });
    expect(res.json() as ImportSummary).toMatchObject({ total: 43, owned: 22, missing: 21 });
  });

  it('ismeretlen API végpont: 404 JSON hibával', async () => {
    const { app } = await setup({ imported: false });
    const res = await app.inject({ url: '/api/nincs', headers: LOCAL_HEADERS });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: { code: 'NOT_FOUND', message: 'Nincs ilyen végpont.' } });
  });

  it('váratlan hiba: 500, magyar üzenet, részletek nélkül', async () => {
    const { app, db } = await setup({ imported: false });
    db.close();
    const res = await app.inject({ url: '/api/health', headers: LOCAL_HEADERS });
    expect(res.statusCode).toBe(500);
    expect(res.json().error).toEqual({ code: 'INTERNAL', message: 'Váratlan hiba történt.' });
  });

  it('hibás kérés (4xx a keretrendszertől)', async () => {
    const { app } = await setup({ imported: false });
    app.post('/api/echo', async (req) => req.body);
    const res = await app.inject({
      method: 'POST',
      url: '/api/echo',
      headers: { ...LOCAL_HEADERS, 'content-type': 'application/json' },
      payload: '{rossz json',
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('BAD_REQUEST');
  });
});

describe('biztonság (S-61)', () => {
  it('T-SEC-02: idegen Host fejléc → 403', async () => {
    const { app } = await setup({ imported: false });
    for (const host of ['evil.example:4747', '127.0.0.1:80', '192.168.1.10:4747', '']) {
      const res = await app.inject({ url: '/api/health', headers: { host } });
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe('FORBIDDEN_HOST');
    }
    const ok = await app.inject({ url: '/api/health', headers: { host: 'localhost:4747' } });
    expect(ok.statusCode).toBe(200);
  });

  it('T-SEC-03: módosító kérés idegen Origin-nel → 403, saját Origin-nel átmegy', async () => {
    const { app } = await setup({ imported: false });
    app.post('/api/echo', async () => ({ ok: true }));
    const bad = await app.inject({
      method: 'POST',
      url: '/api/echo',
      headers: { ...LOCAL_HEADERS, origin: 'https://evil.example' },
    });
    expect(bad.statusCode).toBe(403);
    expect(bad.json().error.code).toBe('FORBIDDEN_ORIGIN');
    const good = await app.inject({
      method: 'POST',
      url: '/api/echo',
      headers: { ...LOCAL_HEADERS, origin: 'http://localhost:4747' },
    });
    expect(good.statusCode).toBe(200);
    // Olvasó kérésnél az Origin nem számít.
    const get = await app.inject({
      url: '/api/health',
      headers: { ...LOCAL_HEADERS, origin: 'https://evil.example' },
    });
    expect(get.statusCode).toBe(200);
  });
});

describe('frontend kiszolgálása', () => {
  it('a build fájljai és a kliensoldali útvonalak az index.html-t kapják', async () => {
    const web = tempDir('gms-web-');
    fs.writeFileSync(path.join(web, 'index.html'), '<!doctype html><title>GMS</title>');
    fs.writeFileSync(path.join(web, 'app.js'), 'console.log(1)');
    const { app } = await setup({ imported: false, webDistDir: web });

    const root = await app.inject({ url: '/', headers: LOCAL_HEADERS });
    expect(root.statusCode).toBe(200);
    expect(root.body).toContain('<title>GMS</title>');
    const js = await app.inject({ url: '/app.js', headers: LOCAL_HEADERS });
    expect(js.body).toBe('console.log(1)');
    const spa = await app.inject({ url: '/beallitasok', headers: LOCAL_HEADERS });
    expect(spa.statusCode).toBe(200);
    expect(spa.headers['content-type']).toContain('text/html');
    const api = await app.inject({ url: '/api/nincs', headers: LOCAL_HEADERS });
    expect(api.statusCode).toBe(404);
    expect(api.json().error.code).toBe('NOT_FOUND');
  });

  it('build nélkül a / is 404 (csak API)', async () => {
    const { app } = await setup({ imported: false, webDistDir: path.join(tempDir(), 'nincs') });
    const res = await app.inject({ url: '/', headers: LOCAL_HEADERS });
    expect(res.statusCode).toBe(404);
  });
});
