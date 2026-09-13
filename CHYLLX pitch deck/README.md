# TabiKlang — Journey into soundscapes

A cinematic scroll-driven pitch prototype for TabiKlang.

## Stack
- React + Vite
- Three.js via React Three Fiber
- GSAP + ScrollTrigger
- Lenis smooth scrolling
- Web Audio API for procedural soundscape

## Run locally
```bash
npm install
npm run dev
```

Then open the localhost URL printed by Vite.

## Production build
```bash
npm run build
npm run preview
```

## What is included
- Cinematic Alpine background made entirely in CSS
- Animated topographic SVG field
- Scroll-driven chapter transitions
- 3D globe with glowing sound beacons
- Vienna / Danube / Hohe Tauern narrative
- GPS unlock UI
- Sound Passport collectible UI
- Sound fusion mixer visual
- Procedural scroll-reactive Web Audio soundscape
- Mobile responsive layout
- Reduced-motion fallback

## Customize
Edit `src/App.jsx` for pitch copy and team names.
Edit `src/styles.css` for art direction.
Replace the procedural Alpine scene with real images/depth maps later if desired.


## Presentation behavior
The deck is intentionally silent. Smooth scrolling remains free-form; when scrolling stops near a chapter center, the page gently eases to the nearest presentation position. Arrow/Page keys can move one chapter at a time.


## Presentation notes

- This build intentionally contains **no audio playback or sound controls**.
- A dedicated **Demo Video** slide is included near the end. Replace its placeholder later with your uploaded video.


## Final pitch story

The deck now follows the agreed narrative: visual-first travel problem → disappearing soundscapes → TabiKlang Sound Beacons → explore → GPS capture → Sound Passport → fusion → incentives for lesser-known places → global scale → demo → closing. The first-slide reference image fades gradually into the original animated deck background. No audio playback is implemented.


## Fix in this build

- Fixed the JSX parse error that prevented the previous build from loading.
- Added a fixed 12-step presentation rail on the right. The crimson indicator moves continuously between slide positions with scroll progress, while the nearest slide label becomes active.
- No audio is included.


## Final visual corrections
- Slide 1 uses `public/tabiklang-hero-final.png`.
- The old procedural polygon mountain on slides 2–3 is disabled and replaced by a monochrome editorial environment.
- The right-side presentation rail remains live HTML/CSS with fluid ball movement.
- No audio playback is used.
