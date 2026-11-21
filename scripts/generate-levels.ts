// Searches for pile levels with a target difficulty: `npm run generate-levels [-- <label> ...]`.
// Difficulty = share of all complete pick sequences that win (from the exhaustive solver).
// Seeded, so the same specs always print the same candidates. Paste the results into levels.ts.
// (Levels 7–12 were found with the 0.2 version of this script; see git history.)
//
// Pile letters (see `stacks` in levels.ts): r b y loot, R B Y houses (two hits), s stone, ? hidden.
import { createGame, selectViking, getSelectableVikings, validateLevelGraph, type LootColor, type QueueEntry } from '../src/game/engine.ts'
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
  tries?: number
}

// Fjordarna (0.3): each mechanic is introduced on a level that cannot be lost, then used in a puzzle.
const SPECS: Spec[] = [
  { label: '13', heights: [3, 2, 3], houses: 2, min: 1, max: 1, seed: 13 },
  { label: '14', heights: [4, 3, 4], houses: 3, min: 0.35, max: 0.5, seed: 14 },
  { label: '15', heights: [3, 3, 3], stones: 1, min: 1, max: 1, seed: 15 },
  { label: '16', heights: [4, 4, 4], stones: 2, min: 0.3, max: 0.45, seed: 16 },
  { label: '17', heights: [3, 3, 3], jarls: 1, min: 1, max: 1, seed: 17 },
  { label: '18', heights: [4, 4, 4, 4], jarls: 1, houses: 1, min: 0.25, max: 0.4, seed: 18 },
  { label: '19', heights: [3, 2, 3], wilds: 1, min: 1, max: 1, seed: 19 },
  { label: '20', heights: [4, 4, 4], wilds: 1, houses: 2, min: 0.25, max: 0.4, seed: 20 },
  { label: '21', heights: [3, 2, 3], hidden: true, min: 1, max: 1, seed: 21 },
  { label: '22', heights: [4, 4, 4, 4], hidden: true, min: 0.2, max: 0.35, seed: 22 },
  { label: '23', heights: [4, 4, 4, 4], houses: 2, stones: 1, hidden: true, jarls: 1, min: 0.15, max: 0.3, seed: 23, tries: 40000 },
  { label: '24', heights: [5, 4, 4, 5], houses: 3, stones: 2, hidden: true, jarls: 1, wilds: 1, min: 0.08, max: 0.22, seed: 24, tries: 40000 },
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

/** Always sending the front viking must lose – otherwise the level is not a real puzzle. */
function naiveLoses(columns: string[], queue: QueueEntry[]) {
  let s = createGame(stacks(columns), queue)
  while (s.status === 'playing') s = selectViking(s, getSelectableVikings(s)[0].id)
  return s.status === 'lost'
}

/** One random candidate, or null when the colours cannot be split evenly over the vikings. */
function candidate(spec: Spec, rand: () => number): { columns: string[]; queue: QueueEntry[] } | null {
  // 1. Which slot holds what. Stones never stand at the very back (they would block nothing).
  const slots = spec.heights.flatMap((h, c) => Array.from({ length: h }, (_, row) => ({ c, row, back: row === 0 })))
  const order = shuffle(slots.map((_, i) => i), rand)
  const kind = slots.map(() => 'loot' as 'loot' | 'stone' | 'house')
  let stones = spec.stones ?? 0
  for (const i of order) if (stones > 0 && !slots[i].back) { kind[i] = 'stone'; stones-- }
  if (stones > 0) return null
  let houses = spec.houses ?? 0
  for (const i of shuffle([...order], rand)) if (houses > 0 && kind[i] === 'loot') { kind[i] = 'house'; houses-- }
  // 2. Colours, and how many hits each colour needs.
  const color = slots.map(() => COLORS[Math.floor(rand() * 3)])
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
  // 4. Pile strings, back→front.
  const columns = spec.heights.map((h, c) => slots.map((s, i) => ({ s, i })).filter(o => o.s.c === c).map(({ s, i }) => {
    const ch = kind[i] === 'stone' ? 's' : kind[i] === 'house' ? LETTER[color[i]].toUpperCase() : LETTER[color[i]]
    return spec.hidden && s.row < h - 1 && ch !== 's' ? `?${ch}` : ch
  }).join(''))
  return { columns, queue: shuffle(queue, rand) }
}

const fmtQueue = (q: QueueEntry[]) => q.map(e =>
  typeof e === 'string' ? e[0].toUpperCase() : e.kind === 'jarl' ? `jarl(${e.color[0].toUpperCase()})` : 'WILD').join(', ')

const wanted = process.argv.slice(2)
for (const spec of SPECS.filter(s => !wanted.length || wanted.includes(s.label))) {
  const rand = rng(spec.seed)
  const found: { columns: string[]; queue: QueueEntry[]; rate: number; lines: number; par: number }[] = []
  const tries = spec.tries ?? DEFAULT_TRIES
  for (let t = 0; t < tries && found.length < KEEP; t++) {
    const cand = candidate(spec, rand)
    if (!cand) continue
    const loot = stacks(cand.columns)
    try { validateLevelGraph(loot) } catch { continue }
    const r = solve(createGame(loot, cand.queue))
    if (!r.winnable) continue
    const lines = r.winningLines + r.losingLines
    const rate = r.winningLines / lines
    if (rate < spec.min || rate > spec.max) continue
    if (spec.min < 1 && !naiveLoses(cand.columns, cand.queue)) continue
    found.push({ ...cand, rate, lines, par: r.minWaits ?? 0 })
  }
  const target = spec.min === 1 ? 'cannot be lost' : `target ${Math.round(spec.min * 100)}–${Math.round(spec.max * 100)} %`
  console.log(`Level ${spec.label} (${spec.heights.join('/')}, ${target}):`)
  if (!found.length) console.log('  nothing found – widen the range or add tries')
  // Intro levels prefer few lines (simple); puzzles prefer many (more to think about).
  const sorted = found.sort((a, b) => (spec.min === 1 ? a.lines - b.lines : b.lines - a.lines)).slice(0, 3)
  for (const f of sorted) {
    console.log(`  stacks(${JSON.stringify(f.columns).replaceAll('"', "'").replaceAll(',', ', ')}), queue [${fmtQueue(f.queue)}]  ` +
      `win ${(f.rate * 100).toFixed(1)} % of ${f.lines} lines, par ${f.par}`)
  }
}
