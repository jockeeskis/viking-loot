// Player settings that are not sound (sound and music keep their own keys in sfx.ts).
export type Lang = 'sv' | 'en'
export type Settings = {
  vibration: boolean
  colorMarks: boolean // colour-blind mode: a symbol on everything whose colour matters
  lang: Lang | null // null = follow the phone's language
}

const KEY = 'viking-loot-settings'
export const defaultSettings = (): Settings => ({ vibration: true, colorMarks: false, lang: null })

export function parseSettings(raw: string | null): Settings {
  const s = defaultSettings()
  try {
    const d = raw ? JSON.parse(raw) : null
    if (d && typeof d === 'object') {
      if (typeof d.vibration === 'boolean') s.vibration = d.vibration
      if (typeof d.colorMarks === 'boolean') s.colorMarks = d.colorMarks
      if (d.lang === 'sv' || d.lang === 'en') s.lang = d.lang
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
