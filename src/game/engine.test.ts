import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  createGame, selectViking, getAvailableLoot, getSelectableVikings, resolveWaitingVikings,
  evaluateGameStatus, validateLevelGraph, type GameState, type LevelLoot, type LootColor,
} from './engine.ts'
import { levels, stacks, SCOUT } from './levels.ts'
import { solve, hint } from './solver.ts'

const R: LootColor = 'red', B: LootColor = 'blue', Y: LootColor = 'yellow'
const pick = (s: GameState, ...ids: string[]) => ids.reduce(selectViking, s)
const slim = (vs: GameState['waiting']) => vs.map(({ id, color, collectedCount }) => ({ id, color, collectedCount }))
const collected = (s: GameState) => s.loot.filter(l => l.collected).map(l => l.id).sort()

// --- Queue ---------------------------------------------------------------

test('only the first three vikings are selectable', () => {
  const s = createGame([{ id: 'r1', color: R }], [R, B, Y, R, B])
  assert.deepEqual(getSelectableVikings(s).map(v => v.id), ['v1', 'v2', 'v3'])
  assert.equal(selectViking(s, 'v4'), s, 'picking the 4th viking is a no-op')
  assert.equal(selectViking(s, 'nope'), s)
})

test('chosen viking leaves the queue and the rest move up', () => {
  const s = createGame([{ id: 'b1', color: B }, { id: 'b2', color: B }, { id: 'r1', color: R }], [R, B, Y, R])
  const next = selectViking(s, 'v2')
  assert.deepEqual(next.queue.map(v => v.id), ['v1', 'v3', 'v4'])
  assert.deepEqual(getSelectableVikings(next).map(v => v.id), ['v1', 'v3', 'v4'])
  assert.equal(next.moves, 1)
})

test('a pick is used up even when the viking finds nothing', () => {
  const s = createGame([{ id: 'r1', color: R }, { id: 'r2', color: R }], [B, R])
  const next = selectViking(s, 'v1')
  assert.deepEqual(next.queue.map(v => v.id), ['v2'])
  assert.deepEqual(slim(next.waiting), [{ id: 'v1', color: B, collectedCount: 0 }])
})

// --- Raiding and blocking ------------------------------------------------

test('vikings collect at most two available items of their own colour', () => {
  const s = createGame(
    [{ id: 'r1', color: R }, { id: 'b1', color: B }, { id: 'r2', color: R }, { id: 'r3', color: R }],
    [R, R],
  )
  const next = selectViking(s, 'v1')
  assert.deepEqual(collected(next), ['r1', 'r2'])
  assert.equal(next.waiting.length, 0, 'a full viking returns home')
  assert.ok(next.events.some(e => e.type === 'return' && e.vikingId === 'v1'))
})

test('blocked items cannot be collected before their blockers are gone', () => {
  const loot: LevelLoot[] = [{ id: 'r1', color: R }, { id: 'b1', color: B, blockedBy: ['r1'] }, { id: 'b2', color: B }]
  const s = createGame(loot, [B, R])
  assert.deepEqual(getAvailableLoot(s).map(l => l.id), ['r1', 'b2'])
  const afterBlue = selectViking(s, 'v1')
  assert.deepEqual(collected(afterBlue), ['b2'], 'b1 is still behind r1')
  assert.deepEqual(slim(afterBlue.waiting), [{ id: 'v1', color: B, collectedCount: 1 }])
})

test('an item blocked by several others needs all of them gone', () => {
  const loot: LevelLoot[] = [{ id: 'r1', color: R }, { id: 'y1', color: Y }, { id: 'b1', color: B, blockedBy: ['r1', 'y1'] }]
  let s = createGame(loot, [R, Y])
  s = selectViking(s, 'v1')
  assert.ok(!getAvailableLoot(s).some(l => l.id === 'b1'))
  s = selectViking(s, 'v2')
  assert.ok(getAvailableLoot(s).some(l => l.id === 'b1'))
})

test('a viking can clear a same-coloured item it just uncovered', () => {
  const s = createGame([{ id: 'r1', color: R }, { id: 'r2', color: R, blockedBy: ['r1'] }], [R])
  assert.equal(selectViking(s, 'v1').status, 'won')
})

// --- Waiting slots -------------------------------------------------------

