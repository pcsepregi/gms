# GMS – User storyk

| | |
|---|---|
| Tulajdonos | Pali |
| Verzió | 1.0 (első változat) |
| Dátum | 2026-11-27 |
| Alapja | [Üzleti igény](business-requirements.md), [Technikai specifikáció](technical-spec.md) |
| Állapot | Jóváhagyásra vár |

Formátum: **Mint gyűjtő, szeretném …, hogy …** A "gyűjtő" mindig Pali. Minden storyhoz elfogadási feltételek (EF) tartoznak; a hozzájuk tartozó tesztek a [Tesztspecifikációban](test-spec.md) a story azonosítójával vannak jelölve.

Prioritás: **M** = kötelező az első kiadáshoz, **K** = kívánatos, de az első kiadás nélküle is használható.

## Áttekintés

| ID | Story | Követelmény | Mérföldkő | Prioritás |
|---|---|---|---|---|
| S-01 | Excel egyszeri betöltése | K-01 | M1 | M |
| S-02 | Import összesítő | K-01 | M1 | M |
| S-10 | Kártyák rácsnézetben | K-03 | M2 | M |
| S-11 | Táblázatos nézet | K-03 | M2 | K |
| S-12 | Azonnali keresés | K-04 | M2 | M |
| S-13 | Kombinált szűrők | K-04 | M2 | M |
| S-14 | Aktív szűrők és törlésük | K-04 | M2 | M |
| S-15 | Rendezés | K-04 | M2 | M |
| S-16 | Szűrt lista megosztható URL-lel | K-02, K-04 | M2 | K |
| S-20 | Megvan / nincs meg egy kattintással | K-05 | M2 | M |
| S-21 | Új kártya felvétele | K-06 | M3 | M |
| S-22 | Duplikátum figyelmeztetés | K-06 | M3 | M |
| S-23 | Kártya szerkesztése, megjegyzés | K-06 | M3 | M |
| S-24 | Kártya törlése | K-06 | M3 | M |
| S-30 | Teljes készültség a dashboardon | K-02 | M4 | M |
| S-31 | Bontások: nyelv, Pokémon, set, finish | K-02 | M4 | M |
| S-32 | Majdnem kész csoportok és legutóbb megszerzett lapok | K-02 | M4 | M |
| S-33 | Dashboardról a szűrt listára | K-02 | M4 | M |
| S-40 | Képek a meglévő kártyákhoz | K-07 | M5 | M |
| S-41 | Kép új kártyához | K-07 | M5 | M |
| S-42 | Tartalék kép és helykitöltő | K-07 | M5 | M |
| S-43 | Kép újrakeresése | K-07 | M5 | K |
| S-50 | Teljes export | K-08 | M6 | M |
| S-51 | Szűrt lista exportja | K-08 | M6 | M |
| S-52 | Napi automatikus mentés | K-09 | M6 | M |
| S-53 | Mentés állapota és hibajelzés | K-09 | M6 | M |
| S-54 | Visszaállítás mentésből | K-09 | M6 | M |
| S-55 | Kézi mentés | K-09 | M6 | K |
| S-60 | Automatikus indulás | 7.1 | M7 | M |
| S-61 | Csak erről a Macről elérhető | 7.1 | M7 | M |
| S-62 | Világos és sötét mód | 7.2 | M2 | M |
| S-63 | Új Pokémon felvétele | K-10 | M3 | M |
| S-64 | Finish-szótár megtekintése, bővítése | K-01, K-06 | M3 | K |

---

## 1. Adatmigráció

### S-01 Excel egyszeri betöltése
Mint gyűjtő, szeretném, hogy az Excelben vezetett összes kártyám átkerüljön az appba, hogy ne kelljen semmit újra begépelnem.

