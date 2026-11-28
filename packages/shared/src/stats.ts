/**
 * Dashboard statisztikák (technikai spec 8.2, S-30…S-33). Tiszta függvény: a szerver
 * a kártyákon számolja, a tesztek egy független számolással vetik össze.
 */
import type { Card } from './types.js';

export interface StatGroup {
  /** Szűrésre használt érték (nyelvnél a rövid kód, a többinél a név). */
  key: string;
  label: string;
  owned: number;
  all: number;
}

export type ClosestKind = 'language' | 'set';

export interface ClosestGroup extends StatGroup {
  kind: ClosestKind;
  missing: number;
}

export interface Stats {
  total: { owned: number; all: number };
  byLanguage: StatGroup[];
  byPokemon: StatGroup[];
  bySet: StatGroup[];
  byFinish: StatGroup[];
  closest: ClosestGroup[];
  recent: Card[];
}

export const CLOSEST_LIMIT = 6;
export const RECENT_LIMIT = 8;

const collator = new Intl.Collator('hu', { sensitivity: 'base', numeric: true });

function group(
  cards: readonly Card[],
  keyOf: (c: Card) => string,
  labelOf: (c: Card) => string,
): StatGroup[] {
  const m = new Map<string, StatGroup>();
  for (const c of cards) {
    const key = keyOf(c);
    let g = m.get(key);
    if (!g) {
      g = { key, label: labelOf(c), owned: 0, all: 0 };
      m.set(key, g);
    }
    g.all++;
    if (c.owned) g.owned++;
  }
  return [...m.values()];
}

const byLabel = (a: StatGroup, b: StatGroup) => collator.compare(a.label, b.label);

/** Setek: a hiányzók száma szerint csökkenően, egyenlőségnél név szerint (S-31/EF2). */
export function compareSets(a: StatGroup, b: StatGroup): number {
  const d = b.all - b.owned - (a.all - a.owned);
  return d !== 0 ? d : byLabel(a, b);
}

/** Majdnem kész: a nem teljes, nem üres csoportok, a legkevesebb hiányzóval kezdve (S-32). */
export function closestGroups(
  languages: readonly StatGroup[],
  sets: readonly StatGroup[],
  limit = CLOSEST_LIMIT,
): ClosestGroup[] {
  const tag = (groups: readonly StatGroup[], kind: ClosestKind): ClosestGroup[] =>
    groups
      .filter((g) => g.all > 0 && g.owned < g.all)
      .map((g) => ({ ...g, kind, missing: g.all - g.owned }));
  return [...tag(languages, 'language'), ...tag(sets, 'set')]
    .sort((a, b) => a.missing - b.missing || byLabel(a, b) || (a.kind < b.kind ? -1 : 1))
    .slice(0, limit);
}

/**
 * @param ownedChangedAt kártya-azonosító → az utolsó "megvan"-ra állítás ideje. Az
 *   importált lapoknak nincs bejegyzésük, így a "Legutóbb megszerzett" között sem szerepelnek.
 */
export function computeStats(
  cards: readonly Card[],
  ownedChangedAt: ReadonlyMap<number, string>,
): Stats {
  const order = new Map(cards.map((c) => [c.language.shortCode, c.language.sortOrder]));
  const byLanguage = group(
    cards,
    (c) => c.language.shortCode,
    (c) => c.language.nameHu,
  ).sort((a, b) => order.get(a.key)! - order.get(b.key)!);
  const byPokemon = group(
    cards,
    (c) => c.pokemon,
    (c) => c.pokemon,
  ).sort(byLabel);
  const bySet = group(
    cards,
    (c) => c.setName,
    (c) => c.setName,
  ).sort(compareSets);
  const byFinish = group(
    cards,
    (c) => c.finish.name,
    (c) => c.finish.name,
  ).sort((a, b) => b.all - a.all || byLabel(a, b));

  const recent = cards
    .filter((c) => c.owned && ownedChangedAt.has(c.id))
    .sort((a, b) => {
      const ta = ownedChangedAt.get(a.id)!;
      const tb = ownedChangedAt.get(b.id)!;
      return ta < tb ? 1 : ta > tb ? -1 : b.id - a.id;
    })
    .slice(0, RECENT_LIMIT);

  return {
    total: { owned: cards.filter((c) => c.owned).length, all: cards.length },
    byLanguage,
    byPokemon,
    bySet,
    byFinish,
    closest: closestGroups(byLanguage, bySet),
    recent,
  };
}
