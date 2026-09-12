# Plan: Replace demo spots with real Weißsee / Rudolfshütte locations

## Context
The static spot repo (`src/lib/spotRepository.ts`) currently seeds 4 made-up
spots around Potsdamer Platz, Berlin. The user asked for **real, relevant
locations around the Rudolfshütte at the Weißsee** (Berchtesgaden, Bavaria)
with their GPS coordinates added to the static repo. This also better matches
the app's alpine theme.

## What changes
**Single file: `src/lib/spotRepository.ts`** (the only file to touch).

1. **Repoint `DEMO_CENTER`** from Berlin to the Rudolfshütte hut on the Weißsee
   north shore: `{ lat: 47.5675, lng: 12.9935 }`. This is also what the map
   opens on (it reads the same `DEMO_CENTER` in `MapView.vue`… no — `MapView`
   has its *own* `DEMO_CENTER` constant; see note below).

2. **Replace the 4 Berlin `OFFSETS`** with 4 real, walkable Weißsee locations,
   still expressed as small `dLat`/`dLng` offsets from the hut so the existing
   `lat: DEMO_CENTER.lat + o.dLat` mapping and `MusicSpot` shape stay intact
   (no type changes, no `radiusM`/`mood`/`baseSongId` changes):

   | id | name | real location | approx. from hut |
   |---|---|---|---|
   | `spot-rudolfshuette` | Rudolfshütte | the hut itself | 0 m (center) |
   | `spot-weisssee-ufer` | Weißsee Ufer | lakeshore path, east of hut | ~150 m E |
   | `spot-st-bartholmae` | St. Bartholomä | 15th-c. pilgrimage church, far shore | ~400 m SW |
   | `spot-jennerbahn` | Jennerbahn Talstation | gondola base, east end of lake | ~450 m NE |

   Each keeps a distinct `baseSongId` (moonlight-sonata / eine-kleine-nachtmusik
   alternated) and a distinct `mood` (tone/tempo/brightness) so every spot
   still resolves to a different "personalized" render.

3. **Update the header comment** to document the new center (Weißsee,
   Berchtesgaden National Park) and that coordinates are best-effort public
   geodata accurate to a few meters (fine for the 15 m radius).

### Note — `MapView.vue` has its own `DEMO_CENTER`
`MapView.vue` hard-codes `DEMO_CENTER = [12.5525377, 47.1720042]` (Berlin, in
`[lng, lat]`) for the map's **initial view**. For the new spots to actually be
*visible* on load, that constant must be updated to the Weißsee hut as well
(`[12.9935, 47.5675]`). This is a second small edit (one line + comment). The
demo-simulation `startOrbit`/`teleportToSpot` logic in `MapView.vue` reads
`DEMO_CENTER`/`spots.value` and needs **no** logic change — it will orbit the
new center and teleport to the new (real) coordinates automatically.

## Files to modify
- `src/lib/spotRepository.ts` — replace `DEMO_CENTER` + `OFFSETS` (the 4 real
  locations, same shape), update header comment.
- `src/views/MapView.vue` — update the `DEMO_CENTER` literal (lng/lat) + its
  comment so the map centers on the Weißsee on load.

## Reuse (no new code)
- `MusicSpot` shape + `BaseSongId` (`src/types/music.ts`) — unchanged.
- The `DEMO_CENTER.lat + o.dLat` mapping in `spotRepository.ts` — kept as-is.
- Proximity (`isWithinRadius`, `src/lib/geo.ts`), collect flow, and the Demo GPS
  panel (`teleportToSpot`, `startOrbit` in `MapView.vue`) — all reuse
  `spots.value`/`DEMO_CENTER`, so they pick up the new coordinates with no edits.

## Coordinates (best-effort, public geodata)
- Rudolfshütte (hut): 47.5675 N, 12.9935 E  ← center
- Weißsee Ufer (shore, +E): +0.0018 lng, −0.0012 lat
- St. Bartholomä (−SW): −0.0028 lng, −0.0032 lat
- Jennerbahn Talstation (+NE): +0.0034 lng, +0.0018 lat
(= ~150 m E, ~400 m SW, ~450 m NE respectively)

## Steps
- [ ] Edit `spotRepository.ts`: new `DEMO_CENTER` (Weißsee hut) + 4 real
      `OFFSETS` + updated header comment.
- [ ] Edit `MapView.vue`: update `DEMO_CENTER` literal to `[12.9935, 47.5675]`
      + fix its "Potsdamer Platz, Berlin" comment.
- [ ] Verify: `npx vue-tsc --build`, `npx eslint src --ext .ts,.vue`,
      `npx vite build` — all green.
- [ ] Manual (user): `npm run dev` → map centers on Weißsee/Rudolfshütte; 4
      real markers show; Demo GPS → teleport to a spot flips it collectable;
      Orbit sweeps the Weißsee cluster.

## Verification
- Type-check / lint / build pass (gate).
- Manual: map loads centered on the Weißsee; the 4 named alpine locations render
  as markers; the existing collect + Demo GPS flow works against the new coords.
- (No test suite exists; the repo has no unit tests for spot data, so the
  build gate + a manual map check is the verification.)
