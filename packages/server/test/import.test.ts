import { describe, expect, it } from 'vitest';
import { ImportError } from '../src/import/errors.js';
import { cardCount, formatSummary, importExcel, importWorkbook } from '../src/import/run.js';
import { readWorkbook } from '../src/import/workbook.js';
import { listCards, getImportSummary, getLookups } from '../src/cards.js';
import { getMeta } from '../src/db/meta.js';
import { fixture, testDb } from './helpers.js';

const NOW = () => new Date('2026-11-27T12:00:00Z');

async function importSample() {
  const { db } = testDb();
  const summary = await importExcel(db, fixture('sample-master.xlsx'), { now: NOW });
  return { db, summary };
}

describe('Excel import (S-01)', () => {
  it('T-IMP-01: minden nem üres adatsor egy kártya, az üres sorok kimaradnak', async () => {
    const { db, summary } = await importSample();
    expect(cardCount(db)).toBe(43);
    expect(summary.total).toBe(43);
  });

  it('S-01/EF2: YES, yes és " Yes " megvan, minden más nincs meg', async () => {
    const { db } = await importSample();
    const cards = listCards(db);
    expect(cards.filter((c) => c.owned)).toHaveLength(22);
    const na = cards.find((c) => c.setName === 'Synthetic Gem Pack' && c.pokemon === 'Oinkologne');
    expect(na?.owned).toBe(false);
    const spaced = cards.find((c) => c.setName === 'Synthetic League Promo');
    expect(spaced?.owned).toBe(true);
  });

  it('S-01/EF3 (T-IMP-03): az értékek változatlanok, a kártyaszám szöveg vezető nullákkal', async () => {
    const { db } = await importSample();
    const cards = listCards(db);
    const promo = cards.find((c) => c.pokemon === 'Oinkologne ex')!;
    expect(promo).toMatchObject({
      setName: 'SV Black Star Promos',
      setCode: 'SVP',
      cardNumber: '007/SV-P',
      finish: { name: 'Holo' },
      language: { name: 'English', shortCode: 'EN' },
    });
    const numeric = cards.find(
      (c) => c.setName === 'Synthetic Gem Pack' && c.pokemon === 'Lechonk',
    )!;
    expect(numeric.cardNumber).toBe('007');
    const noCode = cards.find((c) => c.setName === 'Synthetic League Promo')!;
    expect(noCode.setCode).toBeNull();
    expect(noCode.cardNumber).toBe('055');
  });

  it('S-01/EF4: megjegyzés a CHECK, Notes és forráslink alapján', async () => {
    const { db } = await importSample();
    const cards = listCards(db);
    const promo = cards.find((c) => c.pokemon === 'Oinkologne ex')!;
    expect(promo.note).toBe(
      'Ellenőrizendő.\n\nPromo from a synthetic box\n\nForrás: https://example.org/promo/007',
    );
    const checkOnly = cards.find(
      (c) => c.language.shortCode === 'ES' && c.finish.name === 'Reverse Holo',
    )!;
    expect(checkOnly.note).toBe('Ellenőrizendő.\n\nFinish not yet verified');
    const withLink = cards.find(
      (c) =>
        c.language.shortCode === 'EN' && c.cardNumber === '154/198' && c.finish.name === 'Normal',
    )!;
    expect(withLink.note).toBe(
      'Synthetic baseline\n\nForrás: https://example.org/cards/en/svi-154',
    );
    const empty = cards.find((c) => c.language.shortCode === 'FR' && c.pokemon === 'Oinkologne')!;
    expect(empty.note).toBe('');
  });

  it('T-IMP-05: a kártyán nincs qty, region, status, master_id mező', async () => {
    const { db } = await importSample();
    const card = listCards(db)[0]!;
    const keys = Object.keys(card).map((k) => k.toLowerCase());
    for (const bad of ['qty', 'region', 'status', 'masterid', 'master_id']) {
      expect(keys).not.toContain(bad);
    }
    const columns = (db.prepare('PRAGMA table_info(card)').all() as { name: string }[]).map(
      (c) => c.name,
    );
    expect(columns).not.toEqual(expect.arrayContaining(['qty']));
    expect(columns.some((c) => /qty|region|master/u.test(c))).toBe(false);
  });

  it('T-IMP-06: a szótár finish-ei leírással, a sorrendben; a hiányzók leírás nélkül utánuk', async () => {
    const { db } = await importSample();
    const finishes = getLookups(db).finishes;
    expect(finishes.map((f) => f.name)).toEqual([
      'Normal',
      'Reverse Holo',
      'Shiny Holo',
      'Jumbo',
      'Holo',
      'Stamped – Synthetic League (Reverse Holo)',
    ]);
    expect(finishes[0]!.description).toBe('Standard non-holo printing.');
    expect(finishes[3]!.description).toBe('Oversized physical promo.');
    expect(finishes[4]!.description).toBeNull();
  });

  it('a régi Master ID helyett új, egyedi azonosítók készülnek', async () => {
    const { db } = await importSample();
    const ids = listCards(db).map((c) => c.displayId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain('EN-Lechonk-154/198-Reverse_Holo');
    expect(ids).toContain('EN-Oinkologne_ex-007/SV-P-Holo');
    expect(ids).not.toContain('DUP-MASTER-ID');
  });

  it('T-IMP-13: importált kártyák képállapota pending, nincs "legutóbb megszerzett" időpont', async () => {
    const { db } = await importSample();
    const rows = db.prepare('SELECT image_status, owned_changed_at FROM card').all() as {
      image_status: string;
      owned_changed_at: string | null;
    }[];
    expect(rows.every((r) => r.image_status === 'pending' && r.owned_changed_at === null)).toBe(
      true,
    );
  });

  it('S-01/EF7 (T-IMP-07): nem üres adatbázisba nem importál, --force-szal sem', async () => {
    const { db } = await importSample();
    const before = JSON.stringify(listCards(db));
    for (const force of [false, true]) {
      const err = await importExcel(db, fixture('sample-master.xlsx'), { force }).catch((e) => e);
      expect(err).toBeInstanceOf(ImportError);
      expect(err.code).toBe('NOT_EMPTY');
      expect(err.message).toContain('43 kártya');
    }
    expect(JSON.stringify(listCards(db))).toBe(before);
  });

  it('S-01/EF8 (T-IMP-08): ismeretlen nyelv → 0 kártya, a hiba megnevezi a 7. sort és az értéket', async () => {
    const { db } = testDb();
    const err = await importExcel(db, fixture('bad-language.xlsx')).catch((e) => e);
    expect(err).toBeInstanceOf(ImportError);
    expect(err.message).toContain('7. sor');
    expect(err.message).toContain('Klingon');
    expect(cardCount(db)).toBe(0);
    expect(getLookups(db).finishes).toHaveLength(0);
    expect(getMeta(db, 'import_summary')).toBeNull();
  });

  it('S-01/EF8 (T-IMP-09): ismétlődő természetes kulcs → 0 kártya, mindkét sor megnevezve', async () => {
    const { db } = testDb();
    const err = await importExcel(db, fixture('duplicate-key.xlsx')).catch((e) => e);
    expect(err).toBeInstanceOf(ImportError);
    expect(err.message).toContain('5. és 7. sor');
    expect(cardCount(db)).toBe(0);
  });

  it('T-IMP-10: fejléc nélküli lap → érthető hiba', async () => {
    const { db } = testDb();
    const err = await importExcel(db, fixture('no-header.xlsx')).catch((e) => e);
    expect(err).toBeInstanceOf(ImportError);
    expect(err.code).toBe('HEADER_MISSING');
    expect(err.message).toContain('Nem található a fejléc');
  });

  it('nem létező és nem Excel fájl', async () => {
    const { db } = testDb();
    const missing = await importExcel(db, fixture('nincs-ilyen.xlsx')).catch((e) => e);
    expect(missing.code).toBe('FILE');
    const notExcel = await importExcel(db, fixture('../package.json')).catch((e) => e);
    expect(notExcel.code).toBe('FILE');
  });
});

describe('Import összesítő (S-02)', () => {
  it('T-IMP-11: sorok, megvan, hiányzik, nyelvek, új finish-ek; app_meta-ban is', async () => {
    const { db, summary } = await importSample();
    expect(summary).toMatchObject({
      importedAt: '2026-11-27T12:00:00.000Z',
      sourceFile: 'sample-master.xlsx',
      total: 43,
      owned: 22,
      missing: 21,
      needsCheck: 2,
      finishesFromDictionary: 4,
      newFinishes: ['Holo', 'Stamped – Synthetic League (Reverse Holo)'],
    });
    expect(summary.byLanguage).toHaveLength(13);
    expect(summary.byLanguage[0]).toEqual({
      name: 'English',
      nameHu: 'Angol',
      shortCode: 'EN',
      owned: 3,
      all: 4,
    });
    expect(summary.byLanguage.reduce((n, l) => n + l.all, 0)).toBe(43);
    expect(summary.byLanguage.reduce((n, l) => n + l.owned, 0)).toBe(22);
    expect(summary.warnings).toHaveLength(2);
    expect(summary.warnings.join('\n')).toContain('"N/A"');
    expect(summary.warnings.join('\n')).toContain('számként');
    expect(getImportSummary(db)).toEqual(summary);
    expect(getMeta(db, 'imported_at')).toBe('2026-11-27T12:00:00.000Z');
  });

  it('a konzolos összesítő tartalmazza a fő számokat', async () => {
    const { summary } = await importSample();
    const text = formatSummary(summary);
    expect(text).toContain('Kártyák: 43 (megvan: 22, hiányzik: 21)');
    expect(text).toContain('Német');
    expect(text).toContain('Figyelmeztetések (2)');
  });
});

describe('importWorkbook szélső esetek', () => {
  const base = {
    rowNumber: 5,
    have: 'YES',
    pokemon: 'Lechonk',
    setName: 'Set',
    setCode: 'S',
    cardNumber: '1',
    cardNumberWasNumber: false,
    finish: 'Normal',
    language: 'English',
    status: '',
    sourceLink: '',
    notes: '',
  };

  it('szótár nélkül figyelmeztet, a finish-ek leírás nélkül kerülnek be', () => {
    const { db } = testDb();
    const s = importWorkbook(db, { headerRow: 4, dictionary: null, rows: [base] }, 'x.xlsx');
    expect(s.warnings[0]).toContain('VARIANT DICTIONARY');
    expect(s.newFinishes).toEqual(['Normal']);
  });

  it('ismétlődő szótárelem kimarad, figyelmeztetéssel', () => {
    const { db } = testDb();
    const s = importWorkbook(
      db,
      {
        headerRow: 4,
        dictionary: [
          { rowNumber: 2, name: 'Normal', description: 'a' },
          { rowNumber: 3, name: 'normal', description: 'b' },
        ],
        rows: [base],
      },
      'x.xlsx',
    );
    expect(s.finishesFromDictionary).toBe(1);
    expect(s.warnings[0]).toContain('3. sora ismétlődik');
  });

  it('üres kötelező mezők és túl hosszú érték: minden hibás sor felsorolva, semmi sem íródik', () => {
    const { db } = testDb();
    const rows = [
      { ...base, rowNumber: 5, language: '' },
      { ...base, rowNumber: 6, finish: '' },
      { ...base, rowNumber: 7, pokemon: '' },
      { ...base, rowNumber: 8, setName: 'x'.repeat(101) },
      ...Array.from({ length: 30 }, (_, i) => ({ ...base, rowNumber: 100 + i, language: 'Elf' })),
    ];
    let err: ImportError | undefined;
    try {
      importWorkbook(db, { headerRow: 4, dictionary: [], rows }, 'x.xlsx');
    } catch (e) {
      err = e as ImportError;
    }
    expect(err).toBeInstanceOf(ImportError);
    expect(err!.message).toContain('5. sor: a nyelv (Language) üres');
    expect(err!.message).toContain('6. sor: a nyomási változat (Printing / Finish) üres');
    expect(err!.message).toContain('7. sor: pokemon');
    expect(err!.message).toContain('8. sor: setName');
    expect(err!.message).toContain('… és még 9 hiba');
    expect(cardCount(db)).toBe(0);
  });

  it('kártyasor nélküli lap hiba', () => {
    const { db } = testDb();
    expect(() => importWorkbook(db, { headerRow: 4, dictionary: [], rows: [] }, 'x.xlsx')).toThrow(
      /nincs egyetlen kártyasor/u,
    );
  });
});

describe('Excel olvasás', () => {
  it('a fejléc a 4. sorban, az első adatsor az 5.', async () => {
    const wb = await readWorkbook(fixture('sample-master.xlsx'));
    expect(wb.headerRow).toBe(4);
    expect(wb.rows[0]!.rowNumber).toBe(5);
    expect(wb.rows).toHaveLength(43);
    expect(wb.dictionary).toHaveLength(4);
  });
});
