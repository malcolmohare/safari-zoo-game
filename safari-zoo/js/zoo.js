// The zoo: a walkable top-down map. You control the zookeeper, carry animals from the
// truck to their enclosures, and walk up to buildings to buy upgrades.

const Zoo = (() => {
  const PW = 300, PH = 210, G = 90;     // plot size and path width
  const COLS = ECON.plotCols, ROWS = ECON.plotRows;
  const GRID_W = COLS * PW + (COLS + 1) * G;
  const GRID_H = ROWS * PH + (ROWS + 1) * G;
  const WORLD_W = GRID_W, WORLD_H = GRID_H + 360;
  const KEEPER_R = 14, KEEPER_SPEED = 240, REACH = 34;

  const BUILDINGS = [
    { id: 'office', name: 'Office',       emoji: '🏢', x: 140,  y: GRID_H + 60, w: 210, h: 130, wall: '#d9c7a3', roof: '#b5654a', label: 'OFFICE' },
    { id: 'garage', name: 'Garage',       emoji: '🔧', x: 420,  y: GRID_H + 60, w: 210, h: 130, wall: '#c9ccd1', roof: '#5b6b7a', label: 'GARAGE' },
    { id: 'truck',  name: 'Animal Truck', emoji: '🚚', x: 1030, y: GRID_H + 80, w: 170, h: 100 },
    { id: 'jeep',   name: 'Safari Jeep',  emoji: '🚙', x: 1290, y: GRID_H + 80, w: 150, h: 100 },
  ];

  const VIEW_TOP = 66, VIEW_BOTTOM = 46;  // screen space kept clear for the top bar and bottom hints
  let canvas, ctx, view, W = 0, H = 0;
  let t = 0;
  const keeper = { x: GRID_W / 2, y: GRID_H + 260, flip: false, dir: 0, moving: false, step: 0 };
  const cam = { x: keeper.x, y: keeper.y };
  let target = null;          // current interactable
  let toast = null;           // { text, t }
  const animalPos = new Map(); // animal id -> wander state (not saved)
  let visitors = [];

  function init(c) {
    canvas = c;
    ctx = c.getContext('2d');
    view = Pixel.makeView(c);
  }

  function resize() {
    // Chunky 2 CSS px art pixels, a little smaller on phones so more of the zoo fits.
    const small = window.innerWidth < 700 || window.innerHeight < 500;
    view.resize(small ? 1.5 : 2);
    W = view.W; H = view.H;
  }

  // Back at the zoo after a safari: stand next to the truck.
  function arriveHome() {
    const tr = BUILDINGS.find((b) => b.id === 'truck');
    keeper.x = tr.x + tr.w / 2;
    keeper.y = tr.y + tr.h + 40;
    cam.x = keeper.x; cam.y = keeper.y;
  }

  function plotRect(i) {
    const c = i % COLS, rFromBottom = Math.floor(i / COLS);
    const r = ROWS - 1 - rFromBottom;
    return { x: G + c * (PW + G), y: G + r * (PH + G), w: PW, h: PH };
  }

  function showToast(text) { toast = { text, t: 2.8 }; }

  // ---------------- Movement & collision ----------------

  function solids() {
    const out = BUILDINGS.slice();
    Game.s.plots.forEach((p, i) => {
      if (p.enclosure || !Game.isPlotUnlocked(i)) out.push(plotRect(i));
    });
    return out;
  }

  function hits(x, y, rects) {
    for (const r of rects) {
      const cx = clamp(x, r.x, r.x + r.w), cy = clamp(y, r.y, r.y + r.h);
      if ((x - cx) ** 2 + (y - cy) ** 2 < KEEPER_R * KEEPER_R) return true;
    }
    return false;
  }

  function rectDist(x, y, r) {
    const cx = clamp(x, r.x, r.x + r.w), cy = clamp(y, r.y, r.y + r.h);
    return Math.hypot(x - cx, y - cy);
  }

  // ---------------- Interaction ----------------

  function findTarget() {
    let best = null, bestD = REACH;
    for (const b of BUILDINGS) {
      const d = rectDist(keeper.x, keeper.y, b);
      if (d < bestD) { bestD = d; best = { kind: b.id, rect: b }; }
    }
    for (let i = 0; i < Game.s.plots.length; i++) {
      const r = plotRect(i);
      const d = rectDist(keeper.x, keeper.y, r);
      if (d < bestD) { bestD = d; best = { kind: 'plot', idx: i, rect: r }; }
    }
    return best;
  }

  function promptFor(tg) {
    if (!tg) return null;
    const s = Game.s, carry = s.carrying ? SPECIES[s.carrying.sp] : null;
    switch (tg.kind) {
      case 'office': return 'E: Office — collection, upgrade tiers & field guide';
      case 'garage': return 'E: Garage — upgrade jeep & nets';
      case 'jeep': return 'E: Go on safari!';
      case 'truck':
        if (carry) return `E: Put the ${carry.name} back in the truck`;
        return s.holding.length ? `E: Unload animals (${s.holding.length} waiting)` : 'The truck is empty';
      case 'plot': {
        const i = tg.idx, enc = s.plots[i].enclosure;
        if (!Game.isPlotUnlocked(i)) return `E: Buy this plot (${costLabel(Game.landCost())})`;
        if (!enc) return carry ? 'Build an enclosure here first (E)' : 'E: Build an enclosure';
        const b = BIOMES[enc.biome];
        if (carry) {
          if (carry.biome !== enc.biome) return `${carry.name}s need a ${BIOMES[carry.biome].name} enclosure`;
          if (enc.animals.length >= enc.capacity) return 'This enclosure is full';
          return `E: Put the ${carry.name} in here`;
        }
        return `E: ${b.name} enclosure (${enc.animals.length}/${enc.capacity})`;
      }
    }
    return null;
  }

  function interact(tg) {
    const s = Game.s;
    switch (tg.kind) {
      case 'office': UI.openOffice(); break;
      case 'garage': UI.openGarage(); break;
      case 'jeep': UI.openSafariConfirm(); break;
      case 'truck':
        if (s.carrying) { Game.returnCarried(); Sfx.hit(); showToast('Back in the truck.'); }
        else if (s.holding.length) UI.openTruck();
        else { Sfx.error(); showToast('The truck is empty. Go on a safari to catch animals!'); }
        break;
      case 'plot': {
        const i = tg.idx, enc = s.plots[i].enclosure;
        if (!Game.isPlotUnlocked(i)) UI.openLand(i);
        else if (!enc) UI.openBuild(i);
        else if (s.carrying) {
          const name = SPECIES[s.carrying.sp].name;
          const err = Game.placeCarried(i);
          if (err) { Sfx.error(); showToast(err); }
          else {
            Sfx.capture();
            const t = Game.checkTierUp();
            if (t) { Game.save(); showToast(`🏆 Tier ${t} unlocked! New upgrades at the Garage.`); }
            else showToast(`The ${name} has a new home! 🎉`);
          }
        } else UI.openEnclosure(i);
        break;
      }
    }
    UI.refresh();
  }

  // ---------------- Update ----------------

  function update(dt, input) {
    t += dt;
    if (toast) { toast.t -= dt; if (toast.t <= 0) toast = null; }
    updateAnimals(dt);
    syncVisitors();
    updateVisitors(dt);

    updateCamera(dt);
    if (UI.isModalOpen()) { keeper.moving = false; return; }

    let dx = 0, dy = 0, mag = 1;
    if (input.down('KeyA', 'ArrowLeft')) dx -= 1;
    if (input.down('KeyD', 'ArrowRight')) dx += 1;
    if (input.down('KeyW', 'ArrowUp')) dy -= 1;
    if (input.down('KeyS', 'ArrowDown')) dy += 1;
    if (input.axis.active && Math.hypot(input.axis.x, input.axis.y) > 0.15) {
      dx = input.axis.x; dy = input.axis.y;
      mag = Math.min(1, Math.hypot(dx, dy) * 1.2);
    }
    keeper.moving = dx !== 0 || dy !== 0;
    if (keeper.moving) {
      const len = Math.hypot(dx, dy);
      const vx = dx / len * KEEPER_SPEED * mag * dt, vy = dy / len * KEEPER_SPEED * mag * dt;
      const rects = solids();
      const nx = clamp(keeper.x + vx, KEEPER_R, WORLD_W - KEEPER_R);
      if (!hits(nx, keeper.y, rects)) keeper.x = nx;
      const ny = clamp(keeper.y + vy, KEEPER_R, WORLD_H - KEEPER_R);
      if (!hits(keeper.x, ny, rects)) keeper.y = ny;
      if (dx) keeper.flip = dx > 0;
      keeper.dir = Math.abs(dx) > Math.abs(dy) ? 2 : dy < 0 ? 1 : 0;
      keeper.step += dt * 12;
    }

    target = findTarget();
    if (target && input.pressed('KeyE')) interact(target);

  }

  function viewH() { return Math.max(100, H - VIEW_TOP - VIEW_BOTTOM); }

  function updateCamera(dt) {
    const zoom = view.css / Pixel.ART;   // CSS px per world unit
    const vw = W / zoom, vh = viewH() / zoom;
    cam.x = lerp(cam.x, keeper.x, Math.min(1, dt * 6));
    cam.y = lerp(cam.y, keeper.y, Math.min(1, dt * 6));
    cam.x = vw >= WORLD_W ? WORLD_W / 2 : clamp(cam.x, vw / 2, WORLD_W - vw / 2);
    cam.y = vh >= WORLD_H ? WORLD_H / 2 : clamp(cam.y, vh / 2, WORLD_H - vh / 2);
  }

  // ---- Visitors walking the paths ----
  function pathXs() { const a = []; for (let c = 0; c <= COLS; c++) a.push(G / 2 + c * (PW + G)); return a; }
  function pathYs() { const a = []; for (let r = 0; r <= ROWS; r++) a.push(G / 2 + r * (PH + G)); return a; }
  // Top-most path row visitors use: the one above the highest row with an owned plot.
  function minPathRow() {
    let rows = 1;
    Game.s.plots.forEach((p, i) => { if (p.owned) rows = Math.max(rows, Math.floor(i / COLS) + 1); });
    return ROWS - rows;
  }

  function syncVisitors() {
    // A few visitors per species on display, just for atmosphere.
    const want = Math.min(40, Game.exhibitedSpecies().size * 3);
    const people = ['🚶', '🚶‍♀️', '🧍', '👨‍👩‍👧', '🧒', '👵', '🧑‍🦽'];
    const xs = pathXs(), ys = pathYs();
    while (visitors.length < want) {
      const cx = randInt(0, xs.length - 1), cy = ys.length - 1;
      visitors.push({ cx, cy, nx: cx, ny: cy, p: 1, emoji: people[randInt(0, people.length - 1)], speed: rand(0.2, 0.4) });
    }
    if (visitors.length > want) visitors.length = want;
  }

  function updateVisitors(dt) {
    const minRow = minPathRow(), xs = pathXs(), ys = pathYs();
    for (const v of visitors) {
      v.p += dt * v.speed;
      if (v.p >= 1) {
        v.cx = v.nx; v.cy = v.ny; v.p = 0;
        const opts = [];
        if (v.cx > 0) opts.push([v.cx - 1, v.cy]);
        if (v.cx < xs.length - 1) opts.push([v.cx + 1, v.cy]);
        if (v.cy > minRow) opts.push([v.cx, v.cy - 1]);
        if (v.cy < ys.length - 1) opts.push([v.cx, v.cy + 1]);
        const pick = opts[randInt(0, opts.length - 1)];
        v.nx = pick[0]; v.ny = pick[1];
      }
      if (v.cy < minRow) v.cy = v.ny = ys.length - 1;
    }
  }

  // ---- Animals wandering inside enclosures ----
  function animalState(a) {
    let s = animalPos.get(a.id);
    if (!s) {
      s = { x: rand(0.15, 0.85), y: rand(0.3, 0.85), tx: 0.5, ty: 0.5, wait: rand(0, 3), flip: Math.random() < 0.5, bob: rand(0, 10) };
      animalPos.set(a.id, s);
    }
    return s;
  }

  function updateAnimals(dt) {
    for (const a of Game.allAnimals()) {
      const s = animalState(a);
      s.bob += dt * 6;
      if (s.wait > 0) { s.wait -= dt; continue; }
      const dx = s.tx - s.x, dy = s.ty - s.y, d = Math.hypot(dx, dy);
      if (d < 0.01) {
        s.wait = rand(1, 4);
        s.tx = rand(0.12, 0.88); s.ty = rand(0.3, 0.88);
        continue;
      }
      const sp = 0.06 * dt;
      s.x += dx / d * Math.min(sp, d);
      s.y += dy / d * Math.min(sp, d);
      if (Math.abs(dx) > 0.005) s.flip = dx > 0;
    }
  }

  // ---------------- Rendering ----------------
  // Drawn in pixel art like the safari: a low-res buffer (one pixel per art pixel) scaled up,
  // with text and prompts on top at full resolution. The ground is painted once into a cache
  // and only redrawn when plots change.

  const A = Pixel.ART;
  let ground = null, groundKey = '';

  const FLOOR = {
    savanna: (v) => Pixel.tile('savanna', v % 3 === 0 ? 1 : 0, v, 0),
    wetlands: (v) => Pixel.tile('wetlands', v % 3 === 0 ? 2 : 0, v, 0),
    jungle: (v) => Pixel.tile('jungle', v % 4 === 0 ? 2 : 0, v, 0),
    desert: (v) => Pixel.tile('desert', v % 3 === 0 ? 2 : 0, v, 0),
    tundra: (v) => Pixel.tile('tundra', v % 4 === 0 ? 2 : 0, v, 0),
  };
  const GRASS = ['#78c850', '#58a038', '#98e070'];

  function buildGround() {
    const gw = Math.ceil(WORLD_W / A), gh = Math.ceil(WORLD_H / A), TT = Pixel.T;
    const c = Pixel.canvas(gw, gh), g = c.getContext('2d');
    // grass everywhere
    for (let ty = 0; ty * TT < gh; ty++) for (let tx = 0; tx * TT < gw; tx++) {
      const v = (Pixel.hash(tx, ty, 5) * 4) | 0;
      g.drawImage(Pixel.hash(tx, ty, 6) < 0.05 ? Pixel.tile('wetlands', 3, v, 0) : Pixel.grassTile(GRASS, v), tx * TT, ty * TT);
    }
    // paths and the plaza: a mask, filled with gravel, with a dark edge
    const mask = Pixel.canvas(gw, gh), mg = mask.getContext('2d');
    mg.fillStyle = '#fff';
    const xs = pathXs(), ys = pathYs(), minRow = minPathRow(), half = (G - 24) / 2;
    const R = (x, y, w, h) => mg.fillRect(Math.round(x / A), Math.round(y / A), Math.round(w / A), Math.round(h / A));
    for (let r = minRow; r < ys.length; r++) R(xs[0] - half, ys[r] - half, xs[xs.length - 1] - xs[0] + half * 2, half * 2);
    for (const x of xs) R(x - half, ys[minRow] - half, half * 2, ys[ys.length - 1] - ys[minRow] + half * 2);
    R(xs[0] - half, GRID_H - G / 2, WORLD_W - G + 24, WORLD_H - GRID_H + G / 2 - 30);
    for (const b of BUILDINGS) if (b.id === 'truck' || b.id === 'jeep') R(b.x - 10, b.y - 10, b.w + 20, b.h + 20);
    const gravel = Pixel.canvas(gw, gh), gg = gravel.getContext('2d');
    for (let ty = 0; ty * TT < gh; ty++) for (let tx = 0; tx * TT < gw; tx++) gg.drawImage(Pixel.speckTile('#e8d8a8', [['#c8b480', 4], ['#f8f0d0', 2]], (Pixel.hash(tx, ty, 7) * 4) | 0), tx * TT, ty * TT);
    gg.globalCompositeOperation = 'destination-in';
    gg.drawImage(mask, 0, 0);
    g.drawImage(gravel, 0, 0);
    edge(g, mask, gw, gh, '#b8a070');
    // vehicle pads
    for (const b of BUILDINGS) if (b.id === 'truck' || b.id === 'jeep') {
      const x = Math.round(b.x / A), y = Math.round(b.y / A), w = Math.round(b.w / A), h = Math.round(b.h / A);
      g.fillStyle = '#a8a8a0'; g.fillRect(x, y, w, h);
      g.fillStyle = '#c8c8c0'; g.fillRect(x, y, w, 1); g.fillRect(x, y, 1, h);
      g.fillStyle = '#808078'; g.fillRect(x, y + h - 1, w, 1); g.fillRect(x + w - 1, y, 1, h);
      g.fillStyle = '#f8f0d0'; for (let k = 4; k < w - 4; k += 8) g.fillRect(x + k, y + (h >> 1), 4, 1);
    }
    // plots
    Game.s.plots.forEach((pl, i) => {
      const p = plotRect(i), x = Math.round(p.x / A), y = Math.round(p.y / A), w = Math.round(p.w / A), h = Math.round(p.h / A);
      const enc = pl.enclosure;
      if (!Game.isPlotUnlocked(i)) {
        g.fillStyle = 'rgba(30,60,20,0.28)'; g.fillRect(x, y, w, h);
        dashed(g, x, y, w, h, 'rgba(30,50,20,0.6)');
      } else if (!enc) {
        g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(x, y, w, h);
        dashed(g, x + 1, y + 1, w - 2, h - 2, '#f8f8f8');
      } else {
        for (let ty = 0; ty * TT < h; ty++) for (let tx = 0; tx * TT < w; tx++) {
          const v = (Pixel.hash(tx + i * 31, ty, 8) * 4) | 0;
          g.drawImage(FLOOR[enc.biome](v), 0, 0, Math.min(TT, w - tx * TT), Math.min(TT, h - ty * TT), x + tx * TT, y + ty * TT, Math.min(TT, w - tx * TT), Math.min(TT, h - ty * TT));
        }
        if (enc.biome !== 'desert') {
          // a pool (frozen in the tundra)
          const px = x + Math.round(w * 0.2), py = y + Math.round(h * 0.34), rx = Math.round(w * (enc.biome === 'wetlands' ? 0.16 : 0.1)), ry = Math.round(h * 0.09);
          Pixel.ellipse(g, px, py, rx + 1, ry + 1, enc.biome === 'tundra' ? '#f8fbff' : '#e8f8ff');
          Pixel.ellipse(g, px, py, rx, ry, enc.biome === 'tundra' ? '#a8d8f0' : '#3870d8');
          g.fillStyle = enc.biome === 'tundra' ? '#f0fcff' : '#a8d8f8';
          g.fillRect(px - (rx >> 1), py - 1, 4, 1); g.fillRect(px + 2, py + 2, 3, 1);
        }
      }
    });
    // entrance mat
    g.fillStyle = '#7a4b25'; g.fillRect(Math.round((WORLD_W / 2 - 90) / A), Math.round((WORLD_H - 40) / A), 90, 15);
    g.fillStyle = '#a86a38'; g.fillRect(Math.round((WORLD_W / 2 - 90) / A), Math.round((WORLD_H - 40) / A), 90, 1);
    return c;
  }
  function edge(g, mask, w, h, color) {
    const m = mask.getContext('2d').getImageData(0, 0, w, h).data, on = (x, y) => x >= 0 && y >= 0 && x < w && y < h && m[(y * w + x) * 4 + 3] > 0;
    g.fillStyle = color;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (on(x, y) && (!on(x - 1, y) || !on(x + 1, y) || !on(x, y - 1) || !on(x, y + 1))) g.fillRect(x, y, 1, 1);
  }
  function dashed(g, x, y, w, h, color) {
    g.fillStyle = color;
    for (let k = 0; k < w; k += 6) { g.fillRect(x + k, y, 3, 1); g.fillRect(x + k, y + h - 1, 3, 1); }
    for (let k = 0; k < h; k += 6) { g.fillRect(x, y + k, 1, 3); g.fillRect(x + w - 1, y + k, 1, 3); }
  }
  // Blinking corner brackets around a rectangle (in buffer pixels).
  function brackets(g, x, y, w, h, color, len = 6) {
    g.fillStyle = '#181820';
    for (const [cx, cy, sx, sy] of [[x, y, 1, 1], [x + w, y, -1, 1], [x, y + h, 1, -1], [x + w, y + h, -1, -1]]) {
      g.fillRect(cx - (sx < 0 ? len : 0) - 1, cy - (sy < 0 ? 2 : 0) - 1, len + 2, 4);
      g.fillRect(cx - (sx < 0 ? 2 : 0) - 1, cy - (sy < 0 ? len : 0) - 1, 4, len + 2);
    }
    g.fillStyle = color;
    for (const [cx, cy, sx, sy] of [[x, y, 1, 1], [x + w, y, -1, 1], [x, y + h, 1, -1], [x + w, y + h, -1, -1]]) {
      g.fillRect(cx - (sx < 0 ? len : 0), cy - (sy < 0 ? 2 : 0), len, 2);
      g.fillRect(cx - (sx < 0 ? 2 : 0), cy - (sy < 0 ? len : 0), 2, len);
    }
  }
  const fenceH = (c) => Pixel.memo('fenceH' + c, () => {
    const hi = Pixel.css(Pixel.shade(c, 1.35)), mid = Pixel.css(Pixel.shade(c, 1.05)), dk = Pixel.css(Pixel.shade(c, 0.7));
    return Pixel.outline(Pixel.rects(16, 12, [[0, 3, 16, 2, mid], [0, 4, 16, 1, dk], [0, 7, 16, 2, mid], [0, 8, 16, 1, dk], [6, 0, 4, 12, mid], [6, 0, 1, 12, hi], [9, 0, 1, 12, dk]]), '#281810');
  });
  const fenceV = (c) => Pixel.memo('fenceV' + c, () => {
    const hi = Pixel.css(Pixel.shade(c, 1.35)), mid = Pixel.css(Pixel.shade(c, 1.05)), dk = Pixel.css(Pixel.shade(c, 0.7));
    return Pixel.outline(Pixel.rects(4, 16, [[1, 0, 2, 16, mid], [1, 0, 1, 16, hi], [0, 4, 4, 10, mid], [0, 4, 1, 10, hi], [3, 4, 1, 10, dk]]), '#281810');
  });
  const SPARKLE = () => Pixel.memo('sparkle', () => Pixel.outline(Pixel.pix(7, 7, (x, y) => (x === 3 || y === 3) && Math.abs(x - 3) + Math.abs(y - 3) <= 3 ? (x === 3 && y === 3 ? '#ffffff' : '#f8e848') : null), '#806010'));

  function render() {
    const g = view.g, css = view.css;
    const key = JSON.stringify(Game.s.plots.map((p, i) => [Game.isPlotUnlocked(i), p.enclosure && p.enclosure.biome])) + minPathRow();
    if (key !== groundKey) { ground = buildGround(); groundKey = key; }
    // Camera: the keeper's area sits in the middle of the space between the top bar and the hints.
    const ox = Math.round(cam.x / A - W / 2 / css), oy = Math.round(cam.y / A - (VIEW_TOP + viewH() / 2) / css);
    const X = (wx) => Math.round(wx / A) - ox, Y = (wy) => Math.round(wy / A) - oy;
    const labels = [];
    const label = (wx, wy, text, o = {}) => labels.push({ wx, wy, text, ...o });

    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#2e5a2a';
    g.fillRect(0, 0, view.w, view.h);
    g.drawImage(ground, -ox, -oy);

    const items = [];
    const s = Game.s;
    Game.s.plots.forEach((pl, i) => plotItems(items, plotRect(i), i, pl.enclosure, label));
    for (const b of BUILDINGS) items.push({ y: b.y + b.h, draw: () => drawBuilding(g, b, X, Y, label) });
    const xs = pathXs(), ys = pathYs();
    visitors.forEach((v, n) => {
      const x = lerp(xs[v.cx], xs[v.nx], v.p), y = lerp(ys[v.cy], ys[v.ny], v.p);
      const dx = xs[v.nx] - xs[v.cx], dy = ys[v.ny] - ys[v.cy];
      const dir = Math.abs(dx) > Math.abs(dy) ? 2 : dy < 0 ? 1 : 0;
      items.push({ y, draw: () => {
        const sp = Pixel.person(Pixel.visitorLook(n), dir, Math.floor(t * 4 + n) % 2);
        Pixel.drawShadow(g, X(x), Y(y), 9);
        Pixel.drawAt(g, dir === 2 && dx < 0 ? Pixel.memo('flip' + n + Math.floor(t * 4 + n) % 2, () => Pixel.flipH(sp)) : sp, X(x), Y(y) + 1);
      } });
    });
    items.push({ y: keeper.y, draw: () => drawKeeper(g, X, Y) });
    items.sort((p, q) => p.y - q.y);
    for (const it of items) it.draw(g, X, Y);

    // Highlights: the thing you'd interact with, and pens that can take what you're carrying
    const blink = Math.floor(t * 4) % 2;
    Game.s.plots.forEach((pl, i) => {
      const enc = pl.enclosure;
      if (enc && s.carrying && SPECIES[s.carrying.sp].biome === enc.biome && enc.animals.length < enc.capacity && blink) {
        const p = plotRect(i);
        brackets(g, X(p.x) - 4, Y(p.y) - 4, Math.round(p.w / A) + 8, Math.round(p.h / A) + 8, '#90f878', 10);
      }
    });
    if (target && !UI.isModalOpen()) {
      const r = target.rect, top = target.kind === 'plot' ? 3 : 14;
      brackets(g, X(r.x) - 4, Y(r.y) - 4 - top, Math.round(r.w / A) + 8, Math.round(r.h / A) + 8 + top, blink ? '#f8e848' : '#f8b828');
    }

    label(WORLD_W / 2 - 45, WORLD_H - 32, '🎟️ ENTRANCE', { color: '#ffe9a8', size: 13 });
    view.present(ctx);
    for (const l of labels) {
      const sx = (Math.round(l.wx / A) - ox) * css, sy = (Math.round(l.wy / A) - oy) * css;
      if (sx < -200 || sx > W + 200 || sy < -50 || sy > H + 50) continue;
      const size = (l.size || 12) * Math.min(1.15, css / 2 + 0.25);
      if (l.badge) {
        ctx.fillStyle = '#181820'; ctx.fillRect(sx - 12, sy - 12, 24, 24);
        ctx.fillStyle = '#e8452c'; ctx.fillRect(sx - 10, sy - 10, 20, 20);
        Pixel.text(ctx, l.text, sx, sy + 1, { size: 14, outline: null, weight: 700 });
      } else Pixel.text(ctx, l.text, sx, sy, { size, color: l.color || '#fff', outline: l.plain ? null : undefined, weight: 700 });
    }
    drawPrompt();
  }

  // Everything for one plot that needs depth sorting: fences, decorations, animals, signs.
  function plotItems(items, p, i, enc, label) {
    const g = view.g;
    const cx = p.x + p.w / 2, cy = p.y + p.h / 2;
    if (!Game.isPlotUnlocked(i)) {
      items.push({ y: cy + 20, draw: (g, X, Y) => {
        Pixel.drawAt(g, Pixel.board(46), X(cx), Y(cy + 20));
        label(cx, cy + 20 - 21, 'FOR SALE', { color: '#7a2a1a', plain: true });
        label(cx, cy + 44, costLabel(Game.landCost()), { color: '#ffe680' });
      } });
      return;
    }
    if (!enc) { items.push({ y: cy, draw: () => label(cx, cy, 'Empty plot', { size: 14 }) }); return; }
    const b = BIOMES[enc.biome];
    // fences: top and bottom rails, posts down the sides
    const x0 = Math.round(p.x / A), x1 = Math.round((p.x + p.w) / A), y0 = Math.round(p.y / A), y1 = Math.round((p.y + p.h) / A);
    for (let x = x0; x < x1; x += 16) {
      for (const [y, wy] of [[y0, p.y], [y1, p.y + p.h]]) items.push({ y: wy, draw: (g, X, Y) => {
        const s = fenceH(b.fence), w = Math.min(16, x1 - x);
        g.drawImage(s, 0, 0, w + 1, s.height, x - Math.round(p.x / A) + X(p.x) - 1, Y(wy) - 11, w + 1, s.height);
      } });
    }
    for (let y = y0; y < y1; y += 16) for (const [x, wx] of [[x0, p.x], [x1, p.x + p.w]]) {
      items.push({ y: y * A, draw: (g, X, Y) => { const s = fenceV(b.fence); g.drawImage(s, 0, 0, s.width, Math.min(s.height, y1 - y + 2), X(wx) - 3, Y(y * A) - 1, s.width, Math.min(s.height, y1 - y + 2)); } });
    }
    // decorations
    const deco = { savanna: ['tree:acacia', '🌾'], wetlands: ['tree:broadleaf', '🪷'], jungle: ['tree:palm', '🌿'], desert: ['🌵', 'rock:sand'], tundra: ['🧊', 'tree:pine'] }[enc.biome];
    const put = (what, fx, fy, seed, anim) => {
      const wx = p.x + fx * p.w, wy = p.y + fy * p.h;
      items.push({ y: wy, draw: (g, X, Y) => {
        const s = Pixel.decor(TREE_EMOJI[what] || what, seed);
        if (!s) return;
        let lift = 0;
        if (anim && anim.age < 0.6) lift = Math.round(Math.sin(anim.age / 0.6 * Math.PI) * 8);
        Pixel.drawShadow(g, X(wx) + 1, Y(wy), s.width * 0.75);
        Pixel.drawAt(g, s, X(wx), Y(wy) + 2 - lift);
        if (anim && anim.age < 1.5 && Math.floor(t * 8) % 2) Pixel.drawAt(g, SPARKLE(), X(wx) + (s.width >> 1), Y(wy) - s.height + 4);
      } });
    };
    put(deco[0], 0.86, 0.36, i);
    put(deco[1], 0.1, 0.86, i + 1);
    expansionDecor(p, i, enc).forEach((d) => put(d.what, d.fx, d.fy, i + d.k, d.anim));
    // animals
    for (const a of enc.animals) {
      const st = animalState(a), def = SPECIES[a.sp], size = clamp(Math.round(def.size * 0.66), 14, 36);
      const ax = p.x + st.x * p.w, ay = p.y + st.y * p.h;
      items.push({ y: ay, draw: (g, X, Y) => {
        const hop = st.wait > 0 ? 0 : (Math.sin(st.bob) > 0 ? 1 : 0);
        Pixel.drawShadow(g, X(ax) + 1, Y(ay), size * 0.7);
        const sp = Pixel.animal(a.sp, size, st.flip);
        if (sp) Pixel.drawAt(g, sp, X(ax), Y(ay) + 1 - hop);
      } });
    }
    // sign
    const text = `${b.icon} ${b.name} ${enc.animals.length}/${enc.capacity}`;
    items.push({ y: p.y + 30, draw: (g, X, Y) => {
      ctx.font = Pixel.font(12, 700);
      const w = Math.round(ctx.measureText(text).width / view.css) + 10;
      Pixel.drawAt(g, Pixel.board(w), X(p.x) + 8 + (w >> 1), Y(p.y + 30));
      label(p.x + 16 + w, p.y + 30 - 22, text, { color: '#3a2410', plain: true });
    } });
  }

  const TREE_EMOJI = { '🌳': 'tree:broadleaf', '🌴': 'tree:palm', '🌲': 'tree:pine' };

  // Each expansion adds two more decorations, themed to the enclosure's habitat.
  const EXPANSION_DECOR = {
    savanna:  ['🌳', '🪨', '🌼', '🪵', '🌾', '🌳', '🌼', '🪨'],
    wetlands: ['🌿', '🪵', '🪷', '🍀', '🌾', '🌳', '🪷', '🌿'],
    jungle:   ['🌺', '🍄', '🌴', '🎋', '🌿', '🌺', '🌴', '🍄'],
    desert:   ['🌵', '🦴', '🪨', '🐚', '🌵', '🏺', '🪨', '🌵'],
    tundra:   ['🌲', '⛄', '🧊', '❄️', '🌲', '🧊', '⛄', '🌲'],
  };
  // Spots spread around the pen, clear of the sign (top-left) and the pool.
  const DECOR_SLOTS = [[0.55, 0.22], [0.1, 0.6], [0.9, 0.66], [0.38, 0.9], [0.68, 0.92], [0.92, 0.92], [0.42, 0.46], [0.62, 0.58]];
  const decorSeen = new Map();   // plot index -> { level, t } for the pop-in animation

  function expansionDecor(p, plotIdx, enc) {
    const level = Math.round((enc.capacity - ECON.startCapacity) / ECON.expandStep);
    const seen = decorSeen.get(plotIdx);
    if (!seen) decorSeen.set(plotIdx, { level, t: -99 });
    // New decorations wait until the menu closes, so you can see them pop in.
    else if (level > seen.level && !UI.isModalOpen()) decorSeen.set(plotIdx, { level, t, from: seen.level });
    const anim = decorSeen.get(plotIdx);
    const items = EXPANSION_DECOR[enc.biome], out = [];
    for (let k = 0; k < Math.min(anim.level * 2, items.length); k++) {
      const [fx, fy] = DECOR_SLOTS[(k + plotIdx) % DECOR_SLOTS.length];
      const isNew = anim.from !== undefined && k >= anim.from * 2;
      out.push({ what: items[k], fx, fy, k, anim: isNew ? { age: t - anim.t } : null });
    }
    return out;
  }

  function drawBuilding(g, b, X, Y, label) {
    const x = X(b.x), y = Y(b.y), w = Math.round(b.w / A), h = Math.round(b.h / A);
    if (b.id === 'truck' || b.id === 'jeep') {
      const s = b.id === 'truck' ? Pixel.truck(Math.PI) : Pixel.jeep(0);
      Pixel.drawShadow(g, x + (w >> 1) + 2, y + (h >> 1) + 6, s.width * 0.8);
      g.drawImage(s, x + (w >> 1) - s.anchorX, y + (h >> 1) + 6 - s.anchorY);
      if (b.id === 'truck' && Game.s.holding.length) {
        // peek at what's inside, and a count badge
        Game.s.holding.slice(0, 4).forEach((a, k) => { const sp = Pixel.animal(a.sp, 18, false); if (sp) Pixel.drawAt(g, sp, x + 12 + k * 16, y - 2 + (Math.floor(t * 3 + k) % 2)); });
        label(b.x + b.w - 6, b.y - 14 + Math.round(Math.sin(t * 5) * 3), String(Game.s.holding.length), { badge: true });
      }
      if (b.id === 'jeep') label(b.x + b.w / 2, b.y - 14, 'TO THE WILD →', { color: '#ffe680', size: 13 });
      return;
    }
    const s = Pixel.house(w, h + 12, b.roof, b.wall, b.id);
    Pixel.drawShadow(g, x + (w >> 1) + 4, y + h, w * 1.05);
    g.drawImage(s, x - 1, y + h - s.height + 1);
    label(b.x + b.w / 2, b.y + b.h + A * (-s.height + Math.round((h + 12) * 0.5) + 6.5), b.label, { color: '#5a2a18', plain: true, size: 12 });
  }

  // The zookeeper, walking in one of four directions.
  function drawKeeper(g, X, Y) {
    const x = X(keeper.x), y = Y(keeper.y) + 6;
    const frame = keeper.moving ? Math.floor(keeper.step / 2) % 2 : 0;
    // pulsing "you are here" ring
    Pixel.ring(g, x, y, 9 + (Math.floor(t * 4) % 2), 4, '#f8e848', true);
    Pixel.drawShadow(g, x, y, 11);
    let sp = Pixel.person(Pixel.KEEPER, keeper.dir, frame);
    if (keeper.dir === 2 && !keeper.flip) sp = Pixel.memo('keeperL' + frame, () => Pixel.flipH(Pixel.person(Pixel.KEEPER, 2, frame)));
    Pixel.drawAt(g, sp, x, y + 1 - (keeper.moving && frame ? 1 : 0));
    if (Game.s.carrying) {
      const a = Pixel.animal(Game.s.carrying.sp, 22, keeper.flip);
      if (a) Pixel.drawAt(g, a, x, y - 16 - (Math.floor(t * 3) % 2));
    }
  }

  function drawPrompt() {
    let text = !UI.isModalOpen() && promptFor(target);
    if (text && TouchControls.enabled) text = text.replace(/^E: /, '').replace(' (E)', '');
    const pill = (txt, y, color) => {
      ctx.font = Pixel.font(16);
      let size = 16;
      const tw = ctx.measureText(txt).width;
      if (tw > W - 50) size = Math.max(10, 16 * (W - 50) / tw);
      ctx.font = Pixel.font(size);
      const w = ctx.measureText(txt).width + 32;
      Pixel.panel(ctx, W / 2 - w / 2, y - size - 3, w, size * 2 + 6, 0.88);
      Pixel.text(ctx, txt, W / 2, y, { size, color, outline: null });
    };
    if (text) pill(text, H - 76, '#ffe680');
    if (toast) pill(toast.text, H * 0.2, '#fff');
    if (Game.s.carrying && !text) pill(`Carrying a ${SPECIES[Game.s.carrying.sp].name}: take it to a flashing enclosure`, H - 76, '#b8ffa8');
    const hint = TouchControls.enabled ? 'Drag to walk   •   Tap ✋ to use' : 'WASD / Arrows: walk   •   E: interact';
    ctx.font = Pixel.font(13);
    const hw = ctx.measureText(hint).width + 24;
    Pixel.panel(ctx, W - hw - 10, H - 40, hw, 30, 0.8);
    Pixel.text(ctx, hint, W - hw / 2 - 10, H - 25, { size: 13, color: 'rgba(255,255,255,0.9)', outline: null });
  }

  function hasTarget() { return !!target; }

  return { init, resize, update, render, arriveHome, showToast, hasTarget, debug: () => ({ keeper, plotRect, BUILDINGS }) };
})();
