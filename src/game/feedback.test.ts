import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createGame, selectViking, type GameState, type LootColor } from './engine.ts'
import { levels, stacks, startGame } from './levels.ts'
import { solve, winnable } from './solver.ts'
import { lossExplanation, fatalMove, blockReason, findsNothing } from './feedback.ts'
import { wantsTutorial, nextStep, TUTORIAL_ID } from './tutorial.ts'
import { emptyProgress } from './progress.ts'
import { say, setLang } from './i18n.ts'

const R: LootColor = 'red', B: LootColor = 'blue', Y: LootColor = 'yellow'
const statesOf = (start: GameState, path: string[]) => path.reduce<GameState[]>((a, id) => [...a, selectViking(a[a.length - 1], id)], [start])

test('a full ship names the colours the waiting vikings wanted', () => {
  const s = statesOf(createGame([{ id: 'r1', color: R }], [B, Y, B, R]), ['v1', 'v2', 'v3']).pop()!
  assert.equal(s.lossReason, 'slots-full')
  const x = lossExplanation(s)!
  assert.equal(x.key, 'loss.fullWant')
  assert.deepEqual(x.colors, ['blue', 'yellow'])
  setLang('sv')
  assert.equal(say(x), 'Skeppet blev fullt. De väntande vikingarna ville ha blått och gult, men inget sådant byte gick att nå.')
  setLang('en')
  assert.match(say(x), /wanted blue and yellow/)
  setLang('sv')
})

test('running out of vikings tells how much loot was left', () => {
  const s = selectViking(createGame([{ id: 'r1', color: R }, { id: 'r2', color: R }, { id: 'r3', color: R }], [R]), 'v1')
  assert.equal(s.lossReason, 'stuck')
  const x = lossExplanation(s)!
  assert.deepEqual(x.params, { n: 1 })
  assert.equal(say(x), 'Kön tog slut med 1 skatt kvar på ön.')
  assert.equal(lossExplanation(createGame([{ id: 'r1', color: R }], [R])), null, 'nothing to explain while playing')
})

test('the fatal move is the last one after which the raid could still be won', () => {
  const losable = levels.map((l, i) => ({ l, i })).filter(({ l }) => solve(startGame(l)).lossPath).map(x => x.i)
  for (const i of [losable[0], losable[10], losable[25], losable[losable.length - 1]]) {
    const start = startGame(levels[i])
    const states = statesOf(start, solve(start).lossPath!)
    const m = fatalMove(states)!
    assert.ok(m !== null && m < states.length - 1, `level ${i + 1}`)
    assert.ok(winnable(states[m]), 'still winnable before the move')
    assert.ok(!winnable(states[m + 1]), 'lost for good after it')
  }
  // A raid that never could be won has no fatal move.
  const hopeless = createGame([{ id: 'r1', color: R }, { id: 'r2', color: R }, { id: 'r3', color: R }], [R])
  assert.equal(fatalMove([hopeless, selectViking(hopeless, 'v1')]), null)
})

test('winnable() agrees with the full solver', () => {
  for (const l of levels.slice(0, 12)) assert.equal(winnable(startGame(l)), solve(startGame(l)).winnable)
})

test('tapping an item explains what keeps it', () => {
  // Piles back→front: an iced red behind a blue; a key; a locked chest; a blue behind a stone and a red.
  const s = startGame({ name: '', hint: '', par: 0, queue: [B, R, Y, Y], loot: stacks(['~2rb', '!y', '#y', 'bsr']) })
  const front = s.loot.find(l => l.id === 'c1-2')!
  assert.equal(blockReason(s, front.id)?.key, 'block.free')
  assert.deepEqual(blockReason(s, front.id)?.who, { kind: 'normal', color: 'blue' })
  assert.deepEqual(blockReason(s, 'c1-1'), { key: 'block.ice', params: { n: 2 } })
  assert.equal(blockReason(s, 'c3-1')?.key, 'block.lock')
  assert.equal(blockReason(s, 'c4-1')?.key, 'block.under')
  assert.equal(blockReason(s, 'c4-2')?.key, 'block.stone')
  assert.equal(blockReason(s, 'nope'), null)
  setLang('sv')
  assert.equal(say(blockReason(s, front.id)!), '✅ Kan tas nu av en blå viking.')
})

test('a viking that would find nothing is spotted', () => {
  const s = createGame([{ id: 'r1', color: R }, { id: 'b1', color: B, blockedBy: ['r1'] }], [B, R, Y, { kind: 'scout' }])
  assert.ok(findsNothing(s, 'v1'), 'blue is behind red')
  assert.ok(!findsNothing(s, 'v2'))
  assert.ok(findsNothing(s, 'v3'))
  assert.ok(!findsNothing(selectViking(s, 'v2'), 'v1'), 'after red the blue is free')
  assert.ok(!findsNothing(s, 'v4'), 'a scout is never marked')
})

test('the guided first raid: only for new players on level 1, one move then three cards', () => {
  const p = emptyProgress()
  assert.ok(wantsTutorial(p, 0))
  assert.ok(!wantsTutorial(p, 1))
  assert.ok(!wantsTutorial(p, null))
  assert.ok(!wantsTutorial({ ...p, stars: [1] }, 0), 'level 1 already won')
  assert.ok(!wantsTutorial({ ...p, seenStory: [TUTORIAL_ID] }, 0), 'done or skipped')
  assert.equal(nextStep('send', 'ok'), 'send', 'the first step waits for a move')
  assert.equal(nextStep('send', 'moved'), 'carry')
  assert.equal(nextStep('carry', 'moved'), 'carry')
  assert.equal(nextStep('carry', 'ok'), 'seats')
  assert.equal(nextStep('seats', 'ok'), 'goal')
  assert.equal(nextStep('goal', 'ok'), null)
})
