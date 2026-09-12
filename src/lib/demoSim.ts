import type { InjectedPosition } from '@/composables/useGeolocation'

/**
 * A minimal, framework-agnostic "feed" that can drive the (otherwise real)
 * geolocation pipeline with synthetic fixes. `useGeolocation({ feed })` accepts
 * a function that, when it receives the `onFix` callback, should call
 * `onFix({ lat, lng, accuracy })` whenever it has a new position, and return a
 * teardown that stops emitting.
 *
 * We expose just two methods so the UI can:
 *   - `emit(fix)`   — push a one-shot position (teleport to a spot).
 *   - `startOrbit`  — begin a slow circular sweep around a center (walk demo).
 *   - `stopOrbit`   — stop the sweep.
 *
 * No dependency on the map or on real geolocation; purely a coordinate source.
 */
export interface SimFeed {
  emit(fix: InjectedPosition): void
  startOrbit(center: { lng: number; lat: number }, opts?: { radiusM?: number; periodS?: number }): void
  stopOrbit(): void
  /** The feed's contract for `useGeolocation`: wire up + return teardown. */
  wire(onFix: (p: InjectedPosition) => void): () => void
}

/** Build a SimFeed around a given orbit center. */
export function createSimFeed(center?: { lng: number; lat: number }): SimFeed {
  let onFix: ((p: InjectedPosition) => void) | null = null
  let raf: number | null = null
  let orbitT0 = 0
  let orbitCenter: { lng: number; lat: number } | null = center ?? null
  let orbitRadiusM = 250
  let orbitPeriodS = 30

  function tick(now: number): void {
    if (raf === null) return
    if (!orbitCenter) return
    const t = (now - orbitT0) / 1000 / orbitPeriodS // 0..1 per period
    const a = t * Math.PI * 2
    // Convert a meter-radius circle into a [lng, lat] offset (equirectangular
    // is fine at demo radii; we only need it to sweep past nearby spots).
    const dLat = (orbitRadiusM * Math.sin(a)) / 111_320
    const dLng = (orbitRadiusM * Math.cos(a)) / (111_320 * Math.cos((orbitCenter.lat * Math.PI) / 180))
    onFix?.({ lat: orbitCenter.lat + dLat, lng: orbitCenter.lng + dLng, accuracy: 15 })
    raf = requestAnimationFrame(tick)
  }

  return {
    wire(cb) {
      onFix = cb
      return () => {
        onFix = null
        if (raf !== null) cancelAnimationFrame(raf)
        raf = null
      }
    },
    emit(fix) {
      onFix?.(fix)
    },
    startOrbit(c, opts) {
      if (c) orbitCenter = c
      if (opts?.radiusM) orbitRadiusM = opts.radiusM
      if (opts?.periodS) orbitPeriodS = opts.periodS
      if (!orbitCenter) return
      if (raf !== null) cancelAnimationFrame(raf)
      orbitT0 = performance.now()
      raf = requestAnimationFrame(tick)
    },
    stopOrbit() {
      if (raf !== null) cancelAnimationFrame(raf)
      raf = null
    },
  }
}
