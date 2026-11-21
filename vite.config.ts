import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: './',
  plugins: [
    vue(),
    // Installable app that works offline: everything in dist (code, WebP sheets, icons) is precached.
    VitePWA({
      registerType: 'prompt', // App.vue shows "Ny version finns – ladda om"
      includeAssets: ['icons/apple-touch-icon.png'],
      manifest: {
        name: 'Viking Loot — The First Raid',
        short_name: 'Viking Loot',
        description: 'Ett pusselspel om vikingar som plundrar en ö – välj ordningen rätt och fyll aldrig skeppet.',
        lang: 'sv',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#193a4b',
        theme_color: '#17374a',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,webp,png,json}'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024, // the Phaser bundle is larger than the 2 MB default
      },
    }),
  ],
})
