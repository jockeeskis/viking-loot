<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import Phaser from 'phaser'
import { RaidScene, type RaidUpdate } from './game/RaidScene'
import { levels } from './game/levels'
import { WAITING_SLOTS } from './game/engine'
import { isMuted, setMuted, unlockAudio } from './game/sfx'

// Levels were redesigned in 0.2, so progress from 0.1 is not carried over.
const STORAGE_KEY = 'viking-loot-0.2-unlocked'
function readUnlocked() {
  try { return Math.min(Number(localStorage.getItem(STORAGE_KEY) || '0'), levels.length - 1) } catch { return 0 }
}

const current = ref(0)
const unlocked = ref(readUnlocked())
const info = ref<RaidUpdate>({ level: 0, status: 'playing', lossReason: null, remaining: 0, queue: 0, waiting: 0, moves: 0 })
const won = computed(() => info.value.status === 'won')
const lost = computed(() => info.value.status === 'lost')
const lossText = computed(() =>
  info.value.lossReason === 'slots-full'
    ? 'En viking hittade inget byte och fick ta skeppets sista väntplats.'
    : 'Kön är slut och ingen väntande viking kan plundra något mer.')

let game: Phaser.Game | undefined
let scene: RaidScene | undefined

function update(d: RaidUpdate) {
  info.value = d
  if (d.status === 'won' && d.level >= unlocked.value && d.level < levels.length - 1) {
    unlocked.value = d.level + 1
    try { localStorage.setItem(STORAGE_KEY, String(unlocked.value)) } catch { /* private mode */ }
  }
}
function openLevel(i: number) { if (i > unlocked.value) return; current.value = i; scene?.reset(i) }
function restart() { scene?.reset(current.value) }
const muted = ref(isMuted())
function toggleSound() { setMuted(!muted.value); muted.value = isMuted(); unlockAudio() }

function next() { if (current.value < levels.length - 1) openLevel(current.value + 1) }

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
})
onBeforeUnmount(() => game?.destroy(true))
</script>

<template>
  <main class="shell">
    <header>
      <div class="logo"><h1>VIKING LOOT</h1><div class="eyebrow">The First Raid · 0.2</div></div>
      <p>Välj en av de tre främsta vikingarna. Plundra framifrån – och fyll aldrig skeppets tre väntplatser!</p>
    </header>
    <div class="stats">
      <span>🪙 Kvar: <strong>{{ info.remaining }}</strong></span>
      <span>🛡️ Kö: <strong>{{ info.queue }}</strong></span>
      <span :class="{ risk: info.waiting >= WAITING_SLOTS - 1 }">⛵ Väntar: <strong>{{ info.waiting }}/{{ WAITING_SLOTS }}</strong></span>
      <span>🏝️ {{ current + 1 }}/{{ levels.length }}</span>
    </div>
    <p class="hint">💡 {{ levels[current].hint }}</p>
    <div class="game-wrap">
      <div id="game"></div>
      <div v-if="won || lost" class="overlay">
        <div class="result">
          <h2>{{ won ? '🏆 Seger!' : '💀 Räden misslyckades' }}</h2>
          <p>{{ won ? `Byn är plundrad på ${info.moves} drag!` : lossText }}</p>
          <button v-if="won && current < levels.length - 1" @click="next">Nästa bana →</button>
          <button @click="restart">{{ won ? 'Spela igen' : '↻ Försök igen' }}</button>
        </div>
      </div>
    </div>
    <div class="actions"><button @click="restart">↻ Starta om</button><span>{{ levels[current].name }}</span><button :aria-label="muted ? 'Slå på ljud' : 'Stäng av ljud'" @click="toggleSound">{{ muted ? '🔇' : '🔊' }}</button></div>
    <h2 class="section-title">Välj bana</h2>
    <div class="levels">
      <button v-for="(l, i) in levels" :key="l.name" :disabled="i > unlocked" :class="{ active: current === i }" @click="openLevel(i)">{{ i > unlocked ? '🔒' : i + 1 }}</button>
    </div>
    <p class="foot">Vikingar, skatter och skepp är 3D-renderade i Blender. Ljuden är syntetiserade i webbläsaren.</p>
  </main>
</template>
