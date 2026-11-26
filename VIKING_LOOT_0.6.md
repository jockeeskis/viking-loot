# Viking Loot 0.6 – Asgård, säsonger och en bättre start

> **Status (2026-11-26):** Fas 1–4 är klara. Fas 1: guidad första räd, förklarade förluster, Mindre rörelse och Spara batteri. Fas 2: gyllene skatten, Valhalls port och valkyrian i regelmotorn. Fas 3: Asgård (bana 49–60), bossen Loke, berättelsen och grafiken. Fas 4: segel, sköldar och samlaralbumet. Nästa: fas 5 (veckans utmaning och händelser). Användaren startar varje fas själv.

## Syfte

0.5 gav spelet Muspelheim, fyra bossar, en berättelse, engelska och tillgänglighet. 0.6 ska göra spelet **lättare att komma in i, roligare att återvända till och större**:

- en bättre start för nya spelare, tydligare återkoppling och bättre prestanda,
- en femte värld, *Asgård* (bana 49–60), med tre nya mekaniker och en femte boss, Loke,
- kosmetika och ett samlaralbum,
- veckans utmaning och tidsbegränsade händelser under året.

Baneditorn och delning av egna öar (från 0.5) ingår inte heller i 0.6.

Grundprinciperna gäller fortfarande:
- Regelmotorn är ren, testad och skickar ut händelser.
- Varje bana kontrolleras av lösaren.
- Scenen spelar bara upp regelmotorns händelser.

Varje fas avslutas med `npm test`, `npm run check-levels`, `npm run build`, kontroll i Chrome och sedan commit + push.

## 1. Känsla och onboarding

- **Guidad första räd på bana 1**
  - En pekande hand och korta pratbubblor från Ragnar visar de tre första dragen: välj en viking, se den hämta skatt och se platsen på skeppet.
  - Den visas bara för nya spelare och kan hoppas över.
  - Steg och villkor ligger i `src/game/tutorial.ts`, och scenen visar handen med `RaidScene.pointAt(target)`.
- **Tydligare förlust**
  - Resultatrutan förklarar *varför* räden gick förlorad, till exempel "Skeppet blev fullt: tre vikingar väntade på gult".
  - "Visa draget" pekar ut det första draget efter vilket alla vägar förlorar. Lösaren tar fram det, och visningen använder samma teknik som tipsen.
- **Återkoppling**
  - Valbara vikingar som inte kan ta något just nu får en svag markering.
  - Den som trycker på en låst skatt får en kort förklaring, till exempel "Is: 2 drag kvar" eller "Låst: behöver röd nyckel".
- **Rörelse och prestanda**
  - Inställningen *Mindre rörelse* följer också `prefers-reduced-motion`. Den ger färre skakningar, mindre konfetti och ingen gungning hela tiden.
  - Inställningen *Spara batteri* stänger av antialias, ger färre partiklar och kör i 30 fps.
  - Bildfrekvensen mäts med Chrome Performance, med 4× CPU-begränsning.
- **Svårighetskurvan**
  - `check-levels` sammanfattar vinstandelen per bana.
  - Banor som sticker ut (till exempel för svåra tidigt) justeras eller tas fram på nytt med generatorn.

**Så blev det (fas 1):**

