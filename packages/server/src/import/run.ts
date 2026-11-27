import path from 'node:path';
import {
  assignDisplayIds,
  cardInputSchema,
  keyText,
  naturalKey,
  type ImportSummary,
} from '@gms/shared';
import type { Db } from '../db/open.js';
import { setMeta } from '../db/meta.js';
import { ImportError } from './errors.js';
import { buildNote, isCheckStatus, isPlainNotOwned, NOTE_CHECK, parseOwned } from './mapping.js';
import { DICTIONARY_SHEET, readWorkbook, type RawWorkbook } from './workbook.js';

export interface ImportOptions {
  /** Megtartva a parancssori kompatibilitás miatt; nem üres adatbázist ezzel sem ír felül. */
  force?: boolean;
  now?: () => Date;
}

const MAX_REPORTED_ERRORS = 25;

interface LanguageRow {
  id: number;
  name: string;
  name_hu: string;
  short_code: string;
}

export function cardCount(db: Db): number {
  return (db.prepare('SELECT COUNT(*) AS n FROM card').get() as { n: number }).n;
}

/**
 * Egyszeri Excel import (S-01, S-02). Csak üres adatbázisba tölt; minden egy
 * tranzakcióban történik, bármilyen hiba esetén semmi sem íródik.
 */
export async function importExcel(
  db: Db,
  file: string,
  opts: ImportOptions = {},
): Promise<ImportSummary> {
  assertEmpty(db, opts.force ?? false);
  const workbook = await readWorkbook(file);
  return importWorkbook(db, workbook, path.basename(file), opts);
}

function assertEmpty(db: Db, force: boolean): void {
  const n = cardCount(db);
  if (n > 0) {
    throw new ImportError(
      'NOT_EMPTY',
      `Az adatbázisban már ${n} kártya van, ezért az import nem fut le. ` +
        'Az app a master: az Excel csak egyszer, üres adatbázisba tölthető be.' +
        (force ? ' (A --force kapcsoló sem írja felül a meglévő adatokat.)' : ''),
    );
  }
}

