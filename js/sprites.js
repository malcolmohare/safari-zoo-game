// Procedural "realistic" graphics: noise, top-down trees and rocks, ground textures,
// soft shadows. Everything is drawn once into small offscreen canvases and reused.

const Sprites = (() => {
  // ---------- Noise ----------
  function hash2(x, y) {
    let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  }
  // Smooth value noise in 0..1.
  function noise(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  // Fractal noise (a few octaves) in roughly 0..1.
  function fbm(x, y) {
    return noise(x, y) * 0.5 + noise(x * 2.03 + 17, y * 2.03 + 9) * 0.3 + noise(x * 4.1 + 41, y * 4.1 + 3) * 0.2;
  }
  // Seeded random numbers, so each sprite variant looks the same every time.
  function rng(seed) {
    let s = seed >>> 0;
    return () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const rgb = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
  const shade = (c, k) => [c[0] * k, c[1] * k, c[2] * k];

  function canvasFor(size) {
    const c = document.createElement('canvas');
    c.width = c.height = Math.ceil(size * DPR);
    const g = c.getContext('2d');
    g.scale(DPR, DPR);
    return { c, g };
  }

  // ---------- Trees (seen from above, lit from the top-left) ----------
  const TREE_PALETTES = {
    acacia:    { dark: [78, 100, 40],  mid: [118, 140, 60],  light: [170, 180, 95] },
    broadleaf: { dark: [40, 82, 38],   mid: [70, 125, 55],   light: [130, 175, 90] },
    jungle:    { dark: [24, 66, 34],   mid: [44, 104, 50],   light: [96, 160, 80] },
    pine:      { dark: [24, 52, 38],   mid: [40, 80, 56],    light: [80, 120, 88] },
    palm:      { dark: [52, 96, 38],   mid: [86, 140, 54],   light: [150, 190, 90] },
  };

  const cache = new Map();
  function cached(key, make) {
    let s = cache.get(key);
    if (!s) { s = make(); cache.set(key, s); }
    return s;
  }

  function blobCanopy(g, r, pal, rnd, opts) {
    const n = opts.blobs;
    const blobs = [];
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * r * opts.spread;
      blobs.push({ x: Math.cos(a) * d, y: Math.sin(a) * d * opts.squash, r: r * (opts.minR + rnd() * (opts.maxR - opts.minR)) });
    }
    // dark silhouette first, so the edges read as depth
    g.fillStyle = rgb(shade(pal.dark, 0.8));
    for (const b of blobs) { g.beginPath(); g.arc(b.x, b.y, b.r * 1.06, 0, Math.PI * 2); g.fill(); }
    // lit clumps, sorted so the top-left ones sit on top
    blobs.sort((p, q) => (q.x + q.y) - (p.x + p.y));
    for (const b of blobs) {
      const gr = g.createRadialGradient(b.x - b.r * 0.35, b.y - b.r * 0.4, b.r * 0.1, b.x, b.y, b.r);
      gr.addColorStop(0, rgb(pal.light));
      gr.addColorStop(0.55, rgb(pal.mid));
      gr.addColorStop(1, rgb(pal.dark));
      g.fillStyle = gr;
      g.beginPath(); g.arc(b.x, b.y, b.r, 0, Math.PI * 2); g.fill();
    }
    // leaf texture speckles
    for (let i = 0; i < r * 3; i++) {
      const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * r * opts.spread * 1.1;
      const x = Math.cos(a) * d, y = Math.sin(a) * d * opts.squash;
      const lit = (x + y) < 0;
      g.fillStyle = lit ? rgb(pal.light, 0.35) : rgb(shade(pal.dark, 0.7), 0.35);
      g.beginPath(); g.arc(x, y, 0.8 + rnd() * 1.8, 0, Math.PI * 2); g.fill();
    }
  }

  function makeTree(kind, size, seed) {
    return cached(`tree|${kind}|${size}|${seed}`, () => {
      const pad = size * 0.15, S = size + pad * 2;
      const { c, g } = canvasFor(S);
      g.translate(S / 2, S / 2);
      const rnd = rng(seed * 9973 + size);
      const r = size / 2;
      const pal = TREE_PALETTES[kind] || TREE_PALETTES.broadleaf;
      if (kind === 'palm') {
        const n = 8 + Math.floor(rnd() * 3);
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2 + rnd() * 0.3, len = r * (0.8 + rnd() * 0.2), w = r * 0.22;
          g.save(); g.rotate(a);
          const gr = g.createLinearGradient(0, 0, len, 0);
          gr.addColorStop(0, rgb(pal.dark)); gr.addColorStop(0.5, rgb(pal.mid)); gr.addColorStop(1, rgb(pal.light));
          g.fillStyle = gr;
          g.beginPath();
          g.moveTo(0, 0);
          g.quadraticCurveTo(len * 0.5, -w, len, rnd() * 4 - 2);
          g.quadraticCurveTo(len * 0.5, w, 0, 0);
          g.fill();
          g.strokeStyle = rgb(shade(pal.dark, 0.7), 0.7); g.lineWidth = 1;
          g.beginPath(); g.moveTo(0, 0); g.lineTo(len * 0.95, 0); g.stroke();
          g.restore();
        }
        g.fillStyle = '#6b4a2a';
        g.beginPath(); g.arc(0, 0, r * 0.12, 0, Math.PI * 2); g.fill();
      } else if (kind === 'pine') {
        for (let layer = 0; layer < 3; layer++) {
          const lr = r * (1 - layer * 0.28), spikes = 11 - layer * 2;
          const col = mix(pal.dark, pal.light, layer / 2.5);
          g.fillStyle = rgb(col);
          g.beginPath();
          for (let i = 0; i <= spikes * 2; i++) {
            const a = (i / (spikes * 2)) * Math.PI * 2 + layer * 0.3;
            const rr = i % 2 === 0 ? lr : lr * (0.62 + rnd() * 0.1);
            const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
            if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
          }
          g.closePath(); g.fill();
        }
        // snow dusting on the lit side
        for (let i = 0; i < 26; i++) {
          const a = Math.PI * (1.0 + rnd() * 0.7), d = rnd() * r * 0.85;
          g.fillStyle = `rgba(255,255,255,${0.5 + rnd() * 0.4})`;
          g.beginPath(); g.arc(Math.cos(a) * d, Math.sin(a) * d, 1 + rnd() * 2, 0, Math.PI * 2); g.fill();
        }
      } else if (kind === 'acacia') {
        blobCanopy(g, r, pal, rnd, { blobs: 14, spread: 0.72, squash: 0.78, minR: 0.22, maxR: 0.38 });
      } else {
        blobCanopy(g, r, pal, rnd, { blobs: kind === 'jungle' ? 12 : 10, spread: 0.55, squash: 1, minR: 0.34, maxR: 0.5 });
      }
      return c;
    });
  }

  // ---------- Rocks ----------
  const ROCK_TINTS = { grey: [140, 138, 132], sand: [196, 160, 112], dark: [108, 104, 98] };
  function makeRock(size, tint, seed, snow) {
    return cached(`rock|${size}|${tint}|${seed}|${snow ? 1 : 0}`, () => {
      const pad = size * 0.1, S = size + pad * 2;
      const { c, g } = canvasFor(S);
      g.translate(S / 2, S / 2);
      const rnd = rng(seed * 7919 + size);
      const r = size / 2, base = ROCK_TINTS[tint] || ROCK_TINTS.grey;
      const pts = [];
      const n = 8 + Math.floor(rnd() * 3);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2, rr = r * (0.72 + rnd() * 0.28);
        pts.push([Math.cos(a) * rr, Math.sin(a) * rr * 0.85]);
      }
      const path = () => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); };
      const gr = g.createLinearGradient(-r, -r, r, r);
      gr.addColorStop(0, rgb(shade(base, 1.25)));
      gr.addColorStop(0.5, rgb(base));
      gr.addColorStop(1, rgb(shade(base, 0.6)));
      g.fillStyle = gr; path(); g.fill();
      g.strokeStyle = rgb(shade(base, 0.45), 0.8); g.lineWidth = 1.2; g.stroke();
      // a lighter top facet
      g.save(); path(); g.clip();
      g.fillStyle = rgb(shade(base, 1.35), 0.45);
      g.beginPath(); g.ellipse(-r * 0.25, -r * 0.3, r * 0.5, r * 0.32, -0.5, 0, Math.PI * 2); g.fill();
      if (snow) {
        g.fillStyle = 'rgba(248,252,255,0.95)';
        g.beginPath(); g.ellipse(-r * 0.15, -r * 0.35, r * 0.75, r * 0.45, -0.3, 0, Math.PI * 2); g.fill();
      }
      // cracks
      g.strokeStyle = rgb(shade(base, 0.4), 0.6); g.lineWidth = 1;
      for (let k = 0; k < 2; k++) {
        g.beginPath();
        let x = (rnd() - 0.5) * r, y = (rnd() - 0.5) * r;
        g.moveTo(x, y);
        for (let s = 0; s < 3; s++) { x += (rnd() - 0.3) * r * 0.4; y += (rnd() - 0.3) * r * 0.4; g.lineTo(x, y); }
        g.stroke();
      }
      g.restore();
      return c;
    });
  }

  // ---------- Small ground details ----------
  function makeDetail(kind, seed) {
    return cached(`detail|${kind}|${seed}`, () => {
      const S = 28;
      const { c, g } = canvasFor(S);
      g.translate(S / 2, S / 2);
      const rnd = rng(seed * 131 + kind.length);
      if (kind === 'tuft' || kind === 'drytuft' || kind === 'reeds') {
        const col = kind === 'tuft' ? [120, 140, 60] : kind === 'drytuft' ? [184, 160, 90] : [80, 120, 60];
        const n = kind === 'reeds' ? 9 : 12;
        g.lineCap = 'round';
        for (let i = 0; i < n; i++) {
          const a = -Math.PI / 2 + (rnd() - 0.5) * 2.4, len = 6 + rnd() * (kind === 'reeds' ? 9 : 6);
          g.strokeStyle = rgb(shade(col, 0.75 + rnd() * 0.5), 0.9);
          g.lineWidth = 1 + rnd();
          g.beginPath(); g.moveTo((rnd() - 0.5) * 4, 4); g.lineTo(Math.cos(a) * len, 4 + Math.sin(a) * len); g.stroke();
        }
      } else if (kind === 'fern') {
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2 + rnd() * 0.4;
          g.save(); g.rotate(a);
          g.fillStyle = rgb(mix([30, 80, 36], [80, 140, 60], rnd()), 0.95);
          g.beginPath(); g.ellipse(6, 0, 7, 2.2, 0, 0, Math.PI * 2); g.fill();
          g.restore();
        }
      } else if (kind === 'pebbles') {
        for (let i = 0; i < 5; i++) {
          const col = mix([170, 140, 100], [210, 185, 140], rnd());
          g.fillStyle = rgb(shade(col, 0.6), 0.5);
          const x = (rnd() - 0.5) * 16, y = (rnd() - 0.5) * 12, rr = 1.5 + rnd() * 2.5;
          g.beginPath(); g.ellipse(x + 1, y + 1, rr, rr * 0.8, 0, 0, Math.PI * 2); g.fill();
          g.fillStyle = rgb(col);
          g.beginPath(); g.ellipse(x, y, rr, rr * 0.8, 0, 0, Math.PI * 2); g.fill();
        }
      } else if (kind === 'snowmound') {
        const gr = g.createRadialGradient(-3, -3, 1, 0, 0, 11);
        gr.addColorStop(0, 'rgba(255,255,255,0.95)'); gr.addColorStop(1, 'rgba(190,210,230,0)');
        g.fillStyle = gr;
        g.beginPath(); g.ellipse(0, 0, 12, 8, 0, 0, Math.PI * 2); g.fill();
      } else if (kind === 'flowers') {
        for (let i = 0; i < 5; i++) {
          g.fillStyle = ['#f4d03f', '#ffffff', '#e67e22', '#d35db3'][Math.floor(rnd() * 4)];
          g.beginPath(); g.arc((rnd() - 0.5) * 14, (rnd() - 0.5) * 10, 1.6, 0, Math.PI * 2); g.fill();
        }
      }
      return c;
    });
  }

  // ---------- Fine grain overlay (keeps low-res terrain looking crisp) ----------
  let grain = null;
  function grainCanvas() {
    if (grain) return grain;
    const S = 192;
    grain = document.createElement('canvas');
    grain.width = grain.height = S;
    const g = grain.getContext('2d');
    const rnd = rng(42);
    for (let i = 0; i < 3200; i++) {
      const dark = rnd() < 0.55;
      g.fillStyle = dark ? `rgba(0,0,0,${0.04 + rnd() * 0.07})` : `rgba(255,255,255,${0.03 + rnd() * 0.06})`;
      const x = rnd() * S, y = rnd() * S;
      if (rnd() < 0.3) { g.fillRect(x, y, 1, 2 + rnd() * 3); } else g.fillRect(x, y, 1 + rnd() * 1.5, 1 + rnd() * 1.5);
    }
    return grain;
  }
  function grainPattern(ctx) { return ctx.createPattern(grainCanvas(), 'repeat'); }

  // ---------- Ground texture tile for a colour palette (zoo pens, grass) ----------
  function groundTile(key, colors, scale = 0.03) {
    return cached(`ground|${key}`, () => {
      const S = 128;
      const c = document.createElement('canvas');
      c.width = c.height = S;
      const g = c.getContext('2d');
      const img = g.createImageData(S, S);
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        // tileable noise: sample on a torus by blending wrapped coordinates
        const fx = x / S, fy = y / S;
        const n = (fbm(x * scale * 4, y * scale * 4) * (1 - fx) * (1 - fy) + fbm((x - S) * scale * 4, y * scale * 4) * fx * (1 - fy)
          + fbm(x * scale * 4, (y - S) * scale * 4) * (1 - fx) * fy + fbm((x - S) * scale * 4, (y - S) * scale * 4) * fx * fy);
        const col = mix(colors[0], colors[1], Math.min(1, Math.max(0, (n - 0.3) * 2.2)));
        const j = (Math.random() - 0.5) * 10;
        const i = (y * S + x) * 4;
        img.data[i] = col[0] + j; img.data[i + 1] = col[1] + j; img.data[i + 2] = col[2] + j; img.data[i + 3] = 255;
      }
      g.putImageData(img, 0, 0);
      g.drawImage(grainCanvas(), 0, 0);
      return c;
    });
  }

  // ---------- Soft shadow (sun from the top-left, so shadows fall bottom-right) ----------
  function shadow(ctx, x, y, rx, ry, alpha = 0.35, offset = 0.25) {
    const ox = x + rx * offset, oy = y + ry * offset;
    const gr = ctx.createRadialGradient(ox, oy, 0, ox, oy, rx);
    gr.addColorStop(0, `rgba(0,0,0,${alpha})`);
    gr.addColorStop(0.6, `rgba(0,0,0,${alpha * 0.6})`);
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gr;
    ctx.save();
    ctx.translate(ox, oy); ctx.scale(1, ry / rx); ctx.translate(-ox, -oy);
    ctx.beginPath(); ctx.arc(ox, oy, rx, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // Draw a cached sprite centred at (x, y) with the given world size.
  function draw(ctx, sprite, x, y, size, alpha = 1) {
    const w = sprite.width / DPR;
    const k = size / w;
    if (alpha !== 1) ctx.globalAlpha = alpha;
    ctx.drawImage(sprite, x - (w * k) / 2, y - (w * k) / 2, w * k, w * k);
    if (alpha !== 1) ctx.globalAlpha = 1;
  }

  // Screen-space vignette for a bit of atmosphere.
  let vig = null, vigKey = '';
  function vignette(ctx, W, H) {
    const key = W + 'x' + H;
    if (vigKey !== key) {
      vigKey = key;
      vig = document.createElement('canvas');
      vig.width = Math.max(1, W); vig.height = Math.max(1, H);
      const g = vig.getContext('2d');
      const gr = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
      gr.addColorStop(0, 'rgba(0,0,0,0)');
      gr.addColorStop(1, 'rgba(10,15,5,0.38)');
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
    }
    ctx.drawImage(vig, 0, 0, W, H);
  }

  return { noise, fbm, rng, mix, rgb, makeTree, makeRock, makeDetail, grainPattern, groundTile, shadow, draw, vignette };
})();
