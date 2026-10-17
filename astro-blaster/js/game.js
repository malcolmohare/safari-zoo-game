// Astro Blaster: a side-scrolling shooter. Move up and down, hold fire, survive the waves,
// beat the boss, and loop around harder each time.

const W = 320, H = 180;           // the game is drawn at this size and scaled up
const PLAYER_X = 34;
const HI_KEY = 'astro-blaster-hi';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const buf = Pixel.canvas(W, H), g = buf.getContext('2d');
let scale = 1, offX = 0, offY = 0, dpr = 1;

const rand = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const pick = (weights) => {
  const entries = Object.entries(weights).filter(([, w]) => w > 0);
  let r = Math.random() * entries.reduce((s, [, w]) => s + w, 0);
  for (const [k, w] of entries) { r -= w; if (r <= 0) return k; }
  return entries[entries.length - 1][0];
};

// ---------------- Sound ----------------
const Sfx = {
  ctx: null, muted: localStorage.getItem('astro-blaster-muted') === '1',
  ensure() {
    if (!this.ctx) { try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; } }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  },
  tone(freq, dur, type = 'square', vol = 0.04, slide = 0, delay = 0) {
    if (this.muted || !this.ctx) return;
    const t = this.ctx.currentTime + delay, o = this.ctx.createOscillator(), gn = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.linearRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    gn.gain.setValueAtTime(vol, t); gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(gn).connect(this.ctx.destination); o.start(t); o.stop(t + dur + 0.02);
  },
  shoot(tier = 0) { this.tone(880 - (tier % 5) * 110, 0.05, tier % 2 ? 'sawtooth' : 'square', 0.015, -300); },
  hit() { this.tone(220, 0.05, 'square', 0.02, 60); },
  boom() { this.tone(120, 0.25, 'sawtooth', 0.05, -80); this.tone(60, 0.3, 'square', 0.03, -20); },
  bigBoom() { this.tone(90, 0.6, 'sawtooth', 0.07, -60); this.tone(45, 0.8, 'square', 0.05, -15, 0.05); },
  power() { [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.09, 'triangle', 0.05, 0, i * 0.06)); },
  hurt() { this.tone(300, 0.4, 'sawtooth', 0.06, -260); },
  warn() { for (let i = 0; i < 3; i++) { this.tone(440, 0.2, 'square', 0.04, 0, i * 0.45); this.tone(330, 0.2, 'square', 0.04, 0, i * 0.45 + 0.22); } },
  eshot() { this.tone(330, 0.06, 'triangle', 0.02, -120); },
  tink() { this.tone(1500, 0.03, 'square', 0.012, 200); },
  levelUp() { [392, 523, 659, 784, 1046, 1318].forEach((f, i) => this.tone(f, 0.12, 'square', 0.04, 0, i * 0.07)); },
  charge(dur) { this.tone(160, dur, 'sawtooth', 0.03, 700); },
  laser() { this.tone(110, 0.7, 'sawtooth', 0.06, -40); this.tone(220, 0.7, 'square', 0.02, -60); },
};

// ---------------- Input ----------------
const keys = new Set(), pressed = new Set();
const input = { touchFire: false, mouseFire: false, dragDy: 0 };
window.addEventListener('keydown', (e) => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  if (!e.repeat) pressed.add(e.code);
  keys.add(e.code);
  Sfx.ensure();
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => { keys.clear(); input.mouseFire = false; input.touchFire = false; });
canvas.addEventListener('mousedown', (e) => { if (e.button === 0) { input.mouseFire = true; pressed.add('Click'); Sfx.ensure(); } });
window.addEventListener('mouseup', () => { input.mouseFire = false; });

// Touch: drag anywhere on the screen to move the ship; hold the fire button to shoot.
const isTouch = (window.matchMedia && matchMedia('(pointer: coarse)').matches) || 'ontouchstart' in window;
if (isTouch) document.body.classList.add('touch');
const drag = { id: null, y: 0 };
canvas.addEventListener('touchstart', (e) => {
  e.preventDefault(); Sfx.ensure();
  for (const t of e.changedTouches) if (drag.id === null) { drag.id = t.identifier; drag.y = t.clientY; }
  pressed.add('Tap');
}, { passive: false });
canvas.addEventListener('touchmove', (e) => {
  e.preventDefault();
  for (const t of e.changedTouches) if (t.identifier === drag.id) { input.dragDy += (t.clientY - drag.y) * dpr / scale * 1.4; drag.y = t.clientY; }
}, { passive: false });
const endTouch = (e) => { for (const t of e.changedTouches) if (t.identifier === drag.id) drag.id = null; };
canvas.addEventListener('touchend', endTouch); canvas.addEventListener('touchcancel', endTouch);
const fireBtn = document.getElementById('fire');
const setFire = (on) => (e) => { e.preventDefault(); Sfx.ensure(); input.touchFire = on; fireBtn.classList.toggle('down', on); if (on) pressed.add('Tap'); };
fireBtn.addEventListener('touchstart', setFire(true), { passive: false });
fireBtn.addEventListener('touchend', setFire(false)); fireBtn.addEventListener('touchcancel', setFire(false));

const down = (...c) => c.some((k) => keys.has(k));
const firing = () => down('Space', 'KeyJ', 'KeyZ') || input.mouseFire || input.touchFire;
const anyStart = () => pressed.has('Space') || pressed.has('Enter') || pressed.has('KeyJ') || pressed.has('KeyZ') || pressed.has('Click') || pressed.has('Tap');

// ---------------- Game state ----------------
let G = null;
let hi = Number(localStorage.getItem(HI_KEY)) || 0;
let mode = 'title', modeT = 0;

function newGame() {
  G = {
    t: 0, score: 0, lives: 3, loop: 0, stageT: 0, stageKills: 0,
    killsSinceDrop: 0, nextDrop: randInt(20, 30),
    weapon: 1, tier: 0, rapid: 0, shield: false, invuln: 2, dead: 0,
    py: H / 2, fireT: 0,
    bullets: [], enemies: [], ebullets: [], powerups: [], particles: [], floats: [], queue: [],
    boss: null, bossState: 'none', warnT: 0, banner: null,
    spawnT: 1.5, flash: 0, shake: 0, newHi: false,
  };
  mode = 'play'; modeT = 0;
  Analytics.track('game_start', { hi });
}

// Difficulty climbs through each stage and jumps each time you loop past the boss.
const diff = () => 1 + G.stageT / 35 + G.loop * 1.6;
const speedMult = () => Math.min(2.4, 1 + (diff() - 1) * 0.11);
const bossKills = () => 45 + G.loop * 10;

const TYPES = {
  drone:   { hp: 1, pts: 100, speed: 55, w: 11, h: 8 },
  waver:   { hp: 1, pts: 150, speed: 48, w: 8, h: 8 },
  diver:   { hp: 2, pts: 200, speed: 70, w: 12, h: 7 },
  shooter: { hp: 3, pts: 300, speed: 40, w: 12, h: 8 },
  brute:   { hp: 10, pts: 600, speed: 18, w: 18, h: 13 },
};

