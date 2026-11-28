# Üzemeltetés

Ez a dokumentum a gyűjteménykezelő futtatását, mentését és visszaállítását írja le. Az első telepítés lépésről lépésre: [Telepítés Pali Macjére](install-mac.md).

## 1. Mappák és beállítások

| Mi | Hol (macOS) |
|---|---|
| Programkód | a repó klónja (pl. `~/Applications/gms`) |
| Adatbázis | `~/Library/Application Support/GMS/gms.sqlite` |
| Képek | `~/Library/Application Support/GMS/images/` |
| Beállítások | `~/Library/Application Support/GMS/config.json` |
| Napló | `~/Library/Logs/GMS/gms.log` (naponta forgatva: `gms-ÉÉÉÉ-HH-NN.log`, 14 napig) |
| LaunchAgent | `~/Library/LaunchAgents/local.gms.server.plist` |

A `config.json` opcionális. A fontos mezői:

```json
{
  "port": 4747,
  "backupDir": "/Users/<név>/Library/CloudStorage/OneDrive-<fiók>/GMS"
}
```

- `port`: alapértelmezés 4747. A szerver mindig csak a `127.0.0.1` címen hallgat, más cím nem állítható be.
- `backupDir`: a OneDrive `GMS` mappa. Ha nincs megadva, a napi mentés nem fut, a Beállításokban ez látszik.

A `GMS_DATA_DIR` környezeti változóval az adatmappa más helyre állítható (pl. teszteléshez).

## 2. Indítás és automatikus futás

A telepítés után (`scripts/install.sh`) a szervert a macOS **launchd** futtatja a `local.gms.server` LaunchAgenttel:

- bejelentkezéskor elindul (`RunAtLoad`), leállás vagy összeomlás után 10 mp múlva újraindul (`KeepAlive`, `ThrottleInterval = 10`);
- a Node a Homebrew `node@22` (vagy a telepítéskor talált 22-es Node), a program a `packages/server/dist/main.js`;
- a napló a `~/Library/Logs/GMS/gms.log` fájlba megy (a LaunchAgent a `GMS_LOG_DIR` változóval adja meg). A naplóba nem kerülnek kártyamegjegyzések. Az indulás előtti hibák a `launchd.err.log`-ban vannak.

Hasznos parancsok (a `~/Applications/gms` mappában):

| Mit | Parancs |
|---|---|
| Állapot (fut-e, kártyák, képek, mentés) | `npm run health` |
| Újraindítás | `launchctl kickstart -k gui/$(id -u)/local.gms.server` |
| Leállítás (a következő bejelentkezésig) | `launchctl bootout gui/$(id -u)/local.gms.server` |
| Újra betöltés leállítás után | `scripts/install.sh --skip-build --skip-import --no-open` |
| Frissítés | `scripts/update.sh` |
| Eltávolítás (az adatok megmaradnak) | `scripts/uninstall.sh` |
| A LaunchAgent állapota | `launchctl print gui/$(id -u)/local.gms.server` |

Kézi indítás fejlesztéshez vagy LaunchAgent nélkül:

```sh
npm ci
npm run build
npm start          # node packages/server/dist/main.js, napló a terminálba
```

Ezután a böngészőben: `http://127.0.0.1:4747`. Ha a port foglalt, a szerver a naplóba írja és kilép.

## 3. Napi mentés (S-52, S-53, S-55)

- A szerver induláskor és óránként ellenőrzi, volt-e már aznap (helyi idő szerint) sikeres mentés. Ha nem, ment. Így a felébredt vagy éjjel kikapcsolt Mac is pótolja a mentést.
- Egy mentés a `backupDir/backups/` mappába három fájlt tesz:
  - `gms-ÉÉÉÉ-HH-NN.sqlite`: az adatbázis másolata, előtte `integrity_check` és kártyaszám-egyezés ellenőrzéssel;
  - `gms-ÉÉÉÉ-HH-NN.xlsx`: ember által olvasható export;
  - a képek tükre a `backupDir/images/` mappában (csak az új vagy módosult fájlok másolódnak, a törölt képek törlődnek).
- Megőrzés: az utolsó 30 nap mentései, azon túl havonta az első mentés, 12 hónapig. A régebbieket az app törli.
- Kézi mentés: a Beállítások oldalon a "Mentés most" gomb.
- Hiba esetén (nem írható mappa, sikertelen ellenőrzés) a fejléc figyelmeztető sávot mutat, és a hiba oka a Beállításokban olvasható. Sikeres mentés után a sáv eltűnik. Ha az utolsó sikeres mentés 26 óránál régebbi, a sáv akkor is megjelenik.

## 4. Visszaállítás mentésből (S-54)