EF:
1. A MASTER SET lap minden nem üres sora egy kártya lesz (jelenleg 376).
2. `YES` és `yes` egyaránt "megvan"; minden más "nincs meg".
3. A Pokémon, set, setkód, kártyaszám, finish és nyelv értékek változatlanul átkerülnek (a kártyaszám vezető nullái megmaradnak).
4. A megjegyzés tartalmazza az eredeti Notes szöveget; CHECK státusznál az első sor "Ellenőrizendő."; ha volt forráslink, az utolsó sor "Forrás: <link>".
5. A Qty, Region, Status és Master ID oszlopok önálló mezőként nem jelennek meg sehol.
6. A VARIANT DICTIONARY finish értékei leírással együtt bekerülnek; a MASTER SET-ben használt, de a szótárban hiányzó finish értékek leírás nélkül.
7. Ha az adatbázisban már van kártya, az import nem fut le, és erről üzenetet ad.
8. Hibás sor (pl. ismeretlen nyelv) esetén egyetlen kártya sem kerül be, és a hibaüzenet megnevezi a sort.

### S-02 Import összesítő
Mint gyűjtő, szeretném látni, mi töltődött be, hogy biztos legyek benne, hogy semmi nem veszett el.

EF:
1. Az import után összesítő jelenik meg: sorok száma, megvan / hiányzik, nyelvenkénti bontás, újonnan felvett finish értékek.
2. A jelenlegi fájlnál: 376 sor, 210 megvan, 166 hiányzik.
3. Az összesítő később a Beállítások oldalon is megtekinthető.

## 2. Kártyalista, keresés, szűrés

### S-10 Kártyák rácsnézetben
Mint gyűjtő, szeretném a kártyáimat képekkel, rácsban látni, hogy ránézésre lássam, mi van meg.

EF:
1. Minden kártya megjelenik képpel (vagy helykitöltővel), Pokémon névvel, settel, kártyaszámmal, finish-sel és nyelvvel.
2. A hiányzó lapok szürkék, halványabbak, és "Hiányzik" címkét kapnak; a megvan lapok színesek.
3. A lista 400 kártyánál is akadás nélkül görgethető; a képek görgetés közben töltődnek.
4. Kártyára kattintva megnyílik a részletek panel.

### S-11 Táblázatos nézet
Mint gyűjtő, szeretnék sűrű táblázatos nézetet is, hogy sok sort egyszerre átlássak.

EF:
1. Egy kapcsolóval váltható rács és táblázat között.
2. A táblázat oszlopai: megvan (jelölőnégyzet), kis kép, Pokémon, set, kártyaszám, finish, nyelv, megjegyzés eleje.
3. A választott nézet újranyitáskor is megmarad.

### S-12 Azonnali keresés
Mint gyűjtő, szeretnék gépelés közben keresni, hogy pillanatok alatt megtaláljak egy lapot.

EF:
1. A lista gépelés közben, érezhető késés nélkül szűkül.
2. A keresés kiterjed a Pokémonra, setre, setkódra, kártyaszámra, finish-re, nyelvre (magyarul és angolul), megjegyzésre és azonosítóra.
3. Nem számít a kis-/nagybetű és az ékezet ("nemet" megtalálja a német lapokat).
4. Több szó esetén mindegyiknek egyeznie kell ("német reverse 154").
5. A `/` billentyű a keresőmezőbe ugrik, az `Esc` törli a keresést.
6. Ha nincs találat, ezt a lista jelzi, és felajánlja a szűrők törlését.

### S-13 Kombinált szűrők
Mint gyűjtő, szeretném feltételek szerint szűrni a listát, hogy például csak a hiányzó német és francia reverse holókat lássam.

EF:
1. Szűrhető: Pokémon, nyelv, set, finish (mindegyikből több is választható), állapot (mind / megvan / hiányzik).
2. A különböző szűrők ÉS, egy szűrőn belül a választott értékek VAGY kapcsolatban vannak.
3. A szűrők a kereséssel együtt is működnek.
4. A találatok száma látszik: "N kártya, ebből M hiányzik".

### S-14 Aktív szűrők és törlésük
Mint gyűjtő, szeretném látni, milyen szűrők aktívak, és egy mozdulattal törölni őket.

EF:
1. Minden aktív szűrő címkeként látszik a keresőmező alatt.
2. Egy címke x gombja azt az egy szűrőt törli.
3. Az "Összes törlése" minden szűrőt és a keresést is törli.

### S-15 Rendezés
Mint gyűjtő, szeretném a listát rendezni, hogy a lapokat a nekem megfelelő sorrendben lássam.

EF:
1. Rendezhető set, kártyaszám, nyelv, Pokémon és utolsó módosítás szerint, növekvő és csökkenő sorrendben.
2. A kártyaszám számként rendeződik (`9/021` a `10/021` előtt).
3. A nyelvek a rögzített sorrendben jelennek meg (angol, francia, német, …).

