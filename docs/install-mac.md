# Telepítés Pali Macjére (M7)

Ez a leírás a GMS végleges telepítését írja le: a Mac bekapcsolása és bejelentkezés után az app magától elindul, leállás esetén újraindul, és csak erről a Macről, a böngészőből érhető el (`http://127.0.0.1:4747`).

A telepítést a projekt végzi a Macen, egy Remote Control munkamenetben (technikai spec 9.3). Palinak csak néhány dolgot kell a gép előtt jóváhagynia vagy megadnia; ezek az 1. részben vannak. A 2. rész a telepítés lépéseit írja le (ezt futtatjuk mi), a 3. rész az átadás utáni ellenőrzőlista.

## 1. Amit Palinak kell tennie

A gép előtt, kb. 20–30 perc, ebből a legtöbb várakozás.

1. **Kapcsold be és jelentkezz be a Macen**, nyisd meg a Claude asztali appot, és hagyd jóvá a Remote Control munkamenetet, amikor kéri. A telepítés végéig a Mac maradjon ébren és legyen hálózaton.
2. **Az Excel fájl**: tedd a `Letöltések` (`~/Downloads`) mappába, vagy szólj, hol van. A telepítő a `Letöltések`, `Asztal` és `Dokumentumok` mappában magától keresi (a nevében `MASTER` van).
3. **OneDrive**: legyen bejelentkezve és szinkronizáljon. A telepítő a `~/Library/CloudStorage/OneDrive-…/GMS` mappát ajánlja a napi mentéshez (ha nincs ilyen mappa, létrehozza). Ha más mappát szeretnél, szólj.
4. **Jelszó, ha kéri**: ha a Macen még nincs Homebrew vagy a fejlesztői parancssori eszközök (git), ezek telepítése egyszer a Mac jelszavát kéri, és a macOS egy ablakban rákérdezhet ("Parancssori fejlesztői eszközök telepítése"). Ezeket neked kell jóváhagynod.
5. **macOS jogosultság a OneDrive mappához**: ha a macOS megkérdezi, hogy a `node` hozzáférhet-e a OneDrive-ban tárolt fájlokhoz, válaszd az **Engedélyezés** gombot. Ha a próbamentés ennek ellenére sem sikerül, a Rendszerbeállítások > Adatvédelem és biztonság > Teljes lemezhozzáférés listájához kell hozzáadni a Node-ot (a telepítő kiírja a pontos útvonalát); ebben segítünk.
6. **Átnézés**: a végén megnyílik a böngészőben az app. Nézd át világos és sötét módban (ET-12), és a 3. rész ellenőrzéseinél (újraindítás, másik eszközről elérés) kérünk egy-két kattintást.

## 2. A telepítés lépései (ezt a projekt futtatja)

### 2.1 Előfeltételek ellenőrzése

```sh
xcode-select -p || xcode-select --install     # git (fejlesztői eszközök)
command -v brew || echo "nincs Homebrew"       # ha nincs: https://brew.sh telepítő
```

A Node 22-t a telepítő magától felteszi (`brew install node@22`), ha nincs.

### 2.2 A kód letöltése

```sh
mkdir -p ~/Applications
git clone https://github.com/pcsepregi/gms.git ~/Applications/gms
cd ~/Applications/gms
```

### 2.3 Telepítés

```sh
scripts/install.sh
```

A szkript lépései (mindegyik többször is futtatható, a meglévő adatokat nem írja felül):

| # | Lépés | Mit csinál |
|---|---|---|
| 1 | Node.js 22 | Megkeresi (Homebrew `node@22`, vagy a PATH-on lévő 22-es), ha nincs, telepíti |
| 2 | Build | `npm ci`, `npm run build` (néhány perc) |
| 3 | Mappák | `~/Library/Application Support/GMS` (adatok, képek) és `~/Library/Logs/GMS` (napló) |
| 4 | Mentési mappa | Megkérdezi a OneDrive `GMS` mappát, beírja a `config.json`-ba |
| 5 | Import | Egyszer, csak üres adatbázisba betölti az Excelt (ET-01: 376 sor, 210 megvan, 166 hiányzik) |
| 6 | LaunchAgent | `~/Library/LaunchAgents/local.gms.server.plist`, betöltés `launchctl bootstrap gui/$UID`-dal |
| 7 | Ellenőrzés | Legfeljebb 30 mp-ig várja, hogy a `/api/health` válaszoljon, és összesítőt ír |
| 8 | Próbamentés | Egy mentés a OneDrive mappába, hogy kiderüljön, kell-e macOS jogosultság |

Végül megnyitja a `http://127.0.0.1:4747` címet a böngészőben.

