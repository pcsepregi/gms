/**
 * Kártyalista keresés, szűrés és rendezés (technikai spec 8.3, S-12…S-16).
 * Tiszta függvények: a kliens memóriában futtatja őket a teljes listán.
 */
import type { Card } from './types.js';

// ---------------------------------------------------------------------------
// Keresés
// ---------------------------------------------------------------------------

/**
 * Keresési alak: kisbetű, ékezet nélkül (`Német` → `nemet`), és a számok vezető
 * nullái nélkül (`007/SV-P` → `7/sv-p`), hogy a `7` és a `007` is megtalálja.
 */
export function foldSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase('en-US')
    .replace(/(?<!\d)0+(?=\d)/gu, '');
}

/** A keresőszöveg szavai (üres szöveg → nincs feltétel). */
export function searchTokens(query: string): string[] {
  return foldSearch(query).split(/\s+/u).filter(Boolean);
}

/** A kártya összes kereshető mezője egy szövegben. */
export function cardHaystack(card: Card): string {
  return foldSearch(
    [
      card.pokemon,
      card.setName,
      card.setCode ?? '',
      card.cardNumber,
      card.finish.name,
      card.language.name,
      card.language.nameHu,
      card.language.shortCode,
      card.note,
      card.displayId,
    ].join('\n'),
  );
}

const haystackCache = new WeakMap<Card, string>();

function haystackOf(card: Card): string {
  let h = haystackCache.get(card);
  if (h === undefined) {
    h = cardHaystack(card);
    haystackCache.set(card, h);
  }
  return h;
}

/** Igaz, ha a kártya minden keresett szót tartalmaz (ÉS kapcsolat). */
export function matchesSearch(card: Card, tokens: readonly string[]): boolean {
  if (tokens.length === 0) return true;
  const h = haystackOf(card);
  return tokens.every((t) => h.includes(t));
}

// ---------------------------------------------------------------------------
// Szűrők
// ---------------------------------------------------------------------------

/** Setkód-szűrőben a kód nélküli lapok értéke. */
export const NO_SET_CODE = '-';

/** A kártya setkódja a szűréshez (kód nélkül NO_SET_CODE). */
export function setCodeKey(card: Pick<Card, 'setCode'>): string {
  return card.setCode?.trim() || NO_SET_CODE;
}

/** `missing`: nincs meg (az úton lévők is); `onTheWay`: megrendelve, még nem érkezett meg. */
export type OwnedFilter = 'all' | 'owned' | 'missing' | 'onTheWay';
export type ImageFilter = 'fallback' | 'none';
export type SortKey = 'set' | 'number' | 'language' | 'pokemon' | 'updated';
export type SortDir = 'asc' | 'desc';

export interface CardQuery {
  q: string;
  pokemon: string[];
  /** Nyelvek rövid kódja (pl. `DE`). */
  languages: string[];
  sets: string[];
  /** Setkódok (pl. `SVI`); a kód nélküli lapokat a NO_SET_CODE érték jelöli. */
  setCodes: string[];
  finishes: string[];
  owned: OwnedFilter;
  image: ImageFilter[];
  sort: SortKey;
  dir: SortDir;
}

export const DEFAULT_QUERY: CardQuery = {
  q: '',
  pokemon: [],
  languages: [],
  sets: [],
  setCodes: [],
  finishes: [],
  owned: 'all',
  image: [],
  sort: 'set',
  dir: 'asc',
};

/** Van-e aktív szűrő vagy keresés (a rendezés nem számít). */
export function hasActiveFilters(q: CardQuery): boolean {
  return (
    q.q.trim() !== '' ||
    q.pokemon.length > 0 ||
    q.languages.length > 0 ||
    q.sets.length > 0 ||
    q.setCodes.length > 0 ||
    q.finishes.length > 0 ||
    q.owned !== 'all' ||
    q.image.length > 0
  );
}

function matchesOwned(c: Card, f: OwnedFilter): boolean {
  if (f === 'all') return true;
  if (f === 'onTheWay') return c.onTheWay;
  return c.owned === (f === 'owned');
}