test('waiting vikings keep their remaining capacity and finish when loot is unlocked', () => {
  const loot: LevelLoot[] = [
    { id: 'r1', color: R }, { id: 'r2', color: R },
    { id: 'b1', color: B }, { id: 'b2', color: B, blockedBy: ['r1'] },
  ]
  let s = createGame(loot, [B, R])
  s = selectViking(s, 'v1')
  assert.deepEqual(slim(s.waiting), [{ id: 'v1', color: B, collectedCount: 1 }])
  s = selectViking(s, 'v2')
  assert.equal(s.waiting.length, 0, 'blue viking finished and left its slot')
  assert.equal(s.status, 'won')
  const order = s.events.filter(e => e.type === 'collect').map(e => e.type === 'collect' && e.lootId)
  assert.deepEqual(order, ['r1', 'r2', 'b2'], 'red raids first, then the waiter reacts')
})

test('waiters resolve in arrival order', () => {
  // Two blue vikings wait; red uncovers a single blue item – the first to arrive gets it.
  const loot: LevelLoot[] = [{ id: 'r1', color: R }, { id: 'r2', color: R }, { id: 'b1', color: B, blockedBy: ['r1'] }]
  const s = pick(createGame(loot, [B, B, R]), 'v1', 'v2', 'v3')
  assert.deepEqual(slim(s.waiting), [{ id: 'v1', color: B, collectedCount: 1 }, { id: 'v2', color: B, collectedCount: 0 }])
})

test('two waiting vikings are safe', () => {
  const s = pick(createGame([{ id: 'y1', color: Y }, { id: 'y2', color: Y }], [R, B, B, Y]), 'v1', 'v2')
  assert.equal(s.waiting.length, 2)
  assert.equal(s.status, 'playing')
})

test('filling the third waiting slot loses the raid', () => {
  const s = pick(createGame([{ id: 'y1', color: Y }, { id: 'y2', color: Y }], [R, B, B, Y]), 'v1', 'v2', 'v3')
  assert.equal(s.status, 'lost')
  assert.equal(s.lossReason, 'slots-full')
  assert.equal(s.waiting.length, 3, 'the third viking is shown in its seat')
  assert.deepEqual(s.events.slice(-2).map(e => e.type), ['wait', 'overflow'])
  assert.equal(selectViking(s, 'v4'), s, 'no moves after the game ends')
})

test('full slots are checked only after the waiters have had their chance', () => {
  // Two blue waiters; a red viking uncovers blue loot so they leave and nobody needs the third seat.
  const loot: LevelLoot[] = [
    { id: 'r1', color: R }, { id: 'r2', color: R },
    ...['b1', 'b2', 'b3', 'b4'].map(id => ({ id, color: B, blockedBy: ['r1'] })),
  ]
  let s = pick(createGame(loot, [B, B, R]), 'v1', 'v2')
  assert.equal(s.waiting.length, 2)
  s = selectViking(s, 'v3')
  assert.equal(s.status, 'won')
  assert.equal(s.waiting.length, 0)
})

test('newcomer that cannot finish still loses even if waiters partly progress', () => {
  const loot: LevelLoot[] = [{ id: 'r1', color: R }, { id: 'b1', color: B, blockedBy: ['r1'] }, { id: 'y1', color: Y }, { id: 'y2', color: Y }]
  // v1, v2 wait (blue). v3 red takes r1 (only one) → b1 unlocks, v1 takes it but still waits. Red takes the third seat.
  const s = pick(createGame(loot, [B, B, R, Y]), 'v1', 'v2', 'v3')
  assert.equal(s.status, 'lost')
  assert.equal(s.lossReason, 'slots-full')
  assert.deepEqual(s.waiting.map(v => [v.id, v.collectedCount]), [['v1', 1], ['v2', 0], ['v3', 1]])
})

// --- Win / loss ----------------------------------------------------------

test('collecting everything wins, and win beats loss', () => {
  // The newcomer takes the last item but is only half full, so it takes the third seat –
  // yet the board is empty, so it must be a win.
  const loot: LevelLoot[] = [{ id: 'y1', color: Y }, { id: 'y2', color: Y }, { id: 'r1', color: R, blockedBy: ['y1'] }]
  let s = pick(createGame(loot, [B, B, Y, R]), 'v1', 'v2', 'v3')
  assert.equal(s.waiting.length, 2)
  s = selectViking(s, 'v4')
  assert.equal(s.status, 'won')
  assert.equal(s.lossReason, null)
})

