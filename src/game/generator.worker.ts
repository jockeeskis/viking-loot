// Generates Dagens räd, endless, weekly and event levels off the main thread, so the page never freezes.
import { makeLevel, type LevelRequest, type LevelReply } from './levelGen'

self.onmessage = (e: MessageEvent<LevelRequest & { id: number }>) => {
  const r = e.data
  let reply: LevelReply
  try {
    const level = makeLevel(r)
    reply = { id: r.id, level }
  } catch (err) {
    reply = { id: r.id, error: String(err) }
  }
  ;(self as unknown as Worker).postMessage(reply)
}
