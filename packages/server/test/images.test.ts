import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import type { Card, ImageStatusCounts } from '@gms/shared';
import { buildApp } from '../src/app.js';
import { createImageCollector } from '../src/images/index.js';
import { createHttp, NetworkError, SourceError, type Http } from '../src/images/http.js';
import { ImageResolver } from '../src/images/resolver.js';
import { extractOgImage, looksLikeCard, sourceLinkOf } from '../src/images/source-link.js';
import { localNumber, TcgdexProvider } from '../src/images/tcgdex.js';
import { PokemonTcgProvider } from '../src/images/pokemontcg.js';
import type { ImageHit, ImageProvider, ImageQuery } from '../src/images/types.js';
import { IMAGE_FILE_RE, imageSize, storeImage } from '../src/images/store.js';
import { importExcel } from '../src/import/run.js';
import { fixture, LOCAL_HEADERS, tempDir, testDb } from './helpers.js';

const png = (w: number, h: number) =>
  sharp({ create: { width: w, height: h, channels: 3, background: '#c33' } })
    .png()
    .toBuffer();

/** Álforrás: kérésenként előre megadott válaszok (nincs külső hálózat, T-IMG-*). */
function fakeHttp(routes: Record<string, unknown>, calls: string[] = []): Http {
  const get = (url: string) => {
    calls.push(url);
    const hit = routes[url];
    if (hit instanceof Error) throw hit;
    return hit ?? null;
  };
  return {
    json: async <T>(url: string) => get(url) as T | null,
    text: async (url) => get(url) as string | null,
    bytes: async (url) => get(url) as Buffer | null,
  };
}

class FakeProvider implements ImageProvider {
  readonly name = 'fake';
  calls: string[] = [];
  constructor(
    private readonly byLang: Record<string, ImageHit | Error | null>,
    private readonly delayMs = 0,
  ) {}
  async findImage(_card: ImageQuery, lang: string) {
    this.calls.push(lang);
    if (this.delayMs) await new Promise((r) => setTimeout(r, this.delayMs));
    const r = this.byLang[lang] ?? null;
    if (r instanceof Error) throw r;
    return r;
  }
}

async function setup(providers: ImageProvider[], bytes: Record<string, unknown>) {
  const { db, config } = testDb();
  await importExcel(db, fixture('sample-master.xlsx'));
  const collector = createImageCollector({
    db,
    imagesDir: config.imagesDir,
    http: fakeHttp(bytes),
    providers,
  });
  return { db, config, collector };
}

const OK = { url: 'https://img/ok', source: 'https://src/ok' };

