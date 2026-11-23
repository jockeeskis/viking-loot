<script setup lang="ts">
// World map: each world is a winding path of islands with stars underneath.
import { computed } from 'vue'

type World = { name: string; first: number; last: number }
type BossCard = { world: number; icon: string; name: string; stars: number; open: boolean; current: boolean }
const props = defineProps<{
  worlds: World[]
  names: string[] // level names (only levels that exist)
  stars: number[]
  unlocked: number
  current: number
  t: (key: string, params?: Record<string, string | number>) => string
  bosses?: BossCard[]
}>()
const emit = defineEmits<{ select: [index: number]; boss: [world: number] }>()

const COLS = 4

const view = computed(() => props.worlds.map(w => {
  const last = Math.min(w.last, props.names.length - 1)
  const indices = last >= w.first ? Array.from({ length: last - w.first + 1 }, (_, k) => w.first + k) : []
  const rows = Math.ceil(indices.length / COLS)
  // Snake layout: even rows run left→right, odd rows right→left.
  const nodes = indices.map((index, k) => {
    const row = Math.floor(k / COLS)
    const col = row % 2 === 0 ? k % COLS : COLS - 1 - (k % COLS)
    return { index, row, col }
  })
  const world = props.worlds.indexOf(w)
  const path = nodes.map(n => `${n.col + 0.5},${n.row + 0.42}`).join(' ')
  const earned = indices.reduce((sum, i) => sum + (props.stars[i] ?? 0), 0)
  const status = !indices.length ? 'soon' : w.first > props.unlocked ? 'locked' : 'open'
    const boss = props.bosses?.find(b => b.world === world)
  return { ...w, nodes, rows, path, earned: earned + (boss?.stars ?? 0), max: (indices.length + (boss ? 1 : 0)) * 3, status, boss }
}))
</script>

<template>
  <section v-for="w in view" :key="w.name" class="world">
    <div class="world-head">
      <h3>{{ w.name }}</h3>
      <span v-if="w.status === 'open'" class="total">★ {{ w.earned }}/{{ w.max }}</span>
    </div>
    <div v-if="w.status === 'soon'" class="world-locked">{{ t('map.soon') }}</div>
    <div v-else-if="w.status === 'locked'" class="world-locked">{{ t('map.locked', { n: w.first }) }}</div>
    <div v-else class="map" :style="{ gridTemplateRows: `repeat(${w.rows}, 86px)` }">
      <svg class="path" :viewBox="`0 0 ${COLS} ${w.rows}`" preserveAspectRatio="none" aria-hidden="true">
        <polyline :points="w.path" />
      </svg>
      <button
        v-for="n in w.nodes" :key="n.index"
        class="node" :class="{ current: n.index === current, locked: n.index > unlocked, done: (stars[n.index] ?? 0) > 0 }"
        :style="{ gridRow: n.row + 1, gridColumn: n.col + 1 }"
        :disabled="n.index > unlocked"
        :title="names[n.index]"
        @click="emit('select', n.index)"
      >
        <span class="isle">{{ n.index > unlocked ? '🔒' : n.index + 1 }}</span>
        <span class="stars" :aria-label="t('stars.aria', { n: stars[n.index] ?? 0 })">
          <i v-for="s in 3" :key="s" :class="{ on: s <= (stars[n.index] ?? 0) }">★</i>
        </span>
      </button>
    </div>
    <button
      v-if="w.boss && w.status === 'open'" class="boss-node" :class="{ locked: !w.boss.open, current: w.boss.current, done: w.boss.stars > 0 }"
      :disabled="!w.boss.open" @click="emit('boss', w.boss.world)"
    >
      <span class="boss-icon">{{ w.boss.open ? w.boss.icon : '🔒' }}</span>
      <span class="boss-text">
        <strong>{{ t('map.boss', { name: w.boss.name }) }}</strong>
        <small v-if="!w.boss.open">{{ t('map.bossLocked', { world: w.name }) }}</small>
        <span v-else class="stars" :aria-label="t('stars.aria', { n: w.boss.stars })">
          <i v-for="s in 3" :key="s" :class="{ on: s <= w.boss.stars }">★</i>
        </span>
      </span>
    </button>
  </section>
