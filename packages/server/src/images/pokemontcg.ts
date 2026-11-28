import type { Http } from './http.js';
import type { ImageHit, ImageProvider, ImageQuery } from './types.js';

interface PtcgResponse {
  data?: { id: string; images?: { large?: string; small?: string } }[];
}

/** Pokémon TCG API: angol nyelvű tartalék a TCGdex mellett (spec 7.2). Csak `en`. */
export class PokemonTcgProvider implements ImageProvider {
  readonly name = 'pokemontcg.io';

  constructor(private readonly http: Http) {}

  async findImage(card: ImageQuery, languageCode: string): Promise<ImageHit | null> {
    if (languageCode !== 'en' || !card.setCode) return null;
    const number = (card.cardNumber.split('/')[0] ?? '').trim().replace(/^0+(?=\d)/u, '');
    if (!number || /["\\]/u.test(number + card.setCode)) return null;
    const q = `number:"${number}" set.ptcgoCode:"${card.setCode.trim().toUpperCase()}"`;
    const res = await this.http.json<PtcgResponse>(
      `https://api.pokemontcg.io/v2/cards?pageSize=5&select=id,images&q=${encodeURIComponent(q)}`,
    );
    const hit = res?.data?.[0];
    const url = hit?.images?.large ?? hit?.images?.small;
    return hit && url ? { url, source: `https://api.pokemontcg.io/v2/cards/${hit.id}` } : null;
  }
}
