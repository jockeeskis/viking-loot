import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ACHIEVEMENTS, SHIPS, emptyMeta, emptyStats, migrate, newlyEarned, unlock, recordRaid, lootOf, parseMeta,
  totalStars, unlockedShips, type Ctx, type RaidResult,
} from './achievements.ts'
import { emptyProgress, type Progress } from './progress.ts'
import { emptyModes, recordDailyWin, recordEndlessRound } from './modes.ts'
import { levels } from './levels.ts'

const ctx = (over: Partial<Ctx> = {}): Ctx => ({ stats: emptyStats(), progress: emptyProgress(), modes: emptyModes(), ...over })
const earned = (c: Ctx) => ACHIEVEMENTS.filter(a => a.done(c)).map(a => a.id)
const progressWith = (stars: number[]): Progress => ({ ...emptyProgress(), stars, unlocked: stars.length })
const win = (over: Partial<RaidResult> = {}): RaidResult =>
  ({ mode: 'campaign', stars: 2, par: 1, loot: 12, chests: 0, kegs: 0, usedUndo: false, usedHint: false, ...over })

test('achievements have unique ids, and nothing is earned from a fresh start', () => {
  assert.equal(new Set(ACHIEVEMENTS.map(a => a.id)).size, ACHIEVEMENTS.length)
  assert.ok(ACHIEVEMENTS.length >= 15)
  assert.deepEqual(earned(ctx()), [])
})

test('each achievement is unlocked by its own event', () => {
  const after = (stats = emptyStats()) => earned(ctx({ stats }))
  assert.deepEqual(after(recordRaid(emptyStats(), win())), ['first-raid'])
  let s = emptyStats()
  for (let i = 0; i < 9; i++) s = recordRaid(s, win({ stars: 3, loot: 11 }))
  assert.ok(!after(s).includes('perfect-10') && !after(s).includes('loot-100'))
  s = recordRaid(s, win({ stars: 3, loot: 11 }))
  assert.ok(after(s).includes('perfect-10') && after(s).includes('loot-100'), '10 perfect raids, 110 loot')
  assert.ok(after(recordRaid(emptyStats(), win({ par: 2 }))).includes('clean'))
  assert.ok(!after(recordRaid(emptyStats(), win({ par: 2, usedUndo: true }))).includes('clean'), 'undo spoils a clean win')
  assert.ok(!after(recordRaid(emptyStats(), win({ par: 2, usedHint: true }))).includes('clean'), 'a hint spoils it too')
  assert.ok(!after(recordRaid(emptyStats(), win({ par: 1 }))).includes('clean'), 'only puzzles with par 2+')
  assert.ok(after(recordRaid(emptyStats(), win({ chests: 10 }))).includes('chests-10'))
  assert.ok(after(recordRaid(emptyStats(), win({ mode: 'daily' }))).includes('daily-1'))

  const kusten = progressWith(Array(12).fill(1))
  assert.ok(earned(ctx({ progress: kusten })).includes('kusten'))
  assert.ok(!earned(ctx({ progress: kusten })).includes('gold-coast'))
  assert.ok(earned(ctx({ progress: progressWith(Array(12).fill(3)) })).includes('gold-coast'))
  const all = earned(ctx({ progress: progressWith(Array(levels.length).fill(3)) }))
  for (const id of ['kusten', 'fjordarna', 'isriket', 'muspelheim', 'asgard', 'gold-coast', 'all-gold']) assert.ok(all.includes(id), id)
  assert.ok(after(recordRaid(emptyStats(), win({ kegs: 25 }))).includes('kegs-25'))
  const bossesWon = (b: number[]) => earned(ctx({ progress: { ...emptyProgress(), bossStars: b } }))
  assert.ok(!bossesWon([1, 1, 1, 1]).includes('boss-hunter'), 'since 0.6 Loke counts too')
  assert.ok(bossesWon([1, 1, 1, 1, 1]).includes('boss-hunter') && !bossesWon([1, 1, 1, 1, 1]).includes('ragnarok'))
  assert.ok(!bossesWon([3, 3, 3, 3]).includes('ragnarok'))
  assert.ok(bossesWon([3, 3, 3, 3, 3]).includes('ragnarok'))

  let m = emptyModes()
  for (let d = 1; d <= 7; d++) m = recordDailyWin(m, `2026-12-0${d}`, 2)
  assert.ok(earned(ctx({ modes: m })).includes('streak-7'))
  assert.ok(earned(ctx({ modes: recordEndlessRound(emptyModes(), 5) })).includes('endless-5'))
  assert.ok(!earned(ctx({ modes: recordEndlessRound(emptyModes(), 9) })).includes('endless-10'))
  assert.ok(earned(ctx({ modes: recordEndlessRound(emptyModes(), 10) })).includes('endless-10'))
})

