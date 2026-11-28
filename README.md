# gms

Lechonk & Oinkologne Grand Master Set gyűjteménykezelő webapp (helyben fut, Pali MacBookján).

## Dokumentáció

- [Üzleti igény](docs/business-requirements.md)
- [Technikai specifikáció](docs/technical-spec.md)
- [User storyk](docs/user-stories.md)
- [Tesztspecifikáció](docs/test-spec.md)
- [Telepítés a Macre](docs/install-mac.md)
- [Üzemeltetés](docs/operations.md)

## Telepítés a Macre

```sh
git clone https://github.com/pcsepregi/gms.git ~/Applications/gms
~/Applications/gms/scripts/install.sh
```

A telepítő mindent elvégez (Node 22, build, import, OneDrive mentés, automatikus indítás
LaunchAgenttel). Állapot: `npm run health`, frissítés: `scripts/update.sh`, eltávolítás:
`scripts/uninstall.sh`. Részletek: [docs/install-mac.md](docs/install-mac.md).

## Fejlesztés

Node.js 22 kell (`.nvmrc`).

```sh
npm install
npm run build          # shared → server → web
npm test               # egység- és API-tesztek lefedettséggel (minden csomag)
npm run lint           # ESLint, Prettier, forrásellenőrzések
npm run typecheck
npm run e2e            # Playwright (előtte: npm run build)
```

Szerver indítása (a lefordított kóddal): `npm start`, majd <http://127.0.0.1:4747>.
Fejlesztői mód: `npm run dev` (szerver, újraindul módosításkor) és `npm run dev -w @gms/web` (felület, Vite).

Az adatmappa alapból `~/Library/Application Support/GMS` (macOS), más rendszeren
`~/.local/share/gms`; a `GMS_DATA_DIR` környezeti változóval vagy a `--data-dir`
kapcsolóval felülírható. Beállítások: `<adatmappa>/config.json` (`port`, `backupDir`, `appTitle`).

### Egyszeri Excel import

```sh
npm run build
npm run import -- --file ~/Downloads/LECHONK_OINKOLOGNE_MASTER_DATABASE_FINAL_MASTER.xlsx
```

Csak üres adatbázisba tölt (az app a master). Bármilyen hibás sor esetén egyetlen
kártya sem kerül be, és a hibaüzenet megnevezi a sort. Az összesítő a konzolon és a
Beállítások oldalon látszik.

### Tesztadatok

A `fixtures/` mappában **szintetikus** Excel fájlok vannak (nem a valódi gyűjtemény),
újragenerálás: `npm run fixtures`. A valódi Excel, az adatbázis és a képek soha nem
kerülnek a repóba.

### Felépítés

- `packages/shared` – közös típusok, Zod sémák, természetes kulcs és azonosító-generálás
- `packages/server` – Fastify API, SQLite (`migrations/`), Excel import
- `packages/web` – React felület
- `e2e/` – Playwright tesztek
