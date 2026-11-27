import path from 'node:path';
import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { readWorkbook } from '../src/import/workbook.js';
import { tempDir } from './helpers.js';

async function writeBook(build: (wb: ExcelJS.Workbook) => void): Promise<string> {
  const wb = new ExcelJS.Workbook();
  build(wb);
  const file = path.join(tempDir(), 'book.xlsx');
  await wb.xlsx.writeFile(file);
  return file;
}

describe('Excel olvasás hibái', () => {
  it('hiányzó MASTER SET lap', async () => {
    const file = await writeBook((wb) => wb.addWorksheet('Más'));
    await expect(readWorkbook(file)).rejects.toMatchObject({ code: 'SHEET_MISSING' });
  });

  it('hiányzó kötelező oszlop', async () => {
    const file = await writeBook((wb) => {
      const ws = wb.addWorksheet('MASTER SET');
      ws.addRow(['Have?', 'Pokémon', 'Set / Product', 'Card No.']);
    });
    await expect(readWorkbook(file)).rejects.toMatchObject({
      code: 'COLUMN_MISSING',
      message: expect.stringContaining('Printing / Finish, Language'),
    });
  });

  it('lapnév kis-/nagybetűtől független, a fejléc az első sorban is lehet, a szótár hiányozhat', async () => {
    const file = await writeBook((wb) => {
      const ws = wb.addWorksheet('Master Set');
      ws.addRow(['Have?', 'Pokémon', 'Set / Product', 'Card No.', 'Printing / Finish', 'Language']);
      ws.addRow(['YES', 'Lechonk', 'S', { richText: [{ text: '1' }] }, 'Normal', 'English']);
    });
    const wb = await readWorkbook(file);
    expect(wb.headerRow).toBe(1);
    expect(wb.dictionary).toBeNull();
    expect(wb.rows[0]).toMatchObject({ cardNumber: '1', setCode: '', notes: '', status: '' });
  });
});
