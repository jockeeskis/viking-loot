<script setup lang="ts">
import { ref, computed, shallowRef, watch, onMounted, onBeforeUnmount } from 'vue'
import Phaser from 'phaser'
import { RaidScene, type RaidUpdate } from './game/RaidScene'
import { levels, worlds, type Level } from './game/levels'
import { WAITING_SLOTS } from './game/engine'
import { isMuted, setMuted, unlockAudio, isMusicOn, setMusicOn } from './game/sfx'
import { loadProgress, saveProgress, recordWin, recordBossWin, bossUnlocked, seeStory, starsFor } from './game/progress'
import { bosses, bossOf } from './game/bosses'
import { STORY, storyCard, worldStory, bossStory, type StoryId } from './game/story'
import StoryCard from './components/StoryCard.vue'
import { INTROS, mechanicsOf, type Mechanic } from './game/intros'
import {
  dateKey, tierFor, type Tier, loadModes, saveModes, recordDailyWin, currentStreak, startEndlessRun, recordEndlessRound,
} from './game/modes'
import { requestLevel } from './game/levelGen'
import {
  ACHIEVEMENTS, SHIPS, loadMeta, saveMeta, migrate, newlyEarned, unlock, recordRaid, lootOf, totalStars, shipUnlocked, unlockedShips,
  type ShipId,
} from './game/achievements'
import { shipSheet, cosmeticSheet } from './game/assets'
import { COSMETICS, equip, owns, allOwned, overlayOf, cosmetic, type Slot, type Source, type OwnCtx } from './game/cosmetics'
import { RELICS } from './game/relics'
import LevelMap from './components/LevelMap.vue'
import SettingsPanel from './components/Settings.vue'
import {
  t as tt, tn as ttn, tr as ttr, getLang, setLang, detectLang, levelName, levelHint, worldName, dayLabel, bossName, bossHint, say as tsay, whoText,
} from './game/i18n'
import { loadSettings, saveSettings, motionReduced, type Lang } from './game/settings'
import type { Text as FeedbackText } from './game/feedback'
import { wantsTutorial, nextStep, TARGET, TUTORIAL_ID, type TutorialStep } from './game/tutorial'
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
const base = import.meta.env.BASE_URL

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
const bName = (w: number) => { void lang.value; return bossName(w) }
const showSettings = ref(false)
function changeSetting(key: 'vibration' | 'colorMarks' | 'reducedMotion' | 'batterySaver', on: boolean) {
  settings.value = { ...settings.value, [key]: on }
  saveSettings(settings.value)
  if (key === 'vibration') { setVibration(on); if (on) haptics.test() }
  else if (key === 'colorMarks') scene?.setColorMarks(on)
  else applyMotion()
}
const reduced = computed(() => motionReduced(settings.value))
/** Less motion and the battery saver (0.6). The frame rate changes at once; smoothing on the next start. */
function applyMotion() {
  scene?.setMotion(reduced.value, settings.value.batterySaver)
  const loop = game?.loop as unknown as { fpsLimit: number; hasFpsLimit: boolean; _limitRate: number; sleep(): void; wake(seamless?: boolean): void } | undefined
  if (!loop) return
  const limit = settings.value.batterySaver ? 30 : 0
  if (loop.fpsLimit === limit) return
  loop.sleep()
  loop.fpsLimit = limit; loop.hasFpsLimit = limit > 0; loop._limitRate = limit ? 1000 / limit : 0
  loop.wake(true)
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
type Mode = 'campaign' | 'daily' | 'endless' | 'boss'
const mode = ref<Mode>('campaign')
const bossWorld = ref(0) // the boss being fought (mode 'boss')
const active = shallowRef<Level>(levels[current.value])
const today = ref(dateKey(new Date()))
const playingDay = ref('') // the day of the Dagens räd being played
const endless = ref({ round: 0, runSeed: 0, tier: 0 as Tier, over: false, bestBefore: 0 })
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
// 0.6: the loss is explained (which colours the waiting vikings wanted, or how much loot was left),
// and "Var gick det fel?" names the move after which the raid could no longer be won.
const lossWhy = shallowRef<FeedbackText | null>(null)
const say = (x: FeedbackText) => { void lang.value; return tsay(x) }
const lossText = computed(() => (lossWhy.value ? say(lossWhy.value) : t(info.value.lossReason === 'slots-full' ? 'loss.full' : 'loss.stuck')))
const wrong = shallowRef<ReturnType<RaidScene['whereWrong']> | 'none' | null>(null)
const wrongText = computed(() => {
  void lang.value
  const w = wrong.value
  if (!w) return ''
  if (w === 'none') return t('fatal.none')
  const text = t('fatal.text', { n: w.move, who: whoText(w.who) })
  return w.last && !isEndless.value ? `${text} ${t('fatal.undo')}` : text
})
function whereWrong() { wrong.value = scene?.whereWrong() ?? 'none' }
const par = computed(() => active.value.par)
const mainSlots = computed(() => active.value.ships?.[0]?.slots ?? WAITING_SLOTS)
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
  if (d.status !== 'lost') { lossWhy.value = null; wrong.value = null }
  if (justLost) lossWhy.value = scene?.explainLoss() ?? null
  if (tutorial.value === 'send' && d.moves > 0) advanceTutorial('moved')
  if (tutorial.value && d.status !== 'playing') endTutorial()
  if (justWon) {
    lastStars.value = starsFor(d.waits, active.value.par)
    const shipsBefore = unlockedShips(progress.value)
    const rewardsBefore = allOwned(ownCtx.value)
    if (mode.value === 'campaign') {
      const openBefore = bosses.filter(b => bossUnlocked(progress.value, worlds[b.world].last)).length
      progress.value = recordWin(progress.value, current.value, lastStars.value, levels.length)
      saveProgress(progress.value)
      const boss = bosses.find(b => worlds[b.world].last === current.value)
      if (boss && bosses.filter(b => bossUnlocked(progress.value, worlds[b.world].last)).length > openBefore) {
        toast(boss.icon, t('toast.boss', { name: bName(boss.world) }), t('toast.bossText'))
      }
    } else if (mode.value === 'boss') {
      progress.value = recordBossWin(progress.value, bossWorld.value, lastStars.value)
      saveProgress(progress.value)
      queueStory(bossStory(bossWorld.value, 'after'))
      // The first four bosses free Muspelheim ('finale'); all five, Loke too, end the story ('finale-2').
      const beaten = (b: (typeof bosses)[number]) => (progress.value.bossStars[b.world] ?? 0) > 0
      if (bosses.filter(b => b.world <= 3).every(beaten)) queueStory('finale')
      if (bosses.every(beaten)) queueStory('finale-2')
    } else if (mode.value === 'daily') {
      dailyCounted.value = !modes.value.daily.results[playingDay.value]
      modes.value = recordDailyWin(modes.value, playingDay.value, lastStars.value)
      saveModes(modes.value)
    } else {
      modes.value = recordEndlessRound(modes.value, endless.value.round)
      saveModes(modes.value)
    }
    const { loot, chests, kegs } = lootOf(active.value)
    meta.value = {
      ...meta.value,
      stats: recordRaid(meta.value.stats, {
        mode: mode.value, stars: lastStars.value, par: active.value.par, loot, chests, kegs, usedUndo, usedHint,
      }),
    }
    checkAchievements()
    for (const id of unlockedShips(progress.value)) {
      if (!shipsBefore.includes(id)) toast('⛵', t('toast.ship', { name: shipName(id) }), t('toast.shipText'))
    }
    for (const id of allOwned(ownCtx.value)) if (!rewardsBefore.includes(id)) toastReward(id)
  }
  if (justLost && mode.value === 'endless') endless.value = { ...endless.value, over: true }
}