// Weapon tiers: power-ups add guns up to 5-way; one more resets to a single gun of the next
// tier ("MK 2", "MK 3"... forever). Each tier hits harder (1 + tier damage per shot) and looks
// different: the shot shape cycles through SHOT_SHAPES and the colour through SHOT_COLS, and
// shots grow a little every full cycle of shapes.
const MAX_GUNS = 5;
const shotDamage = (tier) => 1 + tier;
const SHOT_SHAPES = [
  { name: 'bolt', r: 2, speed: 300 },
  { name: 'laser', r: 2, speed: 380 },
  { name: 'orb', r: 3, speed: 280 },
  { name: 'chevron', r: 3, speed: 320 },
  { name: 'helix', r: 3, speed: 300 },
];
const SHOT_COLS = [['#f8c040', '#ffffff'], ['#40d8f8', '#e0faff'], ['#f858d8', '#ffe0f8'], ['#68f858', '#f0ffe0'], ['#f86040', '#fff0c0'], ['#a878f8', '#f0e8ff']];
const shotCol = (tier) => SHOT_COLS[tier % SHOT_COLS.length];
const shotGrow = (tier) => Math.min(2, Math.floor(tier / SHOT_SHAPES.length));

function spawnEnemy(type, y, extra = {}) {
  const T = TYPES[type];
  const hp = Math.ceil(T.hp * (1 + G.loop * 0.4));
  G.enemies.push({
    type, x: W + 12, y, baseY: y, hp, maxHp: hp, t: 0, phase: rand(0, 6), hitT: 0,
    fireT: rand(0.8, 1.6), stopX: rand(200, 270), stay: rand(4, 7), state: 'in', ...extra,
  });
}

function spawnWave() {
  const d = diff();
  // Sometimes a formation instead of a single alien
  if (Math.random() < 0.18) {
    const kind = pick({ snake: 3, vee: d > 1.5 ? 2 : 0, wall: d > 2.5 ? 1 : 0 });
    const y = rand(30, H - 30);
    if (kind === 'snake') for (let i = 0; i < 5; i++) G.queue.push({ t: i * 0.28, fn: () => spawnEnemy('waver', y, { phase: 0 }) });
    else if (kind === 'vee') for (let i = 0; i < 5; i++) G.queue.push({ t: Math.abs(i - 2) * 0.25, fn: () => spawnEnemy('drone', clamp(y + (i - 2) * 16, 14, H - 14)) });
    else for (let i = 0; i < 6; i++) G.queue.push({ t: 0, fn: () => spawnEnemy('drone', 20 + i * (H - 40) / 5) });
    return;
  }
  const type = pick({ drone: 10, waver: 6, diver: d > 1.6 ? 5 : 0, shooter: d > 2.2 ? 4 : 0, brute: d > 3 ? 1.5 + d * 0.2 : 0 });
  spawnEnemy(type, rand(16, H - 16));
}

function fireEnemyBullet(x, y, ang, speed, big = false) {
  G.ebullets.push({ x, y, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, big, t: 0 });
}
const aimAt = (x, y) => Math.atan2(G.py - y, PLAYER_X - x);

// ---------------- Effects ----------------
function explode(x, y, n = 14, colors = ['#f8f8f8', '#f8e040', '#f89838', '#e84848']) {
  for (let i = 0; i < n; i++) {
    const a = rand(0, Math.PI * 2), s = rand(20, 110);
    G.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, t: 0, life: rand(0.25, 0.7), color: colors[randInt(0, colors.length - 1)], size: randInt(1, 2) });
  }
  G.particles.push({ x, y, ring: true, t: 0, life: 0.35, r: n / 3 });
}
function floatText(x, y, text, color = '#ffffff') { G.floats.push({ x, y, text, color, t: 0 }); }
function addScore(n) {
  G.score += n;
  if (G.score > hi) { hi = G.score; G.newHi = true; }
}

// ---------------- Update ----------------
function update(dt) {
  modeT += dt;
  if (mode === 'title') { if (anyStart()) newGame(); return; }
  if (mode === 'over') { if (modeT > 1.2 && anyStart()) newGame(); return; }
  if (pressed.has('Escape') || pressed.has('KeyP')) mode = mode === 'paused' ? 'play' : 'paused';
  if (mode === 'paused') return;

  G.t += dt;
  G.flash = Math.max(0, G.flash - dt * 3);
  G.shake = Math.max(0, G.shake - dt * 20);
  if (G.banner) { G.banner.t -= dt; if (G.banner.t <= 0) G.banner = null; }

  // Player
  if (G.dead > 0) {
    G.dead -= dt;
    if (G.dead <= 0) { G.py = H / 2; G.invuln = 2.5; }
  } else {
    const sp = 125;
    let dy = 0;
    if (down('KeyW', 'ArrowUp')) dy -= 1;
    if (down('KeyS', 'ArrowDown')) dy += 1;
    G.py = clamp(G.py + dy * sp * dt + input.dragDy, 8, H - 8);
    G.invuln = Math.max(0, G.invuln - dt);
    G.fireT -= dt;
    if (firing() && G.fireT <= 0) {
      G.fireT = 0.17 * Math.pow(0.74, G.rapid);
      const shots = [[[0, 0]], [[0, -3], [0, 3]], [[0, 0], [-0.12, 0], [0.12, 0]], [[0, -3], [0, 3], [-0.16, 0], [0.16, 0]], [[0, 0], [-0.1, -2], [0.1, 2], [-0.22, 0], [0.22, 0]]][G.weapon - 1];
      const tier = G.tier, shape = SHOT_SHAPES[tier % SHOT_SHAPES.length], r = shape.r + shotGrow(tier);
      for (const [a, oy] of shots) G.bullets.push({ x: PLAYER_X + 12, y: G.py + oy, vx: Math.cos(a) * shape.speed, vy: Math.sin(a) * shape.speed, tier, r, dmg: shotDamage(tier), t: rand(0, 1) });
      Sfx.shoot(tier);
    }
  }
  input.dragDy = 0;

  // Spawning (paused while a boss is coming or being fought)
  for (const q of G.queue) { q.t -= dt; if (q.t <= 0) { q.fn(); q.done = true; } }
  G.queue = G.queue.filter((q) => !q.done);
  if (G.bossState === 'none') {
    G.stageT += dt;
    G.spawnT -= dt;
    if (G.spawnT <= 0) {
      G.spawnT = Math.max(0.28, 1.5 / (0.55 + 0.45 * diff())) * rand(0.7, 1.3);
      spawnWave();
    }
    if (G.stageKills >= bossKills()) {
      G.bossState = 'warning'; G.warnT = 3.2; G.queue = [];
      Sfx.warn();
    }
  } else if (G.bossState === 'warning') {
    G.warnT -= dt;
    if (G.warnT <= 0 && G.enemies.length === 0) spawnBoss();
  }

  updateEnemies(dt);
  if (G.boss) updateBoss(dt);

  // Player bullets
  const bossBoxes = G.boss && G.boss.state !== 'dying' ? G.boss.def.boxes(G.boss) : [];
  for (const b of G.bullets) {
    b.t += dt; b.x += b.vx * dt; b.y += b.vy * dt;
    if (b.x > W + 8 || b.y < -8 || b.y > H + 8) { b.dead = true; continue; }
    for (const e of G.enemies) {
      const T = TYPES[e.type];
      if (!e.dead && Math.abs(b.x - e.x) < T.w / 2 + 3 && Math.abs(b.y - e.y) < T.h / 2 + b.r) { b.dead = true; damageEnemy(e, b.dmg); break; }
    }
    if (b.dead || !G.boss || G.boss.state === 'dying') continue;
    for (const box of bossBoxes) {
      if (box.ref && box.ref.dead) continue;
      if (Math.abs(b.x - box.x) < box.w / 2 + 2 && Math.abs(b.y - box.y) < box.h / 2 + b.r) { b.dead = true; hitBoss(box, b.dmg, b.x, b.y); break; }
    }
  }
  G.bullets = G.bullets.filter((b) => !b.dead);

  // Enemy bullets
  for (const b of G.ebullets) {
    b.t += dt; b.x += b.vx * dt; b.y += b.vy * dt;
    if (b.x < -8 || b.x > W + 8 || b.y < -8 || b.y > H + 8) b.dead = true;
    else if (playerHits(b.x, b.y, b.big ? 3 : 2)) { b.dead = true; hurtPlayer(); }
  }
  G.ebullets = G.ebullets.filter((b) => !b.dead);

  // Power-ups
  for (const p of G.powerups) {
    p.t += dt; p.x -= 22 * dt; p.y += Math.sin(p.t * 3) * 12 * dt;
    if (p.x < -10) p.dead = true;
    else if (G.dead <= 0 && Math.abs(p.x - PLAYER_X - 2) < 12 && Math.abs(p.y - G.py) < 10) { p.dead = true; collect(p.type); }
  }
  G.powerups = G.powerups.filter((p) => !p.dead);

  for (const p of G.particles) { p.t += dt; if (!p.ring) { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.94; p.vy *= 0.94; } }
  G.particles = G.particles.filter((p) => p.t < p.life);
  for (const f of G.floats) { f.t += dt; f.y -= 14 * dt; }
  G.floats = G.floats.filter((f) => f.t < 1.2);
}

