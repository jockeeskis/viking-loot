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
//
// 0.4 additions (also optional, so 0.2/0.3 levels behave exactly as before):
// - keys and locked chests: a chest with `lockedBy` is unreachable until every listed key is taken
// - ice: `frozen: N` keeps an item unreachable until move N starts (it thaws before that viking raids)
// - ships: an optional colour ship gives extra safe seats to one colour; only the main ship sinks the raid
// - scout: a queue entry that carries nothing; dispatching it reveals every hidden item
//
// 0.5 additions (also optional, so earlier levels behave exactly as before):
// - powder kegs: loot with `keg: true`; when taken, it clears the stones, ice and tarps listed in `blasts`
// - tide: items with the same `tidePile` form a pile whose front item is washed to the back every
//   TIDE_EVERY moves (at the start of the move); inside such a pile only the current front is reachable
// - cages: loot with `cage: <colour>`; taking it frees a prisoner of that colour at the front of the queue
// - the raven: with `raven: N`, at the start of every N-th move the longest-waiting viking is carried off

export type LootColor = 'red' | 'blue' | 'yellow'
export type ItemKind = 'loot' | 'stone'
export type VikingKind = 'normal' | 'jarl' | 'wild' | 'scout'

export type LootItem = {
  id: string
  kind: ItemKind
  color: LootColor | null // null only for stones
  blockedBy: string[]
  lockedBy: string[] // chests only: keys that must all be taken first (anywhere on the island)
  key: boolean // a key is ordinary loot that also unlocks chests
  frozenLeft: number // moves until the ice thaws (0 = not frozen)
  clearedBy: string[] // stones only: crumbles when any of these is collected
  hitsLeft: number // 1 for ordinary loot, 2 for an unopened house
  hidden: boolean // colour not yet revealed to the player
  collected: boolean // for stones: crumbled
  keg: boolean // a powder keg: taking it clears `blasts`
  blasts: string[] // stones, ice and tarps a keg clears
  cage: LootColor | null // a cage: taking it frees a prisoner of this colour
  tidePile: number // index in GameState.tides, -1 when not in a tide pile
}

export type Viking = {
  id: string
  kind: VikingKind
  color: LootColor | null // null for a scout and for a wild viking that has not taken anything yet
  capacity: number
  collectedCount: number
  ship: number // index in GameState.ships of the seat it took (only meaningful while waiting)
}

/** A ship with seats for waiting vikings. Ship 0 is the main ship; a colour ship only seats its colour. */
export type Ship = { slots: number; color: LootColor | null }

export type GameStatus = 'playing' | 'won' | 'lost'
export type LossReason = 'slots-full' | 'stuck'

export type GameEvent =
  | { type: 'dispatch'; vikingId: string }
  | { type: 'color'; vikingId: string; color: LootColor } // a wild viking picked its colour
  | { type: 'hit'; vikingId: string; lootId: string; fromWaiting: boolean } // a non-final hit on a house
  | { type: 'collect'; vikingId: string; lootId: string; fromWaiting: boolean }
  | { type: 'crumble'; lootId: string } // a stone disappeared
  | { type: 'reveal'; lootId: string } // a hidden item became available and shows its colour
  | { type: 'unlock'; lootId: string } // the last key of a chest was taken
  | { type: 'thaw'; lootId: string } // the ice around an item melted
  | { type: 'scout'; vikingId: string } // a scout looked over the island (reveal events follow)
  | { type: 'return'; vikingId: string; fromWaiting: boolean }
  | { type: 'wait'; vikingId: string; ship: number; slot: number }
  | { type: 'overflow'; vikingId: string }
  | { type: 'explode'; lootId: string } // a powder keg went off (crumble/thaw/reveal events follow)
  | { type: 'tide'; pile: number; lootId: string } // the tide washed the front item to the back of its pile
  | { type: 'free'; lootId: string; vikingId: string } // a prisoner left its cage and joined the front of the queue
  | { type: 'raven'; vikingId: string } // the raven carried off a waiting viking

