// Small shared helpers: math, emoji sprites, sound effects.

const rand = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
const fmtMoney = (n) => (n < 0 ? '-$' : '$') + Math.abs(Math.round(n)).toLocaleString();

// Plain-text label for a cost ({ money, res } or a number), e.g. "$20 + 10🌾".
function costLabel(cost) {
  if (typeof cost === 'number') return fmtMoney(cost);
  const parts = [];
  if (cost.money) parts.push(fmtMoney(cost.money));
  for (const [k, v] of Object.entries(cost.res || {})) parts.push(`${v}${RESOURCES[k].emoji}`);
  return parts.join(' + ');
}

function weightedPick(list, weightFn) {
  const total = list.reduce((s, x) => s + weightFn(x), 0);
  let r = Math.random() * total;
  for (const x of list) {
    r -= weightFn(x);
    if (r <= 0) return x;
  }
  return list[list.length - 1];
}

function angleDiff(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

const DPR = Math.min(window.devicePixelRatio || 1, 2);

// Animal artwork: Fluent Emoji 3D by Microsoft (MIT licence, see assets/animals/LICENSE.txt).
// Whenever an animal's emoji is drawn, its image is used instead once it has loaded.
const ASSET_VERSION = 28;
const ANIMAL_ART = {};         // species key -> { img, flip }
const ANIMAL_ART_BY_EMOJI = {}; // emoji -> the first species drawn with it (some rare species share an emoji)
for (const def of Object.values(SPECIES)) {
  const img = new Image();
  img.src = `assets/animals/${def.key}.png?v=${ASSET_VERSION}`;
  ANIMAL_ART[def.key] = { img, flip: def.key === 'zebra' };   // the zebra art faces right, the rest face left
  if (!ANIMAL_ART_BY_EMOJI[def.emoji]) ANIMAL_ART_BY_EMOJI[def.emoji] = ANIMAL_ART[def.key];
}
// Menus show the same pixel-art animals as the game once the artwork has loaded.
const animalImg = (key) => `<img class="animal-img" src="${(window.Pixel && Pixel.animalURL(key)) || `assets/animals/${key}.png?v=${ASSET_VERSION}`}" alt="">`;

// Emoji are pre-rendered to offscreen canvases (much faster than fillText every frame).
const _spriteCache = new Map();
const EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji","Twemoji Mozilla",sans-serif';
function getSprite(emoji, size, flip) {
  const px = Math.round(size * DPR);
  const key = emoji + '|' + px + '|' + (flip ? 1 : 0);
  let c = _spriteCache.get(key);
  if (c) return c;
  c = document.createElement('canvas');
  const pad = Math.ceil(px * 0.25);
  c.width = c.height = px + pad * 2;
  const g = c.getContext('2d');
  const art = ANIMAL_ART_BY_EMOJI[emoji];
  if (art) {
    if (!(art.img.complete && art.img.naturalWidth)) return getEmojiSprite(emoji, px, flip);  // not loaded yet: don't cache the fallback
    g.imageSmoothingQuality = 'high';
    if (flip !== art.flip) { g.translate(c.width, 0); g.scale(-1, 1); }
    const s = px * 1.12;
    g.drawImage(art.img, (c.width - s) / 2, (c.height - s) / 2, s, s);
    _spriteCache.set(key, c);
    return c;
  }
  g.font = `${px}px ${EMOJI_FONT}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  if (flip) { g.translate(c.width, 0); g.scale(-1, 1); }
  g.fillText(emoji, c.width / 2, c.height / 2 + px * 0.06);
  _spriteCache.set(key, c);
  return c;
}
function getEmojiSprite(emoji, px, flip) {
  const c = document.createElement('canvas');
  const pad = Math.ceil(px * 0.25);
  c.width = c.height = px + pad * 2;
  const g = c.getContext('2d');
  g.font = `${px}px ${EMOJI_FONT}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  if (flip) { g.translate(c.width, 0); g.scale(-1, 1); }
  g.fillText(emoji, c.width / 2, c.height / 2 + px * 0.06);
  return c;
}

function drawEmoji(ctx, emoji, x, y, size, flip = false, alpha = 1) {
  const s = getSprite(emoji, size, flip);
  const w = s.width / DPR;
  if (alpha !== 1) ctx.globalAlpha = alpha;
  ctx.drawImage(s, x - w / 2, y - w / 2, w, w);
  if (alpha !== 1) ctx.globalAlpha = 1;
}

// Tiny synth sound effects via WebAudio (no asset files needed).
const Sfx = {
  ctx: null,
  muted: false,
  ensure() {
    if (!this.ctx) {
      try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  },
  tone(freq, dur, type = 'square', vol = 0.05, slide = 0, delay = 0) {
    if (this.muted || !this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.linearRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.ctx.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  },
  shoot() { this.tone(420, 0.12, 'triangle', 0.07, -250); },
  hit() { this.tone(220, 0.1, 'square', 0.04, 80); },
  tangle() { this.tone(330, 0.08, 'square', 0.05); this.tone(440, 0.12, 'square', 0.05, 0, 0.08); },
  capture() { [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.12, 'triangle', 0.07, 0, i * 0.07)); },
  bump() { this.tone(90, 0.2, 'sawtooth', 0.08, -40); },
  cash() { [880, 1320].forEach((f, i) => this.tone(f, 0.1, 'square', 0.04, 0, i * 0.08)); },
  upgrade() { [660, 880, 1175].forEach((f, i) => this.tone(f, 0.1, 'triangle', 0.05, 0, 0.05 + i * 0.06)); },
  error() { this.tone(160, 0.15, 'square', 0.05, -40); },
  escape() { this.tone(300, 0.25, 'triangle', 0.05, -200); },
};
