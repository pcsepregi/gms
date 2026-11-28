/** Egy kártya, amelyhez képet keresünk (a képkeresés szempontjából lényeges mezők). */
export interface ImageQuery {
  id: number;
  pokemon: string;
  setName: string;
  setCode: string | null;
  cardNumber: string;
  note: string;
  /** A kártya nyelvének képforrás-kódja (pl. `de`), ha van. */
  languageCode: string | null;
}

/** Egy képforrás találata. Az `url` közvetlenül letölthető képfájl. */
export interface ImageHit {
  url: string;
  /** Honnan jött (naplózáshoz és a `image_source` mezőhöz). */
  source: string;
}

/**
 * Cserélhető képforrás (technikai spec 7.2). A `null` azt jelenti: a forrásban nincs ilyen
 * lap; a hálózati vagy forráshiba kivétel (a kártya `error` állapotba kerül).
 */
export interface ImageProvider {
  readonly name: string;
  /** Az adott nyelvű (képkódú) lap képe, vagy `null`. */
  findImage(card: ImageQuery, languageCode: string): Promise<ImageHit | null>;
}
