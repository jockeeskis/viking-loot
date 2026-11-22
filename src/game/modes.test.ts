import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createGame, getSelectableVikings, selectViking } from './engine.ts'
import { solve } from './solver.ts'
import { mechanicsOf } from './intros.ts'
import {
  dateKey, previousDay, dailyLevel, endlessLevel, mechanicsForTier, tierFor, evenHits, daySeed, dailySpec,
  emptyModes, parseModes, recordDailyWin, currentStreak, startEndlessRun, recordEndlessRound, type Tier,
} from './modes.ts'
import { hashString } from './generator.ts'
import { startGame, type Level } from './levels.ts'

const days = Array.from({ length: 8 }, (_, d) => dateKey(new Date(2026, 10, 25 + d))) // crosses into December

function checkLevel(l: Level, tier: Tier) {
  const r = solve(startGame(l))
  assert.ok(r.winnable, `${l.name} can be won`)
  assert.equal(l.par, r.minWaits, `${l.name}: par matches the solver`)
  const allowed = mechanicsForTier(tier)
  for (const m of mechanicsOf(l)) assert.ok(allowed.includes(m), `${l.name}: ${m} belongs to a completed world (tier ${tier})`)
}

test('dates: local day keys and the day before, across months and years', () => {
  assert.equal(dateKey(new Date(2026, 0, 5, 23, 59)), '2026-01-05')
  assert.equal(previousDay('2026-12-01'), '2026-11-30')
  assert.equal(previousDay('2027-01-01'), '2026-12-31')
  assert.equal(previousDay('2028-03-01'), '2028-02-29')
  assert.equal(hashString('abc'), hashString('abc'))
  assert.notEqual(daySeed('2026-11-21', 1), daySeed('2026-11-22', 1))
  assert.notEqual(daySeed('2026-11-21', 1), daySeed('2026-11-21', 2))
})

test('tiers: only completed worlds give mechanics', () => {
  assert.equal(tierFor([false, false, false]), 0)
  assert.equal(tierFor([true, false, false]), 0) // Kusten has no mechanics of its own
  assert.equal(tierFor([true, true, false]), 1)
  assert.equal(tierFor([true, true, true]), 2)
  assert.deepEqual(mechanicsForTier(0), [])
  assert.ok(mechanicsForTier(1).includes('house') && !mechanicsForTier(1).includes('key'))
})

test('specs always give an even number of hits', () => {
  for (const day of days) for (const tier of [0, 1, 2] as Tier[]) {
    const s = dailySpec(tier, daySeed(day, tier))
    const total = s.heights.reduce((a, b) => a + b, 0) - (s.stones ?? 0) + (s.houses ?? 0) + (s.jarls ?? 0)
    assert.equal(total % 2, 0, JSON.stringify(s))
  }
  assert.deepEqual(evenHits({ heights: [4, 4, 4, 4], min: 0, max: 1, houses: 1 }, 3, 4).heights, [3, 4, 4, 4])
})

test('Dagens räd is the same for the same day and tier, and always winnable', () => {
  for (const tier of [0, 1, 2] as Tier[]) {
    const seen = new Set<string>()
    for (const day of days) {
      const a = dailyLevel(day, tier)
      assert.deepEqual(dailyLevel(day, tier), a, 'same day, same level')
      checkLevel(a, tier)
      seen.add(JSON.stringify(a.loot))
    }
    assert.ok(seen.size >= days.length - 1, 'a new island (almost) every day')
  }
})

test('the endless raid is winnable round after round, and seeded by the run', () => {
  for (const tier of [0, 2] as Tier[]) {
    for (let round = 1; round <= 8; round++) checkLevel(endlessLevel(round, tier, 4242), tier)
  }
  assert.deepEqual(endlessLevel(3, 1, 99), endlessLevel(3, 1, 99))
  assert.notDeepEqual(endlessLevel(3, 1, 99).loot, endlessLevel(3, 1, 100).loot)
})

test('generated puzzles cannot be won by always sending the front viking', () => {
  let puzzles = 0
  for (const day of days) {
    const l = dailyLevel(day, 1)
    let s = startGame(l)
    while (s.status === 'playing') s = selectViking(s, getSelectableVikings(s)[0].id)
    if (s.status === 'lost') puzzles++
  }
  assert.ok(puzzles >= days.length - 1, `${puzzles}/${days.length} daily raids are real puzzles`)
})

test('daily streak: first win of a day counts, gaps break the streak', () => {
  let p = emptyModes()
  p = recordDailyWin(p, '2026-11-29', 2)
  p = recordDailyWin(p, '2026-11-30', 3)
  p = recordDailyWin(p, '2026-12-01', 1)
  assert.equal(p.daily.streak, 3)
  assert.equal(recordDailyWin(p, '2026-12-01', 3), p, 'a second win the same day changes nothing')
  assert.equal(currentStreak(p, '2026-12-01'), 3)
  assert.equal(currentStreak(p, '2026-12-02'), 3, 'still alive the next day')
  assert.equal(currentStreak(p, '2026-12-03'), 0, 'broken after a missed day')
  p = recordDailyWin(p, '2026-12-05', 3)
  assert.deepEqual([p.daily.streak, p.daily.bestStreak, p.daily.results['2026-11-30']], [1, 3, 3])
})

test('endless record and saved data tolerate junk', () => {
  let p = startEndlessRun(emptyModes())
  p = recordEndlessRound(p, 4)
  p = recordEndlessRound(startEndlessRun(p), 2)
  assert.deepEqual(p.endless, { best: 4, runs: 2 })
  assert.deepEqual(parseModes(JSON.stringify(p)), p)
  assert.deepEqual(parseModes('{bad json'), emptyModes())
  const odd = parseModes(JSON.stringify({ daily: { results: { x: 2, '2026-01-01': 9 }, streak: -3 }, endless: { best: 'a' } }))
  assert.deepEqual(odd.daily.results, { '2026-01-01': 3 })
  assert.equal(odd.daily.streak, 0)
  assert.equal(odd.endless.best, 0)
})

test('the generator builds winnable levels with kegs, tide, cages and the raven', async () => {
  const { generate, toLevel } = await import('./generator.ts')
  const { validateLevelGraph } = await import('./engine.ts')
  const { mechanicsOf } = await import('./intros.ts')
  const specs = [
    { want: 'keg', spec: { heights: [3, 3, 3, 3], stones: 2, kegs: 1, min: 0.2, max: 0.7 } },
    { want: 'tide', spec: { heights: [3, 4, 3], tides: 1, min: 0.2, max: 0.95 } },
    { want: 'cage', spec: { heights: [4, 4, 4], cages: 1, min: 0.2, max: 0.7 } },
    { want: 'raven', spec: { heights: [4, 4, 4], raven: 3, min: 0.2, max: 0.7 } },
  ] as const
  for (const { want, spec } of specs) {
    const f = generate({ ...spec, heights: [...spec.heights] }, 7, 4000)
    assert.ok(f, `found a ${want} level`)
    const l = toLevel(f!, want, '')
    validateLevelGraph(l.loot, l.ships, l.queue, { raven: l.raven })
    assert.ok(mechanicsOf(l).includes(want), `${want} is used`)
    const r = solve(startGame(l))
    assert.ok(r.winnable && r.minWaits === l.par)
  }
})