### S-16 Szűrt lista megosztható URL-lel
Mint gyűjtő, szeretném, hogy a szűrt nézet URL-je megőrizze a szűrőket, hogy könyvjelzőzhessem és a vissza gomb is működjön.

EF:
1. A szűrők és a keresés az URL-ben vannak.
2. Az URL újranyitásakor ugyanaz a szűrt lista jelenik meg.
3. A böngésző vissza gombja az előző szűrési állapotra lép.

### S-20 Megvan / nincs meg egy kattintással
Mint gyűjtő, szeretnék egy kattintással "megvan"-ra állítani egy lapot, hogy a gyűjtést gyorsan vezessem.

EF:
1. A rácsban, a táblázatban és a részletek panelen is egy kattintással átváltható.
2. A változás azonnal látszik, és tartósan mentődik (újratöltés után is megmarad).
3. 5 másodpercig "Visszavonás" lehetőség jelenik meg.
4. Mentési hiba esetén az állapot visszaáll, és hibaüzenet jelenik meg.
5. A dashboard a következő megnyitáskor már az új állapotot mutatja.

## 3. Kártyák kezelése

### S-21 Új kártya felvétele
Mint gyűjtő, szeretnék új keresendő kártyát felvenni, hogy a master set bővülhessen.

EF:
1. Az űrlapon megadható: Pokémon, set, setkód, kártyaszám, finish, nyelv, megvan, megjegyzés.
2. Kötelező: Pokémon, set, kártyaszám, finish, nyelv. Hiányzó mezőnél a mentés nem engedélyezett, és a mező mellett magyar hibaüzenet áll.
3. A Pokémon, set, finish és nyelv mező felajánlja a meglévő értékeket, de új érték is beírható.
4. Ismert set választásakor a setkód kitöltődik.
5. Az új kártya alapból "nincs meg".
6. Mentés után az új kártya megjelenik a listában, és automatikusan elindul a képkeresés.

### S-22 Duplikátum figyelmeztetés
Mint gyűjtő, szeretném, ha az app szólna, ha egy kártya már szerepel, hogy ne legyen kétszer a listában.

EF:
1. Ha a Pokémon + set + kártyaszám + finish + nyelv már létezik, az űrlap figyelmeztet, és linket ad a meglévő kártyára.
2. Az összevetés nem érzékeny a kis-/nagybetűre és a szélső szóközökre.
3. Duplikátum nem menthető (szerkesztéskor sem).

### S-23 Kártya szerkesztése, megjegyzés
Mint gyűjtő, szeretném bármelyik kártya bármely mezőjét javítani, és megjegyzést írni hozzá.

EF:
1. A részletek panelen minden mező szerkeszthető, ugyanazokkal a szabályokkal, mint felvételkor.
2. A megjegyzés többsoros, szabad szöveg (max. 5000 karakter), a benne lévő linkek kattinthatók.
3. Ha a Pokémon, set, kártyaszám, finish vagy nyelv változik, a kép újrakeresése elindul, és az azonosító frissül.
4. A mentés után a változás a listában azonnal látszik.

### S-24 Kártya törlése
Mint gyűjtő, szeretnék törölni egy kártyát, ha tévesen került be.

EF:
1. A törlés a részletek panelen érhető el, és megerősítést kér.
2. Megerősítés után a kártya és a képe eltűnik, a dashboard számai frissülnek.
3. Mégse esetén semmi nem változik.

### S-63 Új Pokémon felvétele
Mint gyűjtő, szeretnék később más Pokémont is gyűjteni, hogy az app ne csak a Lechonkra szóljon.

EF:
1. Új kártyánál új Pokémon név adható meg.
2. Az új Pokémon automatikusan megjelenik a szűrőkben és a dashboard Pokémon-bontásában.
3. A kódban nincs Lechonkra vagy Oinkologne-ra írt szabály (code review ellenőrzi).

### S-64 Finish-szótár megtekintése, bővítése
Mint gyűjtő, szeretném látni a nyomási változatok jelentését, és újat felvenni.