export function importWorkbook(
  db: Db,
  wb: RawWorkbook,
  sourceFile: string,
  opts: ImportOptions = {},
): ImportSummary {
  const now = (opts.now ?? (() => new Date()))().toISOString();

  const run = db.transaction((): ImportSummary => {
    assertEmpty(db, opts.force ?? false);
    const warnings: string[] = [];
    const errors: string[] = [];

    // Nyelvek a nyelvtáblából, név szerint (kis-/nagybetűtől függetlenül).
    const languages = db
      .prepare('SELECT id, name, name_hu, short_code FROM language ORDER BY sort_order, id')
      .all() as LanguageRow[];
    const languageByName = new Map(languages.map((l) => [keyText(l.name), l]));

    // Finish szótár a lap sorrendjében, majd a szótárban hiányzók leírás nélkül.
    const finishByName = new Map<string, { id: number; name: string }>();
    const insertFinish = db.prepare(
      'INSERT INTO finish (name, description, sort_order) VALUES (?, ?, ?)',
    );
    let finishOrder = (
      db.prepare('SELECT COALESCE(MAX(sort_order), 0) AS m FROM finish').get() as { m: number }
    ).m;
    for (const f of db.prepare('SELECT id, name FROM finish').all() as {
      id: number;
      name: string;
    }[]) {
      finishByName.set(keyText(f.name), f);
    }
    const addFinish = (name: string, description: string | null): number => {
      const id = Number(insertFinish.run(name, description, ++finishOrder).lastInsertRowid);
      finishByName.set(keyText(name), { id, name });
      return id;
    };

    let finishesFromDictionary = 0;
    if (wb.dictionary === null) {
      warnings.push(`Nincs "${DICTIONARY_SHEET}" lap; a finish értékek leírás nélkül kerültek be.`);
    } else {
      for (const entry of wb.dictionary) {
        if (finishByName.has(keyText(entry.name))) {
          warnings.push(
            `A "${DICTIONARY_SHEET}" lap ${entry.rowNumber}. sora ismétlődik ("${entry.name}"), kihagytuk.`,
          );
          continue;
        }
        addFinish(entry.name, entry.description || null);
        finishesFromDictionary++;
      }
    }

    const newFinishes: string[] = [];
    const seenKeys = new Map<string, number>();
    const prepared: {
      rowNumber: number;
      owned: boolean;
      pokemon: string;
      setName: string;
      setCode: string | null;
      cardNumber: string;
      finishId: number;
      finishName: string;
      language: LanguageRow;
      note: string;
      key: string;
    }[] = [];

    for (const row of wb.rows) {
      const where = `${row.rowNumber}. sor`;
      const language = languageByName.get(keyText(row.language));
      if (!language) {
        errors.push(
          row.language
            ? `${where}: ismeretlen nyelv: "${row.language}"`
            : `${where}: a nyelv (Language) üres`,
        );
        continue;
      }

      let finish = row.finish ? finishByName.get(keyText(row.finish)) : undefined;
      if (!finish && row.finish) {
        addFinish(row.finish, null);
        newFinishes.push(row.finish);
        finish = finishByName.get(keyText(row.finish))!;
      }
      if (!finish) {
        errors.push(`${where}: a nyomási változat (Printing / Finish) üres`);
        continue;
      }

      const parsed = cardInputSchema.safeParse({
        owned: parseOwned(row.have),
        pokemon: row.pokemon,
        setName: row.setName,
        setCode: row.setCode,
        cardNumber: row.cardNumber,
        finishId: finish.id,
        languageId: language.id,
        note: buildNote({
          check: isCheckStatus(row.status),
          notes: row.notes,
          link: row.sourceLink,
        }),
      });
      if (!parsed.success) {
        const issues = parsed.error.issues.map((i) => `${String(i.path[0] ?? '')}: ${i.message}`);
        errors.push(`${where}: ${issues.join('; ')}`);
        continue;
      }
      const card = parsed.data;

      const key = naturalKey(card);
      const earlier = seenKeys.get(key);
      if (earlier !== undefined) {
        errors.push(
          `${earlier}. és ${row.rowNumber}. sor: ugyanaz a kártya (Pokémon, set, kártyaszám, finish, nyelv) kétszer szerepel`,
        );
        continue;
      }
      seenKeys.set(key, row.rowNumber);

      if (!isPlainNotOwned(row.have) && !card.owned) {
        warnings.push(`${where}: a "Have?" értéke "${row.have}", "nincs meg"-ként vettük át.`);
      }
      if (row.cardNumberWasNumber) {
        warnings.push(
          `${where}: a kártyaszám számként volt tárolva, szövegként vettük át: "${card.cardNumber}".`,
        );
      }

      prepared.push({
        rowNumber: row.rowNumber,
        owned: card.owned,
        pokemon: card.pokemon,
        setName: card.setName,
        setCode: card.setCode,
        cardNumber: card.cardNumber,
        finishId: finish.id,
        finishName: finish.name,
        language,
        note: card.note,
        key,
      });
    }

    if (errors.length) {
      const shown = errors.slice(0, MAX_REPORTED_ERRORS);
      if (errors.length > shown.length) shown.push(`… és még ${errors.length - shown.length} hiba`);
      throw new ImportError(
        'ROWS',
        `Az import megállt, egyetlen kártya sem került be. Hibás sorok (${errors.length}):`,
        shown,
      );
    }
    if (!prepared.length) {
      throw new ImportError('ROWS', `A "MASTER SET" lapon nincs egyetlen kártyasor sem.`);
    }

    const displayIds = assignDisplayIds(
      prepared.map((c) => ({
        languageCode: c.language.short_code,
        pokemon: c.pokemon,
        cardNumber: c.cardNumber,
        finishName: c.finishName,
        setCode: c.setCode,
        setName: c.setName,
      })),
    );

    const insertCard = db.prepare(`
      INSERT INTO card (owned, pokemon, set_name, set_code, card_number, finish_id, language_id,
                        note, display_id, image_status, created_at, updated_at, natural_key)
      VALUES (@owned, @pokemon, @setName, @setCode, @cardNumber, @finishId, @languageId,
              @note, @displayId, 'pending', @now, @now, @key)`);
    prepared.forEach((c, i) => {
      insertCard.run({
        owned: c.owned ? 1 : 0,
        pokemon: c.pokemon,
        setName: c.setName,
        setCode: c.setCode,
        cardNumber: c.cardNumber,
        finishId: c.finishId,
        languageId: c.language.id,
        note: c.note,
        displayId: displayIds[i],
        now,
        key: c.key,
      });
    });

    const owned = prepared.filter((c) => c.owned).length;
    const summary: ImportSummary = {
      importedAt: now,
      sourceFile,
      total: prepared.length,
      owned,
      missing: prepared.length - owned,
      byLanguage: languages
        .map((l) => {
          const rows = prepared.filter((c) => c.language.id === l.id);
          return {
            name: l.name,
            nameHu: l.name_hu,
            shortCode: l.short_code,
            owned: rows.filter((c) => c.owned).length,
            all: rows.length,
          };
        })
        .filter((l) => l.all > 0),
      finishesFromDictionary,
      newFinishes,
      needsCheck: prepared.filter((c) => c.note.startsWith(NOTE_CHECK)).length,
      warnings,
    };
    setMeta(db, 'imported_at', now);
    setMeta(db, 'import_summary', JSON.stringify(summary));
    return summary;
  });

  return run();
}

/** Az összesítő emberi olvasásra (konzol). */
export function formatSummary(s: ImportSummary): string {
  const lines = [
    `Import kész: ${s.sourceFile}`,
    `  Kártyák: ${s.total} (megvan: ${s.owned}, hiányzik: ${s.missing})`,
    `  Ellenőrizendő: ${s.needsCheck}`,
    '  Nyelvenként (megvan / összes):',
    ...s.byLanguage.map((l) => `    ${l.nameHu.padEnd(26)} ${l.owned} / ${l.all}`),
    `  Finish értékek a szótárból: ${s.finishesFromDictionary}`,
    `  Új finish értékek (${s.newFinishes.length}): ${s.newFinishes.join(', ') || '–'}`,
  ];
  if (s.warnings.length) {
    lines.push(
      `  Figyelmeztetések (${s.warnings.length}):`,
      ...s.warnings.map((w) => `    - ${w}`),
    );
  }
  return lines.join('\n');
}
