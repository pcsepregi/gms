import type { Card, Finish, ImageStatus, ImportSummary, Language, Lookups } from '@gms/shared';
import type { Db } from './db/open.js';
import { getMeta } from './db/meta.js';

interface CardRow {
  id: number;
  display_id: string;
  owned: number;
  pokemon: string;
  set_name: string;
  set_code: string | null;
  card_number: string;
  note: string;
  image_file: string | null;
  image_status: ImageStatus;
  image_lang_id: number | null;
  created_at: string;
  updated_at: string;
  finish_id: number;
  finish_name: string;
  finish_description: string | null;
  language_id: number;
  language_name: string;
  language_name_hu: string;
  language_short_code: string;
}

const CARD_SELECT = `
  SELECT c.id, c.display_id, c.owned, c.pokemon, c.set_name, c.set_code, c.card_number, c.note,
         c.image_file, c.image_status, c.image_lang_id, c.created_at, c.updated_at,
         f.id AS finish_id, f.name AS finish_name, f.description AS finish_description,
         l.id AS language_id, l.name AS language_name, l.name_hu AS language_name_hu,
         l.short_code AS language_short_code
  FROM card c
  JOIN finish f ON f.id = c.finish_id
  JOIN language l ON l.id = c.language_id`;

function toCard(r: CardRow): Card {
  return {
    id: r.id,
    displayId: r.display_id,
    owned: r.owned === 1,
    pokemon: r.pokemon,
    setName: r.set_name,
    setCode: r.set_code,
    cardNumber: r.card_number,
    finish: { id: r.finish_id, name: r.finish_name, description: r.finish_description },
    language: {
      id: r.language_id,
      name: r.language_name,
      nameHu: r.language_name_hu,
      shortCode: r.language_short_code,
    },
    note: r.note,
    image: {
      status: r.image_status,
      url: r.image_file ? `/api/images/${encodeURIComponent(r.image_file)}` : null,
      languageId: r.image_lang_id,
    },
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function listCards(db: Db): Card[] {
  return (db.prepare(`${CARD_SELECT} ORDER BY c.id`).all() as CardRow[]).map(toCard);
}

export function getCard(db: Db, id: number): Card | null {
  const row = db.prepare(`${CARD_SELECT} WHERE c.id = ?`).get(id) as CardRow | undefined;
  return row ? toCard(row) : null;
}

export function getLookups(db: Db): Lookups {
  const languages = (
    db
      .prepare(
        `SELECT id, name, name_hu, short_code, image_code, sort_order FROM language
         ORDER BY sort_order, id`,
      )
      .all() as {
      id: number;
      name: string;
      name_hu: string;
      short_code: string;
      image_code: string | null;
      sort_order: number;
    }[]
  ).map((l): Language => ({
    id: l.id,
    name: l.name,
    nameHu: l.name_hu,
    shortCode: l.short_code,
    imageCode: l.image_code,
    sortOrder: l.sort_order,
  }));
  const finishes = (
    db
      .prepare('SELECT id, name, description, sort_order FROM finish ORDER BY sort_order, id')
      .all() as { id: number; name: string; description: string | null; sort_order: number }[]
  ).map((f): Finish => ({
    id: f.id,
    name: f.name,
    description: f.description,
    sortOrder: f.sort_order,
  }));
  const pokemon = (
    db.prepare('SELECT DISTINCT pokemon FROM card ORDER BY pokemon COLLATE NOCASE').all() as {
      pokemon: string;
    }[]
  ).map((r) => r.pokemon);

  const setRows = db
    .prepare(
      `SELECT set_name, set_code FROM card GROUP BY set_name, set_code
       ORDER BY set_name COLLATE NOCASE, set_code`,
    )
    .all() as { set_name: string; set_code: string | null }[];
  const sets = new Map<string, string[]>();
  for (const r of setRows) {
    const codes = sets.get(r.set_name) ?? [];
    if (r.set_code) codes.push(r.set_code);
    sets.set(r.set_name, codes);
  }

  return {
    languages,
    finishes,
    pokemon,
    sets: [...sets].map(([name, codes]) => ({ name, codes })),
  };
}

export function getImportSummary(db: Db): ImportSummary | null {
  const raw = getMeta(db, 'import_summary');
  return raw ? (JSON.parse(raw) as ImportSummary) : null;
}
