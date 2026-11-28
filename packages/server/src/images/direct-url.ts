import type { ImageHit, ImageProvider, ImageQuery } from './types.js';

/** A kártyaszám első fele számként ("068/078" → 68), vagy `null`. */
function numberOf(cardNumber: string): number | null {
  const head = (cardNumber.split('/')[0] ?? '').trim();
  return /^\d+$/u.test(head) ? Number(head) : null;
}

/**
 * Koreai lapok a hivatalos pokemoncard.co.kr képtárából. A kép címe a setkódból és a
 * számból áll össze (pl. SV1S_068); ha nincs ilyen kép, a letöltés 404-et ad és a
 * következő forrás jön.
 */
export class KoreanProvider implements ImageProvider {
  readonly name = 'pokemoncard.co.kr';

  async findImage(card: ImageQuery, languageCode: string): Promise<ImageHit | null> {
    const set = card.setCode?.trim().toUpperCase();
    const n = numberOf(card.cardNumber);
    if (languageCode !== 'ko' || !set || !/^SV[A-Z0-9-]*$/u.test(set) || n === null) return null;
    const file = `${set}_${String(n).padStart(3, '0')}`;
    return {
      url: `https://pokemoncard.co.kr/public-assets/home/data/cards.image_www/data/wmimages/SV/${set}/${file}.webp`,
      source: `https://pokemoncard.co.kr/cards (${file})`,
    };
  }
}

/**
 * Japán lapok a Limitless TCG képtárából (a kezdőpaklik és promók is megvannak, amelyek a
 * TCGdexből hiányoznak). A set a setkód kötőjel nélkül (SV-P → SVP), a szám nullák nélkül.
 */
export class LimitlessJpProvider implements ImageProvider {
  readonly name = 'limitlesstcg.com';

  async findImage(card: ImageQuery, languageCode: string): Promise<ImageHit | null> {
    const set = card.setCode?.trim().toUpperCase().replace(/-/gu, '');
    const n = numberOf(card.cardNumber);
    if (languageCode !== 'ja' || !set || !/^[A-Z0-9]+$/u.test(set) || n === null) return null;
    return {
      url: `https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/${set}/${set}_${n}_R_JP.png`,
      source: `https://limitlesstcg.com/cards/jp/${set}/${n}`,
    };
  }
}
