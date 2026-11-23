// Stars and saved progress. The star rule is pure; storage is wrapped so a blocked
// localStorage (private mode, previews) never breaks the game.

/** 3★ at or under par, 2★ one wait over, otherwise 1★ for any win. */
export function starsFor(waits: number, par: number): 1 | 2 | 3 {
  if (waits <= par) return 3
  if (waits <= par + 1) return 2
  return 1
}

export type Progress = {
  unlocked: number // highest level index the player may open
  stars: number[] // best stars per level index (0 = not won yet)
  seenIntros: string[] // mechanics whose introduction has been shown
  bossStars: number[] // 0.5: best stars per boss, indexed by world (0 = not beaten yet)
  seenStory: string[] // 0.5: story cards that have been shown (they can be read again in Krönikan)
}

const KEY = 'viking-loot-0.3-progress'
const OLD_KEY = 'viking-loot-0.2-unlocked'

export function emptyProgress(): Progress {
  return { unlocked: 0, stars: [], seenIntros: [], bossStars: [], seenStory: [] }
}

/** Parse stored progress, tolerating missing or malformed data. */
export function parseProgress(raw: string | null, legacyUnlocked: string | null): Progress {
  const p = emptyProgress()
  try {
    if (raw) {
      const d = JSON.parse(raw) as Partial<Progress>
      if (Number.isInteger(d.unlocked) && d.unlocked! >= 0) p.unlocked = d.unlocked!
      const starList = (a: unknown[]) => a.map(n => (Number.isInteger(n) ? Math.max(0, Math.min(3, n as number)) : 0))
      if (Array.isArray(d.stars)) p.stars = starList(d.stars)
      if (Array.isArray(d.seenIntros)) p.seenIntros = d.seenIntros.filter(x => typeof x === 'string')
      if (Array.isArray(d.bossStars)) p.bossStars = starList(d.bossStars)
      if (Array.isArray(d.seenStory)) p.seenStory = d.seenStory.filter(x => typeof x === 'string')
      return p
    }
  } catch { /* fall through to the 0.2 key */ }
  // 0.2 only stored how far the player had come; those levels count as won with 1★.
  const old = Number(legacyUnlocked ?? '0')
  if (Number.isInteger(old) && old > 0) {
    p.unlocked = old
    p.stars = Array.from({ length: old }, () => 1)
  }
  return p
}

export function loadProgress(): Progress {
  try { return parseProgress(localStorage.getItem(KEY), localStorage.getItem(OLD_KEY)) } catch { return emptyProgress() }
}

export function saveProgress(p: Progress) {
  try { localStorage.setItem(KEY, JSON.stringify(p)) } catch { /* private mode */ }
}

/** Record a win: keep the best stars and unlock the next level. Returns a new object. */
export function recordWin(p: Progress, level: number, stars: number, levelCount: number): Progress {
  const next = [...p.stars]
  while (next.length <= level) next.push(0)
  next[level] = Math.max(next[level], stars)
  return { ...p, stars: next, unlocked: Math.min(levelCount - 1, Math.max(p.unlocked, level + 1)) }
}

/** Record a boss win: keep the best stars. Bosses never lock or unlock levels. */
export function recordBossWin(p: Progress, world: number, stars: number): Progress {
  const next = [...p.bossStars]
  while (next.length <= world) next.push(0)
  next[world] = Math.max(next[world], stars)
  return { ...p, bossStars: next }
}

/** A boss is open once the last level of its world is won. */
export const bossUnlocked = (p: Progress, worldLast: number) => (p.stars[worldLast] ?? 0) > 0

/** Mark a story card as shown. */
export const seeStory = (p: Progress, id: string): Progress => (p.seenStory.includes(id) ? p : { ...p, seenStory: [...p.seenStory, id] })
