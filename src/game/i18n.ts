// Swedish and English texts (0.5). UI texts live in the dictionaries below. Game data (levels, intros,
// achievements, ships) keeps its Swedish text where it is defined; the English versions are here,
// looked up by id. A test checks that both languages have every text.
import type { Lang } from './settings.ts'
import { levels } from './levels.ts'
import { LEVEL_EN } from './levelTexts.ts'

let lang: Lang = 'sv'
const listeners = new Set<(l: Lang) => void>()

/** The phone's language decides when the player has not chosen one. */
export function detectLang(): Lang {
  const nav = typeof navigator !== 'undefined' ? navigator.language ?? '' : ''
  return /^(sv|nb|nn|no|da)\b/i.test(nav) || nav === '' ? 'sv' : 'en'
}
export const getLang = () => lang
export function setLang(l: Lang) {
  if (l === lang) return
  lang = l
  if (typeof document !== 'undefined') document.documentElement.lang = l
  listeners.forEach(f => f(l))
}
export function onLangChange(f: (l: Lang) => void) { listeners.add(f); return () => listeners.delete(f) }

type Dict = Record<string, string>

export const SV: Dict = {
  'update.ready': '⛵ Ny version finns',
  'update.reload': 'Ladda om',
  'update.later': 'Senare',
  'header.text': 'Välj en av de tre främsta vikingarna. Plundra framifrån – och fyll aldrig skeppets tre väntplatser!',
  'stats.left': 'Kvar',
  'stats.queue': 'Kö',
  'stats.waiting': 'Väntar',
  'stats.parTitle': 'Väntningar hittills / par för tre stjärnor',
  'loss.full': 'En viking hittade inget byte och fick ta skeppets sista väntplats.',
  'loss.stuck': 'Kön är slut och ingen väntande viking kan plundra något mer.',
  'waits.one': '{n} väntning',
  'waits.other': '{n} väntningar',
  'rounds.one': '{n} runda',
  'rounds.other': '{n} rundor',
  'days.one': '{n} dag',
  'days.other': '{n} dagar',
  'stars.aria': '{n} av 3 stjärnor',
  'gen.title': 'Kartlägger ön…',
  'gen.text': 'Lösaren letar fram en ö som går att vinna.',
  'gen.simple': 'Ön blev en enkel ö den här gången.',
  'endless.won': '🏆 Runda {n} klarad!',
  'endless.over': '💀 Räden är slut',
  'endless.harder': 'Nästa ö blir svårare.',
  'endless.record': 'Rekord: {r}',
  'endless.survived': 'Du klarade {r}.',
  'endless.newRecord': '🎉 Nytt rekord!',
  'endless.next': 'Nästa runda →',
  'endless.new': '♾️ Ny oändlig räd',
  'endless.title': 'Oändlig räd',
  'endless.round': 'Runda {n}',
  'endless.howFar': 'Hur långt når du?',
  'endless.recordCard': '🏆 Rekord: {r}',
  'endless.name': 'Oändlig räd · runda {n}',
  'endless.hint': 'Oändlig räd: varje vinst ger en svårare ö. Ingen ångra, inga tips – en förlust och räden är slut.',
  'result.win': '🏆 Seger!',
  'result.lose': '💀 Räden misslyckades',
  'result.summary': 'Byn är plundrad på {moves} drag med {waits}.',
  'result.threeStars': 'Tre stjärnor: högst {waits}.',
  'result.perfect': 'Perfekt räd!',
  'result.dailyDone': '🔥 Dagens räd är klar – svit: {days}.',
  'result.dailyReplay': 'Stjärnorna räknas på dagens första vinst. Ny ö i morgon!',
  'result.allDone': '⚔️ Du har plundrat hela Norden – alla {n} räder är klara!',
  'result.next': 'Nästa bana →',
  'result.again': 'Spela igen',
  'result.retry': '↻ Försök igen',
  'intro.ok': 'Uppfattat!',
  'actions.restart': '↻ Starta om',
  'actions.undo': '↶ Ångra',
  'actions.hint': '💡 Tips ({n})',
  'actions.settings': 'Inställningar',
  'hint.left': 'Ett tips per bana',
  'hint.used': 'Tipset för den här banan är använt',
  'hint.none': 'Inget drag räddar räden längre – ångra eller börja om.',
  'sound.on': 'Slå på ljudeffekter',
  'sound.off': 'Stäng av ljudeffekter',
  'settings.title': '⚙️ Inställningar',
  'settings.music': '🎵 Musik',
  'settings.sound': '🔊 Ljudeffekter',
  'settings.vibration': '📳 Vibration',
  'settings.vibrationNote': 'Fungerar på Android, inte på iPhone.',
  'settings.colorMarks': '🔺 Färgblindläge',
  'settings.colorMarksNote': 'Symboler på färgerna: röd ▲, blå ●, gul ■.',
  'settings.lang': '🌍 Språk',
  'settings.close': 'Klar',
  'section.raids': 'Räder',
  'section.map': 'Karta',
  'section.shipyard': 'Skeppsvarvet',
  'section.achievements': '🏆 Prestationer',
  'section.stats': '📊 Statistik',
  'daily.title': 'Dagens räd',
  'daily.waiting': 'ny ö väntar',
  'daily.streak': '🔥 {days} i rad',
  'daily.name': 'Dagens räd · {day}',
  'daily.hint': 'Dagens räd är densamma för alla i dag. Första vinsten ger stjärnorna – vinn varje dag för att hålla sviten vid liv.',
  'ship.sailing': '⚓ Seglar nu',
  'ship.choose': 'Välj',
  'stat.raids': 'Räder vunna',
  'stat.loot': 'Skatter plundrade',
  'stat.perfect': 'Perfekta räder',
  'stat.chests': 'Kistor öppnade',
  'stat.stars': 'Stjärnor på kartan',
  'stat.daily': 'Dagens räd vunnen',
  'stat.streak': 'Dagar i rad (bästa)',
  'stat.endless': 'Bästa oändliga räd',
  'toast.achievement': 'Prestation: {t}',
  'toast.ship': 'Nytt skepp: {name}',
  'toast.shipText': 'Välj det i Skeppsvarvet.',
  'foot': 'Vikingar, skatter, skepp och ö är 3D-renderade i Blender. Ljud och musik är syntetiserade i webbläsaren.',
  'map.soon': '🌊 Nya banor seglar in snart.',
  'map.locked': '🔒 Vinn bana {n} för att segla vidare hit.',
  'scene.queue': 'VIKINGAKÖ',
  'scene.seats': 'VÄNTPLATSER',
  'scene.full': '💀 Skeppet är fullt!',
  'scene.last': '🔥 Sista platsen – nästa viking utan byte förlorar!',
  'scene.one': '⚠️ En viking väntar – en säker plats kvar',
  'scene.carries3': 'BÄR 3',
  'scene.scout': 'SPEJAR',
  'scene.lastVikings': 'Sista vikingarna!',
  'scene.emptyQueue': 'Kön är tom',
  'world.0': 'Kusten',
  'world.1': 'Fjordarna',
  'world.2': 'Isriket',
  'world.3': 'Muspelheim',
}

