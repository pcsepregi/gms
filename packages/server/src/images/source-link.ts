import type { Http } from './http.js';
import type { ImageHit, ImageQuery } from './types.js';

const SOURCE_RE = /Forrás:\s*(https?:\/\/[^\s<>"')]+)/iu;

/** A megjegyzés `Forrás:` sora után álló link (S-40), vagy `null`. */
export function sourceLinkOf(note: string): string | null {
  return SOURCE_RE.exec(note)?.[1] ?? null;
}

/** Az oldal `og:image` (vagy `twitter:image`) értéke, abszolút URL-ként. */
export function extractOgImage(html: string, pageUrl: string): string | null {
  const metas = html.match(/<meta\b[^>]*>/giu) ?? [];
  for (const wanted of ['og:image', 'twitter:image']) {
    for (const tag of metas) {
      const prop = /(?:property|name)\s*=\s*["']([^"']+)["']/iu.exec(tag)?.[1]?.toLowerCase();
      if (prop !== wanted) continue;
      const content = /content\s*=\s*["']([^"']+)["']/iu.exec(tag)?.[1];
      if (!content) continue;
      try {
        return new URL(content.replaceAll('&amp;', '&'), pageUrl).toString();
      } catch {
        // érvénytelen URL: a következő jelölt
      }
    }
  }
  return null;
}

/** Kártya arányú-e a kép (≈ 0,72), és elég nagy-e (legalább 400 px magas). T-IMG-05. */
export function looksLikeCard(width: number, height: number): boolean {
  if (!width || !height || height < 400) return false;
  const ratio = width / height;
  return ratio >= 0.65 && ratio <= 0.8;
}

/**
 * A kártya `Forrás:` linkjének oldalképe. Nem `ImageProvider`: a találatot a képfeldolgozás
 * után még ellenőrizni kell (`looksLikeCard`), ezért a gyűjtő külön kezeli.
 */
export async function findSourcePageImage(http: Http, card: ImageQuery): Promise<ImageHit | null> {
  const link = sourceLinkOf(card.note);
  if (!link) return null;
  const html = await http.text(link);
  const url = html ? extractOgImage(html, link) : null;
  return url ? { url, source: link } : null;
}
