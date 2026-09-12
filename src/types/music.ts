/**
 * Core domain types for Classica.
 *
 * The UI and the collect flow depend only on the `SpotRepository` interface
 * (see `lib/spotRepository.ts`), so a future real backend can be swapped in
 * without touching the map or the modal.
 */

/** A mood/parameter set used to "personalize" a piece. */
export interface Mood {
  /** Emotional tone, e.g. 'calm' | 'bright' | 'melancholy'. */
  tone?: string
  /** Relative tempo multiplier (0.5..2). */
  tempo?: number
  /** Brightness / filter (0..1). */
  brightness?: number
  /** Optional 0-based start offset into the base track (seconds). */
  offsetSec?: number
  /** Optional duration (seconds) to trim the render to. */
  durationSec?: number
}

/** Lifecycle of a music spot from the player's perspective. */
export type SpotStatus = 'unclaimed' | 'collectable' | 'collected'

/** A place on the map that yields a collectable piece when reached. */
export interface MusicSpot {
  id: string
  name: string
  /** Short human description shown in the collect modal. */
  description?: string
  lat: number
  lng: number
  /** Proximity radius in meters at which the spot becomes collectable. */
  radiusM: number
  /** Which shipped base song this spot derives from (see lib/audio.ts). */
  baseSongId: BaseSongId
  /** The (stub) personalization parameters for this spot. */
  mood: Mood
  /** Live status (client-side, never persisted from the backend). */
  status?: SpotStatus
}

/** The set of "base songs" shipped in `public/music/`. */
export type BaseSongId =
  | 'Wolf - Wandererlied'
  | 'Schubert - An die Musik'
  | 'Bruckner - 4th, finale'
  | 'Schubert - Schwanenlied'
  | 'Strauss - Zarathustra'
  | 'frog-turkish'
  | 'eine-kleine-nachtmusik'

/**
 * A piece the player has collected. Persisted to IndexedDB (see lib/db.ts).
 * We store the *recipe* (base song + mood) and the resolved asset URL rather
 * than the bytes, since the base tracks are precached by the service worker.
 */
export interface CollectedPiece {
  spotId: string
  spotName: string
  baseSongId: BaseSongId
  mood: Mood
  /** Resolved playable asset URL for this (stub) rendering. */
  assetUrl: string
  /** ISO timestamp of collection. */
  collectedAt: string
}