describe('képgyűjtő', () => {
  it('T-IMG-01: saját nyelvű kép → exact, WebP ≤ 734×1024, bélyegképpel', async () => {
    const big = await png(1500, 2100);
    const { db, config, collector } = await setup([new FakeProvider({ en: OK, de: OK })], {
      'https://img/ok': big,
    });
    await collector.idle();
    const row = db.prepare('SELECT * FROM card WHERE id = 1').get() as {
      image_status: string;
      image_file: string;
      image_source: string;
    };
    expect(row.image_status).toBe('exact');
    expect(row.image_source).toBe('https://src/ok');
    const file = path.join(config.imagesDir, row.image_file);
    const meta = await sharp(file).metadata();
    expect(meta.format).toBe('webp');
    expect(meta.width).toBeLessThanOrEqual(734);
    expect(meta.height).toBeLessThanOrEqual(1024);
    const thumb = await sharp(file.replace('.webp', '-thumb.webp')).metadata();
    expect(thumb.width).toBe(320);
  });

  it('T-IMG-02: csak angol kép van → fallback, a kép nyelve angol', async () => {
    const { db, collector } = await setup([new FakeProvider({ en: OK })], {
      'https://img/ok': await png(630, 880),
    });
    await collector.idle();
    const de = db
      .prepare(
        `SELECT c.image_status s, c.image_lang_id lid FROM card c JOIN language l ON l.id = c.language_id
         WHERE l.short_code = 'DE' LIMIT 1`,
      )
      .get() as { s: string; lid: number };
    expect(de.s).toBe('fallback');
    expect(de.lid).toBe(1);
    const en = db
      .prepare(
        `SELECT c.image_status s, c.image_lang_id lid FROM card c JOIN language l ON l.id = c.language_id
         WHERE l.short_code = 'EN' LIMIT 1`,
      )
      .get() as { s: string; lid: number | null };
    expect(en).toEqual({ s: 'exact', lid: null });
  });

  it('T-IMG-03: sehol nincs kép → none', async () => {
    const { db, collector } = await setup([new FakeProvider({})], {});
    await collector.idle();
    expect(collector.counts()).toMatchObject({ none: 43, pending: 0, total: 43 });
    expect(db.prepare('SELECT COUNT(*) n FROM card WHERE image_file IS NOT NULL').get()).toEqual({
      n: 0,
    });
  });

  it('T-IMG-04: hálózati hiba → error, a napi újrapróbálásnál újra sorba kerül', async () => {
    const down = new FakeProvider({ en: new NetworkError('offline') });
    const { db, config } = await setup([down], {});
    const collector = createImageCollector({
      db,
      imagesDir: config.imagesDir,
      http: fakeHttp({}),
      providers: [down],
    });
    await collector.idle();
    expect(collector.counts()).toMatchObject({ error: 43, pending: 0 });
    // a hálózati hibánál a további nyelvekkel nem próbálkozik: kártyánként 1 kérés
    expect(down.calls.length).toBeLessThanOrEqual(86);

    // 1 napnál régebbi error → pending
    db.prepare("UPDATE card SET image_checked_at = '2020-01-01T00:00:00Z'").run();
    const retry = new FakeProvider({ en: OK, de: OK, fr: OK });
    const c2 = createImageCollector({
      db,
      imagesDir: config.imagesDir,
      http: fakeHttp({ 'https://img/ok': await png(630, 880) }),
      providers: [retry],
    });
    c2.start();
    await c2.idle();
    await c2.stop();
    expect(c2.counts().error).toBe(0);
    expect(c2.counts().pending).toBe(0);
  });

  it('forráshiba (5xx) találat nélkül error, nem none', async () => {
    const flaky = new FakeProvider({ en: new SourceError('500', 500) });
    const { collector } = await setup([flaky], {});
    await collector.idle();
    expect(collector.counts()).toMatchObject({ error: 43, none: 0 });
    expect(flaky.calls.length).toBeGreaterThan(43); // minden nyelvet végigpróbál
  });

  it('T-IMG-07: a függő tételek újraindítás után is sorba kerülnek', async () => {
    const { db, config } = await setup([], {});
    db.prepare("UPDATE card SET image_status = 'exact' WHERE id > 3").run();
    const c = createImageCollector({
      db,
      imagesDir: config.imagesDir,
      http: fakeHttp({ 'https://img/ok': await png(630, 880) }),
      providers: [new FakeProvider({ en: OK, de: OK, fr: OK, it: OK })],
    });
    c.start();
    await c.idle();
    await c.stop();
    expect(c.counts().pending).toBe(0);
    expect(db.prepare('SELECT COUNT(*) n FROM card WHERE image_file IS NOT NULL').get()).toEqual({
      n: 3,
    });
  });

  it('a közben módosított vagy törölt kártya képe nem íródik be, a fájl törlődik', async () => {
    const slow = new FakeProvider({ en: OK, de: OK }, 30);
    const { db, config, collector } = await setup([slow], {
      'https://img/ok': await png(630, 880),
    });
    collector.kick();
    await new Promise((r) => setTimeout(r, 10));
    db.prepare("UPDATE card SET updated_at = '2099-01-01T00:00:00Z' WHERE id = 1").run();
    db.prepare('DELETE FROM card WHERE id = 2').run();
    await collector.idle();
    const files = fs.readdirSync(config.imagesDir);
    expect(files.some((f) => f.startsWith('2-'))).toBe(false);
    expect(files.some((f) => f.startsWith('1-'))).toBe(true); // a módosított újra feldolgozva
  });

  it('kézi újrakeresés (S-43): az új kép lecseréli a régit, hibánál a régi marad', async () => {
    const { db, config, collector } = await setup([new FakeProvider({ en: OK })], {
      'https://img/ok': await png(630, 880),
    });
    await collector.idle();
    const before = db.prepare('SELECT image_file f FROM card WHERE id = 1').get() as { f: string };
    expect(collector.requestRefresh(1)).toBe(true);
    expect(collector.requestRefresh(9999)).toBe(false);
    await collector.idle();
    const after = db.prepare('SELECT image_file f FROM card WHERE id = 1').get() as { f: string };
    expect(after.f).toBe(before.f); // azonos tartalom, azonos hash
    expect(fs.existsSync(path.join(config.imagesDir, after.f))).toBe(true);

    const broken = createImageCollector({
      db,
      imagesDir: config.imagesDir,
      http: fakeHttp({}),
      providers: [new FakeProvider({ en: new NetworkError('x') })],
    });
    broken.requestRefresh(1);
    await broken.idle();
    const kept = db.prepare('SELECT image_file f, image_status s FROM card WHERE id = 1').get() as {
      f: string;
      s: string;
    };
    expect(kept).toEqual({ f: before.f, s: 'error' });
    expect(fs.existsSync(path.join(config.imagesDir, before.f))).toBe(true);
  });

  it('stop() megvárja a futó feldolgozást, utána nem indul új', async () => {
    const { collector } = await setup([new FakeProvider({ en: OK }, 5)], {
      'https://img/ok': await png(630, 880),
    });
    collector.start();
    await collector.stop();
    collector.kick();
    expect(collector.counts().pending).toBeGreaterThan(0);
  });
});

