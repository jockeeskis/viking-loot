// Statistics, achievements and the ships of Skeppsvarvet (0.4). Pure rules plus small storage helpers.
import { levels, worlds } from './levels.ts'
import { bosses } from './bosses.ts'
import type { Progress } from './progress.ts'
import type { ModeProgress } from './modes.ts'
import { COSMETICS, DEFAULT_SAIL, DEFAULT_SHIELDS } from './cosmetics.ts'
import { RELICS } from './relics.ts'

export type Stats = {
  raidsWon: number // every win: campaign, Dagens räd and endless rounds
  lootTaken: number
  perfectRaids: number // wins at or under par (three stars)
  chestsOpened: number
  cleanWins: number // puzzles (par ≥ 2) won without undo or hint
  dailyWins: number
  kegsBlown: number // 0.5
}
export type Meta = {
  stats: Stats
  unlocked: Record<string, string> // achievement id → day it was earned
  ship: ShipId
  migrated: boolean // 0.3 progress has been counted in
  sail: string // 0.6: the chosen sail (cosmetics.ts)
  shields: string // 0.6: the chosen shield row
  owned: string[] // 0.6: cosmetics and relics given by events and the weekly challenge
}
/** What the game knows when deciding achievements. */
export type Ctx = { stats: Stats; progress: Progress; modes: ModeProgress }

// ---------------------------------------------------------------- ships

export type ShipId = 'ormen' | 'havsorn' | 'nordstjarnan' | 'ymer' | 'surt' | 'gyllene'
export const SHIPS: { id: ShipId; name: string; stars: number; text: string }[] = [
  { id: 'ormen', name: 'Ormen', stars: 0, text: 'Det gamla trotjänarskeppet med rött och vitt segel.' },
  { id: 'havsorn', name: 'Havsörnen', stars: 30, text: 'Blått segel och en vit örn i fören.' },
  { id: 'nordstjarnan', name: 'Nordstjärnan', stars: 60, text: 'Nattblått segel med en gyllene stjärna.' },
  { id: 'ymer', name: 'Ymers drake', stars: 100, text: 'Svart och guld, med en röd drake som vaknat ur isen.' },
  { id: 'surt', name: 'Surtsglöd', stars: 130, text: 'Ett segel som glöder som lava och en drake svart som sot.' },
  { id: 'gyllene', name: 'Gyllene Draken', stars: 165, text: 'Ett segel i guld och vitt med en stjärna, och en drake av rent guld.' },
]
/** Stars from levels and bosses together (they unlock the ships). */
export const totalStars = (p: Progress) => [...p.stars, ...(p.bossStars ?? [])].reduce((a, b) => a + (b ?? 0), 0)
export const shipUnlocked = (id: ShipId, p: Progress) => totalStars(p) >= (SHIPS.find(s => s.id === id)?.stars ?? Infinity)
export const unlockedShips = (p: Progress) => SHIPS.filter(s => shipUnlocked(s.id, p)).map(s => s.id)

// ---------------------------------------------------------------- achievements

const wonAll = (p: Progress, first: number, last: number, stars = 1) => {
  for (let i = first; i <= Math.min(last, levels.length - 1); i++) if ((p.stars[i] ?? 0) < stars) return false
  return true
}
const countIn = (p: Progress, first: number, last: number, stars = 1) =>
  p.stars.slice(first, last + 1).filter(s => (s ?? 0) >= stars).length
const [KUSTEN, FJORDARNA, ISRIKET, MUSPELHEIM, ASGARD] = worlds
const bossesBeaten = (p: Progress, stars = 1) => (p.bossStars ?? []).filter(s => (s ?? 0) >= stars).length
const LAST = levels.length - 1

