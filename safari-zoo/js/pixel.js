// Pixel-art graphics in the style of the handheld Zelda games. Every sprite and tile is built
// in code at "art pixel" resolution, cached, and drawn into a small offscreen buffer that is
// scaled up with crisp, square pixels. One art pixel covers ART world units.

const Pixel = (() => {
  const ART = 2;          // world units per art pixel
  const T = 16;           // tile size in art pixels
  const OUTLINE = '#181820';

  // ---------- Noise & hashing ----------
  function hash2(x, y) {
    let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  }
  const hash = (x, y, s = 0) => hash2(x * 7 + s * 131, y * 13 - s * 71);
  function noise(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function fbm(x, y) {
    return noise(x, y) * 0.5 + noise(x * 2.03 + 17, y * 2.03 + 9) * 0.3 + noise(x * 4.1 + 41, y * 4.1 + 3) * 0.2;
  }

  // ---------- Building blocks ----------
  const COLS = {};
  function col(h) {
    if (Array.isArray(h)) return h;
    let c = COLS[h];
    if (!c) c = COLS[h] = [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16), 255];
    return c;
  }
  const shade = (h, k) => { const c = col(h); return [Math.min(255, c[0] * k) | 0, Math.min(255, c[1] * k) | 0, Math.min(255, c[2] * k) | 0, 255]; };
  const css = (h) => { const c = col(h); return `rgb(${c[0]},${c[1]},${c[2]})`; };

  function canvas(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, w); c.height = Math.max(1, h); return c; }
  // Build a sprite pixel by pixel: fn(x, y) returns a colour (or null for transparent).
  function pix(w, h, fn) {
    const c = canvas(w, h), g = c.getContext('2d'), d = g.createImageData(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const v = fn(x, y); if (!v) continue;
      const k = col(v), i = (y * w + x) * 4;
      d.data[i] = k[0]; d.data[i + 1] = k[1]; d.data[i + 2] = k[2]; d.data[i + 3] = k[3] ?? 255;
    }
    g.putImageData(d, 0, 0); return c;
  }
  // Build a sprite from [x, y, w, h, colour] rectangles.
  function rects(w, h, list) {
    const c = canvas(w, h), g = c.getContext('2d');
    for (const [x, y, rw, rh, cl] of list) { g.fillStyle = cl; g.fillRect(x, y, rw, rh); }
    return c;
  }
  // A 1px dark outline around every opaque pixel: the classic sprite look.
  function outline(src, oc = OUTLINE) {
    const sw = src.width, sh = src.height;
    const s = src.getContext('2d').getImageData(0, 0, sw, sh).data;
    const a = (x, y) => (x < 0 || y < 0 || x >= sw || y >= sh) ? 0 : s[(y * sw + x) * 4 + 3];
    const c = pix(sw + 2, sh + 2, (x, y) => {
      const sx = x - 1, sy = y - 1;
      if (a(sx, sy) > 0) return null;
      return (a(sx - 1, sy) > 128 || a(sx + 1, sy) > 128 || a(sx, sy - 1) > 128 || a(sx, sy + 1) > 128) ? oc : null;
    });
    c.getContext('2d').drawImage(src, 1, 1);
    return c;
  }
  function flipH(src) { const c = canvas(src.width, src.height), g = c.getContext('2d'); g.translate(src.width, 0); g.scale(-1, 1); g.drawImage(src, 0, 0); return c; }

  const cache = new Map();
  function memo(key, make) { let s = cache.get(key); if (s === undefined) { s = make(); cache.set(key, s); } return s; }

  // Drawing helpers for the low-res buffer (integer coordinates, no anti-aliasing).
  function line(g, x0, y0, x1, y1, color, w = 1) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    g.fillStyle = color;
    for (let i = 0; i < 2000; i++) {
      g.fillRect(x0, y0, w, w);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
  function ellipse(g, cx, cy, rx, ry, color) {
    g.fillStyle = color;
    for (let y = -Math.floor(ry); y <= Math.floor(ry); y++) {
      const w = Math.round(rx * Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry))));
      g.fillRect(Math.round(cx) - w, Math.round(cy) + y, w * 2 + 1, 1);
    }
  }
  function ring(g, cx, cy, rx, ry, color, dashed) {
    g.fillStyle = color;
    const n = Math.max(16, Math.round((rx + ry) * 3));
    let last = '';
    for (let i = 0; i < n; i++) {
      if (dashed && (i >> 2) % 2) continue;
      const a = (i / n) * Math.PI * 2, x = Math.round(cx + Math.cos(a) * rx), y = Math.round(cy + Math.sin(a) * ry), k = x + ',' + y;
      if (k !== last) g.fillRect(x, y, 1, 1);
      last = k;
    }
  }
  function shadow(w) {
    return memo('sh' + w, () => {
      const h = Math.max(3, Math.round(w * 0.36));
      return pix(w, h, (x, y) => (((x + 0.5 - w / 2) / (w / 2)) ** 2 + ((y + 0.5 - h / 2) / (h / 2)) ** 2 <= 1) ? [0, 0, 0, 64] : null);
    });
  }
  // Draw a sprite with its bottom-centre at (x, y) in buffer pixels.
  function drawAt(g, s, x, y, alpha = 1) {
    if (!s) return;
    if (alpha !== 1) g.globalAlpha = alpha;
    g.drawImage(s, Math.round(x - s.width / 2), Math.round(y - s.height));
    if (alpha !== 1) g.globalAlpha = 1;
  }
  function drawShadow(g, x, y, w) { const s = shadow(Math.max(4, Math.round(w))); g.drawImage(s, Math.round(x - s.width / 2), Math.round(y - s.height / 2)); }

  // ---------- Trees, rocks & plants ----------
  // A round, clumpy canopy built from overlapping lobes, each lit from the top-left with a dark lower rim.
  function clumps(w, h, lobes, pal, under) {
    return pix(w, h, (x, y) => {
      let top = -1;
      for (let i = 0; i < lobes.length; i++) { const [lx, ly, r] = lobes[i]; if ((x + 0.5 - lx) ** 2 + (y + 0.5 - ly) ** 2 <= r * r) top = i; }
      if (top < 0) return under ? under(x, y) : null;
      const [lx, ly, r] = lobes[top];
      const nx = (x + 0.5 - lx) / r, ny = (y + 0.5 - ly) / r, d = Math.hypot(nx, ny);
      if (d > 0.8 && ny > 0.2) return pal[2];
      if (nx < -0.05 && ny < -0.1 && d > 0.3 && d < 0.75) return pal[0];
      if (ny > 0.5) return pal[2];
      return pal[1];
    });
  }
  const trunk = (x0, x1, y0, y1) => (x, y) => (y >= y0 && y <= y1 && x >= x0 - (y >= y1 - 1 ? 2 : 0) && x <= x1 + (y >= y1 - 1 ? 2 : 0))
    ? (x <= x0 ? '#a87040' : x >= x1 - 1 ? '#5a3418' : '#80502a') : null;

  const LEAF = {
    broadleaf: [['#88d050', '#50a030', '#2a6a28'], ['#78c048', '#489030', '#285e24'], ['#a0d860', '#62a838', '#347028']],
    wetlands: [['#70c070', '#3e8a48', '#22582e'], ['#80c868', '#48904a', '#285c30'], ['#68b878', '#368050', '#1e5232']],
    jungle: [['#58b048', '#287830', '#104820'], ['#68b850', '#307c34', '#144a22'], ['#4aa04a', '#22702e', '#0e421e']],
  };
  function roundTree(pal, scale = 1) {
    return memo('tree' + pal + scale, () => {
      const L = [[16, 13, 9], [16, 7, 8], [8, 12, 7.5], [24, 12, 7.5], [11, 18, 7], [21, 18, 7]].map(([x, y, r]) => [x * scale, y * scale, r * scale]);
      const w = Math.round(32 * scale), h = Math.round(32 * scale);
      return outline(clumps(w, h, L, pal, trunk(Math.round(13 * scale), Math.round(18 * scale), Math.round(22 * scale), h - 1)));
    });
  }
  function acacia(v = 0) {
    return memo('acacia' + v, () => {
      const pal = [['#b8c858', '#88a038', '#5a7028'], ['#c8d060', '#98a840', '#687828'], ['#a8c050', '#789838', '#4e6a24']][v % 3];
      const branches = (x, y) => {
        if (x >= 19 && x <= 21 && y >= 14 && y <= 29) return x === 19 ? '#a87040' : x === 21 ? '#5a3418' : '#80502a';
        if (y >= 29 && x >= 17 && x <= 23) return '#5a3418';
        for (const dir of [-1, 1]) { const t = (y - 11) / 7; if (t >= 0 && t <= 1 && Math.abs(x - (20 + dir * (1 - t) * 7)) < 1.2) return '#6a4020'; }
        return null;
      };
      return outline(clumps(42, 31, [[21, 7, 7], [10, 9, 6], [32, 9, 6], [15, 11, 6], [27, 11, 6], [21, 11, 6]], pal, branches));
    });
  }
  function pine(snow, scale = 1) {
    return memo('pine' + snow + scale, () => {
      const w = Math.round(22 * scale), h = Math.round(34 * scale), cx = w / 2;
      return outline(pix(w, h, (x, y) => {
        const ty = y / scale;
        if (ty >= 29 && Math.abs(x + 0.5 - cx) <= 2 * scale) return x + 0.5 < cx ? '#8a5a30' : '#5a3418';
        for (let i = 3; i >= 0; i--) {
          const apex = i * 6, base = apex + 12, hw = (4 + i * 2.2) * scale;
          if (ty < apex || ty > base) continue;
          const half = (ty - apex + 1) / 13 * hw, dx = x + 0.5 - cx;
          if (Math.abs(dx) > half) continue;
          if (snow && (ty - apex < 3 || (base - ty < 2 && hash(x, i) > 0.4))) return '#f4f8ff';
          if (base - ty < 2) return '#183c30';
          if (dx < -half * 0.35) return '#4a9a68';
          if (dx > half * 0.3) return '#22553e';
          return '#307a50';
        }
        return null;
      }));
    });
  }
  function palm(v = 0) {
    return memo('palm' + v, () => {
      const w = 34, h = 38, top = [17 + (v % 2 ? 2 : -2), 10];
      const fronds = [];
      for (let i = 0; i < 7; i++) fronds.push(i / 7 * Math.PI * 2 + 0.25 + v * 0.3);
      return outline(pix(w, h, (x, y) => {
        // fronds: drooping arcs from the crown
        for (const a of fronds) {
          for (let t = 0; t <= 1; t += 0.04) {
            const fx = top[0] + Math.cos(a) * 15 * t, fy = top[1] + Math.sin(a) * 7 * t - Math.sin(t * Math.PI) * 4 + t * t * 7;
            const th = 2.2 - t * 1.4;
            if (Math.abs(x + 0.5 - fx) < th && Math.abs(y + 0.5 - fy) < th * 0.8) return t < 0.3 ? '#78c850' : Math.sin(a) > 0.3 ? '#2e7a30' : '#4aa03c';
          }
        }
        if (Math.hypot(x + 0.5 - top[0], y + 0.5 - top[1]) < 2.2) return '#6a4a20';
        // curved, ringed trunk
        if (y > top[1] && y < h - 1) {
          const t = (y - top[1]) / (h - top[1]), cx = top[0] + (17 - top[0]) * t * t + Math.sin(t * 3) * 1.2;
          if (Math.abs(x + 0.5 - cx) <= 1.6) return y % 3 === 0 ? '#8a6438' : x + 0.5 < cx ? '#d0a868' : '#a87e48';
        }
        return null;
      }));
    });
  }
  function cactus(v = 0) {
    return memo('cactus' + v, () => outline(pix(18, 28, (x, y) => {
      const inBox = (x0, x1, y0, y1) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
      const arms = v % 2 ? [[1, 4, 8, 15], [1, 4, 14, 17], [13, 16, 4, 12], [13, 16, 11, 14]] : [[1, 4, 6, 13], [1, 4, 12, 15], [13, 16, 10, 16], [13, 16, 15, 18]];
      const solid = inBox(6, 11, 1, 27) || arms.some((r) => inBox(...r));
      if (!solid) return null;
      if (y === 1 && (x === 6 || x === 11)) return null;
      if ((x + y) % 5 === 0 && y % 3 === 0) return '#e8f0c0';    // spines
      return x % 3 === 0 ? '#2e7a3a' : x % 3 === 1 ? '#58b050' : '#409a44';
    })));
  }
  const ROCK = { grey: ['#d0d0d8', '#9898a8', '#606070'], sand: ['#f0d8a8', '#c8a870', '#8a6a40'], dark: ['#a8a898', '#787868', '#484838'], ice: ['#e8f8ff', '#a8d8f0', '#6898c0'] };
  function rock(w, tint = 'grey', snow = false, v = 0) {
    return memo(`rock${w}${tint}${snow}${v}`, () => {
      const pal = ROCK[tint] || ROCK.grey, h = Math.round(w * 0.8), cx = w / 2, cy = h / 2;
      return outline(pix(w, h, (x, y) => {
        const nx = (x + 0.5 - cx) / (w / 2 - 0.3), ny = (y + 0.5 - cy) / (h / 2 - 0.3);
        const wob = 1 + (hash(Math.round(Math.atan2(ny, nx) * 3), v) - 0.5) * 0.25;
        if (Math.abs(nx) ** 2.6 + Math.abs(ny) ** 2.6 > wob) return null;
        if (snow && ny < -0.3) return '#f4f8ff';
        const crack = Math.abs((x - cx * 0.7) - (y - cy * 0.5) * 0.6) < 0.6 && y > cy * 0.4 && y < cy * 1.3 && x < cx;
        if (crack) return pal[2];
        if (nx + ny < -0.7) return pal[0];
        if (nx + ny > 0.55 || ny > 0.6) return pal[2];
        return pal[1];
      }));
    });
  }
  function bush(pal, scale = 1) {
    return memo('bush' + pal + scale, () => outline(clumps(Math.round(16 * scale), Math.round(14 * scale),
      [[8, 5, 4.5], [4.5, 8, 4.5], [11.5, 8, 4.5], [8, 9, 5]].map(([x, y, r]) => [x * scale, y * scale, r * scale]), pal)));
  }

  // ---------- Zoo decorations (keyed by the emoji the game data uses) ----------
  function decor(what, seed = 0) {
    return memo('decor' + what + (seed % 3), () => {
      switch (what) {
        case 'tree:acacia': return acacia(seed);
        case 'tree:broadleaf': case '🌳': return roundTree(LEAF.broadleaf[seed % 3], 0.8);
        case 'tree:palm': case '🌴': return palm(seed);
        case 'tree:pine': case '🌲': return pine(true, 0.9);
        case 'rock:sand': return rock(16, 'sand', false, seed);
        case '🪨': return rock(14, 'grey', false, seed);
        case '🌵': return cactus(seed);
        case '🌾': return outline(pix(14, 12, (x, y) => {   // tuft of tall grass
          const b = [2, 5, 7, 9, 12].find((bx) => Math.abs(x - bx - (11 - y) * (bx - 7) * 0.08) < 0.7);
          if (b === undefined || y < Math.abs(b - 7) * 0.8 + 1) return null;
          return y < 4 ? '#f0e8a0' : y < 8 ? '#c8b048' : '#9a8430';
        }));
        case '🌼': return outline(pix(14, 10, (x, y) => {
          for (const [fx, fy, c] of [[3, 3, '#f8f8f8'], [9, 2, '#f8d020'], [6, 7, '#f8f8f8'], [11, 7, '#f86858']]) {
            if (x === fx && y === fy) return '#f8a020';
            if (Math.abs(x - fx) + Math.abs(y - fy) === 1) return c;
          }
          return (y >= 8 && x % 3 === 1) ? '#58a038' : null;
        }));
        case '🪵': return outline(rects(18, 8, [[0, 0, 18, 8, '#8a5a30'], [0, 0, 18, 2, '#b07a40'], [0, 6, 18, 2, '#5a3418'], [0, 0, 4, 8, '#d8b078'], [1, 2, 2, 4, '#b08850'], [8, 3, 6, 1, '#6a4020']]));
        case '🪷': return outline(pix(16, 10, (x, y) => {
          const pad = ((x - 8) / 8) ** 2 + ((y - 6) / 4) ** 2 <= 1 && !(x > 8 && y < 6 && x - 8 < (6 - y) * 2);
          const flower = Math.abs(x - 7) + Math.abs(y - 4) <= 2;
          if (flower) return y < 4 ? '#f8b8d8' : '#f088b8';
          return pad ? (y > 7 ? '#2e7a3a' : '#58b050') : null;
        }));
        case '🌿': case '🍀': return bush(LEAF.wetlands[seed % 3], 0.8);
        case '🌺': return memo('hibiscus' + seed, () => {
          const b = bush(LEAF.jungle[0], 0.9), c = canvas(b.width, b.height), g = c.getContext('2d');
          g.drawImage(b, 0, 0);
          for (const [x, y] of [[4, 4], [9, 3], [7, 8], [11, 7]]) { g.fillStyle = '#f83858'; g.fillRect(x - 1, y, 3, 1); g.fillRect(x, y - 1, 1, 3); g.fillStyle = '#f8e848'; g.fillRect(x, y, 1, 1); }
          return c;
        });
        case '🍄': return outline(pix(12, 12, (x, y) => {
          if (y < 6 && ((x - 5.5) / 6) ** 2 + ((y - 5) / 5) ** 2 <= 1) return ((x === 3 && y === 2) || (x === 7 && y === 3) || (x === 5 && y === 5)) ? '#f8f8f8' : y < 2 ? '#f86858' : '#d83828';
          if (y >= 6 && x >= 4 && x <= 7) return x === 4 ? '#f8f0e0' : '#e0d0b8';
          return null;
        }));
        case '🎋': return outline(pix(12, 30, (x, y) => {
          for (const [bx, top] of [[2, 4], [6, 0], [9, 7]]) if (x >= bx && x <= bx + 1 && y >= top) return y % 6 === 0 ? '#3e7a30' : x === bx ? '#a8d860' : '#70a840';
          if ((y === 6 || y === 14) && x >= 3 && x <= 8 && (x + y) % 3) return '#58b050';
          return null;
        }));
        case '🦴': return outline(rects(16, 6, [[2, 2, 12, 2, '#f0ead8'], [0, 0, 3, 3, '#f0ead8'], [0, 3, 3, 3, '#d8d0b8'], [13, 0, 3, 3, '#f0ead8'], [13, 3, 3, 3, '#d8d0b8'], [2, 3, 12, 1, '#c8c0a8']]));
        case '🐚': return outline(pix(12, 10, (x, y) => {
          const d = Math.hypot(x - 6, (y - 8) * 1.2);
          if (d > 6 || y > 9) return null;
          return Math.round(Math.atan2(y - 8, x - 6) * 4) % 2 ? '#f8c8b0' : '#f0a888';
        }));
        case '🏺': return outline(pix(12, 16, (x, y) => {
          const w = y < 2 ? 3 : y < 5 ? 2 : y < 13 ? 5 - Math.abs(y - 9) * 0.3 : 3;
          if (Math.abs(x + 0.5 - 6) > w) return null;
          if (y === 8 || y === 9) return '#4a2a18';
          return x + 0.5 < 6 ? '#e09058' : '#b86838';
        }));
        case '⛄': return outline(pix(14, 22, (x, y) => {
          if (y <= 2 && x >= 4 && x <= 9) return '#303038';                         // hat
          if (y === 3 && x >= 3 && x <= 10) return '#303038';
          const head = Math.hypot(x + 0.5 - 7, y + 0.5 - 7) <= 3.6, body = Math.hypot(x + 0.5 - 7, y + 0.5 - 15.5) <= 6.2;
          if (!head && !body) return null;
          if (head && y === 7 && (x === 5 || x === 8)) return '#202028';
          if (head && y === 8 && x >= 7 && x <= 9) return '#f88820';
          if (body && x === 7 && (y === 12 || y === 15)) return '#202028';
          return x > 8 ? '#c8d8f0' : '#f8fbff';
        }));
        case '🧊': return outline(pix(16, 14, (x, y) => {
          if (y < 4) return x >= 1 && x <= 14 ? (x < 5 ? '#ffffff' : '#e0f6ff') : null;
          return x < 11 ? ((x + y) % 7 === 0 ? '#ffffff' : '#a8dcf8') : '#78b8e0';
        }));
        case '❄️': return outline(pix(12, 16, (x, y) => {   // ice crystals
          for (const [cx, w, top] of [[3, 1.5, 6], [6, 2, 1], [9, 1.5, 5]]) if (y >= top && Math.abs(x + 0.5 - cx - 0.5) <= w * (y - top + 2) / (16 - top + 2)) return x <= cx ? '#e8f8ff' : '#90c8e8';
          return null;
        }));
        default: return null;
      }
    });
  }

  // ---------- Base camp, signs and other props ----------
  function tent(color) {
    return memo('tent' + color, () => {
      const c = col(color), lite = shade(color, 1.18), dark = shade(color, 0.72);
      return outline(pix(30, 22, (x, y) => {
        const cx = 15, half = (y + 1) * 0.72;
        if (Math.abs(x + 0.5 - cx) > half) return null;
        if (y > 9 && Math.abs(x + 0.5 - cx) < (y - 9) * 0.5) return y > 19 ? '#3a2818' : '#4a3020';   // door
        if (y === 21) return dark;
        return x + 0.5 < cx ? lite : (x + 0.5 - cx < 1 ? c : dark);
      }));
    });
  }
  function flag(frame) {
    return memo('flag' + frame, () => outline(pix(14, 30, (x, y) => {
      if (x === 1 && y > 0) return y === 1 ? '#f8d848' : '#a0a0a8';
      const wave = frame ? Math.round(Math.sin((x - 2) * 0.9) * 1) : Math.round(Math.sin((x - 2) * 0.9 + 2) * 1);
      if (x >= 2 && x <= 12 && y >= 2 + wave && y <= 9 + wave) return y < 6 + wave ? '#e83838' : '#c02828';
      return null;
    })));
  }
  const PUMP = () => memo('pump', () => outline(rects(12, 18, [[0, 2, 10, 16, '#d83828'], [0, 2, 3, 16, '#f86858'], [2, 5, 6, 4, '#e0f0f8'], [3, 6, 4, 1, '#303038'], [2, 0, 6, 2, '#b02818'], [10, 6, 2, 8, '#303038'], [0, 16, 10, 2, '#801810']])));
  // A wooden sign board of any width (for labels drawn on top in the HUD pass).
  function board(w) {
    return memo('board' + w, () => outline(pix(w, 14, (x, y) => {
      if (y >= 9) return (x === (w >> 1) - 1 || x === (w >> 1)) ? (x === (w >> 1) - 1 ? '#a87040' : '#6a4020') : null;
      if (y === 0) return '#d8a060';
      if (y === 8) return '#6a4020';
      return (x + y * 3) % 11 === 0 ? '#9a6a38' : '#b88050';
    })));
  }
  function fencePost(colr = '#8a5f37') {
    return memo('post' + colr, () => outline(rects(4, 12, [[0, 0, 4, 12, css(shade(colr, 1))], [0, 0, 1, 12, css(shade(colr, 1.3))], [3, 0, 1, 12, css(shade(colr, 0.7))]])));
  }
  const BARRIER = () => memo('barrier', () => outline(pix(26, 14, (x, y) => {
    if (y >= 6 && (x === 3 || x === 4 || x === 21 || x === 22)) return '#606068';
    if (y < 6) return ((x + y) >> 2) % 2 ? '#f8f8f8' : '#f08020';
    return null;
  })));

  // Resource nodes on the safari, two frames of a little glint.
  function resource(res, frame) {
    return memo('res' + res + frame, () => {
      let s;
      switch (res) {
        case 'grass': s = outline(pix(14, 14, (x, y) => {
          if (y >= 7 && y <= 8) return x >= 3 && x <= 10 ? '#a86a28' : null;
          const spread = Math.abs(y - 7.5) * 0.5 + 2;
          if (Math.abs(x + 0.5 - 7) > spread + 1) return null;
          return (x + y) % 3 === 0 ? '#c8a838' : y < 7 ? '#f0d860' : '#d8b848';
        })); break;
        case 'wood': s = outline(rects(16, 12, [[0, 5, 16, 6, '#8a5a30'], [0, 5, 16, 1, '#b07a40'], [0, 5, 3, 6, '#d8b078'], [3, 0, 12, 6, '#7a4a28'], [3, 0, 12, 1, '#a86a38'], [12, 0, 3, 6, '#d0a870'], [13, 2, 1, 2, '#a07848'], [1, 7, 1, 2, '#b08850']])); break;
        case 'mushroom': s = decor('🍄'); break;
        case 'cactus': s = outline(pix(12, 14, (x, y) => {
          if (Math.hypot(x + 0.5 - 6, y + 0.5 - 7) > 5.5) return null;
          if ((x === 3 && y === 4) || (x === 8 && y === 6) || (x === 5 && y === 10)) return '#f8f0c0';
          if (y < 3 && x >= 5 && x <= 6) return '#f868a8';
          return x < 6 ? '#68c058' : '#3e8a3e';
        })); break;
        case 'ice': s = decor('🧊'); break;
      }
      if (!frame || !s) return s;
      const c = canvas(s.width, s.height), g = c.getContext('2d');
      g.drawImage(s, 0, 0);
      g.fillStyle = '#ffffff'; g.fillRect(3, 1, 1, 3); g.fillRect(2, 2, 3, 1);
      return c;
    });
  }

  function netSprite(d) {
    d = Math.max(7, Math.round(d) | 1);
    return memo('net' + d, () => outline(pix(d, d, (x, y) => {
      const r = d / 2, dd = Math.hypot(x + 0.5 - r, y + 0.5 - r);
      if (dd > r - 0.2) return null;
      if (dd > r - 1.3) return (x + y) % 5 === 0 ? '#c0392b' : '#f4f4e8';
      return ((x + y) % 4 === 0 || (x - y + 64) % 4 === 0) ? '#f4f4e8' : null;   // diamond mesh
    }), '#303038'));
  }
  const ANGER = () => memo('anger', () => outline(rects(4, 10, [[1, 0, 2, 6, '#f83838'], [1, 8, 2, 2, '#f83838'], [1, 0, 1, 6, '#ff9090']])));

  function heart(state) {   // 2 = full, 1 = half, 0 = empty
    return memo('heart' + state, () => {
      const map = ['0110110', '1111111', '1111111', '0111110', '0011100', '0001000'];
      return outline(pix(7, 6, (x, y) => {
        if (map[y][x] !== '1') return null;
        const full = state === 2 || (state === 1 && x < 4);
        if (!full) return '#5a3030';
        return (x === 1 && y === 1) ? '#ffd0d0' : '#e83838';
      }), '#201010');
    });
  }
  const RUPEE = () => memo('rupee', () => outline(pix(7, 11, (x, y) => {
    const w = y < 3 ? y + 1 : y > 7 ? 10 - y : 3;
    if (Math.abs(x - 3) > w) return null;
    return x < 3 ? '#a8f8a0' : x === 3 ? '#50d848' : '#28a028';
  })));
  const FUEL = () => memo('fuel', () => outline(rects(8, 10, [[1, 1, 6, 9, '#d83828'], [1, 1, 2, 9, '#f87868'], [5, 0, 2, 2, '#c0c0c8'], [2, 4, 4, 1, '#f8d838']])));
  function arrow(angleIdx) {   // 16 directions
    return memo('arrow' + angleIdx, () => {
      const a = angleIdx / 16 * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
      return outline(pix(15, 15, (x, y) => {
        const dx = x - 7, dy = y - 7, u = dx * ca + dy * sa, v = -dx * sa + dy * ca;
        return (u <= 6 && u >= -3 && Math.abs(v) <= (6 - u) * 0.55 && !(u < 0 && Math.abs(v) > 1.2)) ? '#f8f8f8' : null;
      }));
    });
  }

  // ---------- People ----------
  // dir: 0 = facing down, 1 = up, 2 = right (flip for left). frame: 0/1 walk cycle.
  function person(look, dir, frame) {
    return memo(`person${look.id}${dir}${frame}`, () => {
      const L = look, r = [];
      const legs = dir === 2
        ? (frame ? [[4, 13, 2, 2, L.skin], [7, 13, 2, 2, L.skin], [3, 15, 3, 1, L.boots], [7, 15, 3, 1, L.boots]] : [[5, 13, 3, 2, L.skin], [5, 15, 4, 1, L.boots]])
        : (frame ? [[3, 14, 2, 1, L.skin], [7, 13, 2, 1, L.skin], [3, 15, 2, 1, L.boots], [7, 14, 2, 1, L.boots]] : [[3, 13, 2, 1, L.skin], [7, 14, 2, 1, L.skin], [3, 14, 2, 1, L.boots], [7, 15, 2, 1, L.boots]]);
      if (dir === 2) {
        r.push([3, 9, 6, 4, L.shirt], [3, 9, 2, 1, L.shirtHi], [3, 12, 6, 1, L.belt], [4, 13, 5, 1, L.pants], ...legs);
        r.push([4, 4, 5, 5, L.skin], [7, 6, 1, 1, '#202028'], [9, 7, 1, 1, L.skin], [3, 4, 2, 4, L.hair]);
        if (L.hat) r.push([3, 0, 7, 4, L.hat], [4, 0, 3, 1, L.hatHi], [1, 3, 11, 2, L.brim], [3, 3, 7, 1, L.band]);
        else r.push([3, 2, 6, 3, L.hair], [3, 5, 1, 3, L.hair]);
        r.push([5 + (frame ? 1 : 0), 9, 2, 4, L.shirtDk], [5 + (frame ? 1 : 0), 12, 2, 1, L.skin]);
      } else {
        r.push([2, 9, 8, 4, L.shirt], [2, 9, 2, 1, L.shirtHi], [1, 9, 1, 3, L.skin], [10, 9, 1, 3, L.skin], [2, 12, 8, 1, L.belt], [3, 13, 6, 1, L.pants], ...legs);
        if (dir === 0) r.push([3, 4, 6, 5, L.skin], [4, 6, 1, 2, '#202028'], [7, 6, 1, 2, '#202028']);
        else r.push([3, 4, 6, 5, L.hat ? L.hair : L.hair], [3, 8, 6, 1, L.skin]);
        if (L.hat) r.push([2, 0, 8, 4, L.hat], [3, 0, 3, 1, L.hatHi], [0, 3, 12, 2, L.brim], [2, 3, 8, 1, L.band]);
        else r.push([2, 2, 8, 3, L.hair], [2, 5, 1, 2, L.hair], [9, 5, 1, 2, L.hair]);
      }
      return outline(rects(12, 16, r));
    });
  }
  const KEEPER = { id: 'keeper', hat: '#e0b060', hatHi: '#f0d088', brim: '#c89848', band: '#7a4a20', hair: '#6a4020', skin: '#f0c090',
    shirt: '#7a9a40', shirtHi: '#9aba58', shirtDk: '#5a7a30', belt: '#6a4020', pants: '#8a6a40', boots: '#5a3a20' };
  const VISITOR_COLORS = {
    shirt: ['#e84848', '#4878e8', '#f8c838', '#a858d8', '#48b8a8', '#f88838', '#f878b8'],
    pants: ['#384878', '#504038', '#686870', '#2a2a40', '#88704a'],
    hair: ['#3a2818', '#b87838', '#f8d878', '#181818', '#a83818', '#d8d8d8'],
    skin: ['#f8d0a8', '#e0a878', '#a87048', '#704830', '#f0c090'],
  };
  function visitorLook(n) {
    const pick = (arr, s) => arr[Math.floor(hash(n, s) * arr.length)];
    const shirt = pick(VISITOR_COLORS.shirt, 1);
    return { id: 'v' + n, hair: pick(VISITOR_COLORS.hair, 2), skin: pick(VISITOR_COLORS.skin, 3), shirt, shirtHi: css(shade(shirt, 1.25)), shirtDk: css(shade(shirt, 0.75)),
      belt: pick(VISITOR_COLORS.pants, 4), pants: pick(VISITOR_COLORS.pants, 4), boots: '#383038' };
  }

  // ---------- Buildings ----------
  function house(w, h, roof, wall, kind) {
    return memo(`house${w}${h}${roof}${wall}${kind}`, () => {
      const roofH = Math.round(h * 0.5), r = col(roof);
      const doorW = kind === 'garage' ? Math.round(w * 0.42) : 12, doorX = Math.round(w / 2 - doorW / 2), doorTop = kind === 'garage' ? roofH + 12 : roofH + 10;
      const wins = kind === 'garage' ? [8] : [8, w - 21];
      return outline(pix(w, h, (x, y) => {
        if (y < roofH) {
          if (kind !== 'garage' && x >= w - 18 && x <= w - 12 && y < 9) return y < 2 ? '#585058' : x === w - 18 ? '#b0a8b0' : '#8a8088';   // chimney
          if (y < 2) return shade(roof, 0.6);
          const row = y >> 2;
          if (y % 4 === 3) return shade(roof, 0.72);
          if ((x + (row % 2) * 4) % 8 === 0) return shade(roof, 0.82);
          return x < 8 ? shade(roof, 1.15) : r;
        }
        if (y < roofH + 2) return '#6a3a20';
        if (y >= h - 3) return y === h - 3 ? '#706860' : '#9a9088';
        if (x >= doorX && x < doorX + doorW && y >= doorTop) {
          if (kind === 'garage') return x === doorX || x === doorX + doorW - 1 ? '#505058' : (y - doorTop) % 3 === 0 ? '#808088' : '#a8a8b0';
          if (y === doorTop && (x === doorX || x === doorX + doorW - 1)) return null;
          return (x === doorX + 3 && y === doorTop + 9) ? '#f8d848' : (x === doorX || x === doorX + doorW - 1) ? '#4a2810' : '#7a4428';
        }
        for (const wx of wins) if (x >= wx && x <= wx + 12 && y >= roofH + 8 && y <= roofH + 18) {
          if (x === wx || x === wx + 12 || y === roofH + 8 || y === roofH + 18 || x === wx + 6 || y === roofH + 13) return '#7a4a28';
          return (x - wx + y) % 7 === 0 ? '#e0f4ff' : '#80c8f0';
        }
        // a cream plaque for the building's name
        if (y >= roofH + 3 && y <= roofH + 8 && x >= w / 2 - 20 && x < w / 2 + 20) return (y === roofH + 8) ? '#a07040' : '#f8f0d8';
        const c = col(wall);
        return y % 6 === 0 ? shade(c, 0.88) : c;
      }));
    });
  }

  // ---------- Vehicles: little box models rendered in 3/4 view at any angle ----------
  // Each box: [x0, x1, y0, y1, z0, z1, top colour, side colour] in art pixels; x points forward.
  const HEIGHT = 0.8;   // how tall vertical faces look on screen
  function voxel(boxes, angle) {
    let R = 0, Z = 0;
    for (const b of boxes) { R = Math.max(R, Math.hypot(Math.max(-b[0], b[1]), Math.max(-b[2], b[3]))); Z = Math.max(Z, b[5]); }
    R = Math.ceil(R) + 1;
    const w = R * 2, py0 = R + Math.ceil(Z * HEIGHT), h = py0 + R;
    const ca = Math.cos(angle), sa = Math.sin(angle);
    const mat = (lx, ly, z) => { for (const b of boxes) if (lx >= b[0] && lx < b[1] && ly >= b[2] && ly < b[3] && z >= b[4] && z < b[5]) return b; return null; };
    const sprite = pix(w, h, (px, py) => {
      const X = px + 0.5 - R, sy = py + 0.5 - py0;
      for (let z = Z; z >= 0; z -= 0.5) {
        const Y = sy + z * HEIGHT;
        const lx = X * ca + Y * sa, ly = -X * sa + Y * ca;
        const b = mat(lx, ly, z);
        if (!b) continue;
        if (mat(lx, ly, z + 0.5) !== b && z + 0.5 >= b[5]) return b[6];
        // a side face: light it by which way it points (light from the west)
        const d = [lx - b[0], b[1] - lx, ly - b[2], b[3] - ly], m = Math.min(...d), i = d.indexOf(m);
        const nl = [[-1, 0], [1, 0], [0, -1], [0, 1]][i];
        const nwx = nl[0] * ca - nl[1] * sa;
        return shade(b[7], 0.92 - nwx * 0.12);
      }
      return null;
    });
    const s = outline(sprite);
    s.anchorX = R + 1; s.anchorY = py0 + 1;
    return s;
  }
  const JEEP_BOXES = [
    [-10, -4, -8, -5, 0, 5, '#383840', '#202028'], [4, 10, -8, -5, 0, 5, '#383840', '#202028'],
    [-10, -4, 5, 8, 0, 5, '#383840', '#202028'], [4, 10, 5, 8, 0, 5, '#383840', '#202028'],
    [-14, -12, -3, 3, 4, 10, '#383840', '#202028'],
    [12, 13, -7, 7, 3, 5, '#707078', '#505058'],
    [12, 12.7, -5.5, -3, 6, 8, '#fff8c0', '#f0e090'], [12, 12.7, 3, 5.5, 6, 8, '#fff8c0', '#f0e090'],
    [5, 12, -6.5, 6.5, 9, 10, '#e8a828', '#b87818'],
    [4, 5, -6.5, 6.5, 9, 14, '#c8f0ff', '#78b8e0'],
    [-1, 3, -5.5, -1, 9, 12, '#7a4a28', '#5a3418'], [-1, 3, 1, 5.5, 9, 12, '#7a4a28', '#5a3418'],
    [0, 3, 1.5, 4.5, 12, 14, '#e0b060', '#b08838'],
    [-4, -3, -7, -6, 9, 16, '#606068', '#404048'], [-4, -3, 6, 7, 9, 16, '#606068', '#404048'], [-4, -3, -7, 7, 15, 16, '#606068', '#404048'],
    [-11, -4, -6, 6, 9, 9.5, '#8a5a30', '#6a4020'],
    [-12, 12, -7, 7, 3, 9, '#f0b830', '#c88a20'],
  ];
  const JEEP_DIRS = 32;
  function jeep(angle) {
    const i = ((Math.round(angle / (Math.PI * 2) * JEEP_DIRS) % JEEP_DIRS) + JEEP_DIRS) % JEEP_DIRS;
    return memo('jeep' + i, () => voxel(JEEP_BOXES, i / JEEP_DIRS * Math.PI * 2));
  }
  const TRUCK_BOXES = [
    [-18, -12, -10, -7, 0, 6, '#383840', '#202028'], [8, 14, -10, -7, 0, 6, '#383840', '#202028'],
    [-18, -12, 7, 10, 0, 6, '#383840', '#202028'], [8, 14, 7, 10, 0, 6, '#383840', '#202028'],
    [19, 19.7, -7, -4, 6, 8, '#fff8c0', '#f0e090'], [19, 19.7, 4, 7, 6, 8, '#fff8c0', '#f0e090'],
    [15, 16, -8, 8, 11, 17, '#c8f0ff', '#78b8e0'],
    [8, 19, -9, 9, 4, 17, '#d84838', '#b03028'],
    [-24, 7, -10, 10, 4, 24, '#f0ead8', '#d8ceb0'],
  ];
  function truck(angle) { return memo('truck' + angle, () => voxel(TRUCK_BOXES, angle)); }

  // ---------- Animals: the game's artwork shrunk to pixel size, colours snapped, outlined ----------
  function animal(key, size, faceRight) {
    const ck = 'an' + key + size + (faceRight ? 'R' : 'L');
    const hit = cache.get(ck);
    if (hit) return hit;
    const art = ANIMAL_ART[key];
    if (!art || !art.img.complete || !art.img.naturalWidth) return null;
    const c = canvas(size, size), g = c.getContext('2d');
    g.imageSmoothingQuality = 'high';
    if (!!faceRight !== !!art.flip) { g.translate(size, 0); g.scale(-1, 1); }
    g.drawImage(art.img, -size * 0.04, -size * 0.04, size * 1.08, size * 1.08);
    let out;
    try {
      const d = g.getImageData(0, 0, size, size);
      for (let i = 0; i < d.data.length; i += 4) {
        if (d.data[i + 3] < 110) { d.data[i + 3] = 0; continue; }
        d.data[i + 3] = 255;
        for (let k = 0; k < 3; k++) d.data[i + k] = Math.min(255, Math.round(d.data[i + k] * 1.06 / 32) * 32);
      }
      g.setTransform(1, 0, 0, 1, 0, 0); g.putImageData(d, 0, 0);
      out = outline(c, '#1c1820');
    } catch (e) {
      out = c;   // pages opened from disk can't read pixels back; use the plain shrunk image
    }
    cache.set(ck, out);
    return out;
  }
  // A crisp data: URL of the pixel animal, for menus (falls back to the original image).
  function animalURL(key) {
    return memo('url' + key, () => {
      const s = animal(key, 30, false);
      if (!s) { cache.delete('url' + key); return null; }
      try { return s.toDataURL(); } catch (e) { return null; }
    });
  }

  // ---------- Tiles (16x16) ----------
  function grassTile(pal, v) {
    return memo('g' + pal + v, () => pix(T, T, (x, y) => {
      for (let i = 0; i < 3; i++) {
        const tx = (hash(v, i, 1) * 12 + 1) | 0, ty = (hash(v, i, 2) * 12 + 2) | 0;
        if ((y === ty && (x === tx || x === tx + 2)) || (y === ty + 1 && x === tx + 1)) return pal[1];
        if (y === ty - 1 && x === tx + 1 && pal[2]) return pal[2];
      }
      return pal[0];
    }));
  }
  function tallTile(base, pal, v) {
    return memo('tall' + base + pal + v, () => {
      const c = canvas(T, T), g = c.getContext('2d'); g.drawImage(grassTile(base, v + 4), 0, 0);
      const blade = (bx, by) => {
        for (const [dx, h] of [[-2, 3], [0, 5], [2, 4]]) {
          g.fillStyle = pal[3]; g.fillRect(bx + dx, by - h, 1, h + 1);
          g.fillStyle = pal[0]; g.fillRect(bx + dx, by - h, 1, 1);
        }
        g.fillStyle = pal[2]; g.fillRect(bx - 3, by + 1, 7, 1);
      };
      blade(4, 6); blade(11, 7); blade(4, 14); blade(12, 14);
      return c;
    });
  }
  function flowerTile(base, petal, frame, v) {
    return memo('fl' + base + petal + frame + v, () => {
      const c = canvas(T, T), g = c.getContext('2d'); g.drawImage(grassTile(base, v), 0, 0);
      for (const [fx, fy] of [[4, 4], [11, 10]]) {
        const ox = frame ? 1 : 0;
        g.fillStyle = petal; g.fillRect(fx - 1 + ox, fy, 3, 1); g.fillRect(fx + ox, fy - 1, 1, 3);
        g.fillStyle = '#f8d020'; g.fillRect(fx + ox, fy, 1, 1);
        g.fillStyle = base[1]; g.fillRect(fx, fy + 2, 1, 2);
      }
      return c;
    });
  }
  function speckTile(base, specks, v) {
    return memo('sp' + base + specks + v, () => pix(T, T, (x, y) => {
      for (let i = 0; i < specks.length; i++) {
        const [cl, n] = specks[i];
        for (let j = 0; j < n; j++) if (x === ((hash(v, i * 10 + j, 3) * 15) | 0) && y === ((hash(v, i * 10 + j, 4) * 15) | 0)) return cl;
      }
      return base;
    }));
  }
  function duneTile(v) {
    return memo('dune' + v, () => pix(T, T, (x, y) => {
      const wave = Math.round(Math.sin((x + v * 5) * 0.4) * 1.5);
      if ((y + wave + 16) % 8 === 0) return '#d8b878';
      if ((y + wave + 16) % 8 === 1) return '#f8ecc0';
      return '#f0d898';
    }));
  }
  function driftTile(v) {
    return memo('drift' + v, () => pix(T, T, (x, y) => {
      const d = Math.hypot(x - 8 - (v % 2) * 2, (y - 9) * 1.6);
      if (d < 6) return y < 9 ? '#ffffff' : '#d0dcf0';
      if (d < 7) return '#c0cce8';
      return (x * 7 + y * 3 + v) % 23 === 0 ? '#ffffff' : '#e8f0fa';
    }));
  }
  function waterTile(frame, deep = '#3870d8', light = '#a8d8f8') {
    return memo('w' + frame + deep, () => pix(T, T, (x, y) => {
      if (y % 8 === 2 && ((x + frame * 2 + (y >> 3) * 6) % 12) < 3) return light;
      if (y % 8 === 6 && ((x + 16 - frame * 2 + 3) % 12) < 2) return light;
      return deep;
    }));
  }
  function iceTile(v) {
    return memo('ice' + v, () => pix(T, T, (x, y) => ((x - y + 32 + v * 3) % 13 === 0 && x > 2 && x < 13) ? '#f0fcff' : '#a8d8f0'));
  }

  // Ground palettes per region: [base, alt patch, tall-grass, flower petal, water deep, water light].
  const BIOME_TILES = {
    savanna:  { base: ['#d8c868', '#b0a040', '#e8e090'], alt: ['#c8b858', '#a09030', '#d8d080'], tall: ['#f0e8a0', '#c8b858', '#a09030', '#c8b048'], petal: '#f86858', water: ['#3870d8', '#a8d8f8'] },
    wetlands: { base: ['#78c058', '#58a040', '#98d878'], alt: ['#68a868', '#4a8a4a', '#88c088'], tall: ['#c8e880', '#68a848', '#2a6a30', '#48904a'], petal: '#f8f8f8', water: ['#3878b8', '#a0d0e8'] },
    jungle:   { base: ['#48a050', '#287838', '#68c060'], alt: ['#3a8a44', '#22682e', '#58a858'], tall: ['#a8e070', '#58a048', '#286830', '#40903c'], petal: '#f868a8', water: ['#2868b0', '#90c8f0'] },
    desert:   { base: ['#f0d898', '#d8b878', '#f8e8b8'], alt: ['#e8c888', '#c8a868', '#f0dca8'], petal: '#f868a8', water: ['#3880d0', '#b0e0f8'] },
    tundra:   { base: ['#eef4fc', '#c8d4ec', '#ffffff'], alt: ['#e0eaf6', '#c0cce4', '#f8fbff'], petal: '#a8d8f0', water: ['#4888c8', '#c0e8f8'] },
  };
  // kind: 0 base, 1 alt patch, 2 tall grass / dunes / drifts, 3 flowers / pebbles, 4 water, 5 ice, 6 dirt
  function tile(biome, kind, v, frame) {
    const P = BIOME_TILES[biome];
    switch (kind) {
      case 4: return waterTile(frame % 6, P.water[0], P.water[1]);
      case 5: return iceTile(v);
      case 6: return speckTile('#c8a070', [['#a88050', 5], ['#e0c090', 3]], v);
    }
    if (biome === 'desert') return kind === 2 ? duneTile(v) : kind === 3 ? speckTile(P.base[0], [['#a89070', 3], ['#c8b090', 3]], v) : speckTile(kind ? P.alt[0] : P.base[0], [[P.base[1], 4], [P.base[2], 3]], v);
    if (biome === 'tundra') return kind === 2 ? driftTile(v) : speckTile(kind === 1 ? P.alt[0] : P.base[0], [[P.base[1], 5], [P.base[2], 3]], v);
    if (kind === 2) return tallTile(P.base, P.tall, v);
    if (kind === 3) return flowerTile(P.base, P.petal, frame % 2, v);
    return grassTile(kind ? P.alt : P.base, v);
  }
  // A representative colour per tile kind, for the minimap.
  function tileColor(biome, kind) {
    const P = BIOME_TILES[biome];
    if (kind === 4) return P.water[0];
    if (kind === 5) return '#a8d8f0';
    if (kind === 6) return '#c8a070';
    return kind === 1 ? P.alt[0] : P.base[0];
  }

  // ---------- The low-res view buffer ----------
  // Renders at one buffer pixel per art pixel, then scales up by a whole number of device pixels.
  function makeView(cv) {
    const low = canvas(1, 1);
    const v = { canvas: cv, low, g: low.getContext('2d'), k: 2, w: 1, h: 1, W: 1, H: 1 };
    v.resize = (cssPerArt) => {
      const r = cv.parentElement.getBoundingClientRect();
      v.W = Math.max(1, r.width); v.H = Math.max(1, r.height);
      cv.width = Math.round(v.W * DPR); cv.height = Math.round(v.H * DPR);
      v.k = Math.max(1, Math.round(cssPerArt * DPR));
      v.w = Math.ceil(cv.width / v.k); v.h = Math.ceil(cv.height / v.k);
      low.width = v.w; low.height = v.h;
      v.g.imageSmoothingEnabled = false;
      v.css = v.k / DPR;   // CSS pixels per art pixel
    };
    v.present = (ctx) => {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(low, 0, 0, v.w * v.k, v.h * v.k);
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    };
    return v;
  }

  // ---------- Text & HUD panels (drawn at full resolution on top) ----------
  const FONT = '"Nunito", "Trebuchet MS", system-ui, sans-serif';
  const font = (size, weight = 600) => `${weight} ${Math.round(size)}px ${FONT}`;
  function text(ctx, str, x, y, o = {}) {
    const size = o.size || 14;
    ctx.font = font(size, o.weight || 600);
    ctx.textAlign = o.align || 'center';
    ctx.textBaseline = o.base || 'middle';
    if (o.outline !== null) {
      ctx.lineJoin = 'round';
      ctx.lineWidth = Math.max(3, size / 4);
      ctx.strokeStyle = o.outline || '#101018';
      ctx.strokeText(str, x, y);
    }
    ctx.fillStyle = o.color || '#ffffff';
    ctx.fillText(str, x, y);
  }
  // A dialog-box panel: dark navy with a white border, like the handheld Zelda text boxes.
  function panel(ctx, x, y, w, h, alpha = 0.9) {
    x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
    ctx.fillStyle = `rgba(16,22,56,${alpha})`;
    ctx.fillRect(x + 2, y, w - 4, h); ctx.fillRect(x, y + 2, w, h - 4); ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
    ctx.fillStyle = '#f4f0e0';
    ctx.fillRect(x + 3, y + 2, w - 6, 2); ctx.fillRect(x + 3, y + h - 4, w - 6, 2);
    ctx.fillRect(x + 2, y + 3, 2, h - 6); ctx.fillRect(x + w - 4, y + 3, 2, h - 6);
  }
  function wrap(ctx, str, maxW) {
    const words = String(str).split(' '), lines = [];
    let cur = '';
    for (const w of words) {
      const t = cur ? cur + ' ' + w : w;
      if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t;
    }
    if (cur) lines.push(cur);
    return lines;
  }
  // A centred dialog box with word-wrapped text; returns its height.
  function dialog(ctx, str, cx, y, maxW, size = 16, color = '#ffffff') {
    ctx.font = font(size);
    const lines = wrap(ctx, str, maxW - 28);
    const w = Math.min(maxW, Math.max(...lines.map((l) => ctx.measureText(l).width)) + 32), lh = size * 1.3, h = lines.length * lh + 18;
    panel(ctx, cx - w / 2, y, w, h);
    lines.forEach((l, i) => text(ctx, l, cx, y + 9 + lh * (i + 0.5), { size, color, outline: null }));
    return h;
  }
  // Draw a sprite on the full-resolution canvas, scaled up crisply.
  function blit(ctx, s, x, y, scale) {
    if (!s) return;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(s, Math.round(x), Math.round(y), s.width * scale, s.height * scale);
  }

  return {
    ART, T, hash, noise, fbm, col, shade, css, canvas, pix, rects, outline, flipH, memo,
    line, ellipse, ring, shadow, drawAt, drawShadow,
    roundTree, acacia, pine, palm, cactus, rock, bush, decor, LEAF,
    tent, flag, pump: PUMP, board, fencePost, barrier: BARRIER, resource, netSprite, anger: ANGER, heart, rupee: RUPEE, fuel: FUEL, arrow,
    person, KEEPER, visitorLook, house, jeep, truck, animal, animalURL,
    tile, tileColor, BIOME_TILES, waterTile, grassTile, speckTile,
    makeView, font, text, panel, wrap, dialog, blit,
  };
})();