describe('ImageResolver', () => {
  const query: ImageQuery = {
    id: 1,
    pokemon: 'Lechonk',
    setName: 'Scarlet & Violet',
    setCode: 'SVI',
    cardNumber: '154/198',
    note: 'Forrás: https://shop.example/lechonk',
    languageCode: 'de',
  };
  const html = (img: string) => `<meta property="og:image" content="${img}">`;
  const resolver = (http: Http, p: ImageProvider[] = [new FakeProvider({})]) =>
    new ImageResolver({ http, providers: p, allLanguageCodes: () => ['en', 'fr'] });

  it('T-IMG-05: a forrásoldal képe csak kártya arányúként fogadható el', async () => {
    const good = await png(500, 700);
    const small = await png(250, 350);
    const wide = await png(900, 500);
    const run = async (img: Buffer) =>
      resolver(
        fakeHttp({
          'https://shop.example/lechonk': html('/i.png'),
          'https://shop.example/i.png': img,
        }),
      ).resolve(query);
    expect(await run(good)).toMatchObject({ kind: 'found', exact: true });
    expect(await run(small)).toEqual({ kind: 'none' });
    expect(await run(wide)).toEqual({ kind: 'none' });
    expect(looksLikeCard(500, 700)).toBe(true);
    expect(looksLikeCard(250, 350)).toBe(false);
    expect(looksLikeCard(0, 0)).toBe(false);
    expect(looksLikeCard(1000, 700)).toBe(false);
  });

  it('érvénytelen (nem kép) letöltést kihagy', async () => {
    const r = await resolver(
      fakeHttp({
        'https://img/ok': Buffer.from('not an image'),
      }),
      [new FakeProvider({ de: OK })],
    ).resolve({ ...query, note: '' });
    expect(r).toEqual({ kind: 'none' });
  });

  it('a forrásoldal hibája nem akadályozza a tartalékot', async () => {
    const r = await resolver(
      fakeHttp({
        'https://shop.example/lechonk': new SourceError('500', 500),
        'https://img/ok': await png(630, 880),
      }),
      [new FakeProvider({ en: OK })],
    ).resolve(query);
    expect(r).toMatchObject({ kind: 'found', exact: false, languageCode: 'en' });
  });

  it('nyelv nélküli kártyánál csak tartalék keresés van', async () => {
    const p = new FakeProvider({ ja: OK });
    const r = await resolver(fakeHttp({ 'https://img/ok': await png(630, 880) }), [p]).resolve({
      ...query,
      note: '',
      languageCode: null,
    });
    expect(r).toMatchObject({ kind: 'found', exact: false, languageCode: 'ja' });
    expect(p.calls).toEqual(['en', 'ja']); // az angol, majd a japán, azután a többi
  });
});

