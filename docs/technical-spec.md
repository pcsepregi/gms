# GMS – Technikai specifikáció

| | |
|---|---|
| Tulajdonos | Pali |
| Verzió | 1.0 (első változat) |
| Dátum | 2026-11-27 |
| Alapja | [Üzleti igény](business-requirements.md) (K-01…K-10) |
| Kapcsolódó | [User storyk](user-stories.md), [Tesztspecifikáció](test-spec.md) |
| Állapot | Jóváhagyásra vár |

---

## 1. Összefoglaló

A GMS egy **helyben futó webapp** Pali MacBookján. Egyetlen Node.js folyamat szolgálja ki a böngészős felületet és egy REST API-t, az adatok egy **SQLite** fájlban vannak. A folyamatot a macOS **launchd** indítja bejelentkezéskor és újraindítja, ha leállna. Az app csak a `127.0.0.1` címen hallgat, így más gépről nem érhető el.

```
 Böngésző (Safari/Chrome a Macen)
        │  http://127.0.0.1:4747
        ▼
 ┌──────────────────────────────────────────┐
 │ GMS szerver (Node.js, Fastify)           │
 │  ├─ statikus frontend (React build)      │
 │  ├─ REST API  /api/...                   │
 │  ├─ képgyűjtő (háttérsor)                │
 │  └─ ütemező (napi mentés)                │
 └───────┬───────────────┬──────────────────┘
         │               │
         ▼               ▼
  ~/Library/Application   ~/Library/CloudStorage/
  Support/GMS/            OneDrive-…/GMS/
  ├─ gms.sqlite           ├─ backups/gms-ÉÉÉÉ-HH-NN.sqlite
  └─ images/              └─ images/ (tükör)
```

## 2. Technológiai döntések

| Terület | Választás | Indok |
|---|---|---|
| Nyelv | TypeScript (szerver és kliens) | Egy nyelv mindenhol, típusos közös modell |
| Futtatókörnyezet | Node.js 22 LTS (Homebrew-ból) | Stabil, Macen egyszerűen telepíthető |
| Szerver | Fastify 5 | Gyors, kicsi, jó tesztelhetőség (`inject`) |
| Adatbázis | SQLite (`better-sqlite3`), WAL mód | Egy fájl, nincs külön szerver, könnyű menteni |
| Séma / migráció | Saját, sorszámozott SQL migrációs fájlok | ~5 tábla, nem kell ORM |
| Validáció | Zod (közös séma szerver és kliens között) | Egy helyen definiált mezőszabályok |
| Frontend | React 19 + Vite, React Router | Bevált, gyors fejlesztés |
| Állapot | TanStack Query (szerverállapot) | Cache, optimista frissítés a jelöléshez |
| Stílus | Saját CSS (CSS változók, CSS modulok), nincs UI keretrendszer | A "nem AI-szagú" egyedi kinézethez |
| Grafikonok | Saját, egyszerű SVG komponensek | Kevés grafikontípus kell, teljes kontroll a kinézet felett |
| Excel olvasás/írás | `exceljs` | Import és export ugyanazzal |
| Képfeldolgozás | `sharp` (WebP, átméretezés) | Kis méret, gyors betöltés |
| Tesztek | Vitest, Fastify `inject`, Playwright | Lásd [Tesztspecifikáció](test-spec.md) |
| Csomagkezelő | npm workspaces | Egyszerű, nincs plusz eszköz |

## 3. Repo felépítése

```
gms/
├─ docs/                      dokumentáció (üzleti igény, spec, storyk, tesztek, üzemeltetés)
├─ packages/
│  ├─ shared/                 közös típusok, Zod sémák, kulcsgenerálás, szűrőlogika
│  ├─ server/                 Fastify app, adatbázis, import, képgyűjtő, mentés, export
│  │  ├─ src/
│  │  ├─ migrations/          001_init.sql, 002_...sql
│  │  └─ test/
│  └─ web/                    React frontend
│     ├─ src/
│     └─ test/
├─ e2e/                       Playwright tesztek
├─ scripts/
│  ├─ install.sh              telepítés a Macre (függőségek, build, launchd)
│  ├─ update.sh               frissítés (git pull, build, újraindítás)
│  ├─ uninstall.sh
│  ├─ lib.sh                  közös függvények a fenti szkripteknek
│  ├─ smoke-install.sh        telepítési füstteszt a CI-hoz (T-INS-*)
│  └─ local.gms.server.plist.tmpl  launchd sablon
├─ fixtures/                  szintetikus teszt Excel (NEM Pali valódi fájlja)
└─ .github/workflows/ci.yml   lint, típusellenőrzés, tesztek PR-eken
```