function playerHits(x, y, r) {
  return G.dead <= 0 && G.invuln <= 0 && Math.abs(x - (PLAYER_X + 2)) < 6 + r && Math.abs(y - G.py) < 3 + r;
}

function hurtPlayer() {
  if (G.dead > 0 || G.invuln > 0) return;
  if (G.shield) {
    G.shield = false; G.invuln = 1.2; G.flash = 0.4;
    explode(PLAYER_X + 4, G.py, 10, ['#80f8a0', '#f8f8f8']);
    floatText(PLAYER_X, G.py - 10, 'SHIELD BROKEN', '#80f8a0');
    Sfx.hit();
    return;
  }
  explode(PLAYER_X + 4, G.py, 26);
  Sfx.hurt(); Sfx.boom();
  G.shake = 6; G.flash = 0.6;
  G.lives--;
  // lose one weapon level, dropping back a tier if you were on a single gun
  if (G.weapon > 1) G.weapon--;
  else if (G.tier > 0) { G.tier--; G.weapon = MAX_GUNS; }
  G.rapid = 0;
  G.ebullets = [];
  if (G.lives <= 0) {
    G.dead = 99;
    setTimeout(() => gameOver(), 1200);
  } else G.dead = 1.4;
}

function gameOver() {
  if (mode !== 'play' && mode !== 'paused') return;
  mode = 'over'; modeT = 0;
  localStorage.setItem(HI_KEY, String(hi));
  Analytics.track('game_over', { score: G.score, loop: G.loop, kills_this_stage: G.stageKills, weapon_tier: G.tier + 1 });
}

function damageEnemy(e, n) {
  if (e.dead) return;
  e.hp -= n; e.hitT = 0.06;
  if (e.hp > 0) { Sfx.hit(); return; }
  e.dead = true;
  const pts = Math.round(TYPES[e.type].pts * (1 + G.loop * 0.5));
  addScore(pts);
  explode(e.x, e.y, e.type === 'brute' ? 26 : 12);
  if (e.type === 'brute') { G.shake = 3; floatText(e.x, e.y - 8, String(pts), '#f8e040'); }
  Sfx.boom();
  if (e.minion) return;
  G.stageKills++;
  // A power-up drops every 20 to 30 kills.
  if (++G.killsSinceDrop >= G.nextDrop) {
    G.killsSinceDrop = 0; G.nextDrop = randInt(20, 30);
    dropPowerup(e.x, e.y);
  }
}

function dropPowerup(x, y, type) {
  type = type || pick({ P: 30, R: G.rapid < 3 ? 22 : 4, S: G.shield ? 6 : 20, B: 14, L: G.lives < 5 ? 9 : 0 });
  G.powerups.push({ x: Math.min(x, W - 20), y: clamp(y, 12, H - 12), type, t: 0 });
}

function collect(type) {
  Sfx.power();
  if (type === 'P' && G.weapon >= MAX_GUNS) {
    // Tier up: back to one gun, but a stronger shot with a new look.
    G.tier++; G.weapon = 1; G.flash = 0.5;
    Sfx.levelUp();
    floatText(PLAYER_X + 30, G.py - 10, `WEAPON MK ${G.tier + 1}!`, shotCol(G.tier)[0]);
    explode(PLAYER_X + 8, G.py, 18, shotCol(G.tier));
    Analytics.track('weapon_tier', { tier: G.tier + 1, loop: G.loop });
    return;
  }
  floatText(PLAYER_X + 6, G.py - 10, Sprites.POWER[type].name, Sprites.POWER[type].color);
  switch (type) {
    case 'P': G.weapon++; break;
    case 'R': if (G.rapid < 3) G.rapid++; else addScore(1000); break;
    case 'S': G.shield = true; break;
    case 'L': G.lives++; break;
    case 'B':
      G.flash = 1; G.shake = 5; Sfx.bigBoom();
      for (const e of G.enemies) damageEnemy(e, 999);
      G.ebullets = [];
      bombBoss();
      break;
  }
}

function updateEnemies(dt) {
  const sm = speedMult(), d = diff();
  for (const e of G.enemies) {
    const T = TYPES[e.type];
    e.t += dt; e.hitT -= dt;
    switch (e.type) {
      case 'drone':
        e.x -= T.speed * sm * dt * (e.minion ? 1.3 : 1);
        e.y = e.baseY + Math.sin(e.t * 2 + e.phase) * 6;
        break;
      case 'waver':
        e.x -= T.speed * sm * dt;
        e.y = clamp(e.baseY + Math.sin(e.t * 2.6 + e.phase) * 34, 8, H - 8);
        break;
      case 'diver':
        if (e.state === 'in') {
          e.x -= T.speed * sm * dt;
          if (e.x < 250) { e.state = 'dash'; e.vy = clamp((G.py - e.y) * 1.2, -90, 90); }
        } else { e.x -= T.speed * 2.4 * sm * dt; e.y = clamp(e.y + e.vy * dt, 6, H - 6); }
        break;
      case 'shooter':
        if (e.state === 'in') { e.x -= T.speed * sm * dt; if (e.x <= e.stopX) e.state = 'hold'; }
        else if (e.state === 'hold') {
          e.y = e.baseY + Math.sin(e.t * 1.5) * 10;
          e.stay -= dt;
          e.fireT -= dt;
          if (e.fireT <= 0) { e.fireT = Math.max(0.55, 1.8 - d * 0.18); fireEnemyBullet(e.x - 6, e.y, aimAt(e.x, e.y), 70 + d * 8); Sfx.eshot(); }
          if (e.stay <= 0) e.state = 'out';
        } else e.x -= T.speed * 2 * sm * dt;
        break;
      case 'brute':
        e.x -= T.speed * sm * dt;
        e.y = e.baseY + Math.sin(e.t * 0.8) * 12;
        e.fireT -= dt;
        if (e.fireT <= 0 && e.x < W - 10) {
          e.fireT = Math.max(1.1, 2.8 - d * 0.2);
          for (const a of [-0.3, 0, 0.3]) fireEnemyBullet(e.x - 10, e.y, Math.PI + a, 60 + d * 6, true);
          Sfx.eshot();
        }
        break;
    }
    if (e.x < -24) e.dead = true;
    // Ramming the ship hurts you and the alien
    if (!e.dead && playerHits(e.x, e.y, Math.max(T.w, T.h) / 2 - 1)) { hurtPlayer(); damageEnemy(e, 3); }
  }
  G.enemies = G.enemies.filter((e) => !e.dead);
}