describe('forrásoldal segédfüggvények', () => {
  it('sourceLinkOf és extractOgImage', () => {
    expect(sourceLinkOf('x\nForrás: https://a.example/p?x=1&y=2 \nzzz')).toBe(
      'https://a.example/p?x=1&y=2',
    );
    expect(sourceLinkOf('nincs link')).toBeNull();
    expect(
      extractOgImage('<meta content="/a.jpg" property="og:image">', 'https://h.example/x/y'),
    ).toBe('https://h.example/a.jpg');
    expect(
      extractOgImage(
        '<meta name="twitter:image" content="b.jpg&amp;v=1">',
        'https://h.example/x/y',
      ),
    ).toBe('https://h.example/x/b.jpg&v=1');
    expect(
      extractOgImage('<meta property="og:title" content="x">', 'https://h.example/'),
    ).toBeNull();
    expect(
      extractOgImage('<meta property="og:image" content="http://[bad">', 'http://[bad'),
    ).toBeNull();
  });
});

describe('TcgdexProvider', () => {
  const API = 'https://api.tcgdex.net/v2';
  const q: ImageQuery = {
    id: 1,
    pokemon: 'Lechonk',
    setName: 'Scarlet & Violet',
    setCode: 'SVI',
    cardNumber: '154/198',
    note: '',
    languageCode: 'de',
  };
  const routes = (extra: Record<string, unknown> = {}) => ({
    [`${API}/en/cards?name=Lechonk`]: [{ id: 'sv01-154', localId: '154', name: 'Lechonk' }],
    [`${API}/en/cards/sv01-154`]: { dexId: [915] },
    [`${API}/de/cards?dexId=eq:915`]: [
      { id: 'sv04.5-071', localId: '071', name: 'Ferkuli', image: 'https://a/de/sv04.5/071' },
      { id: 'sv01-154', localId: '154', name: 'Ferkuli', image: 'https://a/de/sv01/154' },
      { id: 'sv03-154', localId: '154', name: 'Ferkuli', image: 'https://a/de/sv03/154' },
    ],
    [`${API}/de/sets/sv01`]: {
      id: 'sv01',
      name: 'Karmesin & Purpur',
      abbreviation: { official: 'SVI' },
      cardCount: { official: 198 },
    },
    [`${API}/de/sets/sv03`]: { id: 'sv03', name: 'Obsidian', cardCount: { official: 197 } },
    ...extra,
  });

  it('kártyaszám és set (setkód) alapján választ, a többi azonos számú lapot kihagyja', async () => {
    const calls: string[] = [];
    const p = new TcgdexProvider(createFake(routes(), calls));
    const hit = await p.findImage(q, 'de');
    expect(hit).toEqual({
      url: 'https://a/de/sv01/154/high.webp',
      source: `${API}/de/cards/sv01-154`,
    });
    // gyorsítótár: a második kérésre nincs új hívás
    const n = calls.length;
    await p.findImage({ ...q, cardNumber: '071/078', setCode: 'x' }, 'de');
    expect(calls.length).toBe(n + 1); // csak a set lekérése (sv04.5)
  });

  it('a set a lapszám nevezőjéből is felismerhető, setkód nélkül is', async () => {
    const p = new TcgdexProvider(createFake(routes()));
    const hit = await p.findImage({ ...q, setCode: null, setName: 'Ismeretlen név' }, 'de');
    expect(hit?.url).toContain('/sv01/154');
  });

  it('nincs találat: ismeretlen szám, set eltérés, ismeretlen Pokémon, hiányzó kép', async () => {
    const p = new TcgdexProvider(createFake(routes()));
    expect(await p.findImage({ ...q, cardNumber: '999/198' }, 'de')).toBeNull();
    expect(
      await p.findImage({ ...q, setCode: 'ZZZ', setName: 'Más', cardNumber: '154/100' }, 'de'),
    ).toBeNull();
    expect(await new TcgdexProvider(createFake({})).findImage(q, 'de')).toBeNull();
    const noImg = routes({
      [`${API}/de/cards?dexId=eq:915`]: [{ id: 'sv01-154', localId: '154', name: 'F' }],
    });
    expect(await new TcgdexProvider(createFake(noImg)).findImage(q, 'de')).toBeNull();
  });

  it('a dexId-t az első szóból is megkeresi, és a lista gyorsítótára lejár', async () => {
    let t = 0;
    const calls: string[] = [];
    const r = routes({
      [`${API}/en/cards?name=Lechonk%20ex`]: null,
    });
    const p = new TcgdexProvider(createFake(r, calls), () => t);
    await p.findImage({ ...q, pokemon: 'Lechonk ex' }, 'de');
    expect(calls).toContain(`${API}/en/cards?name=Lechonk`);
    const lists = () => calls.filter((c) => c.includes('dexId=eq:915')).length;
    await p.findImage({ ...q, pokemon: 'Lechonk ex' }, 'de');
    expect(lists()).toBe(1);
    t = 7 * 60 * 60 * 1000;
    await p.findImage({ ...q, pokemon: 'Lechonk ex' }, 'de');
    expect(lists()).toBe(2);
  });

  it('közvetlen keresés setkód + szám alapján (kis-/nagybetű mindegy), a sorszám-lista nélkül', async () => {
    const calls: string[] = [];
    const ex: ImageQuery = {
      ...q,
      pokemon: 'Oinkologne',
      setName: 'Scarlet ex',
      setCode: 'SV1S',
      cardNumber: '068/078',
      languageCode: 'ja',
    };
    const r = routes({
      [`${API}/ja/sets`]: [{ id: 'SV1S' }, { id: 'SV4a' }],
      [`${API}/ja/cards/SV1S-068`]: {
        id: 'SV1S-068',
        localId: '068',
        name: 'x',
        image: 'https://a/ja/SV1S/068',
      },
      [`${API}/ja/cards/SV4a-150`]: {
        id: 'SV4a-150',
        localId: '150',
        name: 'y',
        image: 'https://a/ja/SV4a/150',
      },
    });
    const p = new TcgdexProvider(createFake(r, calls));
    expect(await p.findImage(ex, 'ja')).toEqual({
      url: 'https://a/ja/SV1S/068/high.webp',
      source: `${API}/ja/cards/SV1S-068`,
    });
    expect(calls.some((c) => c.includes('dexId'))).toBe(false);
    const hit = await p.findImage({ ...ex, setCode: 'SV4A', cardNumber: '150/190' }, 'ja');
    expect(hit?.url).toBe('https://a/ja/SV4a/150/high.webp');
  });

  it('közvetlen keresés: kép nélküli lap → null (jöhet a tartalék nyelv); nincs ilyen lap → sorszám szerinti keresés', async () => {
    const th: ImageQuery = { ...q, setCode: 'SV3', cardNumber: '098/108', languageCode: 'th' };
    const r = routes({
      [`${API}/th/sets`]: [{ id: 'SV3' }],
      [`${API}/th/cards/SV3-098`]: { id: 'SV3-098', localId: '098', name: 'z' },
      [`${API}/de/sets`]: [{ id: 'SV3' }],
    });
    const p = new TcgdexProvider(createFake(r));
    expect(await p.findImage(th, 'th')).toBeNull();
    // a de nyelvben van SV3 set, de nincs ilyen lap: a régi út (sorszám + set) dönt
    expect((await p.findImage({ ...q, setCode: 'SV3' }, 'de'))?.url).toContain('/sv01/154');
  });

  it('localNumber', () => {
    expect(localNumber('007/SV-P')).toBe('7');
    expect(localNumber('TG05/TG30')).toBe('TG05');
    expect(localNumber(' 154 ')).toBe('154');
  });

  function createFake(r: Record<string, unknown>, calls: string[] = []) {
    return fakeHttp(r, calls);
  }
});

