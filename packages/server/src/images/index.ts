import type { Db } from '../db/open.js';
import { ImageCollector } from './collector.js';
import { createHttp, type Http } from './http.js';
import { AsiaProvider } from './asia.js';
import { KoreanProvider, LimitlessJpProvider } from './direct-url.js';
import { PokemonTcgProvider } from './pokemontcg.js';
import { ImageResolver } from './resolver.js';
import { TcgdexProvider } from './tcgdex.js';
import type { ImageProvider } from './types.js';

export { ImageCollector } from './collector.js';
export { IMAGE_FILE_RE } from './store.js';

export interface CollectorFactoryOptions {
  db: Db;
  imagesDir: string;
  http?: Http;
  providers?: ImageProvider[];
  log?: (msg: string, extra?: object) => void;
  tickMs?: number;
}

/** A valódi forrásokra (TCGdex, ázsiai és koreai hivatalos adatbázis, Limitless, Pokémon TCG API, forrásoldal) kötött képgyűjtő. */
export function createImageCollector(o: CollectorFactoryOptions): ImageCollector {
  const http = o.http ?? createHttp();
  const providers = o.providers ?? [
    new TcgdexProvider(http),
    new AsiaProvider(http),
    new KoreanProvider(),
    new LimitlessJpProvider(),
    new PokemonTcgProvider(http),
  ];
  const resolver = new ImageResolver({
    http,
    providers,
    allLanguageCodes: () =>
      (
        o.db
          .prepare(
            'SELECT image_code FROM language WHERE image_code IS NOT NULL ORDER BY sort_order',
          )
          .all() as { image_code: string }[]
      ).map((r) => r.image_code),
    log: o.log,
  });
  return new ImageCollector({
    db: o.db,
    imagesDir: o.imagesDir,
    resolver,
    log: o.log,
    tickMs: o.tickMs,
  });
}
