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
  dateKey, dayLabel, tierFor, loadModes, saveModes, recordDailyWin, currentStreak, startEndlessRun, recordEndlessRound,
} from './game/modes'
import { requestLevel } from './game/levelGen'
import LevelMap from './components/LevelMap.vue'
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

// ---------- progress ----------
const progress = ref(loadProgress())
const modes = ref(loadModes())
const unlocked = computed(() => Math.min(progress.value.unlocked, levels.length - 1))
const current = ref(Math.min(unlocked.value, levels.length - 1))
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
const lossText = computed(() =>
  info.value.lossReason === 'slots-full'
    ? 'En viking hittade inget byte och fick ta skeppets sista väntplats.'
    : 'Kön är slut och ingen väntande viking kan plundra något mer.')
const par = computed(() => active.value.par)
const waitsText = (n: number) => `${n} ${n === 1 ? 'väntning' : 'väntningar'}`
const roundsText = (n: number) => `${n} ${n === 1 ? 'runda' : 'rundor'}`
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
function show(level: Level, title: string) {
  active.value = level
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
  show(levels[i], `${i + 1}. ${levels[i].name}`)
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
  const day = today.value, t = tier.value
  mode.value = 'daily'
  playingDay.value = day
  let level = cachedDaily(day, t)
  if (!level) {
    generating.value = true
    level = await requestLevel({ kind: 'daily', day, tier: t })
    if (my !== ticket) return
    cacheDaily(day, t, level)
    generating.value = false
  }
  show(level, `Dagens räd · ${dayLabel(day)}`)
}

async function playEndlessRound(level: Promise<Level>, round: number) {
  const my = ++ticket
  generating.value = true
  const l = await level
  if (my !== ticket) return
  generating.value = false
  endless.value = { ...endless.value, round, over: false }
  show(l, `Oändlig räd · runda ${round}`)
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
function restart() { if (!isEndless.value) scene?.restart() }
function undo() { if (!isEndless.value) scene?.undo() }
function showHint() {
  if (!scene || isEndless.value) return
  hintMsg.value = scene.showHint() ? '' : 'Inget drag räddar räden längre – ångra eller börja om.'
}
function next() { if (current.value < levels.length - 1) openLevel(current.value + 1) }

const muted = ref(isMuted())
function toggleSound() { setMuted(!muted.value); muted.value = isMuted(); unlockAudio() }
const music = ref(isMusicOn())
function toggleMusic() { setMusicOn(!music.value); music.value = isMusicOn() }

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
    scene?.reset(current.value)
  })
  maybeIntro()
})
onBeforeUnmount(() => { document.removeEventListener('visibilitychange', onVisible); game?.destroy(true) })
</script>

