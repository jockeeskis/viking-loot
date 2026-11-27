import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EVENTS, activeEvent, eventYear, eventKey, eventDaysLeft, eventLevel, inRange } from './events.ts'
import {
  weekKey, daysLeftInWeek, weeklyLevel, recordWeeklyWin, weekDone, recordEventWin, eventDone, parseModes, emptyModes,
  WEEKLY_ISLANDS, EVENT_ISLANDS,
} from './modes.ts'
import { COSMETICS, WEEKLY_REWARDS, weeklyReward, grant, owns, type OwnCtx } from './cosmetics.ts'
import { RELICS } from './relics.ts'
import { emptyMeta } from './achievements.ts'
import { startGame } from './levels.ts'
import { validateLevelGraph } from './engine.ts'
import { solve, winnable } from './solver.ts'

const day = (s: string) => new Date(`${s}T12:00:00`)

test('events follow the calendar, also across new year', () => {
  assert.equal(activeEvent(day('2026-12-01'))?.id, 'midvinterblot')
  assert.equal(activeEvent(day('2027-01-06'))?.id, 'midvinterblot')
  assert.equal(activeEvent(day('2027-01-07')), null)
  assert.equal(activeEvent(day('2026-03-01'))?.id, 'varblot')
  assert.equal(activeEvent(day('2026-04-30'))?.id, 'varblot')
  assert.equal(activeEvent(day('2026-05-15')), null)
  assert.equal(activeEvent(day('2026-06-24'))?.id, 'midsommar')
  assert.equal(activeEvent(day('2026-11-27'))?.id, 'alvablot')
  assert.equal(activeEvent(day('2026-05-15'), 'midsommar')?.id, 'midsommar', 'forced in development')
  assert.equal(activeEvent(day('2026-05-15'), 'nope'), null)
  assert.ok(inRange('12-31', '12-01', '01-06') && inRange('01-01', '12-01', '01-06') && !inRange('06-01', '12-01', '01-06'))
  // January still belongs to last December's Midvinterblot
  const mv = EVENTS[0]
  assert.equal(eventYear(mv, day('2026-12-20')), 2026)
  assert.equal(eventYear(mv, day('2027-01-02')), 2026)
  assert.equal(eventKey(mv, 2026), 'midvinterblot-2026')
  assert.equal(eventDaysLeft(mv, day('2026-12-01')), 37)
  assert.equal(eventDaysLeft(mv, day('2027-01-06')), 1)
  assert.equal(eventDaysLeft(EVENTS[3], day('2026-11-27')), 4)
  // no two events overlap
  for (let m = 1; m <= 12; m++) for (let d = 1; d <= 31; d++) {
    const md = `${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    assert.ok(EVENTS.filter(e => inRange(md, e.from, e.to)).length <= 1, md)
  }
})

test('ISO weeks and the days left of a week', () => {
  assert.equal(weekKey(day('2026-11-27')), '2026-W48')
  assert.equal(weekKey(day('2026-11-23')), '2026-W48', 'Monday')
  assert.equal(weekKey(day('2026-11-29')), '2026-W48', 'Sunday')
  assert.equal(weekKey(day('2027-01-01')), '2026-W53', '2026 has 53 weeks')
  assert.equal(weekKey(day('2027-01-04')), '2027-W01')
  assert.equal(daysLeftInWeek(day('2026-11-23')), 7)
  assert.equal(daysLeftInWeek(day('2026-11-27')), 3)
  assert.equal(daysLeftInWeek(day('2026-11-29')), 1)
})

test('the week\'s islands are the same for everyone and winnable', () => {
  for (const step of [0, 1, 2]) {
    const a = weeklyLevel('2026-W48', step, 2)
    assert.deepEqual(weeklyLevel('2026-W48', step, 2), a, `island ${step} is seeded by the week`)
    assert.ok(winnable(startGame(a)), `island ${step} can be won`)
  }
  assert.notDeepEqual(weeklyLevel('2026-W49', 0, 2), weeklyLevel('2026-W48', 0, 2), 'a new week, new islands')
})

test('every event: the generated islands and the handmade finale are winnable', () => {
  for (const e of EVENTS) {
    for (let i = 0; i < EVENT_ISLANDS - 1; i++) {
      const l = eventLevel(e.id, 2026, i, 4)
      assert.deepEqual(eventLevel(e.id, 2026, i, 4), l, `${e.id} ${i} is seeded`)
      assert.ok(winnable(startGame(l)), `${e.id} island ${i + 1}`)
    }
    const f = e.finale
    assert.equal(eventLevel(e.id, 2026, EVENT_ISLANDS - 1, 0), f)
    validateLevelGraph(f.loot, f.ships, f.queue, { raven: f.raven })
    const r = solve(startGame(f))
    assert.ok(r.winnable, `${e.id} finale`)
    assert.equal(r.minWaits, f.par, `${e.id} finale par`)
  }
})

test('weekly and event results are saved, and old saves still load', () => {
  let p = recordWeeklyWin(emptyModes(), '2026-W48', 0, 2)
  p = recordWeeklyWin(p, '2026-W48', 0, 1)
  assert.deepEqual(p.weekly['2026-W48'], [2, 0, 0], 'the best stars are kept')
  assert.ok(!weekDone(p, '2026-W48'))
  p = recordWeeklyWin(recordWeeklyWin(p, '2026-W48', 1, 3), '2026-W48', 2, 1)
  assert.ok(weekDone(p, '2026-W48'))
  let q = emptyModes()
  for (let i = 0; i < EVENT_ISLANDS; i++) { assert.ok(!eventDone(q, 'midvinterblot-2026')); q = recordEventWin(q, 'midvinterblot-2026', i, 1) }
  assert.ok(eventDone(q, 'midvinterblot-2026'))
  assert.deepEqual(parseModes(JSON.stringify({ ...p, events: q.events })), { ...p, events: q.events })
  const old = parseModes(JSON.stringify({ daily: { results: {}, lastWon: null, streak: 0, bestStreak: 0 }, endless: { best: 3, runs: 2 } }))
  assert.deepEqual([old.weekly, old.events, old.endless.best], [{}, {}, 3])
  const junk = parseModes(JSON.stringify({ weekly: { x: [1], '2026-W48': [9, 'a'] }, events: { 'midvinterblot-2026': 'no' } }))
  assert.deepEqual([junk.weekly, junk.events], [{ '2026-W48': [3, 0, 0] }, {}])
  assert.equal(WEEKLY_ISLANDS, 3)
})

test('rewards: every event and weekly reward exists, and each is given once', () => {
  const ids = [...COSMETICS, ...RELICS]
  for (const e of EVENTS) {
    for (const id of e.rewards) {
      const x = ids.find(y => y.id === id)
      assert.ok(x && x.source.kind === 'event' && x.source.id === e.id, `${e.id} gives ${id}`)
    }
  }
  // the rotation holds every weekly item, and nothing else
  const weekly = ids.filter(x => x.source.kind === 'weekly').map(x => x.id).sort()
  assert.deepEqual([...WEEKLY_REWARDS].sort(), weekly)
  assert.ok(WEEKLY_REWARDS.includes(weeklyReward('2026-W48')))
  const ctx = (owned: string[]): OwnCtx => ({ unlocked: {}, owned, bossStars: [] })
  let m = grant(emptyMeta(), EVENTS[0].rewards)
  assert.ok(EVENTS[0].rewards.every(id => owns(id, ctx(m.owned))))
  assert.equal(grant(m, EVENTS[0].rewards), m, 'given once')
  m = grant(m, [weeklyReward('2026-W48')])
  assert.equal(m.owned.length, 3)
})
