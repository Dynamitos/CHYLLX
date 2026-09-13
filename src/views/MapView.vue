<script setup lang="ts">
import {
  computed,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
  type Ref,
} from 'vue'
import {
  GlobeControl,
  Marker,
  NavigationControl,
  Map as MLMap,
  Popup,
  type LngLatLike,
  type StyleSpecification,
} from 'maplibre-gl'
import { useGeolocation } from '@/composables/useGeolocation'
import { createSimFeed } from '@/lib/demoSim'
import { spotRepository } from '@/lib/spotRepository'
import { getAllPieces, isCollected, savePiece } from '@/lib/db'
import { COLLECT_VIDEO_URL, pausePlayer, renderForSpot, toCollectedPiece } from '@/lib/audio'
import { isWithinRadius, type LatLng } from '@/lib/geo'

/**
 * Resolve a W3C `GeolocationCoordinates` to finite `{ lat, lng, accuracy }`.
 *
 * The canonical property names are `latitude`/`longitude` (the TS lib confirms
 * `lat`/`lng` are NOT on the type). A couple of wrappers mirror the values onto
 * `lat`/`lng`, so we fall back to those. If nothing yields finite numbers we
 * return `null` so callers can skip the update instead of passing NaN to MapLibre
 * (which throws "Invalid LngLat object: (NaN, NaN)").
 */
function resolveCoords(
  coords: GeolocationCoordinates,
): { lat: number; lng: number; accuracy: number | null } | null {
  const c = coords as unknown as {
    latitude?: number
    longitude?: number
    lat?: number
    lng?: number
    accuracy?: number
  }
  const lat = typeof c.latitude === 'number' ? c.latitude : c.lat
  const lng = typeof c.longitude === 'number' ? c.longitude : c.lng
  if (typeof lat !== 'number' || !Number.isFinite(lat) || typeof lng !== 'number' || !Number.isFinite(lng)) {
    return null
  }
  const accuracy = typeof c.accuracy === 'number' && Number.isFinite(c.accuracy) ? c.accuracy : null
  return { lat, lng, accuracy }
}

import type { CollectedPiece, MusicSpot } from '@/types/music'
import CollectModal from '@/components/CollectModal.vue'
import CollectionSheet from '@/components/CollectionSheet.vue'

// --- state ---
const mapEl = ref<HTMLElement | null>(null)

const collected = ref<CollectedPiece[]>([])
const spots: Ref<MusicSpot[]> = ref([])
// The spot whose reveal video has finished; the collect modal is shown for it.
let pendingSpot: MusicSpot | null = null
const revealDone = ref(false)
// True while the reveal video is on screen. The video element lives in a
// <Teleport> to document.body (see template) so it renders in the topmost
// stacking context — a sibling of the map's 3D-transformed canvas would be
// painted *under* it and the reveal would be invisible.
const revealActive = ref(false)
const revealVideoEl = ref<HTMLVideoElement | null>(null)
const collecting = ref(false)
const sheetOpen = ref(false)

const simFeed = createSimFeed()
const geo = useGeolocation({ feed: simFeed })

// --- Debug: fly-to-key shortcuts ------------------------------------------
// There is no demo panel anymore. Position is ALWAYS driven through the sim
// feed (even when real GPS is up), so keyboard shortcuts can fly the player
// to the first 3 spots from anywhere. This is a test-only convenience to
// exercise the collect flow without physically walking; a real user's GPS
// would be the position source in production.
//   1 / 2 / 3  →  fly the player to spots[0] / [1] / [2]
// The emitted fix flows through the same proximity watcher as a real GPS fix,
// so the spot flips unclaimed → collectable and the Collect FAB appears.
const FLY_KEYS = ['1', '2', '3'] as const

function flyToSpot(spot: MusicSpot): void {
  simFeed.emit({ lat: spot.lat, lng: spot.lng, accuracy: 5 })
  map?.flyTo({
    center: [spot.lng, spot.lat],
    zoom: Math.max(map.getZoom(), INITIAL_ZOOM + 2),
    speed: 1.2,
    essential: true,
  })
}

