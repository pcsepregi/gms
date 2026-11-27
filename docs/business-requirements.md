# GMS – Lechonk & Oinkologne Grand Master Set webapp

**Üzleti igény (Business Requirements)**

| | |
|---|---|
| Tulajdonos | Pali |
| Verzió | 1.0 (első változat) |
| Dátum | 2026-11-27 |
| Állapot | Jóváhagyásra vár |

---

## 1. Háttér

Pali a Lechonk és Oinkologne Pokémon TCG kártyák teljes ("master set") gyűjteményét építi, minden nyelven és minden nyomási változatban. A gyűjteményt jelenleg egy Excel munkafüzet tartja nyilván (`LECHONK_OINKOLOGNE_MASTER_DATABASE_FINAL_MASTER.xlsx`), amely:

- kb. 376 kártyasort tartalmaz 13 nyelven (angol, francia, német, olasz, spanyol, latin-amerikai spanyol, portugál, japán, koreai, egyszerűsített kínai, hagyományos kínai, thai, indonéz),
- egy dashboard lapon nyelvenkénti készültséget mutat (jelenleg kb. 56%),
- egy variáns-szótárt tartalmaz a nyomási változatok (finish) jelentésével,
- egy hiánylistát (kutatási teendőket) is vezet.

Az Excel kezelése nehézkes, nem látványos, és nincsenek benne a kártyák képei.

## 2. Cél

Egy **egyszerű, szép, gyorsan használható webapp**, amely Pali MacBookján fut, és amely **átveszi az Excel szerepét: az app lesz a master set egyetlen hiteles forrása.** Az Excel az első betöltés után nem folytatódik.

### Sikerkritériumok

- Pali a gyűjteménye állapotát (mi van meg, mi hiányzik) az appban követi, az Excelt többé nem nyitja meg.
- Egy lap "megvan" jelölése vagy egy új lap felvétele néhány másodperc alatt elvégezhető.
- A dashboard egy pillantással megmutatja, hol tart a gyűjtés.
- Adatvesztés nem fordulhat elő (napi mentés).

## 3. Felhasználó

Egyetlen felhasználó: **Pali**, a saját MacBookján, böngészőből. Nincs regisztráció, bejelentkezés vagy több felhasználó kezelése.

## 4. Hatókör

### 4.1 Benne van

- Az Excel adatainak egyszeri betöltése (migráció).
- Dashboard statisztikákkal.
- Kártyalista képekkel, kereséssel és szűréssel.
- Kártya megvan / nincs meg jelölése.
- Új kártya (sor) felvétele, meglévő szerkesztése és törlése.
- Kártyaképek automatikus gyűjtése a webről.
- Export.
- Napi automatikus mentés OneDrive-ra.
- Világos és sötét mód.
- Teljes "end to end" szállítás: tervezés, tesztek, megvalósítás, dokumentáció, telepítés és futtatás a Macen.

### 4.2 Nincs benne (most)

- Darabszám (duplikátumok, cserélhető lapok) nyilvántartása.
- Beszerzési dátum, ár, érték.
- Kutatási munkafolyamat (CHECK státusz, hiánylista, bizonyítékok kezelése). A sorokat adottnak vesszük, a bizonytalanság a megjegyzésbe írható.
- Tömeges műveletek (több lap egyszerre jelölése). Ha később igény lesz rá, külön feature kérésként jön.
- Excel újraimportálása az első betöltés után.
- Elérés más eszközről (telefon, másik gép) vagy az internetről.
- Többnyelvű felület (csak magyar).

## 5. Adatok: egy kártya

| Mező | Kötelező | Leírás | Példa |
|---|---|---|---|
| Megvan | igen | Igen / nem | Igen |
| Pokémon | igen | Melyik Pokémon. Kezdetben Lechonk vagy Oinkologne, de bővíthető (lásd K-10) | Lechonk |
| Set / termék | igen | A kiadás vagy termék neve | Scarlet & Violet |
| Set kód | nem | A set rövid kódja | SVI |
| Kártyaszám | igen | Helyi kártyaszám | 154/198 |
| Nyomási változat (finish) | igen | A variáns-szótárból választható, új érték is felvehető | Reverse Holo |
| Nyelv | igen | A kártya nyelve | English |
| Megjegyzés | nem | Szabad szöveg (pl. mennyire biztos a sor, honnan származik) | |
| Kép | nem | A kártya képe, automatikusan gyűjtve (lásd K-07) | |
| Azonosító | automatikus | Egyedi azonosító a fenti mezőkből generálva, a felhasználónak nem kell kitöltenie | EN-Lechonk-154/198-Reverse_Holo |

Ugyanaz a Pokémon + set + kártyaszám + finish + nyelv kombináció csak egyszer szerepelhet.

### 5.1 Az Excelből megszűnő oszlopok

| Excel oszlop | Mi lesz vele |
|---|---|
| Qty | Kimarad (csak megvan / nincs meg számít) |
| Status (CONFIRMED / CHECK) | Kimarad. A CHECK státuszú sorok megjegyzésébe bekerül, hogy "ellenőrizendő" |
| Region | Kimarad |
| Source / Link | Kimarad mezőként, de a link alapértelmezésben bekerül a megjegyzésbe (Pali később törölheti) |
| Notes | Megjegyzés lesz |

## 6. Funkcionális követelmények

### K-01 Adatmigráció az Excelből
- Az app első indításakor (vagy telepítéskor) a MASTER SET lap összes sora betöltődik.
- A "YES" / "yes" értékek egyaránt "megvan"-ként kerülnek át.
- A betöltés után Pali egy összesítést lát (hány sor, hány megvan), ami egyezik az Excel MASTER SET lapjával.
- A variáns-szótár (VARIANT DICTIONARY) is betöltődik, a finish értékek leírásával együtt.

