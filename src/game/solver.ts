// Exhaustive search over all legal choices for small levels.
import { getSelectableVikings, selectViking, type GameState } from './engine.ts'

export type SolveReport = {
  winnable: boolean
  winPath: string[] | null // viking ids in pick order
  lossPath: string[] | null
  winningLines: number // distinct full pick sequences ending in a win
  losingLines: number
  /** Fewest times a viking has to take a seat on any winning line (the 3-star target). */
  minWaits: number | null
}

type Node = { win: string[] | null; loss: string[] | null; wins: number; losses: number; minWaits: number }

function key(s: GameState): string {
  const loot = s.loot.map(l => (l.collected ? '-' : l.hitsLeft)).join('')
  const queue = s.queue.map(v => v.id).join(',')
  // Ice and the raven need no entry of their own: they follow from how many vikings have been sent
  // (the queue and the opened cages tell). The order of a tide pile depends on when items were taken
  // relative to the tide, so it is part of the key.
  const waiting = s.waiting.map(v => `${v.id}:${v.color ?? '?'}:${v.collectedCount}:${v.ship}`).join(',')
  const tides = s.tides.length ? `|${s.tides.map(p => p.join('.')).join('/')}` : ''
  return `${loot}|${queue}|${waiting}${tides}`
}

function searcher() {
  const memo = new Map<string, Node>()
  const go = (s: GameState): Node => {
    if (s.status === 'won') return { win: [], loss: null, wins: 1, losses: 0, minWaits: 0 }
    if (s.status === 'lost') return { win: null, loss: [], wins: 0, losses: 1, minWaits: Infinity }
    const k = key(s)
    const cached = memo.get(k)
    if (cached) return cached
    let win: string[] | null = null, loss: string[] | null = null, wins = 0, losses = 0, minWaits = Infinity
    for (const v of getSelectableVikings(s)) {
      const next = selectViking(s, v.id)
      const r = go(next)
      if (!win && r.win) win = [v.id, ...r.win]
      if (!loss && r.loss) loss = [v.id, ...r.loss]
      wins += r.wins
      losses += r.losses
      minWaits = Math.min(minWaits, r.minWaits + (next.waits - s.waits))
    }
    const result = { win, loss, wins, losses, minWaits }
    memo.set(k, result)
    return result
  }
  return go
}

export function solve(start: GameState): SolveReport {
  const r = searcher()(start)
  return {
    winnable: !!r.win, winPath: r.win, lossPath: r.loss, winningLines: r.wins, losingLines: r.losses,
    minWaits: Number.isFinite(r.minWaits) ? r.minWaits : null,
  }
}

/** Whether the raid can still be won from here. Stops at the first win, so it is much cheaper than solve(). */
export function winnable(start: GameState): boolean {
  const memo = new Map<string, boolean>()
  const go = (s: GameState): boolean => {
    if (s.status !== 'playing') return s.status === 'won'
    const k = key(s)
    const cached = memo.get(k)
    if (cached !== undefined) return cached
    const r = getSelectableVikings(s).some(v => go(selectViking(s, v.id)))
    memo.set(k, r)
    return r
  }
  return go(start)
}

/**
 * A move that still leads to a win, preferring the one with the fewest waits from here.
 * Returns null when the raid can no longer be won.
 */
export function hint(state: GameState): string | null {
  const go = searcher()
  let best: { id: string; waits: number } | null = null
  for (const v of getSelectableVikings(state)) {
    const next = selectViking(state, v.id)
    const r = go(next)
    if (!r.win) continue
    const waits = r.minWaits + (next.waits - state.waits)
    if (!best || waits < best.waits) best = { id: v.id, waits }
  }
  return best?.id ?? null
}