export type GameState = {
  loot: LootItem[]
  queue: Viking[]
  waiting: Viking[] // every seated viking, in arrival order (`ship` says where it sits)
  ships: Ship[]
  status: GameStatus
  lossReason: LossReason | null
  moves: number
  waits: number // how many times a viking had to take a seat (used for stars)
  events: GameEvent[] // what happened during the most recent move
  tides: string[][] // tide piles: ids of the items still there, back→front
  raven: number // the raven comes every N-th move (0 = no raven)
}

export const SELECTABLE = 3
/** Seats on the main longship. Filling the last one loses, so at most WAITING_SLOTS - 1 can wait safely. */
export const WAITING_SLOTS = 3
export const CAPACITY = 2
export const JARL_CAPACITY = 3
/** The tide washes a tide pile's front item to the back at the start of every third move. */
export const TIDE_EVERY = 3

export type LevelLoot = {
  id: string
  color?: LootColor // required for loot, omitted for stones
  blockedBy?: string[]
  hits?: number
  stone?: boolean
  clearedBy?: string[]
  hidden?: boolean
  key?: boolean
  lockedBy?: string[]
  frozen?: number
  keg?: boolean
  blasts?: string[]
  cage?: LootColor
  tidePile?: number
}
/** Level-wide options (0.5). */
export type GameOptions = { raven?: number }
export type QueueEntry = LootColor | { kind: 'jarl'; color: LootColor } | { kind: 'wild' } | { kind: 'scout' }
export type ShipSpec = { slots: number; color?: LootColor }
/** One ship with WAITING_SLOTS seats, as in every level before 0.4. */
export const DEFAULT_SHIPS: ShipSpec[] = [{ slots: WAITING_SLOTS }]

export function makeViking(entry: QueueEntry, index: number): Viking {
  const base = { id: `v${index + 1}`, collectedCount: 0, ship: 0 }
  if (typeof entry === 'string') return { ...base, kind: 'normal', color: entry, capacity: CAPACITY }
  if (entry.kind === 'jarl') return { ...base, kind: 'jarl', color: entry.color, capacity: JARL_CAPACITY }
  if (entry.kind === 'scout') return { ...base, kind: 'scout', color: null, capacity: 0 }
  return { ...base, kind: 'wild', color: null, capacity: CAPACITY }
}

export function createGame(loot: LevelLoot[], queue: QueueEntry[], ships: ShipSpec[] = DEFAULT_SHIPS, options: GameOptions = {}): GameState {
  const items: LootItem[] = loot.map(l => ({
    id: l.id,
    kind: l.stone ? 'stone' : 'loot',
    color: l.stone ? null : l.color ?? null,
    blockedBy: [...(l.blockedBy ?? [])],
    lockedBy: [...(l.lockedBy ?? [])],
    key: !!l.key,
    frozenLeft: Math.max(0, l.frozen ?? 0),
    clearedBy: [...(l.clearedBy ?? [])],
    hitsLeft: l.stone ? 1 : Math.max(1, l.hits ?? 1),
    hidden: !!l.hidden,
    collected: false,
    keg: !!l.keg,
    blasts: [...(l.blasts ?? [])],
    cage: l.cage ?? null,
    tidePile: l.tidePile ?? -1,
  }))
  // Tide piles keep the level order of their items (back→front).
  const tides: string[][] = []
  for (const l of items) if (l.tidePile >= 0) (tides[l.tidePile] ??= []).push(l.id)
  let state: GameState = {
    loot: items,
    queue: queue.map(makeViking),
    waiting: [],
    ships: ships.map(sh => ({ slots: sh.slots, color: sh.color ?? null })),
    status: 'playing',
    lossReason: null,
    moves: 0,
    waits: 0,
    events: [],
    tides: Array.from(tides, p => p ?? []),
    raven: options.raven ?? 0,
  }
  // Anything reachable from the start is visible from the start.
  const start = state
  state = { ...state, loot: state.loot.map(l => (l.hidden && isAvailable(start, l) ? { ...l, hidden: false } : l)) }
  return { ...state, status: evaluateGameStatus(state) }
}

