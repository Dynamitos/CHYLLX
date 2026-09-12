import { onScopeDispose, ref, type Ref } from 'vue'

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
export function useGeolocation(): Geolocation {
  const position = ref<GeolocationPosition | null>(null)
  const accuracy = ref<number | null>(null)
  const state = ref<GeoState>('idle')
  const error = ref<string | null>(null)
  let watchId: number | null = null
  let started = false

  const start = (): void => {
    if (started) return
    started = true

    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      state.value = 'unavailable'
      error.value = 'Geolocation is not available in this browser.'
      return
    }

    state.value = 'acquiring'

    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        // The W3C `GeolocationCoordinates` exposes `latitude`/`longitude` (the TS
        // lib confirms: `lat`/`lng` are *not* on the type). Some environments have
        // been observed delivering a fix whose values are NaN/missing, and a couple
        // of wrappers mirror the values onto `lat`/`lng` as well. To be robust we
        // read the canonical names and fall back to the alternate, then validate
        // with Number.isFinite. Passing an invalid value downstream makes MapLibre
        // throw "Invalid LngLat object: (NaN, NaN)" — so we reject it the same way
        // we'd reject a hard failure: stay in `acquiring`, never store it.
        const coords = pos.coords as unknown as {
          latitude?: number
          longitude?: number
          lat?: number
          lng?: number
          accuracy?: number
        }
        const lat = typeof coords.latitude === 'number' ? coords.latitude : coords.lat
        const lng = typeof coords.longitude === 'number' ? coords.longitude : coords.lng
        if (typeof lat !== 'number' || !Number.isFinite(lat) || typeof lng !== 'number' || !Number.isFinite(lng)) {
          error.value = 'Position is invalid; waiting for a valid fix.'
          state.value = 'acquiring'
          return
        }
        const acc = typeof coords.accuracy === 'number' && Number.isFinite(coords.accuracy) ? coords.accuracy : null
        position.value = pos
        accuracy.value = acc
        state.value = 'ready'
        error.value = null
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
    started = false
  }

  onScopeDispose(stop)

  return { position, accuracy, state, error, start, stop }
}
