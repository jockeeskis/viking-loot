// Searches for pile levels with a target difficulty: `npm run generate-levels [-- <label> ...]`.
// Difficulty = share of all complete pick sequences that win (from the exhaustive solver).
// Seeded, so the same specs always print the same candidates. Paste the results into levels.ts.
// (Levels 7–12 were found with the 0.2 version of this script and 13–24 with the 0.3 version; see git history.)
//
// Pile letters (see `stacks` in levels.ts): r b y loot, R B Y houses (two hits), s stone, ? hidden,
// !r key, #r chest (locked by the keys of its colour), ~N ice (thaws when move N starts).
import {
  createGame, selectViking, getSelectableVikings, validateLevelGraph,
  type LootColor, type QueueEntry, type ShipSpec,
} from '../src/game/engine.ts'
import { stacks } from '../src/game/levels.ts'
import { solve } from '../src/game/solver.ts'

type Spec = {
  label: string
  heights: number[]
  min: number // target win share (1 = the level cannot be lost)
  max: number
  seed: number
  houses?: number
  stones?: number
  hidden?: boolean // hide every item that is not reachable from the start
  jarls?: number
  wilds?: number
  keys?: number // key + chest pairs (each pair has its own colour)
  ice?: number // frozen items
  colourShip?: number // seats on a colour ship (0/undefined = only the main ship)
  scouts?: number
  tries?: number
}

// Isriket (0.4): each mechanic is introduced on a level that cannot be lost, then used in a puzzle.
const SPECS: Spec[] = [
  { label: '25', heights: [3, 2, 3], keys: 1, min: 1, max: 1, seed: 25 },
  { label: '26', heights: [4, 4, 4], keys: 2, min: 0.35, max: 0.5, seed: 26 },
  { label: '27', heights: [3, 2, 3], ice: 1, min: 1, max: 1, seed: 27 },
  { label: '28', heights: [4, 4, 4], ice: 2, min: 0.3, max: 0.45, seed: 28 },
  { label: '29', heights: [3, 2, 3], colourShip: 2, min: 1, max: 1, seed: 29 },
  { label: '30', heights: [4, 4, 4, 4], colourShip: 2, min: 0.2, max: 0.5, seed: 30, tries: 40000 },
  { label: '31', heights: [3, 2, 3], hidden: true, scouts: 1, min: 1, max: 1, seed: 31 },
  { label: '32', heights: [4, 4, 4, 4], hidden: true, scouts: 1, houses: 2, min: 0.25, max: 0.4, seed: 32 },
  { label: '33', heights: [4, 4, 4, 4], keys: 1, ice: 2, min: 0.2, max: 0.35, seed: 33, tries: 30000 },
  { label: '34', heights: [4, 4, 4, 4], colourShip: 1, stones: 1, houses: 1, min: 0.15, max: 0.32, seed: 34, tries: 80000 },
  { label: '35', heights: [4, 5, 4, 4], keys: 1, ice: 1, colourShip: 1, jarls: 1, hidden: true, scouts: 1, min: 0.14, max: 0.28, seed: 35, tries: 40000 },
  { label: '36', heights: [5, 4, 4, 5], keys: 1, ice: 2, colourShip: 1, houses: 2, stones: 1, hidden: true, scouts: 1, jarls: 1, wilds: 1, min: 0.06, max: 0.2, seed: 36, tries: 60000 },
]
const DEFAULT_TRIES = 20000
const KEEP = 6 // candidates collected per spec
// Note: total hits (loot + 1 extra per house) minus 3 per jarl must be even, or no queue fits.

function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const shuffle = <T>(arr: T[], rand: () => number) => {
  for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]] }
  return arr
}
const COLORS: LootColor[] = ['red', 'blue', 'yellow']
const LETTER: Record<LootColor, string> = { red: 'r', blue: 'b', yellow: 'y' }

type Candidate = { columns: string[]; queue: QueueEntry[]; ships?: ShipSpec[] }

/** Always sending the front viking must lose – otherwise the level is not a real puzzle. */
function naiveLoses(c: Candidate) {
  let s = createGame(stacks(c.columns), c.queue, c.ships)
  while (s.status === 'playing') s = selectViking(s, getSelectableVikings(s)[0].id)
  return s.status === 'lost'
}

type Kind = 'loot' | 'stone' | 'house' | 'key' | 'chest'

/** One random candidate, or null when the colours cannot be split evenly over the vikings. */
function candidate(spec: Spec, rand: () => number): Candidate | null {
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

const fmtQueue = (q: QueueEntry[]) => q.map(e =>
  typeof e === 'string' ? e[0].toUpperCase()
    : e.kind === 'jarl' ? `jarl(${e.color[0].toUpperCase()})` : e.kind === 'wild' ? 'WILD' : 'SCOUT').join(', ')

const wanted = process.argv.slice(2)
for (const spec of SPECS.filter(s => !wanted.length || wanted.includes(s.label))) {
  const rand = rng(spec.seed)
  const found: (Candidate & { rate: number; lines: number; par: number })[] = []
  const tries = spec.tries ?? DEFAULT_TRIES
  const why: Record<string, number> = {} // rejection counts, printed when nothing is found
  const no = (reason: string) => { why[reason] = (why[reason] ?? 0) + 1 }
  for (let t = 0; t < tries && found.length < KEEP; t++) {
    let cand: Candidate | null
    try { cand = candidate(spec, rand) } catch { no('invalid'); continue } // e.g. a chest whose key ended up behind it
    if (!cand) { no('no queue'); continue }
    const loot = stacks(cand.columns)
    try { validateLevelGraph(loot, cand.ships, cand.queue) } catch { no('invalid'); continue }
    const r = solve(createGame(loot, cand.queue, cand.ships))
    if (!r.winnable) { no('unwinnable'); continue }
    const lines = r.winningLines + r.losingLines
    const rate = r.winningLines / lines
    if (rate < spec.min) { no('too hard'); continue }
    if (rate > spec.max) { no('too easy'); continue }
    if (spec.min < 1 && !naiveLoses(cand)) { no('front-first wins'); continue }
    // A colour ship must matter: without it the level has to be clearly harder (or lose outright).
    if (cand.ships) {
      const bare = solve(createGame(loot, cand.queue))
      const bareRate = bare.winningLines / (bare.winningLines + bare.losingLines)
      if (bareRate > rate - (spec.min === 1 ? 0.15 : 0.1)) { no('ship does not matter'); continue }
    }
    found.push({ ...cand, rate, lines, par: r.minWaits ?? 0 })
  }
  const target = spec.min === 1 ? 'cannot be lost' : `target ${Math.round(spec.min * 100)}–${Math.round(spec.max * 100)} %`
  console.log(`Level ${spec.label} (${spec.heights.join('/')}, ${target}):`)
  if (!found.length) console.log(`  nothing found – widen the range or add tries (rejected: ${JSON.stringify(why)})`)
  // Intro levels prefer few lines (simple); puzzles prefer many (more to think about).
  const sorted = found.sort((a, b) => (spec.min === 1 ? a.lines - b.lines : b.lines - a.lines)).slice(0, 3)
  for (const f of sorted) {
    const ships = f.ships ? `, ships ${JSON.stringify(f.ships).replaceAll('"', '')}` : ''
    console.log(`  stacks(${JSON.stringify(f.columns).replaceAll('"', "'").replaceAll(',', ', ')}), queue [${fmtQueue(f.queue)}]${ships}  ` +
      `win ${(f.rate * 100).toFixed(1)} % of ${f.lines} lines, par ${f.par}`)
  }
}
