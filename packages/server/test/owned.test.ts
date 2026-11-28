import { describe, expect, it } from 'vitest';
import type { Card } from '@gms/shared';
import { buildApp } from '../src/app.js';
import { setOwned } from '../src/cards.js';
import { importExcel } from '../src/import/run.js';
import { fixture, LOCAL_HEADERS, testDb } from './helpers.js';

async function setup() {
  const { db, config } = testDb();
  await importExcel(db, fixture('sample-master.xlsx'));
  const app = await buildApp({ db, config, version: '0.0.0', webDistDir: null });
  return { app, db };
}

const put = (id: number | string, body: unknown, headers: Record<string, string> = {}) => ({
  method: 'PUT' as const,
  url: `/api/cards/${id}/owned`,
  headers: { ...LOCAL_HEADERS, ...headers },
  payload: body as object,
});

function row(db: ReturnType<typeof testDb>['db'], id: number) {
  return db
    .prepare('SELECT owned, owned_changed_at, updated_at FROM card WHERE id = ?')
    .get(id) as { owned: number; owned_changed_at: string | null; updated_at: string };
}

const putWay = (id: number | string, body: unknown) => ({
  method: 'PUT' as const,
  url: `/api/cards/${id}/on-the-way`,
  headers: LOCAL_HEADERS,
  payload: body as object,
});

describe('úton jelölés: PUT /api/cards/:id/on-the-way', () => {
  it('beállítja, idempotens, a statisztika és az export látja, a megvan törli', async () => {
    const { app, db } = await setup();
    // A 2. kártya hiányzik a fixture-ben.
    const res = await app.inject(putWay(2, { onTheWay: true }));
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ id: 2, owned: false, onTheWay: true });
    expect((await app.inject(putWay(2, { onTheWay: true }))).statusCode).toBe(200);

    const stats = (await app.inject({ url: '/api/stats', headers: LOCAL_HEADERS })).json() as {
      total: { owned: number; all: number; onTheWay: number };
    };
    expect(stats.total.onTheWay).toBe(1);
    // A megvan/hiányzik szám nem változik.
    expect(stats.total.all - stats.total.owned).toBeGreaterThan(0);

    const csv = await app.inject({ url: '/api/export?format=csv', headers: LOCAL_HEADERS });
    expect(csv.body).toContain('Nem;Igen;');

    // Megérkezett: megvan, az úton jelölés törlődik.
    const owned = await app.inject(put(2, { owned: true }));
    expect(owned.json()).toMatchObject({ owned: true, onTheWay: false });
    expect(
      (db.prepare('SELECT on_the_way FROM card WHERE id = 2').get() as { on_the_way: number })
        .on_the_way,
    ).toBe(0);

    // Megvan lap nem lehet úton.
    const bad = await app.inject(putWay(2, { onTheWay: true }));
    expect(bad.statusCode).toBe(400);
    expect(bad.json()).toMatchObject({ error: { code: 'VALIDATION' } });
  });

  it('a szerkesztésből megvanra állított lap is elveszti az úton jelölést, egyébként megmarad', async () => {
    const { app } = await setup();
    await app.inject(putWay(2, { onTheWay: true }));
    const patch = (payload: object) =>
      app.inject({ method: 'PATCH', url: '/api/cards/2', headers: LOCAL_HEADERS, payload });
    expect((await patch({ note: 'megjegyzés' })).json()).toMatchObject({ onTheWay: true });
    expect((await patch({ owned: true })).json()).toMatchObject({ owned: true, onTheWay: false });
  });

  it('hibás törzs és ismeretlen kártya', async () => {
    const { app } = await setup();
    expect((await app.inject(putWay(2, { onTheWay: 'igen' }))).statusCode).toBe(400);
    expect((await app.inject(putWay(2, {}))).statusCode).toBe(400);
    expect((await app.inject(putWay(99999, { onTheWay: true }))).statusCode).toBe(404);
    expect((await app.inject(putWay('x', { onTheWay: true }))).statusCode).toBe(404);
  });
});

