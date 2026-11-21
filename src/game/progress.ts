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
}

const KEY = 'viking-loot-0.3-progress'
const OLD_KEY = 'viking-loot-0.2-unlocked'

export function emptyProgress(): Progress {
  return { unlocked: 0, stars: [], seenIntros: [] }
}

/** Parse stored progress, tolerating missing or malformed data. */
export function parseProgress(raw: string | null, legacyUnlocked: string | null): Progress {
  const p = emptyProgress()
  try {
    if (raw) {
      const d = JSON.parse(raw) as Partial<Progress>
      if (Number.isInteger(d.unlocked) && d.unlocked! >= 0) p.unlocked = d.unlocked!
      if (Array.isArray(d.stars)) p.stars = d.stars.map(n => (Number.isInteger(n) ? Math.max(0, Math.min(3, n)) : 0))
      if (Array.isArray(d.seenIntros)) p.seenIntros = d.seenIntros.filter(x => typeof x === 'string')
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
