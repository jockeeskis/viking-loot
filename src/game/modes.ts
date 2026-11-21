// Dagens räd and the endless raid: which level to generate (pure, seeded) and what is saved about them.
import { generate, hashString, rng, shuffle, toLevel, type Found, type Spec } from './generator.ts'
import type { Mechanic } from './intros.ts'
import type { Level } from './levels.ts'

/** Mechanics by world. Kusten has none; the generated raids only use worlds the player has completed. */
const WORLD_MECHANICS: Mechanic[][] = [[], ['house', 'stone', 'jarl', 'wild', 'hidden'], ['key', 'ice', 'ships', 'scout']]
export type Tier = 0 | 1 | 2

/** 0 = only plain loot, 1 = + Fjordarna, 2 = + Isriket. `completed[w]` = world w's last level is won. */
export function tierFor(completed: boolean[]): Tier {
  return completed[1] ? (completed[2] ? 2 : 1) : 0
}
export const mechanicsForTier = (tier: Tier): Mechanic[] => WORLD_MECHANICS.slice(0, tier + 1).flat()

function withMechanic(spec: Spec, m: Mechanic, rand: () => number): Spec {
  switch (m) {
    case 'house': return { ...spec, houses: 1 + Math.floor(rand() * 2) }
    case 'stone': return { ...spec, stones: 1 }
    case 'jarl': return { ...spec, jarls: 1 }
    case 'wild': return { ...spec, wilds: 1 }
    case 'hidden': return { ...spec, hidden: true }
    case 'key': return { ...spec, keys: 1 }
    case 'ice': return { ...spec, ice: 1 + Math.floor(rand() * 2) }
    case 'ships': return { ...spec, colourShip: 1 + Math.floor(rand() * 2) }
    case 'scout': return { ...spec, hidden: true, scouts: 1 } // Sigrid only makes sense with tarps
  }
}

function pickMechanics(tier: Tier, count: number, rand: () => number): Mechanic[] {
  const pool = mechanicsForTier(tier)
  // At least one from the newest world the player has completed, so the raid feels current.
  const newest = shuffle([...WORLD_MECHANICS[tier]], rand)
  const picked = newest.length ? [newest[0]] : []
  for (const m of shuffle([...pool], rand)) if (picked.length < count && !picked.includes(m)) picked.push(m)
  return picked.slice(0, count)
}

const heights = (cols: number, lo: number, hi: number, rand: () => number) =>
  Array.from({ length: cols }, () => lo + Math.floor(rand() * (hi - lo + 1)))

/**
 * Every colour needs an even number of hits (two per viking), so the total must be even:
 * items − stones + one extra per house − three per jarl. Grow or shrink one pile when it is odd.
 */
export function evenHits(spec: Spec, lo = 3, hi = 5): Spec {
  const total = spec.heights.reduce((a, b) => a + b, 0) - (spec.stones ?? 0) + (spec.houses ?? 0) + (spec.jarls ?? 0)
  if (total % 2 === 0) return spec
  const h = [...spec.heights]
  const grow = h.findIndex(x => x < hi)
  if (grow >= 0) h[grow]++; else h[h.findIndex(x => x > lo)]--
  return { ...spec, heights: h }
}

/** Dagens räd: four piles of 3–4, one or two mechanics, a real puzzle (20–50 % of lines win). */
export function dailySpec(tier: Tier, seed: number): Spec {
  const rand = rng(seed)
  let spec: Spec = { heights: heights(4, 3, 4, rand), min: 0.2, max: 0.5 }
  const count = tier === 0 ? 0 : 1 + Math.floor(rand() * 2)
  for (const m of pickMechanics(tier, count, rand)) spec = withMechanic(spec, m, rand)
  return evenHits(spec, 3, 4)
}

/** Endless raid, round 1, 2, …: more piles, taller piles, more mechanics and fewer winning lines. */
export function endlessSpec(round: number, tier: Tier, seed: number): Spec {
  const rand = rng(seed)
  const cols = round <= 2 ? 3 : 4
  const hi = round <= 1 ? 3 : round <= 5 ? 4 : 5
  const max = Math.max(0.22, 0.75 - 0.06 * round)
  let spec: Spec = { heights: heights(cols, 3, hi, rand), min: Math.max(0.05, max - 0.3), max }
  const count = tier === 0 ? 0 : Math.min(3, Math.floor((round - 1) / 2))
  for (const m of pickMechanics(tier, count, rand)) spec = withMechanic(spec, m, rand)
  return evenHits(spec, 3, Math.max(hi, 4))
}

/** Attempts per spec before relaxing it; about a third are real solver runs (the rest cannot split their colours). */
export const TRIES = 1500
// Last resorts: a plain puzzle, and finally any winnable level (min 0 skips the front-first check).
const PLAIN: Spec = { heights: [4, 4, 4], min: 0.05, max: 0.95 }
const SAFE: Spec = { heights: [3, 3, 4], min: 0, max: 1 }

/**
 * Generate a level, so that there is always one: first the spec from three different seeds
 * (a different mix of mechanics each time), then easier versions of the first spec, then plain levels.
 * Only attempt counts decide the result, never time, so a seed gives the same level everywhere.
 */
