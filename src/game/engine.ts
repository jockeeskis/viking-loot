// Viking Loot – pure rules engine. No Phaser, no DOM.
//
// Mutation model: every exported function treats its input as immutable and
// returns a new GameState. The renderer only *reads* state and the `events`
// describing the last move, so animations can never change the logical outcome.
//
// 0.3 additions (all optional in level data, so 0.2 levels behave exactly as before):
// - houses: loot with `hits: 2`; every hit costs one carry slot, the item is taken on the last hit
// - stones: `stone: true`, no colour; crumble on their own as soon as ANY item in `clearedBy` is taken
// - jarl: a viking that carries 3; wild: a viking whose colour is set by the first item it takes
// - hidden loot: colour not shown until the item becomes available (presentation only)

export type LootColor = 'red' | 'blue' | 'yellow'
export type ItemKind = 'loot' | 'stone'
export type VikingKind = 'normal' | 'jarl' | 'wild'

export type LootItem = {
  id: string
  kind: ItemKind
  color: LootColor | null // null only for stones
  blockedBy: string[]
  clearedBy: string[] // stones only: crumbles when any of these is collected
  hitsLeft: number // 1 for ordinary loot, 2 for an unopened house
  hidden: boolean // colour not yet revealed to the player
  collected: boolean // for stones: crumbled
}

export type Viking = {
  id: string
  kind: VikingKind
  color: LootColor | null // null only for a wild viking that has not taken anything yet
  capacity: number
  collectedCount: number
}

export type GameStatus = 'playing' | 'won' | 'lost'
export type LossReason = 'slots-full' | 'stuck'

export type GameEvent =
  | { type: 'dispatch'; vikingId: string }
  | { type: 'color'; vikingId: string; color: LootColor } // a wild viking picked its colour
  | { type: 'hit'; vikingId: string; lootId: string; fromWaiting: boolean } // a non-final hit on a house
  | { type: 'collect'; vikingId: string; lootId: string; fromWaiting: boolean }
  | { type: 'crumble'; lootId: string } // a stone disappeared
  | { type: 'reveal'; lootId: string } // a hidden item became available and shows its colour
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
  waits: number // how many times a viking had to take a seat (used for stars)
  events: GameEvent[] // what happened during the most recent move
}

export const SELECTABLE = 3
/** Slots on the longship. Filling the last one loses, so at most WAITING_SLOTS - 1 can wait safely. */
export const WAITING_SLOTS = 3
export const CAPACITY = 2
export const JARL_CAPACITY = 3

export type LevelLoot = {
  id: string
  color?: LootColor // required for loot, omitted for stones
  blockedBy?: string[]
  hits?: number
  stone?: boolean
  clearedBy?: string[]
  hidden?: boolean
}
export type QueueEntry = LootColor | { kind: 'jarl'; color: LootColor } | { kind: 'wild' }

export function makeViking(entry: QueueEntry, index: number): Viking {
  const id = `v${index + 1}`
  if (typeof entry === 'string') return { id, kind: 'normal', color: entry, capacity: CAPACITY, collectedCount: 0 }
  if (entry.kind === 'jarl') return { id, kind: 'jarl', color: entry.color, capacity: JARL_CAPACITY, collectedCount: 0 }
  return { id, kind: 'wild', color: null, capacity: CAPACITY, collectedCount: 0 }
}

export function createGame(loot: LevelLoot[], queue: QueueEntry[]): GameState {
  const items: LootItem[] = loot.map(l => ({
    id: l.id,
    kind: l.stone ? 'stone' : 'loot',
    color: l.stone ? null : l.color ?? null,
    blockedBy: [...(l.blockedBy ?? [])],
    clearedBy: [...(l.clearedBy ?? [])],
    hitsLeft: l.stone ? 1 : Math.max(1, l.hits ?? 1),
    hidden: !!l.hidden,
    collected: false,
  }))
  let state: GameState = {
    loot: items,
    queue: queue.map(makeViking),
    waiting: [],
    status: 'playing',
    lossReason: null,
    moves: 0,
    waits: 0,
    events: [],
  }
  // Anything reachable from the start is visible from the start.
  const start = state
  state = { ...state, loot: state.loot.map(l => (l.hidden && isAvailable(start, l) ? { ...l, hidden: false } : l)) }
  return { ...state, status: evaluateGameStatus(state) }
}

export function isAvailable(state: GameState, item: LootItem): boolean {
  if (item.collected) return false
  return item.blockedBy.every(id => state.loot.find(l => l.id === id)?.collected ?? true)
}

/** Loot (not stones) that a viking could take right now. */
export function getAvailableLoot(state: GameState): LootItem[] {
  return state.loot.filter(l => l.kind === 'loot' && isAvailable(state, l))
}

export function getSelectableVikings(state: GameState): Viking[] {
  return state.status === 'playing' ? state.queue.slice(0, SELECTABLE) : []
}

const canTake = (v: Viking, l: LootItem) => v.color === null || l.color === v.color
const isFull = (v: Viking) => v.collectedCount >= v.capacity