- **Guidad första räd:** fyra steg (`src/game/tutorial.ts`). Ragnars pratbubbla ligger överst i spelet, så korten går att trycka på. En hand (👇) pekar på vikingen som tipset skulle välja och sedan på väntplatserna. Rundturen sparas i `seenStory` som `tutorial`, och visas inte för den som redan har vunnit bana 1.
- **Förlusten förklaras** (`src/game/feedback.ts`): "Skeppet blev fullt. De väntande vikingarna ville ha rött och gult …" eller "Kön tog slut med 3 skatter kvar på ön."
- **"🔎 Var gick det fel?"** pekar ut draget efter vilket räden inte längre gick att vinna, till exempel "drag 5: en röd viking". Det spolar *inte* tillbaka räden, så regeln att man bara får ångra ett steg gäller fortfarande. Om det var sista draget sägs att Ångra tar tillbaka just det. Sökningen går baklänges med `winnable()` i `solver.ts`, som slutar vid första vinsten.
- **Tryck på en skatt:** en kort ruta förklarar vad som håller den (is, lås, något framför, tidvatten, sten) eller vilken viking som kan ta den nu.
- **Vikingar som inte hittar något just nu** blir mörkare och visar ⛵ på kortet.
- **Mindre rörelse** följer telefonens inställning tills man väljer själv. Den tar bort skakningar, blixtar, zoomen vid vinst och skeppens gungning, och ger mindre konfetti.
- **Spara batteri:** 30 bilder per sekund direkt och färre partiklar. Kantutjämningen stängs av från nästa start.
- **Svårighetskurvan:** `check-levels` skriver ut vinstandelen per värld och flaggar banor som sticker ut. Inga banor sticker ut, så inga banor har ändrats.

## 2. Asgårds mekaniker

Alla nya fält är valfria. Ett regressionstest kontrollerar att banorna 1–48 och bossarna ger samma siffror från lösaren som i 0.5.

| Mekanik | I `stacks()` | Regel | Händelse |
|---|---|---|---|
| **Gyllene skatten** | `$` | Kostar en bärplats och kan tas av **vilken färg som helst**. Pusslet blir vem som ska ta guldet. | `collect` (med guld) |
| **Valhalls port** | `%3r` | Ett lås som öppnas när **3 röda skatter** har plundrats någonstans på ön. Det fungerar som en nyckel med räkneverk. | `unlock` (med port) |
| **Valkyrian** | `VALK` i kön | Tar ingen skatt. Hon lyfter den viking som väntat längst på huvudskeppet och ställer den **sist i kön** med lasten kvar. Det frigör en plats, men vikingen kommer tillbaka. | `valkyrie` |

- **Kontroll av banan:** `validateLevelGraph` ser till att varje port kan öppnas, alltså att det finns tillräckligt många skatter i portens färg som inte ligger bakom porten. Den kontrollerar också att guldet går ihop med bärplatserna.
- **Generatorn** får fälten `gold`, `gates` och `valkyries`.
- **Lösaren:** vikingarnas last i kön blir en del av lösarens memo-nyckel, eftersom valkyrian gör att kön bär tillstånd. Kontrollera att lösaren inte blir långsammare för de gamla banorna.
- **Introduktioner:** tre nya, på svenska och engelska.
- **Genererade lägen:** Dagens räd och den oändliga räden får nivå 4 med Asgårds mekaniker efter klarad värld.

**Så blev det (fas 2):**

