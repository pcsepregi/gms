# GMS – Tesztspecifikáció

| | |
|---|---|
| Tulajdonos | Pali |
| Verzió | 1.0 (első változat) |
| Dátum | 2026-11-27 |
| Alapja | [Üzleti igény](business-requirements.md), [Technikai specifikáció](technical-spec.md), [User storyk](user-stories.md) |
| Állapot | Jóváhagyásra vár |

---

## 1. Cél és elvek

- Minden user story minden elfogadási feltételét legalább egy teszt lefedi. A tesztek nevében szerepel a story azonosítója (pl. `S-12/EF3: ékezet nélküli keresés`), így a lefedettség kereshető.
- Ami automatizálható, az automatizált, és minden PR-en lefut. Kézi teszt csak ott van, ahol a valódi Mac környezet kell (launchd, OneDrive, valódi Excel, kinézet).
- A tesztek **soha nem használják Pali valódi adatait** (a repó nyilvános). Szintetikus fixture-ök vannak, a valódi Excel csak a Macen, az éles importnál (ET-01) kerül elő.
- A tesztek nem érnek el külső hálózatot: a képforrásokat álszolgáltató (fake provider) és rögzített válaszok helyettesítik.
- Hibát először egy elbukó teszttel reprodukálunk, utána javítunk.

## 2. Tesztszintek

| Szint | Eszköz | Mit vizsgál | Hol fut |
|---|---|---|---|
| Egység (U) | Vitest | Tiszta függvények: kulcsgenerálás, normalizálás, szűrés, rendezés, importleképezés, statisztika, mentési megőrzés | CI, minden PR |
| API / integráció (A) | Vitest + Fastify `inject`, ideiglenes SQLite fájl | Végpontok, adatbázis-megkötések, migrációk, import teljes folyamata, export fájlok, mentés ideiglenes mappába | CI, minden PR |
| Komponens (C) | Vitest + Testing Library (jsdom) | Űrlap-érvényesítés, szűrőcímkék, optimista jelölés, téma kapcsoló | CI, minden PR |
| Végponttól végpontig (E) | Playwright (Chromium és WebKit) | Valódi szerver + build, felhasználói folyamatok böngészőben | CI, minden PR |
| Vizuális / akadálymentesség (V) | Playwright képernyőképek + `@axe-core/playwright` | Világos és sötét mód, kontraszt, billentyűzetes kezelés | CI, minden PR; a képernyőképek változása review-t igényel |
| Teljesítmény (P) | Vitest bench, Playwright időmérés | Keresés/szűrés ideje 400 és 5000 kártyánál | CI, minden PR |
| Telepítési / éles (ET) | Kézi ellenőrzőlista a Macen | launchd, OneDrive, valódi import, képgyűjtés lefedettsége | Telepítéskor és minden frissítéskor (Remote Control munkamenetben) |

**Lefedettségi cél:** a `packages/shared` és a `packages/server` sorlefedettsége legalább 90%, a `packages/web` legalább 70%. A CI elbukik, ha ez alá esik.

## 3. Tesztadatok

| Fixture | Tartalom |
|---|---|
| `fixtures/sample-master.xlsx` | Az eredetivel azonos lapok és fejlécek (a fejléc a 4. sorban), kb. 40 szintetikus sor. Tartalmaz: `YES`, `yes`, `NO`, üres sorokat, `CHECK` státuszt, forráslinket és anélküli sort, vezető nullás kártyaszámot (`007/SV-P`), szótárban nem szereplő finish-t, üres Master ID-t, ismétlődő Master ID-t, mind a 13 nyelvet, `Oinkologne ex` Pokémont. |
| `fixtures/bad-language.xlsx` | Egy ismeretlen nyelvű sor (`Klingon`) a 7. sorban. |
| `fixtures/duplicate-key.xlsx` | Két sor ugyanazzal a természetes kulccsal, eltérő kis-/nagybetűvel. |
| `fixtures/no-header.xlsx` | MASTER SET lap `Have?` fejléc nélkül. |
| Adatbázis-gyár (`test/factory.ts`) | Kártyák programból generálva, tetszőleges számban (teljesítményteszthez 5000). |
| Kép-álszolgáltató | Beállítható válaszok: pontos kép, csak angol kép, nincs kép, hálózati hiba, lassú válasz, nem kártya arányú kép. |
| Rögzített óra | Az ütemező és a mentés tesztjeihez a Vitest `vi.useFakeTimers` és egy injektálható `now()`. |

