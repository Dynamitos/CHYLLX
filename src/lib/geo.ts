/**
 * Small geographic helpers. Distances use the Haversine formula, which is
 * accurate enough for the tens-of-meters precision GPS provides in the
 * scenarios we care about (walking a neighborhood).
 */

export interface LatLng {
  lat: number
  lng: number
}

const EARTH_RADIUS_M = 6_371_000

const toRad = (deg: number): number => (deg * Math.PI) / 180

/** Great-circle distance between two coordinates, in meters. */
export function haversineMeters(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
  return EARTH_RADIUS_M * c
}

/** Whether `pos` is within `radiusM` of `target`. */
export function isWithinRadius(
  pos: LatLng,
  target: LatLng,
  radiusM: number,
): boolean {
  return haversineMeters(pos, target) <= radiusM
}
