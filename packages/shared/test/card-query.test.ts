import { describe, expect, it } from 'vitest';
import {
  DEFAULT_QUERY,
  NO_SET_CODE,
  cardNumberValue,
  compareCardNumbers,
  filterCards,
  foldSearch,
  hasActiveFilters,
  queryCards,
  queryFromParams,
  queryToParams,
  searchTokens,
  sortCards,
  type CardQuery,
  type SortKey,
} from '../src/card-query.js';
import { makeCard, manyCards } from './factory.js';

const q = (patch: Partial<CardQuery>): CardQuery => ({ ...DEFAULT_QUERY, ...patch });
const ids = (cards: { id: number }[]) => cards.map((c) => c.id);

describe('keresés (S-12)', () => {
  const target = makeCard({
    pokemon: 'Pokemon Zeta',
    setName: 'Paldea Quest',
    setCode: 'PQX',
    cardNumber: '077/198',
    finish: 'Cosmos Holo',
    language: 'DE',
    note: 'Bolhapiacon láttam',
  });
  const other = makeCard({ pokemon: 'Pokemon A', language: 'EN', cardNumber: '1/100' });
  const cards = [target, other];

  it.each([
    ['Pokémon', 'zeta'],
    ['set', 'paldea'],
    ['setkód', 'pqx'],
    ['kártyaszám', '077/198'],
    ['finish', 'cosmos'],
    ['angol nyelvnév', 'german'],
    ['magyar nyelvnév', 'Német'],
    ['megjegyzés', 'bolhapiac'],
    ['azonosító', 'DE-Pokemon_Zeta'],
  ])('T-SRC-01 (S-12/EF2): keres a(z) %s mezőben', (_field, text) => {
    expect(ids(filterCards(cards, q({ q: text })))).toEqual([target.id]);
  });

  it('T-SRC-02 (S-12/EF3): kis-/nagybetű és ékezet nem számít', () => {
    const results = ['NEMET', 'német', 'nemet', 'NÉMET'].map((t) =>
      ids(filterCards(cards, q({ q: t }))),
    );
    for (const r of results) expect(r).toEqual([target.id]);
  });

  it('T-SRC-03 (S-12/EF3): a "7" és a "007" is megtalálja a 007/SV-P lapot', () => {
    const promo = makeCard({ cardNumber: '007/SV-P', setName: 'Promos', setCode: 'SVP' });
    const plain = makeCard({ cardNumber: '154/198' });
    for (const t of ['7', '007', '7/sv-p']) {
      expect(ids(filterCards([promo, plain], q({ q: t })))).toEqual([promo.id]);
    }
  });

  it('T-SRC-04 (S-12/EF4): több szó esetén mindegyiknek egyeznie kell', () => {
    const a = makeCard({ language: 'DE', finish: 'Reverse Holo', cardNumber: '154/198' });
    const b = makeCard({ language: 'DE', finish: 'Normal', cardNumber: '154/198' });
    const c = makeCard({ language: 'FR', finish: 'Reverse Holo', cardNumber: '154/198' });
    const d = makeCard({ language: 'DE', finish: 'Reverse Holo', cardNumber: '158/198' });
    expect(ids(filterCards([a, b, c, d], q({ q: 'német reverse 154' })))).toEqual([a.id]);
  });

  it('üres vagy csak szóközös keresés: nincs feltétel', () => {
    expect(searchTokens('   ')).toEqual([]);
    expect(filterCards(cards, q({ q: '  ' }))).toHaveLength(2);
  });

  it('foldSearch: ékezet, kisbetű, vezető nullák', () => {
    expect(foldSearch('Ősi NÉMET 007/SV-P 100 0')).toBe('osi nemet 7/sv-p 100 0');
  });
});