## 4. Tesztesetek

Jelölés: azonosító · szint · leírás · elvárt eredmény. A story oszlop mutatja, melyik elfogadási feltételt fedi.

### 4.1 Adatmigráció (S-01, S-02)

| ID | Szint | Story | Eset | Elvárt eredmény |
|---|---|---|---|---|
| T-IMP-01 | A | S-01/EF1 | Import a `sample-master.xlsx`-ből | A kártyák száma = a nem üres adatsorok száma |
| T-IMP-02 | U | S-01/EF2 | `YES`, `yes`, ` Yes `, `NO`, üres, `N/A` leképezése | Az első három `owned=1`, a többi `0` |
| T-IMP-03 | U | S-01/EF3 | `007/SV-P` és számként tárolt kártyaszám cella | Szövegként, vezető nullákkal kerül be |
| T-IMP-04 | U | S-01/EF4 | Megjegyzés összeállítása: CHECK + Notes + link, csak Notes, csak link, egyik sem | Formátum: `Ellenőrizendő.` / Notes / `Forrás: <link>`, üres sorral elválasztva, hiányzó rész kimarad, üres esetben `''` |
| T-IMP-05 | A | S-01/EF5 | Importált kártya API válasza | Nincs benne qty, region, status, master_id mező |
| T-IMP-06 | A | S-01/EF6 | Szótár + szótárban hiányzó finish | Minden szótárelem leírással, a hiányzó leírás nélkül, a szótár sorrendjében |
| T-IMP-07 | A | S-01/EF7 | Import nem üres adatbázisba (`--force`-szal is) | Nem változik semmi, hibaüzenet, kilépési kód ≠ 0 |
| T-IMP-08 | A | S-01/EF8 | `bad-language.xlsx` | 0 kártya kerül be, a hiba megnevezi a 7. sort és a `Klingon` értéket |
| T-IMP-09 | A | S-01/EF8 | `duplicate-key.xlsx` | 0 kártya kerül be, a hiba megnevezi mindkét sort |
| T-IMP-10 | A | S-01 | `no-header.xlsx` | Érthető hiba: nem található a fejléc |
| T-IMP-11 | A | S-02/EF1 | Import összesítő | Sorok, megvan, hiányzik, nyelvenkénti bontás és új finish-ek helyesek; `app_meta.import_summary`-ben is ott van |
| T-IMP-12 | E | S-02/EF3 | Beállítások oldal import után | Az összesítő látszik |
| T-IMP-13 | A | S-40/EF1 | Import vége | Minden kártya `image_status = 'pending'` és a képsorban van |

### 4.2 Lista, keresés, szűrés, rendezés (S-10 … S-16)