describe('PokemonTcgProvider', () => {
  it('csak angolra és setkóddal keres, a nagy képet adja', async () => {
    const calls: string[] = [];
    const url = (n: string) =>
      `https://api.pokemontcg.io/v2/cards?pageSize=5&select=id,images&q=${encodeURIComponent(`number:"${n}" set.ptcgoCode:"SVI"`)}`;
    const p = new PokemonTcgProvider(
      fakeHttp(
        { [url('154')]: { data: [{ id: 'sv1-154', images: { large: 'https://x/l.png' } }] } },
        calls,
      ),
    );
    const base = {
      id: 1,
      pokemon: 'Lechonk',
      setName: 'S',
      setCode: 'svi',
      cardNumber: '154/198',
      note: '',
      languageCode: 'en',
    };
    expect(await p.findImage(base, 'en')).toEqual({
      url: 'https://x/l.png',
      source: 'https://api.pokemontcg.io/v2/cards/sv1-154',
    });
    expect(await p.findImage(base, 'de')).toBeNull();
    expect(await p.findImage({ ...base, setCode: null }, 'en')).toBeNull();
    expect(await p.findImage({ ...base, setCode: 'S"V' }, 'en')).toBeNull();
    expect(await p.findImage({ ...base, cardNumber: '9/99' }, 'en')).toBeNull();
  });
});