export type Achievement = {
  id: string; icon: string; title: string; text: string
  done: (c: Ctx) => boolean
  /** How far along a counting achievement is, for the locked badge. */
  progress?: (c: Ctx) => [number, number]
}

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first-raid', icon: '🪓', title: 'Första räden', text: 'Vinn en räd.', done: c => c.stats.raidsWon >= 1 },
  {
    id: 'kusten', icon: '🏖️', title: 'Kustens herre', text: 'Vinn alla banor i Kusten.',
    done: c => wonAll(c.progress, KUSTEN.first, KUSTEN.last), progress: c => [countIn(c.progress, KUSTEN.first, KUSTEN.last), 12],
  },
  {
    id: 'fjordarna', icon: '🌊', title: 'Fjordarnas herre', text: 'Vinn alla banor i Fjordarna.',
    done: c => wonAll(c.progress, FJORDARNA.first, FJORDARNA.last), progress: c => [countIn(c.progress, FJORDARNA.first, FJORDARNA.last), 12],
  },
  {
    id: 'isriket', icon: '❄️', title: 'Isrikets herre', text: 'Vinn alla banor i Isriket.',
    done: c => wonAll(c.progress, ISRIKET.first, ISRIKET.last), progress: c => [countIn(c.progress, ISRIKET.first, ISRIKET.last), 12],
  },
  {
    id: 'muspelheim', icon: '🌋', title: 'Muspelheims herre', text: 'Vinn alla banor i Muspelheim.',
    done: c => wonAll(c.progress, MUSPELHEIM.first, MUSPELHEIM.last), progress: c => [countIn(c.progress, MUSPELHEIM.first, MUSPELHEIM.last), 12],
  },
  {
    id: 'asgard', icon: '🌈', title: 'Asgårds herre', text: 'Vinn alla banor i Asgård.',
    done: c => wonAll(c.progress, ASGARD.first, ASGARD.last), progress: c => [countIn(c.progress, ASGARD.first, ASGARD.last), 12],
  },
  {
    id: 'gold-coast', icon: '⭐', title: 'Guldkusten', text: 'Tre stjärnor på alla banor i Kusten.',
    done: c => wonAll(c.progress, KUSTEN.first, KUSTEN.last, 3), progress: c => [countIn(c.progress, KUSTEN.first, KUSTEN.last, 3), 12],
  },
  {
    id: 'all-gold', icon: '👑', title: 'Hela Norden i guld', text: `Tre stjärnor på alla ${levels.length} banor.`,
    done: c => wonAll(c.progress, 0, LAST, 3), progress: c => [countIn(c.progress, 0, LAST, 3), levels.length],
  },
  {
    id: 'boss-hunter', icon: '⚔️', title: 'Bossjägare', text: 'Besegra alla fem bossarna.',
    done: c => bossesBeaten(c.progress) >= bosses.length, progress: c => [bossesBeaten(c.progress), bosses.length],
  },
  {
    id: 'ragnarok', icon: '🌅', title: 'Ragnarök', text: 'Tre stjärnor på alla fem bossarna.',
    done: c => bossesBeaten(c.progress, 3) >= bosses.length, progress: c => [bossesBeaten(c.progress, 3), bosses.length],
  },
  {
    id: 'loot-100', icon: '🪙', title: 'Hundra skatter', text: 'Plundra 100 skatter.',
    done: c => c.stats.lootTaken >= 100, progress: c => [Math.min(c.stats.lootTaken, 100), 100],
  },
  {
    id: 'loot-500', icon: '💰', title: 'Drakens skatt', text: 'Plundra 500 skatter.',
    done: c => c.stats.lootTaken >= 500, progress: c => [Math.min(c.stats.lootTaken, 500), 500],
  },
  {
    id: 'perfect-10', icon: '✨', title: 'Perfektionist', text: 'Vinn 10 räder med tre stjärnor.',
    done: c => c.stats.perfectRaids >= 10, progress: c => [Math.min(c.stats.perfectRaids, 10), 10],
  },
  {
    id: 'clean', icon: '🧠', title: 'Utan ånger', text: 'Vinn en bana med par 2 eller mer utan att ångra eller ta tips.',
    done: c => c.stats.cleanWins >= 1,
  },
  {
    id: 'chests-10', icon: '🗝️', title: 'Nyckelbärare', text: 'Öppna 10 låsta kistor.',
    done: c => c.stats.chestsOpened >= 10, progress: c => [Math.min(c.stats.chestsOpened, 10), 10],
  },
  {
    id: 'kegs-25', icon: '💥', title: 'Krutgubbe', text: 'Spräng 25 krutfat.',
    done: c => c.stats.kegsBlown >= 25, progress: c => [Math.min(c.stats.kegsBlown, 25), 25],
  },
  { id: 'daily-1', icon: '📅', title: 'Dagens hjälte', text: 'Vinn en Dagens räd.', done: c => c.stats.dailyWins >= 1 || c.modes.daily.lastWon !== null },
  {
    id: 'streak-7', icon: '🔥', title: 'En vecka i rad', text: 'Vinn Dagens räd sju dagar i rad.',
    done: c => c.modes.daily.bestStreak >= 7, progress: c => [Math.min(c.modes.daily.bestStreak, 7), 7],
  },
  {
    id: 'endless-5', icon: '♾️', title: 'Uthållig', text: 'Klara fem rundor i den oändliga räden.',
    done: c => c.modes.endless.best >= 5, progress: c => [Math.min(c.modes.endless.best, 5), 5],
  },
  {
    id: 'endless-10', icon: '🐉', title: 'Oändlig', text: 'Klara tio rundor i den oändliga räden.',
    done: c => c.modes.endless.best >= 10, progress: c => [Math.min(c.modes.endless.best, 10), 10],
  },
]

