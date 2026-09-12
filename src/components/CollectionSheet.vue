<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import type { CollectedPiece } from '@/types/music'
import { getBaseSong, playPiece, pausePlayer } from '@/lib/audio'

const props = defineProps<{
  open: boolean
  pieces: CollectedPiece[]
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const playingId = ref<string | null>(null)

function toggle(p: CollectedPiece): void {
  if (playingId.value === p.spotId) {
    pausePlayer()
    playingId.value = null
    return
  }
  playPiece(p.assetUrl)
  playingId.value = p.spotId
}

// Pause audio when the sheet closes.
watch(
  () => props.open,
  (open) => {
    if (!open) {
      pausePlayer()
      playingId.value = null
    }
  },
)

onBeforeUnmount(() => {
  pausePlayer()
})

function baseTitle(p: CollectedPiece): string {
  return getBaseSong(p.baseSongId).title
}

function baseComposer(p: CollectedPiece): string {
  return getBaseSong(p.baseSongId).composer
}
</script>

<template>
  <transition name="sheet">
    <div v-if="open" class="sheet-backdrop" @click.self="emit('close')">
      <div
        class="sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Your collection"
      >
        <div class="grab" aria-hidden="true"></div>

        <header class="sheet-head">
          <h2>Collection</h2>
          <span class="count">{{ pieces.length }} piece{{ pieces.length === 1 ? '' : 's' }}</span>
          <button class="close" type="button" aria-label="Close" @click="emit('close')">
            ✕
          </button>
        </header>

        <div class="sheet-scroll">
          <p v-if="pieces.length === 0" class="empty">
            You haven't collected any pieces yet. Head toward a glowing marker on
            the map — when you're in range, a <strong>Collect</strong> button will
            appear.
          </p>

          <ul v-else class="list">
            <li v-for="p in pieces" :key="p.spotId" class="row">
              <button
                class="thumb"
                type="button"
                :aria-label="playingId === p.spotId ? 'Pause' : 'Play'"
                @click="toggle(p)"
              >
                <span class="glyph">{{ playingId === p.spotId ? '❚❚' : '▶' }}</span>
              </button>

              <div class="meta">
                <div class="row-title">{{ p.spotName }}</div>
                <div class="row-sub">
                  {{ baseComposer(p) }} · {{ baseTitle(p) }}
                </div>
                <div class="row-mood" v-if="p.mood.tone">
                  <span class="chip">tone: {{ p.mood.tone }}</span>
                  <span class="chip" v-if="p.mood.tempo">
                    tempo ×{{ p.mood.tempo.toFixed(2) }}
                  </span>
                  <span class="chip" v-if="p.mood.brightness !== undefined">
                    brightness {{ Math.round(p.mood.brightness * 100) }}%
                  </span>
                </div>
              </div>

              <div class="when">{{ formatWhen(p.collectedAt) }}</div>
            </li>
          </ul>
        </div>
      </div>
    </div>
  </transition>
</template>

<script lang="ts">
// Small helper: keep the template clean by moving the date formatting here.
// (Kept in a separate non-setup script block to avoid cluttering setup scope.)
export function formatWhen(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
</script>

<style scoped>
.sheet-backdrop {
  position: absolute;
  inset: 0;
  z-index: 1100;
  background: rgba(2, 6, 23, 0.45);
  display: flex;
  align-items: flex-end;
}

.sheet {
  position: relative;
  width: 100%;
  max-height: 82vh;
  display: flex;
  flex-direction: column;
  background: linear-gradient(180deg, #0f172a, #1e293b);
  color: #f8fafc;
  border-radius: 22px 22px 0 0;
  box-shadow: 0 -12px 40px rgba(0, 0, 0, 0.5);
}

.grab {
  width: 44px;
  height: 5px;
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.25);
  margin: 0.6rem auto 0;
}

.sheet-head {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.7rem 1.1rem 0.9rem;
}

.sheet-head h2 {
  margin: 0;
  font-size: 1.2rem;
  font-weight: 700;
  flex: 1;
}

.count {
  color: #94a3b8;
  font-size: 0.85rem;
}

.close {
  width: 2rem;
  height: 2rem;
  border: none;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.08);
  color: #cbd5e1;
  cursor: pointer;
}

.sheet-scroll {
  overflow-y: auto;
  padding: 0 1.1rem;
  padding-bottom: calc(1.1rem + env(safe-area-inset-bottom, 0px));
  flex: 1;
  min-height: 0;
}

.empty {
  color: #94a3b8;
  line-height: 1.6;
  font-size: 0.92rem;
  padding: 1rem 0.25rem;
}

.list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.row {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 0.85rem;
  align-items: center;
  padding: 0.7rem 0.85rem;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.07);
}

.thumb {
  width: 2.9rem;
  height: 2.9rem;
  flex: none;
  border: none;
  border-radius: 50%;
  background: linear-gradient(135deg, #4f46e5, #7c3aed);
  color: #fff;
  font-size: 1rem;
  cursor: pointer;
  display: grid;
  place-items: center;
}

.thumb .glyph {
  font-size: 0.85rem;
}

.meta {
  min-width: 0;
}

.row-title {
  font-weight: 600;
  font-size: 0.98rem;
  margin-bottom: 0.15rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.row-sub {
  color: #94a3b8;
  font-size: 0.8rem;
  margin-bottom: 0.4rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.row-mood {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.chip {
  padding: 0.1rem 0.45rem;
  border-radius: 999px;
  background: rgba(129, 140, 248, 0.12);
  border: 1px solid rgba(129, 140, 248, 0.3);
  color: #c7d2fe;
  font-size: 0.7rem;
}

.when {
  color: #64748b;
  font-size: 0.72rem;
  white-space: nowrap;
}

/* --- Sheet transition --- */
.sheet-enter-active,
.sheet-leave-active {
  transition: opacity 0.25s ease;
}
.sheet-enter-active .sheet,
.sheet-leave-active .sheet {
  transition: transform 0.28s cubic-bezier(0.22, 1, 0.36, 1);
}
.sheet-enter-from,
.sheet-leave-to {
  opacity: 0;
}
.sheet-enter-from .sheet,
.sheet-leave-to .sheet {
  transform: translateY(100%);
}
</style>
