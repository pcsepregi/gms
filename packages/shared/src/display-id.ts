/**
 * Megjelenített azonosító (technikai spec 4.2):
 * `{NYELVKÓD}-{Pokémon}-{kártyaszám}-{finish}`, szóköz helyett `_`.
 * Ütközés esetén `-{setkód}` utótag; ha az sem egyedi, sorszám.
 */

export interface DisplayIdInput {
  languageCode: string;
  pokemon: string;
  cardNumber: string;
  finishName: string;
  setCode: string | null;
  setName: string;
}

function part(value: string): string {
  return value.normalize('NFC').trim().replace(/\s+/gu, '_');
}

export function baseDisplayId(card: DisplayIdInput): string {
  return [card.languageCode, card.pokemon, card.cardNumber, card.finishName].map(part).join('-');
}

/**
 * Azonosítókat oszt ki egy teljes kártyalistára. A sorrend a bemenet sorrendje,
 * így ugyanarra a bemenetre mindig ugyanaz az eredmény.
 */
export function assignDisplayIds(cards: readonly DisplayIdInput[]): string[] {
  const bases = cards.map(baseDisplayId);
  const baseCount = new Map<string, number>();
  for (const b of bases) baseCount.set(b, (baseCount.get(b) ?? 0) + 1);

  const withSuffix = bases.map((b, i) => {
    if (baseCount.get(b) === 1) return b;
    const card = cards[i]!;
    const suffix = card.setCode?.trim() ? card.setCode : card.setName;
    return `${b}-${part(suffix)}`;
  });

  const seen = new Map<string, number>();
  const total = new Map<string, number>();
  for (const id of withSuffix) total.set(id, (total.get(id) ?? 0) + 1);
  return withSuffix.map((id) => {
    if (total.get(id) === 1) return id;
    const n = (seen.get(id) ?? 0) + 1;
    seen.set(id, n);
    return `${id}-${n}`;
  });
}