| ID | Szint | Story | Eset | Elvárt eredmény |
|---|---|---|---|---|
| T-LST-01 | E | S-10/EF1 | Lista megnyitása 40 kártyával | 40 kártya, mindegyiken név, set, szám, finish, nyelv |
| T-LST-02 | E | S-10/EF2 | Megvan és hiányzó kártya | A hiányzón "Hiányzik" címke és `data-owned="false"`; vizuális teszt mindkét állapotra |
| T-LST-03 | P | S-10/EF3 | 400 kártya görgetése | Nincs 50 ms-nál hosszabb fő szál blokk (Playwright `longtask` mérés) |
| T-LST-04 | E | S-10/EF4 | Kártyára kattintás | Részletek panel nyílik, URL `/kartyak/:id` |
| T-LST-05 | E | S-11 | Nézetváltás, újratöltés | Táblázat a megadott oszlopokkal; újratöltés után is táblázat |
| T-SRC-01 | U | S-12/EF2 | Keresés minden mezőre (Pokémon, set, setkód, szám, finish, magyar és angol nyelvnév, megjegyzés, azonosító) | Mindegyik mezőre talál |
| T-SRC-02 | U | S-12/EF3 | `NEMET`, `német`, `nemet` | Ugyanaz az eredmény |
| T-SRC-03 | U | S-12/EF3 | `7` és `007` | Megtalálja a `007/SV-P` lapot |
| T-SRC-04 | U | S-12/EF4 | `német reverse 154` | Csak a mindhárom szónak megfelelő lapok |
| T-SRC-05 | E | S-12/EF1 | Gépelés | Az utolsó leütés után legfeljebb 150 ms-on belül frissül a lista |
| T-SRC-06 | E | S-12/EF5 | `/` és `Esc` | `/` fókuszba hozza a mezőt, `Esc` törli |
| T-SRC-07 | E | S-12/EF6 | Találat nélküli keresés | Üres állapot üzenet, "Szűrők törlése" gomb működik |
| T-FLT-01 | U | S-13/EF2 | Nyelv: DE+FR, finish: Reverse Holo, állapot: hiányzik | (DE vagy FR) és Reverse Holo és hiányzik |
| T-FLT-02 | U | S-13/EF3 | Szűrő + keresés együtt | A két feltétel metszete |
| T-FLT-03 | E | S-13/EF4 | Szűrés után | "N kártya, ebből M hiányzik" helyes |
| T-FLT-04 | C | S-14/EF1-3 | Szűrőcímkék | Minden aktív szűrő címke; x egyet töröl; "Összes törlése" mindent, a keresést is |
| T-SRT-01 | U | S-15/EF2 | `10/021`, `9/021`, `009/023`, `1601/05`, `007/SV-P` | Számszerű sorrend a `/` előtti rész szerint, azonos számnál a teljes szöveg szerint |
| T-SRT-02 | U | S-15/EF3 | Nyelv szerinti rendezés | A technikai spec 4.3 sorrendje |
| T-SRT-03 | U | S-15/EF1 | Minden rendezési mező, mindkét irány | Helyes, stabil sorrend |
| T-URL-01 | E | S-16/EF1-2 | Szűrés, URL másolása új lapra | Ugyanaz a szűrt lista |
| T-URL-02 | E | S-16/EF3 | Két szűrési lépés, majd Vissza | Az előző állapot |

### 4.3 Jelölés (S-20)

| ID | Szint | Story | Eset | Elvárt eredmény |
|---|---|---|---|---|
| T-OWN-01 | E | S-20/EF1 | Jelölés a rácsból, a táblázatból és a panelről | Mindhárom helyen átvált |
| T-OWN-02 | E | S-20/EF2 | Jelölés, majd újratöltés | Az állapot megmaradt |
| T-OWN-03 | E | S-20/EF3 | Jelölés, majd "Visszavonás" 5 mp-en belül | Az eredeti állapot, az adatbázisban is |
| T-OWN-04 | C | S-20/EF4 | Szerver 500-at ad | Az állapot visszaáll, hibaüzenet |
| T-OWN-05 | A | S-20 | `PUT /owned` kétszer ugyanazzal az értékkel | Idempotens; `owned_changed_at` csak valódi változáskor frissül |
| T-OWN-06 | E | S-20/EF5 | Jelölés, majd dashboard | A számok eggyel változtak |

### 4.4 Kártyák kezelése (S-21 … S-24, S-63, S-64)

