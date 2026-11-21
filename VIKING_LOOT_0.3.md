# Viking Loot 0.3 – Fjordarna: nya mekaniker, stjärnor och hjälp

> **Status (2026-11-21):** Fas 1 klar: regelmotorn stöder alla nya mekaniker och är testad. Fas 2–4 återstår (se 7).

## Syfte

0.2 gjorde Viking Loot till ett riktigt pusselspel med 12 banor. 0.3 ska ge spelet **bredd och livslängd**:

- fyra nya pusselelement som ändrar hur man tänker kring ordningen,
- en andra värld, *Fjordarna*, där varje element introduceras och sedan kombineras,
- stjärnor och en karta som ger skäl att spela om banor,
- hjälp när man kör fast (ångra, tips och korta introduktioner),
- mer liv i grafiken och ljudet.

Grundprinciperna från 0.2 gäller fortfarande: regelmotorn är ren och testad, varje bana verifieras av lösaren och animationer spelar bara upp regelmotorns händelser.

## 1. Nya mekaniker

Alla nya egenskaper är valfria i bandatan. Banorna 1–12 beter sig exakt som i 0.2, vilket kontrolleras av ett regressionstest.

### 1.1 Hus – tål två hugg

- Ett hus har en färg och `hits: 2`.
- Varje hugg kostar vikingen **en bärplats**. Första hugget bryter upp huset (händelsen `hit`), andra hugget tar bytet (`collect`).
- Huset räknas som plundrat först efter sista hugget. Det som blockeras av huset frigörs först då.
- En viking med två lediga platser tar ett helt hus. Två vikingar av samma färg kan dela på det.

### 1.2 Stenhinder

- En sten har ingen färg och kan inte plundras.
- Den blockerar på vanligt sätt (andra objekt har stenen i `blockedBy`).
- Stenen har en lista `clearedBy`. Den **rasar av sig själv** så fort **något** av objekten i listan plundras (händelsen `crumble`). Det är ELLER-logik, till skillnad från `blockedBy`, som kräver att alla blockerare är borta.
- Att stenen rasar kostar ingen bärplats och kräver ingen viking.
- Stenar räknas inte till vinstvillkoret.
- Valideringen kräver att varje sten har minst ett objekt i `clearedBy` som inte står bakom stenen själv.

### 1.3 Specialvikingar

| Viking | Kö-post | Regel |
|---|---|---|
| **Jarl** | `jarl(R)` | Bär **3** i stället för 2. Kortet visar 👑 och "BÄR 3". |
| **Flerfärgad** | `WILD` | Har ingen färg från början. Den första tillgängliga skatten den når, framifrån i banans ordning, bestämmer färgen (händelsen `color`). Därefter beter den sig som en vanlig viking i den färgen, även om den hamnar på en väntplats. |

### 1.4 Dolda skatter

- Ett objekt med `hidden: true` visar inte sin färg förrän det blir tillgängligt (händelsen `reveal`).
- Det som är tillgängligt redan från start visas alltid.
- Reglerna och lösaren påverkas inte. Det enda som ändras är vad spelaren vet i förväg.

### 1.5 Ordning inom ett drag (oförändrad från 0.2)

1. Den valda vikingen hugger tills den är full eller inget den får ta finns tillgängligt.
2. Efter varje plundring rasar stenar som rensats, och dolda objekt som blivit tillgängliga visas.
3. De väntande vikingarna försöker i ankomstordning tills ingen kommer vidare.
4. Den nya vikingen försöker igen. Är den fortfarande inte full sätter den sig, och om det fyller tredje väntplatsen är räden förlorad.
5. Vinst går före förlust.

## 2. Stjärnor

- `GameState.waits` räknar hur många gånger en viking har satt sig på en väntplats under banan.
- Lösaren räknar ut `minWaits`, det minsta antalet väntningar på någon vinnande väg. Det värdet är banans **par**.
- **3★** = vinst med högst par väntningar · **2★** = vinst med högst par + 1 · **1★** = annan vinst.
- `par` lagras i bandatan, och ett test kontrollerar att det stämmer med lösaren.
- Bästa resultat per bana sparas i localStorage (`viking-loot-0.3-progress`). Upplåsningen från 0.2 följer med.

## 3. Karta

- Knappraden för banval ersätts av en karta med två världar: **Kusten** (bana 1–12) och **Fjordarna** (bana 13–24).
- Varje bana är en ö på en slingrande stig och visar sina stjärnor. Låsta banor har ett hänglås.
- Fjordarna låses upp när bana 12 är vunnen.

