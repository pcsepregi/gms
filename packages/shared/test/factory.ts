import type { Card } from '../src/types.js';
import { INITIAL_LANGUAGES } from '../src/languages.js';

let nextId = 1;

export function lang(shortCode: string) {
  const i = INITIAL_LANGUAGES.findIndex((l) => l.shortCode === shortCode);
  const l = INITIAL_LANGUAGES[i]!;
  return { id: i + 1, name: l.name, nameHu: l.nameHu, shortCode: l.shortCode, sortOrder: i + 1 };
}

export interface CardSpec {
  pokemon?: string;
  setName?: string;
  setCode?: string | null;
  cardNumber?: string;
  finish?: string;
  language?: string;
  owned?: boolean;
  note?: string;
  imageStatus?: Card['image']['status'];
  updatedAt?: string;
}

/** Szintetikus kártya a tesztekhez (nem valódi gyűjteményadat). */
export function makeCard(spec: CardSpec = {}): Card {
  const id = nextId++;
  const language = lang(spec.language ?? 'EN');
  const pokemon = spec.pokemon ?? 'Pokemon A';
  const cardNumber = spec.cardNumber ?? '1/100';
  const finish = spec.finish ?? 'Normal';
  return {
    id,
    displayId: `${language.shortCode}-${pokemon}-${cardNumber}-${finish}`.replaceAll(' ', '_'),
    owned: spec.owned ?? false,
    pokemon,
    setName: spec.setName ?? 'Set One',
    setCode: spec.setCode === undefined ? 'S1' : spec.setCode,
    cardNumber,
    finish: { id: 1, name: finish, description: null },
    language,
    note: spec.note ?? '',
    image: { status: spec.imageStatus ?? 'pending', url: null, languageId: null },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: spec.updatedAt ?? `2026-01-01T00:00:${String(id % 60).padStart(2, '0')}.000Z`,
  };
}

const LANGS = INITIAL_LANGUAGES.map((l) => l.shortCode);
const FINISHES = ['Normal', 'Reverse Holo', 'Holo', 'Shiny Holo'];

/** Sok kártya a teljesítménytesztekhez. */
export function manyCards(n: number): Card[] {
  return Array.from({ length: n }, (_, i) =>
    makeCard({
      pokemon: i % 3 === 0 ? 'Pokemon B' : 'Pokemon A',
      setName: `Set ${i % 56}`,
      setCode: `S${i % 56}`,
      cardNumber: `${(i % 250) + 1}/250`,
      finish: FINISHES[i % FINISHES.length]!,
      language: LANGS[i % LANGS.length]!,
      owned: i % 2 === 0,
      note: i % 7 === 0 ? 'Forrás: https://example.org/x' : '',
    }),
  );
}