| ID | Szint | Story | Eset | Elvárt eredmény |
|---|---|---|---|---|
| T-CRD-01 | E | S-21/EF1,5,6 | Új kártya kitöltése és mentése | Megjelenik a listában "nincs meg" állapotban, képállapota `pending` |
| T-CRD-02 | C | S-21/EF2 | Kötelező mezők üresen | A mentés gomb tiltott, mezőnként magyar hibaüzenet |
| T-CRD-03 | A | S-21/EF2 | `POST /api/cards` hiányzó/túl hosszú mezővel | `400 VALIDATION`, mezőnkénti részletek |
| T-CRD-04 | C | S-21/EF3 | Kombinált mezők | Felajánlja a meglévő értékeket; új érték is elfogadott |
| T-CRD-05 | C | S-21/EF4 | Ismert set választása | A setkód kitöltődik; több kódú setnél nem |
| T-CRD-06 | A | S-21 | Új nyelv és új finish beküldése | Létrejönnek, `image_code` üres |
| T-DUP-01 | U | S-22/EF2 | Természetes kulcs: `Lechonk ` vs `lechonk`, `SVI` set kis-/nagybetűvel | Azonos kulcs |
| T-DUP-02 | C | S-22/EF1 | Létező kártya adatainak begépelése | Figyelmeztetés, link a meglévőre |
| T-DUP-03 | A | S-22/EF3 | POST és PATCH duplikátummal | `409 DUPLICATE`, a meglévő `id`-vel; az adatbázis nem változik |
| T-DUP-04 | A | S-22 | Adatbázis-szintű `UNIQUE` megkötés közvetlen beszúrással | Hiba, nincs kettős sor |
| T-EDT-01 | E | S-23/EF1,4 | Minden mező szerkesztése | A lista azonnal mutatja |
| T-EDT-02 | C | S-23/EF2 | Megjegyzés 5000 / 5001 karakter, link a szövegben | 5000 menthető, 5001 nem; a link kattintható, `rel="noopener"` |
| T-EDT-03 | A | S-23/EF3 | Kártyaszám módosítása | `display_id` frissül, `image_status = 'pending'`; megjegyzés módosításakor nem |
| T-EDT-04 | U | S-23 | `display_id` generálás, ütközés esetén setkód utótag | `EN-Lechonk-154/198-Reverse_Holo`, ütközésnél `…-SVI` |
| T-DEL-01 | E | S-24/EF1-2 | Törlés megerősítéssel | A kártya eltűnik, a dashboard száma csökken |
| T-DEL-02 | E | S-24/EF3 | Törlés, Mégse | Nincs változás |
| T-DEL-03 | A | S-24 | `DELETE` | A sor és a képfájlok (normál és bélyegkép) törlődnek; nem létező `id`-re `404` |
| T-EXT-01 | E | S-63/EF1-2 | Új kártya `Pikachu` Pokémonnal | Megjelenik a Pokémon szűrőben és a dashboard bontásban |
| T-EXT-02 | U | S-63/EF3 | Statikus ellenőrzés: `Lechonk`/`Oinkologne` szöveg a forráskódban | Csak tesztekben, fixture-ökben és a `config.json` alapértékében fordul elő (CI szkript) |
| T-FIN-01 | E | S-64/EF1-3 | Finish leírás szerkesztése a Beállításokban | A kártya panelen az új leírás látszik |

### 4.5 Dashboard (S-30 … S-33)

| ID | Szint | Story | Eset | Elvárt eredmény |
|---|---|---|---|---|
| T-DSH-01 | A | S-30/EF3, S-31/EF1 | `/api/stats` ismert fixture-ön | Minden csoport `owned/all` értéke egyezik egy független, egyszerű számolással (tesztben újraszámolva) |
| T-DSH-02 | E | S-30/EF1-2 | Nyitóoldal | A dashboard, "megvan / összes · %" helyes |
| T-DSH-03 | U | S-31/EF2 | Setek rendezése | Hiányzók száma szerint csökkenő, egyenlőségnél név szerint |
| T-DSH-04 | U | S-32/EF1-2 | Majdnem kész: 100%-os, 0 kártyás és több hiányzós csoportok | Csak nem teljes, nem üres csoportok, max. 6, a legkevesebb hiányzóval kezdve |
| T-DSH-05 | A | S-32/EF3-4 | 10 jelölés különböző időpontokban, import utáni állapot | Az utolsó 8, legfrissebb elöl; importált "megvan" nincs benne |
| T-DSH-06 | E | S-33/EF1 | Kattintás a "Német" sávra | `/kartyak?nyelv=DE&allapot=hianyzik`, a lista ennek megfelelő |
| T-DSH-07 | E | S-33/EF2-3 | "Majdnem kész" elem, legutóbbi lap | Szűrt lista, illetve kártyapanel |
| T-DSH-08 | E | S-31/EF3 | Új kártya után a dashboard | Az összes és az érintett csoport eggyel nőtt |

### 4.6 Képek (S-40 … S-43)

