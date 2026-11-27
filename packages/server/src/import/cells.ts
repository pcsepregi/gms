/**
 * Excel cellaértékek szöveggé alakítása (exceljs értéktípusok).
 */

type RichText = { richText: { text: string }[] };
type Hyperlink = { text?: unknown; hyperlink?: string };
type Formula = { formula?: string; sharedFormula?: string; result?: unknown };

export function cellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'object') {
    if ('richText' in value && Array.isArray((value as RichText).richText)) {
      return (value as RichText).richText.map((r) => r.text).join('');
    }
    if ('hyperlink' in value || 'text' in value) return cellText((value as Hyperlink).text);
    if ('formula' in value || 'sharedFormula' in value || 'result' in value) {
      return cellText((value as Formula).result);
    }
  }
  return '';
}

/** Hivatkozás cellánál a link célja, egyébként a szöveg. */
export function cellLink(value: unknown): string {
  if (value && typeof value === 'object' && 'hyperlink' in value) {
    const target = (value as Hyperlink).hyperlink;
    if (typeof target === 'string' && target.trim()) return target;
  }
  return cellText(value);
}

/**
 * Kártyaszám cella szövegként. Számként tárolt cellánál a `000` jellegű
 * számformátum vezető nulláit visszaállítja (technikai spec 5., T-IMP-03).
 */
export function cardNumberText(value: unknown, numFmt?: string): string {
  const raw =
    value && typeof value === 'object' && 'result' in value ? (value as Formula).result : value;
  if (typeof raw === 'number') {
    const zeros = numFmt && /^0+$/u.test(numFmt) ? numFmt.length : 0;
    return Number.isInteger(raw) && zeros ? String(raw).padStart(zeros, '0') : String(raw);
  }
  return cellText(value);
}
