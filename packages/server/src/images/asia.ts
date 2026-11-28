import { LOCAL_POKEMON_NAMES } from '../config.js';
import type { Http } from './http.js';
import { localNumber } from './tcgdex.js';
import type { ImageHit, ImageProvider, ImageQuery } from './types.js';

const BASE = 'https://asia.pokemon-card.com';
/** Képkód → a hivatalos ázsiai kártyaadatbázis régiója. */
const REGIONS: Record<string, string> = { th: 'th', id: 'id', 'zh-tw': 'tw' };
const MAX_PAGES = 5;
const CACHE_MS = 6 * 60 * 60 * 1000;

export interface AsiaCard {
  id: string;
  image: string;
  number: string;
  setCode: string;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/gu, '');

/** A keresési lista lapjainak azonosítói (`/card-search/detail/{id}/`). */
export function parseListIds(html: string): string[] {
  return [...new Set([...html.matchAll(/\/card-search\/detail\/(\d+)\//gu)].map((m) => m[1]!))];
}

/** A lap részletes oldalából: kép, gyűjtői szám ("150/190") és setkód (a jel fájlnevéből). */
export function parseDetail(html: string, region: string): Omit<AsiaCard, 'id'> | null {
  const img = /class="cardImage"[\s\S]*?<img[^>]*?\ssrc="([^"]+)"/u.exec(html)?.[1];
  const number = /class="collectorNumber"[^>]*>([^<]*)</u.exec(html)?.[1];
  const symbol = /class="expansionSymbol"[\s\S]*?<img[^>]*?\ssrc="([^"]+)"/u.exec(html)?.[1];
  if (!img || !number || !symbol) return null;
  const file = symbol.split(/[?#]/u)[0]!.split('/').pop() ?? '';
  const setCode = file.replace(/\.[a-z]+$/iu, '').replace(new RegExp(`_${region}$`, 'iu'), '');
  return {
    image: new URL(img.trim(), `${BASE}/${region}/`).href,
    number: number.replace(/&nbsp;|\s+/gu, ''),
    setCode,
  };
}

/**
 * A hivatalos ázsiai kártyaadatbázis (asia.pokemon-card.com): thai, indonéz és tajvani
 * (hagyományos kínai) lapok. Név szerint keres, a találatok részletes oldalán a
 * gyűjtői szám és a set jele alapján választ.
 */
export class AsiaProvider implements ImageProvider {
  readonly name = 'asia.pokemon-card.com';
  private readonly lists = new Map<string, { at: number; ids: string[] }>();
  private readonly details = new Map<string, AsiaCard | null>();

  constructor(
    private readonly http: Http,
    private readonly names: typeof LOCAL_POKEMON_NAMES = LOCAL_POKEMON_NAMES,
    private readonly now: () => number = Date.now,
  ) {}

  private keyword(pokemon: string, lang: string): string {
    const key = pokemon.trim().toLowerCase();
    return this.names[key]?.[lang] ?? pokemon.trim();
  }

  private async search(region: string, keyword: string): Promise<string[]> {
    const key = `${region}/${keyword}`;
    const hit = this.lists.get(key);
    if (hit && this.now() - hit.at < CACHE_MS) return hit.ids;
    const ids: string[] = [];
    for (let page = 1; page <= MAX_PAGES; page++) {
      const url =
        `${BASE}/${region}/card-search/list/?keyword=${encodeURIComponent(keyword)}` +
        (page > 1 ? `&pageNo=${page}` : '');
      const html = await this.http.text(url);
      if (!html) break;
      const found = parseListIds(html).filter((id) => !ids.includes(id));
      ids.push(...found);
      if (!found.length || !html.includes(`pageNo=${page + 1}`)) break;
    }
    this.lists.set(key, { at: this.now(), ids });
    return ids;
  }

  private async detail(region: string, id: string): Promise<AsiaCard | null> {
    const key = `${region}/${id}`;
    if (this.details.has(key)) return this.details.get(key) ?? null;
    const html = await this.http.text(`${BASE}/${region}/card-search/detail/${id}/`);
    const parsed = html ? parseDetail(html, region) : null;
    const card = parsed ? { id, ...parsed } : null;
    this.details.set(key, card);
    return card;
  }

  async findImage(card: ImageQuery, languageCode: string): Promise<ImageHit | null> {
    const region = REGIONS[languageCode];
    if (!region) return null;
    const wanted = localNumber(card.cardNumber);
    const code = card.setCode ? norm(card.setCode) : null;
    const matches: AsiaCard[] = [];
    for (const id of await this.search(region, this.keyword(card.pokemon, languageCode))) {
      const c = await this.detail(region, id);
      if (c && localNumber(c.number) === wanted) matches.push(c);
    }
    // Elsőként a set jele dönt; ha az eltér (pl. kezdőpakliknál), a teljes szám ("131/163").
    const best =
      matches.find((c) => !code || norm(c.setCode) === code) ??
      matches.find((c) => c.number.includes('/') && norm(c.number) === norm(card.cardNumber));
    return best
      ? { url: best.image, source: `${BASE}/${region}/card-search/detail/${best.id}/` }
      : null;
  }
}