function onKeydown(e: KeyboardEvent): void {
  // Escape dismisses the reveal video (without opening the modal).
  if (e.key === 'Escape' && revealActive.value) {
    skipReveal()
    return
  }
  if (!FLY_KEYS.includes(e.key as (typeof FLY_KEYS)[number])) return
  const spot = spots.value[Number(e.key) - 1]
  if (spot) flyToSpot(spot)
}

onMounted(() => {
  initMap()
  void loadSpots()
  void loadCollection()
  // Always feed through the sim so the fly-to keys work regardless of GPS.
  geo.start()
  window.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  geo.stop()
  // `map.remove()` tears down markers, sources, layers, and controls.
  map?.remove()
  map = null
  playerMarker = null
  spotMarkers.clear()
})

const hasCollectable = computed(() =>
  spots.value.some((s) => s.status === 'collectable'),
)

// Demo center (Weißsee, Berchtesgaden) — the map's initial view.
// MapLibre uses [lng, lat] order (matches GeoJSON) — the reverse of Leaflet.
const DEMO_CENTER: [number, number] = [138.4478818, 35.5042671]
const INITIAL_ZOOM = 14

// --- module-level (non-reactive) MapLibre handles ---
let map: MLMap | null = null
let playerMarker: Marker | null = null
// The GPS-accuracy ring is drawn as a GeoJSON fill layer (MapLibre has no
// Leaflet-style `L.circle`), so we hold its source id + the last feature.
const ACCURACY_SOURCE = 'accuracy-ring'
const spotMarkers = new Map<string, Marker>()
let userHasPanned = false
// Markers (player + spots) can only be added once the map's style has loaded
// (they need a valid transform to project). Track that so data that arrives
// before the map is ready can be deferred, then flushed on `load`.
let mapLoaded = false

// Esri World Imagery — free satellite raster, no API key. (MapTiler/Mapbox
// satellite both require a key; this is the only keyless real-satellite source.)
const ESRI_SATELLITE_TILES = [
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
]

function satelliteStyle(): StyleSpecification {
  return {
    version: 8,
    name: 'Classica satellite (globe)',
    // Start on the 3D globe; GlobeControl lets the user flip back to flat.
    projection: { type: 'globe' },
    sky: { 'sky-color': '#0b1020', 'horizon-color': '#1b2a4a' },
    sources: {
      satellite: {
        type: 'raster',
        tiles: ESRI_SATELLITE_TILES,
        tileSize: 256,
        maxzoom: 19,
      },
    },
    layers: [
      {
        id: 'satellite',
        type: 'raster',
        source: 'satellite',
        paint: { 'raster-opacity': 1, 'raster-saturation': -0.15 },
      },
    ],
  }
}