### K-02 Dashboard
- Az app nyitóoldala. Látványos, mégis letisztult.
- Legalább a következőket mutatja:
  - teljes készültség (megvan / összes, százalékban),
  - készültség nyelvenként,
  - készültség Pokémononként (Lechonk / Oinkologne),
  - készültség setenként,
  - készültség nyomási változatonként,
  - a teljességhez legközelebb álló nyelvek / setek ("már csak 1-2 lap hiányzik"),
  - legutóbb "megvan"-ra állított lapok.
- A dashboard elemeire kattintva a megfelelő szűrt kártyalistára lehet ugrani (pl. "német, hiányzik").

### K-03 Kártyalista
- Az összes kártya áttekinthető listában vagy rácsban, képpel.
- Ránézésre látszik, hogy egy lap megvan-e (a hiányzó lapok vizuálisan elkülönülnek).

### K-04 Keresés és szűrés
- Gyors, modern, kézre álló keresés: gépelés közben azonnal szűr (pl. set névre, kártyaszámra, megjegyzésre).
- Szűrés kombinálható feltételekkel: Pokémon, nyelv (több is egyszerre), set, nyomási változat, megvan / hiányzik.
- Az aktív szűrők jól láthatók és egy mozdulattal törölhetők.
- Rendezés legalább set, kártyaszám és nyelv szerint.

### K-05 Megvan / nincs meg jelölése
- Egy kártya állapota egyetlen kattintással átváltható a listából és a kártya részleteiből is.
- A változás azonnal megjelenik a dashboardon.

### K-06 Kártya felvétele, szerkesztése, törlése
- Új kártya felvétele űrlapon az 5. fejezet mezőivel. A választható értékeknél (Pokémon, nyelv, set, finish) a meglévő értékek felajánlódnak, de új is megadható.
- Az app figyelmeztet, ha a kártya már szerepel (duplikátum).
- Meglévő kártya bármely mezője szerkeszthető.
- Kártya törölhető, megerősítés után.
- A megjegyzés minden kártyánál szabadon írható.

### K-07 Kártyaképek
- A kártyákhoz az app a webről gyűjt képet, a lehető legpontosabb egyezéssel (ugyanaz a lap, ugyanazon a nyelven, ugyanabban a változatban).
- A meglévő kártyák képei a telepítés / első betöltés során gyűlnek össze.
- Új kártya felvételekor az app automatikusan megpróbál képet keresni hozzá.
- Ha pontos kép nem található, az app ugyanannak a lapnak egy másik nyelvű képét használja, és ezt jelzi. Ha egyáltalán nincs kép, egységes helykitöltő jelenik meg.
- A képek helyben tárolódnak, hogy az app internet nélkül is megjelenítse őket.

### K-08 Export
- A teljes gyűjtemény exportálható Excel-be (és/vagy CSV-be).
- Az aktuálisan szűrt lista (pl. a hiánylista egy nyelvre) is exportálható, hogy például egy kereskedőnek el lehessen küldeni.

### K-09 Napi mentés OneDrive-ra
- Az app naponta automatikusan menti a teljes adatbázist (és a képeket) a Macen csatolt OneDrive "GMS" mappájába.
- A mentés visszaállítható; a visszaállítás menete dokumentálva van.
- Ha a mentés nem sikerül, az app ezt jelzi.

### K-10 Bővíthetőség más Pokémonokkal
- Az app ne legyen Lechonkra és Oinkologne-ra bedrótozva: új Pokémon felvehető, és a dashboard / szűrők automatikusan kezelik.

## 7. Nem funkcionális követelmények

### 7.1 Futtatás és elérés
- Az app kizárólag Pali MacBookján fut.
- A Mac indulásakor automatikusan elindul, és mindig elérhető, külön teendő nélkül.
- Csak erről a Macről, böngészőből érhető el; más gépről vagy az internetről nem.

### 7.2 Megjelenés
- Egyszerű, letisztult, modern design, amely első látásra **nem "AI-szagú"** (kerüli a generikus sablonos kinézetet: túlzott színátmeneteket, csillogó kártyákat, emoji-dekorációt).
- Világos és sötét mód, váltható; alapértelmezésben a Mac beállítását követi.
- A felület nyelve magyar.

### 7.3 Teljesítmény és használhatóság
- Kereséskor, szűréskor és jelöléskor a válasz azonnalinak hat.
- Az app internetkapcsolat nélkül is teljesen használható (kivéve az új képek keresését).

### 7.4 Megbízhatóság
- Minden változás azonnal, tartósan mentődik.
- Napi mentés (K-09).

### 7.5 Szállítás
- A projekt része a tervezés, az automatizált tesztek, a megvalósítás, a felhasználói és üzemeltetési dokumentáció, valamint a telepítés és futtatás a Macen.
- A változtatások a GitHub repóba (`pcsepregi/gms`) pull requesten keresztül kerülnek be.

## 8. Feltételezések és megjegyzések

- Az Excel dashboard összesítői között kisebb eltérés van (376 vs. 372 sor). Az irányadó a MASTER SET lap tartalma.
- A FINAL GAP LIST (kutatási hiánylista) nem kerül át az appba.
- A képgyűjtés nyilvános forrásokból történik, személyes használatra. Ritka változatokhoz (pl. stampelt, thai, indonéz kiadások) várhatóan sokszor csak a tartalék (másik nyelvű) kép lesz elérhető.
- A OneDrive mappa a Macen helyben csatolva van, így a mentés egyszerű fájlmásolás.

## 9. Lehetséges későbbi bővítések

- Tömeges jelölés.
- Saját fotó feltöltése egy laphoz.
- Darabszám / duplikátumok kezelése.
