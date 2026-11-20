// Viking Loot 0.2 – pure rules engine. No Phaser, no DOM.
//
// Mutation model: every exported function treats its input as immutable and
// returns a new GameState. The renderer only *reads* state and the `events`
// describing the last move, so animations can never change the logical outcome.

export type LootColor = 'red' | 'blue' | 'yellow'

export type LootItem = {
  id: string
  color: LootColor
  blockedBy: string[]
  collected: boolean
}

export type Viking = {
  id: string
  color: LootColor
  collectedCount: number // 0–2
}

export type GameStatus = 'playing' | 'won' | 'lost'
export type LossReason = 'slots-full' | 'stuck'

export type GameEvent =
  | { type: 'dispatch'; vikingId: string }
  | { type: 'collect'; vikingId: string; lootId: string; fromWaiting: boolean }
  | { type: 'return'; vikingId: string; fromWaiting: boolean }
  | { type: 'wait'; vikingId: string; slot: number }
  | { type: 'overflow'; vikingId: string }

export type GameState = {
  loot: LootItem[]
  queue: Viking[]
  waiting: Viking[] // max WAITING_SLOTS, in arrival order
  status: GameStatus
  lossReason: LossReason | null
  moves: number
  events: GameEvent[] // what happened during the most recent move
}

export const SELECTABLE = 3
/** Slots on the longship. Filling the last one loses, so at most WAITING_SLOTS - 1 can wait safely. */
export const WAITING_SLOTS = 3
export const CAPACITY = 2

export type LevelLoot = { id: string; color: LootColor; blockedBy?: string[] }

export function createGame(loot: LevelLoot[], queue: LootColor[]): GameState {
  const state: GameState = {
    loot: loot.map(l => ({ id: l.id, color: l.color, blockedBy: [...(l.blockedBy ?? [])], collected: false })),
    queue: queue.map((color, i) => ({ id: `v${i + 1}`, color, collectedCount: 0 })),
    waiting: [],
    status: 'playing',
    lossReason: null,
    moves: 0,
    events: [],
  }
  return { ...state, status: evaluateGameStatus(state) }
}

export function isAvailable(state: GameState, item: LootItem): boolean {
  if (item.collected) return false
  return item.blockedBy.every(id => state.loot.find(l => l.id === id)?.collected ?? true)
}

export function getAvailableLoot(state: GameState): LootItem[] {
  return state.loot.filter(l => isAvailable(state, l))
}

export function getSelectableVikings(state: GameState): Viking[] {
  return state.status === 'playing' ? state.queue.slice(0, SELECTABLE) : []
}

/**
 * Let one viking collect until it is full or nothing of its colour is available.
 * Items are taken one at a time in level order, re-checking availability after each,
 * so a red barrel hiding another red barrel can be emptied in one trip.
 */
function collectInto(state: GameState, viking: Viking, fromWaiting: boolean, events: GameEvent[]): { state: GameState; viking: Viking } {
  let s = state
  let v = viking
  while (v.collectedCount < CAPACITY) {
    const item = s.loot.find(l => l.color === v.color && isAvailable(s, l))
    if (!item) break
    s = { ...s, loot: s.loot.map(l => (l.id === item.id ? { ...l, collected: true } : l)) }
    v = { ...v, collectedCount: v.collectedCount + 1 }
    events.push({ type: 'collect', vikingId: v.id, lootId: item.id, fromWaiting })
  }
  return { state: s, viking: v }
}

/** Waiting vikings, in arrival order, retry until nobody makes progress. Finished vikings leave. */
function resolveWaiting(state: GameState, events: GameEvent[]): GameState {
  let s = state
  let progress = true
  while (progress) {
    progress = false
    const stillWaiting: Viking[] = []
    for (const w of s.waiting) {
      const r = collectInto(s, w, true, events)
      if (r.viking.collectedCount !== w.collectedCount) progress = true
      s = r.state
      if (r.viking.collectedCount >= CAPACITY) events.push({ type: 'return', vikingId: w.id, fromWaiting: true })
      else stillWaiting.push(r.viking)
    }
    s = { ...s, waiting: stillWaiting }
  }
  return s
}