Kérdések nélküli futtatás (ha már tudjuk az utakat):

```sh
scripts/install.sh --yes \
  --excel ~/Downloads/<excel fájl>.xlsx \
  --backup-dir ~/Library/CloudStorage/OneDrive-<fiók>/GMS
```

További kapcsolók: `--skip-import` (import nélkül), `--no-launchd` (automatikus indítás nélkül), `--no-open` (ne nyissa meg a böngészőt), `--skip-build` (ha már le van fordítva).

### 2.4 Állapot ellenőrzése bármikor

```sh
cd ~/Applications/gms && npm run health
```

Példa kimenet:

```
A GMS fut: http://127.0.0.1:4747 (verzió: 0.1.0)
Adatbázis: /Users/…/Library/Application Support/GMS/gms.sqlite
Kártyák: 376 (megvan: 210, hiányzik: 166)
Képek: pontos …, más nyelvű …, nincs …, hibás …, folyamatban …
Mentés: utolsó sikeres … (cél: /Users/…/OneDrive-…/GMS)
```

A képgyűjtés az első indítás után a háttérben fut, a "folyamatban" szám fokozatosan csökken. Ha végzett, a számokat beírjuk az `operations.md`-be (ET-03).

### 2.5 Frissítés és eltávolítás

```sh
scripts/update.sh      # mentés, git pull (main), npm ci, build, újraindítás, ellenőrzés
scripts/uninstall.sh   # leállítás, a LaunchAgent törlése; az adatokat és a mentéseket megtartja
```

A frissítés előtt két másolat készül: egy helyi (`gms.sqlite.pre-update-<időbélyeg>` az adatmappában) és egy OneDrive mentés. Ha a frissített szerver nem indul el, a szkript kiírja a visszaállás parancsát.

## 3. Átadás utáni ellenőrzőlista (tesztspec ET-01…ET-12)

| Kód | Ellenőrzés | Ki |
|---|---|---|
| ET-01 | Az import összesítője: 376 sor, 210 megvan, 166 hiányzik; nyelvenként egyezik az Excellel | projekt |
| ET-02 | 10 véletlen kártya összevetése az Excellel | projekt, Pali ránéz |
| ET-03 | Képgyűjtés vége, darabszámok az `operations.md`-ben, 10 kép szemmel | projekt |
| ET-04 | `http://127.0.0.1:4747` betölt, `npm run health` rendben | projekt |
| ET-05 | Mac újraindítása, bejelentkezés után az app külön teendő nélkül elérhető | **Pali** indítja újra |
| ET-06 | A szerverfolyamat leállítása (`kill`), 30 mp-en belül újra fut | projekt |
| ET-07 | Egy másik eszközről (pl. telefon ugyanazon a Wi-Fin) a `http://<Mac IP-címe>:4747` nem érhető el | **Pali** próbálja ki |
| ET-08 | "Mentés most" a Beállításokban: a fájlok megjelennek a OneDrive `GMS` mappában | projekt, Pali ránéz |
| ET-09 | Másnap: elkészült az automatikus napi mentés | projekt (másnap) |
| ET-10 | Visszaállítás próba egy tesztmásolaton (`operations.md` 4.) | projekt |
| ET-11 | Frissítés `update.sh`-val: előtte mentés, a kártyák száma nem változik | projekt |
| ET-12 | Kinézet átnézése Safariban, világos és sötét módban | **Pali** |

A LaunchAgent viselkedését (betöltés, újraindulás `kill` után, frissítés, eltávolítás, csak 127.0.0.1) a CI minden PR-en egy macOS gépen is lefuttatja (`scripts/smoke-install.sh`, T-INS-03…08), így a Macen várhatóan csak a gépfüggő dolgok (Homebrew, OneDrive jogosultság, valódi Excel, képforrások) okozhatnak meglepetést.

## 4. Hibaelhárítás telepítéskor

| Tünet | Teendő |
|---|---|
| "Nincs Node 22 és Homebrew sem" | Homebrew telepítése (https://brew.sh), utána `scripts/install.sh` újra |
| "A 4747-es porton már fut egy GMS szerver" | Egy kézzel indított szerver fut (pl. egy Terminál ablakban). Állítsd le (Ctrl+C), majd újra |
| "A szerver 30 mp alatt sem indult el" | A szkript kiírja a napló utolsó sorait; részletek: `~/Library/Logs/GMS/gms.log` és `launchd.err.log` |
| A próbamentés nem sikerült | A hiba szövege kiíródik. Ha jogosultsági hiba: 1. rész 5. pont, utána "Mentés most" a Beállításokban |
| A LaunchAgent állapota | `launchctl print gui/$(id -u)/local.gms.server` (a `state = running` sor a lényeg) |
