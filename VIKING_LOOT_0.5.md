# Viking Loot 0.5 – Muspelheim, bossar och engelska

> **Status (2026-11-23):** Version 0.5.0 – fas 1–4 är klara: inställningar och tillgänglighet, regelmotorn för de fyra mekanikerna, Muspelheim med bana 37–48 och berättelsen med de fyra bossarna. Baneditorn och delning av egna öar flyttas till en senare version. Allt är testat, även på Android.

## Syfte

0.4 gav spelet en tredje värld, dagliga räder, prestationer och en installerbar app. 0.5 gör spelet **större, mer personligt och öppet för fler**:

- en fjärde värld, *Muspelheim* (bana 37–48), med fyra nya pusselelement,
- en kort berättelse och en bossräd per värld,
- ~~en baneditor där man bygger egna öar och delar dem med en länk~~ (flyttad till en senare version),
- färgblindläge, vibration och engelska.

Grundprinciperna gäller fortfarande:
- Regelmotorn är ren och testad.
- Varje bana kontrolleras av lösaren.
- Animationer spelar bara upp regelmotorns händelser.

## 1. Inställningar och tillgänglighet

- **⚙️ Inställningar** i en panel ovanpå spelet. Där finns musik, ljudeffekter, vibration, färgblindläge och språk. 🔊 finns kvar som snabbknapp i knappraden.
- **Färgblindläge:** varje lagfärg får en symbol: röd ▲, blå ● och gul ■. Symbolen visas överallt där färgen betyder något, det vill säga på skatter, nycklar, hänglås, vikingkort, kön, väntplatserna och färgskepp.
- **Vibration:** korta pulser när en viking skickas, och mönster vid vinst och förlust. Det fungerar på Android. iOS stöder inte vibration från webben.
- **Engelska:** all text i spelet finns på svenska och engelska, även banornas namn och tips, introduktioner, prestationer och berättelsen. Språket väljs efter telefonens språk och kan ändras i inställningarna.
- **Kod:**
  - `src/game/i18n.ts` innehåller UI-texterna (`t`, `tn`) och de engelska texterna för speldata (`tr`).
  - `src/game/levelTexts.ts` innehåller banornas engelska namn och tips.
  - `src/game/settings.ts` innehåller inställningarna (`viking-loot-settings`).
  - `src/game/haptics.ts` sköter vibrationen.
  - Färgsymbolerna ritas med `drawColorMark` i `art.ts`.

## 2. Nya mekaniker

Alla nya egenskaper är valfria i bandatan. Ett regressionstest kontrollerar att banorna 1–36 beter sig exakt som i 0.4.

### 2.1 Krutfat

- Ett krutfat (`keg: true`, i `stacks()` skrivet `*r`) är en vanlig skatt i sin färg och kostar en bärplats.
- När krutfatet plundras exploderar det (händelsen `explode`). I den egna högen och högarna bredvid händer följande med allt inom en rad från fatet:
  - stenar rasar,
  - is smälter,
  - presenningar blåser av.
- Explosionen tar aldrig bort skatter, så antalet hugg per färg är detsamma.

### 2.2 Tidvatten

- En tidvattenhög (`≈` först i högen, till exempel `'≈rby'`) sköljs av tidvattnet var tredje drag. Den främsta kvarvarande skatten flyttas då längst bak i högen (händelsen `tide`).
- Det sker i början av draget, precis som isen.
- Tidvattenhögar får inte innehålla stenar eller låsta kistor.

### 2.3 Fången i buren

- En bur (`&rb` = röd bur med en blå fånge) plundras som en vanlig skatt i sin färg.
- Då kliver fången fram först i kön och kan väljas direkt (händelsen `free`).

### 2.4 Korpen

- Banan har `raven: N`. I början av var N:e drag flyger korpen in och lyfter bort den viking som har väntat längst. Korpen tar i första hand från huvudskeppet och annars från färgskeppet (händelsen `raven`).
- Det frigör en plats, men vikingens återstående bärplatser försvinner. Därför har banor med korp en extra viking i kön.

### 2.5 Ordning inom ett drag

1. Isen smälter.
2. Tidvattnet vänder (om draget är delbart med 3).
3. Korpen kommer (om draget är delbart med N).
4. Vikingen plundrar, och sedan får de väntande sin chans.