/**
 * Szűrés: a különböző szűrők ÉS, egy szűrőn belül az értékek VAGY kapcsolatban
 * vannak (S-13/EF2), és a keresés is ÉS feltétel (S-13/EF3).
 */
export function filterCards(cards: readonly Card[], q: CardQuery): Card[] {
  const tokens = searchTokens(q.q);
  const pokemon = q.pokemon.length ? new Set(q.pokemon) : null;
  const languages = q.languages.length ? new Set(q.languages) : null;
  const sets = q.sets.length ? new Set(q.sets) : null;
  const setCodes = q.setCodes.length ? new Set(q.setCodes) : null;
  const finishes = q.finishes.length ? new Set(q.finishes) : null;
  const image = q.image.length ? new Set<string>(q.image) : null;

  return cards.filter(
    (c) =>
      matchesOwned(c, q.owned) &&
      (!pokemon || pokemon.has(c.pokemon)) &&
      (!languages || languages.has(c.language.shortCode)) &&
      (!sets || sets.has(c.setName)) &&
      (!setCodes || setCodes.has(setCodeKey(c))) &&
      (!finishes || finishes.has(c.finish.name)) &&
      (!image || image.has(c.image.status)) &&
      matchesSearch(c, tokens),
  );
}

// ---------------------------------------------------------------------------
// Rendezés
// ---------------------------------------------------------------------------

const collator = new Intl.Collator('hu', { sensitivity: 'base', numeric: true });

/** A kártyaszám `/` előtti része számként; ha nem szám, `Infinity` (a végére kerül). */
export function cardNumberValue(cardNumber: string): number {
  const m = /^\s*(\d+)/u.exec(cardNumber.split('/')[0] ?? '');
  return m ? Number(m[1]) : Number.POSITIVE_INFINITY;
}

/** Kártyaszámok összevetése: számszerűen, azonos számnál a teljes szöveg szerint (S-15/EF2). */
export function compareCardNumbers(a: string, b: string): number {
  const na = cardNumberValue(a);
  const nb = cardNumberValue(b);
  if (na !== nb) return na < nb ? -1 : 1;
  return collator.compare(a, b);
}

/** Egy szöveges mező értékeinek rangja (egyszer rendezve), hogy a fő rendezés egész számokat hasonlítson. */
function ranks(values: Iterable<string>, cmp: (a: string, b: string) => number) {
  const sorted = [...new Set(values)].sort(cmp);
  const m = new Map<string, number>();
  let rank = 0;
  sorted.forEach((v, i) => {
    if (i > 0 && cmp(sorted[i - 1]!, v) !== 0) rank++;
    m.set(v, rank);
  });
  return m;
}

type Field = 'set' | 'number' | 'language' | 'pokemon' | 'finish' | 'updated';

/** Fő rendezési szempont, utána a többi rögzített sorrendben a stabil eredményért. */
const CHAINS: Record<SortKey, Field[]> = {
  set: ['set', 'number', 'pokemon', 'finish', 'language'],
  number: ['number', 'set', 'pokemon', 'finish', 'language'],
  language: ['language', 'set', 'number', 'pokemon', 'finish'],
  pokemon: ['pokemon', 'set', 'number', 'finish', 'language'],
  updated: ['updated'],
};

/** Rendezett másolat; az irány csak a fő szempontra vonatkozik, a döntetlenek növekvők. */
export function sortCards(cards: readonly Card[], key: SortKey, dir: SortDir): Card[] {
  const fields = CHAINS[key];
  const text = (f: (c: Card) => string, cmp = collator.compare) => {
    const r = ranks(cards.map(f), cmp);
    return (c: Card) => r.get(f(c))!;
  };
  const getters: Record<Field, (c: Card) => number> = {
    set: text((c) => c.setName),
    number: text((c) => c.cardNumber, compareCardNumbers),
    language: (c) => c.language.sortOrder,
    pokemon: text((c) => c.pokemon),
    finish: text((c) => c.finish.name),
    updated: text(
      (c) => c.updatedAt,
      (a, b) => (a < b ? -1 : a > b ? 1 : 0),
    ),
  };
  const sign = dir === 'desc' ? -1 : 1;
  // Kulcsvektorok előre kiszámolva (kártyánként egyszer).
  const keyed = cards.map((card) => ({
    card,
    k: fields.map((f) => getters[f](card)),
  }));
  keyed.sort((a, b) => {
    for (let i = 0; i < a.k.length; i++) {
      const d = a.k[i]! - b.k[i]!;
      if (d !== 0) return i === 0 ? sign * d : d;
    }
    return a.card.id - b.card.id;
  });
  return keyed.map((x) => x.card);
}