**Fontos:** a repó nyilvános. Pali valódi Excel fájlja, az adatbázis és a letöltött képek **nem kerülnek a repóba**. A teszteléshez szintetikus, azonos szerkezetű fixture készül (`fixtures/sample-master.xlsx`).

## 4. Adatmodell

### 4.1 Táblák

```sql
-- Nyelvek: a felületen magyar név, a képkereséshez forrás-kód.
CREATE TABLE language (
  id          INTEGER PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,      -- importált érték, pl. 'German'
  name_hu     TEXT NOT NULL,             -- 'Német'
  short_code  TEXT NOT NULL UNIQUE,      -- 'DE' (azonosítóhoz, címkéhez)
  image_code  TEXT,                      -- képforrás nyelvkódja, pl. 'de', 'zh-tw'; NULL ha nincs
  sort_order  INTEGER NOT NULL
);

-- Nyomási változatok (variáns-szótár).
CREATE TABLE finish (
  id          INTEGER PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,      -- 'Reverse Holo'
  description TEXT,                      -- 'Reverse foil printing.'
  sort_order  INTEGER NOT NULL
);

CREATE TABLE card (
  id             INTEGER PRIMARY KEY,
  owned          INTEGER NOT NULL DEFAULT 0 CHECK (owned IN (0,1)),
  pokemon        TEXT NOT NULL,          -- 'Lechonk', 'Oinkologne ex', később bármi
  set_name       TEXT NOT NULL,          -- 'Scarlet & Violet'
  set_code       TEXT,                   -- 'SVI'
  card_number    TEXT NOT NULL,          -- '154/198'
  finish_id      INTEGER NOT NULL REFERENCES finish(id),
  language_id    INTEGER NOT NULL REFERENCES language(id),
  note           TEXT NOT NULL DEFAULT '',
  display_id     TEXT NOT NULL,          -- generált azonosító, lásd 4.2
  -- kép
  image_file     TEXT,                   -- relatív út az images/ mappán belül
  image_status   TEXT NOT NULL DEFAULT 'pending'
                 CHECK (image_status IN ('pending','exact','fallback','none','error')),
  image_lang_id  INTEGER REFERENCES language(id), -- fallback esetén a kép nyelve
  image_source   TEXT,                   -- honnan jött (URL)
  image_checked_at TEXT,
  -- technikai időbélyegek (a felületen nem szerkeszthetők)
  owned_changed_at TEXT,                 -- "legutóbb megszerzett" listához
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL,
  -- természetes kulcs (üzleti igény 5. fejezet), kis-/nagybetű és szóköz normalizálva
  natural_key    TEXT NOT NULL UNIQUE
);

CREATE INDEX card_language ON card(language_id);
CREATE INDEX card_pokemon  ON card(pokemon);
CREATE INDEX card_set      ON card(set_name);

CREATE TABLE app_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
-- pl. schema_version, imported_at, import_summary (JSON), last_backup_at, last_backup_status

CREATE TABLE backup_log (
  id INTEGER PRIMARY KEY, started_at TEXT NOT NULL, finished_at TEXT,
  status TEXT NOT NULL CHECK (status IN ('ok','error')), target TEXT, message TEXT
);
```

Döntések:

- **A Pokémon és a set szabad szöveg**, nem külön tábla. Így új Pokémon (K-10) vagy új set felvétele nem igényel külön adminisztrációt; a felajánlott értékek a meglévő sorokból (`SELECT DISTINCT`) jönnek. A nyelv és a finish azért tábla, mert extra adatuk van (magyar név, képkód, leírás).
- **Új nyelv** is felvehető az űrlapon. Ekkor a magyar név megegyezik a megadottal, `image_code` üres (csak fallback kép kereshető hozzá), és később szerkeszthető.
- **Időpontok** ISO 8601 UTC szövegként tárolódnak. A felhasználó nem lát és nem ad meg dátumot (üzleti igény: nincs dátummező); az `owned_changed_at` csak a "legutóbb megszerzett" listához kell.

### 4.2 Azonosítók

- Belső azonosító: `card.id` (egész szám). Az URL-ekben és az API-ban ez szerepel.
- Megjelenített azonosító (`display_id`): `{NYELVKÓD}-{Pokémon}-{kártyaszám}-{finish}`, szóköz helyett `_`, pl. `EN-Lechonk-154/198-Reverse_Holo`. Ha két sor azonosítója egyezne (ugyanaz a szám és finish más setben), `-{setkód}` utótag kerül rá. Mezőváltozáskor újragenerálódik.
- Az Excel `Master ID` oszlopát **nem vesszük át**: 11 sorban üres, és 9 érték többször is előfordul, ezért nem alkalmas kulcsnak. Az eredeti értéket a megjegyzés sem kapja meg, mert a mezőkből bármikor újraképezhető.
- Duplikátumvizsgálat (`natural_key`): `lower(trim(pokemon)) | lower(trim(set_name)) | lower(trim(card_number)) | finish_id | language_id`. Az adatbázis `UNIQUE` megkötéssel is védi; az API ilyenkor `409`-et ad a meglévő kártya azonosítójával. A jelenlegi 376 sorban nincs ütközés (ellenőrizve).