// ---------------- Bosses ----------------
// A different boss guards each loop, in BOSS_ORDER; after a full cycle they come back as MK 2, MK 3...
// Each boss lists its hit boxes every frame: 'core' boxes take boss damage, 'armor' boxes block
// shots, and 'seg' boxes are body parts with their own HP. A box with a `ref` (a twin ship)
// takes damage on that part as well as the shared health bar.
const BOSS_ORDER = ['mothership', 'serpent', 'watcher', 'twins'];
const bossKind = () => BOSS_ORDER[G.loop % BOSS_ORDER.length];
const bossMark = () => Math.floor(G.loop / BOSS_ORDER.length) + 1;

// Glide in from the right and ease to a stop at tx.
function glideIn(B, tx, dt) {
  B.x -= Math.max(8, Math.min(40, (B.x - tx) * 1.2)) * dt;
  if (B.x <= tx + 0.5) { B.x = tx; B.state = 'fight'; }
}
const nextAttack = (B, list) => list[B.attack++ % list.length];

const BOSSES = {
  // Bobs up and down firing fans, aimed bursts, spirals, and launching drones.
  mothership: {
    name: 'MOTHERSHIP', warn: 'A HUGE ALIEN SHIP IS APPROACHING', hp: 140,
    init(B) { B.y = H / 2 - 4; B.ph = 0; B.amp = 0; },
    update(B, dt, L, enraged) {
      if (B.state === 'enter') return glideIn(B, 252, dt);
      // The phase accumulates (so speeding up never jumps), the swing eases in after the
      // entrance, and the ship can only move so fast, so it never teleports.
      B.ph += dt * 0.8 * (1 + L * 0.15) * (enraged ? 1.4 : 1);
      B.amp = Math.min(52, B.amp + 26 * dt);
      const ty = H / 2 - 4 + Math.sin(B.ph) * B.amp;
      B.y += clamp(ty - B.y, -70 * dt, 70 * dt);
      if ((B.attackT -= dt) > 0) return;
      const attacks = ['fan', 'aimed', 'minions', 'aimed'];
      if (L >= 1 || enraged) attacks.push('spiral');
      const a = nextAttack(B, attacks);
      B.attackT = Math.max(0.9, 2.4 - L * 0.25) * (enraged ? 0.7 : 1);
      const gx = () => B.x - 32, gy = () => B.y + 4;
      const spd = 72 + L * 12;
      if (a === 'fan') {
        const n = 7 + L * 2;
        for (let i = 0; i < n; i++) fireEnemyBullet(gx(), gy(), Math.PI - 0.75 + (1.5 * i) / (n - 1), spd, true);
        Sfx.eshot();
      } else if (a === 'aimed') {
        for (let i = 0; i < 3 + L; i++) B.queue.push({ t: i * 0.13, fn: () => { fireEnemyBullet(gx(), gy(), aimAt(gx(), gy()), spd * 1.3); Sfx.eshot(); } });
      } else if (a === 'minions') {
        for (let i = -1; i <= 1; i++) spawnEnemy('drone', clamp(B.y + i * 20, 12, H - 12), { x: B.x - 20, minion: true, hp: 1 });
      } else {
        for (let i = 0; i < 20 + L * 4; i++) B.queue.push({ t: i * 0.06, fn: () => fireEnemyBullet(B.x - 4, B.y + 4, Math.PI * 0.5 + i * 0.42, spd * 0.9) });
      }
    },
    boxes: (B) => [{ x: B.x, y: B.y + 4, w: 64, h: 28 }, { x: B.x + 12, y: B.y + 4, w: 40, h: 44 }],
    draw(B) { drawSprite(Sprites.boss(bossMark() - 1, Math.floor(B.t * 4) % 2), B.x, B.y, B.hitT > 0); },
  },

  // Weaves around the right half of the screen. Only the head takes damage; the armoured body
  // segments soak up shots (they can be shot off) and fire back.
  serpent: {
    name: 'SPACE SERPENT', warn: 'SOMETHING LONG IS SLITHERING CLOSER', hp: 110,
    init(B, L) {
      B.ph = 0; B.ox = 240; B.mouthT = 0; B.flip = false;
      const n = 9 + Math.min(6, L), hp = Math.round(6 * (1 + L * 0.5));
      B.segs = [];
      for (let i = 0; i < n; i++) B.segs.push({ hp, hitT: 0, dead: false, x: W + 40, y: H / 2 });
      B.attackT = 2.5;
    },
    path: (B, ph) => [205 + Math.sin(ph * 0.9) * 75 + B.ox, H / 2 + Math.sin(ph * 1.7) * 60],
    update(B, dt, L, enraged) {
      if (B.state === 'enter') { B.ox = Math.max(0, B.ox - 70 * dt); if (B.ox === 0) B.state = 'fight'; }
      B.ph += dt * (0.75 + L * 0.06) * (enraged ? 1.35 : 1);
      const [hx, hy] = this.path(B, B.ph);
      if (Math.abs(hx - B.x) > 0.01) B.flip = hx > B.x;   // face the way it's swimming
      B.x = hx; B.y = hy;
      B.segs.forEach((s, i) => { [s.x, s.y] = this.path(B, B.ph - (i + 1) * 0.11); });
      B.mouthT -= dt;
      if (B.state === 'enter' || (B.attackT -= dt) > 0) return;
      const a = nextAttack(B, ['spit', 'scales', 'spit', 'ring']);
      B.attackT = Math.max(1, 2.3 - L * 0.2) * (enraged ? 0.75 : 1);
      const spd = 70 + L * 10, mx = B.x + (B.flip ? 10 : -10), my = B.y + 2;
      if (a === 'spit') {
        const aim = aimAt(mx, my), n = 1 + Math.min(2, Math.ceil(L / 2));
        for (let i = -n; i <= n; i++) fireEnemyBullet(mx, my, aim + i * 0.18, spd, true);
        B.mouthT = 0.4; Sfx.eshot();
      } else if (a === 'scales') {
        B.segs.forEach((s, i) => B.queue.push({ t: i * 0.07, fn: () => { if (!s.dead) { fireEnemyBullet(s.x, s.y, aimAt(s.x, s.y), spd * 0.75); Sfx.eshot(); } } }));
      } else {
        const n = 10 + L * 2, off = rand(0, 1);
        for (let i = 0; i < n; i++) fireEnemyBullet(mx, my, (i + off) / n * Math.PI * 2, spd * 0.8);
        B.mouthT = 0.5; Sfx.eshot();
      }
    },
    boxes(B, all) {
      const out = [{ x: B.x, y: B.y, w: 18, h: 12 }];
      for (const s of B.segs) if (all || !s.dead) out.push({ x: s.x, y: s.y, w: 11, h: 11, kind: 'seg', ref: s });
      return out;
    },
    draw(B) {
      const mark = bossMark() - 1;
      for (let i = B.segs.length - 1; i >= 0; i--) {
        const s = B.segs[i];
        if (!s.dead) drawSprite(Sprites.serpentSeg(mark, i === B.segs.length - 1), s.x, s.y, s.hitT > 0);
      }
      drawSprite(Sprites.serpentHead(mark, B.mouthT > 0 ? 1 : 0, B.flip), B.x, B.y, B.hitT > 0);
    },
  },

  // A giant eye that follows you up and down. It charges a screen-wide laser along its line of
  // sight (dodge out of the red line), then blinks shut: while shut it's armoured and fires rings.
  watcher: {
    name: 'THE WATCHER', warn: 'YOU ARE BEING WATCHED', hp: 150,
    init(B) { B.open = 1; B.shut = false; B.lidT = 4.5; B.beam = null; },
    update(B, dt, L, enraged) {
      if (B.state === 'enter') return glideIn(B, 264, dt);
      const spd = 70 + L * 10;
      B.open = clamp(B.open + (B.shut ? -6 : 6) * dt, 0, 1);
      // blink: shut for a while (armoured, firing rings), then open again
      if ((B.lidT -= dt) <= 0 && !B.beam) {
        B.shut = !B.shut;
        B.lidT = B.shut ? 2.4 : 4.2 - Math.min(1.2, L * 0.15);
        if (B.shut) for (const [t, off] of [[0.3, 0], [1.3, 0.5]]) B.queue.push({ t, fn: () => {
          const n = 14 + L * 2;
          for (let i = 0; i < n; i++) fireEnemyBullet(B.x - 4, B.y, (i + off) / n * Math.PI * 2, spd * 0.7, true);
          Sfx.eshot();
        } });
        else B.attackT = 0.6;
      }
      // follow the player, except while the laser is locked on
      if (!B.beam) {
        const v = (24 + L * 6) * (enraged ? 1.5 : 1) * (B.shut ? 1.4 : 1);
        B.y = clamp(B.y + clamp(G.py - B.y, -v * dt, v * dt), 26, H - 26);
      } else {
        const bm = B.beam;
        bm.t += dt;
        if (!bm.fired && bm.t >= bm.warn) { bm.fired = true; Sfx.laser(); G.shake = 3; }
        if (bm.t >= bm.warn + bm.dur) B.beam = null;
        else if (bm.fired && Math.abs(G.py - bm.y) < 6) hurtPlayer();
      }
      if (B.shut || B.beam || (B.attackT -= dt) > 0) return;
      const a = nextAttack(B, ['beam', 'tears', 'beam', enraged ? 'tears' : 'minions']);
      B.attackT = Math.max(1, 2.2 - L * 0.2) * (enraged ? 0.7 : 1);
      if (a === 'beam') {
        B.beam = { y: B.y, t: 0, warn: Math.max(0.55, (enraged ? 0.8 : 1.05) - L * 0.04), dur: 0.7, fired: false };
        B.attackT = 0.7;
        Sfx.charge(B.beam.warn);
      } else if (a === 'tears') {
        for (let k = 0; k < 3; k++) B.queue.push({ t: k * 0.35, fn: () => {
          const aim = aimAt(B.x - 14, B.y);
          for (let i = -2; i <= 2; i++) fireEnemyBullet(B.x - 14, B.y, aim + i * 0.2, spd);
          Sfx.eshot();
        } });
      } else {
        for (const dy of [-18, 18]) spawnEnemy('waver', clamp(B.y + dy, 12, H - 12), { x: B.x - 26, minion: true, hp: 2 });
      }
    },
    boxes: (B) => [{ x: B.x, y: B.y, w: 40, h: 40, kind: B.open < 0.5 ? 'armor' : 'core' }],
    draw(B) {
      const mark = bossMark() - 1, fl = B.hitT > 0, bm = B.beam;
      if (bm) {
        const y = Math.round(bm.y), x1 = Math.round(B.x - 16);
        if (!bm.fired) {
          if (Math.floor(bm.t * 14) % 2) { g.fillStyle = '#f84848'; for (let x = 0; x < x1; x += 4) g.fillRect(x, y, 2, 1); }
        } else {
          const w = Math.floor(G.t * 30) % 2;
          g.fillStyle = '#f84898'; g.fillRect(0, y - 4 - w, x1, 9 + w * 2);
          g.fillStyle = '#f8b8e8'; g.fillRect(0, y - 2, x1, 5);
          g.fillStyle = '#ffffff'; g.fillRect(0, y - 1, x1, 3);
        }
      }
      drawSprite(Sprites.watcher(mark, Math.floor(B.t * 3) % 2), B.x, B.y, fl);
      const lid = B.open > 0.7 ? 0 : B.open > 0.25 ? 1 : 2;
      if (lid < 2) {
        const ang = Math.atan2(G.py - B.y, PLAYER_X - B.x);
        drawSprite(Sprites.iris(bm && !bm.fired), B.x + Math.cos(ang) * 5, B.y + Math.sin(ang) * 3, fl);
      }
      if (lid) drawSprite(Sprites.watcherLid(mark, lid), B.x, B.y, fl);
    },
  },

  // Two gunships sharing one health bar. They fire walls of shots with a gap to slip through,
  // and spin around each other to swap places. Destroy one and the other gets angry.
  twins: {
    name: 'GEMINI TWINS', warn: 'TWO WARSHIPS INCOMING', hp: 170,
    init(B) {
      const each = Math.ceil(B.max / 2);
      B.hp = B.max = each * 2;
      B.ph = 0; B.rot = 0; B.rotTo = 0;
      B.ships = [0, 1].map((i) => ({ i, hp: each, hitT: 0, dead: false, x: B.x, y: H / 2 }));
      this.place(B);
    },
    place(B) {
      for (const s of B.ships) {
        const th = -Math.PI / 2 + s.i * Math.PI + B.rot;
        s.x = B.x + Math.cos(th) * 26;
        s.y = H / 2 + Math.sin(th) * 46 + Math.sin(B.ph) * 10;
      }
    },
    update(B, dt, L, enraged) {
      if (B.state === 'enter') glideIn(B, 262, dt);
      B.ph += dt * (1.1 + L * 0.1);
      B.rot += clamp(B.rotTo - B.rot, -2.4 * dt, 2.4 * dt);
      this.place(B);
      if (B.state === 'enter' || (B.attackT -= dt) > 0) return;
      const alive = B.ships.filter((s) => !s.dead);
      const attacks = ['wall', 'pincer', 'swap', 'pincer'];
      if (enraged) attacks.push('fan');
      const a = nextAttack(B, attacks);
      B.attackT = Math.max(1.1, 2.6 - L * 0.2) * (enraged ? 0.65 : 1);
      const spd = 70 + L * 10;
      const fireFrom = (s, ang, v, big) => { if (!s.dead) fireEnemyBullet(s.x - 18, s.y, ang, v, big); };
      if (a === 'wall') {
        const wall = () => {
          const gap = rand(30, H - 30), x = Math.min(...B.ships.map((s) => s.x)) - 18;
          for (let y = 4; y < H - 2; y += 9) if (Math.abs(y - gap) > 17) fireEnemyBullet(x, y, Math.PI, 50 + L * 6, true);
          Sfx.eshot();
        };
        wall();
        if (enraged) B.queue.push({ t: 1.1, fn: wall });
      } else if (a === 'pincer') {
        for (const s of alive) for (let k = 0; k < 3 + Math.min(3, L); k++) B.queue.push({ t: k * 0.15, fn: () => { fireFrom(s, aimAt(s.x - 18, s.y), spd * 1.2); Sfx.eshot(); } });
      } else if (a === 'swap') {
        B.rotTo += Math.PI;
        for (let k = 0; k < 6; k++) B.queue.push({ t: k * 0.2, fn: () => { for (const s of B.ships) fireFrom(s, Math.PI + rand(-0.2, 0.2), spd); Sfx.eshot(); } });
      } else {
        for (const s of alive) for (let i = 0; i < 5; i++) fireFrom(s, Math.PI - 0.5 + i * 0.25, spd, true);
        Sfx.eshot();
      }
    },
    boxes(B, all) { return B.ships.filter((s) => all || !s.dead).map((s) => ({ x: s.x, y: s.y, w: 34, h: 16, ref: s })); },
    draw(B) {
      const f = Math.floor(B.t * 4) % 2;
      for (const s of B.ships) if (!s.dead) drawSprite(Sprites.twin(s.i, bossMark() - 1, f), s.x, s.y, s.hitT > 0);
    },
  },
};

