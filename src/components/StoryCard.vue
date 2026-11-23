<script setup lang="ts">
// A story card told by Ragnar (0.5): one page at a time, then back to the raid.
import { ref, computed } from 'vue'
import type { StoryCard } from '../game/story'
import type { Lang } from '../game/settings'

const props = defineProps<{
  card: StoryCard
  lang: Lang
  t: (key: string, params?: Record<string, string | number>) => string
}>()
const emit = defineEmits<{ close: [] }>()

const page = ref(0)
const last = computed(() => page.value >= props.card.pages.length - 1)
const base = import.meta.env.BASE_URL
const ragnar = `${base}assets/characters/ragnar/portrait.webp`
// Boss cards also show the boss (when its art exists).
const bossId = computed(() => ['serpent', 'ulvhild', 'ymer', 'surt'][Number(/^boss-(\d)/.exec(props.card.id)?.[1] ?? -1)])
const bossPic = computed(() => (bossId.value ? `${base}assets/bosses/${bossId.value}-portrait.webp` : ''))
const bossOk = ref(true)
// Cards before a raid end with "To the raid!", the others (after a boss, the finale) with "Close".
const raid = computed(() => props.card.id === 'start' || props.card.id.startsWith('world-') || props.card.id.endsWith('-before'))
function next() { if (last.value) emit('close'); else page.value++ }
</script>

<template>
  <div class="overlay story-overlay" @click.self="next">
    <div class="result story" role="dialog" :aria-label="card.title[lang]">
      <div class="story-head">
        <img class="story-face" :src="ragnar" alt="Ragnar" />
        <div>
          <h2>{{ card.icon }} {{ card.title[lang] }}</h2>
          <small v-if="card.pages.length > 1">{{ t('story.page', { n: page + 1, total: card.pages.length }) }}</small>
        </div>
        <img v-if="bossPic && bossOk" class="story-face boss" :src="bossPic" alt="" @error="bossOk = false" />
      </div>
      <p class="story-text">{{ card.pages[page][lang] }}</p>
      <div class="story-buttons">
        <button v-if="!last" class="skip" @click="emit('close')">{{ t('story.skip') }}</button>
        <button @click="next">{{ last ? t(raid ? 'story.done' : 'story.close') : t('story.next') }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.story-overlay{z-index:5}
.story{max-width:320px;text-align:left}
.story-head{display:flex;align-items:center;gap:10px;margin-bottom:6px}
.story-head h2{margin:0;font-size:19px;line-height:1.15}
.story-face{width:58px;height:58px;flex:none;border-radius:50%;background:#2a190c;border:3px solid #3b2414;box-shadow:0 0 0 2px #c9925a;object-fit:cover}
.story-face.boss{margin-left:auto;box-shadow:0 0 0 2px #e0392b}
.story-text{font-size:15px;line-height:1.45;color:#fff4dc;min-height:84px}
.story-buttons{display:flex;justify-content:flex-end;gap:6px}
.skip{background:#00000033;box-shadow:none;color:#ffe3a8}
</style>