### 4.3 Kezdeti nyelvtábla

| name (Excel) | name_hu | short_code | image_code |
|---|---|---|---|
| English | Angol | EN | en |
| French | Francia | FR | fr |
| German | Német | DE | de |
| Italian | Olasz | IT | it |
| Spanish | Spanyol | ES | es |
| Spanish (LATAM) | Spanyol (latin-amerikai) | LA | es-mx |
| Portuguese | Portugál | PT | pt |
| Japanese | Japán | JA | ja |
| Korean | Koreai | KO | ko |
| Simplified Chinese | Egyszerűsített kínai | ZHS | zh-cn |
| Traditional Chinese | Hagyományos kínai | ZHT | zh-tw |
| Thai | Thai | TH | th |
| Indonesian | Indonéz | ID | id |

A sorrend a fenti (ez a szűrőkben és a dashboardon is). Az `image_code` értékeket a képgyűjtő megvalósításakor a tényleges forráshoz kell igazítani (lásd 7.).

## 5. Adatmigráció (K-01)

Egyszeri parancs, a telepítő futtatja:

```
npm run import -- --file ~/Downloads/LECHONK_OINKOLOGNE_MASTER_DATABASE_FINAL_MASTER.xlsx
```

Lépések:

1. Ha az adatbázisban már van kártya, a parancs megáll (`--force` kapcsolóval sem töröl: előtte automatikus mentést készít, és csak üres adatbázisba tölt). Az app a master, az Excelt nem lehet "ráimportálni".
2. **VARIANT DICTIONARY** lap → `finish` tábla (név + leírás, a lap sorrendjében).
3. **MASTER SET** lap: a fejlécsort a `Have?` cella alapján keresi meg (jelenleg a 4. sor), az üres sorokat kihagyja.
4. Minden finish érték, ami a MASTER SET-ben szerepel, de a szótárban nincs (pl. `Holo`, `Promo`, `Stamped – Best Buy (Reverse Holo)`), leírás nélkül bekerül a `finish` táblába. Jelenleg 29 különböző érték van a lapon, a szótárban 16.
5. Oszlopleképezés:

| Excel | GMS | Szabály |
|---|---|---|
| Have? | owned | `YES`/`yes` (kis-/nagybetűtől függetlenül, szóköz levágva) → 1, minden más → 0 |
| Qty | – | Eldobva |
| Pokémon | pokemon | Változatlanul (`Oinkologne ex` külön értékként marad) |
| Set / Product | set_name | Változatlanul |
| Set Code | set_code | Üres → NULL |
| Card No. | card_number | Szövegként (számként tárolt cella is szöveg lesz, vezető nullákkal) |
| Printing / Finish | finish_id | Név alapján |
| Language | language_id | Név alapján a 4.3 táblából; ismeretlen név → hiba, az import megáll |
| Region | – | Eldobva |
| Status | note | `CHECK` → a megjegyzés első sora: `Ellenőrizendő.` |
| Master ID | – | Eldobva (lásd 4.2) |
| Source / Link | note | Ha van, a megjegyzés utolsó sora: `Forrás: <link>` |
| Notes | note | A megjegyzés törzse |

   A megjegyzés összeállítása: `[Ellenőrizendő.]` + `Notes` + `[Forrás: link]`, üres sorral elválasztva, a hiányzó részek kimaradnak.
6. Minden sor egy tranzakcióban kerül be; bármilyen hiba esetén semmi sem íródik.
7. **Összesítő** (konzolra és `app_meta.import_summary`-be): sorok száma, ebből megvan / hiányzik, nyelvenkénti bontás, új finish értékek listája, figyelmeztetések. Elvárt értékek a jelenlegi fájlra: **376 sor, 210 megvan** (205 `YES` + 5 `yes`), **166 hiányzik**. A felületen a Beállítások oldalon is megtekinthető.
8. Az import végén a képgyűjtő sorba állítja az összes kártyát (7. fejezet).

## 6. REST API

Minden végpont JSON-t ad és vár. Hibaformátum: `{ "error": { "code": "DUPLICATE", "message": "…magyar szöveg…", "details": {…} } }`.

