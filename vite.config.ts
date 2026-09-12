import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'
import vueDevTools from 'vite-plugin-vue-devtools'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    // vue-devtools is a dev-only tool; it no-ops automatically on `vite build`,
    // so the production bundle stays lean and installable.
    vueDevTools(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.ico', 'icons/*.png'],
      manifest: {
        name: 'Classica — Explore & Collect',
        short_name: 'Classica',
        description:
          'A Pokémon-Go-style walk through your neighborhood. Find music spots and collect personalized classical pieces.',
        theme_color: '#2c3e50',
        background_color: '#2c3e50',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        orientation: 'portrait',
        icons: [
          { src: 'icons/pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/pwa-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/pwa-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Precache the app shell (generated automatically by VitePWA).
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest,mp3}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        // Runtime caching: OSM tiles + other cross-origin assets so the map
        // keeps rendering offline after the first visit.
        runtimeCaching: [
          {
            urlPattern: /https:\/\/(tile|tile-\w+)\.openstreetmap\.org\/.*/i,
            handler: 'StaleWhileRevalidate',
            method: 'GET',
            options: {
              cacheName: 'osm-tiles',
              expiration: { maxEntries: 2000, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