EF:
1. A Beállításokban a finish lista leírásokkal látható, és a leírás szerkeszthető.
2. Új finish az űrlapról (beírással) és a Beállításokból is felvehető.
3. A kártya részletei panelen a finish leírása súgóként megjelenik.

## 4. Dashboard

### S-30 Teljes készültség a dashboardon
Mint gyűjtő, szeretném az app megnyitásakor azonnal látni, hol tart a gyűjtés.

EF:
1. A nyitóoldal a dashboard.
2. Nagy számmal látszik a megvan / összes és a százalék (pl. "210 / 376 · 56%").
3. A számok egyeznek a lista szűretlen állapotával.

### S-31 Bontások: nyelv, Pokémon, set, finish
Mint gyűjtő, szeretném a készültséget bontásban látni, hogy tudjam, merre érdemes gyűjteni.

EF:
1. Nyelvenként (mind a 13), Pokémononként, setenként és finish-enként látszik a megvan / összes és a százalék.
2. A setek listája a hiányzók száma szerint rendezett, és összecsukható.
3. Egy új kártya vagy jelölés után a bontások a következő megnyitáskor frissek.

### S-32 Majdnem kész csoportok és legutóbb megszerzett lapok
Mint gyűjtő, szeretném látni, mi áll a teljességhez legközelebb, és mit szereztem meg legutóbb.

EF:
1. A "Majdnem kész" blokk legfeljebb 6 nem teljes nyelvet vagy setet mutat, a legkevesebb hiányzó lappal kezdve ("Német – még 2 lap").
2. A teljes (100%) csoportok itt nem szerepelnek.
3. A "Legutóbb megszerzett" blokk az utolsó 8 "megvan"-ra állított lapot mutatja képpel, a legfrissebbel kezdve.
4. Az import során "megvan" lapok itt nem jelennek meg, csak az appban jelöltek.

### S-33 Dashboardról a szűrt listára
Mint gyűjtő, szeretnék a dashboard egy elemére kattintva a megfelelő lapokhoz jutni.

EF:
1. Egy nyelvre, setre, Pokémonra vagy finish-re kattintva a lista az adott csoport hiányzó lapjaira szűrve nyílik meg.
2. Egy "Majdnem kész" elemre kattintva a hiányzó lapok jelennek meg.
3. A legutóbb megszerzett lapra kattintva a kártya részletei nyílnak meg.

## 5. Kártyaképek

### S-40 Képek a meglévő kártyákhoz
Mint gyűjtő, szeretném, hogy a kártyáimhoz automatikusan kép kerüljön, hogy ne kelljen egyenként keresgélnem.

EF:
1. Az import után a képgyűjtés a háttérben elindul, az app közben használható.
2. A kép a lehető legpontosabb: ugyanaz a lap, ugyanazon a nyelven.
3. A letöltött képek helyben tárolódnak; internet nélkül is megjelennek.
4. A Beállításokban látszik a képgyűjtés állapota (pontos / tartalék / nincs kép / folyamatban darabszám).

### S-41 Kép új kártyához
Mint gyűjtő, szeretném, hogy egy újonnan felvett kártyához is automatikusan kép kerüljön.

EF:
1. Mentés után a kép helyén "Kép keresése…" látszik.
2. Ha a kép megérkezik, a lista újratöltés nélkül megmutatja.
3. Internet nélkül a kártya kép nélkül mentődik, és a képkeresés később automatikusan újrapróbálkozik.

### S-42 Tartalék kép és helykitöltő
Mint gyűjtő, szeretném, hogy ha nincs pontos kép, legalább a lap másik nyelvű képét lássam, és tudjam, hogy az nem pontos.

EF:
1. Ha a saját nyelvű kép nem található, a lap másik nyelvű képe jelenik meg.
2. A tartalék képen jelvény mutatja a kép nyelvét ("Kép: angol").
3. Ha egyáltalán nincs kép, egységes helykitöltő jelenik meg a Pokémon nevével és a kártyaszámmal.
4. A listában szűrni lehet a tartalék képes és a kép nélküli lapokra.

### S-43 Kép újrakeresése
Mint gyűjtő, szeretném egy kártya képét újra kerestetni, ha rossz vagy hiányzik.

EF:
1. A részletek panelen "Kép újrakeresése" gomb van.
2. Az eredmény (új kép, tartalék, nincs) a panelen megjelenik.

