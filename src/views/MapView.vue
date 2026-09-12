<script setup lang="ts">
import {
  computed,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
  type Ref,
} from 'vue'
import L from 'leaflet'
import type { Map as LeafletMap, Marker, Circle, DivIcon, LatLngTuple } from 'leaflet'
import { useGeolocation } from '@/composables/useGeolocation'
import { spotRepository } from '@/lib/spotRepository'
import { getAllPieces, isCollected, savePiece } from '@/lib/db'
import { renderForSpot, toCollectedPiece } from '@/lib/audio'
import { isWithinRadius } from '@/lib/geo'
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

const geo = useGeolocation()

// --- module-level (non-reactive) Leaflet handles ---
let map: LeafletMap | null = null
let playerMarker: Marker | null = null
let accuracyCircle: Circle | null = null
const spotMarkers = new Map<string, Marker>()
let userHasPanned = false

const hasCollectable = computed(() =>
  spots.value.some((s) => s.status === 'collectable'),
)

// Demo center (Potsdamer Platz, Berlin) — also the map's initial view.
const DEMO_CENTER: LatLngTuple = [47.1720042, 12.5525377]

function initMap(): void {
  if (!mapEl.value) return
  map = L.map(mapEl.value, {
    center: DEMO_CENTER,
    zoom: 17,
    zoomControl: false,
  })
  L.control.zoom({ position: 'bottomright' }).addTo(map)
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map)

  // Player marker (pulsing dot) + accuracy circle.
  playerMarker = L.marker(DEMO_CENTER, {
    icon: makePlayerIcon(),
    zIndexOffset: 1000,
    interactive: false,
  }).addTo(map)
  accuracyCircle = L.circle(DEMO_CENTER, {
    radius: 20,
    color: '#3b82f6',
    weight: 1,
    fillOpacity: 0.08,
    opacity: 0.25,
  }).addTo(map)
}

function makePlayerIcon(): DivIcon {
  return L.divIcon({
    className: 'player-icon-wrap',
    html: '<div class="player-icon"></div>',
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  })
}

function makeSpotIcon(spot: MusicSpot): DivIcon {
  const status = spot.status ?? 'unclaimed'
  return L.divIcon({
    className: `spot-icon spot-${status}`,
    html: `<div class="spot-dot"></div><div class="spot-label">${spot.name}</div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  })
}

function addSpotMarkers(): void {
  if (!map) return
  for (const spot of spots.value) {
    if (spotMarkers.has(spot.id)) continue
    const marker = L.marker([spot.lat, spot.lng], {
      icon: makeSpotIcon(spot),
    }).addTo(map)
    marker.bindPopup(popupHtml(spot))
    spotMarkers.set(spot.id, marker)
  }
}

function popupHtml(spot: MusicSpot): string {
  const status = spot.status ?? 'unclaimed'
  const badge =
    status === 'collected' ? 'Collected ✓' : status === 'collectable' ? 'In range!' : 'Out of range'
  return `<div class="spot-popup"><strong>${spot.name}</strong><br/>${
    spot.description ?? ''
  }<br/><span class="badge badge-${status}">${badge}</span></div>`
}

function refreshSpotMarkers(): void {
  for (const spot of spots.value) {
    const m = spotMarkers.get(spot.id)
    if (!m) continue
    m.setIcon(makeSpotIcon(spot))
    m.setPopupContent(popupHtml(spot))
  }
}

// Re-evaluate proximity whenever the player moves.
watch(
  () => geo.position.value,
  (pos) => {
    if (!pos || !map) return
    // Narrow to a plain {lat,lng,accuracy} shape so Leaflet's `LatLng`
    // (imported as a type alias) can't shadow the DOM `GeolocationCoordinates`.
    const coords = pos.coords as unknown as { lat: number; lng: number; accuracy: number }
    const { lat, lng } = coords
    const ll: LatLngTuple = [lat, lng]

    // Move the player marker + accuracy circle.
    playerMarker?.setLatLng(ll)
    accuracyCircle?.setLatLng(ll).setRadius(coords.accuracy)

    // Auto-center only until the user takes over by panning.
    if (!userHasPanned) {
      map.setView(ll, Math.max(map.getZoom(), 17))
    }

    // Proximity → collectable (one-way: unclaimed -> collectable).
    let changed = false
    for (const spot of spots.value) {
      if (spot.status === 'unclaimed' && isWithinRadius(coords, spot, spot.radiusM)) {
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

  // Track manual panning so we stop auto-centering after the user takes over.
  map?.on('dragstart', () => {
    userHasPanned = true
  })
})

onBeforeUnmount(() => {
  geo.stop()
  map?.remove()
  map = null
  playerMarker = null
  accuracyCircle = null
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
