# Plan: "Classica Go" — PWA for exploring outdoors & collecting classical music

A Pokémon-Go-style mobile PWA on the existing Vue 3 + Vite + TS + vue-router
scaffold. A full-screen map of the surroundings shows the player's live GPS
position and **music spots** (markers). Walking within a spot's radius makes it
**collectable**; collecting synthesizes/plays a short classical piece (from
shipped CC0 tracks, parameterized by mood — the "personalization" stub) and
saves it to a local, offline, persistent collection.

## Confirmed decisions

- **Q1** Map: **Leaflet + OpenStreetMap** tiles (no key, offline-able).
- **Q2** PWA tooling: **`vite-plugin-pwa`** (manifest + Workbox SW + tile caching).
- **Q3** Spots: **hardcoded/seeded demo spots in-app now**, but with a
  **backend-ready data layer** (a `SpotRepository` interface so a real server
  can be dropped in later without touching the UI).
- **Q4** Music: **ship real CC0 classical mp3s** (Mozart's *Eine kleine
  Nachtmusik* 1st mov. and Beethoven's *Moonlight Sonata* 1st mov., both
  public-domain). The stub `generateMusic(baseSongId, mood)` selects the base
  track and lightly uses the mood (start offset + playbackRate) to make the
  personalization seam exercised and stable; the real synthesis engine slots
  into the same contract later.
- **Q5** Collection persistence: **IndexedDB**.
- **Q6** Collection rules: **one-time collect per spot** (~15 m radius), spot
  then renders as "collected".
- **Q7** Scope: **minimal, single full-screen map view** + bottom-sheet
  collection + collect modal. Replace the demo Home/About routes.

## Context (codebase)

Fresh scaffold (`chyllx`): `src/main.ts` mounts `App.vue`; `src/App.vue` shows a
`header` + `RouterView`; router has `/` (HomeView) and `/about` (AboutView).
Boilerplate to remove: `src/views/HomeView.vue`, `AboutView.vue`,
`src/components/TheWelcome.vue`, `HelloWorld.vue`, `WelcomeItem.vue`, and the
`src/components/icons/*` set. `src/assets/main.css` wraps `#app` in a
`max-width:1280px` centered box — that must be overridden for a full-bleed
mobile map. `public/` holds only `favicon.ico`. Node v26, `@` → `src` alias
already configured in `vite.config.ts`.

## Approach

1. **PWA**: add `vite-plugin-pwa`. Configure `VitePWA` in `vite.config.ts`
   (name, theme_color, display `standalone`, icons 192/512 + maskable,
   `workbox` runtime caching of OSM tile subdomains so the map still renders
   offline, precache for app shell). Register SW in `main.ts` via
   `virtual:pwa-register`.
2. **Shell**: reduce `App.vue` to a full-bleed container (no header/logo);
   rewrite `main.css` base to remove the centered max-width constraint for
   the map area. Router: single route `/` → `MapView` (keep vue-router, drop
   About).
3. **Map**: `MapView.vue` initializes a Leaflet map on a full-screen div
   (import `leaflet/dist/leaflet.css`), tiles from OpenStreetMap, default
   center to a fixed demo location (configurable), then follows the player.
4. **GPS**: `composables/useGeolocation.ts` wraps
   `navigator.geolocation.watchPosition` into a reactive
   `{ position, accuracy, error }` (Vue `ref`s), with cleanup on unmount.
   Permission prompt on first use; graceful fallback (center stays fixed,
   show a banner) when denied.
5. **Distance / proximity**: `lib/geo.ts` — Haversine `distanceMeters(a,b)` and
   `isWithinSpot(pos, spot, radiusM)`. In `MapView`, watch player position;
   for each uncollected spot, when within radius set `spot.status='collectable'`
   (one-time; once collected, stays `collected`).
6. **Spots data + backend-ready layer**:
   - `types/music.ts` — `MusicSpot { id, name, lat, lng, radiusM, baseSongId,
     mood, ... }`, `Mood`, `CollectedPiece`, `SpotStatus`.
   - `lib/spotRepository.ts` — `interface SpotRepository {
       getSpots(): Promise<MusicSpot[]> }` with a default
       `StaticSpotRepository` holding the **hardcoded demo spots** (a handful
       around the demo center). A future `HttpSpotRepository` implements the
       same interface → swap point for a real backend, UI untouched.
7. **Music stub**: `lib/audio.ts`
   - Ship a few CC0 classical mp3s in `public/music/*.mp3` (placeholder
     assets; the exact tracks to be sourced later — use small CC0 public-domain
     clips, e.g. short excerpts of public-domain compositions; note in plan
     that real files are to be dropped in).
   - `generateMusic(baseSongId: string, mood: Mood): Promise<CandidatePiece>`
     **stub**: maps `baseSongId` → one of the shipped mp3s and accepts `mood`
     (e.g. `tempo`, `mood` tone, `brightness`) but for now only lightly uses it
     (e.g. picks a trim/start offset & playbackRate) so the signature is stable
     for the real personalization engine later. Returns the asset URL + the
     mood metadata actually applied.
   - A small `AudioPlayer` helper for preview in the modal/collection.
8. **Collection**: `lib/db.ts` — minimal IndexedDB wrapper (via `idb` or raw
   IndexedDB) storing `CollectedPiece { spotId, title, mood, assetUrl, mood,
     collectedAt }`. One row per spot (enforced on collect).
   - `collectSpot(spot)`: call `generateMusic`, write to IDB, update reactive
     spot status → `collected`, mark marker as collected.
