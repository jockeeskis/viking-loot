# Viking Loot 0.2 – Riktiga pussel och förlustvillkor

> **Status (2026-11-21):** Implementerad och samtliga acceptanskriterier uppfyllda. Regelmotor, 12 banor, tester och gränssnitt finns i `src/game/`. Förlustregeln för väntplatser är ändrad jämfört med första utkastet (se 1.6). Visuell stil styrs av `ui-settings.md`.

## Syfte

Utveckla Viking Loot 0.1 från ett enkelt färgmatchningsspel till ett pusselspel där **ordningen på vikingarna spelar roll** och spelaren faktiskt kan förlora. Behåll befintlig Vue 3-, TypeScript- och Phaser-arkitektur samt den planerade färgglada 3D-liknande stilen.

> **Prioritet:** Implementera och testa spelmekaniken innan mer tid läggs på 3D-grafik.

## 1. Grundregler

- Spelplanen innehåller plundringsobjekt med färgerna **röd, blå och gul**.
- Varje viking har en av dessa färger.
- En viking kan plundra **högst två** tillgängliga objekt av sin egen färg under ett uppdrag.
- Ett objekt är tillgängligt endast om det inte blockeras av ett annat objekt.
- Spelaren kan välja **en av de tre främsta vikingarna** i kön. Efter valet flyttas resterande vikingar fram.
- En viking som inte kan slutföra sitt uppdrag får vänta på långskeppet, där det finns **tre väntplatser**.
- Spelaren vinner när samtliga plundringsobjekt är borttagna.

### Förtydligande av väntande vikingar

För att undvika att spelet blir låst utan möjlighet att återhämta sig gäller följande i version 0.2:

1. När en viking skickas ut plundrar den omedelbart upp till två tillgängliga objekt av sin färg.
2. Om den plundrar två objekt återvänder den och lämnar spelet utan att uppta en väntplats.
3. Om den plundrar färre än två objekt placeras den på en ledig väntplats med kvarvarande kapacitet (1 eller 2 objekt).
4. Efter varje förändring av spelplanen försöker väntande vikingar, i den ordning de anlände, automatiskt plundra nytillgängliga objekt av sin färg.
5. En väntande viking som uppnår totalt två plundrade objekt lämnar sin väntplats.
6. Om en viking behöver vänta och därmed fyller den **tredje** väntplatsen förlorar spelaren. Två vikingar kan alltså vänta säkert. Kontrollera detta **efter** att befintliga väntande vikingar fått chans att slutföra sina uppdrag. Om sista objektet försvinner i samma drag är det vinst.

> **Ändrat (2026-11-20):** I första utkastet förlorade man först när en fjärde viking behövde vänta. Regeln skärptes för att stämma med `ui-settings.md` §4.

Detta är den föreslagna exakta regelmodellen för MVP 0.2; den kan balanseras senare.

## 2. Vikingakö

- Visa minst de tre valbara vikingarna tydligt, samt gärna en förhandsvisning av kommande vikingar.
- Endast position 1–3 är klickbara.
- När en viking väljs tas den bort ur kön och övriga flyttas fram.
- Ett val förbrukas även om vikingen inte hittar något byte; den hamnar då på en väntplats.
- När kön tar slut och objekt återstår ska spelet kontrollera om väntande vikingar fortfarande kan slutföra banan. Om inga fler plundringar är möjliga är banan förlorad.

## 3. Blockerade skatter

Inför en explicit beroendemodell mellan objekt, i stället för att låta alla vara tillgängliga direkt.

Exempel:

```text
Röd tunna (A) ── blockerar ──> Blå kista (B)
Blå kista (B) ── blockerar ──> Gul skatt (C)
```

- A är tillgänglig från början.
- B blir tillgänglig när A har plundrats.
- C blir tillgänglig när B har plundrats.
- Blockerade objekt visas tydligt, exempelvis mörkare eller bakom ett annat föremål.
- Blockeringsgrafen får inte innehålla cykler.
- Använd stabila objekt-ID:n och `blockedBy: string[]` i bandata.

## 4. Vinst och förlust

**Vinst:** Alla objekt har plundrats. Visa en segerpanel med möjlighet att spela nästa bana.

**Förlust – fulla väntplatser:** En ny viking måste vänta och fyller den tredje väntplatsen, efter att väntande vikingar har fått möjlighet att plundra.

**Förlust – fastlåst spel:** Det finns objekt kvar, men inga valbara vikingar och ingen väntande viking kan göra ytterligare framsteg.

Spelet får aldrig visa både vinst och förlust. Vinstkontrollen ska ha företräde när sista objektet försvinner.

## 5. Föreslagen datamodell

```ts
type LootColor = 'red' | 'blue' | 'yellow';

type LootItem = {
  id: string;
  color: LootColor;
  blockedBy: string[];
  collected: boolean;
};

type Viking = {
  id: string;
  color: LootColor;
  collectedCount: number; // 0–2
};

type GameStatus = 'playing' | 'won' | 'lost';

type GameState = {
  loot: LootItem[];
  queue: Viking[];
  waiting: Viking[]; // max 3
  status: GameStatus;
  moves: number;
};
```

Separera regelmotorn från Phaser så att reglerna kan enhetstestas utan rendering. Exempel på rena funktioner:

