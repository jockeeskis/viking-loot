import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SV, EN, DATA_EN, t, tn, tr, setLang, getLang, levelName, levelHint, dayLabel } from './i18n.ts'
import { LEVEL_EN } from './levelTexts.ts'
import { levels, worlds } from './levels.ts'
import { INTROS } from './intros.ts'
import { ACHIEVEMENTS, SHIPS } from './achievements.ts'
import { parseSettings, defaultSettings } from './settings.ts'

test('Swedish and English have the same UI texts, none empty', () => {
  assert.deepEqual(Object.keys(EN).sort(), Object.keys(SV).sort())
  for (const [k, v] of [...Object.entries(SV), ...Object.entries(EN)]) assert.ok(v.trim(), `${k} is empty`)
  // The same placeholders on both sides.
  const holes = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort().join(',')
  for (const k of Object.keys(SV)) assert.equal(holes(EN[k]), holes(SV[k]), `placeholders of ${k}`)
  for (let i = 0; i < worlds.length; i++) assert.ok(SV[`world.${i}`] && EN[`world.${i}`], `world ${i} has a name`)
})

test('every level, intro, achievement and ship has an English text', () => {
  assert.equal(LEVEL_EN.length, levels.length)
  for (const l of LEVEL_EN) assert.ok(l.name && l.hint)
  for (const m of Object.keys(INTROS)) for (const f of ['title', 'text']) assert.ok(DATA_EN[`intro.${m}.${f}`], `intro ${m} ${f}`)
  for (const a of ACHIEVEMENTS) for (const f of ['title', 'text']) assert.ok(DATA_EN[`ach.${a.id}.${f}`], `achievement ${a.id} ${f}`)
  for (const s of SHIPS) for (const f of ['name', 'text']) assert.ok(DATA_EN[`ship.${s.id}.${f}`], `ship ${s.id} ${f}`)
})

test('texts follow the chosen language and fill in their parameters', () => {
  const before = getLang()
  setLang('sv')
  assert.equal(t('endless.won', { n: 3 }), '🏆 Runda 3 klarad!')
  assert.equal(tn('waits', 1), '1 väntning')
  assert.equal(tn('waits', 2), '2 väntningar')
  assert.equal(levelName(0), 'Kustbyn')
  assert.equal(tr('Hej', 'ship.ormen.name'), 'Hej')
  assert.equal(dayLabel('2026-05-03'), '3 maj')
  setLang('en')
  assert.equal(t('endless.won', { n: 3 }), '🏆 Round 3 cleared!')
  assert.equal(tn('waits', 1), '1 wait')
  assert.equal(levelName(0), 'Coast Village')
  assert.equal(levelHint(24), LEVEL_EN[24].hint)
  assert.equal(tr('Hej', 'ship.ormen.name'), 'The Serpent')
  assert.equal(dayLabel('2026-05-03'), '3 May')
  assert.equal(t('no.such.key'), 'no.such.key', 'a missing text shows its key')
  setLang(before)
})

test('settings tolerate junk', () => {
  assert.deepEqual(parseSettings(null), defaultSettings())
  assert.deepEqual(parseSettings('{bad'), defaultSettings())
  assert.deepEqual(parseSettings(JSON.stringify({ vibration: false, colorMarks: true, lang: 'en' })), { vibration: false, colorMarks: true, lang: 'en' })
  assert.deepEqual(parseSettings(JSON.stringify({ vibration: 'yes', lang: 'fi' })), defaultSettings())
})