- **Gyllene skatten** `$` har ingen färg (`gold: true`). Vilken viking som helst kan ta den, och den kostar en bärplats. Ylva får ingen färg av guld, utan först av nästa färgade skatt. Guld kan vara dolt eller fruset, men inte nyckel, kista, krutfat, bur, hus eller port.
- **Valhalls port** `%3r` är en röd skatt som öppnas när tre *andra* röda skatter har plundrats på ön (`gate: 3`). Guld och halvt huggna hus räknas inte. Porten har samma färg som skatten, som hänglåset har samma färg som nyckeln. Händelsen är `unlock` med `gate: true`, och den kommer direkt efter skatten som fyllde räkningen. En port kan inte vara dold eftersom den visar sin färg.
- **Valkyrian** (`VALK` i kön, `kind: 'valkyrie'`) tar ingen skatt och ingen plats. Hon lyfter den viking som väntat längst på *huvudskeppet* och ställer den sist i kön med lasten kvar (`valkyrie`-händelsen med `carriedId`). Om ingen väntar där flyger hon bara hem. Vikingar på färgskepp lämnas kvar.
- **Kontroll av banan:** `validateLevelGraph` räknar ut vilka skatter som någonsin går att nå och kastar fel om en port aldrig kan öppnas. Det gäller både för få skatter och portar som väntar på varandra. Den kastar också fel om kön bara består av valkyrior och spejare.
- **Lösaren:** en viking i kön som redan bär något får sin last i memo-nyckeln. Inga gamla vikingar bär något i kön, så nyckeln och siffrorna för 0.5 är oförändrade.
- **Generatorn:** fälten `gold`, `gates` och `valkyries` drar bara slumptal när de används. Dagens räd och den oändliga räden ger därför exakt samma öar som förut för nivå 0–3.
- **Lägen:** nivå 4 (`tierFor` när värld 5 är klarad) lägger till de tre mekanikerna. Den nås först när Asgård finns (fas 3).
- **Introduktioner och texter** på svenska och engelska: tre introkort, nya förklaringar när man trycker på guld och på en port, och "valkyrian" i "Var gick det fel?".
- **Scenen** har ännu ingen egen grafik (fas 3). Guld ritas tills vidare som en gul tunna.
- **Tester:** `asgard.test.ts` (15 tester), bland annat ett regressionstest för banorna 1–48 och de fyra bossarna mot siffrorna från 0.5.

## 3. Asgård (bana 49–60) och Loke

- **Ön:** guld, vita marmorpelare och regnbågsbron Bifrost. Den är renderad i Blender.

| Banor | Innehåll |
|---|---|
| 49–50 | gyllene skatten |
| 51–52 | Valhalls port |
| 53–54 | valkyrian |
| 55–59 | blandningar med äldre mekaniker |
| 60 | finalen "Valhalls portar" |

  Introbanorna går inte att förlora. Pusslen går från cirka 40 till 8 % vinstandel.
- **Boss: Loke** (efter Asgård), "Lokes lögner". Kön blandar guld, portar och valkyrian, och nästan allt är dolt. Han bygger bara på mekaniker som redan finns.
- **Berättelsen:** nya kort när man kommer till Asgård, före och efter Loke, och en ny final.
- **Grafik (Blender):**
  - Asgård-ön
  - guldskatten
  - portlåset med siffra
  - valkyrian (en viking med vingar)
  - Loke med porträtt
- **Scenen:**
  - guldet glittrar
  - porten visar räknaren (2/3) och öppnas med ljus
  - valkyrian dyker ner och flyger med vikingen till slutet av kön
- **Följdändringar:**
  - Prestationen *Asgårds herre*.
  - Bossjägare och Ragnarök kräver alla fem bossar.
  - Ett sjätte skepp, *Gyllene Draken*, för ★ 165. Max blir 195 ★.
  - "Hela Norden i guld" räknar alla 60 banor. Den som redan har den behåller den.

**Så blev det (fas 3):**

- **Banorna 49–60** togs fram med generatorn (`npm run generate-levels`) och kontrolleras av lösaren. Varje mekanik introduceras på en bana som inte går att förlora och används sedan i ett pussel:

  | Bana | Namn | Innehåll | Vinstandel |
  |---|---|---|---|
  | 49–50 | Guldstranden, Skattkammaren | guld | 100 %, 38 % |
  | 51–52 | Portvakten, Einherjarnas gård | Valhalls port | 100 %, 26 % |
  | 53–54 | Valkyrieklippan, Vingarnas fjord | valkyrian | 100 %, 38 % |
  | 55–59 | Gyllene porten … Bifrosts fäste | blandningar med äldre mekaniker | 21 → 12 % |
  | 60 | Valhalls portar | finalen: två portar, guld, Ylva, Sigrid och valkyrian, allt dolt | 10 % |

  Svårighetskurvan är jämn enligt `check-levels`. I pusslen måste valkyrian göra skillnad: utan henne ska banan vara klart svårare. Det kravet gäller inte introbanorna, eftersom de inte kan förloras.
