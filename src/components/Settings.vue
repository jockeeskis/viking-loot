<script setup lang="ts">
// The settings panel (0.5): music, sound effects, vibration, colour-blind mode and language.
import type { Lang } from '../game/settings'

defineProps<{
  t: (key: string, params?: Record<string, string | number>) => string
  lang: Lang
  music: boolean
  sound: boolean
  vibration: boolean
  colorMarks: boolean
  reducedMotion: boolean
  batterySaver: boolean
}>()
const emit = defineEmits<{
  music: []
  sound: []
  vibration: [on: boolean]
  colorMarks: [on: boolean]
  reducedMotion: [on: boolean]
  batterySaver: [on: boolean]
  lang: [lang: Lang]
  close: []
}>()
</script>

<template>
  <div class="overlay" @click.self="emit('close')">
    <div class="result settings" role="dialog" :aria-label="t('settings.title')">
      <h2>{{ t('settings.title') }}</h2>
      <label class="setting">
        <span>{{ t('settings.music') }}</span>
        <input type="checkbox" :checked="music" @change="emit('music')" />
      </label>
      <label class="setting">
        <span>{{ t('settings.sound') }}</span>
        <input type="checkbox" :checked="sound" @change="emit('sound')" />
      </label>
      <label class="setting">
        <span>{{ t('settings.vibration') }}<small>{{ t('settings.vibrationNote') }}</small></span>
        <input type="checkbox" :checked="vibration" @change="emit('vibration', ($event.target as HTMLInputElement).checked)" />
      </label>
      <label class="setting">
        <span>{{ t('settings.colorMarks') }}<small>{{ t('settings.colorMarksNote') }}</small></span>
        <input type="checkbox" :checked="colorMarks" @change="emit('colorMarks', ($event.target as HTMLInputElement).checked)" />
      </label>
      <label class="setting">
        <span>{{ t('settings.motion') }}<small>{{ t('settings.motionNote') }}</small></span>
        <input type="checkbox" :checked="reducedMotion" @change="emit('reducedMotion', ($event.target as HTMLInputElement).checked)" />
      </label>
      <label class="setting">
        <span>{{ t('settings.saver') }}<small>{{ t('settings.saverNote') }}</small></span>
        <input type="checkbox" :checked="batterySaver" @change="emit('batterySaver', ($event.target as HTMLInputElement).checked)" />
      </label>
      <div class="setting">
        <span>{{ t('settings.lang') }}</span>
        <span class="lang-buttons">
          <button :class="{ on: lang === 'sv' }" @click="emit('lang', 'sv')">Svenska</button>
          <button :class="{ on: lang === 'en' }" @click="emit('lang', 'en')">English</button>
        </span>
      </div>
      <button class="done" @click="emit('close')">{{ t('settings.close') }}</button>
    </div>
  </div>
</template>