function spawnBoss() {
  const kind = bossKind(), def = BOSSES[kind], mark = bossMark();
  const hp = Math.round(def.hp * (1 + G.loop * 0.75));
  G.boss = { kind, def, x: W + 40, y: H / 2, hp, max: hp, t: 0, attackT: 2, attack: 0, hitT: 0, state: 'enter', queue: [] };
  def.init(G.boss, G.loop);
  G.bossState = 'fight';
  G.banner = { text: mark > 1 ? `${def.name} MK ${mark}` : def.name, t: 2.5 };
}

function bossTouches(box) {
  return G.dead <= 0 && G.invuln <= 0 && Math.abs(box.x - (PLAYER_X + 2)) < box.w / 2 + 6 && Math.abs(box.y - G.py) < box.h / 2 + 3;
}

function updateBoss(dt) {
  const B = G.boss, def = B.def;
  B.t += dt; B.hitT -= dt;
  for (const p of B.segs || B.ships || []) p.hitT -= dt;
  if (B.state === 'dying') {
    B.dyingT -= dt;
    B.x += 6 * dt; B.y += 10 * dt;
    if (Math.random() < dt * 14) {
      const boxes = def.boxes(B, true), p = boxes[randInt(0, boxes.length - 1)];
      explode(p.x + rand(-p.w, p.w) / 2, p.y + rand(-p.h, p.h) / 2, 10); Sfx.boom();
    }
    if (B.dyingT <= 0) finishBoss();
    return;
  }
  for (const q of B.queue) { q.t -= dt; if (q.t <= 0) { q.fn(); q.done = true; } }
  B.queue = B.queue.filter((q) => !q.done);
  def.update(B, dt, G.loop, B.hp < B.max / 2);
  // Ramming the boss hurts
  if (G.boss === B && B.state === 'fight' && def.boxes(B).some(bossTouches)) hurtPlayer();
}