| Metódus | Út | Leírás |
|---|---|---|
| GET | `/api/cards` | Az összes kártya (≈400 sor, egyben, lapozás nélkül; a szűrés a kliensen fut) |
| GET | `/api/cards/:id` | Egy kártya |
| POST | `/api/cards` | Új kártya. `201`, vagy `409 DUPLICATE` a meglévő `id`-vel, `400 VALIDATION` |
| PATCH | `/api/cards/:id` | Mezők módosítása (részleges). Duplikátumra `409` |
| PUT | `/api/cards/:id/owned` | `{ "owned": true }` – jelölés, idempotens |
| DELETE | `/api/cards/:id` | Törlés (a kép fájl is törlődik) |
| POST | `/api/cards/:id/image/refresh` | Kép újrakeresése (sorba állítja) |
| GET | `/api/images/:file` | Képfájl kiszolgálása (hosszú cache) |
| GET | `/api/lookups` | Nyelvek, finish-ek, meglévő Pokémon- és setnevek (setkóddal) az űrlap javaslataihoz |
| POST | `/api/finishes` | Új finish (névvel, opcionális leírással) |
| PATCH | `/api/finishes/:id` | Finish leírásának módosítása |
| POST | `/api/languages` | Új nyelv |
| GET | `/api/stats` | Dashboard statisztikák (8.2) |
| GET | `/api/export?format=xlsx\|csv&ids=…` | Export; `ids` nélkül a teljes gyűjtemény (10.) |
| GET | `/api/backup/status` | Utolsó mentés ideje, állapota, cél mappa |
| POST | `/api/backup/run` | Azonnali mentés |
| GET | `/api/import/summary` | Az import összesítője (`app_meta.import_summary`); `404 NOT_IMPORTED`, ha még nem volt import |
| GET | `/api/health` | `{ ok, version, dbPath, appTitle }` |

Az `/api/cards` válaszában minden kártyánál ott van a `display_id`, a nyelv és a finish neve (join), valamint a kép URL-je és állapota, hogy a kliensnek ne kelljen külön feloldania.

**Érvényesítés (Zod, közös a klienssel):** pokemon, set_name, card_number kötelező, max. 100 karakter, levágott szóközökkel; set_code max. 20; note max. 5000; finish_id és language_id létező rekordra mutasson.

**Biztonság:** a szerver csak `127.0.0.1`-en hallgat. DNS-rebinding ellen minden kérésnél ellenőrzi, hogy a `Host` fejléc `127.0.0.1:4747` vagy `localhost:4747`; más esetben `403`. A módosító kéréseknél az `Origin` fejléc is csak ez a kettő lehet. Nincs bejelentkezés (egy felhasználó, egy gép).

## 7. Kártyaképek (K-07)

### 7.1 Folyamat

A képgyűjtő a szerveren belüli **háttérsor**: egyszerre egy kérés fut, kérések között 1 másodperc szünet, hogy a forrásokat ne terheljük. Sorba kerül egy kártya, ha `image_status = 'pending'` (import, új kártya, a képet befolyásoló mező módosítása: Pokémon, set, kártyaszám, finish, nyelv), vagy kézi újrakeresés történik. Induláskor a függő tételek újra sorba állnak. A `error` állapotú tételeket naponta egyszer újrapróbálja (hálózati hiba esetén).

Keresési sorrend egy kártyára:

1. **Pontos találat**: ugyanaz a set + kártyaszám a kártya saját nyelvén a nyelvspecifikus forrásokból → `exact`.
2. **Forrásoldal képe**: ha a megjegyzésben van `Forrás:` link, és az oldal `og:image` képe kártyakép (képarány ≈ 0,72, legalább 400 px magas) → `exact`.
3. **Más nyelvű tartalék**: ugyanaz a lap (set + kártyaszám) angolul, majd japánul, majd bármely más elérhető nyelven → `fallback`, `image_lang_id` kitöltve. A felületen jelvény mutatja: "Kép: angol".
4. Ha semmi → `none`, egységes helykitöltő (sematikus kártyakeret a Pokémon nevével és a kártyaszámmal).

A finish pontos képe a forrásoknál ritkán érhető el (a reverse holo és a normál lap képe általában azonos). Ezért a finish nem része a képegyezésnek; a pontosság a lapon, a seten és a nyelven múlik. Ez az üzleti igény "lehető legpontosabb" szintjének felel meg.

### 7.2 Források

A forrásokat egy közös `ImageProvider` interfész mögé tesszük (`findImage(card) → { url, lang, exact } | null`), hogy cserélhetők legyenek, és a tesztekben álforrás állhasson a helyükön. Tervezett források:

| Forrás | Nyelvek | Megjegyzés |
|---|---|---|
| TCGdex API (`api.tcgdex.net`) | sok nyelv, köztük ázsiaiak | Elsődleges, nyílt API, nyelvenkénti képekkel |
| Pokémon TCG API (`pokemontcg.io`) | angol | Nagy felbontású angol képek, megbízható tartalék |
| A kártya `Forrás:` linkje | változó | `og:image` alapján; csak ha a kép kártyának tűnik |

**Set-leképezés:** a forrásoknak saját set-azonosítóik vannak (pl. TCGdex `sv01`, angol setkód `SVI`, japán `SV1S`). A szerver egy karbantartható leképező táblát kap (`packages/server/src/images/set-map.ts`: setkód/setnév → forrás set-azonosító nyelvenként). Ami nincs benne, ahhoz név alapján keres. Az első megvalósítási lépés egy **felderítés (spike)**: a 31 setkódra kitölteni a táblát, és megmérni, hány kártyához lesz pontos kép. Az eredmény bekerül az üzemeltetési dokumentációba.

### 7.3 Tárolás

- `~/Library/Application Support/GMS/images/{card.id}-{rövid hash}.webp`, legfeljebb 734×1024 px, WebP 85% minőség (≈60–120 KB/kép, a teljes gyűjtemény kb. 50 MB).
- Rácsnézethez 320 px széles bélyegkép is készül (`…-thumb.webp`).
- A kiszolgálás `Cache-Control: max-age=31536000, immutable`, a hash miatt új kép esetén új URL.
- A képek letöltése után az app internet nélkül is teljesen működik (7.3 nem funkcionális igény).

## 8. Frontend

### 8.1 Oldalak és útvonalak

| Útvonal | Oldal |
|---|---|
| `/` | Dashboard |
| `/kartyak` | Kártyalista; a szűrők az URL-ben (`?nyelv=DE,FR&allapot=hianyzik&q=…`) |
| `/kartyak/:id` | Kártya részletei (oldalpanel a lista fölött; közvetlenül is megnyitható) |
| `/kartyak/uj` | Új kártya |
| `/beallitasok` | Mentés állapota, kézi mentés, import összesítő, finish-szótár, verzió |

A szűrők URL-ben tárolása miatt a dashboard bármely eleméből egy linkkel lehet a szűrt listára ugrani (K-02), és a böngésző vissza gombja is működik.

### 8.2 Dashboard (K-02)

A `/api/stats` egy lekérdezésben adja vissza:

```ts
{
  total: { owned: number, all: number },
  byLanguage: Group[], byPokemon: Group[], bySet: Group[], byFinish: Group[],
  closest: Group[],          // a nem teljes csoportok (nyelv, set), ahol a legkevesebb lap hiányzik; max. 6
  recent: CardSummary[]      // utolsó 8 "megvan"-ra állított lap, owned_changed_at szerint
}
type Group = { key: string, label: string, owned: number, all: number }
```

Elrendezés (asztali szélességen, fentről lefelé):

1. **Fő szám**: nagy tipográfiájú "210 / 376" és százalék, mellette vékony, egyszínű haladásjelző. Nincs színátmenet, nincs animált számláló.
2. **Nyelvek**: 13 vízszintes sáv (név, `megvan/összes`, százalék). Kattintásra a nyelv hiányzó lapjaira szűrt lista.
3. **Majdnem kész**: kis kártyák "Német – még 2 lap" stílusban, kattintásra a hiányzó lapok.
4. **Pokémonok** és **Nyomási változatok**: két oszlopban, kompakt sávokkal.
5. **Setek**: táblázatszerű lista, alapból a hiányzók száma szerint rendezve, összecsukható (56 set).
6. **Legutóbb megszerzett**: a lapok bélyegképei egy sorban.

A sávdiagramok saját SVG/CSS komponensek; egy kiemelőszín a "megvan" részhez, semleges szürke a hiányzóhoz.

### 8.3 Kártyalista (K-03, K-04, K-05)

