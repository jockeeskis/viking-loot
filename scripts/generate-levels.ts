// Searches for pile levels with a target difficulty: `npm run generate-levels [-- <label> ...]`.
// Difficulty = share of all complete pick sequences that win (from the exhaustive solver).
// Seeded, so the same specs always print the same candidates. Paste the results into levels.ts.
// The generator itself lives in src/game/generator.ts (the browser uses it for Dagens räd and the endless raid).
// (Levels 7–12 were found with the 0.2 version of this script and 13–24 with the 0.3 version; see git history.)

import { candidate, evaluate, rng, type Found, type Spec as BaseSpec } from '../src/game/generator.ts'
import type { QueueEntry } from '../src/game/engine.ts'

type Spec = BaseSpec & { label: string; seed: number; tries?: number }

// Asgård (0.6): each mechanic is introduced on a level that cannot be lost, then used in a puzzle;
// 55–59 mix them with older mechanics and 60 is the finale. Puzzles go from about 40 down to 8 %.
// (Muspelheim, levels 37–48, was found with the 0.5 version of these specs; see git history.)
const SPECS: Spec[] = [
  { label: '49', heights: [3, 2, 3], gold: 1, min: 1, max: 1, seed: 49 },
  { label: '50', heights: [4, 4, 4, 4], gold: 2, min: 0.3, max: 0.45, seed: 50, tries: 40000 },
  { label: '51', heights: [3, 2, 3], gates: 1, min: 1, max: 1, seed: 51 },
  { label: '52', heights: [4, 4, 4, 4], gates: 2, min: 0.25, max: 0.4, seed: 52, tries: 40000 },
  { label: '53', heights: [3, 2, 3], valkyries: 1, min: 1, max: 1, seed: 53 },
  { label: '54', heights: [4, 5, 4, 5], valkyries: 1, min: 0.22, max: 0.4, seed: 54, tries: 60000 },
  { label: '55', heights: [4, 4, 4, 5], gold: 1, gates: 1, houses: 1, min: 0.18, max: 0.32, seed: 55, tries: 40000 },
  { label: '56', heights: [4, 4, 4, 4], valkyries: 1, raven: 4, ice: 1, min: 0.15, max: 0.28, seed: 56, tries: 40000 },
  { label: '57', heights: [4, 5, 4, 4], gates: 1, keys: 1, hidden: true, stones: 1, min: 0.12, max: 0.24, seed: 57, tries: 60000 },
  { label: '58', heights: [4, 5, 4, 5], gold: 1, valkyries: 1, tides: 1, cages: 1, min: 0.1, max: 0.2, seed: 58, tries: 60000 },
  { label: '59', heights: [5, 4, 4, 5], gold: 1, gates: 1, valkyries: 1, kegs: 1, stones: 1, jarls: 1, min: 0.08, max: 0.16, seed: 59, tries: 80000 },
  { label: '60', heights: [5, 5, 5, 4], gold: 2, gates: 2, valkyries: 1, houses: 1, wilds: 1, hidden: true, scouts: 1, min: 0.05, max: 0.12, seed: 60, tries: 80000 },
]
// The boss raids, one per world, using only that world's mechanics plus a twist (Loke: 0.6).
// Run with `npm run generate-levels -- --bosses [label ...]`.
const BOSS_SPECS: Spec[] = [
  { label: 'serpent', heights: [4, 4, 4, 4], mainSlots: 2, houses: 1, stones: 1, min: 0.15, max: 0.35, seed: 101, tries: 40000 },
  { label: 'ulvhild', heights: [4, 4, 5, 4], onlySpecial: true, hidden: true, stones: 1, min: 0.1, max: 0.3, seed: 102, tries: 40000 },
  { label: 'ymer', heights: [4, 5, 4, 5], ice: 9, keys: 1, colourShip: 2, min: 0.08, max: 0.25, seed: 103, tries: 60000 },
  { label: 'surt', heights: [5, 4, 4, 5], kegs: 2, stones: 2, tides: 1, cages: 1, raven: 4, min: 0.05, max: 0.2, seed: 104, tries: 80000 },
  // Loke's lies: gold, gates and a valkyrie, and nearly everything hidden (gates show their colour).
  { label: 'loke', heights: [5, 4, 5, 4], gold: 2, gates: 2, valkyries: 1, hidden: true, min: 0.05, max: 0.2, seed: 105, tries: 80000 },
]
// The handmade finales of the events (0.6), one per event: a fair puzzle with the event's theme.
// Run with `npm run generate-levels -- --events [label ...]`.
const EVENT_SPECS: Spec[] = [
  { label: 'midvinterblot', heights: [4, 4, 4, 4], ice: 2, keys: 1, min: 0.15, max: 0.3, seed: 201, tries: 40000 },
  { label: 'varblot', heights: [4, 4, 4, 4], houses: 2, hidden: true, min: 0.15, max: 0.3, seed: 202, tries: 40000 },
  { label: 'midsommar', heights: [4, 5, 4, 5], wilds: 1, houses: 1, stones: 1, min: 0.15, max: 0.3, seed: 203, tries: 40000 },
  { label: 'alvablot', heights: [4, 4, 5, 5], hidden: true, scouts: 1, raven: 4, min: 0.15, max: 0.3, seed: 204, tries: 40000 },
]
const DEFAULT_TRIES = 20000
const KEEP = 6 // candidates collected per spec
const fmtQueue = (q: QueueEntry[]) => q.map(e =>
  typeof e === 'string' ? e[0].toUpperCase()
    : e.kind === 'jarl' ? `jarl(${e.color[0].toUpperCase()})` : e.kind === 'wild' ? 'WILD' : e.kind === 'valkyrie' ? 'VALK' : 'SCOUT').join(', ')

const args = process.argv.slice(2)
const bosses = args.includes('--bosses')
const events = args.includes('--events')
const wanted = args.filter(a => a !== '--bosses' && a !== '--events')
for (const spec of (bosses ? BOSS_SPECS : events ? EVENT_SPECS : SPECS).filter(s => !wanted.length || wanted.includes(s.label))) {
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
