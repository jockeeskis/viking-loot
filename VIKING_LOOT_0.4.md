# Viking Loot 0.4 – Isriket: nycklar, is, två skepp, dagens räd och app

> **Status (2026-11-21):** Fas 1–4 är klara: PWA (testad på Android), regelmotorn, Isriket med bana 25–36 och Dagens räd / oändlig räd. Nästa: fas 5 (prestationer, statistik och skepp).

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
- **Visning** (ändrat efter test på mobil, där det var otydligt vad som hörde ihop):
  - Hänglåset har nyckelns färg.
  - På banor med nycklar är alla vanliga skatter tunnor, så en kista är alltid en låst kista.
  - De små "blockerad"-låsen visas inte på de banorna, bara den mörkare tonen.
  - När nyckeln plundras flyger den i en båge till låset, som sedan springer upp.

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

| # | Namn | Innehåll | Vinstchans | Par |
|---|---|---|---|---|
| 25 | Nyckelviken | Nyckel och kista (intro) | 100 % | 0 |
| 26 | Skattkammaren | Två nycklar, två kistor | ca 49 % | 2 |
| 27 | Isbryggan | Is (intro) | 100 % | 0 |
| 28 | Frusna fjärden | Is | ca 38 % | 2 |
| 29 | Snäckans hamn | Blått färgskepp (intro) | 100 % | 1 |
| 30 | Seglarnas sund | Gult färgskepp, två platser | ca 50 % | 2 |
| 31 | Spejarklippan | Sigrid och dolda skatter (intro) | 100 % | 0 |
| 32 | Snöstormen | Sigrid, dolda skatter och hus | ca 38 % | 1 |
| 33 | Glaciären | Nyckel och is | ca 31 % | 2 |
| 34 | Norrskenet | Färgskepp, sten och hus | ca 23 % | 2 |
| 35 | Ishallen | Nyckel, is, färgskepp, Sigrid och jarl | ca 21 % | 2 |
| 36 | Ymers hjärta | Allt (final) | ca 12 % | 3 |

- Banorna söks fram med `npm run generate-levels`.
- På banor med färgskepp kräver generatorn att skeppet gör banan klart lättare. Ett test kontrollerar samma sak.
- Första versionen av bana 30 hade ett blått skepp som ingen viking någonsin satte sig i, och det var så felet upptäcktes.

**Grafik (Blender):**
- stående nyckel i lagets färg, formad som en nyckelikon (en liggande nyckel på kudde såg ut som en vält tunna på mobilen)
- hänglås och isblock som läggs ovanpå andra föremål
- färgskepp i tre färger
- spejaren Sigrid med kikare och animationen `look`
- snöig ö för Isriket

**I spelet:**
- Hänglåset springer upp och faller.
- Isen visar ❄N, droppar för varje drag och spricker i isflisor när den smälter.
- Sigrid går ut på ön och spanar innan presenningarna flyger av.
- Långskeppet flyttar åt sidan på banor med färgskepp, och vikingar som väntar på färgskeppet sitter på dess däck.

## 3. Dagens räd och oändlig räd

- **Mekaniker:** bara från världar man har *klarat* (sista banan vunnen), så att man alltid har sett introduktionerna. Kusten har inga egna, så nivåerna är: 0 = vanliga skatter, 1 = + Fjordarna, 2 = + Isriket.
- **Dagens räd:**
  - En ny ö varje dag. Seed = hash av lokalt datum + nivå, så alla med samma klarade världar får samma ö.
  - Fyra högar med 3–4 skatter, en eller två mekaniker (minst en från den senast klarade världen), 20–50 % vinnande valordningar.
  - Första vinsten för dagen ger stjärnorna och förlänger sviten. Sviten bryts om man missar en hel dag. Man kan spela om, men det räknas inte.
  - Ön sparas för dagen, så den tas bara fram en gång.
- **Oändlig räd:**
  - Runda för runda: fler och högre högar, fler mekaniker (upp till tre) och färre vinnande valordningar.
  - Ingen ångra, inga tips och ingen omstart. En förlust avslutar räden. Rekordet sparas efter varje vunnen runda.
  - Nästa runda genereras medan man spelar den nuvarande.
- **Generering** (`src/game/generator.ts`, `modes.ts`):
  - Banorna ska vara vinnbara, `par` kommer från lösaren, och "alltid främsta" ska förlora.
  - Sökningen räknar försök, aldrig tid, så samma seed ger samma ö på alla enheter. Hittas inget provas först andra mekanikblandningar, sedan lättare krav och till sist en vanlig ö.
  - Allt körs i en Web Worker (`generator.worker.ts`). Under tiden visas "Kartlägger ön…". Om workern skulle hänga i 25 sekunder används en enkel reservö.
  - Tidtagning: `npm run bench-modes`. På dator tar de flesta öar under 0,5 s och de svåraste cirka 2 s.

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
- [x] Alla 36 banor är vinnbara, och `par` stämmer med lösaren.
- [x] Banorna 1–24 ger samma siffror från lösaren som i 0.3.
- [x] Varje ny mekanik har tester och en introbana som inte går att förlora.
- [x] Dagens räd är samma för samma datum och går alltid att vinna (testat i `modes.test.ts`).
- [x] Genereringen fryser inte sidan (Web Worker, kontrollerat i produktionsbygget). Ska bekräftas på mobil.
- [ ] Prestationer och skepp sparas, och 0.3-progress migreras.

## 8. Utanför scope för 0.4

- topplistor eller konton på en server
- flerspelarläge
- köp i appen
