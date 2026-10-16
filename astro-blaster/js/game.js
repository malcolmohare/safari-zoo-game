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
  shoot() { this.tone(880, 0.05, 'square', 0.015, -300); },
  hit() { this.tone(220, 0.05, 'square', 0.02, 60); },
  boom() { this.tone(120, 0.25, 'sawtooth', 0.05, -80); this.tone(60, 0.3, 'square', 0.03, -20); },
  bigBoom() { this.tone(90, 0.6, 'sawtooth', 0.07, -60); this.tone(45, 0.8, 'square', 0.05, -15, 0.05); },
  power() { [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.09, 'triangle', 0.05, 0, i * 0.06)); },
  hurt() { this.tone(300, 0.4, 'sawtooth', 0.06, -260); },
  warn() { for (let i = 0; i < 3; i++) { this.tone(440, 0.2, 'square', 0.04, 0, i * 0.45); this.tone(330, 0.2, 'square', 0.04, 0, i * 0.45 + 0.22); } },
  eshot() { this.tone(330, 0.06, 'triangle', 0.02, -120); },
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
    weapon: 1, rapid: 0, shield: false, invuln: 2, dead: 0,
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
      for (const [a, oy] of shots) G.bullets.push({ x: PLAYER_X + 12, y: G.py + oy, vx: Math.cos(a) * 300, vy: Math.sin(a) * 300 });
      Sfx.shoot();
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
  for (const b of G.bullets) {
    b.x += b.vx * dt; b.y += b.vy * dt;
    if (b.x > W + 8 || b.y < -8 || b.y > H + 8) { b.dead = true; continue; }
    for (const e of G.enemies) {
      const T = TYPES[e.type];
      if (Math.abs(b.x - e.x) < T.w / 2 + 3 && Math.abs(b.y - e.y) < T.h / 2 + 2) { b.dead = true; damageEnemy(e, 1); break; }
    }
    const B = G.boss;
    if (!b.dead && B && B.state !== 'dying' && b.x > B.x - 32 && b.x < B.x + 32 && Math.abs(b.y - (B.y + 4)) < 14 + (b.x > B.x - 8 ? 8 : 0)) {
      b.dead = true; B.hp -= 1; B.hitT = 0.06; addScore(10);
      if (Math.random() < 0.3) explode(b.x, b.y, 3, ['#f8f8f8', '#f8e040']);
      if (B.hp <= 0) killBoss();
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
  G.weapon = Math.max(1, G.weapon - 1); G.rapid = 0;
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
  Analytics.track('game_over', { score: G.score, loop: G.loop, kills_this_stage: G.stageKills });
}

function damageEnemy(e, n) {
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
  type = type || pick({ P: G.weapon < 5 ? 34 : 6, R: G.rapid < 3 ? 22 : 4, S: G.shield ? 6 : 20, B: 14, L: G.lives < 5 ? 9 : 0 });
  G.powerups.push({ x: Math.min(x, W - 20), y: clamp(y, 12, H - 12), type, t: 0 });
}

function collect(type) {
  Sfx.power();
  floatText(PLAYER_X + 6, G.py - 10, Sprites.POWER[type].name, Sprites.POWER[type].color);
  switch (type) {
    case 'P': if (G.weapon < 5) G.weapon++; else addScore(1000); break;
    case 'R': if (G.rapid < 3) G.rapid++; else addScore(1000); break;
    case 'S': G.shield = true; break;
    case 'L': G.lives++; break;
    case 'B':
      G.flash = 1; G.shake = 5; Sfx.bigBoom();
      for (const e of G.enemies) damageEnemy(e, 999);
      G.ebullets = [];
      if (G.boss && G.boss.state !== 'dying') { G.boss.hp -= 25; G.boss.hitT = 0.2; if (G.boss.hp <= 0) killBoss(); }
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

// ---------------- Boss ----------------
function spawnBoss() {
  const hp = Math.round(140 * (1 + G.loop * 0.75));
  G.boss = { x: W + 40, y: H / 2 - 4, hp, max: hp, t: 0, ph: 0, amp: 0, attackT: 2, attack: 0, hitT: 0, state: 'enter', queue: [] };
  G.bossState = 'fight';
  G.banner = { text: G.loop ? `MOTHERSHIP MK ${G.loop + 1}` : 'MOTHERSHIP', t: 2.5 };
}

function updateBoss(dt) {
  const B = G.boss, L = G.loop;
  B.t += dt; B.hitT -= dt;
  if (B.state === 'dying') {
    B.dyingT -= dt;
    B.x += 6 * dt; B.y += 10 * dt;
    if (Math.random() < dt * 14) { explode(B.x + rand(-28, 28), B.y + rand(-14, 16), 10); Sfx.boom(); }
    if (B.dyingT <= 0) finishBoss();
    return;
  }
  if (B.state === 'enter') {
    // glide in and ease to a stop
    B.x -= Math.max(8, Math.min(40, (B.x - 252) * 1.2)) * dt;
    if (B.x <= 252.5) { B.x = 252; B.state = 'fight'; }
    return;
  }
  const enraged = B.hp < B.max / 2;
  // Bob up and down. The phase accumulates (so speeding up never jumps), the swing eases in
  // after the entrance, and the ship can only move so fast, so it never teleports.
  B.ph += dt * 0.8 * (1 + L * 0.15) * (enraged ? 1.4 : 1);
  B.amp = Math.min(52, B.amp + 26 * dt);
  const ty = H / 2 - 4 + Math.sin(B.ph) * B.amp;
  B.y += clamp(ty - B.y, -70 * dt, 70 * dt);
  for (const q of B.queue) { q.t -= dt; if (q.t <= 0) { q.fn(); q.done = true; } }
  B.queue = B.queue.filter((q) => !q.done);
  B.attackT -= dt;
  if (B.attackT <= 0) {
    const attacks = ['fan', 'aimed', 'minions', 'aimed'];
    if (L >= 1 || enraged) attacks.push('spiral');
    const a = attacks[B.attack++ % attacks.length];
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
  }
  if (G.dead <= 0 && G.invuln <= 0 && PLAYER_X + 8 > B.x - 30 && Math.abs(G.py - B.y - 4) < 16) hurtPlayer();
}

function killBoss() {
  const B = G.boss;
  if (B.state === 'dying') return;
  B.state = 'dying'; B.dyingT = 2.4; B.queue = [];
  G.ebullets = [];
  for (const e of G.enemies) e.dead = true;
  G.enemies = [];
  Sfx.bigBoom(); G.shake = 8; G.flash = 0.8;
}

function finishBoss() {
  const B = G.boss, bonus = 5000 * (G.loop + 1);
  explode(B.x, B.y, 60); G.flash = 1; G.shake = 10; Sfx.bigBoom();
  addScore(bonus);
  floatText(B.x - 30, B.y, `+${bonus}`, '#f8e040');
  dropPowerup(B.x - 20, B.y, G.weapon < 5 ? 'P' : 'L');
  Analytics.track('boss_defeated', { loop: G.loop + 1, score: G.score });
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
function drawSprite(s, x, y, flashIt, key) {
  const img = flashIt ? Sprites.flash(s, key) : s;
  g.drawImage(img, Math.round(x - s.width / 2), Math.round(y - s.height / 2));
}

function drawPlay() {
  const t = G.t;
  // power-ups
  for (const p of G.powerups) drawSprite(Sprites.powerup(p.type, Math.floor(p.t * 6) % 2), p.x, p.y);
  // enemies
  for (const e of G.enemies) {
    const f = Math.floor(e.t * 4 + e.phase) % 2;
    drawSprite(Sprites.alien(e.type, f), e.x, e.y, e.hitT > 0, e.type + f);
  }
  // boss
  if (G.boss) {
    const B = G.boss, f = Math.floor(B.t * 4) % 2, s = Sprites.boss(G.loop, f);
    if (B.state !== 'dying' || Math.floor(B.t * 16) % 2) drawSprite(s, B.x, B.y, B.hitT > 0, 'boss' + G.loop + f);
  }
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
  for (const b of G.bullets) {
    g.fillStyle = '#f8c040'; g.fillRect(Math.round(b.x) - 3, Math.round(b.y) - 1, 7, 2);
    g.fillStyle = '#ffffff'; g.fillRect(Math.round(b.x) - 1, Math.round(b.y) - 1, 4, 1);
  }
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

function drawHUD() {
  const t = G.t;
  Pixel.text(g, 'SCORE ' + String(G.score).padStart(7, '0'), 4, 4, '#ffffff');
  Pixel.text(g, 'HI ' + String(hi).padStart(7, '0'), W / 2, 4, G.newHi ? '#f8e040' : '#a8b0d8', 1, 'center');
  // lives
  const life = Sprites.LIFE();
  for (let i = 0; i < Math.min(G.lives, 6); i++) g.drawImage(life, 4 + i * 11, 11);
  // weapon status
  Pixel.text(g, 'PWR', 4, H - 9, '#e04838');
  for (let i = 0; i < 5; i++) { g.fillStyle = i < G.weapon ? '#f86848' : '#38304a'; g.fillRect(18 + i * 5, H - 9, 4, 5); }
  Pixel.text(g, 'RPD', 48, H - 9, '#3878e8');
  for (let i = 0; i < 3; i++) { g.fillStyle = i < G.rapid ? '#68a8f8' : '#38304a'; g.fillRect(62 + i * 5, H - 9, 4, 5); }
  if (G.shield) Pixel.text(g, 'SHIELD', 82, H - 9, '#80f8a0');
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
    Pixel.text(g, 'A HUGE ALIEN SHIP IS APPROACHING', W / 2, H / 2 + 8, '#f8e0e0', 1, 'center');
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
window.Astro = { state: () => G, mode: () => mode, newGame, spawnBoss, spawnEnemy, dropPowerup };
