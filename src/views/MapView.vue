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
import { renderForSpot, toCollectedPiece } from '@/lib/audio'
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
const pendingSpot = ref<MusicSpot | null>(null)
const collecting = ref(false)
const sheetOpen = ref(false)

const simFeed = createSimFeed()
const geo = useGeolocation({ feed: simFeed })

// --- Demo / GPS-simulation mode -------------------------------------------
// When real geolocation is denied, unavailable, or we just want to test the
// collect flow without moving, we drive the *same* reactive position the app
// already consumes through an injected feed. This reuses the entire marker +
// accuracy-ring + proximity pipeline with zero duplication — the only thing we
// change is the source of the coordinate.
//
//   simActive   — a virtual position is being driven (teleport / orbit).
//   simOrbiting — the virtual player is moving in a slow circle around
//                 DEMO_CENTER, so as it sweeps past each spot the spot flips
//                 unclaimed → collectable (and the Collect FAB appears).
//
// The sim activates on demand (the "Teleport to a spot" panel) and, as a
// safety net, also arms itself automatically when real GPS is denied or
// unavailable so the app stays testable headless. Real GPS always wins: the
// moment a genuine fix arrives we stop the sim and follow the user instead.
const simActive = ref(false)
const simOrbiting = ref(false)
const simSpeed = ref(1)

// The feed's rAF loop handles the orbit; this just tracks whether we've asked
// for it (so the UI can show a stop control) — we don't manage the timer here.
function startOrbit(): void {
  if (simOrbiting.value) return
  simActive.value = true
  simOrbiting.value = true
  // Radius/period are tuned so the sweep passes *through* the demo spots
  // (they're placed a few hundred meters from DEMO_CENTER), which is exactly
  // what triggers the proximity → collectable transition.
  simFeed.startOrbit(
    { lng: DEMO_CENTER[0], lat: DEMO_CENTER[1] },
    { radiusM: 320, periodS: 40 / simSpeed.value },
  )
}

function stopOrbit(): void {
  simOrbiting.value = false
  simFeed.stopOrbit()
}

// Teleport the virtual player to a specific spot's coordinates (one-shot fix).
// The proximity watcher then flips that spot to collectable and the Collect FAB
// appears — no need to physically walk to it.
function teleportToSpot(spot: MusicSpot): void {
  simActive.value = true
  stopOrbit()
  simFeed.emit({ lat: spot.lat, lng: spot.lng, accuracy: 5 })
  if (map) {
    map.flyTo({
      center: [spot.lng, spot.lat],
      zoom: Math.max(map.getZoom(), INITIAL_ZOOM + 2),
      speed: 1.2,
      essential: true,
    })
  }
}

// When real GPS comes up, it wins: stop the sim so we track the real user.
watch(
  () => geo.state.value,
  (s) => {
    if (s === 'ready') {
      simActive.value = false
      stopOrbit()
    }
  },
)

const hasCollectable = computed(() =>
  spots.value.some((s) => s.status === 'collectable'),
)

// Demo center (Potsdamer Platz, Berlin) — the map's initial view.
// MapLibre uses [lng, lat] order (matches GeoJSON) — the reverse of Leaflet.
// 47.1720042,12.5525377
const DEMO_CENTER: [number, number] = [47.1372927,12.6238395]
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

async function onCollect(spot: MusicSpot): Promise<void> {
  if (collecting.value) return
  collecting.value = true
  try {
    const rendered = renderForSpot(spot)
    const piece = toCollectedPiece(spot, rendered)
    await savePiece(piece)
    spot.status = 'collected'
    collected.value = await getAllPieces()
    refreshSpotMarkers()
    pendingSpot.value = null
  } finally {
    collecting.value = false
  }
}

function onPreview(spot: MusicSpot): void {
  // A tiny preview so the modal isn't silent. Uses the (stub) resolved URL.
  const rendered = renderForSpot(spot)
  const audio = new Audio(rendered.assetUrl)
  audio.volume = 0.5
  void audio.play().catch(() => {})
  // Stop after 3s so it doesn't bleed into collection.
  setTimeout(() => audio.pause(), 3000)
}

function openCollectModal(): void {
  const target = spots.value.find((s) => s.status === 'collectable')
  if (target) pendingSpot.value = target
}

onMounted(() => {
  initMap()
  void loadSpots()
  void loadCollection()
  geo.start()

  // Headless / permission-denied safety net: if real GPS is unavailable, arm
  // the sim immediately so the app stays testable (the user can also open the
  // teleport panel any time). Real GPS always wins: the watcher above stops the
  // sim the moment a genuine fix arrives.
  if (geo.state.value === 'unavailable' || geo.state.value === 'denied') {
    simActive.value = true
    startOrbit()
  }
})

