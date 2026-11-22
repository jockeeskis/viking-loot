<script setup lang="ts">
import { ref, computed, shallowRef, onMounted, onBeforeUnmount } from 'vue'
import Phaser from 'phaser'
import { RaidScene, type RaidUpdate } from './game/RaidScene'
import { levels, worlds, type Level } from './game/levels'
import { WAITING_SLOTS } from './game/engine'
import { isMuted, setMuted, unlockAudio, isMusicOn, setMusicOn } from './game/sfx'
import { loadProgress, saveProgress, recordWin, starsFor } from './game/progress'
import { INTROS, mechanicsOf, type Mechanic } from './game/intros'
import {
  dateKey, tierFor, loadModes, saveModes, recordDailyWin, currentStreak, startEndlessRun, recordEndlessRound,
} from './game/modes'
import { requestLevel } from './game/levelGen'
import {
  ACHIEVEMENTS, SHIPS, loadMeta, saveMeta, migrate, newlyEarned, unlock, recordRaid, lootOf, totalStars, shipUnlocked, unlockedShips,
  type ShipId,
} from './game/achievements'
import { shipSheet } from './game/assets'
import LevelMap from './components/LevelMap.vue'
import SettingsPanel from './components/Settings.vue'
import {
  t as tt, tn as ttn, tr as ttr, getLang, setLang, detectLang, levelName, levelHint, worldName, dayLabel,
} from './game/i18n'
import { loadSettings, saveSettings, type Lang } from './game/settings'
import { setVibration, haptics } from './game/haptics'
import { registerSW } from 'virtual:pwa-register'

// ---------- app updates (PWA) ----------
// A new version is downloaded in the background; it is only activated when the player says so,
// so a raid is never interrupted by a reload.
const updateReady = ref(false)
const updateSW = registerSW({
  onNeedRefresh() { updateReady.value = true },
  // An installed app is often resumed rather than reopened, which never re-checks for a new version.
  // Check whenever it comes back to the foreground (at most every few minutes) and once an hour.
  onRegisteredSW(_url, reg) {
    if (!reg) return
    let last = Date.now()
    const check = () => {
      if (Date.now() - last < 5 * 60 * 1000 || !navigator.onLine) return
      last = Date.now()
      void reg.update().catch(() => { /* offline or server hiccup – try again later */ })
    }
    document.addEventListener('visibilitychange', () => { if (!document.hidden) check() })
    setInterval(check, 60 * 60 * 1000)
  },
})
function reloadApp() { updateSW(true) }

// ---------- settings and language (0.5) ----------
const settings = ref(loadSettings())
setLang(settings.value.lang ?? detectLang())
setVibration(settings.value.vibration)
const lang = ref<Lang>(getLang())
// Texts read `lang` so that the page re-renders when the language changes.
const t = (key: string, params?: Record<string, string | number>) => { void lang.value; return tt(key, params) }
const tn = (key: string, n: number) => { void lang.value; return ttn(key, n) }
const tr = (sv: string, enKey: string, params?: Record<string, string | number>) => { void lang.value; return ttr(sv, enKey, params) }
const dayLbl = (d: string) => { void lang.value; return dayLabel(d) }
const lvlName = (i: number) => { void lang.value; return levelName(i) }
const wName = (i: number) => { void lang.value; return worldName(i) }
const showSettings = ref(false)
function changeSetting(key: 'vibration' | 'colorMarks', on: boolean) {
  settings.value = { ...settings.value, [key]: on }
  saveSettings(settings.value)
  if (key === 'vibration') { setVibration(on); if (on) haptics.test() }
  else scene?.setColorMarks(on)
}
function changeLang(l: Lang) {
  settings.value = { ...settings.value, lang: l }
  saveSettings(settings.value)
  setLang(l)
  lang.value = l
  scene?.relabel(currentTitle())
}

