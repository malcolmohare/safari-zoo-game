// The shop: tanks on two rows of shelves, a counter and a door. Between fishing trips you stock and
// look after the tanks; when you open up, customers come in, browse the tanks and buy happy fish.

const Shop = (() => {
  const FLOOR_Y = 132;
  const DOOR = { x: 304, y: 86, w: 14, h: 46 };
  const COUNTER = { x: 244, y: 112, w: 52, h: 20 };
  const DAY_LEN = 36;          // seconds customers keep arriving
  const PATIENCE = 14;         // seconds a customer waits at the counter

  let t = 0;
  let mode = 'closed';         // 'closed' | 'open'
  let selected = null;         // fish id picked from the cooler, waiting to be dropped in a tank
  const swim = new Map();      // fish id -> swim state (not saved)
  let custs = [], floats = [], day = null;

  // Where each tank slot sits: 3 per row, two rows.
  function slotBox(i) {
    const col = i % 3, row = Math.floor(i / 3);
    return { x: 4 + col * 79, w: 76, bottom: row ? 124 : 62 };
  }
  function tankRect(i) {
    const tank = Game.s.tanks[i], b = slotBox(i), T = TANKS[tank ? tank.size : 0];
    return { x: Math.round(b.x + (b.w - T.w) / 2), y: b.bottom - T.h, w: T.w, h: T.h };
  }

  // ---------------- Open for business ----------------
  function open(onClose) {
    const s = Game.s;
    const n = 3 + Math.floor(s.rep) + s.up.ads * 2 + Math.min(4, Math.floor(s.day / 5));
    day = { onClose, total: n, spawned: 0, t: 0, sales: [], happy: 0, sad: 0, closing: false };
    mode = 'open';
    selected = null;
    Snd.sfx.bell();
    Analytics.track('shop_open', { day: s.day, customers: n });
  }
  function closeEarly() { if (day) day.closing = true; }

  function reservedIds() { return new Set(custs.filter((c) => c.pick).map((c) => c.pick.id)); }

  function spawn() {
    const s = Game.s, stocked = [...new Set(Game.allFish().map((f) => f.sp))];
    const known = Object.keys(SPECIES).filter((k) => Game.spotOpen(SPECIES[k].spot));
    let want = null;
    if (Math.random() < 0.4) {
      want = stocked.length && Math.random() < 0.6 ? stocked[randInt(0, stocked.length - 1)] : known[randInt(0, known.length - 1)];
    }
    const tanks = s.tanks.map((tk, i) => (tk && tk.fish.length ? i : -1)).filter((i) => i >= 0).sort(() => Math.random() - 0.5);
    custs.push({ x: DOOR.x + 6, y: FLOOR_Y + 12, tx: 0, ty: 0, look: Sprites.randomLook(), state: 'enter', want, visits: tanks.slice(0, 3),
      t: 0, wait: 0, flip: true, bubble: want ? { sp: want, think: true } : null, speed: rand(34, 46) });
  }

  function walkTo(c, x, y, state) { c.tx = x; c.ty = y; c.state = 'walk'; c.next = state; }

  function nextTank(c) {
    if (!c.visits.length) { leave(c, false); return; }
    const i = c.visits.shift(), r = tankRect(i);
    c.tank = i;
    walkTo(c, r.x + r.w / 2 + rand(-8, 8), FLOOR_Y + rand(10, 20), 'browse');
  }

  function choose(c) {
    const tank = Game.s.tanks[c.tank];
    if (!tank) return null;
    const taken = reservedIds(), min = minHappy(Game.s.day);
    const ok = tank.fish.filter((f) => !taken.has(f.id) && (!c.want || f.sp === c.want) && Game.mood(f, tank).h >= min);
    if (!ok.length) {
      if (tank.fish.some((f) => (!c.want || f.sp === c.want) && Game.mood(f, tank).h < min)) c.complaint = 'unhappy';
      return null;
    }
    return ok[randInt(0, ok.length - 1)];
  }

  function leave(c, happy) {
    if (!happy) {
      day.sad++;
      Game.s.rep = clamp(Game.s.rep - (c.want ? 0.06 : 0.03), 0, 5);
      c.bubble = { text: c.complaint === 'unhappy' ? ':( SAD FISH' : c.want ? ':( NONE' : ':(' };
      Snd.sfx.sad();
    }
    c.pick = null;
    walkTo(c, DOOR.x + 6, FLOOR_Y + 12, 'gone');
  }

  function queue() { return custs.filter((c) => c.state === 'queue' || (c.state === 'walk' && c.next === 'queue')); }

  function checkout(c) {
    const tank = Game.s.tanks[c.pick.tank], f = tank && tank.fish.find((x) => x.id === c.pick.id);
    if (!f) { leave(c, false); return; }
    const price = Math.round(Game.price(f, tank) * (c.want ? 1.3 : 1));
    tank.fish.splice(tank.fish.indexOf(f), 1);
    swim.delete(f.id);
    Game.s.money += price;
    Game.s.stats.sold++; Game.s.stats.earned += price;
    Game.s.rep = clamp(Game.s.rep + (c.want ? 0.07 : 0.04), 0, 5);
    day.sales.push({ sp: f.sp, price });
    day.happy++;
    floats.push({ x: c.x, y: c.y - 26, text: '+' + fmt$(price), col: '#f8e048', t: 1.2 });
    c.bubble = { heart: true };
    c.pick = null;
    Snd.sfx.coin();
    walkTo(c, DOOR.x + 6, FLOOR_Y + 12, 'gone');
  }

  function updateDay(dt) {
    day.t += dt;
    const every = DAY_LEN / day.total;
    if (!day.closing && day.spawned < day.total && day.t >= day.spawned * every + 0.5) { spawn(); day.spawned++; }
    const q = queue();
    for (const c of custs) {
      c.t += dt;
      if (c.state === 'enter') nextTank(c);
      else if (c.state === 'walk') {
        const dx = c.tx - c.x, dy = c.ty - c.y, d = Math.hypot(dx, dy), step = c.speed * dt;
        if (d <= step) { c.x = c.tx; c.y = c.ty; c.state = c.next; c.t = 0; }
        else { c.x += dx / d * step; c.y += dy / d * step; c.flip = dx < 0; }
        if (c.next === 'queue') { const qi = q.indexOf(c); c.tx = COUNTER.x + 30 - qi * 13; }
      } else if (c.state === 'browse') {
        if (c.t > 1.4) {
          const f = choose(c);
          if (f) {
            c.pick = { id: f.id, tank: c.tank };
            c.bubble = { sp: f.sp };
            walkTo(c, COUNTER.x + 30, FLOOR_Y + 8, 'queue');
          } else nextTank(c);
        }
      } else if (c.state === 'queue') {
        const qi = q.indexOf(c), x = COUNTER.x + 30 - qi * 13;
        if (Math.abs(c.x - x) > 1) c.x += Math.sign(x - c.x) * Math.min(Math.abs(x - c.x), 40 * dt);
        c.flip = false;
        c.wait += dt;
        if (qi === 0 && Game.s.up.cashier && c.t > 1.2) checkout(c);
        else if (c.wait > PATIENCE) { floats.push({ x: c.x, y: c.y - 26, text: 'TOO SLOW!', col: '#f86858', t: 1.2 }); c.complaint = 'slow'; Game.s.rep = clamp(Game.s.rep - 0.05, 0, 5); leave(c, false); }
      }
    }
    custs = custs.filter((c) => c.state !== 'gone');
    if ((day.spawned >= day.total || day.closing) && !custs.length) {
      const d = day;
      day = null; mode = 'closed';
      Analytics.track('shop_close', { day: Game.s.day, sold: d.sales.length, happy: d.happy, sad: d.sad });
      d.onClose(d);
    }
  }

  // ---------------- Fish swimming ----------------
  function swimState(f, r) {
    let s = swim.get(f.id);
    if (!s) { s = { x: rand(0.1, 0.9), y: rand(0.2, 0.8), tx: 0.5, ty: 0.5, wait: rand(0, 2), flip: Math.random() < 0.5 }; swim.set(f.id, s); }
    return s;
  }
  function updateFish(dt) {
    for (const tk of Game.s.tanks) {
      if (!tk) continue;
      for (const f of tk.fish) {
        const s = swimState(f), sp = SPECIES[f.sp];
        if (s.wait > 0) { s.wait -= dt; if (s.wait <= 0) { s.tx = rand(0.05, 0.95); s.ty = rand(0.15, 0.85); } continue; }
        const dx = s.tx - s.x, dy = s.ty - s.y, d = Math.hypot(dx, dy), v = (sp.school ? 0.35 : 0.2) * dt;
        if (d < v) { s.wait = rand(0.4, 2.5); continue; }
        s.x += dx / d * v; s.y += dy / d * v * 0.6;
        if (Math.abs(dx) > 0.02) s.flip = dx < 0;
      }
    }
  }

  function update(dt) {
    t += dt;
    updateFish(dt);
    if (mode === 'open' && day) updateDay(dt);
    for (const f of floats) { f.t -= dt; f.y -= dt * 10; }
    floats = floats.filter((f) => f.t > 0);
  }

  // ---------------- Input ----------------
  function tap(x, y) {
    if (mode === 'open') {
      // Ring up whoever you tap in the queue (or the front of the queue if you tap the counter).
      const q = queue().filter((c) => c.state === 'queue');
      let hit = q.find((c) => Math.abs(c.x - x) < 8 && y > c.y - 20 && y < c.y + 4);
      if (!hit && x >= COUNTER.x - 4 && x <= COUNTER.x + COUNTER.w + 4 && y >= COUNTER.y - 20 && y <= FLOOR_Y + 30) hit = q[0];
      if (hit) checkout(hit);
      return;
    }
    const s = Game.s;
    for (let i = 0; i < s.tanks.length; i++) {
      const b = slotBox(i);
      if (x < b.x || x > b.x + b.w || y < b.bottom - 50 || y > b.bottom + 4) continue;
      if (!s.tanks[i]) { UI.openBuyTank(i); return; }
      if (selected !== null) {
        const id = selected;
        selected = null;
        Game.moveFish(id, i);
        Snd.sfx.plop();
        UI.refresh();
      } else UI.openTank(i);
      return;
    }
  }

  // ---------------- Drawing ----------------
  const WATER = {
    fresh: { cold: '#78b8e0', temperate: '#4890c8', tropical: '#3aa8a0' },
    salt: { cold: '#3878b8', temperate: '#30a0c8', tropical: '#28c0c8' },
  };

  function drawRoom(g) {
    return Pixel.memo('room', () => {
      const c = Pixel.canvas(W, H), r = c.getContext('2d');
      for (let y = 0; y < FLOOR_Y; y++) for (let x = 0; x < W; x++) {
        r.fillStyle = (x % 16 < 8) ? '#2c4a5c' : '#2a4656';
        if (y % 32 === 0) r.fillStyle = '#26404e';
        r.fillRect(x, y, 1, 1);
      }
      for (let y = FLOOR_Y; y < H; y++) for (let x = 0; x < W; x++) {
        const plank = Math.floor((y - FLOOR_Y) / 6), off = (plank * 23) % 40;
        r.fillStyle = (y - FLOOR_Y) % 6 === 0 || (x + off) % 40 === 0 ? '#6a4628' : Pixel.hash(x >> 3, plank) < 0.5 ? '#94683c' : '#8a5e36';
        r.fillRect(x, y, 1, 1);
      }
      r.fillStyle = '#1c303c'; r.fillRect(0, FLOOR_Y - 2, W, 2);
      // Shelves
      for (const sy of [62, 124]) { r.fillStyle = '#6a4628'; r.fillRect(2, sy, 238, 4); r.fillStyle = '#9a6a3a'; r.fillRect(2, sy, 238, 1); r.fillStyle = '#4a3018'; r.fillRect(2, sy + 4, 238, 1); }
      for (const px of [4, 82, 161, 236]) { r.fillStyle = '#5a3a20'; r.fillRect(px, 66, 3, 58); r.fillRect(px, 128, 3, 4); }
      // Door
      r.fillStyle = '#10101c'; r.fillRect(DOOR.x - 1, DOOR.y - 1, DOOR.w + 2, DOOR.h + 1);
      r.fillStyle = '#7a5030'; r.fillRect(DOOR.x, DOOR.y, DOOR.w, DOOR.h);
      r.fillStyle = '#a8d8f0'; r.fillRect(DOOR.x + 3, DOOR.y + 4, DOOR.w - 6, 14);
      r.fillStyle = '#e8c048'; r.fillRect(DOOR.x + 2, DOOR.y + 26, 2, 2);
      // Counter
      r.fillStyle = '#10101c'; r.fillRect(COUNTER.x - 1, COUNTER.y - 1, COUNTER.w + 2, COUNTER.h + 1);
      r.fillStyle = '#a87040'; r.fillRect(COUNTER.x, COUNTER.y, COUNTER.w, COUNTER.h);
      r.fillStyle = '#c89058'; r.fillRect(COUNTER.x, COUNTER.y, COUNTER.w, 3);
      r.fillStyle = '#7a4c28'; for (let x = COUNTER.x + 6; x < COUNTER.x + COUNTER.w; x += 10) r.fillRect(x, COUNTER.y + 5, 1, COUNTER.h - 5);
      // Register
      r.fillStyle = '#10101c'; r.fillRect(COUNTER.x + 33, COUNTER.y - 9, 14, 9);
      r.fillStyle = '#586078'; r.fillRect(COUNTER.x + 34, COUNTER.y - 8, 12, 8);
      r.fillStyle = '#68e070'; r.fillRect(COUNTER.x + 36, COUNTER.y - 7, 8, 3);
      return c;
    });
  }

  function hearts(g, x, y, h, col = '#f85878') {
    const n = Game.hearts(h);
    for (let i = 0; i < 5; i++) {
      g.fillStyle = i < n ? col : '#28304c';
      const hx = x + i * 6;
      g.fillRect(hx, y, 2, 2); g.fillRect(hx + 3, y, 2, 2); g.fillRect(hx, y + 1, 5, 2); g.fillRect(hx + 1, y + 3, 3, 1); g.fillRect(hx + 2, y + 4, 1, 1);
    }
  }

  function drawTank(g, i) {
    const tk = Game.s.tanks[i], r = tankRect(i), b = slotBox(i);
    if (!tk) {
      if (mode === 'closed') {
        g.fillStyle = 'rgba(244,240,224,0.35)';
        for (let x = b.x + 12; x < b.x + b.w - 12; x += 4) { g.fillRect(x, b.bottom - 34, 2, 1); g.fillRect(x, b.bottom - 1, 2, 1); }
        for (let y = b.bottom - 34; y < b.bottom; y += 4) { g.fillRect(b.x + 12, y, 1, 2); g.fillRect(b.x + b.w - 13, y, 1, 2); }
        Pixel.text(g, '+ TANK', b.x + b.w / 2, b.bottom - 22, '#f4f0e0', 1, 'center');
        Pixel.text(g, fmt$(TANKS[0].cost), b.x + b.w / 2, b.bottom - 13, '#f8e048', 1, 'center');
      }
      return;
    }
    const water = WATER[tk.water][tk.temp];
    g.fillStyle = '#10101c'; g.fillRect(r.x - 1, r.y - 1, r.w + 2, r.h + 1);
    g.fillStyle = '#c8dce4'; g.fillRect(r.x, r.y, r.w, r.h);
    g.fillStyle = water; g.fillRect(r.x + 1, r.y + 3, r.w - 2, r.h - 4);
    g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(r.x + 1, r.y + 3, r.w - 2, 2);
    g.fillStyle = 'rgba(0,0,40,0.15)'; g.fillRect(r.x + 1, r.y + r.h - 9, r.w - 2, 8);
    // Sand and decor
    const by = r.y + r.h - 1;
    g.fillStyle = tk.water === 'salt' ? '#e8d8a8' : '#c8a868'; g.fillRect(r.x + 1, by - 3, r.w - 2, 3);
    if (tk.decor.rocks) {
      g.fillStyle = '#10101c'; g.fillRect(r.x + r.w - 17, by - 9, 12, 7); g.fillRect(r.x + r.w - 21, by - 6, 6, 4);
      g.fillStyle = '#7880a0'; g.fillRect(r.x + r.w - 16, by - 8, 10, 5); g.fillRect(r.x + r.w - 20, by - 5, 4, 2);
      g.fillStyle = '#a0a8c0'; g.fillRect(r.x + r.w - 16, by - 8, 9, 1);
      g.fillStyle = '#303448'; g.fillRect(r.x + r.w - 13, by - 5, 3, 2);
    }
    if (tk.decor.plants) for (let k = 0; k < 3; k++) {
      const px = r.x + 4 + k * 4, ph = 10 + (k % 2) * 6;
      for (let y = 0; y < ph; y++) {
        const sway = Math.round(Math.sin(t * 2 + y * 0.3 + k) * (y / ph) * 2);
        g.fillStyle = y % 3 === 0 ? '#58c048' : '#3a9038'; g.fillRect(px + sway, by - 3 - y, 2, 1);
      }
    }
    if (tk.decor.coral) {
      const cx = r.x + Math.round(r.w / 2) + 2;
      g.fillStyle = '#f87898'; g.fillRect(cx, by - 10, 2, 7); g.fillRect(cx - 3, by - 8, 2, 5); g.fillRect(cx + 3, by - 9, 2, 4); g.fillRect(cx - 3, by - 5, 8, 2);
      g.fillStyle = '#f8a868'; g.fillRect(cx + 6, by - 6, 3, 3); g.fillRect(cx + 7, by - 8, 1, 2);
    }
    // Fish
    for (const f of tk.fish) {
      const s = swimState(f), sp = Sprites.fish(f.sp, s.flip);
      const ix = r.x + 2, iy = r.y + 4, iw = r.w - 4 - sp.width, ih = r.h - 9 - sp.height;
      const x = iw > 0 ? ix + s.x * iw : r.x + (r.w - sp.width) / 2, y = ih > 0 ? iy + s.y * ih : iy;
      g.drawImage(sp, Math.round(x), Math.round(y));
    }
    // Bubbles from the filter
    g.fillStyle = 'rgba(255,255,255,0.7)';
    for (let k = 0; k < 3; k++) { const p = ((t * 0.5 + k / 3 + i * 0.37) % 1); g.fillRect(r.x + r.w - 4 + Math.round(Math.sin(p * 9) * 1), Math.round(by - 4 - p * (r.h - 9)), 1, 1); }
    // Dirt
    if (tk.clean < 100) { g.fillStyle = `rgba(96,112,40,${(1 - tk.clean / 100) * 0.55})`; g.fillRect(r.x + 1, r.y + 3, r.w - 2, r.h - 4); }
    // Heater / chiller
    if (tk.temp !== 'temperate') { g.fillStyle = tk.temp === 'cold' ? '#58a8f8' : '#f86040'; g.fillRect(r.x + 2, r.y + 5, 2, 6); }
    // Labels above: happiness, or a preview for the fish you're placing
    const ly = r.y - 8;
    if (selected !== null && mode === 'closed') {
      const loc = Game.findFish(selected);
      if (loc) {
        const m = Game.mood(loc.f, tk, loc.f);
        if (m.lethal) Pixel.text(g, 'DEADLY', r.x + r.w / 2, ly, Math.floor(t * 4) % 2 ? '#f85848' : '#f8a040', 1, 'center');
        else hearts(g, r.x + r.w / 2 - 14, ly, m.h, '#f8e048');
      }
    } else if (tk.fish.length) {
      const moods = tk.fish.map((f) => Game.mood(f, tk));
      const bad = moods.some((m) => m.lethal);
      if (bad && Math.floor(t * 3) % 2) Pixel.text(g, '! DANGER', r.x + r.w / 2, ly, '#f85848', 1, 'center');
      else hearts(g, r.x + r.w / 2 - 14, ly, moods.reduce((a, m) => a + m.h, 0) / moods.length);
    } else if (mode === 'closed') Pixel.text(g, 'EMPTY', r.x + r.w / 2, ly, '#8890b0', 1, 'center');
    Pixel.text(g, `${Game.used(tk)}/${TANKS[tk.size].cap}`, r.x + r.w - 1, r.y + r.h + 2 > b.bottom ? b.bottom - 6 : r.y + r.h - 6, '#ffffff', 1, 'right', null);
  }

  function drawBubble(g, c) {
    const bx = Math.round(c.x), by = Math.round(c.y - 22);
    if (c.bubble.sp) {
      const s = Game.s.dex[c.bubble.sp] ? Sprites.fish(c.bubble.sp) : Sprites.silhouette(c.bubble.sp, '#3a4878');
      const w = s.width + 6, h = s.height + 6, x = bx - Math.round(w / 2), y = by - h;
      g.fillStyle = '#10101c'; g.fillRect(x - 1, y - 1, w + 2, h + 2);
      g.fillStyle = c.bubble.think ? '#e0e8f8' : '#fff8e8'; g.fillRect(x, y, w, h);
      g.fillRect(bx - 1, y + h, 3, 2); g.fillStyle = '#10101c'; g.fillRect(bx - 2, y + h + 1, 1, 1); g.fillRect(bx + 2, y + h + 1, 1, 1);
      g.drawImage(s, x + 3, y + 3);
      if (c.state === 'queue') {
        const k = 1 - c.wait / PATIENCE;
        g.fillStyle = '#10101c'; g.fillRect(x, y - 4, w, 3);
        g.fillStyle = k > 0.4 ? '#68d058' : '#f85848'; g.fillRect(x, y - 4, Math.round(w * k), 3);
      }
    } else if (c.bubble.heart) {
      hearts(g, bx - 2, by - 6, 0.2);
    } else if (c.bubble.text) Pixel.text(g, c.bubble.text, bx, by - 6, '#f86858', 1, 'center');
  }

  function render(g) {
    g.drawImage(drawRoom(g), 0, 0);
    for (let i = 0; i < Game.s.tanks.length; i++) drawTank(g, i);
    // Open/closed sign
    const open = mode === 'open';
    g.fillStyle = '#10101c'; g.fillRect(253, 47, 34, 13);
    g.fillStyle = open ? '#38a048' : '#a83838'; g.fillRect(254, 48, 32, 11);
    Pixel.text(g, open ? 'OPEN' : 'CLOSED', 270, 51, '#ffffff', 1, 'center', null);
    g.fillStyle = '#c8c0a8'; g.fillRect(260, 40, 1, 7); g.fillRect(279, 40, 1, 7);
    // Shopkeeper (and cashier) behind the counter
    g.drawImage(Sprites.person([1, 1, 7, 0, 1]), COUNTER.x + 12, COUNTER.y - 14);
    if (Game.s.up.cashier) g.drawImage(Sprites.person([3, 3, 4, 2, 1]), COUNTER.x + 34, COUNTER.y - 14);
    g.fillStyle = '#a87040'; g.fillRect(COUNTER.x, COUNTER.y, COUNTER.w, 2);
    // Customers, back to front
    for (const c of custs.slice().sort((a, b) => a.y - b.y)) {
      const moving = c.state === 'walk';
      g.drawImage(Sprites.person(c.look, moving && Math.floor(c.t * 6) % 2 ? 1 : 0, c.flip), Math.round(c.x - 5), Math.round(c.y - 15));
    }
    for (const c of custs) if (c.bubble && (c.state !== 'walk' || c.next !== 'browse')) drawBubble(g, c);
    for (const f of floats) Pixel.text(g, f.text, f.x, f.y, f.col, 1, 'center');
    if (open && day) {
      const left = day.total - day.spawned;
      Pixel.text(g, day.closing ? 'CLOSING...' : `CUSTOMERS LEFT TODAY: ${left + custs.length}`, 316, 4, '#ffffff', 1, 'right');
      if (!Game.s.up.cashier && custs.some((c) => c.state === 'queue') && Math.floor(t * 2) % 2) Pixel.text(g, isTouch ? 'TAP CUSTOMERS TO RING THEM UP' : 'CLICK CUSTOMERS TO RING THEM UP', 160, 172, '#f8e048', 1, 'center');
    } else if (selected !== null) Pixel.text(g, isTouch ? 'TAP A TANK TO PUT IT IN' : 'CLICK A TANK TO PUT IT IN', 160, 172, '#f8e048', 1, 'center');
  }

  return {
    update, render, tap, open, closeEarly,
    isOpen: () => mode === 'open',
    select(id) { selected = selected === id ? null : id; },
    selected: () => selected,
    deselect() { selected = null; },
    resetSwim() { swim.clear(); },
  };
})();
