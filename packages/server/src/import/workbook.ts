import fs from 'node:fs';
import ExcelJS from 'exceljs';
import { keyText } from '@gms/shared';
import { cardNumberText, cellLink, cellText } from './cells.js';
import { ImportError } from './errors.js';

export const MASTER_SHEET = 'MASTER SET';
export const DICTIONARY_SHEET = 'VARIANT DICTIONARY';

export interface RawDictionaryEntry {
  rowNumber: number;
  name: string;
  description: string;
}

export interface RawRow {
  rowNumber: number;
  have: string;
  pokemon: string;
  setName: string;
  setCode: string;
  cardNumber: string;
  cardNumberWasNumber: boolean;
  finish: string;
  language: string;
  status: string;
  sourceLink: string;
  notes: string;
}

export interface RawWorkbook {
  headerRow: number;
  dictionary: RawDictionaryEntry[] | null;
  rows: RawRow[];
}

/** Oszlopok a fejléc szövege szerint. A Qty, Region és Master ID szándékosan hiányzik: eldobjuk őket. */
const COLUMNS = {
  have: { header: 'Have?', required: true },
  pokemon: { header: 'Pokémon', required: true },
  setName: { header: 'Set / Product', required: true },
  setCode: { header: 'Set Code', required: false },
  cardNumber: { header: 'Card No.', required: true },
  finish: { header: 'Printing / Finish', required: true },
  language: { header: 'Language', required: true },
  status: { header: 'Status', required: false },
  sourceLink: { header: 'Source / Link', required: false },
  notes: { header: 'Notes', required: false },
} as const;

type ColumnKey = keyof typeof COLUMNS;

const HEADER_SEARCH_ROWS = 30;

function findSheet(wb: ExcelJS.Workbook, name: string): ExcelJS.Worksheet | undefined {
  return wb.worksheets.find((ws) => keyText(ws.name) === keyText(name));
}

export async function readWorkbook(file: string): Promise<RawWorkbook> {
  if (!fs.existsSync(file)) throw new ImportError('FILE', `A fájl nem található: ${file}`);
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.readFile(file);
  } catch (err) {
    throw new ImportError('FILE', `A fájl nem olvasható Excel fájlként: ${(err as Error).message}`);
  }

  const master = findSheet(wb, MASTER_SHEET);
  if (!master) throw new ImportError('SHEET_MISSING', `Nincs "${MASTER_SHEET}" lap a fájlban.`);

  // Fejléc keresése a "Have?" cella alapján.
  let headerRow = 0;
  for (let r = 1; r <= Math.min(master.rowCount, HEADER_SEARCH_ROWS) && !headerRow; r++) {
    master.getRow(r).eachCell((cell) => {
      if (!headerRow && keyText(cellText(cell.value)) === keyText(COLUMNS.have.header))
        headerRow = r;
    });
  }
  if (!headerRow) {
    throw new ImportError(
      'HEADER_MISSING',
      `Nem található a fejléc a "${MASTER_SHEET}" lapon (a "${COLUMNS.have.header}" cellát kerestük az első ${HEADER_SEARCH_ROWS} sorban).`,
    );
  }

  const colIndex = new Map<string, number>();
  master.getRow(headerRow).eachCell((cell, col) => {
    colIndex.set(keyText(cellText(cell.value)), col);
  });
  const cols = {} as Record<ColumnKey, number | undefined>;
  const missing: string[] = [];
  for (const [key, def] of Object.entries(COLUMNS) as [ColumnKey, (typeof COLUMNS)[ColumnKey]][]) {
    cols[key] = colIndex.get(keyText(def.header));
    if (def.required && cols[key] === undefined) missing.push(def.header);
  }
  if (missing.length) {
    throw new ImportError(
      'COLUMN_MISSING',
      `Hiányzó oszlop(ok) a "${MASTER_SHEET}" lap fejlécében: ${missing.join(', ')}`,
    );
  }

  const rows: RawRow[] = [];
  for (let r = headerRow + 1; r <= master.rowCount; r++) {
    const row = master.getRow(r);
    const get = (key: ColumnKey) => (cols[key] ? row.getCell(cols[key]).value : null);
    const text = (key: ColumnKey) => cellText(get(key)).trim();
    const numberCell = cols.cardNumber ? row.getCell(cols.cardNumber) : undefined;
    const raw: RawRow = {
      rowNumber: r,
      have: text('have'),
      pokemon: text('pokemon'),
      setName: text('setName'),
      setCode: text('setCode'),
      cardNumber: cardNumberText(numberCell?.value, numberCell?.numFmt).trim(),
      cardNumberWasNumber: typeof numberCell?.value === 'number',
      finish: text('finish'),
      language: text('language'),
      status: text('status'),
      sourceLink: cellLink(get('sourceLink')).trim(),
      notes: cellText(get('notes')).trim(),
    };
    const { rowNumber: _r, cardNumberWasNumber: _n, ...values } = raw;
    if (Object.values(values).every((v) => v === '')) continue; // üres sor
    rows.push(raw);
  }

  const dictSheet = findSheet(wb, DICTIONARY_SHEET);
  let dictionary: RawDictionaryEntry[] | null = null;
  if (dictSheet) {
    dictionary = [];
    for (let r = 2; r <= dictSheet.rowCount; r++) {
      const row = dictSheet.getRow(r);
      const name = cellText(row.getCell(1).value).trim();
      if (!name) continue;
      dictionary.push({ rowNumber: r, name, description: cellText(row.getCell(2).value).trim() });
    }
  }

  return { headerRow, dictionary, rows };
}