function hitBoss(box, dmg, x, y) {
  const B = G.boss, p = box.ref;
  const sparks = () => { if (Math.random() < 0.3) explode(x, y, 3, ['#f8f8f8', '#f8e040']); };
  if (box.kind === 'armor') {
    if (Math.random() < 0.4) { explode(x, y, 2, ['#a8b0d8', '#f8f8f8']); Sfx.tink(); }
    return;
  }
  if (box.kind === 'seg') {
    p.hp -= dmg; p.hitT = 0.06; addScore(5);
    if (p.hp > 0) return sparks();
    p.dead = true;
    const pts = Math.round(250 * (1 + G.loop * 0.5));
    addScore(pts); floatText(p.x, p.y - 8, String(pts), '#f8e040');
    explode(p.x, p.y, 14); Sfx.boom();
    return;
  }
  let d = dmg;
  if (p) {
    d = Math.min(dmg, p.hp);
    p.hp -= dmg; p.hitT = 0.06;
    if (p.hp <= 0) {
      p.dead = true; B.endX = p.x; B.endY = p.y;   // where the final explosion goes
      explode(p.x, p.y, 30); Sfx.bigBoom(); G.shake = 5;
    }
  } else B.hitT = 0.06;
  B.hp -= d; addScore(10);
  sparks();
  if (B.hp <= 0) killBoss();
}

// A bomb hits every part of the boss once, straight through any armour.
function bombBoss() {
  const B = G.boss;
  if (!B || B.state === 'dying') return;
  const seen = new Set();
  for (const box of B.def.boxes(B)) {
    const k = box.ref || 'core';
    if (seen.has(k)) continue;
    seen.add(k);
    hitBoss({ ...box, kind: box.kind === 'seg' ? 'seg' : 'core' }, box.kind === 'seg' ? 10 : 25, box.x, box.y);
    if (B.state === 'dying') break;
  }
}

function killBoss() {
  const B = G.boss;
  if (B.state === 'dying') return;
  B.state = 'dying'; B.dyingT = 2.4; B.queue = []; B.beam = null;
  G.ebullets = [];
  for (const e of G.enemies) e.dead = true;
  G.enemies = [];
  Sfx.bigBoom(); G.shake = 8; G.flash = 0.8;
}

function finishBoss() {
  const B = G.boss, bonus = 5000 * (G.loop + 1), x = B.endX ?? B.x, y = B.endY ?? B.y;
  explode(x, y, 60); G.flash = 1; G.shake = 10; Sfx.bigBoom();
  addScore(bonus);
  floatText(x - 30, y, `+${bonus}`, '#f8e040');
  dropPowerup(x - 20, y, 'P');
  Analytics.track('boss_defeated', { loop: G.loop + 1, boss: B.kind, score: G.score });
  G.boss = null; G.bossState = 'none';
  G.loop++; G.stageKills = 0; G.stageT = 0; G.spawnT = 3;
  G.banner = { text: `LOOP ${G.loop + 1}: THE ALIENS GET TOUGHER`, t: 3.5 };
}

// ---------------- Background ----------------
const STARS = [];
for (let i = 0; i < 120; i++) STARS.push({ x: rand(0, W), y: rand(0, H), layer: i < 60 ? 0 : i < 100 ? 1 : 2 });
const STAR_SPEED = [8, 22, 60], STAR_COL = ['#3a4078', '#8890c8', '#f8f8ff'];
const SKY = [['#05051a', '#141038'], ['#120518', '#2a0c30'], ['#04140f', '#0c2a28'], ['#140c04', '#30200c'], ['#0c0c0c', '#2a2a40']];
let planetObj = { x: W * 0.7, y: 50, seed: 1 }, planetWait = 0;

