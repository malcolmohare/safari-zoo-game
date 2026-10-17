// Pixel-art helpers (same style as Safari Zoo and Astro Blaster): sprites are built in code, outlined,
// lit from the top-left, and drawn into a small 320x180 buffer that is scaled up with crisp pixels.

const Pixel = (() => {
  const OUTLINE = '#10101c';
  const COLS = {};
  function col(h) {
    if (Array.isArray(h)) return h;
    let c = COLS[h];
    if (!c) c = COLS[h] = [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16), 255];
    return c;
  }
  const shade = (h, k) => { const c = col(h); return [Math.min(255, c[0] * k) | 0, Math.min(255, c[1] * k) | 0, Math.min(255, c[2] * k) | 0, 255]; };
  const hash = (x, y, s = 0) => {
    let h = (Math.imul(x * 7 + s * 131 | 0, 374761393) + Math.imul(y * 13 - s * 71 | 0, 668265263)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  };

  function canvas(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, w); c.height = Math.max(1, h); return c; }
  // Build a sprite pixel by pixel: fn(x, y) returns a colour or null.
  function pix(w, h, fn) {
    const c = canvas(w, h), g = c.getContext('2d'), d = g.createImageData(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const v = fn(x, y); if (!v) continue;
      const k = col(v), i = (y * w + x) * 4;
      d.data[i] = k[0]; d.data[i + 1] = k[1]; d.data[i + 2] = k[2]; d.data[i + 3] = k[3] ?? 255;
    }
    g.putImageData(d, 0, 0); return c;
  }
  // A 1px dark outline around every opaque pixel.
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
  // Sprite from an ASCII map. Letters map to colours; each colour is lit automatically:
  // brighter where the pixel above is empty, darker where the pixel below is empty.
  function fromMap(rows, pal, light = true) {
    const h = rows.length, w = rows[0].length;
    for (const r of rows) if (r.length !== w) throw new Error('ragged sprite map: ' + rows.join('|'));
    const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h) ? '.' : rows[y][x];
    return outline(pix(w, h, (x, y) => {
      const ch = at(x, y);
      if (ch === '.') return null;
      const c = pal[ch];
      if (!c) return null;
      if (!light || ch === ch.toUpperCase()) return c;   // capital letters are flat (eyes, lights)
      if (at(x, y - 1) === '.' || at(x - 1, y) === '.') return shade(c, 1.3);
      if (at(x, y + 1) === '.') return shade(c, 0.7);
      return c;
    }));
  }
  function flipH(src) { const c = canvas(src.width, src.height), g = c.getContext('2d'); g.translate(src.width, 0); g.scale(-1, 1); g.drawImage(src, 0, 0); return c; }
  const cache = new Map();
  function memo(key, make) { let s = cache.get(key); if (s === undefined) { s = make(); cache.set(key, s); } return s; }

  // ---------- 3x5 bitmap font ----------
  const FONT = {
    A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110', E: '111100110100111', F: '111100110100100',
    G: '011100101101011', H: '101101111101101', I: '111010010010111', J: '001001001101010', K: '101101110101101', L: '100100100100111',
    M: '101111111101101', N: '110101101101101', O: '010101101101010', P: '110101110100100', Q: '010101101110011', R: '110101110101101',
    S: '011100010001110', T: '111010010010010', U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101',
    Y: '101101010010010', Z: '111001010100111', 0: '111101101101111', 1: '010110010010111', 2: '110001010100111', 3: '110001010001110',
    4: '101101111001001', 5: '111100110001110', 6: '011100111101111', 7: '111001010010010', 8: '111101111101111', 9: '111101111001110',
    '!': '010010010000010', '.': '000000000000010', ',': '000000000010100', ':': '000010000010000', "'": '010010000000000',
    '-': '000000111000000', '/': '001001010100100', '?': '110001010000010', '+': '000010111010000', 'x': '000101010101000',
    '(': '010100100100010', ')': '010001001001010', '>': '100010001010100', '<': '001010100010001', '=': '000111000111000', '%': '101001010100101', '$': '011110010011110', '#': '101111101111101', '*': '000101010101000',
  };
  const textW = (str, s = 1) => Math.max(0, String(str).length * 4 * s - s);
  // Draw text with a drop shadow. align: 'left' | 'center' | 'right'.
  function text(g, str, x, y, color = '#ffffff', s = 1, align = 'left', shadowCol = '#10101c') {
    str = String(str);
    if (align === 'center') x -= textW(str, s) / 2;
    else if (align === 'right') x -= textW(str, s);
    x = Math.round(x); y = Math.round(y);
    for (const pass of shadowCol ? [1, 0] : [0]) {
      g.fillStyle = pass ? shadowCol : color;
      let cx = x;
      for (const ch of str) {
        const glyph = FONT[ch] || FONT[ch.toUpperCase()];
        if (glyph) for (let i = 0; i < 15; i++) if (glyph[i] === '1') g.fillRect(cx + (i % 3) * s + pass * s, y + ((i / 3) | 0) * s + pass * s, s, s);
        cx += 4 * s;
      }
    }
  }
  // A dialog-box panel: dark navy with a light border.
  function panel(g, x, y, w, h) {
    x = Math.round(x); y = Math.round(y);
    g.fillStyle = '#f4f0e0'; g.fillRect(x + 1, y, w - 2, h); g.fillRect(x, y + 1, w, h - 2);
    g.fillStyle = '#101638'; g.fillRect(x + 1, y + 1, w - 2, h - 2);
    g.fillStyle = '#f4f0e0'; g.fillRect(x + 2, y + 2, w - 4, 1); g.fillRect(x + 2, y + h - 3, w - 4, 1); g.fillRect(x + 2, y + 2, 1, h - 4); g.fillRect(x + w - 3, y + 2, 1, h - 4);
    g.fillStyle = '#101638'; g.fillRect(x + 3, y + 3, w - 6, h - 6);
  }

  return { col, shade, hash, canvas, pix, outline, fromMap, flipH, memo, text, textW, panel };
})();