Krutfat och burar verkar direkt när de plundras: explosionen kommer före raset av stenar, och fången ställer sig först i kön mitt i draget.

### 2.6 Kod och tester

- `engine.ts` innehåller nya fält på skatterna (`keg`/`blasts`, `cage`, `tidePile`), `GameState.tides` och `raven`, och `createGame(…, { raven })`.
- `levels.ts`: `startGame(level)` startar en bana med alla inställningar för hela banan. Den används överallt där en bana blir ett spel.
- Lösarens memo-nyckel innehåller tidvattnets ordning. Den följer inte enbart av antalet drag, eftersom det spelar roll om en skatt togs före eller efter att tidvattnet vände.
- Generatorn klarar `kegs`, `tides`, `cages` och `raven`. Ett krutfat som inte når någonting avvisas.
- Tester:
  - ett regressionstest där banorna 1–36 ger exakt samma siffror från lösaren som 0.4-motorn,
  - ett test per mekanik,
  - lösare och tips,
  - validering,
  - att generatorn kan bygga banor med varje mekanik.
- *Iakttagelse inför fas 3:* tidvatten gör banor lättare (fler val), så tidvattenpussel behöver högre högar eller fler mekaniker.

## 3. Muspelheim (bana 37–48)

En vulkanö med svart sten, lavapölar, basaltspiror och små eldflammor. Varje mekanik introduceras på en bana som inte går att förlora och används sedan i ett pussel. Bana 45–47 blandar mekanikerna, och bana 48, *Surts smedja*, är finalen.

| # | Namn | Innehåll | Vinstchans | Par |
|---|---|---|---|---|
| 37 | Krutkällaren | Krutfat (intro) | 100 % | 0 |
| 38 | Svavelgruvan | Två krutfat och två stenar | ca 32 % | 1 |
| 39 | Askstranden | Tidvatten (intro) | 100 % | 0 |
| 40 | Glödvikarna | Två våghögar | ca 36 % | 2 |
| 41 | Fångvaktarens hydda | Bur (intro) | 100 % | 0 |
| 42 | Bojhamnen | Två burar | ca 34 % | 2 |
| 43 | Korpberget | Korpen (intro) | 100 % | 0 |
| 44 | Hugins klippa | Korpen | ca 34 % | 1 |
| 45 | Lavafloden | Krutfat, sten, hus och tidvatten | ca 29 % | 1 |
| 46 | Rökslöjan | Bur, korp och dolda skatter | ca 18 % | 2 |
| 47 | Eldfjället | Krutfat, is, bur, hus och tidvatten | ca 14 % | 2 |
| 48 | Surts smedja | Allt, med Sigrid och jarl (final) | ca 14 % | 1 |

**Grafik (Blender):**
- krutfat och burar i tre färger, där fångens ansikte syns bakom gallret
- korpen med sex bilder för vingslagen
- Muspelheim-ön
- det femte skeppet, Surtsglöd

**I spelet:**
- **Krutfat:** blixt, eldring, gnistor, rök och skakning när fatet smäller.
- **Tidvatten:** våghögar står i en strimma grunt vatten. En våg sveper över högen när tidvattnet vänder, och skatterna glider till sina nya platser.
- **Burar:** fången springer från buren ner till kön.
- **Korpen:** den flyger in, lyfter vikingen och flyger iväg med den.
- **Nedräkning:** överst visas hur många utskick det är kvar till tidvattnet (🌊) och korpen (🐦‍⬛).

**Följdändringar:**
- Dagens räd och den oändliga räden får nivå 3 med Muspelheims mekaniker när världen är klarad.
- Nya prestationer: "Muspelheims herre" och "Krutgubbe" (spräng 25 krutfat).
- Det femte skeppet, Surtsglöd, låses upp vid ★ 130.

**Tidvatten och svårighet:** tidvattnet ger spelaren fler val och gör banorna lättare. Pusslen med tidvatten har därför högre högar (bana 40) eller fler mekaniker.

## 4. Berättelse och bossar

- Ragnar berättar på korta kort med porträtt. Korten visas vid första starten, när man kommer till en ny värld och före och efter varje boss. Man kan läsa dem igen via 📜 på kartan.
- En bossräd per värld låses upp när världen är klarad. Varje boss har en egen regel:

  | Värld | Boss | Regel |
  |---|---|---|
  | Kusten | Havsormen | skeppet har bara två platser |
  | Fjordarna | Jarl Ulvhild | bara jarlar och Ylva i kön, dolda skatter |
  | Isriket | Frostjätten Ymer | nästan allt är fruset |
  | Muspelheim | Eldjätten Surt | kedjor av krutfat och korp |

