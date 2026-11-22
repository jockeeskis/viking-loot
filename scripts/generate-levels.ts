// Searches for pile levels with a target difficulty: `npm run generate-levels [-- <label> ...]`.
// Difficulty = share of all complete pick sequences that win (from the exhaustive solver).
// Seeded, so the same specs always print the same candidates. Paste the results into levels.ts.
// The generator itself lives in src/game/generator.ts (the browser uses it for Dagens räd and the endless raid).
// (Levels 7–12 were found with the 0.2 version of this script and 13–24 with the 0.3 version; see git history.)

import { candidate, evaluate, rng, type Found, type Spec as BaseSpec } from '../src/game/generator.ts'
import type { QueueEntry } from '../src/game/engine.ts'

type Spec = BaseSpec & { label: string; seed: number; tries?: number }

// Muspelheim (0.5): each mechanic is introduced on a level that cannot be lost, then used in a puzzle.
// (Isriket, levels 25–36, was found with the 0.4 version of these specs; see git history.)
// The tide gives the player more choices, so tide puzzles need taller piles or company.
const SPECS: Spec[] = [
  { label: '37', heights: [3, 3, 3], kegs: 1, stones: 1, min: 1, max: 1, seed: 37 },
  { label: '38', heights: [4, 4, 4, 4], kegs: 2, stones: 2, min: 0.3, max: 0.5, seed: 38, tries: 40000 },
  { label: '39', heights: [3, 2, 3], tides: 1, min: 1, max: 1, seed: 39 },
  { label: '40', heights: [4, 5, 4, 5], tides: 2, min: 0.25, max: 0.45, seed: 40, tries: 40000 },
  { label: '41', heights: [3, 2, 3], cages: 1, min: 1, max: 1, seed: 41 },
  { label: '42', heights: [4, 4, 4, 4], cages: 2, min: 0.25, max: 0.45, seed: 42 },
  { label: '43', heights: [3, 2, 3], raven: 3, min: 1, max: 1, seed: 43 },
  { label: '44', heights: [4, 4, 4, 4], raven: 3, min: 0.2, max: 0.4, seed: 44 },
  { label: '45', heights: [4, 4, 4, 4], kegs: 1, stones: 1, houses: 1, tides: 1, min: 0.18, max: 0.35, seed: 45, tries: 40000 },
  { label: '46', heights: [4, 4, 4, 4], cages: 1, raven: 4, hidden: true, min: 0.15, max: 0.3, seed: 46, tries: 40000 },
  { label: '47', heights: [4, 5, 4, 5], kegs: 1, stones: 1, ice: 1, cages: 1, houses: 1, tides: 1, min: 0.12, max: 0.28, seed: 47, tries: 60000 },
  { label: '48', heights: [5, 4, 4, 5], kegs: 1, stones: 2, tides: 1, cages: 1, raven: 4, jarls: 1, houses: 1, hidden: true, scouts: 1, min: 0.05, max: 0.2, seed: 48, tries: 80000 },
]
const DEFAULT_TRIES = 20000
const KEEP = 6 // candidates collected per spec
const fmtQueue = (q: QueueEntry[]) => q.map(e =>
  typeof e === 'string' ? e[0].toUpperCase()
    : e.kind === 'jarl' ? `jarl(${e.color[0].toUpperCase()})` : e.kind === 'wild' ? 'WILD' : 'SCOUT').join(', ')

const wanted = process.argv.slice(2)
for (const spec of SPECS.filter(s => !wanted.length || wanted.includes(s.label))) {
  const rand = rng(spec.seed)
  const found: Found[] = []
  const tries = spec.tries ?? DEFAULT_TRIES
  const why: Record<string, number> = {} // rejection counts, printed when nothing is found
  const no = (reason: string) => { why[reason] = (why[reason] ?? 0) + 1 }
  for (let t = 0; t < tries && found.length < KEEP; t++) {
    const cand = candidate(spec, rand)
    if (!cand) { no('no queue'); continue }
    const f = evaluate(spec, cand)
    if (typeof f === 'string') no(f); else found.push(f)
  }
  const target = spec.min === 1 ? 'cannot be lost' : `target ${Math.round(spec.min * 100)}–${Math.round(spec.max * 100)} %`
  console.log(`Level ${spec.label} (${spec.heights.join('/')}, ${target}):`)
  if (!found.length) console.log(`  nothing found – widen the range or add tries (rejected: ${JSON.stringify(why)})`)
  // Intro levels prefer few lines (simple); puzzles prefer many (more to think about).
  const sorted = found.sort((a, b) => (spec.min === 1 ? a.lines - b.lines : b.lines - a.lines)).slice(0, 3)
  for (const f of sorted) {
    const ships = (f.ships ? `, ships ${JSON.stringify(f.ships).replaceAll('"', '')}` : '') + (f.raven ? `, raven ${f.raven}` : '')
    console.log(`  stacks(${JSON.stringify(f.columns).replaceAll('"', "'").replaceAll(',', ', ')}), queue [${fmtQueue(f.queue)}]${ships}  ` +
      `win ${(f.rate * 100).toFixed(1)} % of ${f.lines} lines, par ${f.par}`)
  }
}
