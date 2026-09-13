// "Peak Mountain" dot-art effect (à la 21st.dev/community/ascii), reimplemented
// from scratch with Canvas2D — no external asset/runtime from that vault is used.
//
// Pipeline: sample the source photo into a coarse cellSize grid (one averaged
// color per cell) -> draw a shape per renderMode ("dots" here) sized/tinted by
// luminance -> tint overlay -> post-fx (vignette/scanLines/chromatic/bloom) ->
// point-light glow. Re-samples on resize; re-draws every frame for the ripple
// animation, but the per-cell color/edge data is computed once per resize, not
// per frame.

import { useEffect, useRef } from 'react';

const DEFAULT_CONFIG = {
  renderMode: 'dots',
  bgMode: 'blur',
  bgBlur: 12,
  bgOpacity: 90,
  cellSize: 18,
  coverage: 60,
  invert: false,
  styleBlend: 'screen',
  brightness: -62,
  contrast: 0,
  edgeEmphasis: 100,
  density: 0,
  tint: '#ff3cac',
  tintOpacity: 32,
  overlayBlend: 'overlay',
  saturation: 100,
  grayscale: 0,
  pfx: {
    vignette: { enabled: true, intensity: 40 },
    scanLines: { enabled: true, intensity: 22 },
    chromatic: { enabled: true, intensity: 25 },
    bloom: { enabled: true, intensity: 25 },
  },
  animStyle: 'ripple',
  animSpeed: { enabled: true, intensity: 25 },
  animIntensity: { enabled: true, intensity: 80 },
  lights: {
    enabled: true,
    points: [{ x: 0.517, y: 0.372, radius: 100, intensity: 56 }],
  },
};

// deterministic per-cell pseudo-random, so coverage/jitter don't flicker frame to frame
function hash2(x, y) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return s - Math.floor(s);
}

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

function applyColorAdjust(r, g, b, { brightness, contrast, saturation, grayscale }) {
  let rr = r;
  let gg = g;
  let bb = b;

  if (grayscale > 0) {
    const l = 0.299 * rr + 0.587 * gg + 0.114 * bb;
    const t = grayscale / 100;
    rr += (l - rr) * t;
    gg += (l - gg) * t;
    bb += (l - bb) * t;
  }

  if (saturation !== 100) {
    const l = 0.299 * rr + 0.587 * gg + 0.114 * bb;
    const t = saturation / 100;
    rr = l + (rr - l) * t;
    gg = l + (gg - l) * t;
    bb = l + (bb - l) * t;
  }

  const bshift = (brightness / 100) * 255;
  rr += bshift;
  gg += bshift;
  bb += bshift;

  const cf = (259 * (contrast + 255)) / (255 * (259 - contrast));
  rr = cf * (rr - 128) + 128;
  gg = cf * (gg - 128) + 128;
  bb = cf * (bb - 128) + 128;

  return [clamp(Math.round(rr), 0, 255), clamp(Math.round(gg), 0, 255), clamp(Math.round(bb), 0, 255)];
}