// ---------- the story (0.5) ----------
// Cards wait in a queue; each is shown once (re-reading from Krönikan is always allowed).
const storyQueue = ref<StoryId[]>([])
const story = computed(() => storyCard(storyQueue.value[0] ?? '') ?? null)
function queueStory(id: StoryId | null, again = false) {
  if (!id || storyQueue.value.includes(id) || (!again && progress.value.seenStory.includes(id))) return
  storyQueue.value = [...storyQueue.value, id]
}
function closeStory() {
  const id = storyQueue.value[0]
  if (!id) return
  storyQueue.value = storyQueue.value.slice(1)
  progress.value = seeStory(progress.value, id)
  saveProgress(progress.value)
  if (!storyQueue.value.length) scene?.bossEntrance()
}
const showChronicle = ref(false)
const chronicle = computed(() => STORY.filter(c => progress.value.seenStory.includes(c.id)))
function readAgain(id: StoryId) { showChronicle.value = false; queueStory(id, true) }

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

// ---------- the guided first raid (0.6) ----------
const tutorial = ref<TutorialStep | null>(null)
/** Starts once the story card and any intro are closed, on level 1 for a new player. */
function maybeTutorial() {
  if (tutorial.value || story.value || intro.value) return
  if (!wantsTutorial(progress.value, mode.value === 'campaign' ? current.value : null)) return
  tutorial.value = 'send'
  scene?.pointAt(TARGET.send)
}
function advanceTutorial(input: 'moved' | 'ok') {
  if (!tutorial.value) return
  const n = nextStep(tutorial.value, input)
  if (n === null) { endTutorial(); return }
  tutorial.value = n
  scene?.pointAt(TARGET[n])
}
function endTutorial() {
  tutorial.value = null
  scene?.pointAt(null)
  progress.value = seeStory(progress.value, TUTORIAL_ID)
  saveProgress(progress.value)
}
watch([() => story.value, () => intro.value], () => maybeTutorial())

