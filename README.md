# Viking Loot 0.2 — The First Raid

Mobilanpassat pusselspel med Vue 3, TypeScript och Phaser 3.

- Spelregler och acceptanskriterier: `VIKING_LOOT_0.2.md`
- Visuell stil, UI och plan för 3D-assets: `ui-settings.md`

Repo: https://github.com/jockeeskis/viking-loot

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

- Skatter (tunnor, kistor och hus) finns i tre färger: röd, blå och gul. Typen påverkar bara utseendet.
- **Vikingakö:** Bara de tre främsta vikingarna kan väljas. Ett val förbrukas alltid.
- En viking plundrar direkt upp till **två tillgängliga** skatter i sin färg. Om den får två åker den hem.
- **Väntplatser:** En viking som får färre än två sätter sig på en av långskeppets **tre väntplatser**. Väntande vikingar plundrar automatiskt, i den ordning de kom, så fort nya skatter blir tillgängliga. Två vikingar kan vänta säkert. Den som tar den tredje platsen förlorar räden.
- **Blockerade skatter:** En skatt är låst (mörk med 🔒) tills alla skatter i dess `blockedBy` har plundrats.
- **Vinst:** Alla skatter är plundrade. Vinst går alltid före förlust.
- **Förlust:**
  - Den tredje väntplatsen fylls. Det kontrolleras efter att de väntande har fått chansen att plundra.
  - Eller: kön är tom och ingen väntande viking kan göra något mer.

## Struktur

- `src/game/engine.ts` — ren regelmotor utan Phaser. Varje drag ger ett nytt `GameState` (oföränderligt) plus en lista med `events` som beskriver draget.
- `src/game/levels.ts` — 6 handdesignade banor med stabila ID:n och `blockedBy`. Hjälpfunktionen `stacks()` bygger högar där varje föremål blockeras av föremålet framför.
- `src/game/solver.ts` — söker igenom alla tillåtna val. Hittar vinst- och förlustsekvenser för en bana.
- `src/game/engine.test.ts` — tester för kö, väntplatser, blockering, vinst, förlust och banornas lösbarhet (`node --test`).
- `src/game/art.ts` — platshållargrafik ritad i kod i referensbildens stil (vikingar, tunnor, kistor, hus, långskepp, paneler).
- `src/game/RaidScene.ts` — rendering. Visar regelmotorns `events` som animationer och kan inte påverka utfallet.
- `src/App.vue` — UI, banval och sparad progression (`localStorage`-nyckel `viking-loot-0.2-unlocked`).

## Banor

| # | Namn | Lär ut | Vinstchans* |
|---|------|--------|-------------|
| 1 | Kustbyn | Färger och kön (4 × 4) | 100 % |
| 2 | Bryggan | Väntplatser | 100 % |
| 3 | Handelsbyn | Blockerade skatter | 100 % |
| 4 | Fiskeläget | Första pusslet | ca 78 % |
| 5 | Fästet | Riktigt pussel | ca 45 % |
| 6 | Stora räden | Större pussel | ca 37 % |

\* Andel av alla möjliga valordningar som leder till vinst, enligt `npm run check-levels`.

## Status och nästa steg

- Spelmekaniken för 0.2 är klar och testad. Det som återstår av acceptanskriterierna är test med touch på en riktig mobil.
- All grafik är tillfällig och ritas med Phaser Graphics i `src/game/art.ts`, enligt paletten och layouten i `ui-settings.md`. Inga externa filer används.
- Nästa steg för grafiken är 3D-modeller (Blender) renderade till sprite sheets, enligt §9 i `ui-settings.md`.
