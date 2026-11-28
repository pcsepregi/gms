import type { Db } from '../db/open.js';
import type { ImageStatusCounts } from '@gms/shared';
import type { ImageResolver } from './resolver.js';
import { removeImageFiles, storeImage } from './store.js';

interface PendingRow {
  id: number;
  pokemon: string;
  set_name: string;
  set_code: string | null;
  card_number: string;
  note: string;
  updated_at: string;
  image_file: string | null;
  image_code: string | null;
}

export interface CollectorOptions {
  db: Db;
  imagesDir: string;
  resolver: ImageResolver;
  /** Mennyi idő után próbáljuk újra az `error` állapotú kártyákat (alap: 1 nap). */
  retryErrorsAfterMs?: number;
  /** Milyen időközönként nézi meg újra a függő kártyákat (import vagy újraindítás után). */
  tickMs?: number;
  log?: (msg: string, extra?: object) => void;
  now?: () => Date;
}

/**
 * Háttérsor a képekhez (technikai spec 7.1): a `pending` állapotú kártyákat egyesével
 * dolgozza fel. A sor az adatbázisban él, ezért újraindítás után is folytatódik.
 */
export class ImageCollector {
  private running: Promise<void> | null = null;
  private timer: NodeJS.Timeout | null = null;
  private stopped = false;
  private readonly now: () => Date;

  constructor(private readonly o: CollectorOptions) {
    this.now = o.now ?? (() => new Date());
  }

  start(): void {
    this.stopped = false;
    this.tick();
    this.timer = setInterval(() => this.tick(), this.o.tickMs ?? 60_000);
    this.timer.unref();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    await this.running;
  }

  /** A régi `error` tételek újra sorba állítása, majd a feldolgozás indítása. */
  private tick(): void {
    const cutoff = new Date(
      this.now().getTime() - (this.o.retryErrorsAfterMs ?? 24 * 60 * 60 * 1000),
    ).toISOString();
    this.o.db
      .prepare(
        `UPDATE card SET image_status = 'pending'
         WHERE image_status = 'error' AND (image_checked_at IS NULL OR image_checked_at < ?)`,
      )
      .run(cutoff);
    this.kick();
  }

  /** Elindítja a feldolgozást, ha még nem fut. Azonnal visszatér. */
  kick(): void {
    if (this.stopped || this.running) return;
    this.running = this.drain().finally(() => {
      this.running = null;
    });
  }

  /** Megvárja, amíg a sor kiürül (tesztekhez). */
  async idle(): Promise<void> {
    this.kick();
    while (this.running) await this.running;
  }

  /** Kézi újrakeresés (S-43). `false`, ha nincs ilyen kártya. */
  requestRefresh(id: number): boolean {
    const res = this.o.db.prepare(`UPDATE card SET image_status = 'pending' WHERE id = ?`).run(id);
    if (res.changes > 0) this.kick();
    return res.changes > 0;
  }

  counts(): ImageStatusCounts {
    const rows = this.o.db
      .prepare('SELECT image_status AS s, COUNT(*) AS n FROM card GROUP BY image_status')
      .all() as { s: keyof ImageStatusCounts; n: number }[];
    const out: ImageStatusCounts = {
      total: 0,
      pending: 0,
      exact: 0,
      fallback: 0,
      none: 0,
      error: 0,
    };
    for (const r of rows) {
      out[r.s] = r.n;
      out.total += r.n;
    }
    return out;
  }

  private next(): PendingRow | undefined {
    return this.o.db
      .prepare(
        `SELECT c.id, c.pokemon, c.set_name, c.set_code, c.card_number, c.note, c.updated_at,
                c.image_file, l.image_code
         FROM card c JOIN language l ON l.id = c.language_id
         WHERE c.image_status = 'pending' ORDER BY c.id LIMIT 1`,
      )
      .get() as PendingRow | undefined;
  }

  private async drain(): Promise<void> {
    for (let row = this.next(); row && !this.stopped; row = this.next()) {
      await this.process(row);
    }
  }

  private async process(row: PendingRow): Promise<void> {
    const { db, imagesDir } = this.o;
    let status: 'exact' | 'fallback' | 'none' | 'error' = 'error';
    let file: string | null = null;
    let langId: number | null = null;
    let source: string | null = null;
    try {
      const res = await this.o.resolver.resolve({
        id: row.id,
        pokemon: row.pokemon,
        setName: row.set_name,
        setCode: row.set_code,
        cardNumber: row.card_number,
        note: row.note,
        languageCode: row.image_code,
      });
      if (res.kind === 'found') {
        file = await storeImage(imagesDir, row.id, res.bytes);
        if (file) {
          status = res.exact ? 'exact' : 'fallback';
          source = res.source;
          if (!res.exact && res.languageCode) {
            langId =
              (
                db.prepare('SELECT id FROM language WHERE image_code = ?').get(res.languageCode) as
                  { id: number } | undefined
              )?.id ?? null;
          }
        }
      } else if (res.kind === 'none') {
        status = 'none';
      } else {
        this.o.log?.('képkeresés hiba', { cardId: row.id, error: res.message });
      }
    } catch (err) {
      this.o.log?.('képkeresés váratlan hiba', { cardId: row.id, error: (err as Error).message });
    }

    // Hálózati vagy forráshiba esetén a meglévő kép (kézi újrakeresésnél) megmarad.
    const keepOld = status === 'error' && row.image_file !== null;
    const res = db
      .prepare(
        `UPDATE card SET image_status = @status, image_checked_at = @ts,
                image_file = CASE WHEN @keep = 1 THEN image_file ELSE @file END,
                image_lang_id = CASE WHEN @keep = 1 THEN image_lang_id ELSE @langId END,
                image_source = CASE WHEN @keep = 1 THEN image_source ELSE @source END
         WHERE id = @id AND image_status = 'pending' AND updated_at = @updatedAt`,
      )
      .run({
        id: row.id,
        updatedAt: row.updated_at,
        status,
        ts: this.now().toISOString(),
        keep: keepOld ? 1 : 0,
        file,
        langId,
        source,
      });
    if (res.changes === 0) {
      // A kártyát közben törölték vagy módosították: az új fájl árva, a sor újra feldolgozandó.
      if (file) removeImageFiles(imagesDir, file);
    } else if (!keepOld && row.image_file && row.image_file !== file) {
      removeImageFiles(imagesDir, row.image_file);
    }
  }
}
