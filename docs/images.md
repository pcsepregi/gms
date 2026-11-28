# Kártyaképek (M5)

A képgyűjtő a szerveren belüli háttérsor (`packages/server/src/images/`). Az alábbiak a
technikai spec 7. fejezetét egészítik ki a megvalósítás részleteivel.

## Működés

- Minden `image_status = 'pending'` kártyát egyesével dolgoz fel. A sor az adatbázisban él,
  ezért újraindítás után is folytatódik; percenként újra megnézi a függő tételeket (import után
  is felveszi őket).
- Új kártya mentésekor, a képet befolyásoló mező módosításakor és a "Kép újrakeresése" gombra
  azonnal indul.
- Egyszerre egy kérés fut, két kérés kezdete között legalább 1 másodperc telik el.
- Keresési sorrend: (1) a kártya nyelvén TCGdex, majd Pokémon TCG API (csak angolra),
  (2) a megjegyzés `Forrás:` linkjének `og:image` képe, ha kártya arányú (≈ 0,72) és legalább
  400 px magas, (3) tartalék: angol, japán, majd a többi nyelv, (4) `none` és helykitöltő.
- A TCGdexben a Pokémon országos sorszáma (dexId) alapján listázza az adott nyelvű lapokat,
  majd kártyaszám és set szerint választ. A set egyezése: `set-map.ts` kézi leképezés, a
  setkód, a setnév, vagy a kártyaszám nevezője (a set hivatalos lapszáma).
- Hálózati hiba: `error`, a következő nyelveket már nem próbálja. A forrás 5xx hibája találat
  nélkül szintén `error`. Az `error` tételek 24 óra után újra sorba kerülnek. Kézi újrakeresés
  hibájakor a meglévő kép megmarad.
- Tárolás: `images/{id}-{hash}.webp` (legfeljebb 734×1024) és `…-thumb.webp` (320 px). A rács a
  bélyegképet, a részletek panel a nagy képet használja.

## Lefedettség ellenőrzése a Macen (ET-03)

A felhőből a képforrások nem érhetők el, ezért a valós lefedettség csak a Macen derül ki.
A Beállítások oldal "Kártyaképek" blokkja mutatja a pontos / tartalék / nincs kép / hiba /
folyamatban darabszámokat. Ha sok kártya `nincs kép` vagy tartalék, a hiányzó setekhez a
`packages/server/src/images/set-map.ts` fájlba kell felvenni a leképezést (setkód → TCGdex
set-azonosítók), vagy a szűrővel (Kép: tartalék / nincs) az érintett lapokat kell megnézni.

## Ismert korlátok

- A finish (pl. reverse holo) nem része az egyezésnek: a források a normál és a reverse lap
  képét általában azonosan adják.
- A kliens a kártyalistát 3 másodpercenként frissíti, amíg van `pending` kártya (a spec
  kártyánkénti lekérdezést ír, a teljes lista helyben ~5 ms alatt jön, így egyszerűbb).