test('an empty queue with no waiter able to move is a stuck loss', () => {
  const loot: LevelLoot[] = [{ id: 'r1', color: R }, { id: 'r2', color: R }, { id: 'b1', color: B }]
  const s = pick(createGame(loot, [R, Y]), 'v1', 'v2')
  assert.equal(s.queue.length, 0)
  assert.equal(s.status, 'lost')
  assert.equal(s.lossReason, 'stuck')
})

test('evaluateGameStatus and resolveWaitingVikings work as standalone functions', () => {
  const s = createGame([{ id: 'r1', color: R }], [R])
  assert.equal(evaluateGameStatus(s), 'playing')
  const manual: GameState = { ...s, queue: [], waiting: [{ id: "w", kind: "normal", color: R, capacity: 2, collectedCount: 0, ship: 0 }] }
  assert.equal(evaluateGameStatus(manual), 'playing', 'the waiter can still move')
  const resolved = resolveWaitingVikings(manual)
  assert.equal(resolved.status, 'won')
})

test('createGame produces a fresh state (restart resets everything)', () => {
  const level = levels[4]
  const a = pick(createGame(level.loot, level.queue), 'v1', 'v2')
  const b = createGame(level.loot, level.queue)
  assert.ok(a.moves > 0 && b.moves === 0)
  assert.ok(b.loot.every(l => !l.collected))
  assert.equal(b.waiting.length, 0)
  assert.equal(b.queue.length, level.queue.length)
  assert.ok(level.loot.every(l => !('collected' in l)), 'level data is never mutated')
})

// --- Levels --------------------------------------------------------------

test('level graphs are valid and acyclic; cycles are rejected', () => {
  levels.forEach(l => validateLevelGraph(l.loot))
  assert.throws(() => validateLevelGraph([{ id: 'a', color: R, blockedBy: ['b'] }, { id: 'b', color: R, blockedBy: ['a'] }]), /cycle/)
  assert.throws(() => validateLevelGraph([{ id: 'a', color: R, blockedBy: ['x'] }]), /unknown/)
})

test('there are at least five levels and every one is winnable', () => {
  assert.ok(levels.length >= 5)
  for (const l of levels) {
    const report = solve(createGame(l.loot, l.queue))
    assert.ok(report.winnable, `${l.name} must be winnable`)
    // Replay the found sequence to verify it independently.
    const end = report.winPath!.reduce(selectViking, createGame(l.loot, l.queue))
    assert.equal(end.status, 'won', `${l.name}: win path replays to a win`)
  }
})

test('the first levels follow the planned progression', () => {
  const hasBlocking = (i: number) => levels[i].loot.some(l => (l.blockedBy ?? []).length > 0)
  assert.equal(levels[0].loot.length, 16, 'Kustbyn uses a full 4×4 grid')
  assert.ok(!hasBlocking(0), 'level 1 has no blocked loot')
  // Level 2 is where waiting first happens.
  const l2 = levels[1]
  assert.ok(!solve(createGame(levels[0].loot, levels[0].queue)).lossPath, 'level 1 cannot be lost')
  assert.equal(selectViking(createGame(l2.loot, l2.queue), 'v1').waiting.length, 1, 'level 2 teaches waiting')
  assert.ok(hasBlocking(2), 'level 3 has blocked loot')
})

test('puzzle levels have verified win and loss sequences', () => {
  const puzzles = levels.filter(l => solve(createGame(l.loot, l.queue)).lossPath)
  assert.ok(puzzles.length >= 1)
  for (const l of puzzles) {
    const r = solve(createGame(l.loot, l.queue))
    assert.equal(r.winPath!.reduce(selectViking, createGame(l.loot, l.queue)).status, 'won', `${l.name} win`)
    assert.equal(r.lossPath!.reduce(selectViking, createGame(l.loot, l.queue)).status, 'lost', `${l.name} loss`)
  }
  // Hand-checked Fästet lines.
  const f = levels.find(x => x.name === 'Fästet')!
  const start = createGame(f.loot, f.queue)
  assert.equal(pick(start, 'v1', 'v2', 'v3', 'v4', 'v5', 'v6').status, 'won')
  const lost = pick(start, 'v1', 'v2', 'v3', 'v4', 'v6')
  assert.equal(lost.status, 'lost')
  assert.equal(lost.lossReason, 'slots-full')
})

