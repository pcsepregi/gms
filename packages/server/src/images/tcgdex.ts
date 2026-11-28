import type { Http } from './http.js';
import { mappedSetIds } from './set-map.js';
import type { ImageHit, ImageProvider, ImageQuery } from './types.js';

const API = 'https://api.tcgdex.net/v2';

interface CardBrief {
  id: string;
  localId: string;
  name: string;
  image?: string;
}

interface SetInfo {
  id: string;
  name: string;
  abbreviation?: { official?: string };
  cardCount?: { official?: number; total?: number };
}

const CACHE_MS = 6 * 60 * 60 * 1000;

const alnum = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

/** A kártyaszám első fele ("154/198" → "154"), számoknál a kezdő nullák nélkül. */
export function localNumber(cardNumber: string): string {
  const head = (cardNumber.split('/')[0] ?? '').trim().toUpperCase();
  return /^\d+$/u.test(head) ? String(Number(head)) : head;
}

/** A kártyaszám második fele ("154/198" → 198), ha szám. */
function printedTotal(cardNumber: string): number | null {
  const tail = cardNumber.split('/')[1]?.trim();
  return tail && /^\d+$/u.test(tail) ? Number(tail) : null;
}

/**
 * TCGdex: a Pokémon országos sorszáma (dexId) alapján listázza a lapokat nyelvenként,
 * majd kártyaszám és set szerint választ. A finish nem része az egyezésnek (spec 7.1).
 */
export class TcgdexProvider implements ImageProvider {
  readonly name = 'tcgdex';
  private readonly lists = new Map<string, { at: number; cards: CardBrief[] }>();
  private readonly sets = new Map<string, SetInfo | null>();
  private readonly dex = new Map<string, number | null>();

  constructor(
    private readonly http: Http,
    private readonly now: () => number = Date.now,
  ) {}

  private async dexId(pokemon: string): Promise<number | null> {
    const key = pokemon.trim().toLowerCase();
    if (this.dex.has(key)) return this.dex.get(key) ?? null;
    const names = [pokemon.trim(), pokemon.trim().split(/\s+/u)[0] ?? ''];
    let found: number | null = null;
    for (const name of new Set(names.filter(Boolean))) {
      const list = await this.http.json<CardBrief[]>(
        `${API}/en/cards?name=${encodeURIComponent(name)}`,
      );
      const first = list?.[0];
      if (!first) continue;
      const detail = await this.http.json<{ dexId?: number[] }>(
        `${API}/en/cards/${encodeURIComponent(first.id)}`,
      );
      found = detail?.dexId?.[0] ?? null;
      if (found !== null) break;
    }
    this.dex.set(key, found);
    return found;
  }

  private async cardsOf(lang: string, dex: number): Promise<CardBrief[]> {
    const key = `${lang}/${dex}`;
    const hit = this.lists.get(key);
    if (hit && this.now() - hit.at < CACHE_MS) return hit.cards;
    const cards = (await this.http.json<CardBrief[]>(`${API}/${lang}/cards?dexId=eq:${dex}`)) ?? [];
    this.lists.set(key, { at: this.now(), cards });
    return cards;
  }

  private async setInfo(lang: string, setId: string): Promise<SetInfo | null> {
    const key = `${lang}/${setId}`;
    if (this.sets.has(key)) return this.sets.get(key) ?? null;
    const info = await this.http.json<SetInfo>(`${API}/${lang}/sets/${encodeURIComponent(setId)}`);
    this.sets.set(key, info);
    return info;
  }

  private async setMatches(lang: string, setId: string, card: ImageQuery): Promise<boolean> {
    if (mappedSetIds(card.setCode).includes(setId)) return true;
    const code = card.setCode?.trim().toLowerCase();
    if (code && code === setId.toLowerCase()) return true;
    const info = await this.setInfo(lang, setId);
    if (!info) return false;
    if (code && info.abbreviation?.official?.toLowerCase() === code) return true;
    if (alnum(info.name) === alnum(card.setName)) return true;
    const total = printedTotal(card.cardNumber);
    return total !== null && info.cardCount?.official === total;
  }

  async findImage(card: ImageQuery, languageCode: string): Promise<ImageHit | null> {
    const dex = await this.dexId(card.pokemon);
    if (dex === null) return null;
    const wanted = localNumber(card.cardNumber);
    const candidates = (await this.cardsOf(languageCode, dex)).filter(
      (c) => localNumber(c.localId) === wanted,
    );
    for (const c of candidates) {
      const setId = c.id.slice(0, c.id.lastIndexOf('-'));
      if (!(await this.setMatches(languageCode, setId, card))) continue;
      if (!c.image) return null; // a lap megvan, de a forrásnak nincs hozzá képe
      return { url: `${c.image}/high.webp`, source: `${API}/${languageCode}/cards/${c.id}` };
    }
    return null;
  }
}