describe('szűrés (S-13)', () => {
  const de = makeCard({ language: 'DE', finish: 'Reverse Holo', owned: false });
  const fr = makeCard({ language: 'FR', finish: 'Reverse Holo', owned: false });
  const frOwned = makeCard({ language: 'FR', finish: 'Reverse Holo', owned: true });
  const deNormal = makeCard({ language: 'DE', finish: 'Normal', owned: false });
  const en = makeCard({ language: 'EN', finish: 'Reverse Holo', owned: false });
  const cards = [de, fr, frOwned, deNormal, en];

  it('T-FLT-01 (S-13/EF2): (DE vagy FR) és Reverse Holo és hiányzik', () => {
    const r = filterCards(
      cards,
      q({ languages: ['DE', 'FR'], finishes: ['Reverse Holo'], owned: 'missing' }),
    );
    expect(ids(r)).toEqual([de.id, fr.id]);
  });

  it('T-FLT-02 (S-13/EF3): szűrő és keresés együtt a két feltétel metszete', () => {
    const r = filterCards(cards, q({ languages: ['DE', 'FR'], q: 'normal' }));
    expect(ids(r)).toEqual([deNormal.id]);
  });

  it('Pokémon, set, állapot (megvan) és képállapot szűrő', () => {
    const p1 = makeCard({ pokemon: 'P1', setName: 'X', owned: true, imageStatus: 'fallback' });
    const p2 = makeCard({ pokemon: 'P2', setName: 'Y', owned: true, imageStatus: 'none' });
    const p3 = makeCard({ pokemon: 'P1', setName: 'Y', owned: false, imageStatus: 'exact' });
    const all = [p1, p2, p3];
    expect(ids(filterCards(all, q({ pokemon: ['P1'] })))).toEqual([p1.id, p3.id]);
    expect(ids(filterCards(all, q({ sets: ['Y'] })))).toEqual([p2.id, p3.id]);
    expect(ids(filterCards(all, q({ owned: 'owned' })))).toEqual([p1.id, p2.id]);
    expect(ids(filterCards(all, q({ image: ['fallback', 'none'] })))).toEqual([p1.id, p2.id]);
    expect(ids(filterCards(all, q({ image: ['none'], pokemon: ['P1'] })))).toEqual([]);
  });

  it('setkód szűrő: több kód VAGY kapcsolatban, a kód nélküli lapok külön értéken', () => {
    const a = makeCard({ setCode: 'SVI' });
    const b = makeCard({ setCode: 'PAF' });
    const c = makeCard({ setCode: null });
    const all = [a, b, c];
    expect(ids(filterCards(all, q({ setCodes: ['SVI'] })))).toEqual([a.id]);
    expect(ids(filterCards(all, q({ setCodes: ['SVI', 'PAF'] })))).toEqual([a.id, b.id]);
    expect(ids(filterCards(all, q({ setCodes: [NO_SET_CODE] })))).toEqual([c.id]);
  });

  it('hasActiveFilters: a rendezés nem számít szűrőnek', () => {
    expect(hasActiveFilters(DEFAULT_QUERY)).toBe(false);
    expect(hasActiveFilters(q({ sort: 'pokemon', dir: 'desc' }))).toBe(false);
    for (const patch of [
      { q: 'x' },
      { pokemon: ['a'] },
      { languages: ['DE'] },
      { sets: ['s'] },
      { setCodes: ['SVI'] },
      { finishes: ['f'] },
      { owned: 'owned' as const },
      { image: ['none' as const] },
    ]) {
      expect(hasActiveFilters(q(patch))).toBe(true);
    }
  });
});

describe('rendezés (S-15)', () => {
  it('T-SRT-01 (S-15/EF2): kártyaszám számszerűen, azonos számnál a teljes szöveg szerint', () => {
    const nums = ['10/021', '9/021', '009/023', '1601/05', '007/SV-P', 'SWSH050', 'TG01'];
    const sorted = [...nums].sort(compareCardNumbers);
    expect(sorted.slice(0, 5)).toEqual(['007/SV-P', '9/021', '009/023', '10/021', '1601/05']);
    // A nem számmal kezdődők a végére kerülnek.
    expect(sorted.slice(5)).toEqual(['SWSH050', 'TG01']);
    expect(cardNumberValue('  12/50')).toBe(12);
  });

  it('T-SRT-02 (S-15/EF3): a nyelvek a rögzített sorrendben', () => {
    const codes = ['ID', 'JA', 'EN', 'DE', 'FR', 'ZHT', 'LA'];
    const cards = codes.map((language) => makeCard({ language }));
    expect(sortCards(cards, 'language', 'asc').map((c) => c.language.shortCode)).toEqual([
      'EN',
      'FR',
      'DE',
      'LA',
      'JA',
      'ZHT',
      'ID',
    ]);
  });

  it('T-SRT-03 (S-15/EF1): minden mező mindkét irányban, stabil sorrend', () => {
    const cards = [
      makeCard({
        setName: 'Beta',
        cardNumber: '10/20',
        pokemon: 'B',
        language: 'FR',
        updatedAt: '2026-03-01T00:00:00Z',
      }),
      makeCard({
        setName: 'Alpha',
        cardNumber: '2/20',
        pokemon: 'C',
        language: 'DE',
        updatedAt: '2026-01-01T00:00:00Z',
      }),
      makeCard({
        setName: 'Ágas',
        cardNumber: '30/20',
        pokemon: 'A',
        language: 'EN',
        updatedAt: '2026-02-01T00:00:00Z',
      }),
    ];
    const [beta, alpha, agas] = cards.map((c) => c.id);
    const expected: Record<SortKey, number[]> = {
      set: [agas!, alpha!, beta!],
      number: [alpha!, beta!, agas!],
      language: [agas!, beta!, alpha!],
      pokemon: [agas!, beta!, alpha!],
      updated: [alpha!, agas!, beta!],
    };
    for (const [key, order] of Object.entries(expected) as [SortKey, number[]][]) {
      expect(ids(sortCards(cards, key, 'asc')), key).toEqual(order);
      expect(ids(sortCards(cards, key, 'desc')), key).toEqual([...order].reverse());
    }
  });

  it('a döntetlenek a további szempontok, végül az azonosító szerint dőlnek el', () => {
    const a = makeCard({ setName: 'S', cardNumber: '1/2', language: 'FR' });
    const b = makeCard({ setName: 'S', cardNumber: '1/2', language: 'EN' });
    const c = makeCard({ setName: 'S', cardNumber: '1/2', language: 'EN' });
    expect(ids(sortCards([c, a, b], 'set', 'asc'))).toEqual([b.id, c.id, a.id]);
    // Csökkenő iránynál is a mellékszempontok növekvők maradnak.
    expect(ids(sortCards([c, a, b], 'set', 'desc'))).toEqual([b.id, c.id, a.id]);
    expect(ids(sortCards([c, a, b], 'updated', 'asc'))).toEqual(
      ids(sortCards([a, b, c], 'updated', 'asc')),
    );
  });

  it('queryCards: szűr és rendez', () => {
    const a = makeCard({ cardNumber: '5/9', owned: true });
    const b = makeCard({ cardNumber: '3/9', owned: true });
    const c = makeCard({ cardNumber: '1/9', owned: false });
    expect(ids(queryCards([a, b, c], q({ owned: 'owned', sort: 'number' })))).toEqual([b.id, a.id]);
  });
});