export function isAvailable(state: GameState, item: LootItem): boolean {
  if (item.collected || item.frozenLeft > 0) return false
  // In a tide pile only the current front item can be reached.
  if (item.tidePile >= 0) {
    const pile = state.tides[item.tidePile]
    if (pile[pile.length - 1] !== item.id) return false
  }
  const gone = (id: string) => state.loot.find(l => l.id === id)?.collected ?? true
  return item.blockedBy.every(gone) && item.lockedBy.every(gone)
}

/** Loot (not stones) that a viking could take right now. */
export function getAvailableLoot(state: GameState): LootItem[] {
  return state.loot.filter(l => l.kind === 'loot' && isAvailable(state, l))
}

export function getSelectableVikings(state: GameState): Viking[] {
  return state.status === 'playing' ? state.queue.slice(0, SELECTABLE) : []
}

const canTake = (v: Viking, l: LootItem) => v.kind !== 'scout' && (v.color === null || l.color === v.color)
const isFull = (v: Viking) => v.collectedCount >= v.capacity

/** Reveal hidden items that just became reachable. */
function revealReachable(state: GameState, events: GameEvent[]): GameState {
  let s = state
  for (const l of s.loot) {
    if (l.hidden && isAvailable(s, l)) {
      s = { ...s, loot: s.loot.map(x => (x.id === l.id ? { ...x, hidden: false } : x)) }
      events.push({ type: 'reveal', lootId: l.id })
    }
  }
  return s
}

/** After an item is taken: open chests whose last key it was, crumble the stones it clears, then reveal. */
function settleBoard(state: GameState, takenId: string, events: GameEvent[]): GameState {
  let s = state
  const taken = s.loot.find(l => l.id === takenId)!
  if (taken.tidePile >= 0) s = { ...s, tides: s.tides.map((p, i) => (i === taken.tidePile ? p.filter(id => id !== takenId) : p)) }
  if (taken.keg) s = explode(s, taken, events)
  if (taken.cage) {
    // The prisoner joins the front of the queue, so it can be chosen at once.
    const prisoner: Viking = { id: `p-${taken.id}`, kind: 'normal', color: taken.cage, capacity: CAPACITY, collectedCount: 0, ship: 0 }
    s = { ...s, queue: [prisoner, ...s.queue] }
    events.push({ type: 'free', lootId: taken.id, vikingId: prisoner.id })
  }
  const gone = (id: string) => s.loot.find(l => l.id === id)?.collected ?? true
  for (const ch of s.loot) {
    if (!ch.collected && ch.lockedBy.includes(takenId) && ch.lockedBy.every(gone)) events.push({ type: 'unlock', lootId: ch.id })
  }
  for (const st of s.loot) {
    if (st.kind === 'stone' && !st.collected && st.clearedBy.includes(takenId)) {
      s = { ...s, loot: s.loot.map(l => (l.id === st.id ? { ...l, collected: true } : l)) }
      events.push({ type: 'crumble', lootId: st.id })
    }
  }
  return revealReachable(s, events)
}

/** A powder keg goes off: stones in reach crumble, ice melts and tarps blow away. Loot is never destroyed. */
function explode(state: GameState, keg: LootItem, events: GameEvent[]): GameState {
  events.push({ type: 'explode', lootId: keg.id })
  const loot = state.loot.map(l => {
    if (!keg.blasts.includes(l.id) || l.collected) return l
    if (l.kind === 'stone') { events.push({ type: 'crumble', lootId: l.id }); return { ...l, collected: true } }
    let n = l
    if (n.frozenLeft > 0) { events.push({ type: 'thaw', lootId: n.id }); n = { ...n, frozenLeft: 0 } }
    if (n.hidden) { events.push({ type: 'reveal', lootId: n.id }); n = { ...n, hidden: false } }
    return n
  })
  return { ...state, loot }
}

/** Every TIDE_EVERY moves the front item of each tide pile is washed to the back. */
function turnTide(state: GameState, events: GameEvent[]): GameState {
  if (!state.tides.length || state.moves % TIDE_EVERY !== 0) return state
  const tides = state.tides.map((p, i) => {
    if (p.length < 2) return p
    events.push({ type: 'tide', pile: i, lootId: p[p.length - 1] })
    return [p[p.length - 1], ...p.slice(0, -1)]
  })
  return revealReachable({ ...state, tides }, events)
}