9. **UI (minimal)**:
   - `MapView.vue` — map + player marker (custom pulsing divIcon) + spot
     markers (divIcon, distinct styles: unclaimed / collectable (pulse) /
     collected (muted)). On collectable, a fixed "Collect" button appears.
   - `components/CollectModal.vue` — shows spot name, plays the generated
     preview, "Keep it" finalizes collection.
   - `components/CollectionSheet.vue` — bottom sheet listing collected pieces
     (title, mood, play button). Toggled by a persistent "Collection (n)" FAB.
   - A thin geolocation-status banner (denied / acquiring) when relevant.

## Reuse / existing

- `@` → `src` alias (`vite.config.ts`) — keep.
- vue-router already installed — keep, single route.
- `index.html` `#app` mount point — keep; update `<title>`, add theme-color
  meta, mobile viewport (`viewport-fit=cover`).
- Remove boilerplate files listed in Context.

## Files to modify / create

Modify:
- `package.json` — add `leaflet`, `@types/leaflet`, `vite-plugin-pwa`, `idb`.
- `vite.config.ts` — add `VitePWA` plugin + config.
- `index.html` — title, theme-color, mobile viewport.
- `src/main.ts` — register SW (`virtual:pwa-register`), import leaflet css if
  global, mount.
- `src/App.vue` — strip to full-bleed shell.
- `src/assets/main.css` (+ `base.css`) — remove centered max-width for app;
  full-height layout.
- `src/router/index.ts` — single `/` → `MapView`, drop About.
- `src/views/HomeView.vue` → replaced by `MapView.vue`.

Create:
- `src/views/MapView.vue`
- `src/components/CollectModal.vue`
- `src/components/CollectionSheet.vue`
- `src/composables/useGeolocation.ts`
- `src/lib/geo.ts`
- `src/lib/db.ts`
- `src/lib/audio.ts`
- `src/lib/spotRepository.ts`
- `src/types/music.ts`
- `public/music/*.mp3` (placeholder CC0 clips)
- PWA icons: `public/pwa-192.png`, `public/pwa-512.png` (+ maskable),
  `public/icons/` (simple generated icon set).
- `src/env.d.ts` — add `virtual:pwa-register` module declaration.

Remove:
- `src/views/AboutView.vue`, `src/components/TheWelcome.vue`,
  `HelloWorld.vue`, `WelcomeItem.vue`, `src/components/icons/*`.

## Steps

- [x] 1. Install deps: `leaflet`, `@types/leaflet`, `vite-plugin-pwa`, `idb`.
- [x] 2. PWA: configure `vite.config.ts` (VitePWA manifest + workbox runtime
       caching for OSM tiles + precache), add PWA icons + `index.html` metas,
       `env.d.ts` decl, SW registration in `main.ts`.
- [x] 3. Shell: strip `App.vue`/`main.css`/`base.css` to full-bleed; router →
       single `MapView`; delete boilerplate files.
- [x] 4. `types/music.ts` + `lib/geo.ts` (Haversine, within-radius).
- [x] 5. `composables/useGeolocation.ts` (reactive GPS + errors + cleanup).
- [x] 6. `lib/spotRepository.ts` (interface + StaticSpotRepository with
       hardcoded demo spots around a demo center).
- [x] 7. `lib/audio.ts`: add CC0 mp3s to `public/music/`; stub
       `generateMusic(baseSongId, mood)` + preview `AudioPlayer`.
- [x] 8. `lib/db.ts` IndexedDB collection store (add/get/all, unique per spot).
- [x] 9. `MapView.vue`: Leaflet init (OSM tiles), player marker (divIcon),
       spot markers w/ status styles, follow-player, proximity watch →
       `collectable` state.
- [x] 10. `CollectModal.vue` (preview + keep) + collect flow wiring
       (generateMusic → db → status `collected`).
- [x] 11. `CollectionSheet.vue` + Collection FAB (list + play collected).
- [x] 12. Geolocation status banner + graceful no-GPS fallback.
- [x] 13. Polish mobile layout (safe areas, touch targets), responsive.

## Verification

- `npm run build` — type-checks (`vue-tsc`) and builds; `dist/` contains
  `manifest.webmanifest` + `sw.js` + `registerSW`.
- Lighthouse (PWA/SEO) — installability passes: valid manifest, icons,
  service worker, HTTPS (use `vite preview` / a local HTTPS tunnel).
- On a phone / Chrome DevTools (device mode + **Geolocation** override, or
  `leaflet` with a simulated position for desktop testing):
  - map renders OSM tiles; player dot appears and follows simulated movement.
  - moving a demo spot into range flips it to `collectable` (pulse + button).
  - Collect → preview plays, Keep → saved; marker becomes `collected`; cannot
    re-collect (one-time).
  - Collection sheet lists the piece; playing works **offline** (SW + precached
    mp3 + IDB persisted across reload).
  - Reload → collection persists; map tiles load offline after first visit.
- Backend-readiness: `MapView`/collect flow depend only on `SpotRepository`
  interface — swapping `StaticSpotRepository` for an `HttpSpotRepository`
  compiles with no UI changes (note a tiny stub to confirm the seam).
