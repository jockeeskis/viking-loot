import { test } from 'node:test'
import assert from 'node:assert/strict'
import { starsFor, parseProgress, recordWin, emptyProgress, recordBossWin, bossUnlocked, seeStory } from './progress.ts'
import { mechanicsOf } from './intros.ts'
import { levels, house, stone, jarl, WILD, startGame } from './levels.ts'
import { createGame } from './engine.ts'
import { solve } from './solver.ts'

test('stars follow par', () => {
  assert.equal(starsFor(0, 0), 3)
  assert.equal(starsFor(1, 1), 3)
  assert.equal(starsFor(2, 1), 2)
  assert.equal(starsFor(3, 1), 1)
})

test('every level stores the par the solver finds', () => {
  for (const l of levels) assert.equal(l.par, solve(startGame(l)).minWaits, l.name)
})

test('progress parsing tolerates junk and migrates 0.2 unlocks', () => {
  assert.deepEqual(parseProgress(null, null), emptyProgress())
  assert.deepEqual(parseProgress('not json', null), emptyProgress())
  const migrated = parseProgress(null, '4')
  assert.equal(migrated.unlocked, 4)
  assert.deepEqual(migrated.stars, [1, 1, 1, 1])
  const p = parseProgress(JSON.stringify({ unlocked: 2, stars: [3, 9, 'x'], seenIntros: ['house', 7] }), '11')
  assert.deepEqual(p, { unlocked: 2, stars: [3, 3, 0], seenIntros: ['house'], bossStars: [], seenStory: [] }, 'the 0.3 key wins over the old one')
  // 0.5 fields: missing in old saves, junk is cleaned.
  const q = parseProgress(JSON.stringify({ unlocked: 1, stars: [2], bossStars: [3, 'x', 7], seenStory: ['start', 5] }), null)
  assert.deepEqual(q.bossStars, [3, 0, 3])
  assert.deepEqual(q.seenStory, ['start'])
})

test('boss wins keep the best stars and never move the level unlocks', () => {
  let p = recordBossWin(emptyProgress(), 2, 2)
  assert.deepEqual(p.bossStars, [0, 0, 2])
  p = recordBossWin(p, 2, 1)
  assert.deepEqual(p.bossStars, [0, 0, 2], 'a worse win does not lower the stars')
  p = recordBossWin(p, 0, 3)
  assert.deepEqual(p.bossStars, [3, 0, 2])
  assert.equal(p.unlocked, 0)
  assert.ok(!bossUnlocked(emptyProgress(), 11))
  assert.ok(bossUnlocked(recordWin(emptyProgress(), 11, 1, levels.length), 11), 'open once the world\'s last level is won')
})

test('story cards are remembered once', () => {
  const p = seeStory(emptyProgress(), 'start')
  assert.deepEqual(p.seenStory, ['start'])
  assert.equal(seeStory(p, 'start'), p)
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

test('Fjordarna, Isriket and Muspelheim introduce each mechanic on a level that cannot be lost, then use it in a puzzle', () => {
  assert.equal(levels.length, 48)
  const intros: [number, string][] = [
    [12, 'house'], [14, 'stone'], [16, 'jarl'], [18, 'wild'], [20, 'hidden'], // Fjordarna
    [24, 'key'], [26, 'ice'], [28, 'ships'], [30, 'scout'], // Isriket
    [36, 'keg'], [38, 'tide'], [40, 'cage'], [42, 'raven'], // Muspelheim
  ]
  const seen = new Set<string>()
  levels.slice(0, 12).forEach(l => mechanicsOf(l).forEach(m => seen.add(m)))
  assert.equal(seen.size, 0, 'Kusten uses none of the new mechanics')
  for (const [i, m] of intros) {
    const l = levels[i]
    const fresh = mechanicsOf(l).filter(x => !seen.has(x))
    assert.deepEqual(fresh, [m], `${l.name} introduces exactly ${m}`)
    fresh.forEach(x => seen.add(x))
    assert.equal(solve(startGame(l)).lossPath, null, `${l.name} cannot be lost`)
    const puzzle = levels[i + 1]
    assert.ok(mechanicsOf(puzzle).includes(m as never), `${puzzle.name} uses ${m}`)
    assert.ok(solve(startGame(puzzle)).lossPath, `${puzzle.name} can be lost`)
  }
  for (const l of [...levels.slice(22, 24), ...levels.slice(33, 36), ...levels.slice(44)]) assert.ok(mechanicsOf(l).length >= 3, `${l.name} mixes mechanics`)
  assert.ok(mechanicsOf(levels[32]).length >= 2, `${levels[32].name} mixes mechanics`)
})
