/** A felület összes szövege (technikai spec 8.5). */
export const hu = {
  /** Tartalék cím, amíg a szerver nem adja meg a config.json szerintit. */
  appTitle: 'GMS',
  nav: {
    home: 'Áttekintés',
    settings: 'Beállítások',
  },
  common: {
    loading: 'Betöltés…',
    loadError: 'Az adatok nem tölthetők be.',
  },
  home: {
    heading: 'Áttekintés',
    progress: (owned: number, all: number) => `${owned} / ${all} kártya megvan`,
    empty: 'Még nincs kártya az adatbázisban. Az első lépés az Excel importálása.',
    comingSoon: 'A kártyalista és a dashboard a következő mérföldkövekben készül el.',
  },
  settings: {
    heading: 'Beállítások',
    importHeading: 'Import összesítő',
    notImported: 'Még nem volt import.',
    importedAt: 'Importálva',
    sourceFile: 'Forrásfájl',
    total: 'Kártyák',
    owned: 'Megvan',
    missing: 'Hiányzik',
    needsCheck: 'Ellenőrizendő',
    byLanguage: 'Nyelvenként',
    language: 'Nyelv',
    ownedOfAll: 'Megvan / összes',
    finishesFromDictionary: 'Nyomási változatok a szótárból',
    newFinishes: 'Új nyomási változatok (leírás nélkül)',
    none: 'nincs',
    warnings: 'Figyelmeztetések',
    version: 'Verzió',
  },
} as const;