// --- Regression: 0.3 rules must not change the 0.2 levels ----------------

test('levels 1–12 keep their 0.2 solver numbers', () => {
  const expected: [number, number][] = [
    [1458, 0], [6, 0], [18, 0], [122, 34], [68, 83], [256, 429],
    [22, 28], [52, 91], [168, 360], [104, 340], [208, 1055], [88, 419],
  ]
  expected.forEach(([wins, losses], i) => {
    const r = solve(createGame(levels[i].loot, levels[i].queue))
    assert.deepEqual([r.winningLines, r.losingLines], [wins, losses], levels[i].name)
  })
})

// --- 0.3: houses -------------------------------------------------------------

test('a house takes two hits, and one viking with two slots empties it', () => {
  const s = pick(createGame([{ id: 'h', color: R, hits: 2 }], [R]), 'v1')
  assert.deepEqual(s.events.map(e => e.type), ['dispatch', 'hit', 'collect', 'return'])
  assert.equal(s.status, 'won')
})

test('a house can be shared between two vikings and blocks until the last hit', () => {
  const loot: LevelLoot[] = [{ id: 'r1', color: R }, { id: 'h', color: R, hits: 2 }, { id: 'b', color: B, blockedBy: ['h'] }]
  const s1 = pick(createGame(loot, [R, R, B]), 'v1') // takes r1, then one hit on the house
  assert.equal(s1.loot.find(l => l.id === 'h')!.hitsLeft, 1)
  assert.ok(!getAvailableLoot(s1).some(l => l.id === 'b'), 'still blocked by the opened house')
  const s2 = pick(s1, 'v2') // second hit takes the house; it waits with 1/2
  assert.ok(s2.loot.find(l => l.id === 'h')!.collected)
  assert.ok(getAvailableLoot(s2).some(l => l.id === 'b'))
  assert.equal(s2.waiting.length, 1, 'v2 spent one slot on the last hit and waits with the other free')
  assert.equal(pick(s2, 'v3').status, 'won', 'taking the last item wins even with a viking still seated')
})

// --- 0.3: stones -------------------------------------------------------------

test('a stone crumbles when any clearer is taken and costs no capacity', () => {
  const loot: LevelLoot[] = [
    { id: 'r1', color: R }, { id: 'y1', color: Y },
    { id: 'st', stone: true, clearedBy: ['r1', 'y1'] },
    { id: 'b1', color: B, blockedBy: ['st'] }, { id: 'b2', color: B, blockedBy: ['st'] },
  ]
  const s = pick(createGame(loot, [Y, B, R]), 'v1')
  assert.ok(s.events.some(e => e.type === 'crumble'), 'the yellow alone clears it (OR)')
  assert.equal(s.waiting.length, 1, 'the yellow viking still only carried one item')
  const end = pick(s, 'v2', 'v3')
  assert.equal(end.status, 'won', 'blue takes both freed items and red takes r1')
})

test('stones need valid clearers', () => {
  assert.throws(() => validateLevelGraph([{ id: 's', stone: true }]), /clearedBy/)
  assert.throws(() => validateLevelGraph([{ id: 's', stone: true, clearedBy: ['x'] }]), /unknown/)
  assert.throws(() => validateLevelGraph([{ id: 'b', color: B, blockedBy: ['s'] }, { id: 's', stone: true, clearedBy: ['b'] }]), /blocks every item/)
  validateLevelGraph([{ id: 'b', color: B, blockedBy: ['s'] }, { id: 'r', color: R }, { id: 's', stone: true, clearedBy: ['b', 'r'] }])
})

// --- 0.3: special vikings ----------------------------------------------------

test('a jarl carries three', () => {
  const loot: LevelLoot[] = [{ id: 'r1', color: R }, { id: 'r2', color: R }, { id: 'r3', color: R }]
  const s = pick(createGame(loot, [{ kind: 'jarl', color: R }]), 'v1')
  assert.equal(s.status, 'won')
  assert.equal(s.waits, 0)
})