/** Every `raven` moves the raven carries off the viking that has waited longest (main ship first). */
function ravenVisit(state: GameState, events: GameEvent[]): GameState {
  if (!state.raven || state.moves % state.raven !== 0 || !state.waiting.length) return state
  const victim = state.waiting.find(w => w.ship === 0) ?? state.waiting[0]
  events.push({ type: 'raven', vikingId: victim.id })
  return { ...state, waiting: state.waiting.filter(w => w !== victim) }
}

/** At the start of every move the ice melts a little; items whose ice is gone thaw. */
function meltIce(state: GameState, events: GameEvent[]): GameState {
  if (!state.loot.some(l => l.frozenLeft > 0)) return state
  const loot = state.loot.map(l => {
    if (l.frozenLeft <= 0) return l
    if (l.frozenLeft === 1) events.push({ type: 'thaw', lootId: l.id })
    return { ...l, frozenLeft: l.frozenLeft - 1 }
  })
  return revealReachable({ ...state, loot }, events)
}

/** Seat a viking: its colour ship first (if it has room), otherwise the main ship. */
function seatFor(state: GameState, v: Viking): { ship: number; slot: number } {
  const used = (i: number) => state.waiting.filter(w => w.ship === i).length
  const own = state.ships.findIndex((sh, i) => i > 0 && sh.color !== null && sh.color === v.color && used(i) < sh.slots)
  const ship = own >= 0 ? own : 0
  return { ship, slot: used(ship) }
}

/** Seats taken on the main ship – the only ship whose last seat sinks the raid. */
export const mainSeats = (state: GameState) => state.waiting.filter(w => w.ship === 0).length
const mainFull = (state: GameState) => mainSeats(state) >= state.ships[0].slots

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
  // 0. A new move begins: the ice melts, the tide turns and the raven visits before anyone raids.
  s = meltIce(s, events)
  s = turnTide(s, events)
  s = ravenVisit(s, events)

  if (viking.kind === 'scout') {
    // The scout looks over the island and sails home; she carries nothing and never takes a seat.
    events.push({ type: 'scout', vikingId })
    for (const l of s.loot) if (l.hidden) events.push({ type: 'reveal', lootId: l.id })
    s = { ...s, loot: s.loot.map(l => (l.hidden ? { ...l, hidden: false } : l)) }
    events.push({ type: 'return', vikingId, fromWaiting: false })
    s = { ...resolveWaiting(s, events), events } // thawed items may be waiting for a seated viking
    return { ...s, ...statusFields(s) }
  }

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
      const seat = seatFor(s, again.viking)
      events.push({ type: 'wait', vikingId, ship: seat.ship, slot: seat.slot })
      s = { ...s, waiting: [...s.waiting, { ...again.viking, ship: seat.ship }], waits: s.waits + 1 }
      if (seat.ship === 0 && mainFull(s) && !isWon(s)) {
        // Filling the last seat of the main ship sinks the raid (ui-settings.md §4). Win still beats loss.
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
  return { status, lossReason: mainFull(state) ? 'slots-full' : 'stuck' }
}

/**
 * Win has priority. A playing game is stuck when no viking can be chosen and
 * no waiting viking can take anything (waiters are always resolved to a fixed
 * point after each move, but we re-check here so the function stands alone).
 * Ice only melts when a viking is dispatched, so with an empty queue it stays frozen.
 */
export function evaluateGameStatus(state: GameState): GameStatus {
  if (isWon(state)) return 'won'
  if (state.status === 'lost') return 'lost'
  if (mainFull(state)) return 'lost'
  if (state.queue.length > 0) return 'playing'
  const available = getAvailableLoot(state)
  const waiterCanMove = state.waiting.some(w => available.some(l => canTake(w, l)))
  return waiterCanMove ? 'playing' : 'lost'
}