| ID | Szint | Story | Eset | Elvárt eredmény |
|---|---|---|---|---|
| T-IMG-01 | A | S-40/EF2 | Álszolgáltató: van saját nyelvű kép | `exact`, a fájl WebP, legfeljebb 734×1024, bélyegkép is van |
| T-IMG-02 | A | S-42/EF1 | Csak angol kép van | `fallback`, `image_lang_id` = angol |
| T-IMG-03 | A | S-42/EF3 | Sehol nincs kép | `none` |
| T-IMG-04 | A | S-41/EF3 | Hálózati hiba | `error`, a napi újrapróbálásnál újra sorba kerül |
| T-IMG-05 | U | S-40 | `og:image` ellenőrzés: kártya arányú, túl kicsi, fekvő kép | Csak a kártya arányú, legalább 400 px magas fogadható el |
| T-IMG-06 | A | S-40/EF1 | 50 tétel a sorban, közben API kérések | Egyszerre egy letöltés, legalább 1 mp szünet; az API válaszideje nem nő érdemben (< 50 ms) |
| T-IMG-07 | A | S-40 | Szerver újraindítása függő tételekkel | A függő tételek újra sorba kerülnek |
| T-IMG-08 | A | S-40/EF3 | Kép kiszolgálása | `Cache-Control: immutable`; útvonal-bejárás (`../`) elutasítva `400`-zal |
| T-IMG-09 | E | S-41/EF1-2 | Új kártya, az álszolgáltató 2 mp múlva válaszol | "Kép keresése…", majd újratöltés nélkül megjelenik a kép |
| T-IMG-10 | E | S-42/EF2-4 | Tartalék és kép nélküli kártya | "Kép: angol" jelvény; helykitöltő a névvel és számmal; a képállapot-szűrő működik |
| T-IMG-11 | E | S-43 | "Kép újrakeresése" | Új állapot és kép a panelen |
| T-IMG-12 | E | S-40/EF4 | Beállítások | Képállapot darabszámok helyesek |
| T-IMG-13 | E | S-40/EF3 | Hálózat letiltva (Playwright `offline`) a képek letöltése után | Minden kép megjelenik |

### 4.7 Export (S-50, S-51)

| ID | Szint | Story | Eset | Elvárt eredmény |
|---|---|---|---|---|
| T-EXP-01 | A | S-50/EF1-2 | Teljes XLSX export | Minden kártya, a megadott oszlopokkal és sorrendben, `Igen`/`Nem`, magyar nyelvnevek; rögzített fejléc és automatikus szűrő |
| T-EXP-02 | A | S-50/EF3 | CSV export ékezetes és `;`, `"`, sortörés tartalmú megjegyzéssel | UTF-8 BOM, `;` elválasztó, helyes idézés; visszaolvasva azonos adatok |
| T-EXP-03 | A | S-50/EF4, S-51/EF2 | Fájlnevek | `GMS-export-ÉÉÉÉ-HH-NN.xlsx`; szűrtnél a szűrőkből képzett név, csak biztonságos karakterekkel |
| T-EXP-04 | E | S-51/EF1 | Szűrt lista exportja | A letöltött fájl pontosan a látható kártyákat tartalmazza, a látható sorrendben |
| T-EXP-05 | A | S-51 | 400 azonosító POST-tal | Működik (nincs URL-hossz korlát) |
| T-EXP-06 | A | – | Képlet-befecskendezés: `=HYPERLINK(...)` kezdetű megjegyzés | A cella szövegként íródik ki, nem képletként |

### 4.8 Mentés és visszaállítás (S-52 … S-55)

| ID | Szint | Story | Eset | Elvárt eredmény |
|---|---|---|---|---|
| T-BAK-01 | A | S-52/EF2 | Mentés ideiglenes célmappába | `backups/gms-ÉÉÉÉ-HH-NN.sqlite` és `.xlsx` létrejön, `images/` tükör; az SQLite másolat `integrity_check` = ok, kártyaszám egyezik |
| T-BAK-02 | U | S-52/EF1 | Ütemező: rögzített óra, aznap még nincs mentés / már van / éjfélen átnyúló alvás | Csak akkor ment, ha aznap (helyi idő) még nem volt sikeres mentés; ébredés után pótol |
| T-BAK-03 | U | S-52/EF3 | Megőrzés: 400 napnyi mentés listája | Az utolsó 30 nap + 12 havi (a hónap első mentése) marad, a többi törlendő |
| T-BAK-04 | A | S-52/EF2 | Képtükör: új, módosított és törölt kép | Csak az új és módosult másolódik, a törölt a tükörből is törlődik |
| T-BAK-05 | A | S-52/EF4 | Mentés közbeni írások | A mentés konzisztens, az írások nem buknak el |
| T-BAK-06 | A | S-53/EF2 | Célmappa nem létezik / nem írható | `backup_log` hiba, `/api/backup/status` hibás állapot |
| T-BAK-07 | E | S-53/EF1-2 | Hibás állapot és 27 órás utolsó mentés | Figyelmeztető sáv a fejlécben; sikeres mentés után eltűnik |
| T-BAK-08 | A | S-54/EF1-3 | Mentés, módosítás, visszaállítás a mentésből | Az adatok a mentés állapotát mutatják; a félretett `before-restore` fájl a módosított állapotot tartalmazza |
| T-BAK-09 | E | S-55 | "Mentés most" | Sikerüzenet, az utolsó mentés ideje frissül |
| T-MIG-01 | A | – | Migrációk üres adatbázison és egy korábbi verziós adatbázison | A séma a várt; az adatok megmaradnak; a `pre-migration` másolat létrejön |
| T-MIG-02 | A | – | Hibás migráció | Visszagörgetés, az adatbázis változatlan, a szerver hibával kilép |

