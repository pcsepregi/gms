/** Az Excel → GMS leképezés tiszta függvényei (technikai spec 5.). */

/** `YES`/`yes` (szóköz levágva, kis-/nagybetűtől függetlenül) → megvan, minden más → nincs meg. */
export function parseOwned(value: string): boolean {
  return value.trim().toUpperCase() === 'YES';
}

/** Azok az értékek, amelyek egyértelműen "nincs meg"-et jelentenek (nem kell rájuk figyelmeztetés). */
export function isPlainNotOwned(value: string): boolean {
  const v = value.trim().toUpperCase();
  return v === '' || v === 'NO';
}

export function isCheckStatus(value: string): boolean {
  return value.trim().toUpperCase() === 'CHECK';
}

export const NOTE_CHECK = 'Ellenőrizendő.';
export const NOTE_SOURCE_PREFIX = 'Forrás: ';

/**
 * Megjegyzés: `[Ellenőrizendő.]` + Notes + `[Forrás: link]`, üres sorral elválasztva,
 * a hiányzó részek kimaradnak.
 */
export function buildNote(parts: { check: boolean; notes: string; link: string }): string {
  const out: string[] = [];
  if (parts.check) out.push(NOTE_CHECK);
  if (parts.notes.trim()) out.push(parts.notes.trim());
  if (parts.link.trim()) out.push(`${NOTE_SOURCE_PREFIX}${parts.link.trim()}`);
  return out.join('\n\n');
}
