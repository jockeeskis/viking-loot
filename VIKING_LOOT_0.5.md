# Viking Loot 0.5 – Muspelheim, bossar, baneditor och engelska

> **Status (2026-11-22):** Fas 1 är klar: inställningar, färgblindläge, vibration och engelska. Nästa: fas 2 (regelmotor för de fyra mekanikerna).

## Syfte

0.4 gav spelet en tredje värld, dagliga räder, prestationer och en installerbar app. 0.5 gör spelet **större, mer personligt och öppet för fler**:

- en fjärde värld, *Muspelheim* (bana 37–48), med fyra nya pusselelement,
- en kort berättelse och en bossräd per värld,
- en baneditor där man bygger egna öar och delar dem med en länk,
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

## 3. Muspelheim (bana 37–48)

En vulkanö med svart sten, lavaflöden och glöd. Varje mekanik introduceras på en bana som inte går att förlora och används sedan i ett pussel. Bana 45–47 blandar mekanikerna, och bana 48, *Surts smedja*, är finalen.

## 4. Berättelse och bossar

- Ragnar berättar på korta kort med porträtt. Korten visas vid första starten, när man kommer till en ny värld och före och efter varje boss. Man kan läsa dem igen via 📜 på kartan.
- En bossräd per värld låses upp när världen är klarad. Varje boss har en egen regel:

  | Värld | Boss | Regel |
  |---|---|---|
  | Kusten | Havsormen | skeppet har bara två platser |
  | Fjordarna | Jarl Ulvhild | bara jarlar och Ylva i kön, dolda skatter |
  | Isriket | Frostjätten Ymer | nästan allt är fruset |
  | Muspelheim | Eldjätten Surt | kedjor av krutfat och korp |

## 5. Baneditor och delning

- **Bygga:** man bygger en ö med 3–5 högar, väljer föremål och egenskaper och sätter ihop kön.
- **Kontrollera:** lösaren visar om ön går att vinna, hur stor andel av vägarna som vinner, vilket par den har och om "alltid främsta" förlorar.
- **Spela och dela:** man kan spela ön direkt. "Dela" ger en länk (`…/#o=<kod>`) som öppnar ön hos mottagaren, där den kontrolleras igen innan den spelas.
- **Mina öar:** egna öar sparas i telefonen.

## 6. Faser

1. Inställningar och tillgänglighet
2. Regelmotor för de fyra mekanikerna
3. Muspelheim: banor, grafik och introduktioner
4. Berättelse och bossar
5. Baneditor och delning
6. Avslut: 0.5.0 och test på Android

## 7. Acceptanskriterier

- [x] All text finns på svenska och engelska, och ett test kontrollerar att inga översättningar saknas (`i18n.test.ts`).
- [x] Färgblindläget visar en symbol överallt där en färg betyder något (skatter, nycklar, hänglås, kort, kö, väntande vikingar och färgskepp).
- [ ] Banorna 1–36 ger samma siffror från lösaren som i 0.4.
- [ ] Varje ny mekanik har tester och en introbana som inte går att förlora.
- [ ] Alla 48 banor och de fyra bossarna är vinnbara, och `par` stämmer med lösaren.
- [ ] En delad länk öppnar samma ö hos mottagaren. Trasiga eller för stora koder avvisas.
- [ ] Testat på Android.

## 8. Utanför scope för 0.5

- topplistor eller konton på en server
- flerspelarläge
- köp i appen
