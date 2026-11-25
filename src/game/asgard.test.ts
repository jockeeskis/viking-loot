// 0.6 phase 2: Asgård's three mechanics – gold, Valhalla's gate and the valkyrie.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createGame, selectViking, getSelectableVikings, validateLevelGraph, isAvailable, type GameState, type LootColor } from './engine.ts'
import { levels, stacks, startGame, VALK, WILD } from './levels.ts'
import { bosses } from './bosses.ts'
import { solve, hint, winnable } from './solver.ts'
import { blockReason, findsNothing } from './feedback.ts'
import { mechanicsOf } from './intros.ts'
import { generate, evaluate, type Spec } from './generator.ts'
import { tierFor, mechanicsForTier, dailyLevel, type Tier } from './modes.ts'
import { say, setLang } from './i18n.ts'

const R: LootColor = 'red', B: LootColor = 'blue', Y: LootColor = 'yellow'
const pick = (s: GameState, ...ids: string[]) => ids.reduce(selectViking, s)
const item = (s: GameState, id: string) => s.loot.find(l => l.id === id)!

test('regression: levels 1–48 and the four bosses give exactly the same solver numbers as in 0.5', () => {
  // [winning lines, losing lines, par], computed with the 0.5 engine before Asgård was added.
  const v05 = [[1458, 0, 0], [6, 0, 0], [18, 0, 0], [122, 34, 1], [68, 83, 1], [256, 429, 2], [22, 28, 1], [52, 91, 1], [168, 360, 2], [104, 340, 2], [208, 1055, 1], [88, 419, 2], [54, 0, 0], [180, 210, 1], [18, 0, 0], [20, 33, 1], [18, 0, 1], [308, 722, 2], [18, 0, 0], [154, 331, 1], [18, 0, 0], [162, 324, 2], [366, 923, 1], [510, 3852, 0], [18, 0, 0], [74, 76, 2], [18, 0, 0], [42, 70, 2], [18, 0, 1], [276, 280, 2], [54, 0, 0], [4308, 6963, 1], [392, 892, 2], [224, 742, 2], [259, 969, 2], [1296, 9594, 3], [18, 0, 0], [136, 286, 1], [18, 0, 0], [670, 1175, 2], [10, 0, 0], [176, 349, 2], [54, 0, 0], [1484, 2890, 1], [264, 641, 1], [420, 1892, 2], [238, 1414, 2], [1786, 11332, 1], [124, 331, 1], [32, 130, 2], [78, 466, 5], [468, 2419, 1]]
  const all = [...levels.slice(0, 48), ...bosses.filter(b => b.world < 4).map(b => b.level)]
  assert.equal(all.length, v05.length)
  all.forEach((l, i) => {
    const r = solve(startGame(l))
    assert.deepEqual([r.winningLines, r.losingLines, r.minWaits], v05[i], l.name)
  })
})

// --- Gold -------------------------------------------------------------------------------

test('gold can be taken by a viking of any colour and costs one carry slot', () => {
  for (const c of [R, B, Y]) {
    const s = selectViking(createGame([{ id: 'g', gold: true }, { id: 'x', color: c }], [c]), 'v1')
    assert.ok(item(s, 'g').collected && item(s, 'x').collected, c)
    assert.equal(s.status, 'won')
  }
  // A blue viking that takes the gold has one slot left and waits for blue.
  const s = selectViking(createGame([{ id: 'g', gold: true }, { id: 'r1', color: R }, { id: 'b1', color: B, blockedBy: ['r1'] }], [B, R]), 'v1')
  assert.ok(item(s, 'g').collected)
  assert.deepEqual(s.waiting.map(w => [w.id, w.color, w.collectedCount]), [['v1', 'blue', 1]])
})

test('a wild viking that takes gold keeps no colour until it takes coloured loot', () => {
  const s = selectViking(createGame([{ id: 'g', gold: true }, { id: 'b1', color: B }], [WILD]), 'v1')
  assert.ok(item(s, 'g').collected && item(s, 'b1').collected)
  assert.deepEqual(s.events.filter(e => e.type === 'color'), [{ type: 'color', vikingId: 'v1', color: 'blue' }])
  const only = selectViking(createGame([{ id: 'g', gold: true }, { id: 'b1', color: B, blockedBy: ['r1'] }, { id: 'r1', color: R }], [WILD, R, B]), 'v1')
  // Level order: gold first, then the front red – so Ylva turns red after the gold.
  assert.equal(only.waiting.length, 0)
  assert.ok(only.events.some(e => e.type === 'color' && e.color === 'red'))
})

