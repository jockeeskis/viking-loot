// Random pile levels, checked by the exhaustive solver. Used by `npm run generate-levels` to find
// the campaign levels, and in the browser (in a Web Worker) for Dagens räd and the endless raid.
// Everything is seeded and counts attempts instead of time, so a seed gives the same level on every device.
//
// Pile letters (see `stacks` in levels.ts): r b y loot, R B Y houses (two hits), s stone, ? hidden,
// !r key, #r chest (locked by the keys of its colour), ~N ice (thaws when move N starts).
import {
  createGame, selectViking, getSelectableVikings, validateLevelGraph,
  type LootColor, type QueueEntry, type ShipSpec,
} from './engine.ts'
import { stacks, type Level } from './levels.ts'
import { solve } from './solver.ts'

export type Spec = {
  heights: number[]
  min: number // target win share (1 = the level cannot be lost)
  max: number
  houses?: number
  stones?: number
  hidden?: boolean // hide every item that is not reachable from the start
  jarls?: number
  wilds?: number
  keys?: number // key + chest pairs (each pair has its own colour)
  ice?: number // frozen items
  colourShip?: number // seats on a colour ship (0/undefined = only the main ship)
  scouts?: number
}
// Note: total hits (loot + 1 extra per house) minus 3 per jarl must be even, or no queue fits.

export type Candidate = { columns: string[]; queue: QueueEntry[]; ships?: ShipSpec[] }
export type Found = Candidate & { rate: number; lines: number; par: number }

/** mulberry32: a small, fast seeded random generator. */
export function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** A stable 32-bit hash of a string (FNV-1a), used to turn dates into seeds. */
export function hashString(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0
  return h
}

export const shuffle = <T>(arr: T[], rand: () => number) => {
  for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]] }
  return arr
}
const COLORS: LootColor[] = ['red', 'blue', 'yellow']
const LETTER: Record<LootColor, string> = { red: 'r', blue: 'b', yellow: 'y' }

/** Always sending the front viking must lose – otherwise the level is not a real puzzle. */
export function naiveLoses(c: Candidate) {
  let s = createGame(stacks(c.columns), c.queue, c.ships)
  while (s.status === 'playing') s = selectViking(s, getSelectableVikings(s)[0].id)
  return s.status === 'lost'
}

type Kind = 'loot' | 'stone' | 'house' | 'key' | 'chest'

