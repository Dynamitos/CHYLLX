import './assets/main.css'
import 'leaflet/dist/leaflet.css'

import { createApp } from 'vue'
import App from './App.vue'
import router from './router'

import { registerSW } from 'virtual:pwa-register'

const app = createApp(App)

app.use(router)

app.mount('#app')

// Register the PWA service worker (manifest is injected automatically by
// vite-plugin-pwa). `prompt` registration so we could surface a "new version
// available" prompt later if needed.
if (import.meta.env.PROD) {
  registerSW({ immediate: true })
}
