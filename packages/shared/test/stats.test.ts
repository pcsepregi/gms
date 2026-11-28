import { describe, expect, it } from 'vitest';
import { closestGroups, compareSets, computeStats, type StatGroup } from '../src/stats.js';
import { makeCard, type CardSpec } from './factory.js';

const g = (key: string, owned: number, all: number): StatGroup => ({ key, label: key, owned, all });

describe('computeStats (T-DSH-01)', () => {
  const specs: CardSpec[] = [
    { language: 'DE', setName: 'Alfa', owned: true },
    { language: 'DE', setName: 'Alfa', owned: true, finish: 'Holo' },
    { language: 'DE', setName: 'Béta', owned: false, pokemon: 'Pokemon B' },
    { language: 'EN', setName: 'Alfa', owned: false, pokemon: 'Pokemon B' },
    { language: 'EN', setName: 'Gamma', owned: true },
    { language: 'FR', setName: 'Gamma', owned: false },
  ];
  const cards = specs.map((s) => makeCard(s));
  const stats = computeStats(cards, new Map());

  it('az összesítés és minden csoport egyezik egy független számolással', () => {
    expect(stats.total).toEqual({ owned: 3, all: 6 });
    const check = (groups: StatGroup[], pick: (c: (typeof cards)[number]) => string) => {
      for (const grp of groups) {
        const inGroup = cards.filter((c) => pick(c) === grp.key);
        expect(grp.all).toBe(inGroup.length);
        expect(grp.owned).toBe(inGroup.filter((c) => c.owned).length);
      }
      expect(groups.reduce((n, x) => n + x.all, 0)).toBe(cards.length);
    };
    check(stats.byLanguage, (c) => c.language.shortCode);
    check(stats.byPokemon, (c) => c.pokemon);
    check(stats.bySet, (c) => c.setName);
    check(stats.byFinish, (c) => c.finish.name);
  });

  it('a nyelvek a nyelvtábla sorrendjében, magyar névvel jönnek', () => {
    expect(stats.byLanguage.map((x) => x.key)).toEqual(['EN', 'FR', 'DE']);
    expect(stats.byLanguage[2]!.label).toBe('Német');
  });

  it('üres gyűjtemény', () => {
    const empty = computeStats([], new Map());
    expect(empty.total).toEqual({ owned: 0, all: 0 });
    expect(empty.closest).toEqual([]);
    expect(empty.recent).toEqual([]);
  });
});

describe('setek rendezése (T-DSH-03)', () => {
  it('hiányzók száma szerint csökkenően, egyenlőségnél név szerint', () => {
    const sets = [g('Béta', 1, 3), g('Alfa', 1, 3), g('Gamma', 0, 5), g('Delta', 2, 2)];
    expect(sets.sort(compareSets).map((x) => x.key)).toEqual(['Gamma', 'Alfa', 'Béta', 'Delta']);
  });
});

describe('majdnem kész (T-DSH-04)', () => {
  it('csak nem teljes, nem üres csoportok, a legkevesebb hiányzóval kezdve', () => {
    const langs = [g('DE', 4, 4), g('FR', 1, 4), g('EN', 0, 0), g('IT', 3, 4)];
    const sets = [g('S1', 5, 6), g('S2', 0, 9)];
    const result = closestGroups(langs, sets);
    expect(result.map((x) => `${x.kind}:${x.key}:${x.missing}`)).toEqual([
      'language:IT:1',
      'set:S1:1',
      'language:FR:3',
      'set:S2:9',
    ]);
  });

  it('legfeljebb 6 elem', () => {
    const many = Array.from({ length: 10 }, (_, i) => g(`L${i}`, i, 20));
    expect(closestGroups(many, [])).toHaveLength(6);
    expect(closestGroups(many, [])[0]!.key).toBe('L9');
  });
});

describe('legutóbb megszerzett (T-DSH-05)', () => {
  it('az utolsó 8, a legfrissebb elöl; időbélyeg nélküli (importált) lap kimarad', () => {
    const cards = Array.from({ length: 11 }, () => makeCard({ owned: true }));
    const changed = new Map<number, string>();
    // 10 jelölés különböző időpontokban, az első kártya importált (nincs bejegyzés).
    cards.slice(1).forEach((c, i) => changed.set(c.id, `2026-02-0${(i % 9) + 1}T10:00:0${i}.000Z`));
    const { recent } = computeStats(cards, changed);
    expect(recent).toHaveLength(8);
    expect(recent).not.toContain(cards[0]);
    const times = recent.map((c) => changed.get(c.id)!);
    expect(times).toEqual([...times].sort().reverse());
  });

  it('a már nem "megvan" lap nem szerepel', () => {
    const c = makeCard({ owned: false });
    expect(computeStats([c], new Map([[c.id, '2026-01-01T00:00:00.000Z']])).recent).toEqual([]);
  });
});