## 6. Export és mentés

### S-50 Teljes export
Mint gyűjtő, szeretném a teljes gyűjteményt Excelbe menteni, hogy az appon kívül is meglegyen.

EF:
1. XLSX és CSV is választható.
2. Az export minden kártyát tartalmaz a következő oszlopokkal: Megvan, Pokémon, Set, Set kód, Kártyaszám, Nyomási változat, Nyelv, Megjegyzés, Azonosító.
3. A fájl magyar Excelben ékezethelyesen nyílik meg (CSV-nél is).
4. A fájlnév tartalmazza a dátumot.

### S-51 Szűrt lista exportja
Mint gyűjtő, szeretném az aktuálisan szűrt listát exportálni, hogy például a hiányzó német lapokat elküldhessem egy kereskedőnek.

EF:
1. A lista Export gombja pontosan a látható kártyákat exportálja, a látható sorrendben.
2. A fájlnév utal a szűrésre (pl. `GMS-hianylista-nemet-2026-11-27.xlsx`).

### S-52 Napi automatikus mentés
Mint gyűjtő, szeretném, hogy az adataim naponta automatikusan mentődjenek a OneDrive-ra, hogy semmi ne vesszen el.

EF:
1. Naponta legalább egy mentés készül a OneDrive `GMS` mappájába, akkor is, ha a Mac éjjel aludt (a mentés a következő ébredéskor pótlódik).
2. A mentés tartalmazza az adatbázist, egy Excel exportot és a képeket.
3. Az utolsó 30 nap mentései és 12 havi mentés megmarad, a régebbiek törlődnek.
4. A mentés nem zavarja az app használatát.

### S-53 Mentés állapota és hibajelzés
Mint gyűjtő, szeretném tudni, ha a mentés nem sikerül.

EF:
1. A Beállításokban látszik az utolsó sikeres mentés ideje és a mentési mappa.
2. Ha az utolsó mentés hibás, vagy 26 óránál régebben volt sikeres mentés, a felület tetején figyelmeztetés látszik, amíg a helyzet meg nem oldódik.

### S-54 Visszaállítás mentésből
Mint gyűjtő, szeretném, ha baj esetén egy korábbi napi állapot visszaállítható lenne.

EF:
1. Egy dokumentált paranccsal bármely meglévő napi mentés visszaállítható.
2. Visszaállítás előtt a jelenlegi adatbázis félrekerül, így a visszaállítás is visszafordítható.
3. Visszaállítás után az app a mentés napi állapotát mutatja (kártyák, jelölések, képek).

### S-55 Kézi mentés
Mint gyűjtő, szeretnék egy gombbal azonnal mentést készíteni, például egy nagyobb módosítás előtt.

EF:
1. A Beállításokban "Mentés most" gomb van, ami visszajelez a sikerről vagy a hibáról.

## 7. Futtatás és megjelenés

### S-60 Automatikus indulás
Mint gyűjtő, szeretném, hogy az app mindig fusson, hogy csak megnyissam a böngészőben.

EF:
1. A Mac bekapcsolása és bejelentkezés után az app külön teendő nélkül elérhető a `http://127.0.0.1:4747` címen.
2. Ha a folyamat leáll, legfeljebb fél percen belül magától újraindul.
3. Palinak semmilyen parancsot nem kell futtatnia a telepítéshez vagy frissítéshez; azt a projekt végzi.

### S-61 Csak erről a Macről elérhető
Mint gyűjtő, szeretném, ha az app csak a saját gépemről lenne elérhető.

EF:
1. Ugyanazon a hálózaton lévő másik gépről az app nem érhető el.
2. Más domainnévvel (DNS rebinding) érkező kéréseket a szerver elutasítja.

### S-62 Világos és sötét mód
Mint gyűjtő, szeretnék világos és sötét módot, hogy este is kellemes legyen használni.

EF:
1. Alapból a Mac beállítását követi, és annak változásakor automatikusan vált.
2. A fejlécben Rendszer / Világos / Sötét között váltható, a választás megmarad.
3. Mindkét módban minden szöveg jól olvasható (WCAG AA kontraszt).
4. A kinézet egyszerű, letisztult, nem tartalmaz színátmenetet, üveghatást, emojit vagy csillogó animációt.