/** Throws if a level references unknown ids, contains a blocking cycle or a malformed item or ship. */
export function validateLevelGraph(loot: LevelLoot[], ships: ShipSpec[] = DEFAULT_SHIPS, queue?: QueueEntry[], options: GameOptions = {}): void {
  const ids = new Set(loot.map(l => l.id))
  if (ids.size !== loot.length) throw new Error('Duplicate loot id')
  const byId = new Map(loot.map(l => [l.id, l]))
  for (const l of loot) {
    for (const b of l.blockedBy ?? []) if (!ids.has(b)) throw new Error(`${l.id} blocked by unknown ${b}`)
    for (const k of l.lockedBy ?? []) {
      if (!ids.has(k)) throw new Error(`${l.id} locked by unknown ${k}`)
      if (!byId.get(k)!.key) throw new Error(`${l.id} is locked by ${k}, which is not a key`)
    }
    if (l.frozen !== undefined && !(Number.isInteger(l.frozen) && l.frozen > 0)) throw new Error(`${l.id} needs a whole number of frozen moves > 0`)
    if (l.key && (l.stone || l.lockedBy?.length)) throw new Error(`Key ${l.id} cannot be a stone or locked itself`)
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
    // 0.5: kegs, cages and tide piles.
    if (l.blasts?.length && !l.keg) throw new Error(`Only powder kegs use blasts (${l.id})`)
    for (const b of l.blasts ?? []) if (!ids.has(b)) throw new Error(`${l.id} blasts unknown ${b}`)
    if (l.keg && (l.stone || l.key || l.cage || l.lockedBy?.length)) throw new Error(`Powder keg ${l.id} must be plain loot`)
    if (l.cage !== undefined) {
      if (!['red', 'blue', 'yellow'].includes(l.cage)) throw new Error(`Cage ${l.id} needs a prisoner colour`)
      if (l.stone || l.key || l.lockedBy?.length || (l.hits ?? 1) > 1) throw new Error(`Cage ${l.id} must be plain loot`)
    }
    if (l.tidePile !== undefined) {
      if (!(Number.isInteger(l.tidePile) && l.tidePile >= 0)) throw new Error(`${l.id} has a bad tide pile`)
      if (l.stone || l.lockedBy?.length) throw new Error(`No stones or locked chests in a tide pile (${l.id})`)
      if (l.blockedBy?.length) throw new Error(`Items in a tide pile are ordered by the tide, not blockedBy (${l.id})`)
    }
  }
  if (options.raven !== undefined && options.raven !== 0 && !(Number.isInteger(options.raven) && options.raven >= 2)) {
    throw new Error('The raven needs a whole number of moves ≥ 2')
  }
  // Blocking and locking together must not form a cycle (a key behind its own chest, …).
  const state = new Map<string, 'visiting' | 'done'>()
  const visit = (id: string) => {
    if (state.get(id) === 'done') return
    if (state.get(id) === 'visiting') throw new Error(`Blocking cycle through ${id}`)
    state.set(id, 'visiting')
    const l = byId.get(id)!
    for (const b of [...(l.blockedBy ?? []), ...(l.lockedBy ?? [])]) visit(b)
    state.set(id, 'done')
  }
  loot.forEach(l => visit(l.id))
  // A stone needs at least one clearer that is not stuck behind the stone itself.
  const behind = (id: string, target: string): boolean =>
    (byId.get(id)!.blockedBy ?? []).some(b => b === target || behind(b, target))
  for (const st of loot.filter(l => l.stone)) {
    if (st.clearedBy!.every(c => behind(c, st.id))) throw new Error(`Stone ${st.id} blocks every item that clears it`)
  }
  // Ships: the main ship comes first and has no colour; colour ships need a colour some viking can have.
  if (!ships.length || ships[0].color) throw new Error('The first ship must be the main ship (no colour)')
  for (const [i, sh] of ships.entries()) {
    if (!(Number.isInteger(sh.slots) && sh.slots > 0)) throw new Error(`Ship ${i} needs at least one seat`)
    if (i > 0 && !sh.color) throw new Error(`Ship ${i} needs a colour (only the main ship has none)`)
    if (i > 0 && queue && !queue.some(q => typeof q !== 'string' && q.kind === 'wild') &&
      !queue.some(q => (typeof q === 'string' ? q : q.kind === 'jarl' ? q.color : null) === sh.color)) {
      throw new Error(`No viking in the queue can use the ${sh.color} ship`)
    }
  }
}