// ---------- starting raids ----------
/** Show a level. `key` identifies it for the one-hint rule (titles change with the language). */
function show(level: Level, title: string, key: string) {
  active.value = level
  usedUndo = usedHint = false
  hintFor = key
  hintsLeft.value = hintsUsed.has(key) ? 0 : HINTS_PER_LEVEL
  info.value = { ...info.value, status: 'playing', busy: false }
  if (tutorial.value) { tutorial.value = null; scene?.pointAt(null) } // leaving level 1 ends the tour for now
  scene?.play(level, title, mode.value === 'boss' ? bossOf(bossWorld.value)?.id : undefined)
  maybeIntro()
  maybeTutorial()
  document.querySelector('.game-wrap')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

function openLevel(i: number) {
  if (i > unlocked.value) return
  ticket++
  generating.value = false
  mode.value = 'campaign'
  current.value = i
  show(levels[i], currentTitle(), `c${i}`)
  const w = worlds.findIndex(x => x.first === i)
  if (w >= 0) queueStory(worldStory(w))
}

function openBoss(w: number) {
  const boss = bossOf(w)
  if (!boss || !bossUnlocked(progress.value, worlds[w].last)) return
  ticket++
  generating.value = false
  mode.value = 'boss'
  bossWorld.value = w
  show(boss.level, currentTitle(), `b${w}`)
  queueStory(bossStory(w, 'before'))
  if (!story.value) scene?.bossEntrance()
}
/** After winning a world's last level, the result offers its boss. */
const nextBoss = computed(() => {
  if (mode.value !== 'campaign') return null
  const b = bosses.find(x => worlds[x.world].last === current.value)
  return b && bossUnlocked(progress.value, worlds[b.world].last) ? b : null
})
function toMap() { document.querySelector('.map-title')?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }

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
  if (mode.value === 'boss') return t('boss.title', { name: bossName(bossWorld.value) })
  return `${current.value + 1}. ${levelName(current.value)}`
}
const activeHint = computed(() => {
  void lang.value
  if (mode.value === 'daily') return t('daily.hint')
  if (mode.value === 'endless') return t('endless.hint')
  if (mode.value === 'boss') return bossHint(bossWorld.value)
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
const bossCards = computed(() => bosses.map(b => ({
  world: b.world, icon: b.icon, name: bName(b.world), stars: progress.value.bossStars[b.world] ?? 0,
  open: bossUnlocked(progress.value, worlds[b.world].last), current: mode.value === 'boss' && bossWorld.value === b.world,
})))
const earnedCount = computed(() => achievementView.value.filter(a => a.earned).length)
const stars = computed(() => totalStars(progress.value))
function chooseShip(id: ShipId) {
  if (!shipUnlocked(id, progress.value)) return
  meta.value = { ...meta.value, ship: id }
  saveMeta(meta.value)
  scene?.setShip(id)
}
// ---------- sails, shields and the album (0.6) ----------
const yardTab = ref<'ship' | Slot>('ship')
const showAlbum = ref(false)
const ownCtx = computed<OwnCtx>(() => ({ unlocked: meta.value.unlocked, owned: meta.value.owned, bossStars: progress.value.bossStars }))
const looks = () => [overlayOf(meta.value.sail), overlayOf(meta.value.shields)] as const
function chooseLook(id: string) {
  const next = equip(meta.value, id, ownCtx.value)
  if (next === meta.value) return
  meta.value = next
  saveMeta(meta.value)
  scene?.setLooks(...looks())
}
const cosName = (id: string) => { const c = cosmetic(id)!; return tr(c.name, `cos.${id}.name`) }
const cosText = (id: string) => { const c = cosmetic(id)!; return tr(c.text, `cos.${id}.text`) }
const relicName = (r: (typeof RELICS)[number]) => tr(r.name, `relic.${r.id}.name`)
const relicText = (r: (typeof RELICS)[number]) => tr(r.text, `relic.${r.id}.text`)
/** Where a locked cosmetic or relic is found. */
function sourceText(src: Source) {
  if (src.kind === 'achievement') {
    const a = ACHIEVEMENTS.find(x => x.id === src.id)
    return a ? t('reward.fromAch', { t: achTitle(a) }) : ''
  }
  if (src.kind === 'boss') { const b = bosses.find(x => x.id === src.id); return b ? t('reward.fromBoss', { name: bName(b.world) }) : '' }
  if (src.kind === 'event') return t('reward.fromEvent', { name: t(`event.${src.id}`) })
  if (src.kind === 'weekly') return t('reward.fromWeekly')
  return ''
}
/** The reward an achievement gives, shown under it in the list. */
const rewardOf = (achId: string) => COSMETICS.find(c => c.source.kind === 'achievement' && c.source.id === achId)
function toastReward(id: string) {
  const c = cosmetic(id)
  if (c) { toast(c.slot === 'sail' ? '⛵' : '🛡️', t(c.slot === 'sail' ? 'toast.sail' : 'toast.shields', { name: cosName(id) }), t('toast.lookText')); return }
  const r = RELICS.find(x => x.id === id)
  if (r) toast(r.icon, t('toast.relic', { name: relicName(r) }), t('toast.relicText'))
}
const yardCards = computed(() => yardTab.value === 'ship' ? [] : COSMETICS.filter(c => c.slot === yardTab.value).map(c => ({
  id: c.id, owned: owns(c.id, ownCtx.value), chosen: meta.value[c.slot] === c.id, lock: sourceText(c.source),
})))
const albumView = computed(() => RELICS.map(r => ({ ...r, owned: owns(r.id, ownCtx.value), lock: sourceText(r.source) })))
const albumCount = computed(() => albumView.value.filter(r => r.owned).length)
/** A longship card: the ship's sheet with the chosen (or tried) sail and shields on top, frame 0. */
const shipPreview = (id: string, sail = meta.value.sail, shields = meta.value.shields) => {
  const urls = [overlayOf(sail), overlayOf(shields)].filter(Boolean).map(x => cosmeticSheet(x!)).filter(Boolean)
  const sheet = shipSheet(id)
  if (sheet) urls.push(sheet)
  return urls.length ? { backgroundImage: urls.map(u => `url(${import.meta.env.BASE_URL}${u})`).join(', ') } : {}
}
const lookPreview = (id: string) => {
  const c = cosmetic(id)!
  return shipPreview(meta.value.ship, c.slot === 'sail' ? id : meta.value.sail, c.slot === 'shields' ? id : meta.value.shields)
}
const statRows = computed(() => {
  const s = meta.value.stats
  return [
    ['🏆', t('stat.raids'), s.raidsWon],
    ['🪙', t('stat.loot'), s.lootTaken],
    ['✨', t('stat.perfect'), s.perfectRaids],
    ['🗝️', t('stat.chests'), s.chestsOpened],
    ['💥', t('stat.kegs'), s.kegsBlown],
    ['⭐', t('stat.stars'), `${stars.value}/${(levels.length + bosses.length) * 3}`],
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
    render: { pixelArt: false, antialias: !settings.value.batterySaver }, scene: [scene],
    fps: settings.value.batterySaver ? { limit: 30 } : {},
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
    scene?.setLooks(...looks())
    scene?.setColorMarks(settings.value.colorMarks)
    scene?.setMotion(reduced.value, settings.value.batterySaver)
    scene?.play(levels[current.value], currentTitle())
    if (tutorial.value) scene?.pointAt(TARGET[tutorial.value])
  })
  queueStory('start')
  maybeIntro()
  maybeTutorial()
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
      <span :class="{ risk: info.waiting >= mainSlots - 1 }">⛵ {{ t('stats.waiting') }}: <strong>{{ info.waiting }}/{{ mainSlots }}</strong></span>
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
            <template v-if="wrongText"><br /><small class="wrong">{{ wrongText }}</small></template>
          </p>
          <button v-if="lost && !wrong" class="soft" @click="whereWrong">{{ t('fatal.button') }}</button>
          <button v-if="won" @click="nextRound">{{ t('endless.next') }}</button>
          <button v-else @click="startEndless">{{ t('endless.new') }}</button>
        </div>
        <!-- Campaign and the daily raid -->
        <div v-else class="result">
          <h2>{{ won ? (mode === 'boss' ? t('boss.won', { name: bName(bossWorld) }) : t('result.win')) : t('result.lose') }}</h2>
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
            <template v-else-if="mode === 'campaign' && current === levels.length - 1"><br /><strong>{{ t('result.allDone', { n: levels.length }) }}</strong></template>
          </p>
          <p v-else>{{ lossText }}<template v-if="wrongText"><br /><small class="wrong">{{ wrongText }}</small></template></p>
          <button v-if="lost && !wrong" class="soft" @click="whereWrong">{{ t('fatal.button') }}</button>
          <button v-if="won && nextBoss" @click="openBoss(nextBoss.world)">{{ t('result.boss', { name: bName(nextBoss.world) }) }}</button>
          <button v-if="won && mode === 'campaign' && current < levels.length - 1" @click="next">{{ t('result.next') }}</button>
          <button v-if="won && mode === 'boss'" @click="toMap">{{ t('result.map') }}</button>
          <button v-if="lost && info.canUndo" @click="undo">{{ t('actions.undo') }}</button>
          <button @click="restart">{{ won ? t('result.again') : t('result.retry') }}</button>
        </div>
      </div>
      <div v-if="intro && !generating && !story" class="overlay">
        <div class="result intro">
          <div class="intro-icon">{{ introText(intro).icon }}</div>
          <h2>{{ introText(intro).title }}</h2>
          <p>{{ introText(intro).text }}</p>
          <button @click="closeIntro">{{ t('intro.ok') }}</button>
        </div>
      </div>
      <div v-if="tutorial && !story && !intro && !generating && !won && !lost" class="tutorial" role="status">
        <img class="tutorial-face" :src="`${base}assets/characters/ragnar/portrait.webp`" alt="Ragnar" />
        <div>
          <p>{{ t(`tutorial.${tutorial}`) }}</p>
          <div class="tutorial-buttons">
            <button class="skip" @click="endTutorial">{{ t('tutorial.skip') }}</button>
            <button v-if="tutorial !== 'send'" @click="advanceTutorial('ok')">{{ tutorial === 'goal' ? t('tutorial.done') : t('tutorial.ok') }}</button>
          </div>
        </div>
      </div>
      <StoryCard v-if="story" :key="story.id" :card="story" :lang="lang" :t="t" @close="closeStory" />
      <div v-if="showChronicle" class="overlay" @click.self="showChronicle = false">
        <div class="result chronicle">
          <h2>{{ t('chronicle.title') }}</h2>
          <p><small>{{ chronicle.length ? t('chronicle.text') : t('chronicle.empty') }}</small></p>
          <ul>
            <li v-for="c in chronicle" :key="c.id"><button @click="readAgain(c.id)">{{ c.icon }} {{ c.title[lang] }}</button></li>
          </ul>
          <button class="close-btn" @click="showChronicle = false">{{ t('story.close') }}</button>
        </div>
      </div>
      <div v-if="showAlbum" class="overlay" @click.self="showAlbum = false">
        <div class="result album">
          <h2>{{ t('album.title') }} <small>{{ albumCount }}/{{ RELICS.length }}</small></h2>
          <p><small>{{ t('album.text') }}</small></p>
          <ul>
            <li v-for="r in albumView" :key="r.id" :class="{ owned: r.owned }">
              <span class="relic-icon">{{ r.owned ? r.icon : '❔' }}</span>
              <span><strong>{{ r.owned ? relicName(r) : t('album.unknown') }}</strong><small>{{ r.owned ? relicText(r) : r.lock }}</small></span>
            </li>
          </ul>
          <button class="close-btn" @click="showAlbum = false">{{ t('story.close') }}</button>
        </div>
      </div>
      <SettingsPanel
        v-if="showSettings" :t="t" :lang="lang" :music="music" :sound="!muted"
        :vibration="settings.vibration" :color-marks="settings.colorMarks"
        :reduced-motion="reduced" :battery-saver="settings.batterySaver"
        @reduced-motion="changeSetting('reducedMotion', $event)" @battery-saver="changeSetting('batterySaver', $event)"
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
    <h2 class="section-title map-title">{{ t('section.map') }} <button class="chronicle-btn" @click="showChronicle = true">{{ t('map.chronicle') }}</button><button class="chronicle-btn" @click="showAlbum = true">{{ t('map.album') }}</button></h2>
    <LevelMap
      :worlds="worlds.map((w, i) => ({ ...w, name: wName(i) }))"
      :names="levels.map((_, i) => lvlName(i))" :stars="progress.stars" :unlocked="unlocked"
      :current="mode === 'campaign' ? current : -1" :t="t"
      :bosses="bossCards" @select="openLevel" @boss="openBoss"
    />
    <h2 class="section-title">{{ t('section.shipyard') }} <small>★ {{ stars }}</small></h2>
    <div class="yard-tabs" role="tablist">
      <button v-for="tab in (['ship', 'sail', 'shields'] as const)" :key="tab" role="tab" :aria-selected="yardTab === tab"
        :class="{ on: yardTab === tab }" @click="yardTab = tab">{{ t(`yard.${tab}`) }}</button>
    </div>
    <div v-if="yardTab !== 'ship'" class="shipyard">
      <button
        v-for="c in yardCards" :key="c.id" class="ship-card"
        :class="{ chosen: c.chosen, locked: !c.owned }" :disabled="!c.owned" @click="chooseLook(c.id)"
      >
        <span class="ship-pic" :style="lookPreview(c.id)"></span>
        <strong>{{ cosName(c.id) }}</strong>
        <small v-if="!c.owned">🔒 {{ c.lock }}</small>
        <small v-else-if="c.chosen">{{ t('ship.sailing') }}</small>
        <small v-else>{{ t('ship.choose') }}</small>
      </button>
    </div>
    <div v-else class="shipyard">
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
          <span class="badge-text"><strong>{{ a.title }}</strong><small>{{ a.text }}</small><small v-if="rewardOf(a.id)" class="badge-reward">🎁 {{ cosName(rewardOf(a.id)!.id) }}</small></span>
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