test('new achievements are reported once', () => {
  const c = ctx({ stats: recordRaid(emptyStats(), win()) })
  let meta = emptyMeta()
  assert.deepEqual(newlyEarned(meta, c), ['first-raid'])
  meta = unlock(meta, newlyEarned(meta, c), '2026-11-22')
  assert.deepEqual(newlyEarned(meta, c), [])
  assert.equal(meta.unlocked['first-raid'], '2026-11-22')
})

test('counting achievements show their progress', () => {
  const loot = ACHIEVEMENTS.find(a => a.id === 'loot-500')!
  assert.deepEqual(loot.progress!(ctx({ stats: { ...emptyStats(), lootTaken: 123 } })), [123, 500])
  assert.deepEqual(loot.progress!(ctx({ stats: { ...emptyStats(), lootTaken: 900 } })), [500, 500])
})

test('ships unlock with total stars', () => {
  assert.deepEqual(unlockedShips(emptyProgress()), ['ormen'])
  assert.equal(totalStars(progressWith([3, 3, 2, 0, 1])), 9)
  assert.deepEqual(unlockedShips(progressWith(Array(10).fill(3))), ['ormen', 'havsorn'])
  assert.deepEqual(unlockedShips(progressWith(Array(60).fill(3))), SHIPS.map(s => s.id))
  assert.ok(!unlockedShips(progressWith(Array(54).fill(3))).includes('gyllene'), 'Gyllene Draken needs 165 stars')
  assert.ok(unlockedShips({ ...progressWith(Array(54).fill(3)), bossStars: [3] }).includes('gyllene'))
  assert.ok(!unlockedShips(progressWith(Array(36).fill(3))).includes('surt'), 'Surtsglöd needs 130 stars')
  assert.equal(totalStars({ ...progressWith([3, 2]), bossStars: [3, 1] }), 9, 'boss stars count too')
})

test('0.3 progress is migrated into the statistics once', () => {
  const p = progressWith([3, 2, 3, ...Array(21).fill(0), 1]) // levels 1–3 and 25 (with a locked chest)
  const modes = recordDailyWin(emptyModes(), '2026-11-21', 3)
  const m = migrate(emptyMeta(), p, modes)
  const expectLoot = [0, 1, 2, 24].reduce((a, i) => a + lootOf(levels[i]).loot, 0)
  assert.deepEqual(m.stats, { raidsWon: 4, lootTaken: expectLoot, perfectRaids: 2, chestsOpened: 1, cleanWins: 0, dailyWins: 1, kegsBlown: 0 })
  assert.equal(migrate(m, p, modes), m, 'only once')
  const c = { stats: m.stats, progress: p, modes }
  assert.ok(newlyEarned(m, c).includes('first-raid') && newlyEarned(m, c).includes('daily-1'))
})

test('saved meta data tolerates junk', () => {
  const m = unlock({ ...emptyMeta(), ship: 'havsorn', migrated: true, stats: { ...emptyStats(), raidsWon: 5 } }, ['first-raid'], '2026-11-22')
  assert.deepEqual(parseMeta(JSON.stringify(m)), m)
  assert.deepEqual(parseMeta('nope'), emptyMeta())
  const odd = parseMeta(JSON.stringify({ stats: { raidsWon: -4, lootTaken: 'x' }, unlocked: { 'first-raid': 1, fake: 'a' }, ship: 'titanic' }))
  assert.deepEqual(odd, emptyMeta())
})
