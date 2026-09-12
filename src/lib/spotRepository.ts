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

// Roughly 30–120 m apart so each is a distinct "walk to" target.
const OFFSETS: Array<{
  id: string
  name: string
  description: string
  lat: number
  lng: number
  baseSongId: MusicSpot['baseSongId']
  tone: string
}> = [
  {
    id: 'spot-wiegenwald',
    name: 'Wiegenwald',
    description: '"Cradle forest" — a protected grove of old cembra pines (Zirbel) in a boggy meadow, a designated natural gem (Naturjuwel) of the Nationalpark.',
    lat: 47.1700288,
    lng: 12.6234818,
    baseSongId: 'frog-turkish',
    tone: 'Calm, anticipatory',
  },
  {
    id: 'spot-gruensee',
    name: 'Grünsee',
    description: 'Smaller emerald-green lake at the gondola middle station — on the approach route before the hut. Good "first checkpoint" for the ascent; calm, reflective mood.',
    lat: 47.1631071,
    lng: 12.6192457,
    baseSongId: 'frog-turkish',
    tone: 'Reflective, intimate',
  },
  {
    id: 'spot-weissee-north',
    name: 'Weißsee',
    description: 'The turquoise glacial reservoir with the snow-dusted 3,000 m peaks around you.',
    lat: 47.1323455,
    lng: 12.6237069,
    baseSongId: 'frog-turkish',
    tone: 'Expansive, triumphant',
  },
  {
    id: 'spot-steinmann',
    name: 'Steinmann',
    description: 'Marked stone cairn at the top-out of the ferrata, on the southern shore.',
    lat: 47.129703,
    lng: 12.6242461,
    baseSongId: 'frog-turkish',
    tone: 'Eulogy, elegy',
  },
  {
    id: 'spot-medelz',
    name: 'Medelz',
    description: 'Big open plateau with a vast panorama over the Glockner range and all the way across to the Kals valley by the Großglockner.',
    lat: 47.1158043,
    lng: 12.6270994,
    baseSongId: 'frog-turkish',
    tone: 'bright',
  },
]

const DEMO_SPOTS: MusicSpot[] = OFFSETS.map((o) => ({
  id: o.id,
  name: o.name,
  description: o.description,
  lat: o.lat,
  lng: o.lng,
  // 15 m radius per the design; one-time collection.
  radiusM: 15,
  baseSongId: o.baseSongId,
  mood: {
    tone: o.tone,
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
