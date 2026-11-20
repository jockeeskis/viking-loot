# Viking Loot — UI & Visual Settings

Version: 1.0 · Art direction: **Cute 3D** · Target: portrait mobile (9:16)

> **Nuläge (2026-11-20):** Ragnar, Björn, Freja, tunnor, kistor, hus och långskeppet är 3D-modeller byggda med skript i Blender (`art-source/blender/render_assets.py`). De renderas cel-shadade till sprite sheets i `public/assets/` enligt §10. Modellerna är egna och inga tredjepartsassets används ännu. Miljön ritas fortfarande i kod (`src/game/art.ts`).

## 1. Designmål

Viking Loot är ett färgglatt, humoristiskt pusselspel. Spelaren skickar färgmatchade vikingar från ett långskepp för att plundra en liten by. Gränssnittet ska vara lättläst på mobil, och alla viktiga val ska vara tydliga även när figurerna visas små.

- **Stil:** rundad, lekfull, stiliserad 3D med mjuka material och varma skuggor.
- **Proportioner:** stora huvuden (cirka 40 % av kroppshöjden), korta ben, stora skägg och överdrivna uttryck.
- **Kamera:** fast isometrisk/2.5D-vinkel, lätt snett uppifrån.
- **Ton:** familjevänlig slapstick; inga realistiska våldseffekter. Föremål studsar, spricker eller släpper ut mynt.
- **Teknik i MVP:** 3D-modeller skapade/anpassade i Blender och förrenderade till transparenta spritesheets i Phaser 3. Originalmodeller sparas separat.

## 2. Färgpalett

| Token | Hex | Användning |
|---|---|---|
| `color.red` | `#D96B46` | Röd viking, rött byte, accent |
| `color.blue` | `#458FC4` | Blå viking, blått byte, hav |
| `color.yellow` | `#F0BD55` | Gul viking, guld, belöningar |
| `color.green` | `#78A48B` | Gräs, natur, sekundära ytor |
| `color.wood` | `#8C624A` | Skepp, paneler, byggnader |
| `color.sand` | `#F3E3C5` | Ljusa paneler, bakgrund |

Använd inte färg som enda indikator: kombinera med sköldsymboler, objektform, kontur och text där det behövs. Kontrollera kontrast för UI-text separat.

## 3. Karaktärer

Alla tre delar grundrigg och animationer, men har egna silhuetter och personligheter.

| Karaktär | Utseende | Personlighet | Matchar |
|---|---|---|---|
| **Ragnar** | Rött stort skägg, yxa, röd tunika | Högljudd och entusiastisk | Röda föremål |
| **Björn** | Grått skägg, rund sköld, blå rustning | Lugn men klumpig | Blå föremål |
| **Freja** | Blonda flätor, gul tunika, liten yxa | Snabb, glad och busig | Gula föremål |

**Animationer för MVP:** `idle`, `run`, `attack`, `carry`. Senare: `victory`, `fail`, specialreaktioner. Använd samma kameravinkel, ljussättning, skala och skuggstil för samtliga karaktärer.

## 4. Långskeppet och spelkontroller

Långskeppet ligger visuellt längst ner vid spelplanen. Design: rundat ekfärgat skrov, drakhuvud i fören, rödvitt randigt segel och runda sköldar längs sidorna.

- **Vikingakö:** visa kommande vikingar med tydlig färg; endast de tre främsta är valbara enligt 0.2-reglerna.
- **Väntplatser:** tre synliga platser för vikingar som inte kan plundra; markera upptagna platser.
- **Riskindikator:** gul varning när en plats är upptagen, röd när två är upptagna (nästa viking som måste vänta förlorar).
- **Förlust:** tre upptagna väntplatser innebär förlust enligt 0.2-reglerna. Två vikingar kan vänta säkert.
- **Återkoppling:** vikingar hoppar i land, springer till byte, plundrar och återvänder eller väntar. Animationerna får inte dölja spelets tillstånd.

## 5. Plundringsobjekt

| Objekt | Visuell design | Animation / roll |
|---|---|---|
| Tunna | Rundad trätunna med röd, blå eller gul markering | Spricker och släpper ut mynt; grundobjekt |
| Skattkista | Stor, rundad kista med färgad metallbeslagning | Lock studsar upp, mynt flyger ut |
| Hus | Litet trähus med färgat tak | Takpannor studsar; introduceras senare |
| Hinder | Sten eller annan tydlig blockering | Hindrar åtkomst till byte bakom |

Färgmarkeringar ska synas uppifrån. Vid val av viking kan matchande tillgängliga objekt få en diskret ljuskontur. Skillnaden mellan **tillgängligt** och **blockerat** byte ska alltid framgå.

## 6. Bana 1 — Kustbyn

**Miljö:** liten grön kustö med blått vatten, brygga, tre trähus, granar, stenar, några tunnor och kistor. Varmt ljus, mjuka skuggor, tydliga spelbara ytor.