// ---------- progress ----------
const progress = ref(loadProgress())
const modes = ref(loadModes())
const unlocked = computed(() => Math.min(progress.value.unlocked, levels.length - 1))
const current = ref(Math.min(unlocked.value, levels.length - 1))
// Statistics and achievements (0.4). 0.3 progress is counted in once; what it already earned is
// unlocked quietly, so the first start of 0.4 does not flood the screen with toasts.
const savedMeta = loadMeta()
const meta = ref(migrate(savedMeta, progress.value, modes.value))
if (!savedMeta.migrated) {
  meta.value = unlock(meta.value, newlyEarned(meta.value, { stats: meta.value.stats, progress: progress.value, modes: modes.value }), dateKey(new Date()))
  saveMeta(meta.value)
}
/** Generated raids only use mechanics from worlds the player has completed. */
const tier = computed(() => tierFor(worlds.map(w => (progress.value.stars[w.last] ?? 0) > 0)))

// ---------- what is being played ----------
type Mode = 'campaign' | 'daily' | 'endless'
const mode = ref<Mode>('campaign')
const active = shallowRef<Level>(levels[current.value])
const today = ref(dateKey(new Date()))
const playingDay = ref('') // the day of the Dagens räd being played
const endless = ref({ round: 0, runSeed: 0, tier: 0 as 0 | 1 | 2, over: false, bestBefore: 0 })
let nextEndless: Promise<Level> | null = null // the next round, generated while this one is played
const generating = ref(false)
let ticket = 0 // the newest load request; older ones that finish later are ignored

const info = ref<RaidUpdate>({
  busy: false, canUndo: false, waits: 0, status: 'playing', lossReason: null, remaining: 0, queue: 0, waiting: 0, moves: 0,
})
// The engine decides the outcome before the animation plays, so results are only shown once it is done.
const won = computed(() => info.value.status === 'won' && !info.value.busy)
const lost = computed(() => info.value.status === 'lost' && !info.value.busy)
const lastStars = ref(0)
const dailyCounted = ref(true) // false when today's raid was already won before (replay)
const lossText = computed(() => t(info.value.lossReason === 'slots-full' ? 'loss.full' : 'loss.stuck'))
const par = computed(() => active.value.par)
const waitsText = (n: number) => tn('waits', n)
const roundsText = (n: number) => tn('rounds', n)
const isEndless = computed(() => mode.value === 'endless')

let game: Phaser.Game | undefined
let scene: RaidScene | undefined

function update(d: RaidUpdate) {
  // While a move animates, keep the numbers from before the move; only the busy flags change.
  if (d.busy) { info.value = { ...info.value, busy: true, canUndo: false }; return }
  const justWon = d.status === 'won' && info.value.status !== 'won'
  const justLost = d.status === 'lost' && info.value.status !== 'lost'
  info.value = d
  hintMsg.value = ''
  if (justWon) {
    lastStars.value = starsFor(d.waits, active.value.par)
    const shipsBefore = unlockedShips(progress.value)
    if (mode.value === 'campaign') {
      progress.value = recordWin(progress.value, current.value, lastStars.value, levels.length)
      saveProgress(progress.value)
    } else if (mode.value === 'daily') {
      dailyCounted.value = !modes.value.daily.results[playingDay.value]
      modes.value = recordDailyWin(modes.value, playingDay.value, lastStars.value)
      saveModes(modes.value)
    } else {
      modes.value = recordEndlessRound(modes.value, endless.value.round)
      saveModes(modes.value)
    }
    const { loot, chests } = lootOf(active.value)
    meta.value = {
      ...meta.value,
      stats: recordRaid(meta.value.stats, {
        mode: mode.value, stars: lastStars.value, par: active.value.par, loot, chests, usedUndo, usedHint,
      }),
    }
    checkAchievements()
    for (const id of unlockedShips(progress.value)) {
      if (!shipsBefore.includes(id)) toast('⛵', t('toast.ship', { name: shipName(id) }), t('toast.shipText'))
    }
  }
  if (justLost && mode.value === 'endless') endless.value = { ...endless.value, over: true }
}