test('stacks: $ is gold, also hidden or frozen; gold cannot be a key, chest, keg or gate', () => {
  const l = stacks(['?$r', '~2$'])
  assert.deepEqual({ ...l[0], at: undefined }, { id: 'c1-1', gold: true, at: undefined, blockedBy: ['c1-2'], hidden: true })
  assert.equal(l[0].color, undefined)
  assert.equal(l[2].gold, true); assert.equal(l[2].frozen, 2)
  for (const bad of ['!$', '#$', '*$', '%2$']) assert.throws(() => stacks([bad, 'r']), /Gold/, bad)
  validateLevelGraph(l)
  assert.throws(() => validateLevelGraph([{ id: 'g', gold: true, color: R }]), /no colour/)
  assert.throws(() => validateLevelGraph([{ id: 'g', gold: true, hits: 2 }]), /plain loot/)
})

test('tapping gold says any viking can take it', () => {
  const s = createGame([{ id: 'g', gold: true }, { id: 'r1', color: R }], [R])
  assert.deepEqual(blockReason(s, 'g'), { key: 'block.gold' })
})

// --- Valhalla's gate ------------------------------------------------------------------

test("Valhalla's gate opens exactly on the N-th other item of its colour", () => {
  // Piles back→front: two reds; a gate needing two reds; a red behind two blues.
  const loot = stacks(['rr', '%2r', 'rbb'])
  assert.equal(loot[2].gate, 2)
  const s0 = startGame({ loot, queue: [R, R, B] })
  assert.ok(!isAvailable(s0, item(s0, 'c2-1')), 'shut at the start, although nothing is in front')
  assert.deepEqual(blockReason(s0, 'c2-1'), { key: 'block.gate', params: { n: 2 }, colors: ['red'] })
  setLang('sv')
  assert.equal(say(blockReason(s0, 'c2-1')!), '🚪 Valhalls port – plundra 2 skatter till i samma färg först.')
  const s1 = selectViking(s0, 'v1') // takes both reds of pile 1
  const unlocks = s1.events.filter(e => e.type === 'unlock')
  assert.deepEqual(unlocks, [{ type: 'unlock', lootId: 'c2-1', gate: true }])
  // The unlock comes right after the second red, not the first.
  const order = s1.events.map(e => (e.type === 'collect' || e.type === 'unlock' ? `${e.type}:${e.lootId}` : '')).filter(Boolean)
  assert.deepEqual(order, ['collect:c1-2', 'collect:c1-1', 'unlock:c2-1'])
  assert.ok(isAvailable(s1, item(s1, 'c2-1')))
  assert.equal(pick(s0, 'v1', 'v2', 'v3').status, 'won')
})

test('a gate counts taken items of its colour only – not gold, not houses half-way, not itself', () => {
  const loot = [
    { id: 'gate', color: R, gate: 2 }, { id: 'g', gold: true }, { id: 'h', color: R, hits: 2 }, { id: 'b', color: B },
  ]
  let s = createGame(loot, [R, R, B])
  const left = () => blockReason(s, 'gate')!.params!.n
  s = selectViking(s, 'v3') // blue takes b and the gold
  assert.ok(item(s, 'g').collected)
  assert.equal(left(), 2, 'gold and blue do not count')
  // A red viking with one free slot hits the house once: still shut.
  s = createGame([{ id: 'gate', color: R, gate: 1 }, { id: 'h', color: R, hits: 2 }, { id: 'y', color: Y }], [Y])
  const half = { ...s, loot: s.loot.map(l => (l.id === 'h' ? { ...l, hitsLeft: 1 } : l)) }
  assert.ok(!isAvailable(half, item(half, 'gate')), 'a half-hit house does not count')
  const done = { ...s, loot: s.loot.map(l => (l.id === 'h' ? { ...l, hitsLeft: 0, collected: true } : l)) }
  assert.ok(isAvailable(done, item(done, 'gate')))
})

test('validation: every gate must be able to open, and gates show their colour', () => {
  assert.throws(() => validateLevelGraph(stacks(['r', '%2r', 'bb'])), /never open/, 'only one other red')
  assert.throws(() => validateLevelGraph(stacks(['rr%2r', 'bb'])), /never open/, 'the reds lie behind the gate')
  // Two gates that each wait for the other never open.
  assert.throws(() => validateLevelGraph(stacks(['r%2r', '%2r', 'bb'])), /never open/)
  validateLevelGraph(stacks(['rr', '%2r', 'rbb']))
  assert.throws(() => validateLevelGraph([{ id: 'a', color: R, gate: 1, hidden: true }, { id: 'b', color: R }]), /hidden/)
  assert.throws(() => validateLevelGraph([{ id: 'a', color: R, gate: 0.5 }]), /whole number/)
  assert.throws(() => stacks(['%2s', 'r']), /stone/)
})

// --- The valkyrie -----------------------------------------------------------------------