/** Achievements earned now that are not yet recorded, in list order. */
export function newlyEarned(meta: Meta, c: Ctx): string[] {
  return ACHIEVEMENTS.filter(a => !meta.unlocked[a.id] && a.done(c)).map(a => a.id)
}

export function unlock(meta: Meta, ids: string[], day: string): Meta {
  if (!ids.length) return meta
  return { ...meta, unlocked: { ...meta.unlocked, ...Object.fromEntries(ids.map(id => [id, day])) } }
}

// ---------------------------------------------------------------- statistics

export type RaidResult = {
  mode: 'campaign' | 'daily' | 'endless' | 'boss'
  stars: number
  par: number
  loot: number // items plundered (every item is taken on a win)
  chests: number // locked chests opened
  kegs: number // powder kegs blown up
  usedUndo: boolean
  usedHint: boolean
}

export function recordRaid(s: Stats, r: RaidResult): Stats {
  return {
    raidsWon: s.raidsWon + 1,
    lootTaken: s.lootTaken + r.loot,
    perfectRaids: s.perfectRaids + (r.stars >= 3 ? 1 : 0),
    chestsOpened: s.chestsOpened + r.chests,
    cleanWins: s.cleanWins + (r.par >= 2 && !r.usedUndo && !r.usedHint ? 1 : 0),
    dailyWins: s.dailyWins + (r.mode === 'daily' ? 1 : 0),
    kegsBlown: s.kegsBlown + r.kegs,
  }
}

/** The loot and chests a won level counts for. */
export function lootOf(level: { loot: { stone?: boolean; lockedBy?: string[]; keg?: boolean }[] }) {
  return {
    loot: level.loot.filter(l => !l.stone).length,
    chests: level.loot.filter(l => l.lockedBy?.length).length,
    kegs: level.loot.filter(l => l.keg).length,
  }
}

export const emptyStats = (): Stats => ({ raidsWon: 0, lootTaken: 0, perfectRaids: 0, chestsOpened: 0, cleanWins: 0, dailyWins: 0, kegsBlown: 0 })
export const emptyMeta = (): Meta => ({
  stats: emptyStats(), unlocked: {}, ship: 'ormen', migrated: false, sail: DEFAULT_SAIL, shields: DEFAULT_SHIELDS, owned: [],
})

/**
 * 0.3 only saved stars, so the statistics start from the won levels: one raid and all its loot
 * per won level, a perfect raid per three-star level. Daily wins come from the 0.4 mode data.
 */
export function migrate(meta: Meta, progress: Progress, modes: ModeProgress): Meta {
  if (meta.migrated) return meta
  const s = { ...meta.stats }
  progress.stars.forEach((stars, i) => {
    if (!stars || !levels[i]) return
    const { loot, chests, kegs } = lootOf(levels[i])
    s.raidsWon++
    s.lootTaken += loot
    s.chestsOpened += chests
    s.kegsBlown += kegs
    if (stars >= 3) s.perfectRaids++
  })
  s.dailyWins += Object.keys(modes.daily.results).length
  return { ...meta, stats: s, migrated: true }
}

const KEY = 'viking-loot-0.4-meta'
const nonNeg = (v: unknown) => (Number.isInteger(v) && (v as number) > 0 ? (v as number) : 0)

export function parseMeta(raw: string | null): Meta {
  const m = emptyMeta()
  try {
    const d = raw ? JSON.parse(raw) : null
    if (!d || typeof d !== 'object') return m
    if (d.stats && typeof d.stats === 'object') for (const k of Object.keys(m.stats) as (keyof Stats)[]) m.stats[k] = nonNeg(d.stats[k])
    if (d.unlocked && typeof d.unlocked === 'object') {
      for (const a of ACHIEVEMENTS) if (typeof d.unlocked[a.id] === 'string') m.unlocked[a.id] = d.unlocked[a.id]
    }
    if (SHIPS.some(s => s.id === d.ship)) m.ship = d.ship
    m.migrated = d.migrated === true
    // 0.6 – saves from 0.4/0.5 have none of these and keep the defaults
    if (COSMETICS.some(c => c.slot === 'sail' && c.id === d.sail)) m.sail = d.sail
    if (COSMETICS.some(c => c.slot === 'shields' && c.id === d.shields)) m.shields = d.shields
    if (Array.isArray(d.owned)) {
      const known = (id: unknown) => typeof id === 'string' && (COSMETICS.some(c => c.id === id) || RELICS.some(r => r.id === id))
      m.owned = [...new Set(d.owned.filter(known) as string[])]
    }
  } catch { /* corrupt data – start over */ }
  return m
}
export function loadMeta(): Meta {
  try { return parseMeta(localStorage.getItem(KEY)) } catch { return emptyMeta() }
}
export function saveMeta(m: Meta) {
  try { localStorage.setItem(KEY, JSON.stringify(m)) } catch { /* private mode */ }
}