describe('http', () => {
  const resp = (status: number, body = '') => new Response(body, { status });

  it('T-IMG-06: egyszerre egy kérés, a kérések között szünet', async () => {
    const starts: number[] = [];
    let active = 0;
    let maxActive = 0;
    const http = createHttp({
      delayMs: 40,
      fetchImpl: (async () => {
        starts.push(Date.now());
        active++;
        maxActive = Math.max(maxActive, active);
        await new Promise((r) => setTimeout(r, 10));
        active--;
        return resp(200, '{"a":1}');
      }) as typeof fetch,
    });
    await Promise.all([http.json('http://x/1'), http.json('http://x/2'), http.json('http://x/3')]);
    expect(maxActive).toBe(1);
    expect(starts[1]! - starts[0]!).toBeGreaterThanOrEqual(35);
    expect(starts[2]! - starts[1]!).toBeGreaterThanOrEqual(35);
  });

  it('állapotkódok és hibák', async () => {
    const mk = (r: () => Response | Promise<Response>) =>
      createHttp({ delayMs: 0, fetchImpl: (async () => r()) as typeof fetch });
    expect(await mk(() => resp(404)).json('http://x')).toBeNull();
    expect(await mk(() => resp(403)).bytes('http://x')).toBeNull();
    await expect(mk(() => resp(500)).json('http://x')).rejects.toBeInstanceOf(SourceError);
    await expect(mk(() => resp(200, 'nem json')).json('http://x')).rejects.toBeInstanceOf(
      SourceError,
    );
    await expect(
      mk(() => {
        throw new TypeError('fetch failed');
      }).json('http://x'),
    ).rejects.toBeInstanceOf(NetworkError);
    expect((await mk(() => resp(200, 'szöveg')).text('http://x')) ?? '').toBe('szöveg');
    expect((await mk(() => resp(200, 'abc')).bytes('http://x'))?.toString()).toBe('abc');
    await expect(mk(() => resp(200, 'x'.repeat(50))).text('http://x', 10)).rejects.toBeInstanceOf(
      SourceError,
    );
  });
});

