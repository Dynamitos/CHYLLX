import type { MusicSpot } from '@/types/music'

/**
 * The seam between the app and "where do the spots come from".
 *
 * Today this is implemented by {@link StaticSpotRepository}, which returns a
 * small hardcoded set of demo spots. To integrate a real backend later, add a
 * new class (e.g. `HttpSpotRepository`) that implements the same interface and
 * point the app at it — `MapView.vue` and the collect flow depend only on this
 * interface, so no UI changes are required.
 */
export interface SpotRepository {
  /**
   * Fetch the full set of music spots.
   *
   * Implementations should return a *fresh* array each call (or at least not
   * mutate shared state), because the client decorates it with live `status`.
   */
  getSpots(): Promise<MusicSpot[]>
}

/**
 * A set of a handful of demo spots spread across a dense, walkable area.
 *
 * Center: Potsdamer Platz, Berlin (~52.509, 13.377). Real coordinates at
 * street/point scale — if you happen to be there, the demo "just works";
 * otherwise the map still renders and you can pan/zoom to the markers.
 */
const DEMO_CENTER = { lat: 47.1720042, lng: 12.5525377 }

// Roughly 30–120 m apart so each is a distinct "walk to" target.
const OFFSETS: Array<{
  id: string
  name: string
  description: string
  dLat: number
  dLng: number
  baseSongId: MusicSpot['baseSongId']
  tone: string
  tempo: number
  brightness: number
}> = [
  {
    id: 'spot-brunnen',
    name: 'Der Brunnen',
    description: 'A quiet corner fountain. Let the water settle your mind.',
    dLat: 0.0008,
    dLng: 0.0012,
    baseSongId: 'moonlight-sonata',
    tone: 'calm',
    tempo: 0.8,
    brightness: 0.4,
  },
  {
    id: 'spot-hain',
    name: 'Gedächtnis-Hain',
    description: 'A shaded grove. The birdsong here pairs with something older.',
    dLat: -0.0011,
    dLng: 0.0006,
    baseSongId: 'eine-kleine-nachtmusik',
    tone: 'bright',
    tempo: 1.0,
    brightness: 0.7,
  },
  {
    id: 'spot-galerie',
    name: 'Galerienhof',
    description: 'A covered passage. Walk slowly — the acoustics are generous.',
    dLat: 0.0006,
    dLng: -0.0014,
    baseSongId: 'moonlight-sonata',
    tone: 'melancholy',
    tempo: 0.9,
    brightness: 0.3,
  },
  {
    id: 'spot-platznord',
    name: 'Platznord',
    description: 'A wide open plaza. Stand still and listen for a moment.',
    dLat: -0.0009,
    dLng: -0.0011,
    baseSongId: 'eine-kleine-nachtmusik',
    tone: 'bright',
    tempo: 1.1,
    brightness: 0.8,
  },
]

const DEMO_SPOTS: MusicSpot[] = OFFSETS.map((o) => ({
  id: o.id,
  name: o.name,
  description: o.description,
  lat: DEMO_CENTER.lat + o.dLat,
  lng: DEMO_CENTER.lng + o.dLng,
  // 15 m radius per the design; one-time collection.
  radiusM: 15,
  baseSongId: o.baseSongId,
  mood: {
    tone: o.tone,
    tempo: o.tempo,
    brightness: o.brightness,
  },
}))

/** A `SpotRepository` backed by the in-app demo set. */
export class StaticSpotRepository implements SpotRepository {
  async getSpots(): Promise<MusicSpot[]> {
    // Return a fresh copy so the client is free to decorate `status`.
    return DEMO_SPOTS.map((s) => ({ ...s, mood: { ...s.mood } }))
  }
}

/**
 * The default repository the app uses today. Swap this out for
 * `HttpSpotRepository` (or similar) when a real backend exists.
 */
export const spotRepository: SpotRepository = new StaticSpotRepository()
