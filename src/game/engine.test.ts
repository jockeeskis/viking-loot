import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  createGame, selectViking, getAvailableLoot, getSelectableVikings, resolveWaitingVikings,
  evaluateGameStatus, validateLevelGraph, type GameState, type LevelLoot, type LootColor,
} from './engine.ts'
import { levels } from './levels.ts'
import { solve } from './solver.ts'

const R: LootColor = 'red', B: LootColor = 'blue', Y: LootColor = 'yellow'
const pick = (s: GameState, ...ids: string[]) => ids.reduce(selectViking, s)
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
  assert.deepEqual(next.waiting, [{ id: 'v1', color: B, collectedCount: 0 }])
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
  assert.deepEqual(afterBlue.waiting, [{ id: 'v1', color: B, collectedCount: 1 }])
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
  assert.deepEqual(s.waiting, [{ id: 'v1', color: B, collectedCount: 1 }])
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
  assert.deepEqual(s.waiting, [{ id: 'v1', color: B, collectedCount: 1 }, { id: 'v2', color: B, collectedCount: 0 }])
})

test('filling the third slot is risky but not a loss', () => {
  const s = pick(createGame([{ id: 'y1', color: Y }, { id: 'y2', color: Y }], [R, R, B, B, Y]), 'v1', 'v2', 'v3')
  assert.equal(s.waiting.length, 3)
  assert.equal(s.status, 'playing')
})

test('a fourth viking that needs to wait loses the raid', () => {
  const s = pick(createGame([{ id: 'y1', color: Y }, { id: 'y2', color: Y }], [R, R, B, B, Y]), 'v1', 'v2', 'v3', 'v4')
  assert.equal(s.status, 'lost')
  assert.equal(s.lossReason, 'slots-full')
  assert.ok(s.events.some(e => e.type === 'overflow' && e.vikingId === 'v4'))
  assert.equal(selectViking(s, 'v5'), s, 'no moves after the game ends')
})

test('full slots are checked only after the waiters have had their chance', () => {
  // Three blue waiters; a red viking uncovers blue loot so they leave and the newcomer is fine.
  const loot: LevelLoot[] = [
    { id: 'r1', color: R }, { id: 'r2', color: R },
    ...['b1', 'b2', 'b3', 'b4', 'b5', 'b6'].map(id => ({ id, color: B, blockedBy: ['r1'] })),
  ]
  let s = pick(createGame(loot, [B, B, B, R]), 'v1', 'v2', 'v3')
  assert.equal(s.waiting.length, 3)
  s = selectViking(s, 'v4')
  assert.equal(s.status, 'won')
  assert.equal(s.waiting.length, 0)
})

test('newcomer that cannot finish still loses even if waiters partly progress', () => {
  const loot: LevelLoot[] = [{ id: 'r1', color: R }, { id: 'b1', color: B, blockedBy: ['r1'] }, { id: 'y1', color: Y }, { id: 'y2', color: Y }]
  // v1-v3 wait (b, b, b). v4 red takes r1 (only 1) → b1 unlocks, v1 takes it but still waits. Red must wait → 4th.
  const s = pick(createGame(loot, [B, B, B, R, Y]), 'v1', 'v2', 'v3', 'v4')
  assert.equal(s.status, 'lost')
  assert.equal(s.lossReason, 'slots-full')
})

// --- Win / loss ----------------------------------------------------------

test('collecting everything wins, and win beats loss', () => {
  // The newcomer takes the last item but is only half full: it would need a slot (none free),
  // yet the board is empty, so it must be a win.
  const loot: LevelLoot[] = [{ id: 'y1', color: Y }, { id: 'y2', color: Y }, { id: 'r1', color: R, blockedBy: ['y1'] }]
  let s = pick(createGame(loot, [B, B, B, Y, R]), 'v1', 'v2', 'v3', 'v4')
  assert.equal(s.waiting.length, 3)
  s = selectViking(s, 'v5')
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
  const manual: GameState = { ...s, queue: [], waiting: [{ id: 'w', color: R, collectedCount: 0 }] }
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

test('Fästet has verified win and loss sequences', () => {
  const l = levels.find(x => x.name === 'Fästet')!
  const start = createGame(l.loot, l.queue)
  // Win: red and yellow wait, blues clear the front, everyone finishes.
  assert.equal(pick(start, 'v1', 'v2', 'v3', 'v5', 'v6', 'v4').status, 'won')
  // Loss: three wait, then a fourth yellow finds nothing.
  const lost = pick(start, 'v1', 'v2', 'v3', 'v4')
  assert.equal(lost.status, 'lost')
  assert.equal(lost.lossReason, 'slots-full')
})