/** Szűrés + rendezés egy lépésben. */
export function queryCards(cards: readonly Card[], q: CardQuery): Card[] {
  return sortCards(filterCards(cards, q), q.sort, q.dir);
}

// ---------------------------------------------------------------------------
// URL (S-16): `/kartyak?q=…&nyelv=DE,FR&allapot=hianyzik&pokemon=…&set=…&setkod=SVI,PAF&finish=…`
// ---------------------------------------------------------------------------

const OWNED_PARAM: Record<OwnedFilter, string | null> = {
  all: null,
  owned: 'megvan',
  missing: 'hianyzik',
  onTheWay: 'uton',
};
const IMAGE_PARAM: Record<ImageFilter, string> = { fallback: 'tartalek', none: 'nincs' };
const SORT_PARAM: Record<SortKey, string> = {
  set: 'set',
  number: 'szam',
  language: 'nyelv',
  pokemon: 'pokemon',
  updated: 'modositva',
};

function invert<K extends string>(m: Record<K, string | null>): Map<string, K> {
  return new Map(
    (Object.entries(m) as [K, string | null][])
      .filter((e): e is [K, string] => e[1] !== null)
      .map(([k, v]) => [v, k]),
  );
}

const OWNED_FROM = invert(OWNED_PARAM);
const IMAGE_FROM = invert(IMAGE_PARAM);
const SORT_FROM = invert(SORT_PARAM);

/** Ismételt paraméterek (`set=A&set=B`); a vesszővel elválasztott alak is elfogadott a nyelvnél. */
function list(params: URLSearchParams, name: string, splitComma = false): string[] {
  const values = params.getAll(name).flatMap((v) => (splitComma ? v.split(',') : [v]));
  return [...new Set(values.map((v) => v.trim()).filter(Boolean))];
}

export function queryFromParams(params: URLSearchParams): CardQuery {
  const image = list(params, 'kep', true)
    .map((v) => IMAGE_FROM.get(v))
    .filter((v): v is ImageFilter => v !== undefined);
  return {
    q: params.get('q') ?? '',
    pokemon: list(params, 'pokemon'),
    languages: list(params, 'nyelv', true).map((v) => v.toUpperCase()),
    sets: list(params, 'set'),
    setCodes: list(params, 'setkod', true),
    finishes: list(params, 'finish'),
    owned: OWNED_FROM.get(params.get('allapot') ?? '') ?? 'all',
    image,
    sort: SORT_FROM.get(params.get('rendezes') ?? '') ?? DEFAULT_QUERY.sort,
    dir: params.get('irany') === 'csokkeno' ? 'desc' : 'asc',
  };
}

export function queryToParams(q: CardQuery): URLSearchParams {
  const p = new URLSearchParams();
  if (q.q.trim()) p.set('q', q.q);
  for (const v of q.pokemon) p.append('pokemon', v);
  if (q.languages.length) p.set('nyelv', q.languages.join(','));
  for (const v of q.sets) p.append('set', v);
  if (q.setCodes.length) p.set('setkod', q.setCodes.join(','));
  for (const v of q.finishes) p.append('finish', v);
  const owned = OWNED_PARAM[q.owned];
  if (owned) p.set('allapot', owned);
  if (q.image.length) p.set('kep', q.image.map((v) => IMAGE_PARAM[v]).join(','));
  if (q.sort !== DEFAULT_QUERY.sort) p.set('rendezes', SORT_PARAM[q.sort]);
  if (q.dir === 'desc') p.set('irany', 'csokkeno');
  return p;
}