test('a wild viking takes the colour of the first item it reaches and keeps it', () => {
  const loot: LevelLoot[] = [{ id: 'b1', color: B }, { id: 'r1', color: R }, { id: 'b2', color: B, blockedBy: ['r1'] }]
  const s = pick(createGame(loot, [{ kind: 'wild' }, R]), 'v1')
  assert.deepEqual(s.events.slice(0, 3).map(e => e.type), ['dispatch', 'color', 'collect'])
  assert.equal(s.waiting[0].color, B, 'took b1, then waits as a blue viking (b2 is blocked)')
  const end = pick(s, 'v2')
  assert.equal(end.status, 'won', 'red frees b2 and the waiting wild viking takes it')
})

// --- 0.3: hidden loot ----------------------------------------------------------

test('hidden loot is revealed when it becomes reachable and does not change the outcome', () => {
  const loot: LevelLoot[] = [{ id: 'r1', color: R }, { id: 'r2', color: R }, { id: 'b1', color: B, blockedBy: ['r1'], hidden: true }, { id: 'b2', color: B, hidden: true }]
  const start = createGame(loot, [R, B])
  assert.equal(start.loot.find(l => l.id === 'b1')!.hidden, true)
  assert.equal(start.loot.find(l => l.id === 'b2')!.hidden, false, 'reachable from the start, so shown')
  const s = pick(start, 'v1')
  assert.ok(s.events.some(e => e.type === 'reveal' && e.lootId === 'b1'))
  const plain = loot.map(l => ({ ...l, hidden: false }))
  const a = solve(start), b = solve(createGame(plain, [R, B]))
  assert.deepEqual([a.winningLines, a.losingLines], [b.winningLines, b.losingLines])
})

// --- 0.3: solver helpers ---------------------------------------------------------

test('minWaits is the fewest seats needed on a winning line', () => {
  // r2 hides behind b2 and b1 behind r1: whoever goes first has to wait once.
  const loot: LevelLoot[] = [{ id: 'r1', color: R }, { id: 'b2', color: B }, { id: 'b1', color: B, blockedBy: ['r1'] }, { id: 'r2', color: R, blockedBy: ['b2'] }]
  const r = solve(createGame(loot, [B, R]))
  assert.equal(r.minWaits, 1)
  assert.equal(r.winPath!.reduce(selectViking, createGame(loot, [B, R])).waits, 1)
  assert.equal(solve(createGame(levels[0].loot, levels[0].queue)).minWaits, 0)
})

test('hint always suggests a move that can still win', () => {
  for (const l of levels.slice(3, 6)) {
    let s = createGame(l.loot, l.queue)
    while (s.status === 'playing') {
      const id = hint(s)
      assert.ok(id, `${l.name}: a hint exists while the level is winnable`)
      s = selectViking(s, id!)
    }
    assert.equal(s.status, 'won', `${l.name}: following hints wins`)
  }
  const f = levels.find(x => x.name === 'Fästet')!
  const doomed = pick(createGame(f.loot, f.queue), 'v1', 'v2', 'v3', 'v4')
  if (doomed.status === 'playing' && !solve(doomed).winnable) assert.equal(hint(doomed), null)
})

// --- 0.4: keys and locked chests -------------------------------------------------

test('a chest stays locked until its key is taken, even from another pile', () => {
  const loot: LevelLoot[] = [{ id: 'c', color: R, lockedBy: ['k'] }, { id: 'k', color: B, key: true }]
  const s = createGame(loot, [R, B])
  assert.deepEqual(getAvailableLoot(s).map(l => l.id), ['k'], 'the chest is not reachable yet')
  const s1 = selectViking(s, 'v1')
  assert.equal(s1.waiting.length, 1, 'red finds nothing and waits')
  const s2 = selectViking(s1, 'v2')
  const types = s2.events.map(e => e.type)
  assert.ok(types.indexOf('unlock') > types.indexOf('collect'), 'taking the key unlocks the chest')
  assert.deepEqual(s2.events.find(e => e.type === 'unlock'), { type: 'unlock', lootId: 'c' })
  assert.ok(s2.events.some(e => e.type === 'collect' && e.lootId === 'c' && e.fromWaiting), 'the waiting red viking takes the chest')
  assert.equal(s2.status, 'won')
})

