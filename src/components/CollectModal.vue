<script setup lang="ts">
import type { MusicSpot } from '@/types/music'
import { getBaseSong, renderForSpot } from '@/lib/audio'

const props = defineProps<{
  spot: MusicSpot
  busy: boolean
}>()

const emit = defineEmits<{
  (e: 'collect', spot: MusicSpot): void
  (e: 'preview', spot: MusicSpot): void
  (e: 'close'): void
}>()

const base = getBaseSong(props.spot.baseSongId)
const rendered = renderForSpot(props.spot)

function onPreviewClick(): void {
  emit('preview', props.spot)
}
</script>

<template>
  <div class="modal-backdrop" @click.self="emit('close')">
    <div class="modal" role="dialog" aria-modal="true" :aria-label="`Collect ${spot.name}`">
      <button class="close" type="button" aria-label="Close" @click="emit('close')">
        ✕
      </button>

      <div class="modal-body">
        <p class="kicker">Music spot reached</p>
        <h2 class="title">{{ spot.name }}</h2>
        <p v-if="spot.description" class="desc">{{ spot.description }}</p>

        <div class="track">
          <div class="track-meta">
            <div class="track-title">{{ rendered.title }}</div>
            <div class="track-sub">{{ base.composer }} · {{ base.era }}</div>
          </div>
          <button
            class="play"
            type="button"
            aria-label="Preview"
            :disabled="busy"
            @click="onPreviewClick"
          >
            ▶
          </button>
        </div>

        <ul class="mood">
          <li v-if="rendered.appliedMood.tone">
            <span class="k">tone</span>{{ rendered.appliedMood.tone }}
          </li>
          <li v-if="rendered.appliedMood.tempo">
            <span class="k">tempo</span>×{{ rendered.appliedMood.tempo.toFixed(2) }}
          </li>
          <li v-if="rendered.appliedMood.brightness !== undefined">
            <span class="k">brightness</span>{{ Math.round(rendered.appliedMood.brightness * 100) }}%
          </li>
        </ul>
      </div>

      <div class="modal-footer">
        <button
          class="keep"
          type="button"
          :disabled="busy"
          @click="emit('collect', spot)"
        >
          {{ busy ? 'Saving…' : 'Keep it' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-backdrop {
  position: absolute;
  inset: 0;
  z-index: 1200;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding: 1rem;
  padding-bottom: calc(1rem + env(safe-area-inset-bottom, 0px));
  background: rgba(2, 6, 23, 0.55);
  backdrop-filter: blur(4px);
}

.modal {
  position: relative;
  width: 100%;
  max-width: 420px;
  border-radius: 20px;
  background: linear-gradient(180deg, #0f172a, #1e293b);
  color: #f8fafc;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
  overflow: hidden;
}

.close {
  position: absolute;
  top: 0.75rem;
  right: 0.75rem;
  width: 2rem;
  height: 2rem;
  border: none;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.08);
  color: #cbd5e1;
  font-size: 0.95rem;
  cursor: pointer;
}

.close:hover {
  background: rgba(255, 255, 255, 0.16);
}

.modal-body {
  padding: 1.5rem 1.25rem 1rem;
}

.kicker {
  margin: 0 0 0.25rem;
  font-size: 0.72rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #818cf8;
}

.title {
  margin: 0 0 0.4rem;
  font-size: 1.5rem;
  font-weight: 700;
}

.desc {
  margin: 0 0 1rem;
  color: #cbd5e1;
  font-size: 0.92rem;
  line-height: 1.5;
}

.track {
  display: flex;
  align-items: center;
  gap: 0.9rem;
  padding: 0.85rem 0.95rem;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
  margin-bottom: 1rem;
}

.track-meta {
  flex: 1;
  min-width: 0;
}

.track-title {
  font-weight: 600;
  font-size: 0.98rem;
  margin-bottom: 0.15rem;
}

.track-sub {
  color: #94a3b8;
  font-size: 0.82rem;
}

.play {
  width: 3rem;
  height: 3rem;
  flex: none;
  border: none;
  border-radius: 50%;
  background: linear-gradient(135deg, #4f46e5, #7c3aed);
  color: #fff;
  font-size: 1.1rem;
  cursor: pointer;
  box-shadow: 0 6px 18px rgba(79, 70, 229, 0.4);
  transition: transform 0.12s ease;
}

.play:active {
  transform: scale(0.94);
}

.play:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.mood {
  list-style: none;
  margin: 0 0 0.5rem;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.mood li {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.25rem 0.6rem;
  border-radius: 999px;
  background: rgba(129, 140, 248, 0.12);
  border: 1px solid rgba(129, 140, 248, 0.3);
  font-size: 0.78rem;
  color: #c7d2fe;
}

.mood .k {
  color: #818cf8;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-size: 0.68rem;
}

.modal-footer {
  padding: 1rem 1.25rem;
  padding-bottom: calc(1rem + env(safe-area-inset-bottom, 0px));
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.keep {
  width: 100%;
  padding: 0.95rem;
  border: none;
  border-radius: 14px;
  background: linear-gradient(135deg, #10b981, #059669);
  color: #fff;
  font-size: 1.02rem;
  font-weight: 700;
  cursor: pointer;
  box-shadow: 0 8px 24px rgba(16, 185, 129, 0.35);
  transition: transform 0.12s ease, opacity 0.2s ease;
}

.keep:active {
  transform: scale(0.98);
}

.keep:disabled {
  opacity: 0.6;
  cursor: wait;
}
</style>