// ---------- introductions for new mechanics ----------
const intro = ref<Mechanic | null>(null)
function maybeIntro() {
  intro.value = mechanicsOf(active.value).find(m => !progress.value.seenIntros.includes(m)) ?? null
}
function closeIntro() {
  if (!intro.value) return
  progress.value = { ...progress.value, seenIntros: [...progress.value.seenIntros, intro.value] }
  saveProgress(progress.value)
  maybeIntro() // a level may introduce more than one thing
}

// ---------- starting raids ----------
/** Show a level. `key` identifies it for the one-hint rule (titles change with the language). */
function show(level: Level, title: string, key: string) {
  active.value = level
  usedUndo = usedHint = false
  hintFor = key
  hintsLeft.value = hintsUsed.has(key) ? 0 : HINTS_PER_LEVEL
  info.value = { ...info.value, status: 'playing', busy: false }
  scene?.play(level, title)
  maybeIntro()
  document.querySelector('.game-wrap')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

function openLevel(i: number) {
  if (i > unlocked.value) return
  ticket++
  generating.value = false
  mode.value = 'campaign'
  current.value = i
  show(levels[i], currentTitle(), `c${i}`)
}

/** Today's level is kept for the day, so it is only generated once. */
const DAILY_CACHE = 'viking-loot-0.4-daily-cache'
function cachedDaily(day: string, t: number): Level | null {
  try {
    const c = JSON.parse(localStorage.getItem(DAILY_CACHE) ?? 'null')
    return c && c.day === day && c.tier === t && c.level ? (c.level as Level) : null
  } catch { return null }
}
function cacheDaily(day: string, t: number, level: Level) {
  try { localStorage.setItem(DAILY_CACHE, JSON.stringify({ day, tier: t, level })) } catch { /* private mode */ }
}

async function openDaily() {
  const my = ++ticket
  today.value = dateKey(new Date())
  const day = today.value, tierNow = tier.value
  mode.value = 'daily'
  playingDay.value = day
  let level = cachedDaily(day, tierNow)
  if (!level) {
    generating.value = true
    level = await requestLevel({ kind: 'daily', day, tier: tierNow })
    if (my !== ticket) return
    cacheDaily(day, tierNow, level)
    generating.value = false
  }
  show(level, currentTitle(), `d${day}`)
}

async function playEndlessRound(level: Promise<Level>, round: number) {
  const my = ++ticket
  generating.value = true
  const l = await level
  if (my !== ticket) return
  generating.value = false
  endless.value = { ...endless.value, round, over: false }
  show(l, currentTitle(), `e${endless.value.runSeed}-${round}`)
  // Start on the next island while this one is played.
  nextEndless = requestLevel({ kind: 'endless', round: round + 1, tier: endless.value.tier, runSeed: endless.value.runSeed })
}

function startEndless() {
  mode.value = 'endless'
  const runSeed = (Math.random() * 2 ** 32) >>> 0
  endless.value = { round: 0, runSeed, tier: tier.value, over: false, bestBefore: modes.value.endless.best }
  modes.value = startEndlessRun(modes.value)
  saveModes(modes.value)
  void playEndlessRound(requestLevel({ kind: 'endless', round: 1, tier: tier.value, runSeed }), 1)
}

function nextRound() {
  const round = endless.value.round + 1
  const level = nextEndless ?? requestLevel({ kind: 'endless', round, tier: endless.value.tier, runSeed: endless.value.runSeed })
  nextEndless = null
  void playEndlessRound(level, round)
}

// ---------- actions ----------
const hintMsg = ref('')
/** One hint per level, so the puzzles cannot be solved by following hints. Kept when restarting. */
const HINTS_PER_LEVEL = 1
const hintsLeft = ref(HINTS_PER_LEVEL)
let hintFor = `c${current.value}` // the level being played (the first one shown at start)
const hintsUsed = new Set<string>() // levels whose hint is spent – restarting or reopening them gives no new one
let usedUndo = false, usedHint = false // in this attempt (for the "Utan ånger" achievement)
function restart() { if (!isEndless.value) { usedUndo = usedHint = false; scene?.restart() } }
function undo() { if (!isEndless.value && info.value.canUndo) { usedUndo = true; scene?.undo() } }
function showHint() {
  if (!scene || isEndless.value || hintsLeft.value <= 0) return
  // A hint is only used up when there is a winning move to point at.
  if (scene.showHint()) { hintsLeft.value--; hintsUsed.add(hintFor); usedHint = true; hintMsg.value = '' }
  else hintMsg.value = t('hint.none')
}
/** The title of what is being played, in the current language. */
function currentTitle(): string {
  if (mode.value === 'daily') return t('daily.name', { day: dayLabel(playingDay.value) })
  if (mode.value === 'endless') return t('endless.name', { n: endless.value.round })
  return `${current.value + 1}. ${levelName(current.value)}`
}
const activeHint = computed(() => {
  void lang.value
  if (mode.value === 'daily') return t('daily.hint')
  if (mode.value === 'endless') return t('endless.hint')
  return levelHint(current.value)
})
function next() { if (current.value < levels.length - 1) openLevel(current.value + 1) }

const muted = ref(isMuted())
function toggleSound() { setMuted(!muted.value); muted.value = isMuted(); unlockAudio() }
const music = ref(isMusicOn())
function toggleMusic() { setMusicOn(!music.value); music.value = isMusicOn() }

// ---------- achievements, toasts and Skeppsvarvet ----------
type Toast = { id: number; icon: string; title: string; text: string }
const toasts = ref<Toast[]>([])
let toastId = 0
function toast(icon: string, title: string, text: string) {
  const item = { id: ++toastId, icon, title, text }
  toasts.value = [...toasts.value, item]
  setTimeout(() => { toasts.value = toasts.value.filter(x => x.id !== item.id) }, 4200 + 600 * (toasts.value.length - 1))
}
function checkAchievements() {
  const ids = newlyEarned(meta.value, { stats: meta.value.stats, progress: progress.value, modes: modes.value })
  meta.value = unlock(meta.value, ids, dateKey(new Date()))
  saveMeta(meta.value)
  for (const id of ids) {
    const a = ACHIEVEMENTS.find(x => x.id === id)!
    toast(a.icon, t('toast.achievement', { t: achTitle(a) }), achText(a))
  }
}
const achievementView = computed(() => {
  const c = { stats: meta.value.stats, progress: progress.value, modes: modes.value }
  return ACHIEVEMENTS.map(a => {
    const p = a.progress?.(c)
    return { ...a, title: achTitle(a), text: achText(a), earned: !!meta.value.unlocked[a.id], progressText: p ? `${p[0]}/${p[1]}` : '' }
  })
})
const achTitle = (a: { id: string; title: string }) => tr(a.title, `ach.${a.id}.title`)
const achText = (a: { id: string; text: string }) => tr(a.text, `ach.${a.id}.text`, { n: levels.length })
const shipName = (id: ShipId) => tr(SHIPS.find(x => x.id === id)!.name, `ship.${id}.name`)
const introText = (m: Mechanic) => ({
  icon: INTROS[m].icon, title: tr(INTROS[m].title, `intro.${m}.title`), text: tr(INTROS[m].text, `intro.${m}.text`),
})
const earnedCount = computed(() => achievementView.value.filter(a => a.earned).length)
const stars = computed(() => totalStars(progress.value))
function chooseShip(id: ShipId) {
  if (!shipUnlocked(id, progress.value)) return
  meta.value = { ...meta.value, ship: id }
  saveMeta(meta.value)
  scene?.setShip(id)
}
const shipPreview = (id: string) => {
  const sheet = shipSheet(id)
  return sheet ? { backgroundImage: `url(${import.meta.env.BASE_URL}${sheet})` } : {}
}
const statRows = computed(() => {
  const s = meta.value.stats
  return [
    ['🏆', t('stat.raids'), s.raidsWon],
    ['🪙', t('stat.loot'), s.lootTaken],
    ['✨', t('stat.perfect'), s.perfectRaids],
    ['🗝️', t('stat.chests'), s.chestsOpened],
    ['⭐', t('stat.stars'), `${stars.value}/${levels.length * 3}`],
    ['📅', t('stat.daily'), s.dailyWins],
    ['🔥', t('stat.streak'), `${streak.value} (${modes.value.daily.bestStreak})`],
    ['♾️', t('stat.endless'), roundsText(modes.value.endless.best)],
  ] as [string, string, string | number][]
})

// ---------- the raid cards ----------
const streak = computed(() => currentStreak(modes.value, today.value))
const todayStars = computed(() => modes.value.daily.results[today.value] ?? 0)
const onVisible = () => { if (!document.hidden) today.value = dateKey(new Date()) }

onMounted(() => {
  window.addEventListener('pointerdown', unlockAudio, { once: true })
  document.addEventListener('visibilitychange', onVisible)
  scene = new RaidScene()
  game = new Phaser.Game({
    type: Phaser.AUTO, parent: 'game', width: 720, height: 1280, backgroundColor: '#193a4b',
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    render: { pixelArt: false, antialias: true }, scene: [scene],
    // Let the page scroll when a swipe starts on the game (taps are told apart in RaidScene).
    input: { touch: { capture: false } },
  })
  if (import.meta.env.DEV) (window as unknown as { __game?: Phaser.Game }).__game = game // for debugging in the console
  game.events.once(Phaser.Core.Events.READY, () => {
    // After a tap the browser also sends mouse events; stop them so a tap never counts twice.
    // (A touch that became a scroll ends with a non-cancelable touchend, so scrolling is not affected.)
    game?.canvas.addEventListener('touchend', e => { if (e.cancelable) e.preventDefault() }, { passive: false })
    scene?.setUpdate(update)
    scene?.setShip(meta.value.ship)
    scene?.setColorMarks(settings.value.colorMarks)
    scene?.play(levels[current.value], currentTitle())
  })
  maybeIntro()
})
onBeforeUnmount(() => { document.removeEventListener('visibilitychange', onVisible); game?.destroy(true) })
</script>

<template>
  <main class="shell">
    <div v-if="updateReady" class="update-banner" role="status">
      <span>{{ t('update.ready') }}</span>
      <button @click="reloadApp">{{ t('update.reload') }}</button>
      <button class="close" :aria-label="t('update.later')" @click="updateReady = false">✕</button>
    </div>
    <header>
      <div class="logo"><h1>VIKING LOOT</h1><div class="eyebrow">The First Raid · 0.5</div></div>
      <p>{{ t('header.text') }}</p>
    </header>
    <div class="stats">
      <span>🪙 {{ t('stats.left') }}: <strong>{{ info.remaining }}</strong></span>
      <span>🛡️ {{ t('stats.queue') }}: <strong>{{ info.queue }}</strong></span>
      <span :class="{ risk: info.waiting >= WAITING_SLOTS - 1 }">⛵ {{ t('stats.waiting') }}: <strong>{{ info.waiting }}/{{ WAITING_SLOTS }}</strong></span>
      <span :title="t('stats.parTitle')">⭐ <strong>{{ info.waits }}</strong>/{{ par }}</span>
    </div>
    <p class="hint">💡 {{ hintMsg || activeHint }}</p>
    <div class="game-wrap">
      <div id="game"></div>
      <div v-if="generating" class="overlay">
        <div class="result generating">
          <div class="intro-icon spin">🧭</div>
          <h2>{{ t('gen.title') }}</h2>
          <p>{{ t('gen.text') }}</p>
        </div>
      </div>
      <div v-else-if="won || lost" class="overlay">
        <!-- Endless raid -->
        <div v-if="isEndless" class="result">
          <h2>{{ won ? t('endless.won', { n: endless.round }) : t('endless.over') }}</h2>
          <div v-if="won" class="result-stars" :aria-label="t('stars.aria', { n: lastStars })">
            <i v-for="s in 3" :key="s" :class="{ on: s <= lastStars }" :style="{ animationDelay: `${s * 0.18}s` }">★</i>
          </div>
          <p v-if="won">{{ t('endless.harder') }}<br /><small>{{ t('endless.record', { r: roundsText(modes.endless.best) }) }}</small></p>
          <p v-else>
            {{ lossText }}<br />
            <strong>{{ t('endless.survived', { r: roundsText(endless.round - 1) }) }}</strong><br />
            <small v-if="endless.round - 1 > endless.bestBefore">{{ t('endless.newRecord') }}</small>
            <small v-else>{{ t('endless.record', { r: roundsText(modes.endless.best) }) }}</small>
          </p>
          <button v-if="won" @click="nextRound">{{ t('endless.next') }}</button>
          <button v-else @click="startEndless">{{ t('endless.new') }}</button>
        </div>
        <!-- Campaign and the daily raid -->
        <div v-else class="result">
          <h2>{{ won ? t('result.win') : t('result.lose') }}</h2>
          <div v-if="won" class="result-stars" :aria-label="t('stars.aria', { n: lastStars })">
            <i v-for="s in 3" :key="s" :class="{ on: s <= lastStars }" :style="{ animationDelay: `${s * 0.18}s` }">★</i>
          </div>
          <p v-if="won">
            {{ t('result.summary', { moves: info.moves, waits: waitsText(info.waits) }) }}<br />
            <small v-if="lastStars < 3">{{ t('result.threeStars', { waits: waitsText(par) }) }}</small>
            <small v-else>{{ t('result.perfect') }}</small>
            <template v-if="mode === 'daily'">
              <br /><strong v-if="dailyCounted">{{ t('result.dailyDone', { days: tn('days', streak) }) }}</strong>
              <small v-else>{{ t('result.dailyReplay') }}</small>
            </template>
            <template v-else-if="current === levels.length - 1"><br /><strong>{{ t('result.allDone', { n: levels.length }) }}</strong></template>
          </p>
          <p v-else>{{ lossText }}</p>
          <button v-if="won && mode === 'campaign' && current < levels.length - 1" @click="next">{{ t('result.next') }}</button>
          <button v-if="lost && info.canUndo" @click="undo">{{ t('actions.undo') }}</button>
          <button @click="restart">{{ won ? t('result.again') : t('result.retry') }}</button>
        </div>
      </div>
      <div v-if="intro && !generating" class="overlay">
        <div class="result intro">
          <div class="intro-icon">{{ introText(intro).icon }}</div>
          <h2>{{ introText(intro).title }}</h2>
          <p>{{ introText(intro).text }}</p>
          <button @click="closeIntro">{{ t('intro.ok') }}</button>
        </div>
      </div>
      <SettingsPanel
        v-if="showSettings" :t="t" :lang="lang" :music="music" :sound="!muted"
        :vibration="settings.vibration" :color-marks="settings.colorMarks"
        @music="toggleMusic" @sound="toggleSound" @vibration="changeSetting('vibration', $event)"
        @color-marks="changeSetting('colorMarks', $event)" @lang="changeLang" @close="showSettings = false"
      />
    </div>
    <div class="actions">
      <button :disabled="isEndless" @click="restart">{{ t('actions.restart') }}</button>
      <button :disabled="isEndless || !info.canUndo || info.busy" @click="undo">{{ t('actions.undo') }}</button>
      <button :disabled="isEndless || hintsLeft <= 0 || info.busy || info.status !== 'playing'" :title="hintsLeft > 0 ? t('hint.left') : t('hint.used')" @click="showHint">{{ t('actions.hint', { n: isEndless ? 0 : hintsLeft }) }}</button>
      <button class="icon" :aria-label="t('actions.settings')" :title="t('actions.settings')" @click="showSettings = !showSettings">⚙️</button>
      <button class="icon" :aria-label="muted ? t('sound.on') : t('sound.off')" :title="muted ? t('sound.on') : t('sound.off')" @click="toggleSound">{{ muted ? '🔇' : '🔊' }}</button>
    </div>
    <h2 class="section-title">{{ t('section.raids') }}</h2>
    <div class="modes">
      <button class="mode-card" :class="{ current: mode === 'daily', done: todayStars > 0 }" @click="openDaily">
        <span class="mode-icon">📅</span>
        <span class="mode-text">
          <strong>{{ t('daily.title') }}</strong>
          <small>{{ dayLbl(today) }} · {{ todayStars ? '★'.repeat(todayStars) + '☆'.repeat(3 - todayStars) : t('daily.waiting') }}</small>
          <small>{{ t('daily.streak', { days: tn('days', streak) }) }}</small>
        </span>
      </button>
      <button class="mode-card" :class="{ current: mode === 'endless' }" @click="startEndless">
        <span class="mode-icon">♾️</span>
        <span class="mode-text">
          <strong>{{ t('endless.title') }}</strong>
          <small>{{ mode === 'endless' && !endless.over ? t('endless.round', { n: endless.round }) : t('endless.howFar') }}</small>
          <small>{{ t('endless.recordCard', { r: roundsText(modes.endless.best) }) }}</small>
        </span>
      </button>
    </div>
    <h2 class="section-title">{{ t('section.map') }}</h2>
    <LevelMap
      :worlds="worlds.map((w, i) => ({ ...w, name: wName(i) }))"
      :names="levels.map((_, i) => lvlName(i))" :stars="progress.stars" :unlocked="unlocked"
      :current="mode === 'campaign' ? current : -1" :t="t" @select="openLevel"
    />
    <h2 class="section-title">{{ t('section.shipyard') }} <small>★ {{ stars }}</small></h2>
    <div class="shipyard">
      <button
        v-for="sh in SHIPS" :key="sh.id" class="ship-card"
        :class="{ chosen: meta.ship === sh.id, locked: stars < sh.stars }"
        :disabled="stars < sh.stars" @click="chooseShip(sh.id)"
      >
        <span class="ship-pic" :style="shipPreview(sh.id)"></span>
        <strong>{{ shipName(sh.id) }}</strong>
        <small v-if="stars < sh.stars">🔒 ★ {{ sh.stars }}</small>
        <small v-else-if="meta.ship === sh.id">{{ t('ship.sailing') }}</small>
        <small v-else>{{ t('ship.choose') }}</small>
      </button>
    </div>
    <details class="panel">
      <summary>{{ t('section.achievements') }} <span>{{ earnedCount }}/{{ ACHIEVEMENTS.length }}</span></summary>
      <ul class="badges">
        <li v-for="a in achievementView" :key="a.id" :class="{ earned: a.earned }">
          <span class="badge-icon">{{ a.icon }}</span>
          <span class="badge-text"><strong>{{ a.title }}</strong><small>{{ a.text }}</small></span>
          <span v-if="!a.earned && a.progressText" class="badge-progress">{{ a.progressText }}</span>
        </li>
      </ul>
    </details>
    <details class="panel">
      <summary>{{ t('section.stats') }}</summary>
      <dl class="stat-list">
        <template v-for="[icon, label, value] in statRows" :key="label">
          <dt>{{ icon }} {{ label }}</dt><dd>{{ value }}</dd>
        </template>
      </dl>
    </details>
    <div class="toasts" aria-live="polite">
      <div v-for="item in toasts" :key="item.id" class="toast">
        <span class="toast-icon">{{ item.icon }}</span>
        <span><strong>{{ item.title }}</strong><small>{{ item.text }}</small></span>
      </div>
    </div>
    <p class="foot">{{ t('foot') }}</p>
  </main>
</template>
