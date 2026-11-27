/**
 * Szövegnormalizálás a duplikátumvizsgálathoz (természetes kulcs) és a kereséshez.
 */

/** Levágja a széleket, a belső szóközsorozatokat egy szóközre cseréli, NFC formára hoz. */
export function cleanText(value: string): string {
  return value.normalize('NFC').replace(/\s+/gu, ' ').trim();
}

/** Kis-/nagybetűtől és szóközöktől független összehasonlítási alak. */
export function keyText(value: string): string {
  return cleanText(value).toLocaleLowerCase('en-US');
}

export interface NaturalKeyInput {
  pokemon: string;
  setName: string;
  cardNumber: string;
  finishId: number;
  languageId: number;
}

/**
 * Természetes kulcs (üzleti igény 5. fejezet, technikai spec 4.2):
 * Pokémon | set | kártyaszám | finish | nyelv, normalizálva.
 */
export function naturalKey(card: NaturalKeyInput): string {
  return [
    keyText(card.pokemon),
    keyText(card.setName),
    keyText(card.cardNumber),
    String(card.finishId),
    String(card.languageId),
  ].join('|');
}
