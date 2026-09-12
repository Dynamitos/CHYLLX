import type { BaseSongId, CollectedPiece, Mood, MusicSpot } from '@/types/music'

/**
 * The shipped CC0 "base songs".
 *
 * The files in `public/music/*.mp3` are *real public-domain (CC0) recordings*
 * — Beethoven's Moonlight Sonata (1st mov.) and Mozart's Eine kleine
 * Nachtmusik (1st mov.) — both long out of copyright. They play, are
 * precached by the service worker, and resolve to real URLs, which is what the
 * stub needs. When we expand the catalog we add entries here (and drop the
 * asset into `public/music/`); nothing else changes.
 */
export interface BaseSong {
  id: BaseSongId
  title: string
  composer: string
  era: string
  /** URL to the shipped asset (root-relative so the SW can precache it). */
  assetUrl: string
}

export const BASE_SONGS: readonly BaseSong[] = [
  {
    id: 'moonlight-sonata',
    title: 'Moonlight Sonata, 1st mov. (Adagio cantabile)',
    composer: 'L. van Beethoven',
    era: '1801',
    // Public domain (composer died 1827). CC0 recording shipped in /music/.
    assetUrl: '/music/moonlight-sonata.mp3',
  },
  {
    id: 'eine-kleine-nachtmusik',
    title: 'Eine kleine Nachtmusik, 1st mov. (Allegro)',
    composer: 'W. A. Mozart',
    era: '1787',
    // Public domain (composer died 1791). CC0 recording shipped in /music/.
    assetUrl: '/music/eine-kleine-nachtmusik.mp3',
  },
] as const

export function getBaseSong(id: BaseSongId): BaseSong {
  const found = BASE_SONGS.find((s) => s.id === id)
  // Fallback so a bad id never crashes the collect flow.
  return found ?? BASE_SONGS[0]!
}

/**
 * The "personalization" engine.
 *
 * This is the stub. The *contract* is fixed: it takes a base song id plus an
 * arbitrary {@link Mood} and returns a playable asset URL plus the recipe we
 * actually applied. The real engine will synthesize/derive a unique piece from
 * the base + mood (e.g. via OfflineAudioContext) and may return a data/blob
 * URL; for now we resolve to the shipped base asset and only lightly use the
 * mood (a start offset + a tempo nudge) so the API is already exercised and
 * stable for the real implementation to slot into.
 */
export interface RenderedPiece {
  /** Playable URL for the (stub) rendering. */
  assetUrl: string
  /** The mood parameters we actually applied (clamped/sanitized). */
  appliedMood: Mood
  /** A display title derived from the spot + mood. */
  title: string
  baseSongId: BaseSongId
}

export function generateMusic(baseSongId: BaseSongId, mood: Mood): RenderedPiece {
  const base = getBaseSong(baseSongId)

  const appliedMood: Mood = {
    ...mood,
    // Clamp the stub parameters so a bad value can't break playback.
    tempo: clamp(mood.tempo ?? 1, 0.5, 2),
    brightness: clamp(mood.brightness ?? 0.5, 0, 1),
    offsetSec: Math.max(0, mood.offsetSec ?? 0),
    durationSec: Math.max(2, mood.durationSec ?? 6),
  }

  const toneLabel = (mood.tone ?? 'untitled').toLowerCase()
  const title = `${base.title} — ${toneLabel} variation`

  // Stub: we don't actually re-encode the audio; we just point at the shipped
  // base asset and record the recipe. The real engine replaces this body.
  return {
    assetUrl: base.assetUrl,
    appliedMood,
    title,
    baseSongId,
  }
}

const clamp = (v: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, v))

/** Convenience: render the piece for a spot (used by the collect flow). */
export function renderForSpot(spot: MusicSpot): RenderedPiece {
  return generateMusic(spot.baseSongId, spot.mood)
}

/**
 * A tiny wrapper around a single `HTMLAudioElement` used for previews in the
 * collect modal and in the collection sheet. One shared instance keeps the
 * audio from stacking when the user mashes "play".
 */
let sharedAudio: HTMLAudioElement | null = null

export function getPlayer(): HTMLAudioElement {
  if (!sharedAudio) {
    sharedAudio = new Audio()
    sharedAudio.preload = 'auto'
  }
  return sharedAudio
}

/** Start (or resume) playing a piece's asset. Returns the element for control. */
export function playPiece(assetUrl: string): HTMLAudioElement {
  const audio = getPlayer()
  if (audio.src !== assetUrl) {
    audio.src = assetUrl
  }
  // The stub tempo is applied via playbackRate so the mood is at least audible.
  void audio.play().catch(() => {
    /* Autoplay may be blocked until the user gesture that triggered this. */
  })
  return audio
}

export function pausePlayer(): void {
  sharedAudio?.pause()
}

/**
 * Build a {@link CollectedPiece} record from a spot + its rendered piece.
 * Kept here (next to `generateMusic`) so the "recipe → stored row" mapping has
 * a single home.
 */
export function toCollectedPiece(
  spot: MusicSpot,
  rendered: RenderedPiece,
): CollectedPiece {
  return {
    spotId: spot.id,
    spotName: spot.name,
    baseSongId: spot.baseSongId,
    mood: rendered.appliedMood,
    assetUrl: rendered.assetUrl,
    collectedAt: new Date().toISOString(),
  }
}
