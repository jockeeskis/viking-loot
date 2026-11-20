# Viking Loot 0.2 – Riktiga pussel och förlustvillkor

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
6. Om en viking behöver vänta när alla tre väntplatser redan är upptagna förlorar spelaren. Kontrollera detta **efter** att befintliga väntande vikingar fått chans att slutföra sina uppdrag.

> **Ändrat (2026-11-20):** Spelaren förlorar redan när den **tredje** väntplatsen fylls, i linje med `ui-settings.md` §4. Två vikingar kan alltså vänta säkert. Kontrollen görs fortfarande efter att de väntande har fått plundra, och vinst går före förlust.

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

**Förlust – fulla väntplatser:** En ny viking måste vänta, men samtliga tre platser är upptagna efter att väntande vikingar har fått möjlighet att plundra.

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
- När två av tre platser är upptagna: visa en diskret men tydlig varning.
- När tredje platsen fylls: visa högre risknivå, men förlora **först när ytterligare en viking behöver vänta**.
- Animera att vikingar springer ut, plundrar och antingen återvänder eller stannar i väntläge.
- Visa tydliga paneler för vinst, förlust och omstart.
- Behåll mobilanpassning i stående format.

## 7. Banor och svårighetsgrad

Skapa minst fem handdesignade testbanor för 0.2:

1. **Introduktion:** Alla föremål tillgängliga; lär ut färgmatchning.
2. **Kön:** Spelaren måste välja bland de tre främsta vikingarna.
3. **Väntplatser:** Demonstrera att en viking kan vänta och sedan återvända.
4. **Blockering:** Ett föremål måste plundras för att låsa upp ett annat.
5. **Riktigt pussel:** Fel ordning fyller väntplatserna; rätt ordning leder till seger.

Varje bana ska ha minst en verifierad vinstsekvens. Skapa gärna en liten sökbaserad validator som simulerar alla tillåtna val för små banor. Säkerställ att minst en bana också har en verifierad förlustsekvens.

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

- [ ] Endast de tre första vikingarna kan väljas.
- [ ] Vald viking tas bort ur kön.
- [ ] Vikingar plundrar enbart tillgängliga objekt med matchande färg.
- [ ] Vikingar kan vänta med kvarvarande kapacitet.
- [ ] Väntande vikingar kan fortsätta plundra när nya objekt blir tillgängliga.
- [ ] En fjärde viking som behöver vänta orsakar förlust om alla tre platser är upptagna.
- [ ] Blockerade objekt kan inte plundras innan deras blockerare är borta.
- [ ] Spelet upptäcker fastlåsta lägen när kön är tom.
- [ ] Samtliga objekt plundrade ger vinst.
- [ ] Omstart återställer hela banans tillstånd.
- [ ] Minst fem banor är spelbara, varav minst en har både vinst- och förlustväg.
- [ ] Tester täcker vinst, förlust, blockering, kö och väntplatser.
- [ ] Spelet fungerar med mus och touch i mobilformat.

## 10. Utanför scope för 0.2

- Nya specialklasser för vikingar.
- Slumpgenererade banor utan lösbarhetskontroll.
- Backend, konton, köp eller annonser.
- Fullständig 3D-rendering och avancerad grafikproduktion.

**Målet för 0.2:** Ett pussel som är lätt att förstå, möjligt att förlora och tillfredsställande att lösa. Först därefter prioriteras mer avancerad 3D-liknande grafik.
