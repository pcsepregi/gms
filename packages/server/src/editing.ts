/**
 * Kártyák, nyomási változatok és nyelvek felvétele, módosítása, törlése
 * (S-21…S-24, S-63, S-64; technikai spec 4.1, 4.2, 6.).
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  assignDisplayIds,
  CARD_FIELDS,
  cardInputSchema,
  deriveShortCode,
  fieldErrors,
  finishInputSchema,
  finishPatchSchema,
  IMAGE_FIELDS,
  keyText,
  languageInputSchema,
  naturalKey,
  type Card,
  type CardFields,
  type Finish,
  type Language,
} from '@gms/shared';
import type { Db } from './db/open.js';
import { getCard } from './cards.js';

/** Üzleti hiba, amit az API változatlanul továbbad (`{ error: { code, message, details } }`). */
export class EditError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

const notFound = () => new EditError(404, 'NOT_FOUND', 'A kártya nem található.');

function validationError(details: Record<string, string>): EditError {
  return new EditError(400, 'VALIDATION', 'Hibás vagy hiányzó mezők.', details);
}

interface StoredCard {
  id: number;
  owned: number;
  pokemon: string;
  set_name: string;
  set_code: string | null;
  card_number: string;
  finish_id: number;
  language_id: number;
  note: string;
  image_file: string | null;
}

function storedCard(db: Db, id: number): StoredCard | undefined {
  return db
    .prepare(
      `SELECT id, owned, pokemon, set_name, set_code, card_number, finish_id, language_id, note,
              image_file
       FROM card WHERE id = ?`,
    )
    .get(id) as StoredCard | undefined;
}

function toFields(r: StoredCard): CardFields {
  return {
    owned: r.owned === 1,
    pokemon: r.pokemon,
    setName: r.set_name,
    setCode: r.set_code,
    cardNumber: r.card_number,
    finishId: r.finish_id,
    languageId: r.language_id,
    note: r.note,
  };
}

function parseCard(input: unknown): CardFields {
  const parsed = cardInputSchema.safeParse(input);
  if (!parsed.success) throw validationError(fieldErrors(parsed.error, input));
  return parsed.data;
}

/** A finish és a nyelv létező rekordra mutasson (technikai spec 6.). */
function checkReferences(db: Db, card: CardFields): void {
  const details: Record<string, string> = {};
  if (!db.prepare('SELECT 1 FROM finish WHERE id = ?').get(card.finishId)) {
    details.finishId = 'Nincs ilyen nyomási változat.';
  }
  if (!db.prepare('SELECT 1 FROM language WHERE id = ?').get(card.languageId)) {
    details.languageId = 'Nincs ilyen nyelv.';
  }
  if (Object.keys(details).length) throw validationError(details);
}

/** `409 DUPLICATE` a meglévő kártya azonosítójával (S-22). */
function checkDuplicate(db: Db, key: string, exceptId: number | null): void {
  const existing = db
    .prepare('SELECT id, display_id FROM card WHERE natural_key = ? AND id IS NOT ?')
    .get(key, exceptId) as { id: number; display_id: string } | undefined;
  if (existing) {
    throw new EditError(409, 'DUPLICATE', `Ez a kártya már szerepel: ${existing.display_id}`, {
      id: existing.id,
      displayId: existing.display_id,
    });
  }
}

/**
 * A megjelenített azonosítók újraszámolása a teljes gyűjteményre (technikai spec 4.2).
 * Az ütközés miatti setkód utótag más kártyákat is érinthet, ezért mindig az egészet
 * számolja (≈400 sor), és csak a változott sorokat írja.
 */
export function refreshDisplayIds(db: Db): void {
  const rows = db
    .prepare(
      `SELECT c.id, c.display_id, c.pokemon, c.card_number, c.set_code, c.set_name,
              l.short_code, f.name AS finish_name
       FROM card c JOIN language l ON l.id = c.language_id JOIN finish f ON f.id = c.finish_id
       ORDER BY c.id`,
    )
    .all() as {
    id: number;
    display_id: string;
    pokemon: string;
    card_number: string;
    set_code: string | null;
    set_name: string;
    short_code: string;
    finish_name: string;
  }[];
  const ids = assignDisplayIds(
    rows.map((r) => ({
      languageCode: r.short_code,
      pokemon: r.pokemon,
      cardNumber: r.card_number,
      finishName: r.finish_name,
      setCode: r.set_code,
      setName: r.set_name,
    })),
  );
  const update = db.prepare('UPDATE card SET display_id = ? WHERE id = ?');
  rows.forEach((r, i) => {
    if (r.display_id !== ids[i]) update.run(ids[i], r.id);
  });
}

