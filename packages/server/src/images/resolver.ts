import { NetworkError } from './http.js';
import type { Http } from './http.js';
import { findSourcePageImage, looksLikeCard } from './source-link.js';
import { imageSize } from './store.js';
import type { ImageHit, ImageProvider, ImageQuery } from './types.js';

export type Resolution =
  | { kind: 'found'; exact: boolean; languageCode: string | null; bytes: Buffer; source: string }
  | { kind: 'none' }
  | { kind: 'error'; message: string };

export interface ResolverOptions {
  http: Http;
  providers: ImageProvider[];
  /** A tartalék nyelvek sorrendje; az első az angol, aztán a japán (spec 7.1/3). */
  fallbackOrder?: string[];
  /** Az összes ismert képkód (a nyelvtáblából), a tartalék sor végére. */
  allLanguageCodes: () => string[];
  log?: (msg: string, extra?: object) => void;
}

/**
 * Egy kártya képének megkeresése (technikai spec 7.1):
 * 1. a kártya saját nyelvén, 2. a `Forrás:` link oldalképe, 3. más nyelv, 4. semmi.
 * Hálózati hiba azonnal `error`; forráshiba esetén a többi forrás még próbálkozhat,
 * de ha végül nincs találat, az eredmény `error` (később újrapróbáljuk), nem `none`.
 */
export class ImageResolver {
  constructor(private readonly o: ResolverOptions) {}

  private async download(hit: ImageHit): Promise<Buffer | null> {
    const bytes = await this.o.http.bytes(hit.url);
    if (!bytes) return null;
    return (await imageSize(bytes)) ? bytes : null;
  }

  /**
   * A források sorban; egy forrás hibája (pl. 503) nem akadályozza a többit, csak jelezzük.
   * Hálózati hiba esetén nincs értelme tovább próbálkozni.
   */
  private async fromProviders(
    card: ImageQuery,
    lang: string,
    onError: (err: Error) => void,
  ): Promise<Resolution | null> {
    for (const p of this.o.providers) {
      try {
        const hit = await p.findImage(card, lang);
        if (!hit) continue;
        const bytes = await this.download(hit);
        if (bytes) {
          return { kind: 'found', exact: false, languageCode: lang, bytes, source: hit.source };
        }
      } catch (err) {
        if (err instanceof NetworkError) throw err;
        onError(err as Error);
      }
    }
    return null;
  }

  async resolve(card: ImageQuery): Promise<Resolution> {
    let sourceErrors = 0;
    const onError = (err: Error) => {
      sourceErrors++;
      this.o.log?.('képforrás hiba', { cardId: card.id, error: err.message });
    };
    const attempt = async <T>(fn: () => Promise<T | null>): Promise<T | null> => {
      try {
        return await fn();
      } catch (err) {
        if (err instanceof NetworkError) throw err;
        onError(err as Error);
        return null;
      }
    };

    try {
      const own = card.languageCode;
      if (own) {
        const r = await attempt(() => this.fromProviders(card, own, onError));
        if (r?.kind === 'found') return { ...r, exact: true };
      }

      const page = await attempt(async () => {
        const hit = await findSourcePageImage(this.o.http, card);
        const bytes = hit ? await this.o.http.bytes(hit.url) : null;
        const size = bytes ? await imageSize(bytes) : null;
        return hit && bytes && size && looksLikeCard(size.width, size.height)
          ? ({
              kind: 'found',
              exact: true,
              languageCode: own,
              bytes,
              source: hit.source,
            } satisfies Resolution)
          : null;
      });
      if (page) return page;

      const order = [...(this.o.fallbackOrder ?? ['en', 'ja']), ...this.o.allLanguageCodes()];
      for (const lang of new Set(order)) {
        if (lang === own) continue;
        const r = await attempt(() => this.fromProviders(card, lang, onError));
        if (r?.kind === 'found') return { ...r, exact: false };
      }
    } catch (err) {
      return { kind: 'error', message: (err as Error).message };
    }
    return sourceErrors > 0
      ? { kind: 'error', message: 'a képforrás hibát adott' }
      : { kind: 'none' };
  }
}
