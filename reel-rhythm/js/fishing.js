// The fishing trip: cast, wait for a bite, hook it, then win a rhythm fight to reel the fish in.
// Fights scroll notes toward a hit ring in time with the music. Hits reel the fish closer; misses strain
// the line. Fill the reel bar to land the fish; let the line hit its limit and it snaps.

const Fishing = (() => {
  const WY = 64;             // water line
  const LANE_TOP = 124;      // the note highway fills the bottom of the screen
  const HIT_X = 40;
  const PX_PER_BEAT = 40;
  const FX = 30;             // where the angler stands

  // Rhythm patterns per difficulty level: one bar each. x = tap, H = hold start, - = hold continues.
  const PATTERNS = {
    1: ['x.x.x.x.', 'x...x...', 'x.x.x...', 'x...x.x.', 'x.x...x.'],
    2: ['x.x.xxx.', 'x.xxx.x.', 'xx..x.x.', 'x.x.x.xx', 'x..xx.x.'],
    3: ['xxx.x.x.', 'x.xx.xx.', 'xx.xx.x.', 'x.x.xxxx', '.xx.x.xx', 'x.xxx.x.'],
    4: ['xxxx.xx.', '.xx.xxx.', 'xx.xxx.x', 'x.xxxx.x', 'xxx.xxx.'],
    5: ['x.x.xxxxx.x.xxx.', 'xxx.x.xxx.x.xxxx', 'x.xxx.xxx.xxx.x.', 'xx.xxx.xxx.xx.x.'],
  };
  const HOLDS = {
    1: ['H---x.x.'], 2: ['H---x.x.', 'x.x.H---'], 3: ['H---x.xx', 'xx.xH---', 'H-..H-..'],
    4: ['H---xxx.', 'x.xxH---', 'H-.xH-.x'], 5: ['H-------x.xxx.xx', 'x.xxx.x.H-------'],
  };
  const LOOK = {
    pond:  { sky: ['#88d0f8', '#b8e4f8', '#e0f4f8'], far: '#4c9048', far2: '#336830', water: '#3a8ab8', deep: '#22587e', ground: 'dock' },
    river: { sky: ['#98bce0', '#c4d8ec', '#e8f0f4'], far: '#7c8ca8', far2: '#5c6c88', water: '#4a9ac4', deep: '#2c6688', ground: 'rocks', snow: true },
    lake:  { sky: ['#f8b868', '#f8d090', '#f8e8b8'], far: '#2c7038', far2: '#1c5028', water: '#2a9a8a', deep: '#186454', ground: 'rowboat' },
    reef:  { sky: ['#58c0f8', '#90d8f8', '#c8f0f8'], far: '#e8d890', far2: '#48a048', water: '#28bccc', deep: '#1488a8', ground: 'motorboat' },
    deep:  { sky: ['#101838', '#182450', '#20306a'], far: '#0c1430', far2: '#0c1430', water: '#183a6c', deep: '#0a1a3c', ground: 'trawler', night: true },
  };

  let T = null;   // the trip
  let onDone = null;

  function start(spot, done) {
    onDone = done;
    T = { spot, look: LOOK[spot], castsLeft: Game.casts(), caught: [], state: 'ready', t: 0, msg: null, F: null,
      bob: { x: 0, y: WY, dip: 0 }, splashes: [], held: [false, false], anim: 0 };
    Analytics.track('fishing_start', { spot, day: Game.s.day });
  }

  const deckY = () => ({ dock: WY - 4, rocks: WY - 3, rowboat: WY - 3, motorboat: WY - 4, trawler: WY - 14 })[T.look.ground];
  const tip = () => { const y = deckY(); return { x: FX + 24, y: y - 30 }; };

  // ---------------- Flow ----------------
  function coolerFull() { return Game.s.cooler.length >= Game.coolerCap(); }

  function cast() {
    T.castsLeft--;
    T.state = 'casting'; T.t = 0;
    T.bob.x = randInt(170, 230);
    T.sp = Game.rollFish(T.spot);
    Snd.sfx.cast();
  }

  function setMsg(text, sub = '', color = '#ffffff') { T.msg = { text, sub, color }; }

  function finishCast(kind, data = {}) {
    T.state = 'result'; T.t = 0; T.result = { kind, ...data };
    if (T.F) { T.F.song.stop(); T.F = null; }
  }

  function next() {
    T.msg = null;
    if (T.castsLeft <= 0 || coolerFull()) { end(); return; }
    T.state = 'ready'; T.t = 0;
  }

  function end() {
    const caught = T.caught;
    if (T.F) T.F.song.stop();
    T = null;
    Analytics.track('fishing_end', { caught: caught.length });
    onDone(caught);
  }

  // ---------------- The fight ----------------
  function startFight() {
    const spec = SPECIES[T.sp], beat = 60 / spec.bpm;
    const song = Snd.song(T.spot, spec.lvl);
    T.F = {
      spec, beat, barDur: beat * 4, t0: Snd.now() + 0.25, nextBar: 0, notes: [], song,
      progress: 0, need: spec.need, tension: 0, max: Game.lineMax(), combo: 0, best: 0,
      counts: { perfect: 0, good: 0, miss: 0 }, judge: null, ring: 0, holdHeld: [null, null],
    };
    T.state = 'fight'; T.t = 0;
    Snd.sfx.hooked();
    Analytics.track('fight_start', { sp: T.sp });
  }

  // Song time as the player hears it (seconds since the song started).
  const songTime = () => Snd.now() - Snd.latency() - Game.s.offsetMs / 1000 - T.F.t0;

  function genBar(k) {
    const F = T.F, spec = F.spec, at = F.t0 + k * F.barDur;
    F.song.bar(k, at, F.beat, k === 0);
    if (k === 0) return;
    // Every 4th bar the fish fights back with a harder pattern.
    const fight = k % 4 === 0;
    const lvl = clamp(spec.lvl + (fight ? 1 : 0) - (k === 1 ? 1 : 0), 1, 5);
    const pool = spec.holds && Math.random() < 0.35 ? HOLDS[lvl] : PATTERNS[lvl];
    const pat = pool[randInt(0, pool.length - 1)];
    const slot = F.barDur / pat.length;
    let lane = randInt(0, 1), holdEnd = [-1, -1], lastT = -9;
    for (let i = 0; i < pat.length; i++) {
      const ch = pat[i];
      if (ch !== 'x' && ch !== 'H') continue;
      const t = k * F.barDur + i * slot;
      let len = 0;
      if (ch === 'H') { let j = i + 1; while (pat[j] === '-') j++; len = (j - i) * slot; }
      if (spec.lanes === 2) {
        if (t - lastT < F.beat * 0.3) lane = 1 - lane;           // fast runs alternate hands
        else if (Math.random() < 0.5) lane = 1 - lane;
        if (holdEnd[lane] > t) lane = 1 - lane;                  // don't stack on a held lane
      } else lane = 0;
      if (holdEnd[lane] > t) continue;
      if (len) holdEnd[lane] = t + len;
      lastT = t;
      F.notes.push({ t, lane, len, state: 0, fight });
      F.song.guide(F.t0 + t, lane, len);
    }
  }

  function judge(text, color) { T.F.judge = { text, color, t: 0 }; }

  function addReel(q, fight) {
    const F = T.F;
    F.combo++; F.best = Math.max(F.best, F.combo);
    const base = q === 'perfect' ? 1 : q === 'hold' ? 1 : 0.6;
    F.progress += base * (1 + Math.min(F.combo, 20) / 40) * (fight ? 1.3 : 1);
    if (q === 'perfect') F.tension = Math.max(0, F.tension - 0.15);
    F.ring = 1;
    Snd.hitNote(F.song.chordRoot(), F.combo, q === 'perfect');
    for (let i = 0; i < 4; i++) T.splashes.push({ x: fishPos().x + rand(-6, 6), y: WY, vx: rand(-20, 20), vy: rand(-50, -20), t: 0.5 });
  }

  function strain(amount, text) {
    const F = T.F;
    F.combo = 0;
    F.tension += amount;
    F.progress = Math.max(0, F.progress - 0.3);
    if (text) judge(text, '#f86858');
  }

  function press(lane) {
    if (!T) return;
    if (T.state === 'ready') { if (coolerFull()) end(); else cast(); return; }
    if (T.state === 'result') { if (T.t > 0.5) next(); return; }
    if (T.state === 'waiting') {
      // Too early: the fish is spooked and you have to wait a little longer.
      T.wait += 1.2; T.bob.dip = 0;
      setMsg('TOO EARLY!', 'Wait for the big splash', '#f8a040');
      Snd.sfx.error();
      return;
    }
    if (T.state === 'bite') {
      const spec = SPECIES[T.sp];
      Game.s.seen[T.sp] = true;
      if (spec.rod > Game.rodTier()) {
        Snd.sfx.snap();
        finishCast('snap', { sp: T.sp });
        Analytics.track('rod_too_weak', { sp: T.sp });
      } else startFight();
      return;
    }
    if (T.state !== 'fight') return;
    const F = T.F, t = songTime(), win = Game.windows();
    if (F.spec.lanes === 1) lane = 0;
    T.held[lane] = true;
    let best = null, bd = 1e9;
    for (const n of F.notes) {
      if (n.state !== 0 || n.lane !== lane) continue;
      const d = Math.abs(n.t - t);
      if (d < bd) { bd = d; best = n; }
      if (n.t > t + win.good) break;
    }
    if (best && bd <= win.good) {
      const q = bd <= win.perfect ? 'perfect' : 'good';
      F.counts[q]++;
      if (best.len) { best.state = 3; F.holdHeld[lane] = best; } else best.state = 1;
      judge(q === 'perfect' ? 'PERFECT' : 'GOOD', q === 'perfect' ? '#f8e048' : '#88e070');
      addReel(q, best.fight);
    } else {
      // A tap with no note near it tugs the line.
      F.tension += 0.25;
      Snd.sfx.stray();
    }
  }

  function release(lane) {
    if (!T || T.state !== 'fight') return;
    const F = T.F;
    if (F.spec.lanes === 1) lane = 0;
    T.held[lane] = false;
    const n = F.holdHeld[lane];
    if (!n) return;
    F.holdHeld[lane] = null;
    if (songTime() >= n.t + n.len - 0.15) { n.state = 1; addReel('hold', n.fight); judge('HOLD!', '#f8e048'); }
    else { n.state = 2; strain(0.6, 'LET GO'); Snd.sfx.miss(); }
  }

  function fishPos() {
    const F = T.F, p = F ? clamp(F.progress / F.need, 0, 1) : 0;
    const x = 290 - p * 170 + Math.sin(T.anim * 2.3) * 8;
    const y = WY + 30 - p * 14 + Math.sin(T.anim * 3.1) * 4;
    return { x, y };
  }

  function update(dt) {
    if (!T) return;
    T.t += dt; T.anim += dt;
    for (const s of T.splashes) { s.t -= dt; s.x += s.vx * dt; s.y += s.vy * dt; s.vy += 160 * dt; }
    T.splashes = T.splashes.filter((s) => s.t > 0);
    const spec = SPECIES[T.sp];
    switch (T.state) {
      case 'casting':
        if (T.t > 0.7) { T.state = 'waiting'; T.t = 0; T.wait = rand(1.5, 4); T.nibbleT = rand(0.6, 1.4); Snd.sfx.plop(); T.msg = null; }
        break;
      case 'waiting':
        T.bob.dip = Math.max(0, T.bob.dip - dt * 8);
        T.nibbleT -= dt;
        // Harder spots have more fake-out nibbles.
        if (T.nibbleT <= 0 && T.t < T.wait - 0.4) { T.bob.dip = 1; Snd.sfx.nibble(); T.nibbleT = rand(0.5, 1.3); }
        if (T.t >= T.wait) { T.state = 'bite'; T.t = 0; T.biteWin = 0.85 - spec.lvl * 0.06; Snd.sfx.bite(); T.msg = null; splash(T.bob.x, 8); }
        break;
      case 'bite':
        if (T.t > T.biteWin) { Game.s.seen[T.sp] = true; Snd.sfx.miss(); finishCast('missed', { sp: T.sp }); }
        break;
      case 'fight': updateFight(); break;
    }
  }

  function splash(x, n) { for (let i = 0; i < n; i++) T.splashes.push({ x: x + rand(-3, 3), y: WY, vx: rand(-30, 30), vy: rand(-80, -30), t: 0.6 }); }

  function updateFight() {
    const F = T.F, t = songTime(), win = Game.windows();
    while (F.nextBar * F.barDur < t + 3) genBar(F.nextBar++);
    for (const n of F.notes) {
      if (n.state === 0 && t > n.t + win.good) { n.state = 2; F.counts.miss++; strain(n.fight ? 1.4 : 1, 'MISS'); Snd.sfx.miss(); }
      if (n.state === 3 && t >= n.t + n.len) { n.state = 1; F.holdHeld[n.lane] = null; addReel('hold', n.fight); judge('HOLD!', '#f8e048'); }
    }
    if (F.notes.length > 80) F.notes = F.notes.filter((n) => n.t > t - 2 || n.state === 3);
    F.ring = Math.max(0, F.ring - 0.1);
    if (F.judge) F.judge.t += 1 / 60;
    if (F.progress >= F.need) {
      const w = Math.round(rand(0.8, 1.35) * 100) / 100;
      const { fish, isNew } = Game.addCatch(T.sp, w);
      T.caught.push(fish);
      Snd.sfx.caught();
      splash(fishPos().x, 14);
      finishCast('caught', { sp: T.sp, fish, isNew, counts: F.counts, best: F.best });
      Analytics.track('fish_caught', { sp: fish.sp, new: isNew });
    } else if (F.tension >= F.max) {
      Snd.sfx.snap();
      finishCast('lost', { sp: T.sp, counts: F.counts });
      Analytics.track('fish_lost', { sp: T.sp });
    }
  }

  // ---------------- Drawing ----------------
  function background() {
    const L = T.look, spot = T.spot;
    return Pixel.memo('bg:' + spot, () => {
      const c = Pixel.canvas(W, H), g = c.getContext('2d');
      // Sky in three dithered bands
      const bands = [0, 20, 40, WY];
      for (let y = 0; y < WY; y++) for (let x = 0; x < W; x++) {
        let b = y < bands[1] ? 0 : y < bands[2] ? 1 : 2;
        const edge = b < 2 && y >= bands[b + 1] - 2 && (x + y) % 2 === 0;
        g.fillStyle = L.sky[edge ? b + 1 : b]; g.fillRect(x, y, 1, 1);
      }
      if (L.night) for (let i = 0; i < 40; i++) { g.fillStyle = i % 5 ? '#c8d0f8' : '#ffffff'; g.fillRect(Math.floor(Pixel.hash(i, 1) * W), Math.floor(Pixel.hash(i, 2) * (WY - 16)), 1, 1); }
      if (L.night) { g.fillStyle = '#f8f0c8'; g.beginPath(); g.arc(260, 18, 7, 0, 7); g.fill(); g.fillStyle = L.sky[0]; g.beginPath(); g.arc(263, 16, 6, 0, 7); g.fill(); }
      else { g.fillStyle = '#f8f0b0'; g.fillRect(262, 10, 10, 10); g.fillRect(260, 12, 14, 6); g.fillRect(264, 8, 6, 14); }
      // Far shore
      for (let x = 0; x < W; x++) {
        let hgt;
        if (L.snow) hgt = 26 + Math.abs(((x * 0.9) % 70) - 35) * -0.6 + 12 + Math.sin(x * 0.05) * 6;
        else if (spot === 'reef') hgt = x > 200 && x < 290 ? 6 + Math.sin((x - 200) / 90 * Math.PI) * 6 : 0;
        else if (spot === 'deep') hgt = 0;
        else hgt = 10 + Math.sin(x * 0.07) * 3 + Math.sin(x * 0.23) * 2 + Pixel.hash(x, 0) * 2;
        hgt = Math.max(0, Math.round(hgt));
        for (let y = WY - hgt; y < WY; y++) {
          let col = (y - (WY - hgt)) < 2 ? Pixel.shade(L.far, 1.2) : L.far;
          if (L.snow && y - (WY - hgt) < 5 && hgt > 26) col = '#f0f4f8';
          if (!L.snow && spot !== 'reef' && Pixel.hash(x, y) < 0.2) col = L.far2;
          g.fillStyle = Array.isArray(col) ? `rgb(${col[0]},${col[1]},${col[2]})` : col; g.fillRect(x, y, 1, 1);
        }
      }
      if (spot === 'reef') { g.fillStyle = '#48a048'; g.fillRect(238, WY - 22, 2, 12); g.fillRect(232, WY - 24, 14, 3); g.fillRect(230, WY - 22, 4, 2); g.fillRect(244, WY - 22, 4, 2); }
      if (spot === 'lake') for (const px of [60, 140, 300]) { g.fillStyle = '#5a4028'; g.fillRect(px, WY - 24, 2, 14); g.fillStyle = '#2c8038'; g.fillRect(px - 6, WY - 26, 14, 3); g.fillRect(px - 8, WY - 24, 4, 2); g.fillRect(px + 6, WY - 24, 4, 2); }
      // Water
      for (let y = WY; y < LANE_TOP; y++) for (let x = 0; x < W; x++) {
        const k = (y - WY) / (LANE_TOP - WY);
        const col = k + (Pixel.hash(x, y, 5) - 0.5) * 0.12 > 0.55 ? L.deep : L.water;
        g.fillStyle = col; g.fillRect(x, y, 1, 1);
      }
      g.fillStyle = `rgb(${Pixel.shade(L.water, 1.3).slice(0, 3).join(',')})`;
      g.fillRect(0, WY, W, 1);
      return c;
    });
  }

  function line(g, x0, y0, x1, y1, col) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    g.fillStyle = col;
    for (let i = 0; i < 600; i++) {
      g.fillRect(x0, y0, 1, 1);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
  // A sagging fishing line.
  function curve(g, x0, y0, x1, y1, sag, col) {
    let px = x0, py = y0;
    for (let i = 1; i <= 16; i++) {
      const k = i / 16, x = x0 + (x1 - x0) * k, y = y0 + (y1 - y0) * k + Math.sin(k * Math.PI) * sag;
      line(g, px, py, x, y, col); px = x; py = y;
    }
  }

  function drawPlatform(g) {
    const kind = T.look.ground, y = deckY();
    const bobY = kind === 'dock' || kind === 'rocks' ? 0 : Math.round(Math.sin(T.anim * 1.5));
    g.save(); g.translate(0, bobY);
    if (kind === 'dock') {
      g.fillStyle = '#5a3c20'; for (const px of [8, 30, 50]) g.fillRect(px, y, 3, 16);
      g.fillStyle = '#9a6a38'; g.fillRect(0, y, 58, 4); g.fillStyle = '#b88048'; g.fillRect(0, y, 58, 1);
      g.fillStyle = '#6a4828'; for (let px = 6; px < 58; px += 8) g.fillRect(px, y, 1, 4);
    } else if (kind === 'rocks') {
      g.fillStyle = '#5c6070'; g.fillRect(12, y, 34, 6); g.fillRect(16, y - 2, 24, 2);
      g.fillStyle = '#8890a0'; g.fillRect(16, y - 2, 24, 1); g.fillRect(12, y, 4, 1);
    } else if (kind === 'rowboat') {
      g.fillStyle = '#8a5a30'; g.fillRect(10, y, 52, 4); g.fillRect(14, y + 4, 44, 3);
      g.fillStyle = '#b07840'; g.fillRect(10, y, 52, 1); g.fillStyle = '#5a3a20'; g.fillRect(14, y + 6, 44, 1);
    } else if (kind === 'motorboat') {
      g.fillStyle = '#f0f0f0'; g.fillRect(4, y, 64, 5); g.fillRect(10, y + 5, 54, 3);
      g.fillStyle = '#d84040'; g.fillRect(4, y + 3, 64, 1); g.fillStyle = '#404850'; g.fillRect(0, y - 2, 6, 10);
    } else {
      g.fillStyle = '#304068'; g.fillRect(0, y, 80, 22); g.fillStyle = '#c84838'; g.fillRect(0, y + 14, 80, 3);
      g.fillStyle = '#e8e8e8'; g.fillRect(0, y - 16, 18, 16); g.fillStyle = '#88c8f0'; g.fillRect(3, y - 13, 5, 4); g.fillRect(10, y - 13, 5, 4);
      g.fillStyle = '#506080'; g.fillRect(0, y, 80, 1);
    }
    g.restore();
    return bobY;
  }

  function render(g) {
    if (!T) return;
    g.drawImage(background(), 0, 0);
    // Water shimmer
    g.fillStyle = 'rgba(255,255,255,0.35)';
    for (let i = 0; i < 18; i++) {
      const x = Math.floor((Pixel.hash(i, 9) * W + T.anim * (8 + i % 5)) % W), y = WY + 3 + Math.floor(Pixel.hash(i, 3) * 50);
      g.fillRect(x, y, 3 + (i % 3), 1);
    }
    const bob = drawPlatform(g), dy = deckY() + bob;
    const tp = tip();
    // Angler and rod
    const pull = T.state === 'fight' ? Math.sin(T.anim * 10) * (T.F.ring ? 2 : 0.5) : 0;
    g.drawImage(Sprites.person([0, 0, 2, 0, 0]), FX - 4, dy - 15);
    g.fillStyle = '#c84838'; g.fillRect(FX - 3, dy - 16, 8, 2); g.fillRect(FX - 1, dy - 17, 4, 1);  // cap
    line(g, FX + 4, dy - 7, tp.x, tp.y + bob + pull, '#6a4020');
    // Line, bobber and fish
    const st = T.state;
    if (st === 'casting') {
      const k = Math.min(1, T.t / 0.7), x = tp.x + (T.bob.x - tp.x) * k, y = tp.y + (WY - tp.y) * k - Math.sin(k * Math.PI) * 40;
      curve(g, tp.x, tp.y + bob, x, y, 2, '#e8e8e8');
      g.fillStyle = '#e83838'; g.fillRect(Math.round(x) - 1, Math.round(y) - 2, 3, 2); g.fillStyle = '#ffffff'; g.fillRect(Math.round(x) - 1, Math.round(y), 3, 1);
    } else if (st === 'waiting' || st === 'bite') {
      const plunge = st === 'bite' ? 3 + Math.round(Math.sin(T.t * 40)) : Math.round(T.bob.dip * 2);
      const bx = T.bob.x, by = WY + plunge;
      curve(g, tp.x, tp.y + bob, bx, by - 2, 8, '#e8e8e8');
      g.fillStyle = '#e83838'; g.fillRect(bx - 1, by - 3, 3, 2); g.fillStyle = '#ffffff'; g.fillRect(bx - 1, by - 1, 3, 1);
      g.fillStyle = 'rgba(255,255,255,0.6)'; const r = (T.anim * 6) % 6; g.fillRect(bx - 3 - r, WY + 1, 2, 1); g.fillRect(bx + 2 + r, WY + 1, 2, 1);
      if (st === 'waiting') g.drawImage(Sprites.silhouette(T.sp, 'rgba(10,30,60,0.35)'), bx + 20 + Math.round(Math.sin(T.anim) * 10), WY + 26);
      if (st === 'bite') {
        Pixel.text(g, '!', bx, WY - 30, '#f8e048', 3, 'center');
        Pixel.text(g, isTouch ? 'TAP NOW!' : 'HIT SPACE!', bx, WY - 12, '#ffffff', 1, 'center');
      }
    } else if (st === 'fight') {
      const p = fishPos(), F = T.F;
      const taut = F.tension / F.max;
      line(g, tp.x, tp.y + bob + pull, p.x + 2, p.y + 3, taut > 0.7 && Math.floor(T.anim * 12) % 2 ? '#f86858' : '#e8e8e8');
      g.drawImage(Sprites.silhouette(T.sp, 'rgba(8,24,48,0.6)'), Math.round(p.x), Math.round(p.y));
    }
    for (const s of T.splashes) { g.fillStyle = '#e8f8ff'; g.fillRect(Math.round(s.x), Math.round(s.y), 1, 1); }

    // Lane panel
    g.fillStyle = '#0c1430'; g.fillRect(0, LANE_TOP, W, H - LANE_TOP);
    g.fillStyle = '#f4f0e0'; g.fillRect(0, LANE_TOP, W, 1);
    if (st === 'fight') drawFight(g);
    else drawLaneIdle(g);
    drawHud(g);
    if (st === 'result') drawResult(g);
  }

  function laneY(lane, lanes) { return lanes === 2 ? (lane ? 164 : 140) : 152; }

  function drawLaneIdle(g) {
    const txt = {
      ready: coolerFull() ? (isTouch ? 'COOLER FULL - TAP TO HEAD HOME' : 'COOLER FULL - PRESS SPACE TO HEAD HOME') : (isTouch ? 'TAP TO CAST' : 'PRESS SPACE TO CAST'),
      casting: '', waiting: 'WAIT FOR THE BITE...', bite: '', result: '',
    }[T.state];
    if (T.state === 'ready' && Math.floor(T.anim * 2) % 2) return;
    Pixel.text(g, txt, W / 2, 148, '#ffffff', 1, 'center');
    if (T.msg) { Pixel.text(g, T.msg.text, W / 2, 132, T.msg.color, 1, 'center'); }
    if (T.state === 'waiting' && T.msg) Pixel.text(g, T.msg.sub, W / 2, 162, '#a8b0d8', 1, 'center');
  }

  function drawFight(g) {
    const F = T.F, t = songTime(), lanes = F.spec.lanes, speed = PX_PER_BEAT / F.beat;
    const xOf = (nt) => HIT_X + (nt - t) * speed;
    // Beat lines
    const firstBeat = Math.ceil((t - 1) / F.beat);
    for (let b = firstBeat; ; b++) {
      const x = Math.round(xOf(b * F.beat));
      if (x > W) break;
      g.fillStyle = b % 4 === 0 ? '#2c3870' : '#1a2448';
      g.fillRect(x, LANE_TOP + 4, 1, H - LANE_TOP - 8);
    }
    for (let l = 0; l < lanes; l++) {
      const y = laneY(l, lanes);
      g.fillStyle = '#18204a'; g.fillRect(0, y - 6, W, 13);
      // Hit ring
      const lit = T.held[l] || F.ring > 0.5;
      g.fillStyle = lit ? '#f8f0c0' : '#8890c8';
      g.fillRect(HIT_X - 6, y - 7, 13, 1); g.fillRect(HIT_X - 6, y + 7, 13, 1); g.fillRect(HIT_X - 7, y - 6, 1, 13); g.fillRect(HIT_X + 7, y - 6, 1, 13);
      if (lanes === 2) Pixel.text(g, isTouch ? (l ? 'R' : 'L') : (l ? 'J' : 'F'), 12, y - 2, '#8890c8', 1, 'center');
    }
    // Notes, far to near so near ones draw on top
    for (let i = F.notes.length - 1; i >= 0; i--) {
      const n = F.notes[i];
      if (n.state === 1 || n.state === 2 && !n.len) continue;
      const x0 = Math.round(xOf(n.t)), y = laneY(n.lane, lanes);
      if (x0 > W + 10) continue;
      const col = n.lane ? '#58c8f8' : '#f8a838', dark = n.lane ? '#2878a8' : '#b86818';
      if (n.len) {
        const x1 = Math.round(xOf(n.t + n.len));
        if (x1 < -10) continue;
        const from = n.state === 3 ? HIT_X : x0;
        g.fillStyle = n.state === 2 ? '#404860' : dark; g.fillRect(from, y - 3, Math.max(0, x1 - from), 7);
        g.fillStyle = n.state === 2 ? '#606880' : col; g.fillRect(from, y - 2, Math.max(0, x1 - from), 2);
        g.fillStyle = '#10101c'; g.fillRect(x1 - 1, y - 4, 2, 9);
        if (n.state === 3) continue;
      }
      if (x0 < -10) continue;
      g.fillStyle = '#10101c'; g.fillRect(x0 - 4, y - 3, 9, 7); g.fillRect(x0 - 3, y - 4, 7, 9);
      g.fillStyle = n.fight ? '#f85848' : col; g.fillRect(x0 - 3, y - 3, 7, 7);
      g.fillStyle = '#ffffff'; g.fillRect(x0 - 2, y - 2, 2, 1); g.fillRect(x0 - 2, y - 1, 1, 1);
      g.fillStyle = n.fight ? '#a82828' : dark; g.fillRect(x0 - 3, y + 2, 7, 1);
    }
    if (F.judge && F.judge.t < 0.5) Pixel.text(g, F.judge.text, HIT_X, LANE_TOP + 4 - Math.round(F.judge.t * 10), F.judge.color, 1, 'center');
    if (F.combo >= 5) Pixel.text(g, `${F.combo} COMBO`, W - 6, LANE_TOP + 4, '#f8e048', 1, 'right');
    // Count-in
    if (t < F.barDur) {
      const beatN = Math.floor(t / F.beat);
      Pixel.text(g, t < 0 ? 'READY' : ['3', '2', '1', 'GO!'][clamp(beatN, 0, 3)], W / 2, 34, '#ffffff', 3, 'center');
      Pixel.text(g, F.spec.lanes === 2 ? (isTouch ? 'TAP LEFT OR RIGHT SIDE IN TIME' : 'F / J IN TIME WITH THE NOTES') : (isTouch ? 'TAP IN TIME WITH THE NOTES' : 'SPACE IN TIME WITH THE NOTES'), W / 2, 56, '#ffffff', 1, 'center');
    } else if (F.notes.some((n) => n.fight && n.state === 0 && n.t - t < F.beat * 2 && n.t > t - F.beat)) {
      if (Math.floor(T.anim * 6) % 2) Pixel.text(g, 'IT\'S FIGHTING!', W / 2, 30, '#f85848', 2, 'center');
    }
  }

  function bar(g, x, y, w, frac, col, label) {
    Pixel.text(g, label, x - 3, y, '#ffffff', 1, 'right');
    g.fillStyle = '#f4f0e0'; g.fillRect(x - 1, y - 1, w + 2, 7);
    g.fillStyle = '#10101c'; g.fillRect(x, y, w, 5);
    g.fillStyle = col; g.fillRect(x, y, Math.round(w * clamp(frac, 0, 1)), 5);
  }

  function drawHud(g) {
    Pixel.text(g, `CASTS ${T.castsLeft}`, 4, 4, '#ffffff');
    Pixel.text(g, `COOLER ${Game.s.cooler.length}/${Game.coolerCap()}`, 4, 12, coolerFull() ? '#f8a040' : '#ffffff');
    if (T.state === 'fight') {
      const F = T.F, known = Game.s.dex[T.sp];
      Pixel.text(g, known ? SPECIES[T.sp].name : '???', W / 2, 4, '#f8e048', 1, 'center');
      bar(g, 150, 13, 90, F.progress / F.need, '#68d058', 'REEL');
      const k = F.tension / F.max;
      bar(g, 150, 22, 90, k, k > 0.7 ? (Math.floor(T.anim * 8) % 2 ? '#f84848' : '#f8a040') : '#f8a040', 'LINE');
    }
  }

  function drawResult(g) {
    const R = T.result, sp = SPECIES[R.sp];
    g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(0, 0, W, H);
    Pixel.panel(g, 60, 26, 200, 128);
    if (R.kind === 'caught') {
      Pixel.text(g, R.isNew ? 'NEW SPECIES!' : 'CAUGHT!', W / 2, 34, R.isNew ? '#f8e048' : '#88e070', 2, 'center');
      const s = Sprites.fish(R.sp), sc = s.width > 30 ? 2 : 3;
      g.drawImage(s, Math.round(W / 2 - s.width * sc / 2), Math.round(84 - s.height * sc / 2 + Math.sin(T.anim * 4) * 2), s.width * sc, s.height * sc);
      Pixel.text(g, sp.name, W / 2, 110, '#ffffff', 1, 'center');
      Pixel.text(g, `SIZE x${R.fish.w.toFixed(2)}   WORTH ABOUT ${fmt$(Game.price(R.fish, null) * 1.4)}`, W / 2, 120, '#a8b0d8', 1, 'center');
      Pixel.text(g, `${R.counts.perfect} PERFECT  ${R.counts.good} GOOD  ${R.counts.miss} MISS`, W / 2, 130, '#a8b0d8', 1, 'center');
    } else if (R.kind === 'snap') {
      Pixel.text(g, 'SNAP!', W / 2, 34, '#f85848', 2, 'center');
      const s = Sprites.silhouette(R.sp, '#3a4878');
      g.drawImage(s, Math.round(W / 2 - s.width), 60, s.width * 2, s.height * 2);
      Pixel.text(g, `A HUGE ${sp.name.toUpperCase()}!`, W / 2, 104, '#ffffff', 1, 'center');
      Pixel.text(g, `TOO STRONG FOR YOUR ${Game.rodName().toUpperCase()}.`, W / 2, 114, '#a8b0d8', 1, 'center');
      Pixel.text(g, `NEEDS A ${Game.rodName(sp.rod).toUpperCase()}`, W / 2, 124, '#f8e048', 1, 'center');
    } else {
      Pixel.text(g, R.kind === 'missed' ? 'TOO SLOW!' : 'IT GOT AWAY!', W / 2, 34, '#f85848', 2, 'center');
      const s = Sprites.silhouette(R.sp, '#3a4878');
      g.drawImage(s, Math.round(W / 2 - s.width), 64, s.width * 2, s.height * 2);
      Pixel.text(g, R.kind === 'missed' ? 'HOOK IT AS SOON AS THE BOBBER DIVES' : 'THE LINE SNAPPED', W / 2, 108, '#ffffff', 1, 'center');
      if (R.kind === 'lost') Pixel.text(g, 'STRONG LINE AND SMOOTH REEL UPGRADES HELP', W / 2, 118, '#a8b0d8', 1, 'center');
    }
    const more = T.castsLeft > 0 && !coolerFull();
    if (T.t > 0.5 && Math.floor(T.anim * 2) % 2 === 0) Pixel.text(g, (isTouch ? 'TAP' : 'SPACE') + (more ? ' TO CAST AGAIN' : ' TO HEAD BACK TO THE SHOP'), W / 2, 142, '#ffffff', 1, 'center');
  }

  return {
    start, update, render, press, release, end,
    active: () => !!T,
    lanes: () => (T && T.state === 'fight' ? T.F.spec.lanes : 1),
    fighting: () => !!T && T.state === 'fight',
    debug: () => ({ T, songTime: () => songTime() }),
  };
})();