onBeforeUnmount(() => {
  // Stop the demo sim first so its rAF loop doesn't outlive the component.
  stopOrbit()
  geo.stop()
  // `map.remove()` tears down markers, sources, layers, and controls.
  map?.remove()
  map = null
  playerMarker = null
  spotMarkers.clear()
})
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
        @click="openCollectModal"
      >
        Collect
      </button>
    </transition>

    <!-- Collection FAB (always visible, bottom-left). -->
    <button class="collection-fab" type="button" @click="sheetOpen = true">
      ♪ <span>{{ collected.length }}</span>
    </button>

    <!-- Demo / GPS-simulation controls (bottom-right). Lets you drive the
         player marker without physically moving: teleport to any spot, or let
         it orbit slowly past each one. Real GPS always overrides this. -->
    <div class="demo-panel" role="group" aria-label="Demo GPS simulation">
      <div class="demo-row">
        <span class="demo-title">Demo GPS</span>
        <button
          class="demo-btn"
          type="button"
          :class="{ active: simOrbiting }"
          @click="simOrbiting ? stopOrbit() : startOrbit()"
        >
          {{ simOrbiting ? '⏸ Orbit' : '▶ Orbit' }}
        </button>
      </div>
      <div class="demo-hint">Teleport to a spot, or orbit to sweep past them:</div>
      <div class="demo-list">
        <button
          v-for="s in spots"
          :key="s.id"
          class="demo-teleport"
          type="button"
          @click="teleportToSpot(s)"
        >
          <span class="demo-dot" :data-status="s.status"></span>
          <span class="demo-name">{{ s.name }}</span>
        </button>
      </div>
    </div>

    <!-- Collect modal. -->
    <CollectModal
      v-if="pendingSpot"
      :spot="pendingSpot"
      :busy="collecting"
      @collect="onCollect"
      @preview="onPreview"
      @close="pendingSpot = null"
    />

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

/* --- Demo / GPS-simulation panel (bottom-right) --- */
.demo-panel {
  position: absolute;
  right: 0.75rem;
  bottom: calc(4.75rem + env(safe-area-inset-bottom, 0px));
  z-index: 900;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  max-height: 55vh;
  overflow-y: auto;
  padding: 0.7rem;
  border-radius: 0.9rem;
  background: rgba(15, 23, 42, 0.92);
  color: #e2e8f0;
  backdrop-filter: blur(8px);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4);
}

.demo-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.demo-title {
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #94a3b8;
}

.demo-btn {
  margin-left: auto;
  padding: 0.35rem 0.7rem;
  border: 1px solid rgba(148, 163, 184, 0.4);
  border-radius: 999px;
  background: transparent;
  color: #e2e8f0;
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 120ms ease, border-color 120ms ease;
}

.demo-btn:hover {
  background: rgba(148, 163, 184, 0.15);
}

.demo-btn.active {
  border-color: #f59e0b;
  color: #fbbf24;
  background: rgba(245, 158, 11, 0.12);
}

.demo-hint {
  font-size: 0.7rem;
  color: #94a3b8;
  line-height: 1.3;
}

.demo-list {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.demo-teleport {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.45rem 0.6rem;
  border: 1px solid rgba(148, 163, 184, 0.25);
  border-radius: 0.6rem;
  background: transparent;
  color: #e2e8f0;
  font-size: 0.82rem;
  text-align: left;
  cursor: pointer;
  transition: background 120ms ease, border-color 120ms ease;
}

.demo-teleport:hover {
  background: rgba(148, 163, 184, 0.12);
  border-color: rgba(148, 163, 184, 0.5);
}

.demo-dot {
  width: 0.6rem;
  height: 0.6rem;
  border-radius: 50%;
  background: #64748b;
  flex: none;
}

.demo-dot[data-status='collectable'] {
  background: #f59e0b;
  box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.35);
}

.demo-dot[data-status='collected'] {
  background: #10b981;
}

.demo-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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

/* MapLibre's default popup is a white card that inherits body text color.
   In dark (or scaffold light-gray) schemes that becomes gray-on-white. */
:global(.maplibregl-popup-content) {
  background: #0f172a;
  color: #f8fafc;
  border-radius: 12px;
  padding: 12px 14px 14px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.45);
}

:global(.maplibregl-popup-close-button) {
  color: #e2e8f0;
  font-size: 1.1rem;
  padding: 4px 8px;
}

:global(.maplibregl-popup-close-button:hover) {
  color: #fff;
  background: transparent;
}

:global(.maplibregl-popup-anchor-bottom .maplibregl-popup-tip) {
  border-top-color: #0f172a;
}
:global(.maplibregl-popup-anchor-top .maplibregl-popup-tip) {
  border-bottom-color: #0f172a;
}
:global(.maplibregl-popup-anchor-left .maplibregl-popup-tip) {
  border-right-color: #0f172a;
}
:global(.maplibregl-popup-anchor-right .maplibregl-popup-tip) {
  border-left-color: #0f172a;
}

:global(.spot-popup) {
  color: #f8fafc;
  font-size: 0.9rem;
  line-height: 1.45;
  max-width: 220px;
}

:global(.spot-popup strong) {
  color: #fff;
  font-weight: 700;
}

:global(.badge) {
  display: inline-block;
  margin-top: 0.45rem;
  padding: 0.15rem 0.55rem;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 600;
}

:global(.badge-unclaimed) {
  background: #334155;
  color: #f1f5f9;
}

:global(.badge-collectable) {
  background: #f59e0b;
  color: #1f2937;
}

:global(.badge-collected) {
  background: #10b981;
  color: #052e16;
}

@keyframes spot-pulse {
  0%, 100% {
    box-shadow: 0 4px 10px rgba(0, 0, 0, 0.3), 0 0 0 0 rgba(245, 158, 11, 0.6);
  }
  50% {
    box-shadow: 0 4px 10px rgba(0, 0, 0, 0.3), 0 0 0 14px rgba(245, 158, 11, 0);
  }
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
