// The story (0.5): short cards told by Ragnar, shown once each and kept in Krönikan (📜 on the map).
// Each card has a few pages of two or three sentences, in Swedish and English.
export type StoryId =
  | 'start' | 'world-1' | 'world-2' | 'world-3'
  | 'boss-0-before' | 'boss-0-after' | 'boss-1-before' | 'boss-1-after'
  | 'boss-2-before' | 'boss-2-after' | 'boss-3-before' | 'boss-3-after' | 'finale'

export type StoryCard = { id: StoryId; icon: string; title: { sv: string; en: string }; pages: { sv: string; en: string }[] }

/** In reading order – Krönikan lists the seen cards in this order. */
export const STORY: StoryCard[] = [
  {
    id: 'start', icon: '⛵', title: { sv: 'Ragnar Rödskägg', en: 'Ragnar Redbeard' },
    pages: [
      {
        sv: 'Hej, främling! Jag är Ragnar Rödskägg, hövding på Ormen – det snabbaste skeppet norr om… ja, norr om det mesta.',
        en: 'Greetings, stranger! I am Ragnar Redbeard, chief of the Serpent – the fastest ship north of… well, north of most things.',
      },
      {
        sv: 'Björn bär det blå, Freja det gula och jag det röda. Var och en tar bara skatter i sin egen färg. Det är tradition. Och bråk annars.',
        en: 'Björn carries blue, Freja yellow and I carry red. Each of us only takes loot of our own colour. It is tradition. And it saves a lot of fighting.',
      },
      {
        sv: 'Skeppet har bara tre platser att vänta på, och fylls den sista sjunker räden. Skicka rätt viking i rätt ordning, så seglar vi hem rika!',
        en: 'The ship has only three seats to wait on, and filling the last one sinks the raid. Send the right viking in the right order, and we sail home rich!',
      },
    ],
  },
  {
    id: 'boss-0-before', icon: '🐍', title: { sv: 'Något i vattnet', en: 'Something in the water' },
    pages: [
      {
        sv: 'Kusten är vår! Men vad är det som ringlar under kölen? Fiskarna säger att Havsormen vaktar den sista ön.',
        en: 'The coast is ours! But what is that coiling under the keel? The fishermen say the Sea Serpent guards the last island.',
      },
      {
        sv: 'Den har redan krossat en av våra platser. Två kvar – och den andra sänker oss. Var försiktig nu.',
        en: 'It has already crushed one of our seats. Two left – and the second one sinks us. Careful now.',
      },
    ],
  },
  {
    id: 'boss-0-after', icon: '🐍', title: { sv: 'Ormen flyr', en: 'The serpent flees' },
    pages: [
      {
        sv: 'Ha! Ormen dök ner i djupet med svansen mellan… ja, den är ju bara svans. Björn påstår att han slog den på nosen. Det gjorde han inte.',
        en: 'Ha! The serpent dove into the deep with its tail between its… well, it is all tail. Björn claims he hit it on the nose. He did not.',
      },
    ],
  },
  {
    id: 'world-1', icon: '🌊', title: { sv: 'Till Fjordarna', en: 'To the Fjords' },
    pages: [
      {
        sv: 'I Fjordarna härskar jarlarna. De bär tre skatter åt gången och tycker att det gör dem förmer. Det gör det kanske.',
        en: 'In the Fjords the jarls rule. They carry three treasures at a time and think it makes them better. Maybe it does.',
      },
      {
        sv: 'Och så har vi Ylva, den vilda. Hon tar vilken färg som helst. Ingen vet varför – ingen vågar fråga.',
        en: 'And then there is Ylva the Wild. She takes any colour at all. Nobody knows why – nobody dares to ask.',
      },
    ],
  },
  {
    id: 'boss-1-before', icon: '🐺', title: { sv: 'Jarl Ulvhild', en: 'Jarl Ulvhild' },
    pages: [
      {
        sv: 'Jarl Ulvhild, Vargdrottningen, har lockat över alla våra vanliga roddare till sin sida med löften om silver.',
        en: 'Jarl Ulvhild, the Wolf Queen, has lured all our ordinary oarsmen to her side with promises of silver.',
      },
      {
        sv: 'Kvar är bara jarlarna och Ylva. Och skatten har hon gömt under presenningar. Vi får ta det vi ser – och gissa resten.',
        en: 'Only the jarls and Ylva are left. And she has hidden the loot under tarps. We take what we can see – and guess the rest.',
      },
    ],
  },
  {
    id: 'boss-1-after', icon: '🐺', title: { sv: 'Vargen tämjd', en: 'The wolf tamed' },
    pages: [
      {
        sv: 'Ulvhild gav sig och lämnade tillbaka våra roddare – lite skamsna, men hela. Hon sa att vi kan komma tillbaka när vi vill. Jag tror hon menade det som ett hot.',
        en: 'Ulvhild yielded and gave us back our oarsmen – a little ashamed, but whole. She said we may come back any time. I think she meant it as a threat.',
      },
    ],
  },
  {
    id: 'world-2', icon: '❄️', title: { sv: 'Isriket', en: 'The Ice Realm' },
    pages: [
      {
        sv: 'Brr! Här i norr fryser skatterna fast och kistorna är låsta. Nycklarna ligger förstås alltid på fel ö.',
        en: 'Brr! Up north the loot freezes solid and the chests are locked. The keys are of course always on the wrong island.',
      },
      {
        sv: 'Sigrid Spejaren följer med. Hon kikar under presenningarna så att vi vet vad som väntar. Och vi har lånat färgskepp med extra platser.',
        en: 'Sigrid the Scout comes along. She peeks under the tarps so we know what is waiting. And we have borrowed colour ships for extra seats.',
      },
    ],
  },
  {
    id: 'boss-2-before', icon: '🧊', title: { sv: 'Frostjätten', en: 'The Frost Giant' },
    pages: [
      {
        sv: 'Marken skakar. Frostjätten Ymer har vaknat och andats is över hela sin ö. Nästan allt är fruset.',
        en: 'The ground shakes. Ymer the Frost Giant has woken and breathed ice over his whole island. Almost everything is frozen.',
      },
      {
        sv: 'Isen släpper i vågor. Räkna dragen, låt det röda skeppet ta emot de röda, och skynda inte – jätten väntar ändå.',
        en: 'The ice breaks in waves. Count the moves, let the red ship take the reds, and do not hurry – the giant is waiting anyway.',
      },
    ],
  },
  {
    id: 'boss-2-after', icon: '🧊', title: { sv: 'Tö', en: 'Thaw' },
    pages: [
      {
        sv: 'Ymer gäspade, smälte ihop till en liten isbit och föll i sömn igen. Freja tog den med hem till mjödet. Det var gott.',
        en: 'Ymer yawned, melted down into a little ice cube and fell asleep again. Freja took him home for the mead. It was delicious.',
      },
    ],
  },
  {
    id: 'world-3', icon: '🌋', title: { sv: 'Muspelheim', en: 'Muspelheim' },
    pages: [
      {
        sv: 'Söderut brinner havet. I Muspelheim ligger krutfat bredvid stenarna – och de smäller! Bra för stenar, sämre för skägg.',
        en: 'Down south the sea burns. In Muspelheim powder kegs lie next to the stones – and they go bang! Good for stones, bad for beards.',
      },
      {
        sv: 'Tidvattnet vänder högarna, fångar sitter i burar och väntar på oss, och korpen… akta dig för korpen. Den tar den som väntat längst.',
        en: 'The tide turns the piles, prisoners sit in cages waiting for us, and the raven… beware the raven. It takes whoever has waited longest.',
      },
    ],
  },
  {
    id: 'boss-3-before', icon: '🔥', title: { sv: 'Eldjätten Surt', en: 'Surtr the Fire Giant' },
    pages: [
      {
        sv: 'Här är den, Surts egen ö. Eldjätten själv står i lavan med sitt flammande svärd och skrattar åt oss.',
        en: 'Here it is, Surtr\'s own island. The fire giant himself stands in the lava with his flaming sword, laughing at us.',
      },
      {
        sv: 'Krutfat, tidvatten, en fånge – och korpen var fjärde drag. Allt vi lärt oss, på en gång. Nu, vikingar!',
        en: 'Powder kegs, tide, a prisoner – and the raven every fourth move. Everything we have learned, all at once. Now, vikings!',
      },
    ],
  },
  {
    id: 'boss-3-after', icon: '🔥', title: { sv: 'Elden slocknar', en: 'The fire goes out' },
    pages: [
      {
        sv: 'Surt vacklade, svärdet fräste i havet och elden slocknade. Han sjönk ner i lavan och lovade att komma tillbaka vid Ragnarök. Vi får se.',
        en: 'Surtr staggered, his sword hissed into the sea and the fire went out. He sank into the lava, promising to return at Ragnarök. We shall see.',
      },
    ],
  },
  {
    id: 'finale', icon: '🏆', title: { sv: 'Hem till hallen', en: 'Home to the hall' },
    pages: [
      {
        sv: 'Ormen, Ulvhild, Ymer och Surt – alla besegrade. Skeppet är så fullt av skatter att Björn får sitta på en kista.',
        en: 'The Serpent, Ulvhild, Ymer and Surtr – all defeated. The ship is so full of treasure that Björn has to sit on a chest.',
      },
      {
        sv: 'Tack, vän. Utan dig hade vi fortfarande stått på stranden och grälat om vem som skulle gå först. Skål!',
        en: 'Thank you, friend. Without you we would still be standing on the beach arguing about who goes first. Skål!',
      },
    ],
  },
]

export const storyCard = (id: string) => STORY.find(c => c.id === id)
/** The arrival card of a world (none for Kusten – the start card covers it). */
export const worldStory = (world: number): StoryId | null => (world >= 1 && world <= 3 ? (`world-${world}` as StoryId) : null)
export const bossStory = (world: number, when: 'before' | 'after') => `boss-${world}-${when}` as StoryId
