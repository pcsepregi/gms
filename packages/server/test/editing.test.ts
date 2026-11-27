import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Card, Finish, Language, Lookups } from '@gms/shared';
import { buildApp } from '../src/app.js';
import { importExcel } from '../src/import/run.js';
import { fixture, LOCAL_HEADERS, testDb } from './helpers.js';

async function setup() {
  const { db, config } = testDb();
  await importExcel(db, fixture('sample-master.xlsx'));
  const app = await buildApp({ db, config, version: '0.0.0', webDistDir: null });
  const send = (method: 'POST' | 'PATCH' | 'DELETE', url: string, body?: unknown) =>
    app.inject({
      method,
      url,
      headers: { ...LOCAL_HEADERS, origin: 'http://127.0.0.1:4747' },
      ...(body === undefined ? {} : { payload: body as object }),
    });
  const get = (url: string) => app.inject({ url, headers: LOCAL_HEADERS });
  return { app, db, config, send, get };
}

const NEW_CARD = {
  pokemon: 'Pikachu',
  setName: 'Scarlet & Violet',
  setCode: 'SVI',
  cardNumber: '063/198',
  finishId: 1,
  languageId: 1,
};

const count = (db: ReturnType<typeof testDb>['db']) =>
  (db.prepare('SELECT COUNT(*) AS n FROM card').get() as { n: number }).n;

describe('új kártya: POST /api/cards (S-21, S-63)', () => {
  it('T-CRD-01 (API): 201, alapból nincs meg, a kép függő, az azonosító generált', async () => {
    const { send, get, db } = await setup();
    const before = count(db);
    const res = await send('POST', '/api/cards', { ...NEW_CARD, note: '  Első Pikachu  ' });
    expect(res.statusCode).toBe(201);
    const card = res.json() as Card;
    expect(card).toMatchObject({
      owned: false,
      pokemon: 'Pikachu',
      cardNumber: '063/198',
      note: 'Első Pikachu',
      displayId: 'EN-Pikachu-063/198-Normal',
      image: { status: 'pending', url: null },
    });
    expect(count(db)).toBe(before + 1);
    const lookups = (await get('/api/lookups')).json() as Lookups;
    expect(lookups.pokemon).toContain('Pikachu');
    expect(((await get(`/api/cards/${card.id}`)).json() as Card).id).toBe(card.id);
  });

  it('megvan jelöléssel is felvehető, az időbélyeg kitöltődik', async () => {
    const { send, db } = await setup();
    const card = (await send('POST', '/api/cards', { ...NEW_CARD, owned: true })).json() as Card;
    expect(card.owned).toBe(true);
    const row = db.prepare('SELECT owned_changed_at FROM card WHERE id = ?').get(card.id) as {
      owned_changed_at: string | null;
    };
    expect(row.owned_changed_at).not.toBeNull();
  });

  it('T-CRD-03: hiányzó és túl hosszú mezők → 400 VALIDATION mezőnként', async () => {
    const { send, db } = await setup();
    const before = count(db);
    const res = await send('POST', '/api/cards', {
      pokemon: '   ',
      setName: 'x'.repeat(101),
      setCode: 'y'.repeat(21),
      finishId: 1,
      note: 'z'.repeat(5001),
    });
    expect(res.statusCode).toBe(400);
    const { error } = res.json() as { error: { code: string; details: Record<string, string> } };
    expect(error.code).toBe('VALIDATION');
    expect(error.details).toMatchObject({
      pokemon: 'Kötelező mező.',
      setName: 'Legfeljebb 100 karakter.',
      setCode: 'Legfeljebb 20 karakter.',
      cardNumber: 'Kötelező mező.',
      languageId: 'Kötelező mező.',
      note: 'Legfeljebb 5000 karakter.',
    });
    expect(count(db)).toBe(before);
  });

  it('nem létező finish / nyelv, ismeretlen mező → 400', async () => {
    const { send } = await setup();
    const bad = await send('POST', '/api/cards', { ...NEW_CARD, finishId: 999, languageId: 999 });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error.details).toEqual({
      finishId: 'Nincs ilyen nyomási változat.',
      languageId: 'Nincs ilyen nyelv.',
    });
    const extra = await send('POST', '/api/cards', { ...NEW_CARD, region: 'EU' });
    expect(extra.statusCode).toBe(400);
    expect(extra.json().error.code).toBe('VALIDATION');
  });

  it('T-CRD-06: új nyelv és új finish beküldése, majd kártya velük', async () => {
    const { send, get } = await setup();
    const lang = await send('POST', '/api/languages', { name: 'Dutch' });
    expect(lang.statusCode).toBe(201);
    expect(lang.json()).toMatchObject({
      name: 'Dutch',
      nameHu: 'Dutch',
      shortCode: 'DU',
      imageCode: null,
      sortOrder: 14,
    });
    const fin = await send('POST', '/api/finishes', { name: ' Cosmos Holo ', description: '' });
    expect(fin.statusCode).toBe(201);
    const finish = fin.json() as Finish;
    expect(finish).toMatchObject({ name: 'Cosmos Holo', description: null });

    const card = await send('POST', '/api/cards', {
      ...NEW_CARD,
      finishId: finish.id,
      languageId: (lang.json() as Language).id,
    });
    expect(card.statusCode).toBe(201);
    expect((card.json() as Card).displayId).toBe('DU-Pikachu-063/198-Cosmos_Holo');
    const lookups = (await get('/api/lookups')).json() as Lookups;
    expect(lookups.languages.at(-1)?.name).toBe('Dutch');
    expect(lookups.finishes.at(-1)?.name).toBe('Cosmos Holo');
  });

  it('új nyelv: létező névre 409, foglalt kódra 400, a kód ütközéskor hosszabb', async () => {
    const { send } = await setup();
    expect((await send('POST', '/api/languages', { name: 'german' })).statusCode).toBe(409);
    expect((await send('POST', '/api/languages', { name: 'Német' })).statusCode).toBe(409);
    const taken = await send('POST', '/api/languages', { name: 'Dutch', shortCode: 'de' });
    expect(taken.statusCode).toBe(400);
    expect(taken.json().error.details.shortCode).toBeDefined();
    // Az "EN" foglalt (English), ezért "ENG".
    const eng = await send('POST', '/api/languages', { name: 'Engelsk' });
    expect(eng.json().shortCode).toBe('ENG');
  });
});

