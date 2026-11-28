import { describe, expect, it } from 'vitest';
import { importExcel } from '../src/import/run.js';
import { RenameError, renameValues, summarizeRenames } from '../src/renames.js';
import { fixture, testDb } from './helpers.js';

async function setup() {
  const { db } = testDb();
  await importExcel(db, fixture('sample-master.xlsx'));
  return db;
}

type Db = Awaited<ReturnType<typeof setup>>;
const pokemonCounts = (db: Db) =>
  Object.fromEntries(
    (
      db.prepare('SELECT pokemon, COUNT(*) AS n FROM card GROUP BY pokemon').all() as {
        pokemon: string;
        n: number;
      }[]
    ).map((r) => [r.pokemon, r.n]),
  );

describe('ops rename: értékek átnevezése a gyűjteményben', () => {
  it('próbafuttatás: kiszámolja, de nem ír semmit', async () => {
    const db = await setup();
    const before = pokemonCounts(db);
    const r = renameValues(db, { pokemon: { 'Oinkologne ex': 'Oinkologne' } }, false);
    expect(r.cards).toBe(before['Oinkologne ex']);
    expect(r.applied).toBe(false);
    expect(pokemonCounts(db)).toEqual(before);
    expect(summarizeRenames(r)[0]).toMatch(/^Próbafuttatás/u);
  });

  it('beolvasztás: a Pokémon átnevezve, a "megvan" és a kép marad, az azonosító frissül', async () => {
    const db = await setup();
    const before = pokemonCounts(db);
    const target = db
      .prepare(
        `SELECT id, owned, image_status, display_id FROM card WHERE pokemon = 'Oinkologne ex'`,
      )
      .get() as { id: number; owned: number; image_status: string; display_id: string };
    db.prepare(`UPDATE card SET image_status = 'exact', image_file = 'x.webp' WHERE id = ?`).run(
      target.id,
    );

    const r = renameValues(db, { pokemon: { 'Oinkologne ex': 'Oinkologne' } }, true);
    expect(r.applied).toBe(true);
    expect(pokemonCounts(db)).toEqual({
      Lechonk: before.Lechonk,
      Oinkologne: before.Oinkologne! + before['Oinkologne ex']!,
    });
    const after = db
      .prepare(
        'SELECT owned, image_status, image_file, display_id, natural_key FROM card WHERE id = ?',
      )
      .get(target.id) as Record<string, unknown>;
    expect(after.owned).toBe(target.owned);
    expect(after.image_status).toBe('exact');
    expect(after.image_file).toBe('x.webp');
    expect(after.display_id).not.toContain('_ex');
    expect(String(after.natural_key)).toMatch(/^oinkologne\|/u);
  });

  it('setnév és setkód átnevezése, HTML-entitás dekódolása, nem szereplő értékek jelzése', async () => {
    const db = await setup();
    db.prepare(
      `UPDATE card SET set_name = 'Scarlet &amp; Violet' WHERE set_name = 'Scarlet & Violet'`,
    ).run();
    const r = renameValues(
      db,
      {
        decodeHtmlEntities: true,
        setName: { 'SV Black Star Promos': 'Scarlet & Violet Black Star Promos', Nincs: 'X' },
        setCode: { SVP: 'SV-P' },
      },
      true,
    );
    expect(r.unused).toEqual(['setName:Nincs']);
    const names = (
      db.prepare('SELECT DISTINCT set_name AS n FROM card').all() as { n: string }[]
    ).map((x) => x.n);
    expect(names).toContain('Scarlet & Violet');
    expect(names).toContain('Scarlet & Violet Black Star Promos');
    expect(names.some((n) => n.includes('&amp;'))).toBe(false);
    expect(db.prepare(`SELECT COUNT(*) AS n FROM card WHERE set_code = 'SVP'`).get()).toEqual({
      n: 0,
    });
  });

  it('ütközésnél hibát jelez, és semmi sem változik', async () => {
    const db = await setup();
    // Egy lap másolata más Pokémon-névvel: az átnevezés után a kettő egybeesne.
    db.prepare(
      `INSERT INTO card (owned, pokemon, set_name, set_code, card_number, finish_id, language_id,
                         note, display_id, image_status, created_at, updated_at, natural_key)
       SELECT owned, 'Masik', set_name, set_code, card_number, finish_id, language_id, note,
              'masolat', image_status, created_at, updated_at, 'masolat'
       FROM card WHERE pokemon = 'Lechonk' LIMIT 1`,
    ).run();
    const before = pokemonCounts(db);
    expect(() => renameValues(db, { pokemon: { Masik: 'Lechonk' } }, true)).toThrow(
      /egybeesnének/u,
    );
    expect(pokemonCounts(db)).toEqual(before);
  });

  it('hibás fájl: érthető hiba', async () => {
    const db = await setup();
    expect(() => renameValues(db, [], false)).toThrow(RenameError);
    expect(() => renameValues(db, { foo: {} }, false)).toThrow(/Ismeretlen kulcs/u);
    expect(() => renameValues(db, { pokemon: { A: '' } }, false)).toThrow(RenameError);
  });
});