export const EN: Dict = {
  'update.ready': '⛵ A new version is ready',
  'update.reload': 'Reload',
  'update.later': 'Later',
  'header.text': 'Pick one of the three front vikings. Plunder from the front – and never fill the ship\'s three seats!',
  'stats.left': 'Left',
  'stats.queue': 'Queue',
  'stats.waiting': 'Waiting',
  'stats.parTitle': 'Waits so far / par for three stars',
  'loss.full': 'A viking found nothing to take and had to use the ship\'s last seat.',
  'loss.stuck': 'The queue is empty and no waiting viking can plunder anything else.',
  'waits.one': '{n} wait',
  'waits.other': '{n} waits',
  'rounds.one': '{n} round',
  'rounds.other': '{n} rounds',
  'days.one': '{n} day',
  'days.other': '{n} days',
  'stars.aria': '{n} of 3 stars',
  'gen.title': 'Charting the island…',
  'gen.text': 'The solver is looking for an island that can be won.',
  'gen.simple': 'This time the island turned out simple.',
  'endless.won': '🏆 Round {n} cleared!',
  'endless.over': '💀 The raid is over',
  'endless.harder': 'The next island will be harder.',
  'endless.record': 'Record: {r}',
  'endless.survived': 'You cleared {r}.',
  'endless.newRecord': '🎉 New record!',
  'endless.next': 'Next round →',
  'endless.new': '♾️ New endless raid',
  'endless.title': 'Endless raid',
  'endless.round': 'Round {n}',
  'endless.howFar': 'How far can you go?',
  'endless.recordCard': '🏆 Record: {r}',
  'endless.name': 'Endless raid · round {n}',
  'endless.hint': 'Endless raid: every win brings a harder island. No undo, no hints – one loss and the raid is over.',
  'result.win': '🏆 Victory!',
  'result.lose': '💀 The raid failed',
  'result.summary': 'The village is plundered in {moves} moves with {waits}.',
  'result.threeStars': 'Three stars: at most {waits}.',
  'result.perfect': 'Perfect raid!',
  'result.dailyDone': '🔥 Today\'s raid is done – streak: {days}.',
  'result.dailyReplay': 'Stars count on the first win of the day. A new island tomorrow!',
  'result.allDone': '⚔️ You have plundered the whole North – all {n} raids are done!',
  'result.next': 'Next level →',
  'result.again': 'Play again',
  'result.retry': '↻ Try again',
  'intro.ok': 'Got it!',
  'actions.restart': '↻ Restart',
  'actions.undo': '↶ Undo',
  'actions.hint': '💡 Hint ({n})',
  'actions.settings': 'Settings',
  'hint.left': 'One hint per level',
  'hint.used': 'The hint for this level is used',
  'hint.none': 'No move can save the raid any more – undo or start over.',
  'sound.on': 'Turn sound effects on',
  'sound.off': 'Turn sound effects off',
  'settings.title': '⚙️ Settings',
  'settings.music': '🎵 Music',
  'settings.sound': '🔊 Sound effects',
  'settings.vibration': '📳 Vibration',
  'settings.vibrationNote': 'Works on Android, not on iPhone.',
  'settings.colorMarks': '🔺 Colour-blind mode',
  'settings.colorMarksNote': 'Symbols on the colours: red ▲, blue ●, yellow ■.',
  'settings.lang': '🌍 Language',
  'settings.close': 'Done',
  'section.raids': 'Raids',
  'section.map': 'Map',
  'section.shipyard': 'Shipyard',
  'section.achievements': '🏆 Achievements',
  'section.stats': '📊 Statistics',
  'daily.title': 'Daily raid',
  'daily.waiting': 'a new island awaits',
  'daily.streak': '🔥 {days} in a row',
  'daily.name': 'Daily raid · {day}',
  'daily.hint': 'Today\'s raid is the same for everyone. The first win gives the stars – win every day to keep your streak alive.',
  'ship.sailing': '⚓ Sailing now',
  'ship.choose': 'Choose',
  'stat.raids': 'Raids won',
  'stat.loot': 'Loot plundered',
  'stat.perfect': 'Perfect raids',
  'stat.chests': 'Chests opened',
  'stat.stars': 'Stars on the map',
  'stat.daily': 'Daily raids won',
  'stat.streak': 'Days in a row (best)',
  'stat.endless': 'Best endless raid',
  'toast.achievement': 'Achievement: {t}',
  'toast.ship': 'New ship: {name}',
  'toast.shipText': 'Choose it in the Shipyard.',
  'foot': 'Vikings, loot, ships and island are rendered in 3D with Blender. Sound and music are synthesized in the browser.',
  'map.soon': '🌊 New levels are sailing in soon.',
  'map.locked': '🔒 Win level {n} to sail on to here.',
  'scene.queue': 'VIKING QUEUE',
  'scene.seats': 'SEATS',
  'scene.full': '💀 The ship is full!',
  'scene.last': '🔥 Last seat – the next viking without loot loses!',
  'scene.one': '⚠️ A viking is waiting – one safe seat left',
  'scene.carries3': 'CARRIES 3',
  'scene.scout': 'SCOUT',
  'scene.lastVikings': 'Last vikings!',
  'scene.emptyQueue': 'The queue is empty',
  'world.0': 'The Coast',
  'world.1': 'The Fjords',
  'world.2': 'The Ice Realm',
  'world.3': 'Muspelheim',
}