- **Nézetek:** rács (képes kártyák, alapértelmezett) és sűrű táblázat. A választás a böngészőben megmarad (`localStorage`).
- **Hiányzó lapok** a rácsban szürkeárnyalatosak, 50%-os átlátszósággal, és "Hiányzik" címkét kapnak; a megvan lapok teljes színesek. A táblázatban az első oszlop egy jelölőnégyzet.
- **Jelölés:** a rácsban a kártyán lévő gomb, a táblázatban a jelölőnégyzet, a részletek panelen kapcsoló. Optimista frissítés: azonnal átvált, a szerverhiba esetén visszaáll és hibaüzenetet ad. 5 másodpercig "Visszavonás" lehetőség jelenik meg egy alsó értesítésben.
- **Keresés:** egy mező a lista tetején, `/` billentyűre fókuszál. Gépelés közben (60 ms késleltetéssel) szűr. A keresés a kártya összes szöveges mezőjére (Pokémon, set, setkód, kártyaszám, finish, nyelv magyarul és angolul, megjegyzés, azonosító) kiterjed. Normalizálás: kis-/nagybetű, ékezetek (`német` = `nemet`), és a kártyaszámnál a vezető nullák (`7` megtalálja a `007/SV-P`-t). Több szó esetén mindegyiknek egyeznie kell (ÉS).
- **Szűrők:** Pokémon (több választható), nyelv (több), set (kereshető lista, több), finish (több), állapot (mind / megvan / hiányzik), képállapot (csak tartalék / nincs kép, a karbantartáshoz). Az aktív szűrők a keresőmező alatt címkékként (chip) látszanak, egyenként és együtt is törölhetők.
- **Rendezés:** set, kártyaszám (számszerűen, a `/` előtti rész szerint), nyelv (a 4.3 sorrend szerint), Pokémon, utoljára módosítva.
- **Teljesítmény:** a teljes lista a kliensen van (≈400 sor), a szűrés és rendezés memóriában fut, egy körben < 5 ms. A rácsban a képek `loading="lazy"`-vel töltődnek; 2000 sor felett virtualizált lista kapcsol be (a jövőbeli bővítéshez).
- A találatok száma mindig látszik ("42 kártya, ebből 30 hiányzik"), mellette az **Export** gomb a szűrt listára.

### 8.4 Kártya űrlap (K-06)

- Mezők: Pokémon, set, setkód, kártyaszám, finish, nyelv, megvan, megjegyzés.
- Pokémon, set, finish, nyelv: kombinált mező (gépelhető, a meglévő értékeket felajánlja, új érték is megadható). Set választásakor a setkód automatikusan kitöltődik, ha az adott sethez egyértelmű.
- Duplikátum: gépelés közben a kliens jelzi ("Ez a kártya már szerepel: …", linkkel), a mentést a szerver is ellenőrzi.
- Törlés: a részletek panelen, megerősítő ablakkal ("Biztosan törlöd? A kártya és a képe törlődik."). Hard delete; a visszaállítás a napi mentésből lehetséges.
- Mentés után az új kártyára a képkeresés automatikusan elindul; a kép helyén "Kép keresése…" állapot látszik, majd a lista automatikusan frissül (a kliens 3 másodpercenként lekérdezi az adott kártyát, amíg `pending`).

### 8.5 Megjelenés (7.2 nem funkcionális igény)

- **Betűtípus:** a Mac rendszerbetűje (`-apple-system`, SF Pro), a számokhoz `font-variant-numeric: tabular-nums`. Nincs külső betöltés.
- **Színek:** semleges, meleg szürke alapok, egyetlen kiemelőszín (tompa, földes narancs, a Lechonk színvilágához igazodva). Minden szín CSS változó, két témával (`light`, `dark`).
- **Téma:** alapból `prefers-color-scheme` szerint; a fejlécben háromállású kapcsoló (Rendszer / Világos / Sötét), `localStorage`-ben tárolva.
- **Tiltólista** (a review során ellenőrizzük): színátmenetes háttér, üveghatás, neon árnyék, emoji a felületen, csillogó/forgó kártya-animáció, "✨" jellegű díszítés, túl lekerekített buborékok.
- **Szerkezet:** sűrű, tipográfiára épülő elrendezés, vékony elválasztók, 4 px-es térköz-rács, 6 px sarokkerekítés. Animáció csak állapotváltásnál (≤150 ms).
- **Akadálymentesség:** billentyűzettel teljesen kezelhető, látható fókusz, kontraszt legalább WCAG AA mindkét témában.
- A felület minden szövege magyar; a szövegek egy helyen (`packages/web/src/i18n/hu.ts`) vannak, de többnyelvűség nincs tervezve.

## 9. Futtatás a Macen (7.1 nem funkcionális igény)

### 9.1 Mappák

| Mi | Hol |
|---|---|
| Programkód | `~/Applications/gms` (a repó klónja) |
| Adatbázis | `~/Library/Application Support/GMS/gms.sqlite` |
| Képek | `~/Library/Application Support/GMS/images/` |
| Napló | `~/Library/Logs/GMS/gms.log` (naponta forgatva, 14 nap) |
| Beállítások | `~/Library/Application Support/GMS/config.json` (port, OneDrive mappa) |

### 9.2 Automatikus indítás

LaunchAgent: `~/Library/LaunchAgents/local.gms.server.plist`