```ts
getAvailableLoot(state: GameState): LootItem[];
getSelectableVikings(state: GameState): Viking[];
selectViking(state: GameState, vikingId: string): GameState;
resolveWaitingVikings(state: GameState): GameState;
evaluateGameStatus(state: GameState): GameStatus;
```

Använd oföränderliga state-uppdateringar eller en tydligt dokumenterad mutationsmodell. UI-animationer får inte ändra det logiska utfallet av ett drag.

## 6. Gränssnitt och feedback

- Visa tre valbara vikingar längst ner, nära långskeppet.
- Visa tre väntplatser tydligt, inklusive upptagna platser och respektive vikings färg.
- Visa hur många objekt varje väntande viking har kvar att plundra.
- När en plats är upptagen: visa en diskret varning (gul).
- När två platser är upptagna: visa hög risknivå (röd) – nästa viking som måste vänta förlorar räden.
- När tredje platsen fylls: förlust.
- Animera att vikingar springer ut, plundrar och antingen återvänder eller stannar i väntläge.
- Visa tydliga paneler för vinst, förlust och omstart.
- Behåll mobilanpassning i stående format.

## 7. Banor och svårighetsgrad

Progressionen följer `ui-settings.md` §6. Implementerade banor:

| # | Bana | Lär ut | Kan förloras? |
|---|------|--------|----------------|
| 1 | Kustbyn | Färgmatchning och kön (fullt 4 × 4-rutnät, allt tillgängligt) | Nej |
| 2 | Bryggan | Väntplatser: en viking väntar och återvänder | Nej |
| 3 | Handelsbyn | Blockering i kedjor | Nej |
| 4 | Fiskeläget | Första pusslet, tre högar | Ja (ca 78 % av valordningarna vinner) |
| 5 | Fästet | Riktigt pussel: fel ordning fyller väntplatserna | Ja (ca 45 %) |
| 6 | Stora räden | Större pussel, två höga högar | Ja (ca 37 %) |
| 7 | Klosterön | Tre högar, vem ska vänta? | Ja (ca 44 %) |
| 8 | Bärnstensviken | Tre lika höga högar | Ja (ca 36 %) |
| 9 | Vintermarknaden | Fyra högar fyller hela ön | Ja (ca 32 %) |
| 10 | Jarlens gård | Höga högar, sju vikingar | Ja (ca 23 %) |
| 11 | Runstensfältet | Fyra högar, åtta vikingar | Ja (ca 16 %) |
| 12 | Kungsgården | Final: tre höga högar | Ja (ca 17 %) |

Varje bana ska ha minst en verifierad vinstsekvens, och minst en bana ska ha en verifierad förlustsekvens. Detta kontrolleras av den sökbaserade validatorn `src/game/solver.ts` (`npm run check-levels`) och av testerna. Banorna 7–12 är framtagna med `npm run generate-levels`, som slumpar högar och köer, löser dem och behåller dem vars vinstandel ligger i ett målintervall och där det inte räcker att alltid välja den främsta vikingen.

## 8. Implementation i projektet

1. Kartlägg nuvarande `GameState`, nivåformat och Phaser-scen innan ändringar görs.
2. Lägg till `blockedBy` och stabila objekt-ID:n i nivåformatet.
3. Implementera en ren regelmotor med kö, väntplatser och tillgänglighetskontroll.
4. Implementera deterministisk ordning för plundring och väntande vikingar.
5. Lägg till statusövergångar för vinst och förlust.
6. Koppla regelmotorns händelser till Phaser-animationer.
7. Uppdatera gränssnittet för tre valbara vikingar och tre väntplatser.
8. Lägg till introduktionsbanor och minst en bana där fel val leder till förlust.
9. Lägg till automatiska tester och manuella mobiltester.
10. Behåll sparad progression och lås upp nästa bana endast vid vinst.

## 9. Acceptanskriterier

- [x] Endast de tre första vikingarna kan väljas.
- [x] Vald viking tas bort ur kön.
- [x] Vikingar plundrar enbart tillgängliga objekt med matchande färg.
- [x] Vikingar kan vänta med kvarvarande kapacitet.
- [x] Väntande vikingar kan fortsätta plundra när nya objekt blir tillgängliga.
- [x] En viking som fyller den tredje väntplatsen orsakar förlust (ändrad regel, se 1.6).
- [x] Blockerade objekt kan inte plundras innan deras blockerare är borta.
- [x] Spelet upptäcker fastlåsta lägen när kön är tom.
- [x] Samtliga objekt plundrade ger vinst.
- [x] Omstart återställer hela banans tillstånd.
- [x] Minst fem banor är spelbara, varav minst en har både vinst- och förlustväg.
- [x] Tester täcker vinst, förlust, blockering, kö och väntplatser (`npm test`, 21 tester).
- [x] Spelet fungerar med mus och touch i mobilformat. *(Mus i desktop-webbläsare; touch testat på riktig mobil via GitHub Pages 2026-11-21.)*

## 10. Utanför scope för 0.2

- Nya specialklasser för vikingar.
- Slumpgenererade banor utan lösbarhetskontroll.
- Backend, konton, köp eller annonser.
- Fullständig 3D-rendering och avancerad grafikproduktion.

**Målet för 0.2:** Ett pussel som är lätt att förstå, möjligt att förlora och tillfredsställande att lösa. Först därefter prioriteras mer avancerad 3D-liknande grafik.