export default function MountainAscii({ src, config, className, style }) {
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const cfg = { ...DEFAULT_CONFIG, ...config };

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return undefined;

    const ctx = canvas.getContext('2d');
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const sceneCanvas = document.createElement('canvas');
    const sceneCtx = sceneCanvas.getContext('2d');

    let raf = 0;
    let destroyed = false;
    let grid = null;
    let cols = 0;
    let rows = 0;
    const cellPx = cfg.cellSize;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    let W = 0;
    let H = 0;
    let img = null;
    let bgCanvas = null;
    const startTime = performance.now();

    const coverFit = (naturalW, naturalH, boxW, boxH) => {
      const ir = naturalW / naturalH;
      const br = boxW / boxH;
      if (ir > br) {
        const sh = naturalH;
        const sw = sh * br;
        return { sx: (naturalW - sw) / 2, sy: 0, sw, sh };
      }
      const sw = naturalW;
      const sh = sw / br;
      return { sx: 0, sy: (naturalH - sh) / 2, sw, sh };
    };

    const buildGrid = () => {
      if (!img || !W || !H) return;
      cols = Math.max(1, Math.ceil(W / cellPx));
      rows = Math.max(1, Math.ceil(H / cellPx));

      const sample = document.createElement('canvas');
      sample.width = cols;
      sample.height = rows;
      const sctx = sample.getContext('2d');
      sctx.imageSmoothingEnabled = true;
      sctx.imageSmoothingQuality = 'high';

      const { sx, sy, sw, sh } = coverFit(img.naturalWidth, img.naturalHeight, cols, rows);
      sctx.drawImage(img, sx, sy, sw, sh, 0, 0, cols, rows);
      const data = sctx.getImageData(0, 0, cols, rows).data;

      grid = new Array(cols * rows);
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const i = (y * cols + x) * 4;
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
          const [ar, ag, ab] = applyColorAdjust(r, g, b, cfg);
          grid[y * cols + x] = {
            r: ar,
            g: ag,
            b: ab,
            lum,
            x,
            y,
            include: hash2(x, y) < cfg.coverage / 100,
            phaseJitter: hash2(x + 0.37, y + 0.91) * Math.PI * 2,
            edge: 0,
          };
        }
      }

      if (cfg.edgeEmphasis > 0) {
        for (let y = 0; y < rows; y++) {
          for (let x = 0; x < cols; x++) {
            const c = grid[y * cols + x];
            const right = x + 1 < cols ? grid[y * cols + x + 1] : c;
            const down = y + 1 < rows ? grid[(y + 1) * cols + x] : c;
            c.edge = clamp(Math.abs(c.lum - right.lum) + Math.abs(c.lum - down.lum), 0, 1);
          }
        }
      }
    };

    const buildBg = () => {
      if (!img || cfg.bgMode !== 'blur' || !W || !H) {
        bgCanvas = null;
        return;
      }
      bgCanvas = document.createElement('canvas');
      bgCanvas.width = W;
      bgCanvas.height = H;
      const bctx = bgCanvas.getContext('2d');
      const { sx, sy, sw, sh } = coverFit(img.naturalWidth, img.naturalHeight, W, H);
      bctx.filter = `blur(${cfg.bgBlur}px)`;
      bctx.drawImage(img, sx, sy, sw, sh, -cfg.bgBlur, -cfg.bgBlur, W + cfg.bgBlur * 2, H + cfg.bgBlur * 2);
    };

    const resize = () => {
      const rect = wrap.getBoundingClientRect();
      W = Math.max(1, Math.round(rect.width));
      H = Math.max(1, Math.round(rect.height));
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      canvas.style.width = `${W}px`;
      canvas.style.height = `${H}px`;
      sceneCanvas.width = W * dpr;
      sceneCanvas.height = H * dpr;
      buildGrid();
      buildBg();
    };

    const drawVignette = (c, w, h, intensity) => {
      const g = c.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.25, w / 2, h / 2, Math.max(w, h) * 0.75);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, `rgba(0,0,0,${clamp(intensity / 100, 0, 1) * 0.75})`);
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);
    };

    const drawScanLines = (c, w, h, intensity) => {
      const alpha = clamp(intensity / 100, 0, 1) * 0.35;
      c.fillStyle = `rgba(0,0,0,${alpha})`;
      for (let yy = 0; yy < h; yy += 3) c.fillRect(0, yy, w, 1);
    };

    const drawBloom = (c, source, w, h, intensity) => {
      const blurPx = 4 + (intensity / 100) * 10;
      c.save();
      c.globalCompositeOperation = 'screen';
      c.globalAlpha = clamp(intensity / 100, 0, 1) * 0.6;
      c.filter = `blur(${blurPx}px) brightness(1.4)`;
      c.drawImage(source, 0, 0, w, h);
      c.restore();
    };

    const drawChromatic = (c, source, w, h, intensity) => {
      const offset = 1 + (intensity / 100) * 3;
      const alpha = clamp(intensity / 100, 0, 1) * 0.5;
      c.save();
      c.globalCompositeOperation = 'lighter';
      c.globalAlpha = alpha;
      c.drawImage(source, offset, 0, w, h);
      c.drawImage(source, -offset, 0, w, h);
      c.restore();
    };

    const drawLights = (c, w, h) => {
      const lights = cfg.lights;
      if (!lights?.enabled) return;
      lights.points.forEach((p) => {
        const cx = p.x * w;
        const cy = p.y * h;
        const r = (p.radius / 100) * Math.min(w, h);
        const alpha = clamp(p.intensity / 100, 0, 1);
        const g = c.createRadialGradient(cx, cy, 0, cx, cy, r);
        g.addColorStop(0, `rgba(255,235,205,${alpha * 0.5})`);
        g.addColorStop(1, 'rgba(255,235,205,0)');
        c.save();
        c.globalCompositeOperation = 'screen';
        c.fillStyle = g;
        c.fillRect(cx - r, cy - r, r * 2, r * 2);
        c.restore();
      });
    };

    const render = (now) => {
      if (destroyed) return;
      if (!grid) {
        raf = requestAnimationFrame(render);
        return;
      }

      const t = (now - startTime) / 1000;
      const speedFactor = cfg.animSpeed?.enabled ? cfg.animSpeed.intensity / 100 : 0;
      const ampFactor = cfg.animIntensity?.enabled ? cfg.animIntensity.intensity / 100 : 0;
      const animate = speedFactor > 0 && ampFactor > 0 && !reduce;

      sceneCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      sceneCtx.clearRect(0, 0, W, H);

      if (cfg.bgMode === 'blur' && bgCanvas) {
        sceneCtx.globalAlpha = clamp(cfg.bgOpacity / 100, 0, 1);
        sceneCtx.drawImage(bgCanvas, 0, 0, W, H);
        sceneCtx.globalAlpha = 1;
      }

      sceneCtx.globalCompositeOperation = cfg.styleBlend || 'source-over';
      const cx = W / 2;
      const cy = H / 2;
      const maxDist = Math.hypot(cx, cy) || 1;

      for (let i = 0; i < grid.length; i++) {
        const c = grid[i];
        if (!c.include) continue;

        const lum = cfg.invert ? 1 - c.lum : c.lum;
        let sizeMul = 1;

        if (animate) {
          const dx = c.x * cellPx + cellPx / 2 - cx;
          const dy = c.y * cellPx + cellPx / 2 - cy;
          const dist = Math.hypot(dx, dy) / maxDist;
          let phase;
          switch (cfg.animStyle) {
            case 'wave':
              phase = t * speedFactor * 2 + c.x * 0.4;
              break;
            case 'pulse':
              phase = t * speedFactor * 2;
              break;
            case 'shimmer':
              phase = t * speedFactor * 6 + c.phaseJitter;
              break;
            case 'ripple':
            default:
              phase = t * speedFactor * 3 - dist * 8;
          }
          sizeMul = 1 + Math.sin(phase) * 0.35 * ampFactor;
        }

        const edgeBoost = 1 + c.edge * (cfg.edgeEmphasis / 100) * 0.6;
        const radius = (cellPx / 2) * 0.85 * lum * sizeMul * edgeBoost;
        if (radius < 0.4) continue;

        sceneCtx.fillStyle = `rgb(${c.r},${c.g},${c.b})`;
        sceneCtx.beginPath();
        sceneCtx.arc(c.x * cellPx + cellPx / 2, c.y * cellPx + cellPx / 2, radius, 0, Math.PI * 2);
        sceneCtx.fill();
      }
      sceneCtx.globalCompositeOperation = 'source-over';

      if (cfg.tintOpacity > 0) {
        sceneCtx.save();
        sceneCtx.globalCompositeOperation = cfg.overlayBlend || 'overlay';
        sceneCtx.globalAlpha = clamp(cfg.tintOpacity / 100, 0, 1);
        sceneCtx.fillStyle = cfg.tint;
        sceneCtx.fillRect(0, 0, W, H);
        sceneCtx.restore();
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      ctx.drawImage(sceneCanvas, 0, 0, W, H);

      const pfx = cfg.pfx || {};
      if (pfx.bloom?.enabled) drawBloom(ctx, sceneCanvas, W, H, pfx.bloom.intensity);
      if (pfx.chromatic?.enabled) drawChromatic(ctx, sceneCanvas, W, H, pfx.chromatic.intensity);

      drawLights(ctx, W, H);

      if (pfx.vignette?.enabled) drawVignette(ctx, W, H, pfx.vignette.intensity);
      if (pfx.scanLines?.enabled) drawScanLines(ctx, W, H, pfx.scanLines.intensity);

      raf = requestAnimationFrame(render);
    };

    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    img = new Image();
    img.onload = resize;
    img.src = src;

    raf = requestAnimationFrame(render);

    return () => {
      destroyed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  return (
    <div ref={wrapRef} className={className} style={{ position: 'absolute', inset: 0, overflow: 'hidden', zIndex: 0, ...style }}>
      <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />
    </div>
  );
}