/** A kártya képfájljai (normál és bélyegkép, technikai spec 7.3). */
function imagePaths(imagesDir: string, file: string): string[] {
  const main = path.join(imagesDir, path.basename(file));
  return [main, main.replace(/\.webp$/u, '-thumb.webp')];
}

function removeImages(imagesDir: string, file: string | null): void {
  if (!file) return;
  for (const p of imagePaths(imagesDir, file)) fs.rmSync(p, { force: true });
}

/** Új kártya (S-21). Alapból "nincs meg", a képkeresés függő állapotban vár. */
export function createCard(db: Db, input: unknown, now = new Date()): Card {
  const card = parseCard(input);
  const ts = now.toISOString();
  const id = db.transaction(() => {
    checkReferences(db, card);
    const key = naturalKey(card);
    checkDuplicate(db, key, null);
    const res = db
      .prepare(
        `INSERT INTO card (owned, pokemon, set_name, set_code, card_number, finish_id, language_id,
                           note, display_id, image_status, owned_changed_at, created_at, updated_at,
                           natural_key)
         VALUES (@owned, @pokemon, @setName, @setCode, @cardNumber, @finishId, @languageId,
                 @note, '', 'pending', @ownedAt, @ts, @ts, @key)`,
      )
      .run({ ...card, owned: card.owned ? 1 : 0, ownedAt: card.owned ? ts : null, ts, key });
    refreshDisplayIds(db);
    return Number(res.lastInsertRowid);
  })();
  return getCard(db, id)!;
}

/**
 * Részleges módosítás (S-23). A Pokémon, set, kártyaszám, finish vagy nyelv változásakor
 * a kép újrakeresése elindul (a régi képfájl törlődik), az azonosító frissül.
 */
export function updateCard(
  db: Db,
  imagesDir: string,
  id: number,
  patch: unknown,
  now = new Date(),
): Card {
  if (typeof patch !== 'object' || patch === null || Array.isArray(patch)) {
    throw validationError({ _: 'A kérés törzse objektum legyen.' });
  }
  const unknownKeys = Object.keys(patch).filter(
    (k) => !(CARD_FIELDS as readonly string[]).includes(k),
  );
  if (unknownKeys.length)
    throw validationError({ _: `Ismeretlen mező: ${unknownKeys.join(', ')}` });

  let oldImage: string | null = null;
  db.transaction(() => {
    const stored = storedCard(db, id);
    if (!stored) throw notFound();
    const before = toFields(stored);
    const after = parseCard({ ...before, ...patch });
    checkReferences(db, after);
    const key = naturalKey(after);
    checkDuplicate(db, key, id);

    const changed = CARD_FIELDS.filter((f) => before[f] !== after[f]);
    if (!changed.length) return;
    const ts = now.toISOString();
    const imageChanged = changed.some((f) => (IMAGE_FIELDS as readonly string[]).includes(f));
    db.prepare(
      `UPDATE card SET owned = @owned, pokemon = @pokemon, set_name = @setName, set_code = @setCode,
              card_number = @cardNumber, finish_id = @finishId, language_id = @languageId,
              note = @note, natural_key = @key, updated_at = @ts,
              owned_changed_at = CASE WHEN owned <> @owned THEN @ts ELSE owned_changed_at END,
              on_the_way = CASE WHEN @owned = 1 THEN 0 ELSE on_the_way END
       WHERE id = @id`,
    ).run({ ...after, owned: after.owned ? 1 : 0, key, ts, id });
    if (imageChanged) {
      oldImage = stored.image_file;
      db.prepare(
        `UPDATE card SET image_status = 'pending', image_file = NULL, image_lang_id = NULL,
                image_source = NULL, image_checked_at = NULL WHERE id = ?`,
      ).run(id);
      refreshDisplayIds(db);
    }
  })();
  // A fájlt csak a sikeres tranzakció után töröljük.
  removeImages(imagesDir, oldImage);
  return getCard(db, id)!;
}

