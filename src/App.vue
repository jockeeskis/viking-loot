<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import Phaser from 'phaser'
import { RaidScene, type RaidUpdate } from './game/RaidScene'
import { levels, worlds } from './game/levels'
import { WAITING_SLOTS } from './game/engine'
import { isMuted, setMuted, unlockAudio } from './game/sfx'
import { loadProgress, saveProgress, recordWin, starsFor } from './game/progress'
import { INTROS, mechanicsOf, type Mechanic } from './game/intros'
import LevelMap from './components/LevelMap.vue'

const progress = ref(loadProgress())
const unlocked = computed(() => Math.min(progress.value.unlocked, levels.length - 1))
const current = ref(Math.min(unlocked.value, levels.length - 1))
const info = ref<RaidUpdate>({
  level: 0, busy: false, canUndo: false, waits: 0, status: 'playing', lossReason: null, remaining: 0, queue: 0, waiting: 0, moves: 0,
})
// The engine decides the outcome before the animation plays, so results are only shown once it is done.
const won = computed(() => info.value.status === 'won' && !info.value.busy)
const lost = computed(() => info.value.status === 'lost' && !info.value.busy)
const lastStars = ref(0)
const lossText = computed(() =>
  info.value.lossReason === 'slots-full'
    ? 'En viking hittade inget byte och fick ta skeppets sista väntplats.'
    : 'Kön är slut och ingen väntande viking kan plundra något mer.')
const par = computed(() => levels[current.value].par)
const waitsText = (n: number) => `${n} ${n === 1 ? 'väntning' : 'väntningar'}`

let game: Phaser.Game | undefined
let scene: RaidScene | undefined

function update(d: RaidUpdate) {
  // While a move animates, keep the numbers from before the move; only the busy flags change.
  if (d.busy) { info.value = { ...info.value, busy: true, canUndo: false }; return }
  const justWon = d.status === 'won' && info.value.status !== 'won'
  info.value = d
  hintMsg.value = ''
  if (justWon) {
    lastStars.value = starsFor(d.waits, levels[d.level].par)
    progress.value = recordWin(progress.value, d.level, lastStars.value, levels.length)
    saveProgress(progress.value)
  }
}

// ---------- introductions for new mechanics ----------
const intro = ref<Mechanic | null>(null)
function maybeIntro(i: number) {
  intro.value = mechanicsOf(levels[i]).find(m => !progress.value.seenIntros.includes(m)) ?? null
}
function closeIntro() {
  if (!intro.value) return
  progress.value = { ...progress.value, seenIntros: [...progress.value.seenIntros, intro.value] }
  saveProgress(progress.value)
  maybeIntro(current.value) // a level may introduce more than one thing
}

// ---------- actions ----------
const hintMsg = ref('')
function openLevel(i: number) {
  if (i > unlocked.value) return
  current.value = i
  scene?.reset(i)
  maybeIntro(i)
  document.querySelector('.game-wrap')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
}
function restart() { scene?.reset(current.value) }
function undo() { scene?.undo() }
function showHint() {
  if (!scene) return
  hintMsg.value = scene.showHint() ? '' : 'Inget drag räddar räden längre – ångra eller börja om.'
}
function next() { if (current.value < levels.length - 1) openLevel(current.value + 1) }

const muted = ref(isMuted())
function toggleSound() { setMuted(!muted.value); muted.value = isMuted(); unlockAudio() }

onMounted(() => {
  window.addEventListener('pointerdown', unlockAudio, { once: true })
  scene = new RaidScene()
  game = new Phaser.Game({
    type: Phaser.AUTO, parent: 'game', width: 720, height: 1280, backgroundColor: '#193a4b',
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    render: { pixelArt: false, antialias: true }, scene: [scene],
  })
  if (import.meta.env.DEV) (window as unknown as { __game?: Phaser.Game }).__game = game // for debugging in the console
  game.events.once(Phaser.Core.Events.READY, () => { scene?.setUpdate(update); scene?.reset(current.value) })
  maybeIntro(current.value)
})
onBeforeUnmount(() => game?.destroy(true))
</script>

<template>
  <main class="shell">
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
    <p class="hint">💡 {{ hintMsg || levels[current].hint }}</p>
    <div class="game-wrap">
      <div id="game"></div>
      <div v-if="won || lost" class="overlay">
        <div class="result">
          <h2>{{ won ? '🏆 Seger!' : '💀 Räden misslyckades' }}</h2>
          <div v-if="won" class="result-stars" :aria-label="`${lastStars} av 3 stjärnor`">
            <i v-for="s in 3" :key="s" :class="{ on: s <= lastStars }" :style="{ animationDelay: `${s * 0.18}s` }">★</i>
          </div>
          <p v-if="won">
            Byn är plundrad på {{ info.moves }} drag med {{ waitsText(info.waits) }}.<br />
            <small v-if="lastStars < 3">Tre stjärnor: högst {{ waitsText(par) }}.</small>
            <small v-else>Perfekt räd!</small>
          </p>
          <p v-else>{{ lossText }}</p>
          <button v-if="won && current < levels.length - 1" @click="next">Nästa bana →</button>
          <button v-if="lost && info.canUndo" @click="undo">↶ Ångra</button>
          <button @click="restart">{{ won ? 'Spela igen' : '↻ Försök igen' }}</button>
        </div>
      </div>
      <div v-if="intro" class="overlay">
        <div class="result intro">
          <div class="intro-icon">{{ INTROS[intro].icon }}</div>
          <h2>{{ INTROS[intro].title }}</h2>
          <p>{{ INTROS[intro].text }}</p>
          <button @click="closeIntro">Uppfattat!</button>
        </div>
      </div>
    </div>
    <div class="actions">
      <button @click="restart">↻ Starta om</button>
      <button :disabled="!info.canUndo || info.busy" @click="undo">↶ Ångra</button>
      <button :disabled="info.busy || info.status !== 'playing'" @click="showHint">💡 Tips</button>
      <button class="icon" :aria-label="muted ? 'Slå på ljud' : 'Stäng av ljud'" @click="toggleSound">{{ muted ? '🔇' : '🔊' }}</button>
    </div>
    <h2 class="section-title">Karta</h2>
    <LevelMap :worlds="worlds" :names="levels.map(l => l.name)" :stars="progress.stars" :unlocked="unlocked" :current="current" @select="openLevel" />
    <p class="foot">Vikingar, skatter, skepp och ö är 3D-renderade i Blender. Ljuden är syntetiserade i webbläsaren.</p>
  </main>
</template>
