import React, { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';

import TopographicField from './components/TopographicField.jsx';
import GlobeScene from './components/GlobeScene.jsx';
import AlpineScene from './components/AlpineScene.jsx';
import StackSpread from './components/ui/stack-spread.jsx';
import MountainAscii from './components/ui/mountain-ascii.jsx';

import {
  topbar,
  logo,
  hero,
  journeyGallery,
  problem,
  motivation,
  core,
  demo,
  solution,
  railItems,
  teamNames,
  finale,
} from './content.js';

gsap.registerPlugin(ScrollTrigger);


/* =========================================================
   SMALL HELPERS / COMPONENTS
   ========================================================= */

const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));

const smooth = (p, a, b) => {
  const x = clamp((p - a) / (b - a));
  return x * x * (3 - 2 * x);
};

function SoundQuestLogo({ compact = false }) {
  return (
    <div className={`tabiklang-logo ${compact ? 'compact' : ''}`} aria-label="SoundQuest">
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <circle cx="60" cy="60" r="47" className="logo-ring" />
        <path d="M26 78 50 42l14 20 10-14 20 30" className="logo-mountain" />
        <path
          d="M62 34c14 3 25 14 28 28M64 46c8 2 14 8 16 16M65 57c3 1 5 3 6 6"
          className="logo-wave"
        />
        <circle cx="87" cy="30" r="3.5" className="logo-dot" />
      </svg>

      {!compact && (
        <div className="logo-word">
          <b>{logo.title}</b>
          <span>{logo.subtitle}</span>
        </div>
      )}
    </div>
  );
}

