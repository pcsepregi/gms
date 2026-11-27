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
