/**
 * Kézi kártyakép: feltöltött fájl vagy egy képlink (amit a szerver tölt le). Azoknak a
 * lapoknak, amelyekhez a képforrásokban nincs kép. Az eredmény "pontos" kép a kártya saját
 * nyelvén; a képgyűjtő nem írja felül (csak a `pending` sorokkal foglalkozik).
 */
import type { Db } from '../db/open.js';
import { imageSize, removeImageFiles, storeImage } from './store.js';

export const MANUAL_UPLOAD_SOURCE = 'kézi feltöltés';
export const MAX_MANUAL_BYTES = 15 * 1024 * 1024;

export class ManualImageError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/** Csak http(s) képlink fogadható el. */
export function parseImageUrl(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new ManualImageError(400, 'VALIDATION', 'Adj meg egy képlinket.');
  }
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new ManualImageError(400, 'VALIDATION', 'Érvénytelen link.');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new ManualImageError(400, 'VALIDATION', 'Csak http vagy https link adható meg.');
  }
  return url.toString();
}

/** A kép tárolása és a kártya frissítése. `false`, ha nincs ilyen kártya. */
export async function setManualImage(
  db: Db,
  imagesDir: string,
  id: number,
  bytes: Buffer,
  source: string,
  now = new Date(),
): Promise<boolean> {
  const row = db.prepare('SELECT language_id, image_file FROM card WHERE id = ?').get(id) as
    { language_id: number; image_file: string | null } | undefined;
  if (!row) return false;
  if (!(await imageSize(bytes))) {
    throw new ManualImageError(400, 'BAD_IMAGE', 'Ez a fájl nem olvasható képként.');
  }
  const file = await storeImage(imagesDir, id, bytes);
  if (!file) throw new ManualImageError(400, 'BAD_IMAGE', 'A kép nem dolgozható fel.');
  db.prepare(
    `UPDATE card SET image_status = 'exact', image_file = @file, image_lang_id = @lang,
            image_source = @source, image_checked_at = @ts
     WHERE id = @id`,
  ).run({ id, file, lang: row.language_id, source, ts: now.toISOString() });
  if (row.image_file && row.image_file !== file) removeImageFiles(imagesDir, row.image_file);
  return true;
}
