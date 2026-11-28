/**
 * Egyszeri adatjavítás: Pokémon-, setnév- és setkód-értékek átnevezése a teljes
 * gyűjteményben (pl. egy külön Pokémonként felvett változat beolvasztása, vagy idegen
 * írású setnevek angolra cserélése). A kép és a "megvan" állapot megmarad, a természetes
 * kulcs és a megjelenített azonosító újraszámolódik. Egy tranzakció: ütközés esetén
 * semmi sem íródik.
 */
import { naturalKey } from '@gms/shared';
import type { Db } from './db/open.js';
import { refreshDisplayIds } from './editing.js';

export interface RenameSpec {
  /** Pokémon: régi név → új név (pontos egyezés). */
  pokemon?: Record<string, string>;
  /** Setnév: régi név → új név (pontos egyezés, a HTML-entitás dekódolása után). */
  setName?: Record<string, string>;
  /** Setkód: régi kód → új kód (pontos egyezés). */
  setCode?: Record<string, string>;
  /** `&amp;` és társai visszaalakítása a setnevekben (importból maradt kódolás). */
  decodeHtmlEntities?: boolean;
}

export interface RenameChange {
  id: number;
  field: 'pokemon' | 'setName' | 'setCode';
  from: string;
  to: string;
}

export interface RenameResult {
  /** Egy sor kártyánként és mezőnként. */
  changes: RenameChange[];
  /** Érintett kártyák száma. */
  cards: number;
  /** Átnevezésre megadott, de az adatbázisban nem szereplő értékek. */
  unused: string[];
  applied: boolean;
}

export class RenameError extends Error {}

const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&lt;': '<',
  '&gt;': '>',
};