- **Bossen Loke Lögnaren** (🎭, efter Asgård) har guld, två portar och en valkyria, och nästan allt är dolt. Vinstandelen är 13 % och par är 1.
- **Berättelsen:**
  - Nya kort: *Till Asgård*, *Lokes lögner* och *Masken faller*.
  - Det gamla finalkortet heter nu *Muspelheim är fritt* och visas efter de fyra första bossarna, med en ny andra sida där regnbågen syns i norr.
  - Det nya slutet *Hem till hallen* (`finale-2`) visas när alla fem bossar är besegrade.
- **Grafiken** är renderad i Blender (`render_assets.py`):
  - Asgård-ön med marmorpelare, guldpölar och Bifrost i hörnet längst bak.
  - Guldskatten: en hög med staplade mynt och en röd ädelsten.
  - Valhalls port: en marmorbåge i portens färg. Siffran står på plaketten, och var plaketten sitter sparas i manifestet som `gatePlaque`.
  - Valkyrian: vingar, vingad hjälm, spjut och en egen animation `fly`.
  - Loke: en tvåuddig narrluva, en guldmask och en grön trollflamma.
  - Skeppet Gyllene Draken.
- **Scenen:**
  - Guldet glittrar då och då (inte med Mindre rörelse).
  - Porten visar räknaren, till exempel 1/2. När den öppnas blir det ljus och ett ackord, och bågen lyfter.
  - Valkyrian dyker ner, lyfter den som väntat längst och flyger med vikingen till slutet av kön. Ett kort för en viking som redan bär något visar lasten, till exempel 1/2.
- **Följdändringar:**
  - Prestationen *Asgårds herre* är ny.
  - Bossjägare och Ragnarök kräver alla fem bossar.
  - *Gyllene Draken* låses upp vid 165 ★, och max är nu 195 ★.
  - "Hela Norden i guld" räknar alla 60 banor.
  - Prestationer som redan är upplåsta ligger kvar i `meta.unlocked`, så ingen förlorar en prestation.
  - Asgård finns på svenska och engelska.

## 4. Kosmetika och samlaralbum

- **Segel:** mönster och färg ovanpå skeppet.
- **Sköldrad:** färgerna på sköldarna längs relingen.
- **Var man väljer:** i Skeppsvarvet, som får flikarna Skepp, Segel och Sköldar.
- **Data:** kosmetikan finns i `src/game/cosmetics.ts`. Vad man äger och har valt sparas i meta, och gamla sparningar migreras.
- **Samlaralbum 🏺:** reliker från händelser och veckosviter, i `src/game/relics.ts`. Albumet nås från kartan, bredvid Krönikan.
- **Belöningar:** kosmetika får man från prestationer, veckans utmaning och händelser.

**Så blev det (fas 4):**

- **Teknik:** segel och sköldar är egna överläggsark från Blender (`render_cosmetics` i `render_assets.py`, `npm run render-art -- cosmetics`). De har samma kamera och samma tolv gungbildrutor som långskeppet. Resten av skeppet är "holdout", så överlägget döljs där skeppet skymmer det. Alla långskepp har samma segel och sköldar, så ett överlägg passar på alla sex skepp. Scenen ritar överläggen direkt ovanpå skeppet och följer dess bildruta (`setLooks`). Arken laddas först när de används. Toning av en sprite valdes bort, eftersom mönster med flera färger då inte går.
- **Sju segel:** Rutsegel, Nordkorset, Fjordsegel, Frostsegel, Glödsegel, Bifrostsegel och Solsegel.
- **Sex sköldrader:** Havets, Lagets, Delade, Krut-, Drakens och Guldsköldar.
- **Utöver detta:**
  - "Skeppets eget" segel och sköldar, som alltid finns.
  - Varje kosmetik delas ut av en prestation, till exempel Rutsegel för Första räden och Guldsköldar för Hela Norden i guld.
  - Under prestationen i listan står belöningen (🎁).
