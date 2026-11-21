# Viking Loot 0.2 — The First Raid

Mobilanpassat pusselspel med Vue 3, TypeScript och Phaser 3.

- Spelregler och acceptanskriterier: `VIKING_LOOT_0.2.md`
- Visuell stil, UI och plan för 3D-assets: `ui-settings.md`

Repo: https://github.com/jockeeskis/viking-loot

## Spela

Senaste versionen läggs ut automatiskt på GitHub Pages vid varje push till `main`: https://jockeeskis.github.io/viking-loot/ (öppna länken i mobilen för att testa touch).

## Kom igång

Kräver Node.js 22.18+ (för testerna; själva spelet går på 20.19+).

```bash
npm install
npm run dev            # starta spelet (http://localhost:5173)
npm test               # regeltester
npm run check-levels   # lösbarhetsrapport för alla banor
npm run generate-levels # sök fram nya högbanor med en viss svårighet
npm run build          # produktionsbygge
npm run render-art     # rendera om 3D-grafiken med Blender (valfritt: -- ragnar loot ship)
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
- `src/game/art.ts` — grafik ritad i kod: miljö och paneler, plus reserv om en renderad bild saknas.
- `src/game/assets.ts` — laddar de renderade sprite sheets och skapar animationerna. `assets.generated.ts` skrivs av renderingsskriptet.
- `art-source/blender/render_assets.py` — bygger 3D-modellerna i Blender med skript och renderar dem till `public/assets/`.
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
| 7 | Klosterön | Tre högar, vem ska vänta? | ca 44 % |
| 8 | Bärnstensviken | Tre lika höga högar | ca 36 % |
| 9 | Vintermarknaden | Fyra högar fyller ön | ca 32 % |
| 10 | Jarlens gård | Höga högar, sju vikingar | ca 23 % |
| 11 | Runstensfältet | Fyra högar, åtta vikingar | ca 16 % |
| 12 | Kungsgården | Final | ca 17 % |

\* Andel av alla möjliga valordningar som leder till vinst, enligt `npm run check-levels`.

## 3D-grafik

Vikingarna (Ragnar, Björn och Freja), tunnor, kistor, hus och långskeppet är 3D-modeller. De byggs helt med skript i Blender av rundade grundformer, så inga externa modeller eller licenser behövs. Renderingen är cel-shadad med kontur, och bilderna packas till sprite sheets i WebP (totalt cirka 0,7 MB):

| Figur/objekt | Animationer | Fil |
|---|---|---|
| Ragnar, Björn, Freja | `idle`, `run`, `attack`, `carry` + porträtt | `public/assets/characters/<namn>/` |
| Tunna, kista, hus × 3 färger | – | `public/assets/loot/loot.webp` |
| Långskepp | `bob` | `public/assets/ships/longship.webp` |

Kräver Blender 4.2+ (testat med 5.3). `npm run render-art` hittar Blender automatiskt i standardmappen på Windows, eller via miljövariabeln `BLENDER`. Hela renderingen tar cirka 1,5 minut. Ändra modeller och poser i `render_assets.py`.

## Status och nästa steg

- Spelmekaniken för 0.2 är klar och testad. Det som återstår av acceptanskriterierna är test med touch på en riktig mobil.
- Figurer, skatter och skepp är renderade 3D-sprites. Miljön (ön, träd, paneler) ritas fortfarande i kod.
- Plundring ger träflisor, mynt och "+1", vinst ger konfetti. Ljuden syntetiseras med WebAudio (`src/game/sfx.ts`) och kan stängas av med 🔊-knappen.
- 12 banor; 7–12 är framtagna med `npm run generate-levels`.
- Nästa steg: en renderad 3D-ö.
