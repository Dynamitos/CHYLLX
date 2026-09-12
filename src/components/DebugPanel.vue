<script setup lang="ts">
/**
 * Dev-only debug panel: force-collect any spot without walking there, and
 * reset a spot back to `unclaimed` (deleting its saved piece). Only mounted
 * when `import.meta.env.DEV` is true (see MapView.vue) — never shipped in a
 * production build.
 */
import type { MusicSpot } from '@/types/music'

defineProps<{
  open: boolean
  spots: MusicSpot[]
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'force-collect', spot: MusicSpot): void
  (e: 'reset', spot: MusicSpot): void
}>()
</script>

<template>
  <transition name="sheet">
    <div v-if="open" class="sheet-backdrop" @click.self="emit('close')">
      <div class="sheet" role="dialog" aria-modal="true" aria-label="Debug panel">
        <div class="grab" aria-hidden="true"></div>

        <header class="sheet-head">
          <h2>🐞 Debug</h2>
          <span class="hint">dev-only, bypasses GPS proximity</span>
          <button class="close" type="button" aria-label="Close" @click="emit('close')">
            ✕
          </button>
        </header>

        <div class="sheet-scroll">
          <ul class="list">
            <li v-for="s in spots" :key="s.id" class="row">
              <div class="meta">
                <div class="row-title">{{ s.name }}</div>
                <div class="row-sub">status: {{ s.status ?? 'unclaimed' }} · {{ s.baseSongId }}</div>
              </div>
              <button class="btn collect" type="button" @click="emit('force-collect', s)">
                Force collect
              </button>
              <button
                class="btn reset"
                type="button"
                :disabled="(s.status ?? 'unclaimed') !== 'collected'"
                @click="emit('reset', s)"
              >
                Reset
              </button>
            </li>
          </ul>
        </div>
      </div>
    </div>
  </transition>
</template>

<style scoped>
.sheet-backdrop {
  position: absolute;
  inset: 0;
  z-index: 1200;
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
  background: linear-gradient(180deg, #1c1005, #2b1502);
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
  font-size: 1.1rem;
  font-weight: 700;
}

.hint {
  color: #fbbf24;
  font-size: 0.75rem;
  flex: 1;
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
  grid-template-columns: 1fr auto auto;
  gap: 0.6rem;
  align-items: center;
  padding: 0.7rem 0.85rem;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.row-title {
  font-weight: 600;
  font-size: 0.95rem;
}

.row-sub {
  color: #cbbfa8;
  font-size: 0.78rem;
}

.btn {
  border: none;
  border-radius: 999px;
  padding: 0.45rem 0.75rem;
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
}

.btn.collect {
  background: linear-gradient(135deg, #4f46e5, #7c3aed);
  color: #fff;
}

.btn.reset {
  background: rgba(248, 113, 113, 0.15);
  color: #fca5a5;
}

.btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

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