- `RunAtLoad = true` (bejelentkezéskor indul), `KeepAlive = true` (leállás esetén a launchd újraindítja), `ThrottleInterval = 10`.
- `ProgramArguments`: a Homebrew Node teljes útja + `packages/server/dist/main.js`.
- `EnvironmentVariables`: `GMS_DATA_DIR` (adatmappa), `GMS_LOG_DIR` (a szerver ide írja a naponta forgatott naplót), `NODE_ENV=production`, és egy minimális `PATH` a Node mappájával.
- A plistet a `scripts/local.gms.server.plist.tmpl` sablonból a `npm run ops -- launch-agent` tölti ki (XML-escape-pel), a telepítő `plutil -lint`-tel ellenőrzi.
- A szerver a `127.0.0.1:4747` címen hallgat. Ha a port foglalt, a naplóba ír és kilép (a launchd 10 másodperc múlva újrapróbálja).
- A böngésző könyvjelzője: `http://127.0.0.1:4747`. A telepítő Safari-könyvjelzőt nem állít, de a végén megnyitja az oldalt.

### 9.3 Telepítés és frissítés

- `scripts/install.sh`: ellenőrzi / telepíti a Homebrew Node 22-t, `npm ci`, `npm run build`, létrehozza a mappákat, megkérdezi a OneDrive GMS mappát (alapérték az automatikusan megtalált `~/Library/CloudStorage/OneDrive-*/GMS`), lefuttatja az importot, telepíti és betölti a LaunchAgentet (`launchctl bootstrap gui/$UID …`), végül megnyitja a böngészőt.
- `scripts/update.sh`: `git pull` (main ág), `npm ci`, `npm run build`, adatbázis-migrációk, újraindítás (`launchctl kickstart -k gui/$UID/local.gms.server`). Frissítés előtt automatikus mentés.
- **Migrációk:** induláskor a szerver lefuttatja a még nem futott `migrations/*.sql` fájlokat egy tranzakcióban, előtte helyi másolatot készít az adatbázisról (`gms.sqlite.pre-migration-<verzió>`).

A telepítést és frissítést a projekt végzi a Macen (Remote Control munkamenetben), Palinak nem kell parancsot futtatnia.

## 10. Export (K-08)

- **Formátum:** XLSX (alapértelmezett) és CSV (UTF-8 BOM-mal, `;` elválasztóval, hogy a magyar Excel helyesen nyissa meg).
- **Oszlopok:** Megvan (`Igen`/`Nem`), Pokémon, Set, Set kód, Kártyaszám, Nyomási változat, Nyelv (magyarul), Megjegyzés, Azonosító.
- **Teljes export:** a Beállításokból és a lista Export gombjáról szűrés nélkül.
- **Szűrt export:** a kliens a látható kártyák azonosítóit küldi (`ids` paraméter, POST-tal ha hosszú), a szerver a megadott rendezéssel írja ki. Ez a "hiánylista egy kereskedőnek" eset.
- Fájlnév: `GMS-export-ÉÉÉÉ-HH-NN.xlsx`, szűrt esetben `GMS-hianylista-nemet-ÉÉÉÉ-HH-NN.xlsx` jellegű, a szűrőkből képezve.
- Az XLSX első sora rögzített fejléc, automatikus szűrővel, mint az eredeti Excelben.

## 11. Napi mentés OneDrive-ra (K-09)

- **Ütemezés:** a szerver óránként ellenőrzi, volt-e már aznap (helyi idő szerint) sikeres mentés. Ha nem, ment. Így akkor is lesz napi mentés, ha a Mac éjjel alszik vagy ki van kapcsolva. Induláskor is ellenőriz.
- **Tartalom:**
  - `GMS/backups/gms-ÉÉÉÉ-HH-NN.sqlite`: az adatbázis konzisztens másolata (SQLite online backup API, futás közben is biztonságos),
  - `GMS/backups/gms-ÉÉÉÉ-HH-NN.xlsx`: ember által olvasható export (ha minden más elveszne, ebből is helyreállítható),
  - `GMS/images/`: a képmappa tükre (csak az új vagy változott fájlok másolódnak, a törölt képek törlődnek).