A visszaállítás a szerver leállított állapotában történik, a parancs ezt ellenőrzi.

1. Állítsd le a szervert: `launchctl bootout gui/$(id -u)/local.gms.server` (kézi indításnál Ctrl+C).
2. Futtasd a visszaállítást a kívánt napra:

   ```sh
   npm run restore -- --date 2026-11-27
   ```

   Vagy egy konkrét fájlból: `npm run restore -- --file /útvonal/gms-2026-11-27.sqlite`.

3. A parancs a jelenlegi adatbázist `gms.sqlite.before-restore-<időbélyeg>` néven félreteszi, bemásolja a mentést, és visszaállítja a képeket (a napi mentés képtükréből). Így a visszaállítás is visszafordítható: a félretett fájlt vissza lehet nevezni.
4. Indítsd újra a szervert (`scripts/install.sh --skip-build --skip-import --no-open`), és ellenőrizd a kártyák számát (`npm run health` vagy a Beállítások oldal).

Ha a mentés régebbi adatbázis-verzióból származik, az indításkor a szerver migrálja (a migráció előtt másolatot készít).

## 5. Hibaelhárítás

| Tünet | Ok és teendő |
|---|---|
| Figyelmeztető sáv: "Az utolsó mentés hibás" | A Beállításokban a hiba szövege látszik. Leggyakrabban a OneDrive mappa nem érhető el, vagy a macOS nem adott jogosultságot. Ellenőrizd a `backupDir` útvonalat, és a "Mentés most" gombbal próbáld újra. |
| Figyelmeztető sáv: "Régi az utolsó sikeres mentés" | 26 óránál régebben volt sikeres mentés. Általában a Mac volt kikapcsolva, vagy a szerver nem futott. A "Mentés most" gomb pótolja. |
| A visszaállítás: "A szerver fut" | Előbb állítsd le a szervert, utána futtasd újra a parancsot. |
| A szerver nem indul, "A szerver nem indult el" | A port foglalt, vagy a `config.json` hibás. A napló (`~/Library/Logs/GMS/gms.log`, illetve `launchd.err.log`) pontos okot ír. |
| `npm run health`: "A GMS nem válaszol" | `launchctl print gui/$(id -u)/local.gms.server`: ha nincs betöltve, `scripts/install.sh --skip-build --skip-import --no-open`; ha fut, de újra és újra kilép, a napló mondja meg az okát. |
| A mentés jogosultsági hibával áll le (pl. `EPERM`, `Operation not permitted`) | A háttérben futó Node nem fér hozzá a OneDrive mappához. Rendszerbeállítások > Adatvédelem és biztonság > Teljes lemezhozzáférés: add hozzá a Node-ot (az útja: `launchctl print gui/$(id -u)/local.gms.server` → `program`), majd "Mentés most". |
| Hiányzó képek a visszaállítás után | Csak napi mentésből állítunk vissza képeket. `--file` megadásakor a képek nem változnak. |

## 6. Biztonság és adatvédelem

- A szerver csak a helyi gépről érhető el (127.0.0.1), más gépről nem.
- A kártyák megjegyzései nem kerülnek a naplóba.
- A OneDrive mappába a mentés a gyűjtemény teljes adatát másolja. A mappát ugyanúgy védd, mint a gyűjteményt.

## Adatjavítás: értékek átnevezése (`ops rename`)

Ha egy Pokémon-, setnév- vagy setkód-értéket a teljes gyűjteményben át kell nevezni
(pl. egy külön Pokémonként felvett változat beolvasztása, vagy idegen írású setnevek
angolra cserélése), egy JSON fájllal megadható:

```json
{
  "decodeHtmlEntities": true,
  "pokemon": { "Régi név": "Új név" },
  "setName": { "Régi setnév": "Új setnév" },
  "setCode": { "régi": "ÚJ" }
}
```

```sh
npm run ops -- rename --file scripts/renames/2026-11-28-renames.json          # próbafuttatás
npm run ops -- rename --file scripts/renames/2026-11-28-renames.json --apply  # élesben
```

A próbafuttatás csak kiírja, mi változna. Az `--apply` előtte helyi másolatot készít
(`gms.sqlite.pre-rename-…`), egy tranzakcióban ír, a képek és a „megvan” állapot
megmaradnak, az azonosítók újraszámolódnak. Ha két kártya az átnevezés után egybeesne,
semmi sem változik, és a parancs kiírja az ütköző kártyákat.

- 2026-11-28: `scripts/renames/2026-11-28-renames.json`: az „Oinkologne ex” az Oinkologne-hoz
  került, a hagyományos kínai és indonéz setnevek angolul, a kétnyelvű latin-amerikai
  setnevekből az angol rész maradt, `sv3` → `SV3`.