describe('URL paraméterek (S-16)', () => {
  it('oda-vissza alakítás', () => {
    const query = q({
      q: 'német 154',
      pokemon: ['Pokemon A', 'Pokemon, B'],
      languages: ['DE', 'FR'],
      sets: ['Scarlet & Violet', 'Set, with comma'],
      setCodes: ['SVI', 'PAF'],
      finishes: ['Reverse Holo'],
      owned: 'missing',
      image: ['fallback', 'none'],
      sort: 'number',
      dir: 'desc',
    });
    const params = queryToParams(query);
    expect(params.get('nyelv')).toBe('DE,FR');
    expect(params.get('setkod')).toBe('SVI,PAF');
    expect(params.get('allapot')).toBe('hianyzik');
    expect(params.get('kep')).toBe('tartalek,nincs');
    expect(params.get('rendezes')).toBe('szam');
    expect(params.get('irany')).toBe('csokkeno');
    expect(queryFromParams(new URLSearchParams(params.toString()))).toEqual(query);
  });

  it('alapértelmezett lekérdezés: üres URL', () => {
    expect(queryToParams(DEFAULT_QUERY).toString()).toBe('');
    expect(queryFromParams(new URLSearchParams())).toEqual(DEFAULT_QUERY);
  });

  it('kézzel írt URL: kisbetűs nyelvkód, ismeretlen értékek elhagyva', () => {
    const r = queryFromParams(
      new URLSearchParams('nyelv=de,fr,&allapot=x&kep=x,nincs&rendezes=x&irany=x&set=&set=A&set=A'),
    );
    expect(r).toEqual(q({ languages: ['DE', 'FR'], image: ['none'], sets: ['A'] }));
    expect(queryFromParams(new URLSearchParams('allapot=megvan')).owned).toBe('owned');
  });
});

describe('teljesítmény (T-PRF-01, T-PRF-02)', () => {
  function median(fn: () => void, runs = 15) {
    fn(); // bemelegítés, a keresési index felépítése
    const times = Array.from({ length: runs }, () => {
      const t0 = performance.now();
      fn();
      return performance.now() - t0;
    }).sort((a, b) => a - b);
    return times[Math.floor(runs / 2)]!;
  }

  const query = q({
    q: 'reverse 1',
    languages: ['DE', 'FR', 'EN'],
    owned: 'missing',
    sort: 'number',
  });

  it('400 kártya: szűrés + keresés + rendezés < 5 ms', () => {
    const cards = manyCards(400);
    expect(median(() => queryCards(cards, query))).toBeLessThan(5);
  });

  it('5000 kártya: < 30 ms', () => {
    const cards = manyCards(5000);
    expect(
      median(() =>
        queryCards(cards, { ...query, q: 'a', languages: [], owned: 'all', sort: 'set' }),
      ),
    ).toBeLessThan(30);
  });
});