- **Megőrzés:** az utolsó 30 napi mentés, azon túl havonta 1 (a hónap első mentése) 12 hónapig. A régebbieket az app törli.
- **Hibakezelés:** ha a OneDrive mappa nem érhető el vagy a másolás hibás, `backup_log`-ba és naplóba ír, és a felület fejlécében figyelmeztető sáv jelenik meg ("Az utolsó sikeres mentés: 3 napja. Részletek"), amíg egy mentés nem sikerül. 26 óránál régebbi utolsó sikeres mentés is figyelmeztetést ad.
- **Ellenőrzés:** mentés után a másolatot megnyitja és `PRAGMA integrity_check`-et futtat, valamint egyezteti a kártyák számát.
- **Visszaállítás:** `npm run restore -- --date ÉÉÉÉ-HH-NN` (vagy fájlútvonal): leállítja a szervert, a jelenlegi adatbázist félreteszi (`gms.sqlite.before-restore-<időbélyeg>`), bemásolja a mentést és a képeket, újraindít. A lépések a `docs/operations.md`-ben lesznek leírva.
- **macOS jogosultság:** a launchd alatt futó Node-nak hozzá kell férnie a `~/Library/CloudStorage` mappához. Ha a macOS rákérdez, egyszer engedélyezni kell; a telepítő ezt egy próbamentéssel ellenőrzi, és szól, ha nem sikerül.

## 12. Naplózás és hibakezelés

- Strukturált napló (Fastify beépített `pino`), info szinten: indulás, import, képgyűjtés eredménye, mentés, hibák. Kártyaadat (megjegyzés) nem kerül a naplóba.
- A kliens minden hibát magyar nyelvű, rövid értesítésben mutat; a technikai részletek a naplóba kerülnek.
- Nem kezelt kivétel esetén a folyamat kilép, a launchd újraindítja.

## 13. Bővíthetőség (K-10)

- A kódban sehol nincs a Pokémon nevére írt szabály: a dashboard csoportjai, a szűrők és a javaslatok mind az adatokból képződnek.
- Új Pokémon felvétele = új kártya egy új Pokémon névvel. A képgyűjtő a nevet a forrásban keresi.
- Az alkalmazás neve és a fejléc szövege ("Lechonk & Oinkologne gyűjtemény") a `config.json`-ban módosítható.

## 14. Minőségbiztosítás és szállítás

- Minden változás PR-ben kerül a `main`-re; a CI (GitHub Actions, macOS és Ubuntu) lefuttatja a lintet (ESLint), a típusellenőrzést, az egység- és API-teszteket és a Playwright teszteket.
- Részletek: [Tesztspecifikáció](test-spec.md).
- Dokumentáció a megvalósítással együtt: `docs/operations.md` (telepítés, frissítés, mentés, visszaállítás, hibaelhárítás) és `docs/user-guide.md` (rövid felhasználói útmutató magyarul).

## 15. Megvalósítási sorrend

| # | Mérföldkő | Tartalom | Storyk |
|---|---|---|---|
| M1 | Alapok | Repó váz, CI, adatbázis, migrációk, import, API alap | S-01, S-02 |
| M2 | Lista | Kártyalista, keresés, szűrés, jelölés, téma | S-10…S-16, S-20, S-62 |
| M3 | Szerkesztés | Új / szerkesztés / törlés, duplikátum, új Pokémon, finish-szótár | S-21…S-24, S-63, S-64 |
| M4 | Dashboard | Statisztikák, ugrás szűrt listára | S-30…S-33 |
| M5 | Képek | Felderítés, képgyűjtő, tartalék, helykitöltő | S-40…S-43 |
| M6 | Export és mentés | Export, napi mentés, visszaállítás | S-50…S-55 |
| M7 | Telepítés | install/update, launchd, éles import Pali Macjén, dokumentáció | S-60, S-61 |

Minden mérföldkő egy vagy több PR.

## 16. Kockázatok és nyitott kérdések

| Kockázat | Hatás | Kezelés |
|---|---|---|
| A képforrások nem fedik le a ritka kiadásokat (thai, indonéz, stampelt, kínai) | Sok tartalék kép | Elfogadott (üzleti igény 8.); a felderítés számszerűsíti; a forrásoldal `og:image` segíthet |
| Egy képforrás API megváltozik vagy megszűnik | Új kártyákhoz nincs kép | Cserélhető provider interfész; a meglévő képek helyben vannak |
| A OneDrive mappához a launchd folyamat nem fér hozzá | Nincs mentés | Telepítéskori próbamentés, felületi figyelmeztetés |
| Node / Homebrew frissítés eltöri a natív modult (`better-sqlite3`, `sharp`) | Az app nem indul | `update.sh` újrafordít (`npm rebuild`); a Node fő verziója rögzítve (`node@22`) |
| A felhasználó véletlenül töröl egy kártyát | Adatvesztés | Megerősítés; napi mentés; az export is tartalmazza |

Nyitott kérdés Pali felé nincs; minden döntés az üzleti igényből levezethető. Ha a képgyűjtés felderítése azt mutatja, hogy fizetős forrás kellene a jobb lefedettséghez, azt külön kérdezzük.