test('a chest with two keys opens only when both are taken', () => {
  const loot: LevelLoot[] = [{ id: 'c', color: Y, lockedBy: ['k1', 'k2'] }, { id: 'k1', color: R, key: true }, { id: 'k2', color: B, key: true }]
  const s = pick(createGame(loot, [R, B, Y]), 'v1')
  assert.ok(!s.events.some(e => e.type === 'unlock'))
  assert.deepEqual(getAvailableLoot(s).map(l => l.id), ['k2'])
  const s2 = pick(s, 'v2')
  assert.ok(s2.events.some(e => e.type === 'unlock'))
})

test('stacks: ! is a key, # a chest locked by the keys of its colour, ~N ice', () => {
  const loot = stacks(['#rb', '!r', '?~2y'])
  const chest = loot.find(l => l.id === 'c1-1')!
  assert.deepEqual([chest.lockedBy, chest.kind, chest.color], [['c2-1'], 'chest', R])
  assert.equal(loot.find(l => l.id === 'c2-1')!.key, true)
  const ice = loot.find(l => l.id === 'c3-1')!
  assert.deepEqual([ice.frozen, ice.hidden, ice.color], [2, true, Y])
  assert.throws(() => stacks(['#r', 'b']), /no red key/)
  assert.throws(() => stacks(['!R']), /not houses/)
  assert.throws(() => stacks(['~r']), /needs a number/)
})

// --- 0.4: ice --------------------------------------------------------------------

test('ice thaws when move N starts, and a waiting viking can take the thawed item', () => {
  const loot: LevelLoot[] = [{ id: 'r1', color: R, frozen: 2 }]
  const s = createGame(loot, [R, B, R])
  assert.equal(getAvailableLoot(s).length, 0)
  const s1 = selectViking(s, 'v1')
  assert.deepEqual(s1.loot[0].frozenLeft, 1)
  assert.equal(s1.waiting.length, 1, 'still frozen during move 1: red waits')
  const s2 = selectViking(s1, 'v2')
  assert.deepEqual(s2.events.slice(0, 2), [{ type: 'dispatch', vikingId: 'v2' }, { type: 'thaw', lootId: 'r1' }], 'ice melts before the new viking raids')
  assert.ok(s2.events.some(e => e.type === 'collect' && e.vikingId === 'v1' && e.fromWaiting))
  assert.equal(s2.status, 'won')
})

test('ice with frozen: 1 thaws at the start of the first move; hidden ice is revealed when it thaws', () => {
  const s = selectViking(createGame([{ id: 'r1', color: R, frozen: 1 }], [R]), 'v1')
  assert.equal(s.status, 'won')
  const h = createGame([{ id: 'y1', color: Y, frozen: 1, hidden: true }, { id: 'r1', color: R }], [R, Y])
  assert.equal(h.loot[0].hidden, true, 'frozen items are not reachable, so they stay hidden')
  const h1 = selectViking(h, 'v1')
  assert.deepEqual(h1.events.slice(1, 3), [{ type: 'thaw', lootId: 'y1' }, { type: 'reveal', lootId: 'y1' }])
})

test('ice that can no longer thaw leaves the raid stuck', () => {
  const s = pick(createGame([{ id: 'r1', color: R, frozen: 3 }], [R, B]), 'v1', 'v2')
  assert.equal(s.status, 'lost')
  assert.equal(s.lossReason, 'stuck')
})

test('with ice, timing matters: the hint waits for the thaw and the solver counts it', () => {
  // Red first must wait for the ice; blue first lets red take r1 as soon as it thaws.
  const loot: LevelLoot[] = [{ id: 'r1', color: R, frozen: 2 }, { id: 'r2', color: R, frozen: 2 }, { id: 'b1', color: B }, { id: 'b2', color: B }]
  const start = createGame(loot, [R, B, B])
  assert.equal(solve(start).minWaits, 0)
  assert.equal(hint(start), 'v2')
  assert.equal(pick(start, 'v1', 'v2').waits, 1)
})

// --- 0.4: two ships ----------------------------------------------------------------