/** English for game data defined in Swedish elsewhere (intros, achievements, ships), by id. */
export const DATA_EN: Dict = {
  'intro.house.title': 'New: Houses',
  'intro.house.text': 'A house takes two hits. Each hit costs the viking one carry slot – two vikings of the same colour can share it.',
  'intro.stone.title': 'New: Stones',
  'intro.stone.text': 'A stone cannot be plundered. It crumbles by itself when loot next to it is plundered.',
  'intro.jarl.title': 'New: The jarl',
  'intro.jarl.text': 'The jarl is stronger than other vikings and carries three pieces of loot instead of two.',
  'intro.wild.title': 'New: Ylva',
  'intro.wild.text': 'Ylva has no colour. The first loot she reaches – counting from the leftmost pile – decides her colour for the rest of the raid.',
  'intro.hidden.title': 'New: Hidden loot',
  'intro.hidden.text': 'Loot under a tarp only shows its colour when the way to it is clear.',
  'intro.key.title': 'New: Keys and chests',
  'intro.key.text': 'The padlock has the same colour as the key that opens it. Plunder the key – wherever it is on the island – and it flies to the lock so the chest can be taken.',
  'intro.ice.title': 'New: Ice',
  'intro.ice.text': 'The ice melts a little for every viking you send. The number shows how many moves are left before the loot can be taken.',
  'intro.ships.title': 'New: Colour ships',
  'intro.ships.text': 'The small ship only takes vikings of its colour. They can wait there safely – only the big ship can fill up.',
  'intro.scout.title': 'New: Sigrid the scout',
  'intro.scout.text': 'Sigrid carries nothing, but when you send her she reveals all hidden loot on the island.',
  'intro.keg.title': 'New: Powder kegs',
  'intro.keg.text': 'When a powder keg is plundered it goes off. Stones, ice and tarps right next to it are gone – the loot survives.',
  'intro.tide.title': 'New: The tide',
  'intro.tide.text': 'Every third move the tide washes the front loot of a wave pile to the back. Plan for what comes forward.',
  'intro.cage.title': 'New: The prisoner in the cage',
  'intro.cage.text': 'Plunder the cage and the prisoner steps up to the front of the queue – an extra viking you can send at once.',
  'intro.raven.title': 'New: The raven',
  'intro.raven.text': 'Every N-th move the raven carries off the viking that has waited longest. You get a seat back – but that viking\'s carry slots are lost.',

  'ach.first-raid.title': 'First raid',
  'ach.first-raid.text': 'Win a raid.',
  'ach.kusten.title': 'Lord of the Coast',
  'ach.kusten.text': 'Win every level on the Coast.',
  'ach.fjordarna.title': 'Lord of the Fjords',
  'ach.fjordarna.text': 'Win every level in the Fjords.',
  'ach.isriket.title': 'Lord of the Ice Realm',
  'ach.isriket.text': 'Win every level in the Ice Realm.',
  'ach.gold-coast.title': 'Golden Coast',
  'ach.gold-coast.text': 'Three stars on every level on the Coast.',
  'ach.all-gold.title': 'The whole North in gold',
  'ach.all-gold.text': 'Three stars on all {n} levels.',
  'ach.loot-100.title': 'A hundred treasures',
  'ach.loot-100.text': 'Plunder 100 pieces of loot.',
  'ach.loot-500.title': 'The dragon\'s hoard',
  'ach.loot-500.text': 'Plunder 500 pieces of loot.',
  'ach.perfect-10.title': 'Perfectionist',
  'ach.perfect-10.text': 'Win 10 raids with three stars.',
  'ach.clean.title': 'No regrets',
  'ach.clean.text': 'Win a level with par 2 or more without undo or hints.',
  'ach.chests-10.title': 'Keybearer',
  'ach.chests-10.text': 'Open 10 locked chests.',
  'ach.daily-1.title': 'Hero of the day',
  'ach.daily-1.text': 'Win a daily raid.',
  'ach.streak-7.title': 'A week in a row',
  'ach.streak-7.text': 'Win the daily raid seven days in a row.',
  'ach.endless-5.title': 'Enduring',
  'ach.endless-5.text': 'Clear five rounds of the endless raid.',
  'ach.endless-10.title': 'Endless',
  'ach.endless-10.text': 'Clear ten rounds of the endless raid.',

  'ship.ormen.name': 'The Serpent',
  'ship.ormen.text': 'The faithful old ship with a red and white sail.',
  'ship.havsorn.name': 'Sea Eagle',
  'ship.havsorn.text': 'A blue sail and a white eagle at the bow.',
  'ship.nordstjarnan.name': 'North Star',
  'ship.nordstjarnan.text': 'A night-blue sail with a golden star.',
  'ship.ymer.name': 'Ymir\'s Dragon',
  'ship.ymer.text': 'Black and gold, with a red dragon woken from the ice.',
}

