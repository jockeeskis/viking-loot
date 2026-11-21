// Times level generation for Dagens räd and the endless raid: `node scripts/bench-modes.ts`.
// Prints which fallback step was needed (0–2 = the spec, 3–4 = easier, 5+ = a plain level without mechanics).
import { dailySpec, endlessSpec, daySeed, generateWithFallback, dateKey, type Tier } from '../src/game/modes.ts'

const timed = <T>(f: () => T): [T, number] => { const t = performance.now(); const r = f(); return [r, performance.now() - t] }
for (const tier of [0, 1, 2] as Tier[]) {
  const times: number[] = [], steps: number[] = []
  for (let d = 0; d < 30; d++) {
    const seed = daySeed(dateKey(new Date(2026, 10, 1 + d)), tier)
    const [f, t] = timed(() => generateWithFallback(s => dailySpec(tier, s), seed))
    times.push(t); steps.push(f.step)
  }
  times.sort((a, b) => a - b)
  console.log(`daily tier ${tier}: median ${times[15].toFixed(0)} ms, max ${times.at(-1)!.toFixed(0)} ms, steps ${steps.join('')}`)
}
for (const tier of [0, 1, 2] as Tier[]) {
  const out: string[] = []
  let total = 0
  for (let round = 1; round <= 14; round++) {
    const seed = (777 + round * 104729) >>> 0
    const [f, t] = timed(() => generateWithFallback(s => endlessSpec(round, tier, s), seed))
    total += t
    out.push(`${round}:${f.step}/${t.toFixed(0)}ms/${(f.rate * 100).toFixed(0)}%`)
  }
  console.log(`endless tier ${tier} (${total.toFixed(0)} ms): ${out.join(' ')}`)
}