describe('tárolás és kiszolgálás', () => {
  it('imageSize / storeImage érvénytelen bemenetre null', async () => {
    expect(await imageSize(Buffer.from('x'))).toBeNull();
    expect(await storeImage(tempDir(), 1, Buffer.from('x'))).toBeNull();
    expect(IMAGE_FILE_RE.test('1-abcdef12.webp')).toBe(true);
    expect(IMAGE_FILE_RE.test('../x.webp')).toBe(false);
  });

  it('T-IMG-08: GET /api/images/:file – immutable cache, útvonal-bejárás 400, hiányzó 404', async () => {
    const { db, config } = testDb();
    await importExcel(db, fixture('sample-master.xlsx'));
    const file = await storeImage(config.imagesDir, 1, await png(630, 880));
    expect(file).toMatch(IMAGE_FILE_RE);
    const app = await buildApp({ db, config, version: '1', webDistDir: null });
    const ok = await app.inject({ url: `/api/images/${file}`, headers: LOCAL_HEADERS });
    expect(ok.statusCode).toBe(200);
    expect(ok.headers['cache-control']).toContain('immutable');
    expect(ok.headers['content-type']).toBe('image/webp');
    const thumb = await app.inject({
      url: `/api/images/${file!.replace('.webp', '-thumb.webp')}`,
      headers: LOCAL_HEADERS,
    });
    expect(thumb.statusCode).toBe(200);
    for (const bad of ['..%2F..%2Fgms.sqlite', '..%2Fx.webp', 'a.png', '1-zzzzzzzz.webp']) {
      const res = await app.inject({ url: `/api/images/${bad}`, headers: LOCAL_HEADERS });
      expect(res.statusCode, bad).toBe(400);
    }
    const missing = await app.inject({
      url: '/api/images/9-abcdef12.webp',
      headers: LOCAL_HEADERS,
    });
    expect(missing.statusCode).toBe(404);
  });

  it('állapot-összesítő, újrakeresés és a kártya képmezői az API-n', async () => {
    const { db, config } = testDb();
    await importExcel(db, fixture('sample-master.xlsx'));
    const collector = createImageCollector({
      db,
      imagesDir: config.imagesDir,
      http: fakeHttp({ 'https://img/ok': await png(630, 880) }),
      providers: [new FakeProvider({ en: OK })],
    });
    const app = await buildApp({ db, config, version: '1', webDistDir: null, collector });
    const status = async () =>
      (
        await app.inject({ url: '/api/images/status', headers: LOCAL_HEADERS })
      ).json() as ImageStatusCounts;
    expect(await status()).toMatchObject({ total: 43, pending: 43 });
    await collector.idle();
    const s = await status();
    expect(s.pending).toBe(0);
    expect(s.exact + s.fallback).toBe(43);

    const fb = (
      (await app.inject({ url: '/api/cards', headers: LOCAL_HEADERS })).json() as Card[]
    ).find((c) => c.image.status === 'fallback')!;
    expect(fb.image.url).toMatch(/^\/api\/images\/\d+-[0-9a-f]{8}\.webp$/u);
    expect(fb.image.thumbUrl).toMatch(/-thumb\.webp$/u);
    expect(fb.image.languageNameHu).toBe('Angol');

    const re = await app.inject({
      method: 'POST',
      url: `/api/cards/${fb.id}/image/refresh`,
      headers: LOCAL_HEADERS,
      payload: {},
    });
    expect(re.statusCode).toBe(200);
    expect((re.json() as Card).image.status).toBe('pending');
    const nf = await app.inject({
      method: 'POST',
      url: '/api/cards/9999/image/refresh',
      headers: LOCAL_HEADERS,
      payload: {},
    });
    expect(nf.statusCode).toBe(404);
    const bad = await app.inject({
      method: 'POST',
      url: '/api/cards/abc/image/refresh',
      headers: LOCAL_HEADERS,
      payload: {},
    });
    expect(bad.statusCode).toBe(404);
    await collector.idle();
  });

  it('T-IMG-09: új kártya mentése után a háttérkeresés elindul; módosításnál is', async () => {
    const { db, config } = testDb();
    await importExcel(db, fixture('sample-master.xlsx'));
    db.prepare("UPDATE card SET image_status = 'none'").run();
    const collector = createImageCollector({
      db,
      imagesDir: config.imagesDir,
      http: fakeHttp({ 'https://img/ok': await png(630, 880) }),
      providers: [new FakeProvider({ en: OK, de: OK })],
    });
    const app = await buildApp({ db, config, version: '1', webDistDir: null, collector });
    const post = await app.inject({
      method: 'POST',
      url: '/api/cards',
      headers: LOCAL_HEADERS,
      payload: {
        pokemon: 'Lechonk',
        setName: 'Új set',
        setCode: 'NEW',
        cardNumber: '1/2',
        finishId: 1,
        languageId: 1,
        note: '',
        owned: false,
      },
    });
    expect(post.statusCode).toBe(201);
    const id = (post.json() as Card).id;
    expect((post.json() as Card).image.status).toBe('pending');
    await collector.idle();
    const get = async () =>
      (await app.inject({ url: `/api/cards/${id}`, headers: LOCAL_HEADERS })).json() as Card;
    expect((await get()).image.status).toBe('exact');

    const patch = await app.inject({
      method: 'PATCH',
      url: `/api/cards/${id}`,
      headers: LOCAL_HEADERS,
      payload: { cardNumber: '2/2' },
    });
    expect((patch.json() as Card).image.status).toBe('pending');
    await collector.idle();
    expect((await get()).image.status).toBe('exact');
  });
});