<template>
  <main class="shell">
    <div v-if="updateReady" class="update-banner" role="status">
      <span>⛵ Ny version finns</span>
      <button @click="reloadApp">Ladda om</button>
      <button class="close" aria-label="Senare" @click="updateReady = false">✕</button>
    </div>
    <header>
      <div class="logo"><h1>VIKING LOOT</h1><div class="eyebrow">The First Raid · 0.3</div></div>
      <p>Välj en av de tre främsta vikingarna. Plundra framifrån – och fyll aldrig skeppets tre väntplatser!</p>
    </header>
    <div class="stats">
      <span>🪙 Kvar: <strong>{{ info.remaining }}</strong></span>
      <span>🛡️ Kö: <strong>{{ info.queue }}</strong></span>
      <span :class="{ risk: info.waiting >= WAITING_SLOTS - 1 }">⛵ Väntar: <strong>{{ info.waiting }}/{{ WAITING_SLOTS }}</strong></span>
      <span title="Väntningar hittills / par för tre stjärnor">⭐ <strong>{{ info.waits }}</strong>/{{ par }}</span>
    </div>
    <p class="hint">💡 {{ hintMsg || active.hint }}</p>
    <div class="game-wrap">
      <div id="game"></div>
      <div v-if="generating" class="overlay">
        <div class="result generating">
          <div class="intro-icon spin">🧭</div>
          <h2>Kartlägger ön…</h2>
          <p>Lösaren letar fram en ö som går att vinna.</p>
        </div>
      </div>
      <div v-else-if="won || lost" class="overlay">
        <!-- Endless raid -->
        <div v-if="isEndless" class="result">
          <h2>{{ won ? `🏆 Runda ${endless.round} klarad!` : '💀 Räden är slut' }}</h2>
          <div v-if="won" class="result-stars" :aria-label="`${lastStars} av 3 stjärnor`">
            <i v-for="s in 3" :key="s" :class="{ on: s <= lastStars }" :style="{ animationDelay: `${s * 0.18}s` }">★</i>
          </div>
          <p v-if="won">Nästa ö blir svårare.<br /><small>Rekord: {{ roundsText(modes.endless.best) }}</small></p>
          <p v-else>
            {{ lossText }}<br />
            Du klarade <strong>{{ roundsText(endless.round - 1) }}</strong>.<br />
            <small v-if="endless.round - 1 > endless.bestBefore">🎉 Nytt rekord!</small>
            <small v-else>Rekord: {{ roundsText(modes.endless.best) }}</small>
          </p>
          <button v-if="won" @click="nextRound">Nästa runda →</button>
          <button v-else @click="startEndless">♾️ Ny oändlig räd</button>
        </div>
        <!-- Campaign and Dagens räd -->
        <div v-else class="result">
          <h2>{{ won ? '🏆 Seger!' : '💀 Räden misslyckades' }}</h2>
          <div v-if="won" class="result-stars" :aria-label="`${lastStars} av 3 stjärnor`">
            <i v-for="s in 3" :key="s" :class="{ on: s <= lastStars }" :style="{ animationDelay: `${s * 0.18}s` }">★</i>
          </div>
          <p v-if="won">
            Byn är plundrad på {{ info.moves }} drag med {{ waitsText(info.waits) }}.<br />
            <small v-if="lastStars < 3">Tre stjärnor: högst {{ waitsText(par) }}.</small>
            <small v-else>Perfekt räd!</small>
            <template v-if="mode === 'daily'">
              <br /><strong v-if="dailyCounted">🔥 Dagens räd är klar – svit: {{ streak }} {{ streak === 1 ? 'dag' : 'dagar' }}.</strong>
              <small v-else>Stjärnorna räknas på dagens första vinst. Ny ö i morgon!</small>
            </template>
            <template v-else-if="current === levels.length - 1"><br /><strong>⚔️ Du har plundrat hela Norden – alla {{ levels.length }} räder är klara!</strong></template>
          </p>
          <p v-else>{{ lossText }}</p>
          <button v-if="won && mode === 'campaign' && current < levels.length - 1" @click="next">Nästa bana →</button>
          <button v-if="lost && info.canUndo" @click="undo">↶ Ångra</button>
          <button @click="restart">{{ won ? 'Spela igen' : '↻ Försök igen' }}</button>
        </div>
      </div>
      <div v-if="intro && !generating" class="overlay">
        <div class="result intro">
          <div class="intro-icon">{{ INTROS[intro].icon }}</div>
          <h2>{{ INTROS[intro].title }}</h2>
          <p>{{ INTROS[intro].text }}</p>
          <button @click="closeIntro">Uppfattat!</button>
        </div>
      </div>
    </div>
    <div class="actions">
      <button :disabled="isEndless" @click="restart">↻ Starta om</button>
      <button :disabled="isEndless || !info.canUndo || info.busy" @click="undo">↶ Ångra</button>
      <button :disabled="isEndless || info.busy || info.status !== 'playing'" @click="showHint">💡 Tips</button>
      <button class="icon" :class="{ off: !music }" :aria-label="music ? 'Stäng av musik' : 'Slå på musik'" :title="music ? 'Musik på' : 'Musik av'" @click="toggleMusic">🎵</button>
      <button class="icon" :aria-label="muted ? 'Slå på ljudeffekter' : 'Stäng av ljudeffekter'" :title="muted ? 'Effekter av' : 'Effekter på'" @click="toggleSound">{{ muted ? '🔇' : '🔊' }}</button>
    </div>
    <h2 class="section-title">Räder</h2>
    <div class="modes">
      <button class="mode-card" :class="{ current: mode === 'daily', done: todayStars > 0 }" @click="openDaily">
        <span class="mode-icon">📅</span>
        <span class="mode-text">
          <strong>Dagens räd</strong>
          <small>{{ dayLabel(today) }} · {{ todayStars ? '★'.repeat(todayStars) + '☆'.repeat(3 - todayStars) : 'ny ö väntar' }}</small>
          <small>🔥 {{ streak }} {{ streak === 1 ? 'dag' : 'dagar' }} i rad</small>
        </span>
      </button>
      <button class="mode-card" :class="{ current: mode === 'endless' }" @click="startEndless">
        <span class="mode-icon">♾️</span>
        <span class="mode-text">
          <strong>Oändlig räd</strong>
          <small>{{ mode === 'endless' && !endless.over ? `Runda ${endless.round}` : 'Hur långt når du?' }}</small>
          <small>🏆 Rekord: {{ roundsText(modes.endless.best) }}</small>
        </span>
      </button>
    </div>
    <h2 class="section-title">Karta</h2>
    <LevelMap :worlds="worlds" :names="levels.map(l => l.name)" :stars="progress.stars" :unlocked="unlocked" :current="mode === 'campaign' ? current : -1" @select="openLevel" />
    <p class="foot">Vikingar, skatter, skepp och ö är 3D-renderade i Blender. Ljud och musik är syntetiserade i webbläsaren.</p>
  </main>
</template>
