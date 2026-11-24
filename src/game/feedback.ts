// Explanations for the player (0.6): why a raid was lost, where it went wrong, why an item
// cannot be taken and which vikings would find nothing. Pure functions that return text keys
// and parameters, so they can be tested without Phaser or a language.
import { selectViking, isAvailable, gateLeft, carriesNothing, type GameState, type LootColor, type Viking } from './engine.ts'
import { winnable } from './solver.ts'

export type Text = { key: string; params?: Record<string, string | number>; colors?: LootColor[]; who?: Who }
/** A viking described for a sentence: its kind and colour (null for Ylva without a colour, Sigrid and the valkyrie). */
export type Who = { kind: Viking['kind']; color: LootColor | null }

const COLOR_ORDER: LootColor[] = ['red', 'blue', 'yellow']

/** Why the raid is lost: which colours the seated vikings wanted, or how much loot was left. */
export function lossExplanation(s: GameState): Text | null {
  if (s.status !== 'lost') return null
  if (s.lossReason === 'slots-full') {
    const wanted = new Set(s.waiting.filter(v => v.ship === 0 && v.color).map(v => v.color!))
    return { key: 'loss.fullWant', colors: COLOR_ORDER.filter(c => wanted.has(c)) }
  }
  return { key: 'loss.stuckLeft', params: { n: s.loot.filter(l => l.kind === 'loot' && !l.collected).length } }
}

export const whoOf = (v: Viking): Who => ({ kind: v.kind, color: v.color })

/**
 * The move that made the raid impossible to win. `states` holds the state before every move and,
 * last, the state after the final move. Returns the index of that move, or null when the raid could
 * not be won even before the first move. Once a state cannot be won, nothing after it can, so the
 * search walks backwards and stops at the first state that can still be won (small trees first).
 */
export function fatalMove(states: GameState[]): number | null {
  for (let i = states.length - 2; i >= 0; i--) if (winnable(states[i])) return i
  return null
}

/** Why an item cannot be taken right now (or which viking can take it). */
export function blockReason(s: GameState, id: string): Text | null {
  const item = s.loot.find(l => l.id === id)
  if (!item || item.collected) return null
  if (item.kind === 'stone') return { key: 'block.stone' }
  if (item.frozenLeft > 0) return { key: 'block.ice', params: { n: item.frozenLeft } }
  if (isAvailable(s, item)) {
    if (item.gold) return { key: 'block.gold' }
    return item.color ? { key: 'block.free', who: { kind: 'normal', color: item.color } } : null
  }
  if (item.tidePile >= 0) {
    const pile = s.tides[item.tidePile]
    if (pile[pile.length - 1] !== item.id) return { key: 'block.tide' }
  }
  const gone = (x: string) => s.loot.find(l => l.id === x)?.collected ?? true
  if (!item.blockedBy.every(gone)) return { key: 'block.under' }
  if (!item.lockedBy.every(gone)) return { key: 'block.lock' }
  const left = gateLeft(s, item)
  if (left > 0) return { key: 'block.gate', params: { n: left }, colors: item.color ? [item.color] : [] }
  return { key: 'block.lock' }
}

/** True when sending this viking now would not take or hit anything (it would just take a seat). */
export function findsNothing(s: GameState, id: string): boolean {
  const v = s.queue.find(x => x.id === id)
  if (!v || carriesNothing(v) || s.status !== 'playing') return false
  const after = selectViking(s, id)
  return !after.events.some(e => (e.type === 'collect' || e.type === 'hit') && e.vikingId === id)
}