function decodeEntities(value: string): string {
  return value.replace(/&(?:amp|quot|#39|apos|lt|gt);/gu, (m) => ENTITIES[m] ?? m);
}

function checkSpec(spec: unknown): RenameSpec {
  if (typeof spec !== 'object' || spec === null || Array.isArray(spec)) {
    throw new RenameError('Az átnevezési fájl egy JSON objektum legyen.');
  }
  const s = spec as Record<string, unknown>;
  const allowed = ['pokemon', 'setName', 'setCode', 'decodeHtmlEntities'];
  const unknown = Object.keys(s).filter((k) => !allowed.includes(k));
  if (unknown.length) throw new RenameError(`Ismeretlen kulcs: ${unknown.join(', ')}`);
  for (const key of ['pokemon', 'setName', 'setCode']) {
    const m = s[key];
    if (m === undefined) continue;
    if (typeof m !== 'object' || m === null || Array.isArray(m)) {
      throw new RenameError(`A(z) "${key}" egy { "régi": "új" } objektum legyen.`);
    }
    for (const [from, to] of Object.entries(m)) {
      if (typeof to !== 'string' || !to.trim()) {
        throw new RenameError(`Üres vagy hibás új érték: ${key} "${from}"`);
      }
    }
  }
  return s as RenameSpec;
}

interface Row {
  id: number;
  pokemon: string;
  set_name: string;
  set_code: string | null;
  card_number: string;
  finish_id: number;
  language_id: number;
  display_id: string;
  natural_key: string;
}

/**
 * Az átnevezések kiszámolása, és `apply` esetén végrehajtása. Az ütköző kártyákat
 * (azonos Pokémon, set, szám, változat, nyelv az átnevezés után) hibaként jelzi.
 */
export function renameValues(db: Db, rawSpec: unknown, apply: boolean): RenameResult {
  const spec = checkSpec(rawSpec);
  const pokemon = new Map(Object.entries(spec.pokemon ?? {}));
  const setName = new Map(Object.entries(spec.setName ?? {}));
  const setCode = new Map(Object.entries(spec.setCode ?? {}));
  const used = new Set<string>();

  const run = () => {
    const rows = db
      .prepare(
        `SELECT id, pokemon, set_name, set_code, card_number, finish_id, language_id,
                display_id, natural_key
         FROM card ORDER BY id`,
      )
      .all() as Row[];

    const changes: RenameChange[] = [];
    const next = rows.map((r) => {
      let name = r.set_name;
      if (spec.decodeHtmlEntities) name = decodeEntities(name);
      const p = pokemon.get(r.pokemon);
      const s = setName.get(name);
      const c = r.set_code === null ? undefined : setCode.get(r.set_code);
      if (p !== undefined) used.add(`pokemon:${r.pokemon}`);
      if (s !== undefined) used.add(`setName:${name}`);
      if (c !== undefined) used.add(`setCode:${r.set_code}`);
      const after = {
        pokemon: (p ?? r.pokemon).trim(),
        setName: (s ?? name).trim(),
        setCode: c !== undefined ? c.trim() : r.set_code,
      };
      if (after.pokemon !== r.pokemon)
        changes.push({ id: r.id, field: 'pokemon', from: r.pokemon, to: after.pokemon });
      if (after.setName !== r.set_name)
        changes.push({ id: r.id, field: 'setName', from: r.set_name, to: after.setName });
      if (after.setCode !== r.set_code)
        changes.push({
          id: r.id,
          field: 'setCode',
          from: r.set_code ?? '',
          to: after.setCode ?? '',
        });
      const key = naturalKey({
        pokemon: after.pokemon,
        setName: after.setName,
        cardNumber: r.card_number,
        finishId: r.finish_id,
        languageId: r.language_id,
      });
      return { row: r, after, key };
    });

    // Ütközések: két kártya ugyanarra a kulcsra kerülne.
    const byKey = new Map<string, Row[]>();
    for (const n of next) byKey.set(n.key, [...(byKey.get(n.key) ?? []), n.row]);
    const clashes = [...byKey.values()].filter((g) => g.length > 1);
    if (clashes.length) {
      const list = clashes.map((g) => g.map((r) => r.display_id).join(' = ')).join('\n  ');
      throw new RenameError(`Az átnevezés után ezek a kártyák egybeesnének:\n  ${list}`);
    }

    const changedIds = new Set(changes.map((c) => c.id));
    if (apply && changedIds.size) {
      const update = db.prepare(
        `UPDATE card SET pokemon = @pokemon, set_name = @setName, set_code = @setCode,
                natural_key = @key, updated_at = @ts
         WHERE id = @id`,
      );
      const ts = new Date().toISOString();
      for (const n of next) {
        if (!changedIds.has(n.row.id)) continue;
        // A kulcs egyedi: előbb ideiglenes értékre, hogy a sorrend ne okozzon ütközést.
        db.prepare('UPDATE card SET natural_key = ? WHERE id = ?').run(`tmp:${n.row.id}`, n.row.id);
      }
      for (const n of next) {
        if (!changedIds.has(n.row.id)) continue;
        update.run({ ...n.after, key: n.key, ts, id: n.row.id });
      }
      refreshDisplayIds(db);
    }
    return { changes, cards: changedIds.size };
  };

  const { changes, cards } = apply ? db.transaction(run)() : run();
  const unused = [
    ...[...pokemon.keys()].map((k) => `pokemon:${k}`),
    ...[...setName.keys()].map((k) => `setName:${k}`),
    ...[...setCode.keys()].map((k) => `setCode:${k}`),
  ].filter((k) => !used.has(k));
  return { changes, cards, unused, applied: apply && cards > 0 };
}

/** Rövid összesítő: mezőnként a különböző régi → új párok és a kártyák száma. */
export function summarizeRenames(result: RenameResult): string[] {
  const groups = new Map<string, number>();
  for (const c of result.changes) {
    const k = `${c.field}: "${c.from}" → "${c.to}"`;
    groups.set(k, (groups.get(k) ?? 0) + 1);
  }
  const lines = [...groups].map(([k, n]) => `  ${k} (${n} kártya)`);
  lines.unshift(
    result.applied
      ? `Átnevezve: ${result.cards} kártya.`
      : `Próbafuttatás (semmi sem változott): ${result.cards} kártya változna. Élesben: --apply`,
  );
  if (result.unused.length) lines.push(`Nem szereplő értékek: ${result.unused.join(', ')}`);
  return lines;
}