- **Spelplan:** 4 × 4 positioner.
- **Objekt:** i första hand tunnor och skattkistor i rött, blått och gult.
- **Syfte:** introducera färgmatchning, val av viking och plundring.
- **Svårighet:** enkel introduktionsbana; ska vara lätt att vinna.
- **Progression:** väntplatser introduceras från bana 2, blockerade föremål från bana 3.
- **Läsbarhet:** dekorationer får inte förväxlas med interaktiva objekt.

## 7. Skärmlayout (stående mobil)

1. **Topp:** spelnamn/bannamn, mynt, inställningar och enkel banstatus.
2. **Mitten:** isometrisk spelplan med tydliga färgade objekt och rörelsevägar.
3. **Nederkant:** långskepp, tre väntplatser och vikingakö med stora tryckytor.
4. **Överlägg:** vinst, förlust, paus, starta om och nästa bana.

Designa primärt för 9:16 och anpassa säkra ytor/notch samt andra mobilformat. Använd korta, läsbara svenska UI-texter i första prototypen. Inga viktiga kontroller får överlappa spelplanen.

## 8. Effekter och ljud

- Studsande mynt, dammoln, träflisor, korta squash-and-stretch-effekter.
- Små segergester och humoristiska reaktioner från vikingarna.
- Tydlig men inte störande feedback vid ogiltigt val, upptagen väntplats, vinst och förlust.
- Eget eller korrekt licensierat ljud; separat inställning för musik och effekter senare.

## 9. Produktion av 3D-assets

1. **Basmodeller:** undersök Quaternius (miljö och rekvisita) och Kenney (karaktärsbaser). Kontrollera och dokumentera licens **per paket och asset** före användning.
2. **Blender:** skapa gemensam grundkropp, anpassa ansikten, skägg, hjälmar, kläder och utrustning. Bygg sammanhängande material och färgpalett.
3. **Rigging:** gemensamt skelett för Ragnar, Björn och Freja. Animera `idle`, `run`, `attack`, `carry`.
4. **Rendering:** exportera transparenta spritesheets med konsekvent kamera, skala, ljus och pivåpunkter. Börja med de riktningar som faktiskt behövs för den fasta kameran; utöka vid behov.
5. **Integration:** importera spritesheets i Phaser; implementera animationstillstånd, skuggor, partiklar och ljud. Behåll `.blend` som källmaterial.

### Preliminära riktvärden

| Asset | Riktvärde |
|---|---|
| Viking | 3 000–8 000 trianglar |
| Långskepp | 5 000–12 000 trianglar |
| Tunna/kista | 300–1 500 trianglar |
| Texturer | 512–1024 px |
| Spriteanimationer | 12–24 FPS |
| Renderad figur | Cirka 128–256 px |

Dessa är **startvärden**, inte krav. Justera efter faktisk storlek på mobilskärmen, spriteatlaser, minnesanvändning och prestanda.

## 10. Projektstruktur

```text
public/assets/
├── characters/
│   ├── ragnar/
│   ├── bjorn/
│   └── freja/
├── buildings/
├── loot/
│   ├── barrels/
│   └── chests/
├── ships/
├── environments/
└── effects/

art-source/
├── blender/
├── textures/
└── licenses/
```

## 11. Första visuella milstolpen: vertical slice

Bygg **en** polerad och fullt spelbar bana med:

- [x] Ragnar, Björn och Freja i enhetlig Cute 3D-stil.
- [x] `idle`, `run`, `attack` och `carry` för varje viking.
- [x] Ett långskepp med synlig kö och tre väntplatser.
- [ ] En isometrisk Kustby med 4×4 positioner. *(4×4 finns; ön är fortfarande platt och ritad i kod.)*
- [ ] Färgade tunnor och skattkistor med plundringseffekter. *(Modellerna är klara; mynt- och flisseffekter saknas.)*
- [x] Visuell skillnad mellan tillgängligt och blockerat byte.
- [x] Tydliga tillstånd för vinst, förlust och omstart.
- [ ] Responsiv och läsbar mobilvy i 9:16.
- [x] Dokumenterade källor och licenser för alla tredjepartsassets. *(Inga tredjepartsassets används – allt byggs med skript.)*

## 12. Gränsdragning och beroenden

Den här filen är **visuell design- och UI-specifikation**, inte den fullständiga spelregelspecifikationen. För exakt köhantering, väntplatser, blockering, vinst/förlust och nivåvalidering gäller `VIKING_LOOT_0.2.md`. Om filerna motsäger varandra ska spelreglerna i 0.2-specifikationen styra logiken och denna fil styra presentationen.

Konceptbilder är stilreferenser och inte färdiga riggade 3D-modeller. Skapa eller licensiera produktionsassets separat. Spelets figurer, banor, gränssnitt och varumärke ska ha en egen identitet och inte kopiera Food Hunts uttryck.