describe('jelölés: PUT /api/cards/:id/owned (S-20)', () => {
  it('S-20/EF2: átváltja és tartósan menti, a válasz a frissített kártya', async () => {
    const { app, db } = await setup();
    // A 2. kártya (EN Reverse Holo) hiányzik a fixture-ben.
    const res = await app.inject(put(2, { owned: true }, { origin: 'http://127.0.0.1:4747' }));
    expect(res.statusCode).toBe(200);
    const card = res.json() as Card;
    expect(card).toMatchObject({ id: 2, owned: true });
    expect(row(db, 2).owned).toBe(1);
    expect(row(db, 2).owned_changed_at).not.toBeNull();

    const list = await app.inject({ url: '/api/cards', headers: LOCAL_HEADERS });
    expect((list.json() as Card[]).find((c) => c.id === 2)?.owned).toBe(true);

    const back = await app.inject(put(2, { owned: false }));
    expect(back.json()).toMatchObject({ id: 2, owned: false });
    expect(row(db, 2).owned).toBe(0);
  });

  it('T-OWN-05: kétszer ugyanazzal az értékkel idempotens, az időbélyeg csak valódi változáskor frissül', async () => {
    const { db } = await setup();
    setOwned(db, 2, true, new Date('2026-01-01T10:00:00Z'));
    expect(row(db, 2)).toMatchObject({
      owned: 1,
      owned_changed_at: '2026-01-01T10:00:00.000Z',
      updated_at: '2026-01-01T10:00:00.000Z',
    });
    const again = setOwned(db, 2, true, new Date('2026-01-02T10:00:00Z'));
    expect(again?.owned).toBe(true);
    expect(row(db, 2)).toMatchObject({
      owned: 1,
      owned_changed_at: '2026-01-01T10:00:00.000Z',
      updated_at: '2026-01-01T10:00:00.000Z',
    });
    setOwned(db, 2, false, new Date('2026-01-03T10:00:00Z'));
    expect(row(db, 2).owned_changed_at).toBe('2026-01-03T10:00:00.000Z');
  });

  it('a kártyalistában ott a nyelv sorrendje a rendezéshez', async () => {
    const { app } = await setup();
    const cards = (
      await app.inject({ url: '/api/cards', headers: LOCAL_HEADERS })
    ).json() as Card[];
    const de = cards.find((c) => c.language.shortCode === 'DE');
    expect(de?.language.sortOrder).toBe(3);
  });

  it('hibás törzs: 400 VALIDATION', async () => {
    const { app, db } = await setup();
    for (const body of [{}, { owned: 'yes' }, { owned: 1 }, { owned: true, extra: 1 }]) {
      const res = await app.inject(put(2, body));
      expect(res.statusCode, JSON.stringify(body)).toBe(400);
      expect(res.json().error.code).toBe('VALIDATION');
    }
    expect(row(db, 2).owned).toBe(0);
  });

  it('nem létező kártya: 404', async () => {
    const { app } = await setup();
    for (const id of ['999', 'abc', '0']) {
      const res = await app.inject(put(id, { owned: true }));
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe('NOT_FOUND');
    }
  });

  it('T-SEC-03: idegen Origin-ről 403, és nem változik semmi', async () => {
    const { app, db } = await setup();
    const res = await app.inject(put(2, { owned: true }, { origin: 'https://evil.example' }));
    expect(res.statusCode).toBe(403);
    expect(row(db, 2).owned).toBe(0);
  });
});

describe('GET /api/stats (T-DSH-01, T-DSH-05)', () => {
  it('a szűretlen lista számaival egyezik, az importált lapok nincsenek a legutóbbiak között', async () => {
    const { app, db } = await setup();
    const list = (await app.inject({ url: '/api/cards', headers: LOCAL_HEADERS })).json() as Card[];
    const res = await app.inject({ url: '/api/stats', headers: LOCAL_HEADERS });
    expect(res.statusCode).toBe(200);
    const stats = res.json() as import('@gms/shared').Stats;
    expect(stats.total).toEqual({
      owned: list.filter((c) => c.owned).length,
      all: list.length,
      onTheWay: 0,
    });
    expect(stats.byLanguage.reduce((n, x) => n + x.all, 0)).toBe(list.length);
    expect(stats.recent).toEqual([]);

    const [a, b] = list.filter((c) => !c.owned).map((c) => c.id);
    setOwned(db, a!, true, new Date('2026-03-01T10:00:00Z'));
    setOwned(db, b!, true, new Date('2026-03-02T10:00:00Z'));
    const after = (
      await app.inject({ url: '/api/stats', headers: LOCAL_HEADERS })
    ).json() as import('@gms/shared').Stats;
    expect(after.total.owned).toBe(stats.total.owned + 2);
    expect(after.recent.map((c) => c.id)).toEqual([b, a]);
  });
});
