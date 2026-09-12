import { fileURLToPath, URL } from 'node:url'
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs'

import { defineConfig, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'
import vueDevTools from 'vite-plugin-vue-devtools'

/**
 * MapLibre GL v6 decodes tiles in a *module* web worker
 * (`new Worker(url, { type: 'module' })`) whose entry is
 * `maplibre-gl/dist/maplibre-gl-worker.mjs` — an ES module that `import`s
 * `./maplibre-gl-shared.mjs`.
 *
 * Vite does NOT pre-bundle a web worker like that. Left to its default, MapLibre's
 * worker URL (computed via `new URL('./maplibre-gl-worker.mjs', import.meta.url)`)
 * points at `node_modules/.vite/deps/...` (dev) / `dist/...` (prod), which 404s
 * because Vite never built those files. The worker dies, MapLibre silently falls
 * back to the main-thread path, and you get confusing `e is undefined` /
 * `this.properties is undefined` crashes.
 *
 * Fix: the worker + its shared chunk are vendored as static files in `public/` (with
 * the dangling `sourceMappingURL` refs stripped so there is no 404). Vite serves
 * `public/` with a correct `text/javascript` MIME at the exact URLs the map computes,
 * and `vite build` copies `public/` into `dist/` so production works identically. The
 * Workbox precache glob (which includes the `.mjs` extension) then caches them for
 * offline use.
 *
 * The plugin below is a *belt-and-braces* `closeBundle` that re-syncs the vendored
 * `maplibre-gl-*.mjs` from the package into `dist/` after a build, so the files can
 * never go stale or missing across `maplibre-gl` upgrades. It is a no-op in dev.
 */
const pkgDist = fileURLToPath(new URL('./node_modules/maplibre-gl/dist/', import.meta.url))
const workerFiles = ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs']

function stripSourceMapRef(src: string): void {
  const text = readFileSync(src, 'utf8').replace(/\n\/\/# sourceMappingURL=[^\n]+/g, '')
  writeFileSync(src, text)
}

/**
 * After `vite build` copies `public/` into `outDir`, re-sync the MapLibre worker
 * + shared chunk from the package into `outDir` and strip their dangling
 * `sourceMappingURL` refs. This guarantees the files are present, current, and free
 * of 404-ing source-map references even if the `public/` copies get deleted or go
 * stale across a `maplibre-gl` upgrade. No-op in dev.
 */
function maplibreWorkerPlugin(): Plugin {
  let outDir = 'dist'
  return {
    name: 'maplibre-gl-worker',
    apply: 'build',
    config(config) {
      outDir = (config as { outDir?: string } | undefined)?.outDir ?? 'dist'
    },
    closeBundle() {
      for (const name of workerFiles) {
        const dest = `${process.cwd()}/${outDir}/${name}`
        copyFileSync(`${pkgDist}${name}`, dest)
        stripSourceMapRef(dest)
      }
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    // Re-syncs the vendored MapLibre worker into outDir after `vite build` (see the
    // comment above). Harmless in dev.
    maplibreWorkerPlugin(),
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
        // Precache the app shell (generated automatically by VitePWA). `mjs` is
        // included so the vendored MapLibre WebGL worker + shared chunk (static
        // `public/` .mjs assets) are cached for offline use — the map keeps
        // decoding tiles with no network.
        globPatterns: ['**/*.{js,mjs,css,html,ico,png,svg,webmanifest,mp3}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        // Runtime caching: satellite map tiles + other cross-origin assets so
        // the map keeps rendering offline after the first visit.
        runtimeCaching: [
          {
            urlPattern: /https:\/\/server\.arcgisonline\.com\/.*\btile\/.*\.(png|jpe?g)/i,
            handler: 'StaleWhileRevalidate',
            method: 'GET',
            options: {
              cacheName: 'satellite-tiles',
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
