# Viking Loot 0.2 — The First Raid

Mobilanpassat pusselspel med Vue 3, TypeScript och Phaser 3. Specifikation för versionen: `VIKING_LOOT_0.2.md`.

## Kom igång

Kräver Node.js 22.18+ (för testerna; själva spelet går på 20.19+).

```bash
npm install
npm run dev            # starta spelet (http://localhost:5173)
npm test               # regeltester
npm run check-levels   # lösbarhetsrapport för alla banor
npm run build          # produktionsbygge
```

## Spelregler (0.2)

- Skatter finns i tre färger: röd 🧰, blå 💎 och gul 🪙.
- **Vikingakö:** Bara de tre främsta vikingarna kan väljas. Ett val förbrukas alltid.
- En viking plundrar direkt upp till **två tillgängliga** skatter i sin färg. Om den får två åker den hem.
- **Väntplatser:** En viking som får färre än två sätter sig på en av långskeppets **tre väntplatser**. Väntande vikingar plundrar automatiskt, i den ordning de kom, så fort nya skatter blir tillgängliga.
- **Blockerade skatter:** En skatt är låst (mörk med 🔒) tills alla skatter i dess `blockedBy` har plundrats.
- **Vinst:** Alla skatter är plundrade. Vinst går alltid före förlust.
- **Förlust:**
  - En viking behöver vänta men alla tre platser är fulla, även efter att de väntande har fått chansen att plundra.
  - Eller: kön är tom och ingen väntande viking kan göra något mer.

## Struktur

- `src/game/engine.ts` — ren regelmotor utan Phaser. Varje drag ger ett nytt `GameState` (oföränderligt) plus en lista med `events` som beskriver draget.
- `src/game/levels.ts` — 6 handdesignade banor med stabila ID:n och `blockedBy`. Hjälpfunktionen `stacks()` bygger högar där varje föremål blockeras av föremålet framför.
- `src/game/solver.ts` — söker igenom alla tillåtna val. Hittar vinst- och förlustsekvenser för en bana.
- `src/game/engine.test.ts` — tester för kö, väntplatser, blockering, vinst, förlust och banornas lösbarhet (`node --test`).
- `src/game/RaidScene.ts` — rendering. Visar regelmotorns `events` som animationer och kan inte påverka utfallet.
- `src/App.vue` — UI, banval och sparad progression (`localStorage`-nyckel `viking-loot-0.2-unlocked`).

## Banor

| # | Namn | Lär ut | Kan förloras? |
|---|------|--------|----------------|
| 1 | Kustbyn | Färgmatchning | Nej |
| 2 | Fiskeläget | Kön, tre valbara | Nej |
| 3 | Bryggan | Vänta och återvänd | Nej |
| 4 | Handelsbyn | Blockeringskedjor | Nej |
| 5 | Fästet | Riktigt pussel | Ja, ca 50 % av sekvenserna |
| 6 | Stora räden | Större pussel | Ja, ca 50 % av sekvenserna |

All grafik är fortfarande tillfällig och ritas med Phaser och standardemoji.
