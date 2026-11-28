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

## Közvetlen keresés setkóddal (2026-11-28)

A TCGdex-ben több lapnál (pl. a japán ex lapoknál) hiányzik a Pokémon országos sorszáma,
ezért a sorszám szerinti lista nem adja vissza őket. A képkereső ezért először közvetlenül
kéri le a lapot: `/{nyelv}/cards/{set}-{szám}`, ha a nyelvben van a setkóddal egyező
azonosítójú set (kis-/nagybetűtől függetlenül, pl. `SV4A` → `SV4a`, vagy a `SET_MAP`
szerint). Ha a lap megvan, de nincs képe, a tartalék nyelvek jönnek (angol, japán, …).

Mire jó a TCGdex (2026-11-28-i felmérés a Macről): képek csak angol, európai, latin-amerikai
és japán lapokhoz vannak. A hagyományos kínai, thai és indonéz lapok szerepelnek, de kép
nélkül; a koreai és egyszerűsített kínai lapok egyáltalán nincsenek benne. Ezeknél a
japán megfelelő képe jöhet tartalékként (azonos setkód és szám esetén, pl. SV1S, SV3, SV4a).

Javítás után a kép nélküli lapok újrakeresése: `npm run ops -- images-retry`.

## Hivatalos ázsiai és koreai források, Limitless (2026-11-28)

A TCGdex után, ugyanabban a sorrendben minden nyelvre (saját nyelv, majd tartalékok):

| Forrás | Nyelv | Hogyan keres |
| --- | --- | --- |
| asia.pokemon-card.com | thai (`th`), indonéz (`id`), hagyományos kínai (`zh-tw` → `tw`) | Névkeresés a helyi névvel (`LOCAL_POKEMON_NAMES` a `config.ts`-ben; ha nincs, a kártya neve), a találatok részletes oldalán a gyűjtői szám és a set jelének fájlneve (pl. `sv4a_th.png` → SV4A) dönt. |
| pokemoncard.co.kr | koreai (`ko`) | A kép címe a setkódból és a 3 jegyű számból áll össze (`wmimages/SV/SV1S/SV1S_068.webp`); csak SV setkódokra. |
| limitlesstcg.com | japán (`ja`) | A kép címe a setkódból kötőjel nélkül (SV-P → SVP) és a számból (`tpc/SVAL/SVAL_9_R_JP.png`); a kezdőpaklik és promók is megvannak. |

Az egyszerűsített kínai (zh-cn) lapokhoz nincs hivatalos adatbázis; ezekhez a kártya
részleteinél a "Saját kép megadása" való. A képek jogai a Pokémon / Nintendo / Creatures /
GAME FREAK tulajdonában vannak; az alkalmazás csak helyi, személyes használatra tölti le őket.
