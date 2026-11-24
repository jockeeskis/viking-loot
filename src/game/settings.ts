// Player settings that are not sound (sound and music keep their own keys in sfx.ts).
export type Lang = 'sv' | 'en'
export type Settings = {
  vibration: boolean
  colorMarks: boolean // colour-blind mode: a symbol on everything whose colour matters
  lang: Lang | null // null = follow the phone's language
  reducedMotion: boolean | null // 0.6: null = follow the phone (prefers-reduced-motion)
  batterySaver: boolean // 0.6: 30 fps, fewer particles, no smoothing (from the next start)
}

const KEY = 'viking-loot-settings'
export const defaultSettings = (): Settings => ({ vibration: true, colorMarks: false, lang: null, reducedMotion: null, batterySaver: false })

export function parseSettings(raw: string | null): Settings {
  const s = defaultSettings()
  try {
    const d = raw ? JSON.parse(raw) : null
    if (d && typeof d === 'object') {
      if (typeof d.vibration === 'boolean') s.vibration = d.vibration
      if (typeof d.colorMarks === 'boolean') s.colorMarks = d.colorMarks
      if (d.lang === 'sv' || d.lang === 'en') s.lang = d.lang
      if (typeof d.reducedMotion === 'boolean') s.reducedMotion = d.reducedMotion
      if (typeof d.batterySaver === 'boolean') s.batterySaver = d.batterySaver
    }
  } catch { /* corrupt – defaults */ }
  return s
}
export function loadSettings(): Settings {
  try { return parseSettings(localStorage.getItem(KEY)) } catch { return defaultSettings() }
}
export function saveSettings(s: Settings) {
  try { localStorage.setItem(KEY, JSON.stringify(s)) } catch { /* private mode */ }
}

/** Whether motion should be reduced: the player's choice, otherwise the phone's setting. */
export function motionReduced(s: Settings): boolean {
  if (s.reducedMotion !== null) return s.reducedMotion
  try { return typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches } catch { return false }
}