/** Végleges törlés a képfájlokkal együtt (S-24). */
export function deleteCard(db: Db, imagesDir: string, id: number): void {
  const file = db.transaction(() => {
    const stored = storedCard(db, id);
    if (!stored) throw notFound();
    db.prepare('DELETE FROM card WHERE id = ?').run(id);
    refreshDisplayIds(db);
    return stored.image_file;
  })();
  removeImages(imagesDir, file);
}

interface FinishRow {
  id: number;
  name: string;
  description: string | null;
  sort_order: number;
}

const toFinish = (r: FinishRow): Finish => ({
  id: r.id,
  name: r.name,
  description: r.description,
  sortOrder: r.sort_order,
});

/** Új nyomási változat (S-64/EF2). Kis-/nagybetűtől független névegyezésnél `409`. */
export function createFinish(db: Db, input: unknown): Finish {
  const parsed = finishInputSchema.safeParse(input);
  if (!parsed.success) throw validationError(fieldErrors(parsed.error, input));
  const { name, description } = parsed.data;
  return db.transaction(() => {
    const existing = (db.prepare('SELECT * FROM finish').all() as FinishRow[]).find(
      (f) => keyText(f.name) === keyText(name),
    );
    if (existing) {
      throw new EditError(409, 'DUPLICATE', `Ez a nyomási változat már létezik: ${existing.name}`, {
        id: existing.id,
      });
    }
    const res = db
      .prepare(
        `INSERT INTO finish (name, description, sort_order)
         VALUES (?, ?, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM finish))`,
      )
      .run(name, description);
    return toFinish(
      db.prepare('SELECT * FROM finish WHERE id = ?').get(res.lastInsertRowid) as FinishRow,
    );
  })();
}

/** Nyomási változat leírásának módosítása (S-64/EF1). */
export function updateFinish(db: Db, id: number, input: unknown): Finish {
  const parsed = finishPatchSchema.safeParse(input);
  if (!parsed.success) throw validationError(fieldErrors(parsed.error, input));
  const res = db
    .prepare('UPDATE finish SET description = ? WHERE id = ?')
    .run(parsed.data.description, id);
  if (!res.changes) throw new EditError(404, 'NOT_FOUND', 'A nyomási változat nem található.');
  return toFinish(db.prepare('SELECT * FROM finish WHERE id = ?').get(id) as FinishRow);
}

/**
 * Új nyelv (technikai spec 4.1): a magyar név alapból a megadott név, a képforrás
 * nyelvkódja üres, a rövid kód a névből képződik, ha nincs megadva.
 */
export function createLanguage(db: Db, input: unknown): Language {
  const parsed = languageInputSchema.safeParse(input);
  if (!parsed.success) throw validationError(fieldErrors(parsed.error, input));
  const { name } = parsed.data;
  return db.transaction(() => {
    const rows = db.prepare('SELECT id, name, name_hu, short_code FROM language').all() as {
      id: number;
      name: string;
      name_hu: string;
      short_code: string;
    }[];
    const existing = rows.find(
      (l) => keyText(l.name) === keyText(name) || keyText(l.name_hu) === keyText(name),
    );
    if (existing) {
      throw new EditError(409, 'DUPLICATE', `Ez a nyelv már létezik: ${existing.name_hu}`, {
        id: existing.id,
      });
    }
    const taken = new Set(rows.map((l) => l.short_code));
    if (parsed.data.shortCode && taken.has(parsed.data.shortCode)) {
      throw validationError({ shortCode: 'Ez a rövid kód már foglalt.' });
    }
    const shortCode = parsed.data.shortCode ?? deriveShortCode(name, taken);
    const res = db
      .prepare(
        `INSERT INTO language (name, name_hu, short_code, image_code, sort_order)
         VALUES (?, ?, ?, NULL, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM language))`,
      )
      .run(name, parsed.data.nameHu ?? name, shortCode);
    const l = db
      .prepare(
        'SELECT id, name, name_hu, short_code, image_code, sort_order FROM language WHERE id = ?',
      )
      .get(res.lastInsertRowid) as {
      id: number;
      name: string;
      name_hu: string;
      short_code: string;
      image_code: string | null;
      sort_order: number;
    };
    return {
      id: l.id,
      name: l.name,
      nameHu: l.name_hu,
      shortCode: l.short_code,
      imageCode: l.image_code,
      sortOrder: l.sort_order,
    };
  })();
}