function BulletList({ items }) {
  return (
    <ul className="layer-stack bullet-list">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}


/* =========================================================
   APP
   ========================================================= */

export default function App() {
  const root = useRef();
  const progressRef = useRef(0);
  const activeRef = useRef(0);
  const railProgressRef = useRef(0);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const lenis = reduce
      ? null
      : new Lenis({
          duration: 1.22,
          easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
          smoothWheel: true,
          wheelMultiplier: 0.78,
          touchMultiplier: 1.0,
          syncTouch: false,
        });

    const raf = (t) => lenis?.raf(t * 1000);

    if (lenis) {
      gsap.ticker.add(raf);
      lenis.on('scroll', ScrollTrigger.update);
      gsap.ticker.lagSmoothing(0);
    }

    const q = (selector) => gsap.quickSetter(selector, 'css');

    const setAlps = q('.scene-alps');
    const setGlacier = q('.scene-glacier');
    const setDanube = q('.scene-danube');
    const setVienna = q('.scene-vienna');
    const setPortrait = q('.composer-portrait');
    const setAustria = q('.austria-badge');
    const setCow = q('.cow-badge');
    const setTopbar = q('.topbar');
    const setRail = q('.chapter-rail');
    const setGlobe = q('.globe-layer');
    const setTopo = q('.topo');
    const setBeacon = q('.beacon');

    const meter = document.querySelector('.scroll-meter span');

    const ctx = gsap.context(() => {
      ScrollTrigger.create({
        trigger: root.current,
        start: 'top top',
        end: 'bottom bottom',
        invalidateOnRefresh: true,

        onUpdate: (self) => {
          const p = self.progress;
          progressRef.current = p;

          if (meter) meter.style.transform = `scaleX(${p})`;

          const list = Array.from(root.current?.querySelectorAll('.chapter') || []);
          let railPos = 0;
          let nearest = 0;
          let nearestDistance = Infinity;

          if (list.length > 1) {
            const viewportCenter = window.innerHeight / 2;

            const centers = list.map((el) => {
              const r = el.getBoundingClientRect();
              return r.top + r.height / 2;
            });

            centers.forEach((c, i) => {
              const d = Math.abs(c - viewportCenter);

              if (d < nearestDistance) {
                nearestDistance = d;
                nearest = i;
              }
            });

            let lo = 0;

            while (
              lo < centers.length - 1 &&
              centers[lo + 1] < viewportCenter
            ) {
              lo++;
            }

            const hi = Math.min(lo + 1, centers.length - 1);

            if (lo === hi) {
              railPos = lo;
            } else {
              const span = centers[hi] - centers[lo];

              railPos =
                span === 0
                  ? lo
                  : lo + clamp((viewportCenter - centers[lo]) / span);
            }

            railPos = clamp(railPos, 0, list.length - 1);
          }

          railProgressRef.current =
            list.length > 1 ? railPos / (list.length - 1) : 0;

          document.documentElement.style.setProperty(
            '--rail-progress',
            String(railProgressRef.current)
          );

          if (nearest !== activeRef.current) {
            activeRef.current = nearest;
            setActive(nearest);
          }

          // Background transitions
          const g1 = smooth(p, 0.155, 0.195);
          const g2 = smooth(p, 0.255, 0.295);
          const g3 = smooth(p, 0.355, 0.395);
          const g4 = smooth(p, 0.455, 0.495);
          const gg = smooth(p, 0.505, 0.56);

          setAlps({
            opacity: 1 - g1,
            transform: `scale(${1 + p * 0.055}) translate3d(0,${-p * 2.5}vh,0)`,
          });

          setGlacier({
            opacity: clamp(g1 - g2),
            transform: `scale(${1.045 - p * 0.03})`,
          });

          setDanube({
            opacity: clamp(g2 - g3),
            transform: `scale(${1.04 - (p - 0.25) * 0.028})`,
          });

          setVienna({
            opacity: clamp(g3 - g4),
            transform: `scale(${1.035 - (p - 0.36) * 0.02})`,
          });

          const colorize = smooth(p, 0.43, 0.475);

          setPortrait({
            opacity: clamp(
              smooth(p, 0.39, 0.42) - smooth(p, 0.47, 0.5)
            ),
            transform: `translate3d(${
              (1 - smooth(p, 0.39, 0.42)) * 6
            }vw,0,0)`,
            filter: `grayscale(${1 - colorize}) contrast(${1.08 - colorize * 0.05}) brightness(${0.78 + colorize * 0.2})`,
          });

          setGlobe({
            opacity: gg,
            transform: `scale(${0.95 + gg * 0.05})`,
          });

          setTopo({
            opacity: 0.34 * (1 - smooth(p, 0.34, 0.56)),
          });

          setBeacon({
            opacity: 0.25 + 0.75 * smooth(p, 0.08, 0.62),
            transform: `translate3d(${
              Math.sin(p * Math.PI * 1.8) * 5
            }vw,${
              Math.cos(p * Math.PI * 1.2) * 3
            }vh,0) scale(${0.82 + p * 0.38})`,
          });
        },
      });

      // Austria badge: only while the Intro/hero section itself is on screen —
      // tied to the hero's own scroll range, not total page progress, so it
      // doesn't stay stuck on-screen once later sections push it out of range.
      const heroEl = root.current?.querySelector('.hero-reference');
      if (heroEl) {
        ScrollTrigger.create({
          trigger: heroEl,
          start: 'top top',
          end: 'bottom top',
          scrub: true,
          onUpdate: (self) => {
            const revealP = smooth(self.progress, 0, 0.12);
            const fadeOutP = smooth(self.progress, 0.7, 0.98);
            const introReveal = clamp(revealP - fadeOutP);

            setAustria({
              opacity: introReveal,
              transform: `translate3d(0,${(1 - introReveal) * 16}px,0) scale(${0.94 + introReveal * 0.06})`,
            });

            setCow({
              opacity: introReveal,
              transform: `translate3d(0,${(1 - introReveal) * 16}px,0) scale(${0.94 + introReveal * 0.06})`,
            });

            // Nav (top bar + chapter rail): hidden while resting on the intro,
            // fades in once the user starts scrolling away — and stays visible
            // (no fade-out term) for the rest of the presentation.
            const navReveal = smooth(self.progress, 0.03, 0.22);

            setTopbar({
              opacity: navReveal,
              transform: `translate3d(0,${(1 - navReveal) * -14}px,0)`,
            });

            setRail({
              opacity: navReveal,
              transform: `translate3d(${(1 - navReveal) * 14}px,-50%,0)`,
            });
          },
        });
      }

      gsap.utils.toArray('.chapter-copy').forEach((el) => {
        gsap.fromTo(
          el,
          { y: 42 },
          {
            y: 0,
            ease: 'none',
            scrollTrigger: {
              trigger: el,
              start: 'top 84%',
              end: 'center 50%',
              scrub: 0.7,
            },
          }
        );
      });

      gsap.utils
        .toArray(
          '.statement,.layer-stack,.composer-line,.beacon-label,.location-unlock,.passport-card,.mixer,.core-statement,.bullet-list'
        )
        .forEach((el) => {
          gsap.fromTo(
            el,
            { y: 20 },
            {
              y: 0,
              ease: 'none',
              scrollTrigger: {
                trigger: el,
                start: 'top 88%',
                end: 'top 66%',
                scrub: 0.55,
              },
            }
          );
        });

    }, root);

    // Gentle presentation settle
    let settleTimer = 0;
    let programmatic = false;

    const slides = () =>
      Array.from(root.current?.querySelectorAll('.chapter') || []);

    const targetFor = (el) =>
      window.scrollY +
      el.getBoundingClientRect().top +
      (el.offsetHeight - window.innerHeight) / 2;

    const settle = () => {
      if (!lenis || programmatic) return;

      const list = slides();
      if (!list.length) return;

      const center = window.innerHeight / 2;
      let best = list[0];
      let distance = Infinity;

      for (const el of list) {
        const r = el.getBoundingClientRect();
        const d = Math.abs(r.top + r.height / 2 - center);

        if (d < distance) {
          distance = d;
          best = el;
        }
      }

      if (distance > window.innerHeight * 0.38) return;

      programmatic = true;

      lenis.scrollTo(targetFor(best), {
        duration: 1.15,
        easing: (t) => 1 - Math.pow(1 - t, 4),
        onComplete: () => {
          programmatic = false;
        },
      });
    };

    const onLenisScroll = () => {
      if (programmatic) return;

      clearTimeout(settleTimer);
      settleTimer = setTimeout(settle, 260);
    };

    lenis?.on('scroll', onLenisScroll);

    // Keyboard navigation
    const goRelative = (dir) => {
      const list = slides();

      if (!list.length || !lenis) return;

      const center = window.innerHeight / 2;
      let nearest = 0;
      let distance = Infinity;

      list.forEach((el, i) => {
        const r = el.getBoundingClientRect();
        const d = Math.abs(r.top + r.height / 2 - center);

        if (d < distance) {
          distance = d;
          nearest = i;
        }
      });

      const next = Math.max(
        0,
        Math.min(list.length - 1, nearest + dir)
      );

      programmatic = true;

      lenis.scrollTo(targetFor(list[next]), {
        duration: 1.2,
        easing: (t) => 1 - Math.pow(1 - t, 4),
        onComplete: () => {
          programmatic = false;
        },
      });
    };

    const onKey = (e) => {
      if (
        ['ArrowDown', 'PageDown'].includes(e.key) ||
        e.key === ' '
      ) {
        e.preventDefault();
        goRelative(1);
      } else if (['ArrowUp', 'PageUp'].includes(e.key)) {
        e.preventDefault();
        goRelative(-1);
      }
    };

    window.addEventListener('keydown', onKey, { passive: false });

    ScrollTrigger.refresh();

    return () => {
      clearTimeout(settleTimer);
      window.removeEventListener('keydown', onKey);
      ctx.revert();

      if (lenis) {
        lenis.off('scroll', onLenisScroll);
        lenis.destroy();
        gsap.ticker.remove(raf);
      }
    };
  }, []);

  return (
    <main ref={root} className="site-shell">

      {/* Background visuals */}
      <div className="fixed-stage">
        <AlpineScene />
        <TopographicField intensity={1} />

        <div className="globe-layer">
          <GlobeScene progressRef={progressRef} />
        </div>

        <div className="vignette" />
        <div className="grain" />

        <div className="beacon">
          <span />
          <i />
        </div>
      </div>

      <img className="austria-badge" src="/austria-badge.png" alt="Austria" />
      <img className="cow-badge" src="/cow-badge.png" alt="" />

      {/* Top bar */}
      <header className="topbar">
        <div className="brand">
          <SoundQuestLogo compact />
          <span>{topbar.brand}</span>
        </div>

        <div className="topbar-center">
          {topbar.center}
        </div>
      </header>

      <div className="scroll-meter">
        <span />
      </div>

      {/* 01 — Hero */}
      <section
        className="hero chapter hero-reference"
        aria-label={hero.alt}
      >
        <MountainAscii src="/journey/heart-lake.png" />

        <div className="chapter-copy hero-copy">
          <h1>{hero.title}</h1>
          <p>{hero.tagline}</p>
        </div>

        <div className="hero-reference-shade" />
      </section>

      {/* 01b — Journey gallery */}
      <StackSpread heading={journeyGallery.heading} sub={journeyGallery.sub} />

      {/* 02 — Problem */}
      <section className="chapter chapter-1">
        <div className="chapter-copy">
          <div className="chapter-no">{problem.number}</div>

          <h2>{problem.heading}</h2>

          <BulletList items={problem.items} />
        </div>
      </section>

      {/* 03 — Motivation */}
      <section className="chapter chapter-2">
        <div className="chapter-copy">
          <div className="chapter-no">{motivation.number}</div>

          <h2>{motivation.heading}</h2>

          <BulletList items={motivation.items} />
        </div>
      </section>

      {/* 04 — Core */}
      <section className="chapter chapter-3">
        <div className="chapter-copy">
          <div className="chapter-no">{core.number}</div>

          <div className="statement core-statement">{core.statement}</div>
        </div>
      </section>

      {/* 05 — Demo */}
      <section className="chapter demo-chapter">
        <div className="chapter-copy demo-copy">
          <div className="chapter-no">{demo.number}</div>

          <h2>{demo.heading}</h2>

          <p>
            {demo.text}
          </p>

            <div className="demo-video-frame">
              <video
                src="/tabiklang-demo.mp4"
                controls
                playsInline
                preload="metadata"
              />
            </div>
          
        </div>
      </section>

      {/* 06 — Solution */}
      <section className="chapter chapter-4">
        <div className="chapter-copy">
          <div className="chapter-no">{solution.number}</div>

          <h2>{solution.heading}</h2>

          <BulletList items={solution.items} />
        </div>
      </section>

      {/* 07 — Closing */}
      <section className="chapter finale">
        <div className="chapter-copy finale-copy">
          <div className="eyebrow">
            {finale.eyebrow}
          </div>

          <h2>{finale.heading}</h2>

          <p>
            {finale.text}
          </p>

          <div className="final-grid">
            {finale.grid.map((label) => (
              <span key={label}>{label}</span>
            ))}
          </div>

          <div className="team">
            {teamNames}
          </div>
        </div>
      </section>

      {/* Right-side presentation rail */}
      <aside
        className="chapter-rail"
        aria-label="Presentation progress"
      >
        <div className="rail-line" />
        <div className="rail-ball" />

        {railItems.map((item, i) => (
          <div
            className={`rail-item ${i === active ? 'active' : ''}`}
            key={item[0]}
            style={{ '--rail-index': i }}
          >
            <span className="rail-dot" />

            <div>
              <b>{item[0]}</b>
              <em>{item[1]}</em>
            </div>
          </div>
        ))}
      </aside>
    </main>
  );
}