### 4.9 Futtatás, biztonság, megjelenés (S-60 … S-62)

| ID | Szint | Story | Eset | Elvárt eredmény |
|---|---|---|---|---|
| T-SEC-01 | A | S-61/EF1 | A szerver kötési címe | Csak `127.0.0.1` (a konfigurációban más cím megadása hibát ad) |
| T-SEC-02 | A | S-61/EF2 | `Host: evil.example:4747` | `403` |
| T-SEC-03 | A | S-61 | Módosító kérés idegen `Origin`-nel | `403` |
| T-SEC-04 | E | S-23 | `<script>` és HTML a megjegyzésben és a setnévben | Szövegként jelenik meg, nem fut le |
| T-UI-01 | E | S-62/EF1 | Playwright `colorScheme: dark` és `light` | A megfelelő téma; rendszerváltáskor automatikusan vált |
| T-UI-02 | E | S-62/EF2 | Kapcsoló Sötétre, újratöltés | Sötét marad |
| T-UI-03 | V | S-62/EF3 | axe ellenőrzés dashboardon, listán, űrlapon mindkét témában | Nincs `serious` vagy `critical` hiba, a kontraszt AA |
| T-UI-04 | V | S-62/EF4 | Stílus-tiltólista: a lefordított CSS-ben `linear-gradient`, `radial-gradient`, `backdrop-filter`; a felület szövegében emoji | Nem fordul elő (CI szkript) |
| T-UI-05 | V | S-62 | Képernyőképek: dashboard, rács, táblázat, panel, űrlap × világos/sötét | Változás esetén a PR-ben jóváhagyandó |
| T-UI-06 | E | 7.2 | Billentyűzetes bejárás: fő folyamatok egér nélkül (keresés, szűrés, jelölés, új kártya) | Elvégezhető, a fókusz mindig látható |
| T-UI-07 | U | 7.2 | Minden felületi szöveg a `hu.ts`-ből jön | A komponensekben nincs beégetett felhasználói szöveg (ESLint szabály) |

### 4.10 Teljesítmény

| ID | Szint | Eset | Elvárt eredmény |
|---|---|---|---|
| T-PRF-01 | P | Szűrés + keresés + rendezés 400 kártyán | < 5 ms (medián, Vitest bench) |
| T-PRF-02 | P | Ugyanez 5000 kártyán | < 30 ms |
| T-PRF-03 | P | `/api/cards` és `/api/stats` 400 kártyánál | < 50 ms |
| T-PRF-04 | E | Első betöltés a dashboardig (helyi szerver) | < 1 s |
| T-PRF-05 | E | Jelölés kattintástól a látható változásig | < 100 ms |

## 5. Telepítési és éles ellenőrzőlista (ET)

Ezeket a projekt végzi el Pali Macjén (Remote Control munkamenetben), az első telepítéskor és — ahol jelölve — minden frissítéskor. Az eredmény a telepítési PR-be vagy a szálba kerül.

