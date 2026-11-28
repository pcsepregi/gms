import fs from 'node:fs';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import type { Card } from '@gms/shared';
import { buildApp } from '../src/app.js';
import { runBackupExclusive, retentionKeep, mirrorImages, backupStatus } from '../src/backup.js';
import { listCards } from '../src/cards.js';
import { exportFileName, neutralizeFormula, safeNamePart, toCsv, toXlsx } from '../src/export.js';
import { importExcel } from '../src/import/run.js';
import { fixture, LOCAL_HEADERS, tempDir, testConfig, testDb } from './helpers.js';

async function setup(configExtra: Record<string, unknown> = {}) {
  const config = testConfig(configExtra);
  const { db } = testDb(config);
  await importExcel(db, fixture('sample-master.xlsx'));
  const app = await buildApp({ db, config, version: 'x', webDistDir: null });
  return { app, db, config };
}

const fakeCard = (over: Partial<Card> = {}): Card =>
  ({
    id: 1,
    displayId: 'EN-Lechonk-1-Normal',
    owned: true,
    pokemon: 'Lechonk',
    setName: 'Scarlet & Violet',
    setCode: 'SVI',
    cardNumber: '1/198',
    finish: { id: 1, name: 'Normal', description: null },
    language: { id: 1, name: 'English', nameHu: 'Angol', shortCode: 'EN', sortOrder: 1 },
    note: '',
    image: { status: 'none', url: null, languageId: null },
    createdAt: '',
    updatedAt: '',
    ...over,
  }) as Card;

describe('export formátum', () => {
  it('CSV: BOM, pontosvessző, idézés a sortörésnél és a pontosvesszőnél', () => {
    const csv = toCsv([fakeCard({ note: 'a;b\n"c"' })]);
    expect(csv.startsWith('﻿')).toBe(true);
    const [header, row] = csv.slice(1).split('\r\n');
    expect(header).toBe(
      'Megvan;Pokémon;Set;Set kód;Kártyaszám;Nyomási változat;Nyelv;Megjegyzés;Azonosító',
    );
    expect(row).toContain('Igen;Lechonk;Scarlet & Violet;SVI;1/198;Normal;Angol;');
    expect(csv).toContain('"a;b\n""c"""');
  });

  it('T-EXP-06: a képletszerű megjegyzés szövegként íródik', () => {
    expect(neutralizeFormula('=HYPERLINK("x")')).toBe(`'=HYPERLINK("x")`);
    expect(neutralizeFormula('Lechonk')).toBe('Lechonk');
    expect(toCsv([fakeCard({ note: '=1+1' })])).toContain(`'=1+1`);
  });

  it('T-EXP-01: XLSX rögzített fejléccel, szűrővel, magyar nyelvvel', async () => {
    const buf = await toXlsx([fakeCard()]);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as Parameters<typeof wb.xlsx.load>[0]);
    const ws = wb.worksheets[0]!;
    expect(ws.getRow(1).getCell(1).value).toBe('Megvan');
    expect(ws.getRow(2).getCell(1).value).toBe('Igen');
    expect(ws.getRow(2).getCell(7).value).toBe('Angol');
    expect(ws.views[0]).toMatchObject({ state: 'frozen', ySplit: 1 });
    expect(ws.autoFilter).toBeTruthy();
  });

  it('T-EXP-03: fájlnév dátummal, csak biztonságos karakterekkel', () => {
    const now = new Date(2026, 10, 27);
    expect(exportFileName('xlsx', null, now)).toBe('GMS-export-2026-11-27.xlsx');
    expect(exportFileName('csv', safeNamePart('hiánylista német/../x'), now)).toBe(
      'GMS-hianylista-nemet-x-2026-11-27.csv',
    );
    expect(safeNamePart('')).toBeNull();
  });
});

