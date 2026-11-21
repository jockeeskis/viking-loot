# Viking Loot 0.2 — The First Raid

Mobilanpassat pusselspel med Vue 3, TypeScript och Phaser 3.

- Spelregler och acceptanskriterier: `VIKING_LOOT_0.2.md` (klar) , `VIKING_LOOT_0.3.md` (klar) och `VIKING_LOOT_0.4.md` (pågår)
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
npm run bench-modes    # tidtagning av Dagens räd och den oändliga räden
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
- `src/game/generator.ts` — seedad generator för högbanor som kontrolleras av lösaren (används av `generate-levels` och i spelet).
- `src/game/modes.ts` — Dagens räd och den oändliga räden: vilken bana som genereras och vad som sparas (`viking-loot-0.4-modes`). `generator.worker.ts` och `levelGen.ts` kör genereringen i en Web Worker.
- `src/game/engine.test.ts`, `progress.test.ts`, `modes.test.ts` — tester för regelmotorn, banornas lösbarhet, progression och de genererade räderna (`node --test`).
- `src/game/art.ts` — grafik ritad i kod: miljö och paneler, plus reserv om en renderad bild saknas.
- `src/game/assets.ts` — laddar de renderade sprite sheets och skapar animationerna. `assets.generated.ts` skrivs av renderingsskriptet.
- `art-source/blender/render_assets.py` — bygger 3D-modellerna i Blender med skript och renderar dem till `public/assets/`.
- `src/game/RaidScene.ts` — rendering. Visar regelmotorns `events` som animationer och kan inte påverka utfallet.
- `src/App.vue` — UI, karta (`src/components/LevelMap.vue`), ångra/tips och sparad progression (`src/game/progress.ts`, `localStorage`-nyckel `viking-loot-0.3-progress`).

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
| 13 | Fjordmynningen | Hus (två hugg) | 100 % |
| 14 | Båthusen | Hus | ca 46 % |
| 15 | Stenbrottet | Stenhinder | 100 % |
| 16 | Klipporna | Stenhinder | ca 38 % |
| 17 | Jarlens hall | Jarlen (bär 3) | 100 % |
| 18 | Mjödsalen | Jarl + hus | ca 30 % |
| 19 | Regnbågsbron | Ylva, flerfärgad viking | 100 % |
| 20 | Regnbågsstranden | Ylva + hus | ca 32 % |
| 21 | Dimmans vik | Dolda skatter | 100 % |
| 22 | Dimfjorden | Dolda skatter | ca 33 % |
| 23 | Stormnäset | Blandat | ca 28 % |
| 24 | Valhalls port | Final | ca 12 % |
| 25 | Nyckelviken | Nyckel och kista | 100 % |
| 26 | Skattkammaren | Två nycklar | ca 49 % |
| 27 | Isbryggan | Is | 100 % |
| 28 | Frusna fjärden | Is | ca 38 % |
| 29 | Snäckans hamn | Färgskepp | 100 % |
| 30 | Seglarnas sund | Färgskepp | ca 50 % |
| 31 | Spejarklippan | Spejaren Sigrid | 100 % |
| 32 | Snöstormen | Sigrid + dolda skatter | ca 38 % |
| 33 | Glaciären | Nyckel + is | ca 31 % |
| 34 | Norrskenet | Färgskepp, sten, hus | ca 23 % |
| 35 | Ishallen | Blandat | ca 21 % |
| 36 | Ymers hjärta | Final | ca 12 % |

\* Andel av alla möjliga valordningar som leder till vinst, enligt `npm run check-levels`.

## 3D-grafik

Vikingarna (Ragnar, Björn, Freja, jarlen Harald och Ylva), tunnor, kistor, hus, stenar, presenningar, långskeppet och ön är 3D-modeller. De byggs helt med skript i Blender av rundade grundformer, så inga externa modeller eller licenser behövs. Renderingen är cel-shadad med kontur, och bilderna packas till sprite sheets i WebP (totalt cirka 1,8 MB, varav cirka 1 MB laddas direkt – Harald och Ylva hämtas först när en bana behöver dem):

| Figur/objekt | Animationer | Fil |
|---|---|---|
| Ragnar, Björn, Freja, Harald (× 3 färger), Ylva, Sigrid | `idle`, `run`, `attack`, `carry`, `victory`, `fail` (+ `look` för Sigrid) + porträtt | `public/assets/characters/<namn>/` |
| Tunna, kista, hus, uppbrutet hus, nyckel × 3 färger, sten, presenning, hänglås, isblock | – | `public/assets/loot/loot.webp` |
| Långskepp, färgskepp × 3 färger | `bob` | `public/assets/ships/longship.webp`, `boats.webp` |
| Ön med brygga, snöig ö för Isriket (bakgrund) | – | `public/assets/island/island.webp`, `island-snow.webp` |

Kräver Blender 4.2+ (testat med 5.3). `npm run render-art` hittar Blender automatiskt i standardmappen på Windows, eller via miljövariabeln `BLENDER`. Hela renderingen tar cirka 5 minuter (`npm run render-art -- loot harald` renderar bara delar, `-- icons` renderar app-ikonerna i `public/icons`). Ändra modeller och poser i `render_assets.py`.

## Status och nästa steg

- Version 0.2 är klar: alla acceptanskriterier är uppfyllda, inklusive touch på riktig mobil (testat via GitHub Pages).
- Figurer, skatter, skepp och ön (med granar, stenar och buskar) är renderade i 3D. Havet och panelerna ritas i kod.
- Plundring ger träflisor, mynt och "+1", vinst ger konfetti. Ljuden syntetiseras med WebAudio (`src/game/sfx.ts`) och kan stängas av med 🔊-knappen. En egen loopad melodi spelas i bakgrunden (🎵 slår av/på).
- 36 banor i tre världar, Kusten (1–12), Fjordarna (13–24) och Isriket (25–36); 7–36 är framtagna med `npm run generate-levels`.
- Version 0.3 är klar (se `VIKING_LOOT_0.3.md`): hus (två hugg), stenhinder, jarl, flerfärgad viking och dolda skatter, stjärnor efter banans par, karta, ångra, tips, introduktioner, ny 3D-grafik och musik. Allt är testat, även på Android.
- Version 0.4 pågår (se `VIKING_LOOT_0.4.md`). Fas 1–3 är klara (Isriket med bana 25–36): regelmotorn har nycklar/kistor (`!r`, `#r`), is (`~3r`), färgskepp (`ships` på banan) och spejaren (`SCOUT`), och spelet är en installerbar app (PWA via `vite-plugin-pwa`) som fungerar offline och visar "Ny version finns" när en uppdatering väntar. Service workern registreras bara i produktionsbygget (`npm run build` + `npx vite preview`).
- Fas 4 är klar: **Dagens räd** (samma ö för alla med samma klarade världar, sparas för dagen, svit med dagar i rad) och **oändlig räd** (svårare för varje runda, ingen ångra eller tips, rekord sparas). Banorna genereras i en Web Worker och kontrolleras av lösaren.
- Ångra tar bara tillbaka det senaste draget; efter en ångring måste man göra ett nytt drag innan man kan ångra igen.