</template>

<style scoped>
.world{margin:0 0 18px}
.world-head{display:flex;align-items:baseline;justify-content:space-between;margin:0 2px 8px}
.world-head h3{margin:0;font-family:"Arial Black","Segoe UI Black",Arial,sans-serif;font-size:16px;color:#ffd45a;text-shadow:0 2px 0 #3b2414}
.total{font-weight:800;color:#ffe3a8;font-size:13px}
.world-locked{padding:14px;border-radius:14px;background:#00000033;border:2px dashed #ffffff33;color:#cfe3ee;font-size:13px;text-align:center}
.map{position:relative;display:grid;grid-template-columns:repeat(4,1fr);padding:4px 0;border-radius:18px;background:radial-gradient(circle at 30% 20%,#2f8fd0,#1f6fb0);border:3px solid #3b2414;box-shadow:inset 0 0 0 2px #7cc4ef55}
.path{position:absolute;inset:4px 0;width:100%;height:calc(100% - 8px);pointer-events:none}
.path polyline{fill:none;stroke:#f3e3c5;stroke-width:4;stroke-dasharray:2 7;stroke-linecap:round;vector-effect:non-scaling-stroke;opacity:.85}
.node{position:relative;justify-self:center;align-self:start;margin-top:8px;display:flex;flex-direction:column;align-items:center;gap:3px;padding:0;background:none;border:0;box-shadow:none;cursor:pointer}
.node:active{transform:translateY(2px)}
.isle{display:grid;place-items:center;width:52px;height:46px;border-radius:50% 50% 46% 46%;background:radial-gradient(circle at 40% 35%,#86cc5b,#5fae45 60%,#3f7f2f);border:3px solid #3b2414;box-shadow:0 5px 0 #e6cf98,0 7px 0 #3b2414;font-family:"Arial Black","Segoe UI Black",Arial,sans-serif;font-size:18px;color:#fff;text-shadow:0 2px 0 #3b2414}
.node.current .isle{outline:3px solid #ffd45a;outline-offset:3px}
.node.locked{cursor:not-allowed}
.node.locked .isle{filter:grayscale(.8) brightness(.75);font-size:16px}
.stars{display:flex;gap:1px;font-style:normal;margin-top:4px}
.stars i{font-style:normal;font-size:13px;color:#00000055;text-shadow:0 1px 0 #ffffff22}
.stars i.on{color:#ffd45a;text-shadow:0 1px 0 #b86b12,0 0 1px #3b2414}
.node:disabled{opacity:1}
.boss-node{display:flex;align-items:center;gap:12px;width:100%;margin-top:8px;padding:8px 12px;text-align:left;border-radius:16px;background:linear-gradient(#6b2a1c,#3f1810);border:3px solid #3b2414;box-shadow:inset 0 2px 0 #b5543a,0 4px 0 #2a120a}
.boss-node.current{outline:3px solid #ffd45a;outline-offset:2px}
.boss-node.locked{filter:grayscale(.7) brightness(.8);cursor:not-allowed}
.boss-node:disabled{opacity:1}
.boss-icon{display:grid;place-items:center;width:46px;height:46px;flex:none;border-radius:50%;background:radial-gradient(circle at 40% 35%,#ff9d5c,#c2412b 70%);border:3px solid #3b2414;font-size:24px}
.boss-text{display:flex;flex-direction:column;gap:2px;color:#fff}
.boss-text strong{font-family:"Arial Black","Segoe UI Black",Arial,sans-serif;font-size:14px;color:#ffd45a;text-shadow:0 2px 0 #3b2414}
.boss-text small{color:#ffe3a8;font-size:12px}
.boss-text .stars{margin-top:0}
</style>
