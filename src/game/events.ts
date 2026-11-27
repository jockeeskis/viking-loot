// The events (0.6): time-limited raids through the year, decided by the phone's own date so they
// work offline. Each event has five generated islands and a handmade finale, and gives a relic,
// a sail and an achievement. In development an event can be forced with `?event=<id>`.
import { generateWithFallback, heights, evenHits, withMechanic, pickMechanics, mechanicsForTier, EVENT_ISLANDS, type Tier } from './modes.ts'
import { hashString, rng, toLevel, type Spec } from './generator.ts'
import { stacks, WILD, SCOUT, type Level } from './levels.ts'
import type { Mechanic } from './intros.ts'

export type EventId = 'midvinterblot' | 'varblot' | 'midsommar' | 'alvablot'
export type DecorId = 'julbock' | 'bjorkris' | 'majstang' | 'lyktor'
export type RaidEvent = {
  id: EventId
  icon: string
  /** First and last day, 'MM-DD'. A range may run over new year (Midvinterblot). */
  from: string
  to: string
  /** The mechanics the generated islands lean on (only those the player already knows are used). */
  theme: Mechanic[]
  decor: DecorId
  island: 'grass' | 'snow'
  mist?: boolean
  /** Given once when every island is won (cosmetics.ts / relics.ts). */
  rewards: string[]
  finale: Level
}

const R = 'red', B = 'blue', Y = 'yellow'

/** Swedish names (English in i18n, `event.<id>`). */
export const EVENT_NAMES: Record<EventId, string> = { midvinterblot: 'Midvinterblot', varblot: 'Vårblot', midsommar: 'Midsommar', alvablot: 'Alvablot' }

export const EVENTS: RaidEvent[] = [
  {
    id: 'midvinterblot', icon: '🐐', from: '12-01', to: '01-06', theme: ['ice', 'key'], decor: 'julbock', island: 'snow',
    rewards: ['relic-julbock', 'sail-midvinter'],
    finale: {
      name: 'Midvinternatten', par: 2,
      hint: 'Isen smälter för varje viking du skickar. Vänta in den – och glöm inte nyckeln.',
      queue: [Y, Y, R, Y, B, B, B, R],
      loot: stacks(['y~4brr', 'bb~3by', 'yr#yy', 'b!ybr']),
    },
  },
  {
    id: 'varblot', icon: '🌿', from: '03-01', to: '04-30', theme: ['house', 'hidden'], decor: 'bjorkris', island: 'grass',
    rewards: ['relic-varkvist', 'sail-var'],
    finale: {
      name: 'Vårfloden', par: 2,
      hint: 'Allt är täckt av vårens första löv. Husen kräver två hugg.',
      queue: [Y, Y, R, R, R, R, B, Y, B],
      loot: stacks(['?b?r?yY', '?r?b?ry', '?r?y?rb', '?R?r?by']),
    },
  },
  {
    id: 'midsommar', icon: '🌸', from: '06-01', to: '06-30', theme: ['wild', 'house', 'stone'], decor: 'majstang', island: 'grass',
    rewards: ['relic-krans', 'sail-midsommar'],
    finale: {
      name: 'Midsommarnatten', par: 1,
      hint: 'Ylva dansar runt stången och tar färg av första skatten hon rör. Husen kräver två hugg.',
      queue: [WILD, R, R, Y, R, B, B, B, Y],
      loot: stacks(['ysry', 'brrbb', 'rRrr', 'yybbb']),
    },
  },
  {
    id: 'alvablot', icon: '🏮', from: '10-01', to: '11-30', theme: ['hidden', 'scout', 'raven'], decor: 'lyktor', island: 'grass', mist: true,
    rewards: ['relic-lykta', 'sail-alva'],
    finale: {
      name: 'Alvadimman', par: 2,
      hint: 'Dimman döljer allt och korpen kommer var fjärde drag. Låt Sigrid spana först.',
      queue: [R, Y, R, R, B, B, R, SCOUT, R, Y, B],
      raven: 4,
      loot: stacks(['?y?r?rr', '?y?r?rr', '?b?y?b?br', '?r?b?y?bb']),
    },
  },
]

const md = (d: Date) => `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
export const inRange = (day: string, from: string, to: string) => (from <= to ? day >= from && day <= to : day >= from || day <= to)

/** The event running on a date, or the forced one (development). */
export function activeEvent(date: Date, forced?: string | null): RaidEvent | null {
  if (forced) return EVENTS.find(e => e.id === forced) ?? null
  const day = md(date)
  return EVENTS.find(e => inRange(day, e.from, e.to)) ?? null
}
/** The year an event season belongs to: Midvinterblot in January still counts as last December's. */
export function eventYear(e: RaidEvent, date: Date): number {
  return e.from > e.to && md(date) <= e.to ? date.getFullYear() - 1 : date.getFullYear()
}
export const eventKey = (e: RaidEvent, year: number) => `${e.id}-${year}`
/** Days left of the event, today included. */
export function eventDaysLeft(e: RaidEvent, date: Date): number {
  const [m, d] = e.to.split('-').map(Number)
  const endYear = e.from > e.to && md(date) > e.to ? date.getFullYear() + 1 : date.getFullYear()
  const end = Date.UTC(endYear, m - 1, d)
  const today = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
  return Math.max(1, Math.round((end - today) / 86400000) + 1)
}

/** The five generated islands: from a warm-up to a hard puzzle, with the theme where the player knows it. */
export function eventSpec(e: RaidEvent, index: number, tier: Tier, seed: number): Spec {
  const rand = rng(seed)
  const cols = index < 2 ? 3 : 4
  const hi = index < 1 ? 3 : 4 // at most 4 high, so an island is generated in a few seconds on a phone
  const max = Math.max(0.2, 0.75 - 0.12 * index)
  let spec: Spec = { heights: heights(cols, 3, hi, rand), min: Math.max(0.06, max - 0.3), max }
  const known = mechanicsForTier(tier)
  const theme = e.theme.filter(m => known.includes(m))
  const count = Math.min(3, 1 + Math.floor(index / 2))
  const picked = theme.length ? theme.slice(0, count) : pickMechanics(tier, tier === 0 ? 0 : Math.min(2, count), rand)
  for (const m of picked) spec = withMechanic(spec, m, rand)
  return evenHits(spec, 3, Math.max(hi, 4))
}

/** An island of an event: 0–4 are generated (the same for everyone that year), 5 is the finale. */
export function eventLevel(id: EventId, year: number, index: number, tier: Tier): Level {
  const e = EVENTS.find(x => x.id === id)!
  if (index >= EVENT_ISLANDS - 1) return e.finale
  const seed = hashString(`viking-loot event ${id} ${year} island ${index} tier ${tier}`)
  return toLevel(generateWithFallback(s => eventSpec(e, index, tier, s), seed), `${e.id} ${index + 1}`,
    'Händelsens öar är desamma för alla i år. Klara alla sex för händelsens belöningar.')
}
