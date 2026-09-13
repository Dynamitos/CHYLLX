# TabiKlang — Explore & Collect

A Pokémon-Go-style **PWA** built on Vue 3 + Vite + TypeScript + MapLibre GL JS
(3D globe + satellite imagery).
A full-screen map of your neighborhood shows your live GPS position and a
handful of **music spots**. Walk into a spot's radius and a **Collect** button
appears; collecting renders a short "personalized" classical piece (from the
shipped CC0 base tracks, parameterized by mood — the personalization is
**stubbed** for now) and saves it to a local, offline, persistent collection.

## Quick start

```sh
npm install
npm run dev        # dev server (geolocation requires localhost or HTTPS)
npm run build      # type-check + production build (emits PWA: manifest + sw.js)
npm run preview    # serve the production build locally
```

> Geolocation (and PWA install) require a **secure context**: `localhost` in
> dev, or an HTTPS tunnel in production. For desktop testing use Chrome
> DevTools → **Sensors → Geolocation** to simulate a position, and the
> "Potsdamer Platz (Berlin)" demo spots are the map's initial view.

## What's implemented

| Area | Where |
|---|---|
| PWA (manifest + Workbox SW, satellite tile caching, precached audio) | `vite.config.ts` (`VitePWA`), `public/icons/`, `src/main.ts` |
| Full-bleed map (MapLibre GL JS globe + Esri satellite raster) | `src/views/MapView.vue` |
| Reactive GPS (`watchPosition` → `ref`s, errors, cleanup) | `src/composables/useGeolocation.ts` |
| Haversine distance / proximity | `src/lib/geo.ts` |
| Spot data + **backend-ready** `SpotRepository` seam | `src/lib/spotRepository.ts`, `src/types/music.ts` |
| "Personalization" stub: `generateMusic(baseSongId, mood)` | `src/lib/audio.ts` |
| CC0 base tracks (public-domain recordings) | `public/music/*.mp3` |
| Collection persistence (IndexedDB, one row per spot) | `src/lib/db.ts` |
| Collect modal (preview + keep) | `src/components/CollectModal.vue` |
| Collection bottom-sheet (list + play) | `src/components/CollectionSheet.vue` |

### The music "personalization" is a stub

`generateMusic(baseSongId, mood)` in `src/lib/audio.ts` is the fixed contract.
For now it resolves to one of the shipped CC0 base tracks and only *lightly*
uses the `Mood` (a start offset + a `playbackRate` nudge) so the API is
exercised and stable. The real engine (e.g. an `OfflineAudioContext`
synthesizer that derives a unique rendition from the base + mood) slots into
the exact same signature — nothing else in the app changes.

The base tracks are **public-domain (CC0) recordings**:
- Beethoven, *Moonlight Sonata* — 1st mov. (`public/music/moonlight-sonata.mp3`)
- Mozart, *Eine kleine Nachtmusik* — 1st mov. (`public/music/eine-kleine-nachtmusik.mp3`)

Both are trimmed to ~90 s excerpts to keep the app installable and the service
worker's precache small. To expand the catalog: add a file to
`public/music/`, add an entry to `BASE_SONGS` in `src/lib/audio.ts`, and add
the `BaseSongId` to `src/types/music.ts`.

### One-time collection per spot

Enforced at three layers:
1. **Client state** — a spot's status transitions `unclaimed → collectable →
   collected` and never back.
2. **IndexedDB** — the collection store is keyed by `spotId`; a second
   `put()` for the same spot overwrites, it can't duplicate.
3. **Hydration on load** — `loadSpots()` marks any already-collected spot as
   `collected` from the DB, so a reload can't re-collect.

### Swapping in a real backend

`MapView.vue` and the collect flow depend **only** on the `SpotRepository`
interface (`getSpots(): Promise<MusicSpot[]>`). To integrate a server:

```ts
// src/lib/httpSpotRepository.ts (example)
export class HttpSpotRepository implements SpotRepository {
  constructor(private baseUrl: string) {}
  async getSpots(): Promise<MusicSpot[]> {
    const res = await fetch(`${this.baseUrl}/spots`)
    return (await res.json()) as MusicSpot[]
  }
}
```

then point `src/lib/spotRepository.ts`'s exported `spotRepository` at it. No
UI changes required.

## Project structure

```
src/
  main.ts                  # app bootstrap + SW registration
  App.vue                  # full-bleed shell
  router/index.ts          # single route -> MapView
  views/MapView.vue        # MapLibre GL JS globe + satellite, GPS, proximity, collect wiring
  components/
    CollectModal.vue       # preview + "keep it"
    CollectionSheet.vue    # bottom sheet, list + play
  composables/useGeolocation.ts
  lib/
    geo.ts                 # Haversine / within-radius
    db.ts                  # IndexedDB collection store
    audio.ts               # base songs + generateMusic stub + player
    spotRepository.ts      # SpotRepository + StaticSpotRepository (demo)
  types/music.ts           # MusicSpot, Mood, CollectedPiece, BaseSongId
