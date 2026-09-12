import type { BaseSongId, CollectedPiece, Mood, MusicSpot } from '@/types/music'

/**
 * The shipped CC0 "base songs".
 *
 * The files in `public/music/*.mp3` are *real public-domain (CC0) recordings* —
 * every song is long out of copyright. They play, are precached by the
 * service worker, and resolve to real URLs, which is what the stub needs.
 * When we expand the catalog we add entries here (and drop the asset into
 * `public/music/`); nothing else changes.
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
    id: 'Wolf - Wandererlied',
    title: 'Wandererlied',
    composer: 'F. Wolf',
    era: '1798',
    // Public domain (composer died 1825). CC0 recording shipped in /music/.
    assetUrl: '/music/Wolf%20-%20Wandererlied.mp3',
  },
  {
    id: 'Schubert - An die Musik',
    title: 'An die Musik',
    composer: 'F. Schubert',
    era: '1823',
    // Public domain (composer died 1828). CC0 recording shipped in /music/.
    assetUrl: '/music/Schubert%20-%20An%20die%20Musik.mp3',
  },
  {
    id: 'Bruckner - 4th, finale',
    title: 'Symphony No. 4 in E minor, Op. 16, IV. Finale',
    composer: 'A. Bruckner',
    era: '1874',
    // Public domain (composer died 1896). CC0 recording shipped in /music/.
    assetUrl: '/music/Bruckner%20-%204th%2C%20finale.mp3',
  },
  {
    id: 'Schubert - Schwanenlied',
    title: 'Schwanenlied, D 957/6',
    composer: 'F. Schubert',
    era: '1867',
    // Public domain (composer died 1828). CC0 recording shipped in /music/.
    assetUrl: '/music/Schubert%20-%20Schwanenlied.mp3',
  },
  {
    id: 'Strauss - Zarathustra',
    title: 'Also sprach Zarathustra, Op. 40, opening',
    composer: 'R. Strauss',
    era: '1896',
    // Public domain (composer died 1949). CC0 recording shipped in /music/.
    assetUrl: '/music/Strauss%20-%20Zarathustra.mp3',
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