const DICTS: Record<Lang, Dict> = { sv: SV, en: EN }

function fill(s: string, params?: Record<string, string | number>) {
  return params ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m)) : s
}

/** A UI text in the current language. Unknown keys are returned as they are, so a gap is visible. */
export function t(key: string, params?: Record<string, string | number>): string {
  return fill(DICTS[lang][key] ?? SV[key] ?? key, params)
}

/** "{n} wait/waits": picks the `.one` or `.other` form. */
export function tn(key: string, n: number, params?: Record<string, string | number>): string {
  return t(`${key}.${n === 1 ? 'one' : 'other'}`, { n, ...params })
}

/** Game data defined in Swedish: the Swedish text, or the English text with the given id. */
export function tr(sv: string, enKey: string, params?: Record<string, string | number>): string {
  return fill(lang === 'sv' ? sv : DATA_EN[enKey] ?? sv, params)
}

export const levelName = (i: number) => (lang === 'en' ? LEVEL_EN[i]?.name : undefined) ?? levels[i]?.name ?? ''
export const levelHint = (i: number) => (lang === 'en' ? LEVEL_EN[i]?.hint : undefined) ?? levels[i]?.hint ?? ''
export const worldName = (i: number) => t(`world.${i}`)

const MONTHS: Record<Lang, string[]> = {
  sv: ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
}
/** "22 nov" / "22 Nov" from YYYY-MM-DD. */
export function dayLabel(day: string): string {
  const [, m, d] = day.split('-').map(Number)
  return `${d} ${MONTHS[lang][m - 1]}`
}