## 4. Hjälp för spelaren

- **Ångra:** tar tillbaka senaste draget. Det går inte medan något animeras, och antalet ångringar är obegränsat. Stjärnorna räknas på vinstläget, så ångrade drag kostar inget.
- **Tips:** pekar ut ett drag som fortfarande leder till vinst, och föredrar drag med så få väntningar som möjligt. Det beräknas med `hint()` i `solver.ts`, och rätt kort studsar. Om räden inte längre går att vinna står det "Inget drag räddar räden – ångra eller börja om".
- **Introduktion:** första gången en ny mekanik dyker upp visas ett kort överlägg med bild och en mening ("Nytt: Hus – tål två hugg"). Att det har visats sparas i localStorage.

## 5. Grafik och ljud

- Nya 3D-modeller i samma Blender-pipeline:
  - ett uppbrutet hus (frame efter första hugget),
  - en sten och en sten med sprickor,
  - en dold skatt under presenning med ett "?",
  - Jarl Harald (mantel och krona, i tre färger),
  - Ylva, den flerfärgade vikingen (randig tunika),
  - animationerna `victory` och `fail` för alla vikingar.
- Ön får en brygga och några små hus som dekor. Seglet får inte skymma den främre mittskatten.
- Effekter: sten som rasar (damm och fragment), presenning som blåser av, ring i den valda färgen när Ylva väljer färg.
- Bakgrundsmusiken syntetiseras som ljudeffekterna. Musik och effekter slås på och av var för sig.
- Alla bildfiler är WebP och tillsammans högst cirka 1,5 MB.

## 6. Banor – Fjordarna (13–24)

| # | Lär ut | Kan förloras? |
|---|---|---|
| 13–14 | Hus | 13 nej, 14 ja |
| 15–16 | Stenhinder | 15 nej, 16 ja |
| 17–18 | Jarl | 17 nej, 18 ja |
| 19–20 | Flerfärgad viking | 19 nej, 20 ja |
| 21–22 | Dolda skatter | 21 nej, 22 ja |
| 23–24 | Allt blandat (final) | ja |

- Banorna tas fram med `npm run generate-levels`, utökad med de nya elementen.
- Varje bana verifieras av lösaren: den ska vara vinnbar, ha en vinstandel inom målintervallet (cirka 40 % ner till 15 %) och gå att förlora om man alltid väljer den främsta vikingen.

## 7. Faser

1. **Regelmotor och tester** – klar. Nya fält, händelser, `minWaits` och `hint()`, enkel tillfällig grafik i scenen samt 10 nya tester (totalt 31).
2. **Stjärnor, karta och hjälp** – `par` i bandatan, ny sparnyckel, `LevelMap.vue`, ångra (`RaidScene.rebuild(state)`), tips och introduktioner.
3. **Grafik och ljud** – nya modeller och animationer, dekor på ön, musik.
4. **Fjordarna** – generatorn utökas och bana 13–24 läggs till.

Varje fas avslutas med `npm test`, `npm run build`, kontroll i webbläsaren och commit + push, som deployas till GitHub Pages.

## 8. Acceptanskriterier

- [x] Hus kräver två hugg, kan delas mellan vikingar och blockerar tills de är tagna.
- [x] Stenar rasar när något av objekten i `clearedBy` plundras, kostar ingen kapacitet och krävs inte för vinst.
- [x] Jarlen bär tre. Den flerfärgade vikingen låser sin färg vid första plundringen, även på väntplats.
- [x] Dolda skatter visas när de blir tillgängliga och ändrar inte utfallet.
- [x] Banorna 1–12 ger samma resultat i lösaren som i 0.2.
- [x] Lösaren ger par (`minWaits`) och tips (`hint`) som leder till vinst.
- [ ] Stjärnor delas ut enligt par och sparas.
- [ ] Kartan visar båda världarna, stjärnor och upplåsning.
- [ ] Ångra och tips fungerar på mobil.
- [ ] Varje ny mekanik har en introduktion och en egen 3D-grafik.
- [ ] Banorna 13–24 är spelbara, och varje mekanik förekommer i minst en bana som går att förlora.
- [ ] Bildfilerna är tillsammans högst cirka 1,5 MB.

## 9. Utanför scope för 0.3

- Backend, konton, köp eller annonser.
- Slumpade banor i spelet. Generatorn används bara under utveckling.
- Fler än två världar.
