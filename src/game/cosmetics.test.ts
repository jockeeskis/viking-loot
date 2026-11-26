import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  COSMETICS, DEFAULT_SAIL, DEFAULT_SHIELDS, equip, grant, owns, allOwned, overlayOf, type OwnCtx,
} from './cosmetics.ts'
import { RELICS } from './relics.ts'
import { ACHIEVEMENTS, emptyMeta, parseMeta } from './achievements.ts'
import { bosses } from './bosses.ts'
import { MANIFEST } from './assets.generated.ts'

const ctx = (o: Partial<OwnCtx> = {}): OwnCtx => ({ unlocked: {}, owned: [], bossStars: [], ...o })

test('cosmetics and relics: unique ids, real sources and an overlay sheet for every cosmetic', () => {
  const ids = [...COSMETICS, ...RELICS].map(x => x.id)
  assert.equal(new Set(ids).size, ids.length)
  for (const c of COSMETICS) {
    assert.ok(c.id.startsWith(`${c.slot}-`), `${c.id} is named after its slot`)
    if (c.source.kind === 'achievement') assert.ok(ACHIEVEMENTS.some(a => a.id === (c.source as { id: string }).id), c.id)
    if (c.source.kind !== 'default') {
      const [slot, ...key] = c.id.split('-')
      assert.ok(MANIFEST.cosmetics?.[slot as 'sail' | 'shields']?.[key.join('-')], `${c.id} has an overlay sheet`)
    }
  }
  for (const r of RELICS) if (r.source.kind === 'boss') assert.ok(bosses.some(b => b.id === (r.source as { id: string }).id), r.id)
  // every boss leaves a relic
  for (const b of bosses) assert.ok(RELICS.some(r => r.source.kind === 'boss' && r.source.id === b.id), b.id)
  // one reward per achievement at most (the list shows a single 🎁)
  const achs = COSMETICS.flatMap(c => (c.source.kind === 'achievement' ? [c.source.id] : []))
  assert.equal(new Set(achs).size, achs.length)
})

test('ownership follows achievements, bosses and granted ids', () => {
  assert.ok(owns(DEFAULT_SAIL, ctx()) && owns(DEFAULT_SHIELDS, ctx()))
  assert.ok(!owns('sail-rutor', ctx()))
  assert.ok(owns('sail-rutor', ctx({ unlocked: { 'first-raid': '2026-11-26' } })))
  const surt = bosses.find(b => b.id === 'surt')!
  const stars: number[] = []
  stars[surt.world] = 1
  assert.ok(owns('relic-glod', ctx({ bossStars: stars })))
  assert.ok(!owns('relic-mask', ctx({ bossStars: stars })))
  assert.ok(!owns('relic-julbock', ctx()))
  assert.ok(owns('relic-julbock', ctx({ owned: ['relic-julbock'] })))
  assert.ok(!owns('nope', ctx({ owned: ['nope'] })))
  assert.deepEqual(allOwned(ctx()), [DEFAULT_SAIL, DEFAULT_SHIELDS])
})

test('equip only puts on owned cosmetics, in their own slot', () => {
  const m = emptyMeta()
  assert.equal(equip(m, 'sail-rutor', ctx()), m, 'not owned')
  assert.equal(equip(m, 'relic-glod', ctx()), m, 'a relic is not worn')
  assert.equal(equip(m, 'whatever', ctx()), m)
  const c = ctx({ unlocked: { 'first-raid': 'x', 'chests-10': 'x' } })
  const a = equip(m, 'sail-rutor', c)
  assert.equal(a.sail, 'sail-rutor')
  assert.equal(a.shields, DEFAULT_SHIELDS)
  const b = equip(a, 'shields-delad', c)
  assert.deepEqual([b.sail, b.shields], ['sail-rutor', 'shields-delad'])
  assert.equal(equip(b, DEFAULT_SAIL, c).sail, DEFAULT_SAIL)
  assert.equal(overlayOf(DEFAULT_SAIL), null)
  assert.equal(overlayOf('sail-rutor'), 'sail-rutor')
})

test('grant gives each event reward once and ignores unknown ids', () => {
  const m = grant(emptyMeta(), ['relic-julbock', 'nope'])
  assert.deepEqual(m.owned, ['relic-julbock'])
  assert.equal(grant(m, ['relic-julbock']), m)
})

test('the chosen look is saved, and old saves get the defaults', () => {
  const m = { ...emptyMeta(), sail: 'sail-rutor', shields: 'shields-delad', owned: ['relic-julbock'] }
  assert.deepEqual(parseMeta(JSON.stringify(m)), m)
  // a 0.5 save has no sail, shields or owned
  const old = parseMeta(JSON.stringify({ stats: {}, unlocked: { 'first-raid': '2026-11-01' }, ship: 'havsorn', migrated: true }))
  assert.deepEqual([old.sail, old.shields, old.owned, old.ship], [DEFAULT_SAIL, DEFAULT_SHIELDS, [], 'havsorn'])
  // nonsense is dropped: a shield in the sail slot, unknown and repeated ids
  const odd = parseMeta(JSON.stringify({ sail: 'shields-delad', shields: 42, owned: ['relic-julbock', 'relic-julbock', 'x', 7] }))
  assert.deepEqual([odd.sail, odd.shields, odd.owned], [DEFAULT_SAIL, DEFAULT_SHIELDS, ['relic-julbock']])
})