describe('mentés', () => {
  it('T-BAK-03: megőrzés — 30 napi, havonta az első, 12 hónapig', () => {
    const now = new Date(2026, 10, 27);
    const stamps: string[] = [];
    for (let d = 0; d < 400; d++) {
      const dt = new Date(2026, 10, 27 - d);
      stamps.push(
        `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`,
      );
    }
    const keep = retentionKeep(stamps, now);
    expect(keep.has('2026-11-27')).toBe(true);
    expect(keep.has('2026-10-29')).toBe(true); // 30 napon belül
    expect(keep.has('2026-10-20')).toBe(false); // 30 napon túl, nem hónap eleje
    expect(keep.has('2026-10-01')).toBe(true); // októberi első
    expect(keep.has('2026-10-15')).toBe(false);
    expect(keep.has('2025-11-01')).toBe(true); // 12 hónapon belül
    expect(keep.has('2025-10-01')).toBe(false); // 13 hónapos
  });

  it('T-BAK-04: képtükör — új másolódik, törölt törlődik', () => {
    const src = tempDir();
    const dst = tempDir();
    fs.writeFileSync(path.join(src, 'a.webp'), 'A');
    fs.writeFileSync(path.join(dst, 'old.webp'), 'O');
    expect(mirrorImages(src, dst)).toEqual({ copied: 1, removed: 1 });
    expect(fs.readdirSync(dst)).toEqual(['a.webp']);
  });

  it('T-BAK-01: mentés célmappába: sqlite, xlsx, ellenőrzött másolat', async () => {
    const { db, config } = await setup({ backupDir: tempDir() });
    const res = await runBackupExclusive(db, config, new Date(2026, 10, 27, 9));
    expect(res.cards).toBe(43);
    const dir = path.join(config.backupDir!, 'backups');
    expect(fs.existsSync(path.join(dir, 'gms-2026-11-27.sqlite'))).toBe(true);
    expect(fs.existsSync(path.join(dir, 'gms-2026-11-27.xlsx'))).toBe(true);
    const status = backupStatus(db, config);
    expect(status).toMatchObject({ configured: true, lastStatus: 'ok', stale: false });
    expect(db.prepare('SELECT status FROM backup_log').all()).toEqual([{ status: 'ok' }]);
  });

  it('T-BAK-06/07: nem írható célmappa → hibás állapot, figyelmeztetés', async () => {
    const blocker = path.join(tempDir(), 'file');
    fs.writeFileSync(blocker, 'nem mappa');
    const { db, config } = await setup({ backupDir: path.join(blocker, 'gms') });
    await expect(runBackupExclusive(db, config)).rejects.toThrow();
    const status = backupStatus(db, config);
    expect(status.lastStatus).toBe('error');
    expect(status.stale).toBe(true);
    expect(db.prepare('SELECT status FROM backup_log').get()).toEqual({ status: 'error' });
  });

  it('nincs backupDir: a státusz nincs beállítva, nincs figyelmeztetés', async () => {
    const { db, config } = await setup();
    expect(backupStatus(db, config)).toMatchObject({ configured: false, stale: false });
  });
});

describe('API: export és mentés', () => {
  it('T-EXP-01/04: teljes és szűrt (ids) export a megadott sorrendben', async () => {
    const { app, db } = await setup();
    const full = await app.inject({ url: '/api/export?format=csv', headers: LOCAL_HEADERS });
    expect(full.statusCode).toBe(200);
    expect(full.headers['content-disposition']).toMatch(/GMS-export-\d{4}-\d{2}-\d{2}\.csv/u);
    const lines = full.body.slice(1).split('\r\n').filter(Boolean);
    expect(lines).toHaveLength(44); // fejléc + 43

    const res = await app.inject({
      method: 'POST',
      url: '/api/export',
      headers: LOCAL_HEADERS,
      payload: { format: 'csv', ids: [3, 1], name: 'hiánylista' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-disposition']).toContain('GMS-hianylista-');
    const rows = res.body.slice(1).split('\r\n').filter(Boolean);
    expect(rows).toHaveLength(3);
    expect(rows[1]!.split(';')[8]).toBe(listCards(db).find((c) => c.id === 3)!.displayId);
  });

  it('T-EXP-05: 400 azonosító POST-tal', async () => {
    const { app } = await setup();
    const ids = Array.from({ length: 400 }, (_, i) => (i % 43) + 1);
    const res = await app.inject({
      method: 'POST',
      url: '/api/export',
      headers: LOCAL_HEADERS,
      payload: { format: 'xlsx', ids },
    });
    expect(res.statusCode).toBe(200);
  });

  it('hibás formátum és hibás azonosító', async () => {
    const { app } = await setup();
    expect(
      (await app.inject({ url: '/api/export?format=pdf', headers: LOCAL_HEADERS })).statusCode,
    ).toBe(400);
    const bad = await app.inject({
      method: 'POST',
      url: '/api/export',
      headers: LOCAL_HEADERS,
      payload: { format: 'csv', ids: [-1] },
    });
    expect(bad.statusCode).toBe(400);
  });

  it('S-55: kézi mentés, majd állapot', async () => {
    const { app } = await setup({ backupDir: tempDir() });
    const run = await app.inject({
      method: 'POST',
      url: '/api/backup/run',
      headers: LOCAL_HEADERS,
    });
    expect(run.statusCode).toBe(200);
    expect(run.json()).toMatchObject({ ok: true, cards: 43 });
    const status = await app.inject({ url: '/api/backup/status', headers: LOCAL_HEADERS });
    expect(status.json()).toMatchObject({ configured: true, lastStatus: 'ok', running: false });
  });
});