**Så blev det (fas 4):**

| Boss | Bana | Regel | Vinstchans | Par |
|---|---|---|---|---|
| 🐍 Havsormen | efter Kusten | huvudskeppet har bara två platser (`ships: [{ slots: 2 }]`) | ca 27 % | 1 |
| 🐺 Jarl Ulvhild | efter Fjordarna | bara jarlar och Ylva i kön, nästan allt dolt | ca 20 % | 2 |
| 🧊 Frostjätten Ymer | efter Isriket | nio skatter frusna i vågor, nyckel och kista, rött färgskepp | ca 14 % | 5 |
| 🔥 Eldjätten Surt | efter Muspelheim | krutfat, tidvatten, en bur och korpen var fjärde drag | ca 16 % | 1 |

- Bossarna bygger bara på mekaniker som redan finns, så regelmotorn är oförändrad. De ligger i `src/game/bosses.ts` och togs fram med `npm run generate-levels -- --bosses` (generatorn fick `mainSlots` och `onlySpecial`).
- Bossens stjärnor sparas för sig (`bossStars`), så banornas nummer flyttas inte. En boss låses upp när världens sista bana är vunnen men spärrar inte nästa värld. Bossstjärnorna räknas in i stjärnorna för Skeppsvarvet.
- **I spelet:** bossen reser sig stort över ön och vrålar när räden börjar, och flyttar sedan till hörnet bredvid titeln. En röd mätare under titeln visar hur mycket av bossens skatt som är kvar, och bossen rycker till för varje skatt. Vinner man sjunker bossen i havet, och förlorar man vrålar den.
- **Berättelsen:** 13 kort på svenska och engelska (`src/game/story.ts`) med Ragnars porträtt, och bossens porträtt på bosskorten. Krönikan (📜 på kartan) listar de kort man har sett.
- **Grafik (Blender):** fyra bossfigurer med fyra bildrutor vardera, plus ett porträtt per boss.
- **Prestationer:** "Bossjägare" (besegra alla fyra) och "Ragnarök" (tre stjärnor på alla fyra).
## 5. Baneditor och delning (flyttad till senare version)

Ingår inte i 0.5.0. Idén ligger kvar här till nästa version.

- **Bygga:** man bygger en ö med 3–5 högar, väljer föremål och egenskaper och sätter ihop kön.
- **Kontrollera:** lösaren visar om ön går att vinna, hur stor andel av vägarna som vinner, vilket par den har och om "alltid främsta" förlorar.
- **Spela och dela:** man kan spela ön direkt. "Dela" ger en länk (`…/#o=<kod>`) som öppnar ön hos mottagaren, där den kontrolleras igen innan den spelas.
- **Mina öar:** egna öar sparas i telefonen.

## 6. Faser

1. Inställningar och tillgänglighet
2. Regelmotor för de fyra mekanikerna
3. Muspelheim: banor, grafik och introduktioner
4. Berättelse och bossar
5. ~~Baneditor och delning~~ (flyttad till senare version)
6. Avslut: 0.5.0 och test på Android (klar)

## 7. Acceptanskriterier

- [x] All text finns på svenska och engelska, och ett test kontrollerar att inga översättningar saknas (`i18n.test.ts`).
- [x] Färgblindläget visar en symbol överallt där en färg betyder något (skatter, nycklar, hänglås, kort, kö, väntande vikingar och färgskepp).
- [x] Banorna 1–36 ger samma siffror från lösaren som i 0.4 (regressionstest i `engine.test.ts`).
- [x] Varje ny mekanik har tester och en introbana som inte går att förlora (`progress.test.ts`).
- [x] Alla 48 banor och de fyra bossarna är vinnbara, och `par` stämmer med lösaren (`progress.test.ts`, `bosses.test.ts`).
- [x] Testat på Android: engelska, färgblindläge, vibration, Muspelheim, bossar, Krönikan och notisen om ny version.

Kriteriet om delade länkar flyttades med baneditorn till en senare version.

## 8. Utanför scope för 0.5

- baneditor och delning av egna öar (nästa version)
- topplistor eller konton på en server
- flerspelarläge
- köp i appen