function initMap(): void {
  if (!mapEl.value) return
  // `center`/`zoom` here override the style's initial camera.
  map = new MLMap({
    container: mapEl.value,
    style: satelliteStyle(),
    center: DEMO_CENTER,
    zoom: INITIAL_ZOOM,
  })
  map.addControl(new NavigationControl({ showCompass: false }), 'bottom-right')
  // One-tap toggle between the 3D globe and a flat mercator view.
  map.addControl(new GlobeControl(), 'top-right')

  // Stop auto-centering once the user takes over by dragging.
  map.on('dragstart', () => {
    userHasPanned = true
  })

  // Player marker + accuracy ring need a *loaded* map to project coordinates
  // (Markers read the map's transform; GeoJSON layers need the style's
  // source/layer graph). So everything that touches projection lives here,
  // not in the constructor path.
  map.on('load', () => {
    const m = map
    mapLoaded = true
    if (!m) return
    // Player marker: a custom DOM element, centered, non-interactive so taps
    // pass through to the map. MapLibre's `Marker` has no `interactive` option.
    //
    // IMPORTANT: MapLibre's Marker does NOT auto-geocode a missing position the
    // way Leaflet's did — `new Marker({ element })` leaves `_lngLat` undefined,
    // and `addTo` → `_update` → `this._lngLat.lng` throws "e is undefined".
    // So we must `setLngLat(...)` BEFORE `.addTo()`. We seed it at the demo
    // center (matches the map's initial camera) and the GPS watcher moves it.
    const playerEl = document.createElement('div')
    playerEl.className = 'player-icon'
    playerEl.style.pointerEvents = 'none'
    playerMarker = new Marker({ element: playerEl, anchor: 'center' })
      .setLngLat(DEMO_CENTER)
      .addTo(m)

    // GPS-accuracy ring: a fill layer over a GeoJSON circle. MapLibre has no
    // Leaflet-style `L.circle`, so the geometry is a GeoJSON feature we rewrite
    // on each position update (see the watcher below).
    m.addSource(ACCURACY_SOURCE, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
    m.addLayer({
      id: 'accuracy-fill',
      type: 'fill',
      source: ACCURACY_SOURCE,
      paint: { 'fill-color': '#3b82f6', 'fill-opacity': 0.08 },
    })
    m.addLayer({
      id: 'accuracy-line',
      type: 'line',
      source: ACCURACY_SOURCE,
      paint: { 'line-color': '#3b82f6', 'line-width': 1, 'line-opacity': 0.25 },
    })

    // If a position was already fixed before the map finished loading, place
    // the player marker now instead of waiting for the next tick.
    const pos = geo.position.value
    if (pos) {
      const fixed = resolveCoords(pos.coords)
      if (fixed) {
        playerMarker?.setLngLat([fixed.lng, fixed.lat])
        const src = m.getSource(ACCURACY_SOURCE) as unknown as { setData: (d: unknown) => void } | undefined
        if (src) {
          void src.setData({
            type: 'FeatureCollection',
            features: [circleFeature(fixed.lng, fixed.lat, fixed.accuracy ?? 0)],
          })
        }
      }
    }

    // Spots may have been fetched before the map finished loading; place them
    // now that the transform is valid.
    addSpotMarkers()
  })
}

// Build a GeoJSON polygon approximating a circle (great-circle precision is
// unnecessary at ≤30 m). `unknown` return keeps the type-checker happy without
// importing the full GeoJSON type graph; `GeoJSONSource.setData` accepts it.
function circleFeature(
  lng: number,
  lat: number,
  radiusM: number,
): unknown {
  const latR = (lat * Math.PI) / 180
  const dLat = (radiusM / 111320) * 180 / Math.PI
  const dLng = (radiusM / (111320 * Math.cos(latR))) * 180 / Math.PI
  const ring: number[][] = []
  for (let i = 0; i <= 32; i++) {
    const a = (i / 32) * 2 * Math.PI
    ring.push([lng + dLng * Math.cos(a), lat + dLat * Math.sin(a)])
  }
  return {
    type: 'Feature',
    properties: {},
    geometry: { type: 'Polygon', coordinates: [ring] },
  }
}

// Build the marker's custom DOM element. The dot keeps the existing `.spot-*`
// status styling; the label sits below the dot. `anchor: 'center'` pins the
// element's center on the coordinate, so the dot centers on the spot.
function makeSpotElement(spot: MusicSpot): HTMLElement {
  const status = spot.status ?? 'unclaimed'
  const el = document.createElement('div')
  el.className = `spot-icon spot-${status}`
  el.innerHTML = `<div class="spot-dot"></div><div class="spot-label">${spot.name}</div>`
  return el
}

// A Popup holding the spot's detail card (reuses the existing .spot-popup CSS).
function makeSpotPopup(spot: MusicSpot): Popup {
  const status = spot.status ?? 'unclaimed'
  const badge =
    status === 'collected' ? 'Collected ✓' : status === 'collectable' ? 'In range!' : 'Out of range'
  const card = document.createElement('div')
  card.className = 'spot-popup'
  card.innerHTML = `<strong>${spot.name}</strong><br/>${spot.description ?? ''}<br/><span class="badge badge-${status}">${badge}</span>`
  return new Popup({ offset: 18, closeOnClick: true }).setDOMContent(card)
}

function addSpotMarkers(): void {
  if (!map || !mapLoaded) return
  for (const spot of spots.value) {
    if (spotMarkers.has(spot.id)) continue
    // [lng, lat] — the reverse of the (lat, lng) domain model.
    const marker = new Marker({ element: makeSpotElement(spot), anchor: 'center' })
      .setLngLat([spot.lng, spot.lat])
      .setPopup(makeSpotPopup(spot))
      .addTo(map)
    spotMarkers.set(spot.id, marker)
  }
}

function refreshSpotMarkers(): void {
  for (const spot of spots.value) {
    const m = spotMarkers.get(spot.id)
    const status = spot.status ?? 'unclaimed'
    if (!m) continue
    // No `setElement` in MapLibre v6 — mutate the existing DOM node in place
    // (the same element instance the Marker already holds) so the status
    // change re-renders the dot color/label, then refresh the popup card.
    const el = m.getElement()
    el.className = `spot-icon spot-${status}`
    el.innerHTML = `<div class="spot-dot"></div><div class="spot-label">${spot.name}</div>`
    m.setPopup(makeSpotPopup(spot))
  }
}

// Re-evaluate proximity whenever the player moves.
watch(
  () => geo.position.value,
  (pos) => {
    if (!pos || !map) return
    // Resolve + validate the fix. The W3C names are `latitude`/`longitude` (the TS
    // lib confirms `lat`/`lng` are not on the type); we fall back to the
    // alternate and reject anything non-finite. If the environment delivered an
    // invalid/NaN fix, we simply don't move the marker or fly — no NaN ever reaches
    // `setLngLat`/`flyTo`, which would throw "Invalid LngLat object: (NaN, NaN)".
    const fixed = resolveCoords(pos.coords)
    if (!fixed) return
    const { lat, lng, accuracy } = fixed
    const ll: LngLatLike = [lng, lat] // [lng, lat] — MapLibre order.
    const here: LatLng = { lat, lng } // domain shape for isWithinRadius.

    // Move the player marker + rewrite the accuracy ring geometry.
    playerMarker?.setLngLat(ll)
    const src = map.getSource(ACCURACY_SOURCE) as unknown as { setData: (d: unknown) => void } | undefined
    if (src) {
      void src.setData({ type: 'FeatureCollection', features: [circleFeature(lng, lat, accuracy ?? 0)] })
    }

    // Auto-center only until the user takes over by panning.
    if (!userHasPanned) {
      map.flyTo({ center: ll, zoom: Math.max(map.getZoom(), INITIAL_ZOOM), speed: 1.5, essential: true })
    }

    // Proximity → collectable (one-way: unclaimed -> collectable).
    let changed = false
    for (const spot of spots.value) {
      if (spot.status === 'unclaimed' && isWithinRadius(here, spot, spot.radiusM)) {
        spot.status = 'collectable'
        changed = true
      }
    }
    if (changed) refreshSpotMarkers()
  },
)

async function loadSpots(): Promise<void> {
  const fresh = await spotRepository.getSpots()
  // Hydrate any already-collected status so the UI is correct on reload.
  const marked: MusicSpot[] = []
  for (const s of fresh) {
    const done = await isCollected(s.id)
    marked.push({ ...s, status: done ? 'collected' : 'unclaimed' })
  }
  spots.value = marked
  addSpotMarkers()
}

async function loadCollection(): Promise<void> {
  collected.value = await getAllPieces()
}

async function collectFromFab(): Promise<void> {
  const target = spots.value.find((s) => s.status === 'collectable')
  if (!target) return
  pendingSpot = target
  revealDone.value = false
  revealActive.value = true
  pausePlayer() // stop any collection-sheet/preview playback first.
  // The <video> is bound in the template via `revealVideoEl`; Vue has mounted it
  // before our next microtask, so the element is available to play now. (The
  // Collect tap is a user gesture, but the video is muted so autoplay is allowed
  // regardless.)
  requestAnimationFrame(() => {
    const v = revealVideoEl.value
    if (!v) return
    v.currentTime = 0
    // Muted => `.play()` resolves reliably. Retry a few times in case the source
    // isn't seekable on the first frame (autoplay-policy can reject an early
    // play() before metadata loads).
    const attempt = (n: number) => {
      if (!revealActive.value) return
      const rendered = renderForSpot(target)
      const a = new Audio(rendered.assetUrl)
      a.volume = 0.5
      setTimeout(() => a.pause(), 17000)
      void a.play().catch(() => {})
      v.play().catch(() => {
        if (n <= 0 || !revealActive.value) return
        setTimeout(() => attempt(n - 1), 200)
      })
    }
    attempt(6)
  })
}

/**
 * The reveal video ended (or the user tapped/Esc to skip it): hand off to the
 * collect modal. The reveal never saves anything — only "Keep it" does.
 */
function onRevealEnded(): void {
  revealActive.value = false
  revealVideoEl.value?.pause()
  revealDone.value = true
}

/**
 * Dismiss the reveal entirely (Escape) without opening the modal.
 */
function skipReveal(): void {
  revealActive.value = false
  revealVideoEl.value?.pause()
  pendingSpot = null
  revealDone.value = false
}

/**
 * "Keep it" in the collect modal — the user has watched the reveal and now
 * chooses to keep the piece. This is the only path that actually saves.
 */
async function onKeepSpot(spot: MusicSpot): Promise<void> {
  if (collecting.value) return
  collecting.value = true
  try {
    const rendered = renderForSpot(spot)
    const piece = toCollectedPiece(spot, rendered)
    await savePiece(piece)
    spot.status = 'collected'
    collected.value = await getAllPieces()
    refreshSpotMarkers()
    pendingSpot = null
    revealDone.value = false
  } finally {
    collecting.value = false
  }
}

/**
 * Preview a track inside the collect modal (the reveal already played the
 * video; this is a short audio-only preview of the piece itself).
 */
function onPreview(spot: MusicSpot): void {
  pausePlayer()
  const rendered = renderForSpot(spot)
  const a = new Audio(rendered.assetUrl)
  a.volume = 0.5
  void a.play().catch(() => {})
  setTimeout(() => a.pause(), 3000)
}
</script>

<template>
  <div class="app-shell">
    <div ref="mapEl" class="map" aria-label="City map with music spots"></div>

    <!-- Geolocation status banner (only when there is a problem). -->
    <transition name="fade">
      <div v-if="geo.state.value === 'denied' || geo.state.value === 'unavailable'" class="geo-banner">
        <span>🛰️</span>
        <span>{{ geo.error ?? 'Location unavailable.' }}</span>
      </div>
    </transition>

    <!-- Collect FAB: appears when the player is in range of an unclaimed spot. -->
    <transition name="pop">
      <button
        v-if="hasCollectable"
        class="collect-fab"
        type="button"
        :disabled="collecting"
        @click="collectFromFab"
      >
        Collect
      </button>
    </transition>

    <!-- Collection FAB (always visible, bottom-left). -->
    <button class="collection-fab" type="button" @click="sheetOpen = true">
      ♪ <span>{{ collected.length }}</span>
    </button>

    <!-- Collect modal: shown only after the reveal video has finished. -->
    <CollectModal
      v-if="revealDone && pendingSpot"
      :spot="pendingSpot"
      :busy="collecting"
      @collect="onKeepSpot"
      @preview="onPreview"
      @close="pendingSpot = null; revealDone = false"
    />

    <!--
      Full-screen collect-reveal video. Teleported to <body> so it sits in the
      topmost stacking context — the map's 3D-transformed canvas otherwise
      paints over a `position: fixed` sibling and the video would be invisible.
    -->
    <Teleport to="body">
      <div v-if="revealActive" class="collect-reveal" @click="onRevealEnded">
        <video
          ref="revealVideoEl"
          class="collect-reveal-video"
          :src="COLLECT_VIDEO_URL"
          muted
          playsinline
          preload="auto"
          @ended="onRevealEnded"
        ></video>
      </div>
    </Teleport>

    <!-- Collection sheet. -->
    <CollectionSheet
      :open="sheetOpen"
      :pieces="collected"
      @close="sheetOpen = false"
    />
  </div>
</template>

<style scoped>
.app-shell {
  position: relative;
  width: 100%;
  height: 100vh;
  height: 100dvh;
  overflow: hidden;
}

.map {
  position: absolute;
  inset: 0;
  z-index: 0;
}

/* --- Geolocation status banner --- */
.geo-banner {
  position: absolute;
  top: env(safe-area-inset-top, 0px);
  left: 0;
  right: 0;
  z-index: 1000;
  display: flex;
  gap: 0.5rem;
  align-items: center;
  padding: 0.6rem 1rem;
  padding-top: calc(0.6rem + env(safe-area-inset-top, 0px));
  background: rgba(30, 41, 59, 0.95);
  color: #fff;
  font-size: 0.85rem;
  backdrop-filter: blur(6px);
}

/* --- Collection FAB (bottom-left) --- */
.collection-fab {
  position: absolute;
  left: 1rem;
  bottom: calc(1rem + env(safe-area-inset-bottom, 0px));
  z-index: 900;
  display: flex;
  gap: 0.4rem;
  align-items: center;
  padding: 0.7rem 1rem;
  border: none;
  border-radius: 999px;
  background: linear-gradient(135deg, #1e293b, #0f172a);
  color: #fff;
  font-size: 1rem;
  font-weight: 600;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
  cursor: pointer;
  transition: transform 0.15s ease;
}

.collection-fab:active {
  transform: scale(0.96);
}

.collection-fab span {
  background: rgba(255, 255, 255, 0.15);
  padding: 0.05rem 0.55rem;
  border-radius: 999px;
  font-size: 0.85rem;
}

/* --- Collect FAB (bottom-center, appears when in range) --- */
.collect-fab {
  position: absolute;
  left: 50%;
  bottom: calc(2rem + env(safe-area-inset-bottom, 0px));
  transform: translateX(-50%);
  z-index: 950;
  padding: 0.9rem 1.6rem;
  border: none;
  border-radius: 999px;
  background: linear-gradient(135deg, #4f46e5, #7c3aed);
  color: #fff;
  font-size: 1.05rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  box-shadow: 0 10px 30px rgba(79, 70, 229, 0.45);
  cursor: pointer;
  animation: pulse-fab 1.6s ease-in-out infinite;
}

@keyframes pulse-fab {
  0%, 100% {
    box-shadow: 0 10px 30px rgba(79, 70, 229, 0.45);
  }
  50% {
    box-shadow: 0 10px 40px rgba(79, 70, 229, 0.75);
  }
}

/* --- Player marker --- */
:global(.player-icon-wrap) {
  background: transparent;
  border: none;
}

:global(.player-icon) {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: #3b82f6;
  border: 3px solid #fff;
  box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.35);
  animation: player-pulse 2s ease-in-out infinite;
}

@keyframes player-pulse {
  0%, 100% {
    box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.35);
  }
  50% {
    box-shadow: 0 0 0 10px rgba(59, 130, 246, 0.1);
  }
}

/* --- Spot markers (unclaimed / collectable / collected) --- */
:global(.spot-icon) {
  background: transparent;
  border: none;
}

:global(.spot-dot) {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  border: 3px solid #fff;
  margin: 0 auto;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.3);
}

