import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bosses } from './bosses.ts'
import { worlds, startGame } from './levels.ts'
import { validateLevelGraph, selectViking, getSelectableVikings } from './engine.ts'
import { solve } from './solver.ts'

test('one boss per world, each valid and winnable at its par', () => {
  assert.deepEqual(bosses.map(b => b.world), worlds.map((_, i) => i))
  for (const { id, level } of bosses) {
    validateLevelGraph(level.loot, level.ships, level.queue, { raven: level.raven })
    const r = solve(startGame(level))
    assert.ok(r.winnable, `${id} can be won`)
    assert.equal(r.minWaits, level.par, `${id} par`)
    const rate = r.winningLines / (r.winningLines + r.losingLines)
    assert.ok(rate > 0.03 && rate < 0.4, `${id} is a real puzzle (${Math.round(rate * 100)} %)`)
  }
})

test('always sending the front viking loses every boss', () => {
  for (const { id, level } of bosses) {
    let s = startGame(level)
    while (s.status === 'playing') s = selectViking(s, getSelectableVikings(s)[0].id)
    assert.equal(s.status, 'lost', id)
  }
})

test('each boss has its own twist', () => {
  const [serpent, ulvhild, ymer, surt] = bosses.map(b => b.level)
  assert.equal(serpent.ships?.[0].slots, 2, 'the serpent has crushed a seat')
  assert.ok(ulvhild.queue.every(q => typeof q !== 'string' && (q.kind === 'jarl' || q.kind === 'wild')), 'only jarls and Ylva')
  assert.ok(ulvhild.loot.filter(l => l.hidden).length >= 8, 'Ulvhild hides her loot')
  assert.ok(ymer.loot.filter(l => l.frozen).length >= 8, 'Ymer freezes almost everything')
  assert.ok(surt.raven === 4 && surt.loot.some(l => l.keg) && surt.loot.some(l => l.cage) && surt.loot.some(l => l.tidePile !== undefined))
})
