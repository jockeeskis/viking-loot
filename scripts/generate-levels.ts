// Searches for new pile levels with a target difficulty: `npm run generate-levels`.
// Difficulty = share of all complete pick sequences that win (from the exhaustive solver).
// Seeded, so the same specs always print the same candidates. Paste the results into levels.ts.
import { createGame, selectViking, getSelectableVikings, type LootColor } from '../src/game/engine.ts'
import { stacks } from '../src/game/levels.ts'
import { solve } from '../src/game/solver.ts'

type Spec = { label: string; heights: number[]; min: number; max: number; seed: number }
const SPECS: Spec[] = [
  { label: '7', heights: [3, 4, 3], min: 0.4, max: 0.5, seed: 7 },
  { label: '8', heights: [4, 4, 4], min: 0.32, max: 0.4, seed: 8 },
  { label: '9', heights: [4, 4, 4, 4], min: 0.22, max: 0.34, seed: 9 },
  { label: '10', heights: [5, 4, 5], min: 0.21, max: 0.28, seed: 10 },
  { label: '11', heights: [4, 4, 4, 4], min: 0.12, max: 0.24, seed: 11 },
  { label: '12', heights: [6, 4, 6], min: 0.08, max: 0.2, seed: 12 },
]
const TRIES = 20000
const KEEP = 6 // candidates collected per spec; the ones with the most pick sequences are printed

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
const LETTER: Record<LootColor, string> = { red: 'r', blue: 'b', yellow: 'y' }
const COLORS: LootColor[] = ['red', 'blue', 'yellow']

/** Always sending the front viking must lose – otherwise the level is not a real puzzle. */
function naiveLoses(columns: string[], queue: LootColor[]) {
  let s = createGame(stacks(columns), queue)
  while (s.status === 'playing') s = selectViking(s, getSelectableVikings(s)[0].id)
  return s.status === 'lost'
}

for (const spec of SPECS) {
  const rand = rng(spec.seed)
  const total = spec.heights.reduce((a, b) => a + b, 0)
  const found: { columns: string[]; queue: string; rate: number; lines: number }[] = []
  for (let t = 0; t < TRIES && found.length < KEEP; t++) {
    // even count per colour, every colour used
    const pairs = total / 2
    const per = [1, 1, 1]
    for (let i = 3; i < pairs; i++) per[Math.floor(rand() * 3)]++
    const bag = shuffle(COLORS.flatMap((c, i) => Array<LootColor>(per[i] * 2).fill(c)), rand)
    let k = 0
    const columns = spec.heights.map(h => bag.slice(k, (k += h)).map(c => LETTER[c]).join(''))
    const queue = shuffle(COLORS.flatMap((c, i) => Array<LootColor>(per[i]).fill(c)), rand)
    const r = solve(createGame(stacks(columns), queue))
    if (!r.winnable) continue
    const lines = r.winningLines + r.losingLines
    const rate = r.winningLines / lines
    if (rate < spec.min || rate > spec.max || !naiveLoses(columns, queue)) continue
    found.push({ columns, queue: queue.map(c => c[0].toUpperCase()).join(', '), rate, lines })
  }
  console.log(`Level ${spec.label} (${spec.heights.join('/')}, target ${Math.round(spec.min * 100)}–${Math.round(spec.max * 100)} %):`)
  if (!found.length) console.log('  nothing found – widen the range or add tries')
  for (const f of found.sort((a, b) => b.lines - a.lines).slice(0, 3)) {
    console.log(`  stacks(${JSON.stringify(f.columns).replaceAll('"', "'").replaceAll(',', ', ')}), queue [${f.queue}]  win ${(f.rate * 100).toFixed(1)} % of ${f.lines} lines`)
  }
}