public/
  icons/                   # PWA icons (192 / 512 / maskable)
  music/                   # CC0 base tracks (90 s excerpts)
```

## Verification checklist

- `npm run build` — type-checks (`vue-tsc`) and builds; `dist/` contains
  `manifest.webmanifest`, `sw.js`, and the two precached MP3s.
- **Lighthouse → PWA** (against `npm run preview` over HTTPS): installability
  should pass (valid manifest, icons, service worker, HTTPS).
- On a phone / Chrome DevTools device mode + **Sensors → Geolocation**:
  - map renders satellite tiles (globe view by default; toggle to flat via the
    globe control); the player dot follows the simulated position.
  - moving into a demo spot's radius flips it to **collectable** (pulsing
    amber marker + a **Collect** FAB).
  - **Collect** → modal previews the track; **Keep it** saves it; the marker
    turns green "collected"; it can't be collected again (one-time).
  - **Collection** sheet (bottom-left FAB) lists the piece; playback works
    **offline** after first visit (SW precache + IndexedDB persistence across
    reload).

## Notes / limitations

- The demo spot coordinates are real (Potsdamer Platz, Berlin) so the demo
  "just works" if you're there; elsewhere you can still pan/zoom to the
  markers, but proximity won't trigger until a real GPS fix puts you in range.
- The PWA precaches the full app shell + both MP3s (~1.7 MB). Satellite tiles
  are cached at runtime (StaleWhileRevalidate, 30-day TTL) so the map keeps
  rendering offline after the first visit.
- **MapLibre's WebGL worker must be vendored.** MapLibre GL v6 decodes tiles in a
  *module* web worker (`new Worker(url, { type: 'module' })`) whose entry is
  `maplibre-gl/dist/maplibre-gl-worker.mjs` — an ES module that `import`s
  `./maplibre-gl-shared.mjs`. Vite does **not** pre-bundle a web worker like that, so
  MapLibre's default worker URL 404s, the worker dies, and the map falls back to the
  (broken) main-thread path — surfacing as cryptic `e is undefined` /
  `this.properties is undefined` crashes. The worker + its shared chunk are therefore
  vendored as static files in `public/` (`maplibre-gl-worker.mjs` +
  `maplibre-gl-shared.mjs`, with the dangling `sourceMappingURL` refs stripped). Vite
  serves `public/` with a correct `text/javascript` MIME at the exact URL the map
  computes (dev) and `vite build` copies them into `dist/` (prod); the Workbox
  precache glob (`**/*.mjs` is included) then caches them for offline use.
  `vite.config.ts` has a `closeBundle` hook that re-syncs these files from the package
  into `dist/` after every build, so they stay current if you upgrade `maplibre-gl`
  (the `public/` copies are the source of truth for dev; keep them in git).
- **Map tiles are Esri World Imagery** — free, no API key, no account. (MapTiler
  and Mapbox both ship higher-quality satellite imagery but require a key; to
  swap, replace the `ESRI_SATELLITE_TILES` URL in `MapView.vue` and the matching
  `urlPattern` in `vite.config.ts`'s Workbox `runtimeCaching`.)
- Audio preview in the modal is a 3 s clip via a throwaway `Audio` element;
  the collection sheet uses a single shared `HTMLAudioElement` so repeated
  taps don't stack.
