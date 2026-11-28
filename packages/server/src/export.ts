import ExcelJS from 'exceljs';
import type { Card } from '@gms/shared';

/** Export oszlopai, a technikai spec 10. és a S-50 szerint. */
export const EXPORT_HEADERS = [
  'Megvan',
  'Pokémon',
  'Set',
  'Set kód',
  'Kártyaszám',
  'Nyomási változat',
  'Nyelv',
  'Megjegyzés',
  'Azonosító',
] as const;

export type ExportFormat = 'xlsx' | 'csv';

/** Egy kártya sora; a sorrend a bemeneti tömbé marad. */
export function exportRows(cards: readonly Card[]): string[][] {
  return cards.map((c) => [
    c.owned ? 'Igen' : 'Nem',
    c.pokemon,
    c.setName,
    c.setCode ?? '',
    c.cardNumber,
    c.finish.name,
    c.language.nameHu,
    c.note,
    c.displayId,
  ]);
}

/**
 * Képletbeszúrás ellen: a `=`, `+`, `-`, `@` vagy tabulátorral kezdődő szöveg elé aposztróf
 * kerül, hogy Excelben ne képletként fusson (T-EXP-06). A számok nem érintettek.
 */
export function neutralizeFormula(value: string): string {
  return /^[=+\-@\t\r]/u.test(value) ? `'${value}` : value;
}

/** CSV: UTF-8 BOM, `;` elválasztó, a `;`, `"` vagy sortörést tartalmazó mezők idézve. */
export function toCsv(cards: readonly Card[]): string {
  const cell = (v: string) => {
    const s = neutralizeFormula(v);
    return /[;"\r\n]/u.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
  };
  const lines = [
    EXPORT_HEADERS.map(cell).join(';'),
    ...exportRows(cards).map((r) => r.map(cell).join(';')),
  ];
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

/** XLSX: rögzített fejléc, automatikus szűrő, oszlopszélességek. */
export async function toXlsx(cards: readonly Card[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.created = new Date();
  const ws = wb.addWorksheet('Gyűjtemény');
  ws.addRow([...EXPORT_HEADERS]);
  for (const row of exportRows(cards)) ws.addRow(row.map(neutralizeFormula));
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: EXPORT_HEADERS.length } };
  const widths = [10, 22, 26, 10, 14, 20, 14, 40, 36];
  ws.columns = EXPORT_HEADERS.map((h, i) => ({ header: h, width: widths[i] }));
  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out);
}

/** Dátum a fájlnévhez: ÉÉÉÉ-HH-NN, helyi idő szerint. */
export function dateStamp(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

/** Biztonságos fájlnév-részlet: csak betű, szám, kötőjel. */
export function safeNamePart(raw: string | undefined): string | null {
  if (!raw) return null;
  const s = raw
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 40);
  return s || null;
}

export function exportFileName(format: ExportFormat, namePart: string | null, now = new Date()) {
  const base = namePart ? `GMS-${namePart}` : 'GMS-export';
  return `${base}-${dateStamp(now)}.${format}`;
}
