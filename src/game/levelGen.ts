// Asks the generator worker for a level. Falls back to the main thread if workers are unavailable,
// and to a small instant level if the worker takes far too long (a very slow or busy phone).
import type { Level } from './levels'
import { dailyLevel, endlessLevel, weeklyLevel, generateWithFallback, type Tier } from './modes'
import { eventLevel, type EventId } from './events'
import { toLevel } from './generator'

export type LevelRequest =
  | { kind: 'daily'; day: string; tier: Tier }
  | { kind: 'endless'; round: number; tier: Tier; runSeed: number }
  | { kind: 'weekly'; week: string; step: number; tier: Tier }
  | { kind: 'event'; event: EventId; year: number; index: number; tier: Tier }
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

/** Levels made by emergencyLevel – never cached as the real island of a day, week or event. */
const emergencies = new WeakSet<Level>()
export const isEmergency = (l: Level) => emergencies.has(l)

/** A tiny level made on the main thread when the worker fails; it is generated in a few milliseconds. */
function emergencyLevel(r: LevelRequest): Level {
  const seed = r.kind === 'daily' ? r.day.length * 7 + r.tier : r.kind === 'endless' ? r.round + r.runSeed : r.tier + 31
  const f = generateWithFallback(() => ({ heights: [3, 3, 4], min: 0, max: 1 }), seed >>> 0)
  const l = toLevel(f, r.kind === 'endless' ? `Oändlig räd · runda ${r.round}` : 'Räden', 'Ön blev en enkel ö den här gången.')
  emergencies.add(l)
  return l
}

/** The level a request asks for (run in the worker, or here as a fallback). */
export function makeLevel(r: LevelRequest): Level {
  if (r.kind === 'daily') return dailyLevel(r.day, r.tier)
  if (r.kind === 'endless') return endlessLevel(r.round, r.tier, r.runSeed)
  if (r.kind === 'weekly') return weeklyLevel(r.week, r.step, r.tier)
  return eventLevel(r.event, r.year, r.index, r.tier)
}

/** Generate a level for Dagens räd, the endless raid, the weekly challenge or an event. */
export function requestLevel(r: LevelRequest): Promise<Level> {
  const w = getWorker()
  if (!w) {
    // No worker support: generate here (it may stall the page for a moment).
    return new Promise(resolve => setTimeout(() => resolve(makeLevel(r)), 30))
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