function updateBackground(dt) {
  const boost = mode === 'play' && G && G.bossState === 'warning' ? 2.5 : 1;
  for (const s of STARS) { s.x -= STAR_SPEED[s.layer] * boost * dt; if (s.x < 0) { s.x += W; s.y = rand(0, H); } }
  if (planetObj) { planetObj.x -= 4 * dt; if (planetObj.x < -60) { planetObj = null; planetWait = rand(10, 25); } }
  else if ((planetWait -= dt) <= 0) planetObj = { x: W + 40, y: rand(20, H - 20), seed: randInt(0, 9) };
}

function drawBackground() {
  const sky = SKY[(G ? G.loop : 0) % SKY.length];
  const gr = g.createLinearGradient(0, 0, 0, H);
  gr.addColorStop(0, sky[0]); gr.addColorStop(1, sky[1]);
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  for (const s of STARS) if (s.layer === 0) { g.fillStyle = STAR_COL[0]; g.fillRect(s.x | 0, s.y | 0, 1, 1); }
  if (planetObj) { const p = Sprites.planet(planetObj.seed); g.drawImage(p, Math.round(planetObj.x - p.width / 2), Math.round(planetObj.y - p.height / 2)); }
  for (const s of STARS) {
    if (s.layer === 0) continue;
    g.fillStyle = STAR_COL[s.layer];
    g.fillRect(s.x | 0, s.y | 0, s.layer === 2 ? 2 : 1, 1);
  }
}

// ---------------- Rendering ----------------
function drawSprite(s, x, y, flashIt) {
  const img = flashIt ? Sprites.flash(s) : s;
  g.drawImage(img, Math.round(x - s.width / 2), Math.round(y - s.height / 2));
}

function drawPlay() {
  const t = G.t;
  // power-ups
  for (const p of G.powerups) drawSprite(Sprites.powerup(p.type, Math.floor(p.t * 6) % 2), p.x, p.y);
  // enemies
  for (const e of G.enemies) {
    const f = Math.floor(e.t * 4 + e.phase) % 2;
    drawSprite(Sprites.alien(e.type, f), e.x, e.y, e.hitT > 0);
  }
  // boss
  if (G.boss && (G.boss.state !== 'dying' || Math.floor(G.boss.t * 16) % 2)) G.boss.def.draw(G.boss);
  // player
  if (G.dead <= 0 && (G.invuln <= 0 || Math.floor(t * 12) % 2)) {
    const ship = Sprites.SHIP(), x = PLAYER_X, y = G.py;
    // engine flame
    const len = 3 + (Math.floor(t * 20) % 2) * 2 + (firing() ? 1 : 0);
    g.fillStyle = '#f89838'; g.fillRect(x - 10 - len, Math.round(y) - 1, len, 3);
    g.fillStyle = '#f8f060'; g.fillRect(x - 10 - Math.ceil(len / 2), Math.round(y), Math.ceil(len / 2), 1);
    drawSprite(ship, x, y);
    if (G.shield) {
      g.fillStyle = Math.floor(t * 8) % 2 ? '#80f8a0' : '#40c070';
      for (let i = 0; i < 28; i++) { const a = i / 28 * Math.PI * 2; g.fillRect(Math.round(x + 1 + Math.cos(a) * 14), Math.round(y + Math.sin(a) * 9), 1, 1); }
    }
  }
  // bullets
  for (const b of G.bullets) drawShot(b);
  for (const b of G.ebullets) {
    const x = Math.round(b.x), y = Math.round(b.y), f = Math.floor(b.t * 10) % 2;
    if (b.big) {
      g.fillStyle = '#10101c'; g.fillRect(x - 3, y - 2, 6, 4); g.fillRect(x - 2, y - 3, 4, 6);
      g.fillStyle = f ? '#f84898' : '#f878c8'; g.fillRect(x - 2, y - 1, 4, 2); g.fillRect(x - 1, y - 2, 2, 4);
      g.fillStyle = '#ffffff'; g.fillRect(x - 1, y - 1, 1, 1);
    } else {
      g.fillStyle = '#10101c'; g.fillRect(x - 2, y - 2, 4, 4);
      g.fillStyle = f ? '#f8e040' : '#f89838'; g.fillRect(x - 1, y - 1, 2, 2);
    }
  }
  // particles
  for (const p of G.particles) {
    if (p.ring) {
      const r = p.r * (0.4 + p.t / p.life);
      g.fillStyle = p.t / p.life < 0.5 ? '#f8f8f8' : '#f8a040';
      for (let i = 0; i < 20; i++) { const a = i / 20 * Math.PI * 2; g.fillRect(Math.round(p.x + Math.cos(a) * r), Math.round(p.y + Math.sin(a) * r), 1, 1); }
    } else { g.fillStyle = p.color; g.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size); }
  }
  for (const f of G.floats) Pixel.text(g, f.text, f.x, f.y, f.color, 1, 'center');
  drawHUD();
}

// Player shots: the shape and colour show the weapon tier.
function drawShot(b) {
  const x = Math.round(b.x), y = Math.round(b.y), [o, c] = shotCol(b.tier), k = shotGrow(b.tier);
  const rect = (col, rx, ry, w, h) => { g.fillStyle = col; g.fillRect(rx, ry, w, h); };
  switch (SHOT_SHAPES[b.tier % SHOT_SHAPES.length].name) {
    case 'bolt':
      rect(o, x - 3 - k, y - 1 - (k >> 1), 7 + k * 2, 2 + k);
      rect(c, x - 1, y - 1, 4, 1);
      break;
    case 'laser':
      rect(o, x - 7 - k * 2, y - 1 - (k >> 1), 14 + k * 3, 3 + k);
      rect(c, x - 6 - k * 2, y, 13 + k * 3, 1);
      break;
    case 'orb': {
      const r = 2 + k;
      rect(o, x - 3 - r - (Math.floor(b.t * 20) % 2), y, 2, 1);   // flickering tail
      rect(o, x - r + 1, y - r, r * 2 - 1, r * 2 + 1); rect(o, x - r, y - r + 1, r * 2 + 1, r * 2 - 1);
      rect(c, x - 1, y - 1, 2, 2);
      break;
    }
    case 'chevron':
      for (let i = 0; i <= 3 + k; i++) { rect(o, x + 1 - i, y - i, 3, 1); rect(o, x + 1 - i, y + i, 3, 1); }
      rect(c, x + 1, y, 3, 1); rect(c, x - 2, y, 2, 1);
      break;
    case 'helix': {
      const a = Math.round(Math.sin(b.t * 30) * (2 + k));
      rect(o, x - 4 - k, y, 9 + k * 2, 1);
      rect(c, x - 1, y + a - 1, 3, 2); rect(o, x - 1, y - a - 1, 3, 2);
      break;
    }
  }
}