export function resolveWaitingVikings(state: GameState): GameState {
  const events: GameEvent[] = []
  const s = resolveWaiting(state, events)
  const next = { ...s, events: [...state.events, ...events] }
  return { ...next, ...statusFields(next) }
}

export function selectViking(state: GameState, vikingId: string): GameState {
  if (state.status !== 'playing') return state
  const index = state.queue.findIndex(v => v.id === vikingId)
  if (index < 0 || index >= SELECTABLE) return state

  const events: GameEvent[] = [{ type: 'dispatch', vikingId }]
  const viking = state.queue[index]
  let s: GameState = { ...state, queue: state.queue.filter((_, i) => i !== index), moves: state.moves + 1, events }

  // 1. The new viking raids immediately.
  const first = collectInto(s, viking, false, events)
  s = first.state

  if (first.viking.collectedCount >= CAPACITY) {
    events.push({ type: 'return', vikingId, fromWaiting: false })
    s = resolveWaiting(s, events)
  } else {
    // 2. Existing waiters get their chance first (the board just changed) …
    s = resolveWaiting(s, events)
    // 3. … then the newcomer tries again, in case they unlocked something for it.
    const again = collectInto(s, first.viking, false, events)
    s = again.state
    if (again.viking.collectedCount >= CAPACITY) {
      events.push({ type: 'return', vikingId, fromWaiting: false })
      s = resolveWaiting(s, events)
    } else {
      // Take a seat. Taking a seat changes nothing on the board, so no further resolution is needed.
      events.push({ type: 'wait', vikingId, slot: s.waiting.length })
      s = { ...s, waiting: [...s.waiting, again.viking] }
      if (s.waiting.length >= WAITING_SLOTS && !isWon(s)) {
        // Filling the last slot sinks the raid (ui-settings.md §4). Win still beats loss.
        events.push({ type: 'overflow', vikingId })
        return { ...s, events, status: 'lost', lossReason: 'slots-full' }
      }
    }
  }

  s = { ...s, events }
  return { ...s, ...statusFields(s) }
}

function isWon(state: GameState) {
  return state.loot.every(l => l.collected)
}

function statusFields(state: GameState): { status: GameStatus; lossReason: LossReason | null } {
  if (state.status === 'lost') return { status: 'lost', lossReason: state.lossReason }
  const status = evaluateGameStatus(state)
  if (status !== 'lost') return { status, lossReason: null }
  return { status, lossReason: state.waiting.length >= WAITING_SLOTS ? 'slots-full' : 'stuck' }
}

/**
 * Win has priority. A playing game is stuck when no viking can be chosen and
 * no waiting viking can take anything (waiters are always resolved to a fixed
 * point after each move, but we re-check here so the function stands alone).
 */
export function evaluateGameStatus(state: GameState): GameStatus {
  if (isWon(state)) return 'won'
  if (state.status === 'lost') return 'lost'
  if (state.waiting.length >= WAITING_SLOTS) return 'lost'
  if (state.queue.length > 0) return 'playing'
  const waiterCanMove = state.waiting.some(w => getAvailableLoot(state).some(l => l.color === w.color))
  return waiterCanMove ? 'playing' : 'lost'
}

/** Throws if a level references unknown ids or contains a blocking cycle. */
export function validateLevelGraph(loot: LevelLoot[]): void {
  const ids = new Set(loot.map(l => l.id))
  if (ids.size !== loot.length) throw new Error('Duplicate loot id')
  for (const l of loot) for (const b of l.blockedBy ?? []) if (!ids.has(b)) throw new Error(`${l.id} blocked by unknown ${b}`)
  const byId = new Map(loot.map(l => [l.id, l]))
  const state = new Map<string, 'visiting' | 'done'>()
  const visit = (id: string) => {
    if (state.get(id) === 'done') return
    if (state.get(id) === 'visiting') throw new Error(`Blocking cycle through ${id}`)
    state.set(id, 'visiting')
    for (const b of byId.get(id)!.blockedBy ?? []) visit(b)
    state.set(id, 'done')
  }
  loot.forEach(l => visit(l.id))
}
