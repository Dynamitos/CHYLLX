import './assets/main.css'
import 'maplibre-gl/dist/maplibre-gl.css'
import { setWorkerUrl } from 'maplibre-gl'

import { createApp } from 'vue'
import App from './App.vue'
import router from './router'

import { registerSW } from 'virtual:pwa-register'

// MapLibre GL v6 decodes tiles in a *module* web worker. Its default worker URL
// (`new Worker(e, { type: 'module' })`, where e = `new URL('./maplibre-gl-worker.mjs',
// import.meta.url)`) resolves, in dev, to `node_modules/.vite/deps/maplibre-gl-worker.mjs`
// — a file Vite does not build for the worker, served with an empty MIME type, which
// the browser rejects ("blocked because of a disallowed MIME type"). The worker then
// dies and MapLibre falls back to the main-thread path, surfacing as `e is undefined` /
// `this.properties is undefined` crashes.
//
// The worker + its `maplibre-gl-shared.mjs` sibling are vendored as static files in
// `public/` (served at the site root in dev, copied to `dist/` by `vite build`, and
// precached by Workbox for offline). Point MapLibre there — in BOTH dev and prod the
// root URL `/maplibre-gl-worker.mjs` resolves to the vendored copy, so the module
// worker loads. `vite.config.ts` has a `closeBundle` hook that keeps the `dist/` copies
// in sync with the package across `maplibre-gl` upgrades; the `public/` copies are the
// dev source of truth and must stay in git.
setWorkerUrl(`${import.meta.env.BASE_URL}maplibre-gl-worker.mjs`)

const app = createApp(App)

app.use(router)

app.mount('#app')

// Register the PWA service worker (manifest is injected automatically by
// vite-plugin-pwa). `prompt` registration so we could surface a "new version
// available" prompt later if needed.
if (import.meta.env.PROD) {
  registerSW({ immediate: true })
}