function drawHUD() {
  const t = G.t;
  Pixel.text(g, 'SCORE ' + String(G.score).padStart(7, '0'), 4, 4, '#ffffff');
  Pixel.text(g, 'HI ' + String(hi).padStart(7, '0'), W / 2, 4, G.newHi ? '#f8e040' : '#a8b0d8', 1, 'center');
  // lives
  const life = Sprites.LIFE();
  for (let i = 0; i < Math.min(G.lives, 6); i++) g.drawImage(life, 4 + i * 11, 11);
  // weapon status
  const tc = shotCol(G.tier)[0], mk = `MK${G.tier + 1}`;
  Pixel.text(g, mk, 4, H - 9, tc);
  const px = 6 + Pixel.textW(mk);
  for (let i = 0; i < MAX_GUNS; i++) { g.fillStyle = i < G.weapon ? tc : '#38304a'; g.fillRect(px + i * 5, H - 9, 4, 5); }
  const rx = px + MAX_GUNS * 5 + 5;
  Pixel.text(g, 'RPD', rx, H - 9, '#3878e8');
  for (let i = 0; i < 3; i++) { g.fillStyle = i < G.rapid ? '#68a8f8' : '#38304a'; g.fillRect(rx + 14 + i * 5, H - 9, 4, 5); }
  if (G.shield) Pixel.text(g, 'SHIELD', rx + 34, H - 9, '#80f8a0');
  Pixel.text(g, `LOOP ${G.loop + 1}`, W - 4, H - 9, '#a8b0d8', 1, 'right');
  // boss progress / health
  if (G.boss) {
    const B = G.boss, w = 120, x = W / 2 - w / 2;
    Pixel.text(g, 'BOSS', x - 4, 12, '#f84848', 1, 'right');
    g.fillStyle = '#f4f0e0'; g.fillRect(x - 1, 12, w + 2, 6);
    g.fillStyle = '#10101c'; g.fillRect(x, 13, w, 4);
    g.fillStyle = B.hp < B.max / 2 && Math.floor(t * 8) % 2 ? '#f8a040' : '#f84848';
    g.fillRect(x, 13, Math.round(w * Math.max(0, B.hp) / B.max), 4);
  } else if (G.bossState === 'none') {
    const frac = Math.min(1, G.stageKills / bossKills()), w = 60, x = W / 2 - w / 2;
    g.fillStyle = '#28284a'; g.fillRect(x, 12, w, 2);
    g.fillStyle = '#8890c8'; g.fillRect(x, 12, Math.round(w * frac), 2);
  }
  if (G.bossState === 'warning' && Math.floor(t * 4) % 2) {
    g.fillStyle = 'rgba(200,0,0,0.25)'; g.fillRect(0, H / 2 - 16, W, 32);
    Pixel.text(g, 'WARNING', W / 2, H / 2 - 10, '#f84848', 3, 'center');
    Pixel.text(g, BOSSES[bossKind()].warn, W / 2, H / 2 + 8, '#f8e0e0', 1, 'center');
  }
  if (G.banner) Pixel.text(g, G.banner.text, W / 2, 30, '#f8e040', 1, 'center');
}

function drawTitle() {
  const t = modeT;
  const y = 40 + Math.round(Math.sin(t * 2) * 2);
  Pixel.text(g, 'ASTRO', W / 2, y, '#60d0f8', 4, 'center', '#10204a');
  Pixel.text(g, 'BLASTER', W / 2, y + 26, '#f8e040', 4, 'center', '#4a2810');
  const ship = Sprites.SHIP();
  const sx = (t * 70) % (W + 80) - 40;
  g.fillStyle = '#f89838'; g.fillRect(Math.round(sx) - 16, 129, 5, 3);
  g.drawImage(ship, Math.round(sx - ship.width / 2), 125);
  for (let i = 0; i < 3; i++) { const s = Sprites.alien(['drone', 'waver', 'shooter'][i], Math.floor(t * 3) % 2); g.drawImage(s, Math.round(sx + 60 + i * 20), 124); }
  if (Math.floor(t * 2) % 2 === 0) Pixel.text(g, isTouch ? 'TAP TO START' : 'PRESS SPACE TO START', W / 2, 108, '#ffffff', 1, 'center');
  Pixel.text(g, isTouch ? 'DRAG TO MOVE - HOLD FIRE TO SHOOT' : 'W/S OR UP/DOWN: MOVE   SPACE: FIRE   P: PAUSE', W / 2, 150, '#a8b0d8', 1, 'center');
  Pixel.text(g, 'HI SCORE ' + String(hi).padStart(7, '0'), W / 2, 162, '#f8e040', 1, 'center');
}

function drawGameOver() {
  Pixel.panel(g, W / 2 - 80, 46, 160, 86);
  Pixel.text(g, 'GAME OVER', W / 2, 56, '#f84848', 3, 'center');
  Pixel.text(g, 'SCORE ' + G.score, W / 2, 82, '#ffffff', 1, 'center');
  Pixel.text(g, `LOOP ${G.loop + 1}`, W / 2, 92, '#a8b0d8', 1, 'center');
  if (G.newHi) { if (Math.floor(modeT * 4) % 2) Pixel.text(g, 'NEW HIGH SCORE!', W / 2, 104, '#f8e040', 1, 'center'); }
  else Pixel.text(g, 'HI ' + hi, W / 2, 104, '#f8e040', 1, 'center');
  if (modeT > 1.2 && Math.floor(modeT * 2) % 2 === 0) Pixel.text(g, isTouch ? 'TAP TO PLAY AGAIN' : 'PRESS SPACE TO PLAY AGAIN', W / 2, 118, '#ffffff', 1, 'center');
}

function render() {
  drawBackground();
  if (mode === 'title') drawTitle();
  else {
    drawPlay();
    if (mode === 'over') drawGameOver();
    if (mode === 'paused') {
      g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(0, 0, W, H);
      Pixel.panel(g, W / 2 - 60, H / 2 - 22, 120, 44);
      Pixel.text(g, 'PAUSED', W / 2, H / 2 - 14, '#ffffff', 2, 'center');
      Pixel.text(g, isTouch ? 'TAP PAUSE TO RESUME' : 'P TO RESUME', W / 2, H / 2 + 6, '#a8b0d8', 1, 'center');
    }
  }
  if (G && G.flash > 0) { g.fillStyle = `rgba(255,255,255,${Math.min(0.6, G.flash * 0.6)})`; g.fillRect(0, 0, W, H); }

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = false;
  const sh = G ? G.shake * 0.3 : 0, jx = Math.round(rand(-sh, sh)) * scale, jy = Math.round(rand(-sh, sh)) * scale;
  ctx.drawImage(buf, offX + jx, offY + jy, W * scale, H * scale);
}

function resize() {
  dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(innerWidth * dpr); canvas.height = Math.round(innerHeight * dpr);
  let s = Math.min(canvas.width / W, canvas.height / H);
  if (s >= 2) s = Math.floor(s);   // whole-number scaling keeps every pixel the same size
  scale = s;
  offX = Math.floor((canvas.width - W * s) / 2); offY = Math.floor((canvas.height - H * s) / 2);
}

// ---------------- Main loop ----------------
let last = 0;
function loop(t) {
  const dt = Math.min(0.05, (t - last) / 1000 || 0);
  last = t;
  update(dt);
  updateBackground(dt);
  render();
  pressed.clear();
  requestAnimationFrame(loop);
}

document.getElementById('btn-mute').addEventListener('click', (e) => {
  Sfx.muted = !Sfx.muted;
  localStorage.setItem('astro-blaster-muted', Sfx.muted ? '1' : '0');
  e.currentTarget.textContent = Sfx.muted ? '🔇' : '🔊';
  e.currentTarget.blur();
});
document.getElementById('btn-mute').textContent = Sfx.muted ? '🔇' : '🔊';
document.getElementById('btn-pause').addEventListener('click', (e) => { pressed.add('KeyP'); e.currentTarget.blur(); });

window.addEventListener('resize', resize);
resize();
Analytics.init();
requestAnimationFrame(loop);
window.Astro = { state: () => G, mode: () => mode, newGame, spawnBoss, spawnEnemy, dropPowerup, collect };
