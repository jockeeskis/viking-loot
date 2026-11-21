// Generates Dagens räd and endless-raid levels off the main thread, so the page never freezes.
import { dailyLevel, endlessLevel } from './modes'
import type { LevelRequest, LevelReply } from './levelGen'

self.onmessage = (e: MessageEvent<LevelRequest & { id: number }>) => {
  const r = e.data
  let reply: LevelReply
  try {
    const level = r.kind === 'daily' ? dailyLevel(r.day, r.tier) : endlessLevel(r.round, r.tier, r.runSeed)
    reply = { id: r.id, level }
  } catch (err) {
    reply = { id: r.id, error: String(err) }
  }
  ;(self as unknown as Worker).postMessage(reply)
}
