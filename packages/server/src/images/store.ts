import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

export const MAX_WIDTH = 734;
export const MAX_HEIGHT = 1024;
export const THUMB_WIDTH = 320;

/** A kép mérete a fájl dekódolása után; érvénytelen képnél `null`. */
export async function imageSize(bytes: Buffer): Promise<{ width: number; height: number } | null> {
  try {
    const m = await sharp(bytes).metadata();
    return m.width && m.height ? { width: m.width, height: m.height } : null;
  } catch {
    return null;
  }
}

/**
 * A letöltött képből WebP-t és bélyegképet készít (technikai spec 7.3). Visszaadja a fő
 * fájl nevét; a bélyegkép neve `…-thumb.webp`. Érvénytelen kép esetén `null`.
 */
export async function storeImage(
  imagesDir: string,
  cardId: number,
  bytes: Buffer,
): Promise<string | null> {
  try {
    const main = await sharp(bytes)
      .rotate()
      .resize({ width: MAX_WIDTH, height: MAX_HEIGHT, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 85 })
      .toBuffer();
    const thumb = await sharp(main)
      .resize({ width: THUMB_WIDTH, withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();
    const hash = crypto.createHash('sha1').update(main).digest('hex').slice(0, 8);
    const file = `${cardId}-${hash}.webp`;
    fs.mkdirSync(imagesDir, { recursive: true });
    writeAtomic(path.join(imagesDir, file), main);
    writeAtomic(path.join(imagesDir, thumbName(file)), thumb);
    return file;
  } catch {
    return null;
  }
}

export const thumbName = (file: string) => file.replace(/\.webp$/u, '-thumb.webp');

function writeAtomic(target: string, data: Buffer): void {
  const tmp = `${target}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, target);
}

export function removeImageFiles(imagesDir: string, file: string | null): void {
  if (!file) return;
  const main = path.join(imagesDir, path.basename(file));
  for (const p of [main, thumbName(main)]) fs.rmSync(p, { force: true });
}

/** A kiszolgálható fájlnevek alakja (útvonal-bejárás ellen, T-IMG-08). */
export const IMAGE_FILE_RE = /^\d+-[0-9a-f]{8}(?:-thumb)?\.webp$/u;