:global(.spot-label) {
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  margin-top: 4px;
  padding: 0.15rem 0.45rem;
  border-radius: 6px;
  background: rgba(15, 23, 42, 0.85);
  color: #fff;
  font-size: 0.7rem;
  white-space: nowrap;
}

:global(.spot-unclaimed .spot-dot) {
  background: #64748b;
}

:global(.spot-collectable .spot-dot) {
  background: #f59e0b;
  animation: spot-pulse 1.2s ease-in-out infinite;
}

:global(.spot-collectable .spot-label) {
  background: rgba(245, 158, 11, 0.9);
  color: #1f2937;
  font-weight: 700;
}

:global(.spot-collected .spot-dot) {
  background: #10b981;
  opacity: 0.75;
}

@keyframes spot-pulse {
  0%, 100% {
    box-shadow: 0 4px 10px rgba(0, 0, 0, 0.3), 0 0 0 0 rgba(245, 158, 11, 0.6);
  }
  50% {
    box-shadow: 0 4px 10px rgba(0, 0, 0, 0.3), 0 0 0 14px rgba(245, 158, 11, 0);
  }
}

/* --- Full-screen "collect reveal" (Teleported to <body>, so unscoped) ---
   `isolation: isolate` gives the overlay its own stacking context with a high
   z-index, so it always sits above the map's 3D canvas regardless of how the
   map layers their z-index. */
.collect-reveal {
  position: fixed;
  inset: 0;
  z-index: 2147483647; /* max 32-bit, above anything the map uses */
  isolation: isolate;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #000;
  cursor: pointer;
}
.collect-reveal-video {
  width: 100%;
  height: 100%;
  object-fit: contain;
  background: #000;
}

/* --- Transitions for banner / FAB --- */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.25s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.pop-enter-active,
.pop-leave-active {
  transition:
    opacity 0.25s ease,
    transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.pop-enter-from,
.pop-leave-to {
  opacity: 0;
  transform: translateX(-50%) scale(0.7);
}
</style>