describe('duplikátum (S-22)', () => {
  it('T-DUP-03: POST duplikátummal → 409 a meglévő id-vel, kis-/nagybetű és szóköz mindegy', async () => {
    const { send, db } = await setup();
    const before = count(db);
    const res = await send('POST', '/api/cards', {
      pokemon: ' lechonk ',
      setName: 'SCARLET &  violet',
      cardNumber: '154/198',
      finishId: 2,
      languageId: 1,
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toMatchObject({
      code: 'DUPLICATE',
      details: { id: 2, displayId: 'EN-Lechonk-154/198-Reverse_Holo' },
    });
    expect(count(db)).toBe(before);
  });

  it('T-DUP-03: PATCH duplikátummal → 409, az adatbázis nem változik', async () => {
    const { send, get } = await setup();
    // A 2. kártyát (Reverse Holo) az 1.-re (Normal) állítanánk.
    const res = await send('PATCH', '/api/cards/2', { finishId: 1, note: 'nem mentődhet' });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.details.id).toBe(1);
    const card = (await get('/api/cards/2')).json() as Card;
    expect(card).toMatchObject({ finish: { id: 2 }, note: '' });
  });

  it('T-DUP-04: az adatbázis UNIQUE megkötése közvetlen beszúrásnál is véd', async () => {
    const { db } = await setup();
    const key = (
      db.prepare('SELECT natural_key FROM card WHERE id = 1').get() as { natural_key: string }
    ).natural_key;
    expect(() =>
      db
        .prepare(
          `INSERT INTO card (pokemon, set_name, card_number, finish_id, language_id, display_id,
                             created_at, updated_at, natural_key)
           VALUES ('x', 'y', '1', 1, 1, 'z', 'now', 'now', ?)`,
        )
        .run(key),
    ).toThrow(/UNIQUE/u);
    expect(
      (db.prepare('SELECT COUNT(*) AS n FROM card WHERE natural_key = ?').get(key) as { n: number })
        .n,
    ).toBe(1);
  });
});

describe('szerkesztés: PATCH /api/cards/:id (S-23)', () => {
  it('T-EDT-03: kártyaszám módosítása → új azonosító, a kép újrakeresése indul', async () => {
    const { send, db } = await setup();
    db.prepare(`UPDATE card SET image_status = 'exact' WHERE id = 1`).run();
    const res = await send('PATCH', '/api/cards/1', { cardNumber: '154/198a' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      cardNumber: '154/198a',
      displayId: 'EN-Lechonk-154/198a-Normal',
      image: { status: 'pending' },
    });
  });

  it('T-EDT-03: megjegyzés módosításakor a kép és az azonosító marad', async () => {
    const { send, db, config } = await setup();
    fs.mkdirSync(config.imagesDir, { recursive: true });
    fs.writeFileSync(path.join(config.imagesDir, '1-abc.webp'), 'x');
    db.prepare(
      `UPDATE card SET image_status = 'exact', image_file = '1-abc.webp' WHERE id = 1`,
    ).run();
    const res = await send('PATCH', '/api/cards/1', { note: 'Új megjegyzés\nhttps://example.org' });
    expect(res.json()).toMatchObject({
      note: 'Új megjegyzés\nhttps://example.org',
      displayId: 'EN-Lechonk-154/198-Normal',
      image: { status: 'exact', url: '/api/images/1-abc.webp' },
    });
    expect(fs.existsSync(path.join(config.imagesDir, '1-abc.webp'))).toBe(true);
  });

  it('a képet befolyásoló mezőnél a régi képfájl törlődik', async () => {
    const { send, db, config } = await setup();
    fs.mkdirSync(config.imagesDir, { recursive: true });
    for (const f of ['1-abc.webp', '1-abc-thumb.webp']) {
      fs.writeFileSync(path.join(config.imagesDir, f), 'x');
    }
    db.prepare(
      `UPDATE card SET image_status = 'exact', image_file = '1-abc.webp' WHERE id = 1`,
    ).run();
    const res = await send('PATCH', '/api/cards/1', { cardNumber: '155/198' });
    expect(res.json()).toMatchObject({
      displayId: 'EN-Lechonk-155/198-Normal',
      image: { status: 'pending', url: null },
    });
    expect(fs.readdirSync(config.imagesDir)).toEqual([]);
  });

  it('S-23/EF1: minden mező szerkeszthető, a lista azonnal mutatja', async () => {
    const { send, get } = await setup();
    const patch = {
      owned: false,
      pokemon: 'Pikachu',
      setName: 'Új set',
      setCode: null,
      cardNumber: '1/2',
      finishId: 3,
      languageId: 3,
      note: 'jegyzet',
    };
    const res = await send('PATCH', '/api/cards/1', patch);
    expect(res.statusCode).toBe(200);
    const list = (await get('/api/cards')).json() as Card[];
    expect(list.find((c) => c.id === 1)).toMatchObject({
      owned: false,
      pokemon: 'Pikachu',
      setName: 'Új set',
      setCode: null,
      cardNumber: '1/2',
      finish: { id: 3 },
      language: { id: 3 },
      note: 'jegyzet',
    });
  });

  it('azonosító-ütközés: a két kártya setkód utótagot kap, megszűnésekor elhagyja', async () => {
    const { send, get } = await setup();
    // Ugyanaz a szám és finish egy másik setben → mindkettő utótagot kap (technikai spec 4.2).
    const created = (
      await send('POST', '/api/cards', {
        ...NEW_CARD,
        pokemon: 'Lechonk',
        cardNumber: '154/198',
        setName: 'Másik set',
        setCode: 'MS',
      })
    ).json() as Card;
    expect(created.displayId).toBe('EN-Lechonk-154/198-Normal-MS');
    expect(((await get('/api/cards/1')).json() as Card).displayId).toBe(
      'EN-Lechonk-154/198-Normal-SVI',
    );
    expect((await send('DELETE', `/api/cards/${created.id}`)).statusCode).toBe(204);
    expect(((await get('/api/cards/1')).json() as Card).displayId).toBe(
      'EN-Lechonk-154/198-Normal',
    );
  });

  it('a megvan jelölés PATCH-csel is állítható, az időbélyeg frissül', async () => {
    const { send, db } = await setup();
    await send('PATCH', '/api/cards/2', { owned: true });
    const row = db.prepare('SELECT owned, owned_changed_at FROM card WHERE id = 2').get() as {
      owned: number;
      owned_changed_at: string | null;
    };
    expect(row.owned).toBe(1);
    expect(row.owned_changed_at).not.toBeNull();
  });

  it('hibás PATCH: 400, nem létező kártya: 404, változás nélkül 200', async () => {
    const { send } = await setup();
    expect((await send('PATCH', '/api/cards/1', { pokemon: '' })).json().error.details).toEqual({
      pokemon: 'Kötelező mező.',
    });
    expect((await send('PATCH', '/api/cards/1', { qty: 2 })).statusCode).toBe(400);
    expect((await send('PATCH', '/api/cards/1', [1])).statusCode).toBe(400);
    expect((await send('PATCH', '/api/cards/999', { note: 'x' })).statusCode).toBe(404);
    expect((await send('PATCH', '/api/cards/abc', { note: 'x' })).statusCode).toBe(404);
    expect((await send('PATCH', '/api/cards/1', {})).statusCode).toBe(200);
  });

  it('T-EDT-02 (API): 5000 karakteres megjegyzés menthető, 5001 nem', async () => {
    const { send } = await setup();
    expect((await send('PATCH', '/api/cards/1', { note: 'a'.repeat(5000) })).statusCode).toBe(200);
    expect((await send('PATCH', '/api/cards/1', { note: 'a'.repeat(5001) })).statusCode).toBe(400);
  });
});

describe('törlés: DELETE /api/cards/:id (S-24)', () => {
  it('T-DEL-03: a sor és a képfájlok (normál és bélyegkép) törlődnek; nem létezőre 404', async () => {
    const { send, get, db, config } = await setup();
    fs.mkdirSync(config.imagesDir, { recursive: true });
    for (const f of ['3-abc.webp', '3-abc-thumb.webp', '4-keep.webp']) {
      fs.writeFileSync(path.join(config.imagesDir, f), 'x');
    }
    db.prepare(
      `UPDATE card SET image_status = 'exact', image_file = '3-abc.webp' WHERE id = 3`,
    ).run();
    const before = count(db);
    const res = await send('DELETE', '/api/cards/3');
    expect(res.statusCode).toBe(204);
    expect(count(db)).toBe(before - 1);
    expect((await get('/api/cards/3')).statusCode).toBe(404);
    expect(fs.readdirSync(config.imagesDir)).toEqual(['4-keep.webp']);
    expect((await send('DELETE', '/api/cards/3')).statusCode).toBe(404);
    expect((await send('DELETE', '/api/cards/x')).statusCode).toBe(404);
  });

  it('T-SEC-03: idegen Origin-ről a törlés 403, és nem töröl', async () => {
    const { app, db } = await setup();
    const before = count(db);
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/cards/1',
      headers: { ...LOCAL_HEADERS, origin: 'https://evil.example' },
    });
    expect(res.statusCode).toBe(403);
    expect(count(db)).toBe(before);
  });
});