test('a colour ship seats its own colour first; when it is full they use the main ship', () => {
  const loot: LevelLoot[] = [{ id: 'r1', color: R }, { id: 'b1', color: B, blockedBy: ['r1'] }]
  const ships = [{ slots: 3 }, { slots: 2, color: B }]
  const s = pick(createGame(loot, [B, B, B, R], ships), 'v1', 'v2', 'v3')
  assert.deepEqual(s.waiting.map(v => v.ship), [1, 1, 0])
  assert.deepEqual(s.events.find(e => e.type === 'wait'), { type: 'wait', vikingId: 'v3', ship: 0, slot: 0 })
  assert.equal(s.status, 'playing', 'a full colour ship does not sink the raid')
})

test('only the main ship sinks the raid', () => {
  const ships = [{ slots: 3 }, { slots: 2, color: B }]
  const s = pick(createGame([{ id: 'y1', color: Y }], [R, R, R, Y, B], ships), 'v1', 'v2', 'v3')
  assert.equal(s.status, 'lost')
  assert.equal(s.lossReason, 'slots-full')
  assert.deepEqual(s.events.slice(-1), [{ type: 'overflow', vikingId: 'v3' }])
})

test('a seated viking on a colour ship keeps raiding like any waiter', () => {
  const loot: LevelLoot[] = [{ id: 'r1', color: R }, { id: 'b1', color: B, blockedBy: ['r1'] }]
  const s = pick(createGame(loot, [B, R], [{ slots: 3 }, { slots: 1, color: B }]), 'v1', 'v2')
  assert.ok(s.events.some(e => e.type === 'collect' && e.lootId === 'b1' && e.fromWaiting))
  assert.equal(s.status, 'won')
})

// --- 0.4: scout ------------------------------------------------------------------

test('the scout reveals every hidden item, carries nothing and never takes a seat', () => {
  const loot: LevelLoot[] = [{ id: 'r1', color: R }, { id: 'b1', color: B, blockedBy: ['r1'], hidden: true }]
  const s = createGame(loot, [SCOUT, R, B])
  assert.equal(s.queue[0].kind, 'scout')
  const s1 = selectViking(s, 'v1')
  assert.deepEqual(s1.events.map(e => e.type), ['dispatch', 'scout', 'reveal', 'return'])
  assert.equal(s1.loot.find(l => l.id === 'b1')!.hidden, false)
  assert.deepEqual([s1.waiting.length, s1.waits, s1.moves, collected(s1)], [0, 0, 1, []])
  assert.equal(pick(s1, 'v2', 'v3').status, 'won')
})

test('the scout does not change who can win: same solver numbers with or without hidden items', () => {
  const loot: LevelLoot[] = [{ id: 'r1', color: R }, { id: 'b1', color: B, blockedBy: ['r1'], hidden: true }, { id: 'r2', color: R, blockedBy: ['b1'], hidden: true }]
  const a = solve(createGame(loot, [SCOUT, B, R]))
  const b = solve(createGame(loot.map(l => ({ ...l, hidden: false })), [SCOUT, B, R]))
  assert.deepEqual([a.winningLines, a.losingLines, a.minWaits], [b.winningLines, b.losingLines, b.minWaits])
})

// --- 0.4: validation -----------------------------------------------------------

test('validateLevelGraph catches broken keys, ice and ships', () => {
  assert.throws(() => validateLevelGraph([{ id: 'c', color: R, lockedBy: ['x'] }]), /unknown/)
  assert.throws(() => validateLevelGraph([{ id: 'c', color: R, lockedBy: ['k'] }, { id: 'k', color: B }]), /not a key/)
  assert.throws(() => validateLevelGraph([{ id: 'c', color: R, lockedBy: ['k'] }, { id: 'k', color: B, key: true, blockedBy: ['c'] }]), /cycle/)
  assert.throws(() => validateLevelGraph([{ id: 'r', color: R, frozen: 0 }]), /frozen/)
  assert.throws(() => validateLevelGraph([{ id: 'r', color: R }], [{ slots: 2, color: B }]), /main ship/)
  assert.throws(() => validateLevelGraph([{ id: 'r', color: R }], [{ slots: 3 }, { slots: 2 }]), /needs a colour/)
  assert.throws(() => validateLevelGraph([{ id: 'r', color: R }], [{ slots: 3 }, { slots: 2, color: B }], [R, R]), /No viking/)
  validateLevelGraph([{ id: 'c', color: R, lockedBy: ['k'] }, { id: 'k', color: B, key: true }], [{ slots: 3 }, { slots: 2, color: B }], [R, B])
})