- **Data (`cosmetics.ts`, `relics.ts`):**
  - Ägandet räknas fram från prestationer och besegrade bossar, så befintliga spelare får sina belöningar direkt.
  - Händelser och veckans utmaning lägger till id:n i `meta.owned` med `grant()`.
  - `equip()` vägrar allt man inte äger.
  - Gamla sparningar får standardvalen, och okända id:n rensas bort.
- **Skeppsvarvet:**
  - Har flikarna Skepp, Segel och Sköldar.
  - Förhandsbilden visar det valda skeppet med segel och sköldar.
  - Låsta kort visar var man får dem.
- **Samlaralbumet 🏺** (knappen bredvid Krönikan) har 13 reliker:
  - en per boss (fanns inte i planen, men gör att albumet har innehåll redan nu)
  - en per händelse
  - fyra från veckans utmaning
  - Okända reliker visas som ❔ tillsammans med var man hittar dem.
- **Notiser:** efter en vunnen räd visas en notis för varje nytt segel, nya sköldar eller ny relik.

## 5. Veckans utmaning och händelser

- **Veckans utmaning**
  - Tre öar med stigande svårighet, samma för alla under samma vecka. Seedet tas från ISO-veckan och nivån.
  - De genereras i samma worker som Dagens räd.
  - Den som klarar alla tre får veckans segel eller relik.
- **Händelser**
  - Händelserna är tidsbegränsade. De styrs av telefonens datum och fungerar därför offline. Datan ligger i `src/game/events.ts`.

    | Händelse | Tid | Tema |
    |---|---|---|
    | Midvinterblot | 1 dec – 6 jan | snö och julbock |
    | Vårblot | mars–april | – |
    | Midsommar | juni | midsommarstång |
    | Alvablot | oktober–november | dimma och lyktor |

  - Varje händelse har fem genererade öar och en handgjord final, och alla kontrolleras av lösaren.
  - Belöningen är en relik, ett segel och en prestation.
  - Dekoren är egna figurer ovanpå ön.
  - I utvecklingsläget kan en händelse tvingas fram med `?event=<id>`.

## 6. Faser

1. Känsla och onboarding
2. Regelmotorn för Asgårds tre mekaniker
3. Asgård (bana 49–60), Loke, berättelse och grafik
4. Kosmetika och samlaralbum
5. Veckans utmaning och händelser
6. Avslut: 0.6.0 och test på Android

## 7. Acceptanskriterier

- [x] En ny spelare tar sig igenom bana 1 med guidning och kan hoppa över den (`feedback.test.ts`, kontrollerat i Chrome).
- [x] Varje förlust förklaras, och "Var gick det fel?" stämmer med lösaren (`feedback.test.ts`).
- [x] Mindre rörelse och Spara batteri fungerar och sparas (`i18n.test.ts`, kontrollerat i Chrome).
- [x] Banorna 1–48 och bossarna ger samma siffror från lösaren som i 0.5 (regressionstest i `asgard.test.ts`).
- [x] Varje ny mekanik har tester och en introbana som inte går att förlora (`asgard.test.ts`, `progress.test.ts`).
- [x] Alla 60 banor och de fem bossarna är vinnbara, och `par` stämmer med lösaren (`engine.test.ts`, `bosses.test.ts`, `check-levels`).
- [ ] Veckans utmaning är samma för samma vecka och går alltid att vinna.
- [ ] Händelsernas datum fungerar, även över nyår, och belöningar delas bara ut en gång.
- [ ] Kosmetika och album sparas, och gamla sparningar migreras.
- [ ] Testat på Android.

## 8. Utanför scope för 0.6

- baneditor och delning av egna öar (senare version)
- topplistor eller konton på en server
- flerspelarläge
- köp i appen
