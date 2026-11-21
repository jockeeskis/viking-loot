# Viking Loot 0.4 – Isriket: nycklar, is, två skepp, dagens räd och app

> **Status (2026-11-21):** Fas 1 (PWA) och fas 2 (regelmotorn för nycklar, is, färgskepp och spejare, med tester) är klara. Nästa: fas 3 (Isriket – banor och grafik). Appen är installerad och testad på Android.

## Syfte

0.3 gav spelet två världar, stjärnor, karta och hjälp. 0.4 ska ge spelet **ett skäl att komma tillbaka varje dag** och göra det till en riktig mobilapp:

- en tredje värld, *Isriket* (bana 25–36), med fyra nya pusselelement,
- *Dagens räd* och en *oändlig räd* med banor som genereras och kontrolleras av lösaren i webbläsaren,
- en installerbar app som fungerar offline,
- prestationer, statistik och skepp att låsa upp.

Grundprinciperna gäller fortfarande:
- Regelmotorn är ren och testad.
- Varje bana kontrolleras av lösaren.
- Animationer spelar bara upp regelmotorns händelser.

## 1. Nya mekaniker

Alla nya egenskaper är valfria i bandatan. Ett regressionstest kontrollerar att banorna 1–24 beter sig exakt som i 0.3.

### 1.1 Nyckel och låst kista

- En nyckel (`key: true`) är en vanlig skatt i sin färg och kostar en bärplats.
- En kista har `lockedBy: [nyckel-id…]` och går inte att nå förrän **alla** de nycklarna är plundrade, oavsett vilken hög de ligger i (händelsen `unlock`).
- I `stacks()` skrivs nyckeln `!r` och kistan `#r`. En kista låses av banans nycklar i samma färg.

### 1.2 Is

- Ett objekt med `frozen: N` tinar när **drag N börjar**, innan den vikingen hugger (händelsen `thaw`). `frozen: 1` tinar alltså redan i första draget. Varje utskickad viking, även Sigrid, räknas som ett drag.
- Blocket visar hur många drag som är kvar. När isen har smält kan både den nya vikingen och de väntande ta objektet.
- Isen smälter bara när en viking skickas ut. Är kön slut medan något fortfarande är fruset, är räden förlorad.
- En dold skatt under is visas när isen har smält, om vägen fram till den är fri.
- I `stacks()` skrivs is som `~3r`, en röd skatt som tinar i drag 3. Prefixen går att kombinera, till exempel `?~2b`.

### 1.3 Två skepp

- En bana kan ha `ships: [{ slots: 3 }, { slots: 2, color: 'blue' }]`. Utan `ships` har banan ett skepp med tre platser, som förut.
- En viking som ska sätta sig tar i första hand skeppet i sin egen färg, om det har plats. Annars tar den det vanliga skeppet. Händelsen `wait` talar om vilket skepp det blev.
- **Bara huvudskeppet kan sänka räden**, när dess sista plats fylls. Färgskeppet är extra trygga platser för en färg. När det är fullt sätter sig nästa viking i den färgen på huvudskeppet.
- Vikingar på färgskeppet fortsätter plundra precis som andra väntande vikingar.
- Valideringen kräver att det första skeppet är huvudskeppet (utan färg), att varje färgskepp har en färg och att någon viking i kön kan använda det.

*(Ändrat under fas 2: först var tanken att räden förloras när något skepp blir fullt. Men då hade färgskeppet varit en fälla och inte en hjälp.)*

### 1.4 Spejare – Sigrid

- Kö-posten `SCOUT`. När Sigrid skickas ut visar hon alla dolda skatter (händelsen `scout` följt av `reveal`) och seglar sedan iväg.
- Hon bär inget, sätter sig aldrig och räknas inte som en väntning.
- Kostnaden är att hon upptar en av de tre platserna man kan välja från tills hon skickas.

### 1.5 Ordning inom ett drag

Samma ordning som i 0.3, med två tillägg:
- Isen räknas ner först, innan den valda vikingen börjar hugga.
- Kistor låses upp på samma ställe där stenar rasar och dolda skatter visas.

## 2. Isriket (bana 25–36)

| Banor | Innehåll |
|---|---|
| 25–26 | Nycklar och kistor (25 går inte att förlora) |
| 27–28 | Is (27 går inte att förlora) |
| 29–30 | Två skepp (29 går inte att förlora) |
| 31–32 | Spejare och dolda skatter (31 går inte att förlora) |
| 33–35 | Blandningar |
| 36 | Final |

Pusselbanorna har en vinstandel som går från cirka 45 % ner till 12 %. Banorna söks fram med `npm run generate-levels`.

## 3. Dagens räd och oändlig räd

- **Dagens räd:**
  - En ny bana varje dag. Seed räknas fram från det lokala datumet, så alla får samma bana.
  - Mekanikerna hämtas från de världar man har låst upp.
  - Stjärnor räknas på första vinsten den dagen, och en svit med dagar i rad sparas.
- **Oändlig räd:**
  - Slumpade banor som blir svårare för varje vinst. Räden tar slut vid en förlust, och bästa rekordet sparas.
- Banorna genereras i en Web Worker med tidsgräns och kontrolleras av lösaren: de ska vara vinnbara, ha rätt par och "alltid främsta" ska förlora.

## 4. App (PWA)

- Spelet går att installera på hemskärmen.
  - Det startar i helskärm och stående läge.
  - Det har egna ikoner.
- Allt (kod, bilder) cachas, så spelet fungerar utan nät.
- Finns en ny version visas "Ny version finns – ladda om".

## 5. Mål och samlande

- Statistik:
  - räder vunna
  - skatter plundrade
  - perfekta räder
  - dagar i rad
  - bästa oändliga räd
- Cirka 15 prestationer med ikon. När en låses upp visas en toast.
- Tre skeppsvarianter låses upp av totalt antal stjärnor och väljs i *Skeppsvarvet*.

## 6. Faser

1. PWA
2. Regelmotor för de fyra mekanikerna
3. Isriket: banor, grafik och introduktioner
4. Dagens räd och oändlig räd
5. Prestationer, statistik och skepp

## 7. Acceptanskriterier

- [x] Spelet går att installera och fungerar offline (kontrollerat i Chrome DevTools och på Android).
- [ ] Alla 36 banor är vinnbara, och `par` stämmer med lösaren.
- [x] Banorna 1–24 ger samma siffror från lösaren som i 0.3.
- [ ] Varje ny mekanik har tester (klart i fas 2) och en introbana som inte går att förlora.
- [ ] Dagens räd är samma för samma datum och går alltid att vinna.
- [ ] Genereringen fryser inte sidan på mobil.
- [ ] Prestationer och skepp sparas, och 0.3-progress migreras.

## 8. Utanför scope för 0.4

- topplistor eller konton på en server
- flerspelarläge
- köp i appen
