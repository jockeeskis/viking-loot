// Asks the generator worker for a level. Falls back to the main thread if workers are unavailable,
// and to a small instant level if the worker takes far too long (a very slow or busy phone).
import type { Level } from './levels'
import { dailyLevel, endlessLevel, generateWithFallback, type Tier } from './modes'
import { toLevel } from './generator'

export type LevelRequest =
  | { kind: 'daily'; day: string; tier: Tier }
  | { kind: 'endless'; round: number; tier: Tier; runSeed: number }
export type LevelReply = { id: number; level?: Level; error?: string }

const TIMEOUT_MS = 25_000
let worker: Worker | null = null
let nextId = 1
const waiting = new Map<number, (r: LevelReply) => void>()

function getWorker(): Worker | null {
  if (worker) return worker
  try {
    worker = new Worker(new URL('./generator.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (e: MessageEvent<LevelReply>) => { waiting.get(e.data.id)?.(e.data); waiting.delete(e.data.id) }
    worker.onerror = () => { failAll('worker error') }
  } catch { worker = null }
  return worker
}

function failAll(error: string) {
  worker?.terminate()
  worker = null
  for (const [id, done] of waiting) done({ id, error })
  waiting.clear()
}

/** A tiny level made on the main thread when the worker fails; it is generated in a few milliseconds. */
function emergencyLevel(r: LevelRequest): Level {
  const seed = r.kind === 'daily' ? r.day.length * 7 + r.tier : r.round + r.runSeed
  const f = generateWithFallback(() => ({ heights: [3, 3, 4], min: 0, max: 1 }), seed >>> 0)
  return toLevel(f, r.kind === 'daily' ? 'Dagens räd' : `Oändlig räd · runda ${r.round}`, 'Ön blev en enkel ö den här gången.')
}

/** Generate a level for Dagens räd or the endless raid. */
export function requestLevel(r: LevelRequest): Promise<Level> {
  const w = getWorker()
  if (!w) {
    // No worker support: generate here (it may stall the page for a moment).
    return new Promise(resolve => setTimeout(() => resolve(r.kind === 'daily' ? dailyLevel(r.day, r.tier) : endlessLevel(r.round, r.tier, r.runSeed)), 30))
  }
  const id = nextId++
  return new Promise<Level>(resolve => {
    const timer = setTimeout(() => { failAll('timeout') }, TIMEOUT_MS)
    waiting.set(id, reply => {
      clearTimeout(timer)
      if (reply.level) resolve(reply.level)
      else resolve(emergencyLevel(r))
    })
    w.postMessage({ ...r, id })
  })
}