describe('finish-szótár (S-64)', () => {
  it('új finish: 201; létező névre (kis-/nagybetű mindegy) 409; üres névre 400', async () => {
    const { send } = await setup();
    const res = await send('POST', '/api/finishes', {
      name: 'Galaxy Holo',
      description: 'Csillagos',
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ name: 'Galaxy Holo', description: 'Csillagos' });
    expect((await send('POST', '/api/finishes', { name: 'reverse holo' })).statusCode).toBe(409);
    expect((await send('POST', '/api/finishes', { name: ' ' })).statusCode).toBe(400);
  });

  it('T-FIN-01 (API): a leírás módosítása a kártyán is látszik', async () => {
    const { send, get } = await setup();
    const res = await send('PATCH', '/api/finishes/2', { description: 'Fordított fólia.' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ id: 2, description: 'Fordított fólia.' });
    expect(((await get('/api/cards/2')).json() as Card).finish.description).toBe(
      'Fordított fólia.',
    );
    expect(
      (await send('PATCH', '/api/finishes/2', { description: '' })).json().description,
    ).toBeNull();
    expect((await send('PATCH', '/api/finishes/999', { description: 'x' })).statusCode).toBe(404);
    expect((await send('PATCH', '/api/finishes/2', { name: 'x' })).statusCode).toBe(400);
  });
});