test('the valkyrie puts the longest-waiting viking last in the queue, with its load', () => {
  const loot = [{ id: 'r1', color: R, blockedBy: ['b1'] }, { id: 'b1', color: B }, { id: 'b2', color: B }, { id: 'r2', color: R }]
  const s1 = selectViking(createGame(loot, [R, VALK, B]), 'v1') // red takes r2 and waits for r1
  assert.deepEqual(s1.waiting.map(w => [w.id, w.collectedCount]), [['v1', 1]])
  const s2 = selectViking(s1, 'v2')
  assert.deepEqual(s2.events.find(e => e.type === 'valkyrie'), { type: 'valkyrie', vikingId: 'v2', carriedId: 'v1' })
  assert.equal(s2.waiting.length, 0, 'the seat is free')
  assert.deepEqual(s2.queue.map(v => [v.id, v.collectedCount]), [['v3', 0], ['v1', 1]])
  assert.equal(s2.waits, 1, 'the valkyrie takes no seat')
  const s3 = selectViking(s2, 'v3')
  const s4 = selectViking(s3, 'v1') // only one slot left: r1 fills it
  assert.equal(s4.status, 'won')
  assert.ok(s4.events.some(e => e.type === 'collect' && e.lootId === 'r1' && e.vikingId === 'v1'))
})

test('the valkyrie only lifts from the main ship; with nobody there she just flies home', () => {
  const ships = [{ slots: 3 }, { slots: 2, color: R }]
  const loot = [{ id: 'x', color: Y, blockedBy: ['b1'] }, { id: 'b1', color: B }, { id: 'r1', color: R, blockedBy: ['x'] }]
  let s = createGame(loot, [R, Y, VALK, B], ships)
  s = pick(s, 'v1', 'v2') // red sits on its own ship, yellow on the main ship
  assert.deepEqual(s.waiting.map(w => [w.id, w.ship]), [['v1', 1], ['v2', 0]])
  s = selectViking(s, 'v3')
  assert.deepEqual(s.events.find(e => e.type === 'valkyrie'), { type: 'valkyrie', vikingId: 'v3', carriedId: 'v2' })
  assert.deepEqual(s.waiting.map(w => w.id), ['v1'])
  const empty = selectViking(createGame([{ id: 'r1', color: R }], [VALK, R]), 'v1')
  assert.deepEqual(empty.events.map(e => e.type), ['dispatch', 'valkyrie', 'return'])
  assert.equal(empty.status, 'playing')
  assert.ok(!findsNothing(createGame([{ id: 'r1', color: R }], [VALK, R]), 'v1'), 'the valkyrie is never dimmed')
})

test('the solver keys the load of a viking back in the queue', () => {
  // The same queue with v1 lifted after one or after zero items must not share a memo entry.
  const level = { loot: stacks(['rrb', 'brr', 'yby']), queue: [R, B, VALK, Y, R, B] as const }
  const s = startGame({ loot: level.loot, queue: [...level.queue] })
  const r = solve(s)
  assert.ok(r.winnable)
  assert.equal(r.winPath!.reduce(selectViking, s).status, 'won')
  assert.equal(winnable(s), true)
  const h = hint(s)
  assert.ok(h && getSelectableVikings(s).some(v => v.id === h))
})

test('validation: a valkyrie needs vikings to lift', () => {
  assert.throws(() => validateLevelGraph([{ id: 'r', color: R }], undefined, [VALK]), /vikings to lift/)
  validateLevelGraph([{ id: 'r', color: R }], undefined, [VALK, R])
})

// --- Levels, generator and modes ------------------------------------------------------

test('mechanicsOf finds gold, gates and the valkyrie', () => {
  const l = { name: '', hint: '', par: 0, loot: stacks(['$r', '%1r', 'rb']), queue: [R, VALK, B] }
  assert.deepEqual(mechanicsOf(l), ['gold', 'gate', 'valkyrie'])
})

test('the generator makes winnable levels with gold, gates and valkyries', () => {
  const specs: Spec[] = [
    { heights: [3, 3, 4], min: 0.05, max: 0.95, gold: 2 },
    { heights: [3, 3, 4], min: 0.05, max: 0.95, gates: 1 },
    { heights: [3, 3, 4], min: 0.05, max: 0.95, valkyries: 1 },
  ]
  for (const spec of specs) {
    const f = generate(spec, 7, 1500)
    assert.ok(f, JSON.stringify(spec))
    const text = f.columns.join(' ')
    if (spec.gold) assert.equal((text.match(/\$/g) ?? []).length, 2)
    if (spec.gates) assert.match(text, /%[23][rby]/)
    if (spec.valkyries) assert.ok(f.queue.some(q => typeof q !== 'string' && q.kind === 'valkyrie'))
    assert.equal(typeof evaluate(spec, f), 'object', 'found levels pass their own check')
  }
})

test('tier 4 (Asgård completed) brings the new mechanics to the generated raids', () => {
  assert.equal(tierFor([true, true, true, true]), 3)
  assert.equal(tierFor([true, true, true, true, true]), 4)
  assert.deepEqual(mechanicsForTier(4).slice(-3), ['gold', 'gate', 'valkyrie'])
  const tier: Tier = 4
  for (const day of ['2026-11-24', '2027-02-03']) {
    const l = dailyLevel(day, tier)
    assert.ok(solve(startGame(l)).winnable, day)
    for (const m of mechanicsOf(l)) assert.ok(mechanicsForTier(tier).includes(m), `${day}: ${m}`)
  }
})
