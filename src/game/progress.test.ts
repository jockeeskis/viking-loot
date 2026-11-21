import { test } from 'node:test'
import assert from 'node:assert/strict'
import { starsFor, parseProgress, recordWin, emptyProgress } from './progress.ts'
import { mechanicsOf } from './intros.ts'
import { levels, house, stone, jarl, WILD } from './levels.ts'
import { createGame } from './engine.ts'
import { solve } from './solver.ts'

test('stars follow par', () => {
  assert.equal(starsFor(0, 0), 3)
  assert.equal(starsFor(1, 1), 3)
  assert.equal(starsFor(2, 1), 2)
  assert.equal(starsFor(3, 1), 1)
})

test('every level stores the par the solver finds', () => {
  for (const l of levels) assert.equal(l.par, solve(createGame(l.loot, l.queue)).minWaits, l.name)
})

test('progress parsing tolerates junk and migrates 0.2 unlocks', () => {
  assert.deepEqual(parseProgress(null, null), emptyProgress())
  assert.deepEqual(parseProgress('not json', null), emptyProgress())
  const migrated = parseProgress(null, '4')
  assert.equal(migrated.unlocked, 4)
  assert.deepEqual(migrated.stars, [1, 1, 1, 1])
  const p = parseProgress(JSON.stringify({ unlocked: 2, stars: [3, 9, 'x'], seenIntros: ['house', 7] }), '11')
  assert.deepEqual(p, { unlocked: 2, stars: [3, 3, 0], seenIntros: ['house'] }, 'the 0.3 key wins over the old one')
})

test('recordWin keeps the best stars and unlocks the next level', () => {
  let p = recordWin(emptyProgress(), 0, 2, 12)
  assert.deepEqual([p.unlocked, p.stars], [1, [2]])
  p = recordWin(p, 0, 1, 12)
  assert.deepEqual(p.stars, [2], 'a worse result never lowers the stars')
  p = recordWin(p, 3, 3, 12)
  assert.deepEqual([p.unlocked, p.stars], [4, [2, 0, 0, 3]])
  assert.equal(recordWin(p, 11, 3, 12).unlocked, 11, 'never past the last level')
})

test('mechanicsOf finds the new mechanics in a level', () => {
  assert.deepEqual(mechanicsOf(levels[0]), [])
  const l = {
    ...levels[0],
    queue: [jarl('red'), WILD],
    loot: [house('h', 'red', [0, 0]), stone('s', [1, 0], ['h']), { id: 'x', color: 'blue' as const, at: [2, 0] as [number, number], hidden: true }],
  }
  assert.deepEqual(mechanicsOf(l), ['house', 'stone', 'jarl', 'wild', 'hidden'])
})