/** One random candidate, or null when the colours cannot be split evenly over the vikings. */
export function candidate(spec: Spec, rand: () => number): Candidate | null {
  // 1. Which slot holds what. Stones never stand at the very back (they would block nothing).
  const slots = spec.heights.flatMap((h, c) => Array.from({ length: h }, (_, row) => ({ c, row, back: row === 0, front: row === h - 1 })))
  const order = shuffle(slots.map((_, i) => i), rand)
  const kind: Kind[] = slots.map(() => 'loot')
  const color = slots.map(() => COLORS[Math.floor(rand() * 3)])
  let stones = spec.stones ?? 0
  for (const i of order) if (stones > 0 && !slots[i].back) { kind[i] = 'stone'; stones-- }
  if (stones > 0) return null
  // Keys and chests: each pair has its own colour, and the key lies in another pile than its chest.
  const pairColours = shuffle([...COLORS], rand)
  for (let k = 0; k < (spec.keys ?? 0); k++) {
    const chest = shuffle([...order], rand).find(i => kind[i] === 'loot' && !slots[i].front)
    if (chest === undefined) return null
    const key = shuffle([...order], rand).find(i => kind[i] === 'loot' && slots[i].c !== slots[chest].c)
    if (key === undefined) return null
    kind[chest] = 'chest'; kind[key] = 'key'
    color[chest] = color[key] = pairColours[k]
  }
  let houses = spec.houses ?? 0
  for (const i of shuffle([...order], rand)) if (houses > 0 && kind[i] === 'loot') { kind[i] = 'house'; houses-- }
  // 2. Colours, and how many hits each colour needs.
  const hits: Record<LootColor, number> = { red: 0, blue: 0, yellow: 0 }
  slots.forEach((_, i) => { if (kind[i] !== 'stone') hits[color[i]] += kind[i] === 'house' ? 2 : 1 })
  if (COLORS.some(c => hits[c] === 0)) return null // every colour used
  // 3. Vikings that exactly cover those hits: a jarl carries 3, a wild viking covers 2 of any colour, the rest 2 each.
  const queue: QueueEntry[] = []
  for (let j = 0; j < (spec.jarls ?? 0); j++) {
    const c = shuffle([...COLORS], rand).find(x => hits[x] >= 3)
    if (!c) return null
    hits[c] -= 3
    queue.push({ kind: 'jarl', color: c })
  }
  for (let w = 0; w < (spec.wilds ?? 0); w++) {
    const c = shuffle([...COLORS], rand).find(x => hits[x] >= 2)
    if (!c) return null
    hits[c] -= 2
    queue.push({ kind: 'wild' })
  }
  for (const c of COLORS) {
    if (hits[c] % 2) return null
    for (let k = 0; k < hits[c] / 2; k++) queue.push(c)
  }
  for (let s = 0; s < (spec.scouts ?? 0); s++) queue.push({ kind: 'scout' })
  // 4. Ice: frozen items thaw somewhere in the first part of the raid, never after the last viking.
  const frozen = slots.map(() => 0)
  let ice = spec.ice ?? 0
  for (const i of shuffle([...order], rand)) {
    if (ice > 0 && kind[i] !== 'stone') { frozen[i] = 2 + Math.floor(rand() * Math.max(1, queue.length - 3)); ice-- }
  }
  // 5. Pile strings, back→front.
  const columns = spec.heights.map((h, c) => slots.map((s, i) => ({ s, i })).filter(o => o.s.c === c).map(({ s, i }) => {
    if (kind[i] === 'stone') return 's'
    const letter = kind[i] === 'house' ? LETTER[color[i]].toUpperCase() : LETTER[color[i]]
    const prefix = (spec.hidden && s.row < h - 1 ? '?' : '') + (frozen[i] ? `~${frozen[i]}` : '') +
      (kind[i] === 'key' ? '!' : kind[i] === 'chest' ? '#' : '')
    return prefix + letter
  }).join(''))
  // 6. A colour ship for one of the colours in the queue.
  let ships: ShipSpec[] | undefined
  if (spec.colourShip) {
    const used = COLORS.filter(c => queue.some(q => q === c || (typeof q !== 'string' && q.kind === 'jarl' && q.color === c)))
    ships = [{ slots: 3 }, { slots: spec.colourShip, color: used[Math.floor(rand() * used.length)] }]
  }
  return { columns, queue: shuffle(queue, rand), ships }
}

/** Check a candidate against a spec with the solver. Returns the reason when it is rejected. */
export function evaluate(spec: Spec, cand: Candidate): Found | string {
  let loot
  try {
    loot = stacks(cand.columns)
    validateLevelGraph(loot, cand.ships, cand.queue)
  } catch { return 'invalid' } // e.g. a chest whose key ended up behind it
  const r = solve(createGame(loot, cand.queue, cand.ships))
  if (!r.winnable) return 'unwinnable'
  const lines = r.winningLines + r.losingLines
  const rate = r.winningLines / lines
  if (rate < spec.min) return 'too hard'
  if (rate > spec.max) return 'too easy'
  // Puzzles (0 < min < 1) must not be solved by always sending the front viking.
  if (spec.min > 0 && spec.min < 1 && !naiveLoses(cand)) return 'front-first wins'
  // A colour ship must matter: without it the level has to be clearly harder (or lose outright).
  if (cand.ships) {
    const bare = solve(createGame(loot, cand.queue))
    const bareRate = bare.winningLines / (bare.winningLines + bare.losingLines)
    if (bareRate > rate - (spec.min === 1 ? 0.15 : 0.1)) return 'ship does not matter'
  }
  return { ...cand, rate, lines, par: r.minWaits ?? 0 }
}

/** The first candidate from `seed` that meets the spec, or null after `tries` attempts. */
export function generate(spec: Spec, seed: number, tries: number): Found | null {
  const rand = rng(seed)
  for (let t = 0; t < tries; t++) {
    const cand = candidate(spec, rand)
    if (!cand) continue
    const f = evaluate(spec, cand)
    if (typeof f !== 'string') return f
  }
  return null
}

/** Turn a found candidate into a playable level. */
export function toLevel(f: Found, name: string, hint: string): Level {
  return { name, hint, par: f.par, queue: f.queue, loot: stacks(f.columns), ...(f.ships ? { ships: f.ships } : {}) }
}
