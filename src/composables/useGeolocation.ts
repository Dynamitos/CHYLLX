import { onScopeDispose, ref, type Ref } from 'vue'

// A minimal, injectable position source. The real geolocation code path is the
// default; a test/demo harness can pass a `feed` that drives the *same* reactive
// `position`/`accuracy` the UI already consumes, so it reuses the entire marker,
// accuracy-ring, and proximity pipeline with no duplication.
export interface InjectedPosition {
  readonly lat: number
  readonly lng: number
  readonly accuracy: number
}

export interface GeolocationOptions {
  /** When provided, `start()` uses this source instead of `navigator.geolocation`. */
  feed?: {
    wire(onFix: (p: InjectedPosition) => void): () => void
  }
}

export type GeoState = 'idle' | 'acquiring' | 'ready' | 'denied' | 'unavailable'

export interface Geolocation {
  /** Reactive, resolved position (or null). */
  position: Ref<GeolocationPosition | null>
  /** Reactive horizontal accuracy in meters (or null). */
  accuracy: Ref<number | null>
  /** Reactive lifecycle/error state for the UI banner. */
  state: Ref<GeoState>
  /** A human message when `state` is an error. */
  error: Ref<string | null>
  /** Start watching. Safe to call once; idempotent. */
  start: () => void
  /** Stop watching and release the watcher. */
  stop: () => void
}

/**
 * Wraps `navigator.geolocation.watchPosition` in Vue-reactive state.
 *
 * - Emits the first fix as fast as the platform allows.
 * - Degrades gracefully: if permission is denied or the API is absent we set
 *   `state` to `denied`/`unavailable` and never throw — the map still works,
 *   it just stays at its default center.
 * - Cleans up the watcher on scope disposal so we don't leak a watch handle.
 */
export function useGeolocation(options: GeolocationOptions = {}): Geolocation {
  const position = ref<GeolocationPosition | null>(null)
  const accuracy = ref<number | null>(null)
  const state = ref<GeoState>('idle')
  const error = ref<string | null>(null)
  let watchId: number | null = null
  let started = false
  // Set by an injected feed (demo mode) so `stop()` can tear it down too.
  let teardownFeed: (() => void) | null = null

  const applyFix = (
    p: { lat: number | undefined; lng: number | undefined; accuracy: number },
  ): void => {
    if (typeof p.lat !== 'number' || !Number.isFinite(p.lat) || typeof p.lng !== 'number' || !Number.isFinite(p.lng)) {
      // Same guard as the real path: never store a non-finite fix.
      error.value = 'Position is invalid; waiting for a valid fix.'
      state.value = 'acquiring'
      return
    }
    // Build a structurally-valid `GeolocationPosition` so the existing
    // `resolveCoords`/watcher code works unchanged.
    const fakePos: GeolocationPosition = {
      coords: {
        latitude: p.lat,
        longitude: p.lng,
        accuracy: Number.isFinite(p.accuracy) ? p.accuracy : 0,
        altitude: null,
        altitudeAccuracy: null,
        heading: null,
        speed: null,
      },
      timestamp: Date.now(),
    } as GeolocationPosition
    position.value = fakePos
    accuracy.value = Number.isFinite(p.accuracy) ? p.accuracy : null
    state.value = 'ready'
    error.value = null
  }

  const start = (): void => {
    if (started) return
    started = true

    // Demo/test injection: drive the same reactive state from an external feed.
    // This is how the in-app "simulate" mode works — no navigator.geolocation
    // needed, so it functions in headless or permission-denied contexts too.
    if (options.feed) {
      state.value = 'acquiring'
      teardownFeed = options.feed.wire(applyFix)
      return
    }

    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      state.value = 'unavailable'
      error.value = 'Geolocation is not available in this browser.'
      return
    }

    state.value = 'acquiring'

    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        // The W3C `GeolocationCoordinates` exposes `latitude`/`longitude` (the TS
        // lib confirms: `lat`/`lng` are *not* on the type). A couple of wrappers
        // mirror the values onto `lat`/`lng`, so we fall back to those, then
        // validate with Number.isFinite. An invalid value would make MapLibre
        // throw "Invalid LngLat object: (NaN, NaN)" — so we reject it via
        // applyFix the same way we'd reject a hard failure.
        const coords = pos.coords as unknown as {
          latitude?: number
          longitude?: number
          lat?: number
          lng?: number
          accuracy?: number
        }
        const lat = typeof coords.latitude === 'number' ? coords.latitude : coords.lat
        const lng = typeof coords.longitude === 'number' ? coords.longitude : coords.lng
        const acc = typeof coords.accuracy === 'number' ? coords.accuracy : 0
        applyFix({ lat, lng, accuracy: acc })
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          state.value = 'denied'
          error.value =
            'Location permission was denied. Enable location access to track your position.'
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          state.value = 'unavailable'
          error.value = 'Your position could not be determined right now.'
        } else {
          state.value = 'unavailable'
          error.value = 'Location is temporarily unavailable.'
        }
      },
      {
        enableHighAccuracy: true,
        maximumAge: 2000,
        timeout: 15000,
      },
    )
  }

  const stop = (): void => {
    if (watchId !== null && typeof navigator !== 'undefined' && 'geolocation' in navigator) {
      navigator.geolocation.clearWatch(watchId)
    }
    watchId = null
    if (teardownFeed) {
      teardownFeed()
      teardownFeed = null
    }
    started = false
  }

  onScopeDispose(stop)

  return { position, accuracy, state, error, start, stop }
}