| ID | Mikor | Lépés | Elvárt eredmény |
|---|---|---|---|
| ET-01 | Első telepítés | Import Pali valódi Exceléből | Összesítő: **376 sor, 210 megvan, 166 hiányzik**; nyelvenkénti számok egyeznek az Excel MASTER SET lapjával (szűrővel megszámolva) |
| ET-02 | Első telepítés | 10 véletlen kártya összevetése az Excellel | Minden mező és a megjegyzés a leképezés szerint |
| ET-03 | Első telepítés | Képgyűjtés befejezése | A pontos / tartalék / nincs kép darabszámok rögzítve a `docs/operations.md`-ben; 10 véletlen pontos képet szemmel ellenőrzünk |
| ET-04 | Mindig | `http://127.0.0.1:4747` megnyitása | A dashboard betölt, `/api/health` ok |
| ET-05 | Első telepítés | Mac újraindítása, bejelentkezés | Az app külön teendő nélkül elérhető |
| ET-06 | Első telepítés | A szerverfolyamat leállítása (`kill`) | 30 mp-en belül újra fut |
| ET-07 | Első telepítés | Elérés a Mac helyi hálózati IP-címéről egy másik eszközről | Nem érhető el |
| ET-08 | Mindig | Kézi mentés a Beállításokból | A fájlok megjelennek a OneDrive `GMS` mappájában; macOS jogosultságkérés nem blokkol |
| ET-09 | Első telepítés | Másnapi ellenőrzés | Automatikus napi mentés elkészült |
| ET-10 | Első telepítés | Visszaállítás próba egy tesztmásolaton | A dokumentált lépésekkel működik |
| ET-11 | Mindig | Frissítés `update.sh`-val | Előtte mentés készül, migrációk lefutnak, a kártyák száma nem változik |
| ET-12 | Első telepítés | Kinézet átnézése Safariban, világos és sötét módban | Pali jóváhagyja ("nem AI-szagú") |

## 6. CI folyamat

GitHub Actions minden PR-en és a `main`-re kerüléskor:

1. `npm ci`
2. `npm run lint` (ESLint, Prettier ellenőrzés, a T-EXT-02, T-UI-04 és T-UI-07 szkriptek)
3. `npm run typecheck`
4. `npm test` (egység, API, komponens; lefedettségi küszöbökkel)
5. `npm run build`
6. `npm run e2e` (Playwright, Chromium és WebKit, `--trace off`; hiba esetén a hibás teszt nyomkövetéssel újrafut)
7. `npm run bench` (teljesítményküszöbök)

Futtatókörnyezet: `ubuntu-latest` minden lépésre, valamint `macos-latest` a 4–5. lépésre (a natív modulok és az útvonalkezelés miatt). A PR csak zöld CI-vel kerül a `main`-re.

## 7. Hibakezelés és regresszió

- Minden talált hibához először elbukó teszt készül (a story azonosítójával, ha van), utána a javítás ugyanabban a PR-ben.
- Az éles ellenőrzőlistán talált hiba GitHub issue-ként kerül rögzítésre, és a javítás előtt automatizált teszt készül rá, ha lehetséges.

## 8. Lefedettségi mátrix

| Story | Tesztek |
|---|---|
| S-01 | T-IMP-01…10, ET-01, ET-02 |
| S-02 | T-IMP-11, T-IMP-12, ET-01 |
| S-10 | T-LST-01…04 |
| S-11 | T-LST-05 |
| S-12 | T-SRC-01…07 |
| S-13 | T-FLT-01…03 |
| S-14 | T-FLT-04 |
| S-15 | T-SRT-01…03 |
| S-16 | T-URL-01, T-URL-02 |
| S-20 | T-OWN-01…06 |
| S-21 | T-CRD-01…06 |
| S-22 | T-DUP-01…04 |
| S-23 | T-EDT-01…04, T-SEC-04 |
| S-24 | T-DEL-01…03 |
| S-30 | T-DSH-01, T-DSH-02 |
| S-31 | T-DSH-01, T-DSH-03, T-DSH-08 |
| S-32 | T-DSH-04, T-DSH-05 |
| S-33 | T-DSH-06, T-DSH-07 |
| S-40 | T-IMP-13, T-IMG-01, T-IMG-05…08, T-IMG-12, T-IMG-13, ET-03 |
| S-41 | T-IMG-04, T-IMG-09 |
| S-42 | T-IMG-02, T-IMG-03, T-IMG-10 |
| S-43 | T-IMG-11 |
| S-50 | T-EXP-01…03, T-EXP-06 |
| S-51 | T-EXP-03…05 |
| S-52 | T-BAK-01…05, ET-09 |
| S-53 | T-BAK-06, T-BAK-07 |
| S-54 | T-BAK-08, ET-10 |
| S-55 | T-BAK-09, ET-08 |
| S-60 | ET-04, ET-05, ET-06, ET-11 |
| S-61 | T-SEC-01…03, ET-07 |
| S-62 | T-UI-01…05, ET-12 |
| S-63 | T-EXT-01, T-EXT-02 |
| S-64 | T-FIN-01 |
