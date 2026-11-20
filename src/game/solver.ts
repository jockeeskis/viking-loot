// Exhaustive search over all legal choices for small levels.
import { getSelectableVikings, selectViking, type GameState } from './engine.ts'

export type SolveReport = {
  winnable: boolean
  winPath: string[] | null // viking ids in pick order
  lossPath: string[] | null
  winningLines: number // distinct full pick sequences ending in a win
  losingLines: number
}

function key(s: GameState): string {
  const loot = s.loot.map(l => (l.collected ? '1' : '0')).join('')
  const queue = s.queue.map(v => v.id).join(',')
  const waiting = s.waiting.map(v => `${v.id}:${v.collectedCount}`).join(',')
  return `${loot}|${queue}|${waiting}`
}

export function solve(start: GameState): SolveReport {
  type Node = { win: string[] | null; loss: string[] | null; wins: number; losses: number }
  const memo = new Map<string, Node>()
  const go = (s: GameState): Node => {
    if (s.status === 'won') return { win: [], loss: null, wins: 1, losses: 0 }
    if (s.status === 'lost') return { win: null, loss: [], wins: 0, losses: 1 }
    const k = key(s)
    const cached = memo.get(k)
    if (cached) return cached
    let win: string[] | null = null, loss: string[] | null = null, wins = 0, losses = 0
    for (const v of getSelectableVikings(s)) {
      const r = go(selectViking(s, v.id))
      if (!win && r.win) win = [v.id, ...r.win]
      if (!loss && r.loss) loss = [v.id, ...r.loss]
      wins += r.wins
      losses += r.losses
    }
    const result = { win, loss, wins, losses }
    memo.set(k, result)
    return result
  }
  const r = go(start)
  return { winnable: !!r.win, winPath: r.win, lossPath: r.loss, winningLines: r.wins, losingLines: r.losses }
}