/** After an item is taken: crumble the stones it clears, then reveal newly reachable hidden items. */
function settleBoard(state: GameState, takenId: string, events: GameEvent[]): GameState {
  let s = state
  for (const st of s.loot) {
    if (st.kind === 'stone' && !st.collected && st.clearedBy.includes(takenId)) {
      s = { ...s, loot: s.loot.map(l => (l.id === st.id ? { ...l, collected: true } : l)) }
      events.push({ type: 'crumble', lootId: st.id })
    }
  }
  for (const l of s.loot) {
    if (l.hidden && isAvailable(s, l)) {
      s = { ...s, loot: s.loot.map(x => (x.id === l.id ? { ...x, hidden: false } : x)) }
      events.push({ type: 'reveal', lootId: l.id })
    }
  }
  return s
}

/**
 * Let one viking take hits until it is full or nothing it may take is available.
 * Items are chosen one hit at a time in level order (front of the level list first),
 * re-checking availability after each, so a viking can empty a whole pile of its colour.
 */
function collectInto(state: GameState, viking: Viking, fromWaiting: boolean, events: GameEvent[]): { state: GameState; viking: Viking } {
  let s = state
  let v = viking
  while (!isFull(v)) {
    const item = s.loot.find(l => l.kind === 'loot' && isAvailable(s, l) && canTake(v, l))
    if (!item) break
    if (v.color === null) {
      v = { ...v, color: item.color }
      events.push({ type: 'color', vikingId: v.id, color: item.color! })
    }
    v = { ...v, collectedCount: v.collectedCount + 1 }
    const hitsLeft = item.hitsLeft - 1
    if (hitsLeft > 0) {
      s = { ...s, loot: s.loot.map(l => (l.id === item.id ? { ...l, hitsLeft } : l)) }
      events.push({ type: 'hit', vikingId: v.id, lootId: item.id, fromWaiting })
    } else {
      s = { ...s, loot: s.loot.map(l => (l.id === item.id ? { ...l, hitsLeft: 0, collected: true } : l)) }
      events.push({ type: 'collect', vikingId: v.id, lootId: item.id, fromWaiting })
      s = settleBoard(s, item.id, events)
    }
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
      if (isFull(r.viking)) events.push({ type: 'return', vikingId: w.id, fromWaiting: true })
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

  if (isFull(first.viking)) {
    events.push({ type: 'return', vikingId, fromWaiting: false })
    s = resolveWaiting(s, events)
  } else {
    // 2. Existing waiters get their chance first (the board just changed) …
    s = resolveWaiting(s, events)
    // 3. … then the newcomer tries again, in case they unlocked something for it.
    const again = collectInto(s, first.viking, false, events)
    s = again.state
    if (isFull(again.viking)) {
      events.push({ type: 'return', vikingId, fromWaiting: false })
      s = resolveWaiting(s, events)
    } else {
      // Take a seat. Taking a seat changes nothing on the board, so no further resolution is needed.
      events.push({ type: 'wait', vikingId, slot: s.waiting.length })
      s = { ...s, waiting: [...s.waiting, again.viking], waits: s.waits + 1 }
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

/** Stones never need to be cleared: the raid is won when all real loot is taken. */
function isWon(state: GameState) {
  return state.loot.every(l => l.kind === 'stone' || l.collected)
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
  const available = getAvailableLoot(state)
  const waiterCanMove = state.waiting.some(w => available.some(l => canTake(w, l)))
  return waiterCanMove ? 'playing' : 'lost'
}

/** Throws if a level references unknown ids, contains a blocking cycle or a malformed item. */
export function validateLevelGraph(loot: LevelLoot[]): void {
  const ids = new Set(loot.map(l => l.id))
  if (ids.size !== loot.length) throw new Error('Duplicate loot id')
  const byId = new Map(loot.map(l => [l.id, l]))
  for (const l of loot) {
    for (const b of l.blockedBy ?? []) if (!ids.has(b)) throw new Error(`${l.id} blocked by unknown ${b}`)
    if (l.stone) {
      if (!l.clearedBy?.length) throw new Error(`Stone ${l.id} needs clearedBy`)
      for (const c of l.clearedBy) {
        if (!ids.has(c)) throw new Error(`${l.id} cleared by unknown ${c}`)
        if (byId.get(c)!.stone) throw new Error(`Stone ${l.id} cannot be cleared by another stone`)
      }
    } else {
      if (!l.color) throw new Error(`${l.id} needs a colour`)
      if (l.clearedBy?.length) throw new Error(`Only stones use clearedBy (${l.id})`)
    }
  }
  const state = new Map<string, 'visiting' | 'done'>()
  const visit = (id: string) => {
    if (state.get(id) === 'done') return
    if (state.get(id) === 'visiting') throw new Error(`Blocking cycle through ${id}`)
    state.set(id, 'visiting')
    for (const b of byId.get(id)!.blockedBy ?? []) visit(b)
    state.set(id, 'done')
  }
  loot.forEach(l => visit(l.id))
  // A stone needs at least one clearer that is not stuck behind the stone itself.
  const behind = (id: string, target: string): boolean =>
    (byId.get(id)!.blockedBy ?? []).some(b => b === target || behind(b, target))
  for (const st of loot.filter(l => l.stone)) {
    if (st.clearedBy!.every(c => behind(c, st.id))) throw new Error(`Stone ${st.id} blocks every item that clears it`)
  }
}