export function generateWithFallback(makeSpec: (seed: number) => Spec, seed: number): Found & { step: number } {
  const first = makeSpec(seed)
  const steps: Spec[] = [
    first,
    makeSpec((seed + 1) >>> 0),
    makeSpec((seed + 2) >>> 0),
    { ...first, min: first.min / 2, max: Math.min(0.95, first.max + 0.25) },
    { ...first, min: 0.02, max: 0.95 }, // same mechanics, any puzzle
    PLAIN,
    SAFE,
  ]
  for (let i = 0; i < steps.length; i++) {
    const f = generate(steps[i], (seed + i * 7919) >>> 0, i === steps.length - 1 ? 5000 : TRIES)
    if (f) return { ...f, step: i }
  }
  throw new Error('No level could be generated') // the plain fallbacks practically always succeed
}

// ---------------------------------------------------------------- dates and names

/** The local calendar day as YYYY-MM-DD, so the daily raid changes at the player's midnight. */
export function dateKey(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
export const daySeed = (day: string, tier: Tier) => hashString(`viking-loot daily ${day} tier ${tier}`)
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec']
export function dayLabel(day: string): string {
  const [, m, d] = day.split('-').map(Number)
  return `${d} ${MONTHS[m - 1]}`
}

/** The level for a day. Everyone with the same completed worlds gets the same raid. */
export function dailyLevel(day: string, tier: Tier): Level {
  const seed = daySeed(day, tier)
  return toLevel(generateWithFallback(s => dailySpec(tier, s), seed), `Dagens räd · ${dayLabel(day)}`,
    'Dagens räd är densamma för alla i dag. Första vinsten ger stjärnorna – vinn varje dag för att hålla sviten vid liv.')
}

export function endlessLevel(round: number, tier: Tier, runSeed: number): Level {
  const seed = (runSeed + round * 104729) >>> 0
  return toLevel(generateWithFallback(s => endlessSpec(round, tier, s), seed), `Oändlig räd · runda ${round}`,
    'Oändlig räd: varje vinst ger en svårare ö. Ingen ångra, inga tips – en förlust och räden är slut.')
}

// ---------------------------------------------------------------- saved results

export type ModeProgress = {
  daily: { results: Record<string, number>; lastWon: string | null; streak: number; bestStreak: number }
  endless: { best: number; runs: number }
}
const KEY = 'viking-loot-0.4-modes'

export const emptyModes = (): ModeProgress => ({
  daily: { results: {}, lastWon: null, streak: 0, bestStreak: 0 },
  endless: { best: 0, runs: 0 },
})

export function parseModes(raw: string | null): ModeProgress {
  const p = emptyModes()
  try {
    const d = raw ? JSON.parse(raw) : null
    if (d?.daily && typeof d.daily === 'object') {
      const r = d.daily.results
      if (r && typeof r === 'object') for (const [k, v] of Object.entries(r)) if (/^\d{4}-\d\d-\d\d$/.test(k) && Number.isInteger(v)) p.daily.results[k] = Math.max(0, Math.min(3, v as number))
      if (typeof d.daily.lastWon === 'string') p.daily.lastWon = d.daily.lastWon
      if (Number.isInteger(d.daily.streak)) p.daily.streak = Math.max(0, d.daily.streak)
      if (Number.isInteger(d.daily.bestStreak)) p.daily.bestStreak = Math.max(0, d.daily.bestStreak)
    }
    if (d?.endless && typeof d.endless === 'object') {
      if (Number.isInteger(d.endless.best)) p.endless.best = Math.max(0, d.endless.best)
      if (Number.isInteger(d.endless.runs)) p.endless.runs = Math.max(0, d.endless.runs)
    }
  } catch { /* corrupt data – start over */ }
  return p
}
export function loadModes(): ModeProgress {
  try { return parseModes(localStorage.getItem(KEY)) } catch { return emptyModes() }
}
export function saveModes(p: ModeProgress) {
  try { localStorage.setItem(KEY, JSON.stringify(p)) } catch { /* private mode */ }
}

/** The day before a YYYY-MM-DD day (calendar arithmetic, independent of time zones). */
export function previousDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d - 1))
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`
}

/** The streak as it stands today: it is broken when neither today nor yesterday was won. */
export function currentStreak(p: ModeProgress, today: string): number {
  const last = p.daily.lastWon
  return last === today || last === previousDay(today) ? p.daily.streak : 0
}

/** Record a daily win. Only the first win of a day sets its stars and extends the streak. */
export function recordDailyWin(p: ModeProgress, day: string, stars: number): ModeProgress {
  if (p.daily.results[day]) return p
  const streak = p.daily.lastWon === previousDay(day) ? p.daily.streak + 1 : 1
  // Keep the last 60 days so the stored data stays small.
  const results = Object.fromEntries(Object.entries({ ...p.daily.results, [day]: stars }).sort().slice(-60))
  return { ...p, daily: { results, lastWon: day, streak, bestStreak: Math.max(p.daily.bestStreak, streak) } }
}

/** A new endless run starts. */
export function startEndlessRun(p: ModeProgress): ModeProgress {
  return { ...p, endless: { ...p.endless, runs: p.endless.runs + 1 } }
}

/** A round of the endless raid was won; saved at once so the record survives closing the app mid-run. */
export function recordEndlessRound(p: ModeProgress, round: number): ModeProgress {
  return { ...p, endless: { ...p.endless, best: Math.max(p.endless.best, round) } }
}
