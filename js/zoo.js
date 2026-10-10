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
  let canvas, ctx, W = 0, H = 0, zoom = 1;
  let t = 0;
  const keeper = { x: GRID_W / 2, y: GRID_H + 260, flip: false, moving: false, step: 0 };
  const cam = { x: keeper.x, y: keeper.y };
  let target = null;          // current interactable
  let toast = null;           // { text, t }
  const animalPos = new Map(); // animal id -> wander state (not saved)
  let visitors = [];

  function init(c) {
    canvas = c;
    ctx = c.getContext('2d');
  }

  function resize() {
    const r = canvas.parentElement.getBoundingClientRect();
    W = Math.max(1, r.width); H = Math.max(1, r.height);
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    // Fit the whole zoo on screen when possible; on small screens the camera follows the keeper.
    const fit = Math.min(W / WORLD_W, viewH() / WORLD_H);
    // If the whole zoo would be too tiny (phones), fill the screen's longer side and scroll the other way.
    zoom = fit >= 0.45 ? Math.min(fit, 1.1) : clamp(Math.max(W / WORLD_W, viewH() / WORLD_H), 0.38, 0.7);
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
      case 'office': return 'E: Office — buy land & amenities, field guide';
      case 'garage': return 'E: Garage — upgrade jeep & nets';
      case 'jeep': return 'E: Go on safari!';
      case 'truck':
        if (carry) return `E: Put the ${carry.name} back in the truck`;
        return s.holding.length ? `E: Unload animals (${s.holding.length} waiting)` : 'The truck is empty';
      case 'plot': {
        const i = tg.idx, enc = s.plots[i].enclosure;
        if (!Game.isPlotUnlocked(i)) return `E: Buy this plot (${fmtMoney(Game.landCost())})`;
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
          else { Sfx.capture(); showToast(`The ${name} has a new home! 🎉`); }
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
      keeper.step += dt * 12;
    }

    target = findTarget();
    if (target && input.pressed('KeyE')) interact(target);

  }

  function viewH() { return Math.max(100, H - VIEW_TOP - VIEW_BOTTOM); }

  function updateCamera(dt) {
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
    const last = Game.s.lastReport ? Game.s.lastReport.visitors : 0;
    const want = Math.min(40, Math.ceil(last / 3));
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

  function render() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.fillStyle = '#5f8f45';
    ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.translate(W / 2, VIEW_TOP + viewH() / 2);
    ctx.scale(zoom, zoom);
    ctx.translate(-cam.x, -cam.y);

    // Grass
    ctx.fillStyle = '#86bf5f';
    ctx.fillRect(0, 0, WORLD_W, WORLD_H);
    ctx.fillStyle = 'rgba(60,120,40,0.18)';
    for (let i = 0; i < 400; i++) ctx.fillRect((i * 97.3) % WORLD_W, (i * 61.7 + (i % 7) * 13) % WORLD_H, 4, 4);

    // Paths
    const xs = pathXs(), ys = pathYs(), minRow = minPathRow();
    ctx.strokeStyle = '#e9dcb0';
    ctx.lineWidth = G - 24;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let r = minRow; r < ys.length; r++) { ctx.moveTo(xs[0], ys[r]); ctx.lineTo(xs[xs.length - 1], ys[r]); }
    for (const x of xs) { ctx.moveTo(x, ys[minRow]); ctx.lineTo(x, ys[ys.length - 1]); }
    ctx.stroke();
    // Plaza
    ctx.fillStyle = '#e9dcb0';
    ctx.fillRect(xs[0] - (G - 24) / 2, GRID_H - G / 2, WORLD_W - G + 24, WORLD_H - GRID_H + G / 2 - 30);

    Game.s.plots.forEach((p, i) => drawPlot(plotRect(i), i));
    for (const b of BUILDINGS) drawBuilding(b);

    // Visitor entrance
    const ex = WORLD_W / 2, ey = WORLD_H - 30;
    ctx.fillStyle = '#7a4b25';
    ctx.fillRect(ex - 90, ey - 10, 180, 30);
    ctx.fillStyle = '#ffe9a8';
    ctx.font = 'bold 16px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('🎟️ ENTRANCE', ex, ey + 11);

    // Visitors
    for (const v of visitors) {
      const x = lerp(xs[v.cx], xs[v.nx], v.p), y = lerp(ys[v.cy], ys[v.ny], v.p);
      drawEmoji(ctx, v.emoji, x, y - 8, 22, xs[v.nx] > xs[v.cx]);
    }

    drawKeeper();

    ctx.restore();
    drawPrompt();
  }

  function drawPlot(p, i) {
    const s = Game.s;
    const unlocked = Game.isPlotUnlocked(i);
    const enc = s.plots[i].enclosure;
    const isTarget = target && target.kind === 'plot' && target.idx === i;

    if (!unlocked) {
      ctx.fillStyle = 'rgba(40,70,30,0.35)';
      ctx.fillRect(p.x, p.y, p.w, p.h);
      ctx.strokeStyle = 'rgba(30,50,20,0.5)';
      ctx.setLineDash([8, 8]);
      ctx.lineWidth = 3;
      ctx.strokeRect(p.x, p.y, p.w, p.h);
      ctx.setLineDash([]);
      drawEmoji(ctx, '🪧', p.x + p.w / 2, p.y + p.h / 2 - 10, 40);
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.font = 'bold 14px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('FOR SALE', p.x + p.w / 2, p.y + p.h / 2 + 30);
      ctx.fillStyle = '#ffe680';
      ctx.fillText(fmtMoney(Game.landCost()), p.x + p.w / 2, p.y + p.h / 2 + 50);
    } else if (!enc) {
      ctx.fillStyle = 'rgba(255,255,255,0.1)';
      ctx.fillRect(p.x, p.y, p.w, p.h);
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.setLineDash([10, 8]);
      ctx.lineWidth = 3;
      ctx.strokeRect(p.x + 2, p.y + 2, p.w - 4, p.h - 4);
      ctx.setLineDash([]);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 16px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Empty plot', p.x + p.w / 2, p.y + p.h / 2 + 6);
    } else {
      const b = BIOMES[enc.biome];
      ctx.fillStyle = b.color;
      ctx.fillRect(p.x, p.y, p.w, p.h);
      const deco = { savanna: ['🌳', '🌾'], wetlands: ['🪷', '🌾'], jungle: ['🌴', '🌿'], desert: ['🌵', '🪨'], tundra: ['🧊', '🌲'] }[enc.biome];
      drawEmoji(ctx, deco[0], p.x + p.w * 0.86, p.y + p.h * 0.3, 54);
      drawEmoji(ctx, deco[1], p.x + p.w * 0.1, p.y + p.h * 0.84, 32);
      if (enc.biome !== 'desert') {
        ctx.fillStyle = enc.biome === 'tundra' ? '#7cc0e6' : '#5aa9d6';
        ctx.beginPath();
        ctx.ellipse(p.x + p.w * 0.2, p.y + p.h * 0.34, p.w * (enc.biome === 'wetlands' ? 0.16 : 0.1), p.h * 0.08, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      const list = enc.animals.map((a) => ({ a, st: animalState(a) })).sort((m, n) => m.st.y - n.st.y);
      for (const { a, st } of list) {
        const bob = st.wait > 0 ? 0 : Math.abs(Math.sin(st.bob)) * 3;
        drawEmoji(ctx, SPECIES[a.sp].emoji, p.x + st.x * p.w, p.y + st.y * p.h - bob, 40, st.flip);
      }
      // fence
      ctx.strokeStyle = b.fence;
      ctx.lineWidth = 5;
      ctx.strokeRect(p.x, p.y, p.w, p.h);
      ctx.fillStyle = b.fence;
      for (let k = 0; k <= 10; k++) {
        const fx = p.x + (p.w * k) / 10, fy = p.y + (p.h * k) / 10;
        ctx.fillRect(fx - 4, p.y - 4, 8, 8); ctx.fillRect(fx - 4, p.y + p.h - 4, 8, 8);
        ctx.fillRect(p.x - 4, fy - 4, 8, 8); ctx.fillRect(p.x + p.w - 4, fy - 4, 8, 8);
      }
      // sign
      const label = `${b.icon} ${b.name} ${enc.animals.length}/${enc.capacity}`;
      ctx.font = 'bold 14px system-ui, sans-serif';
      const lw = ctx.measureText(label).width + 16;
      ctx.fillStyle = '#5b3b1c';
      ctx.fillRect(p.x + 10, p.y + 10, lw, 24);
      ctx.fillStyle = '#ffeec2';
      ctx.textAlign = 'left';
      ctx.fillText(label, p.x + 18, p.y + 27);

      // Glow pens that can take the animal you're carrying.
      if (s.carrying && SPECIES[s.carrying.sp].biome === enc.biome && enc.animals.length < enc.capacity) {
        ctx.strokeStyle = `rgba(140,255,120,${0.5 + 0.4 * Math.sin(t * 6)})`;
        ctx.lineWidth = 5;
        ctx.strokeRect(p.x - 10, p.y - 10, p.w + 20, p.h + 20);
      }
    }

    if (isTarget) {
      ctx.strokeStyle = '#fff36b';
      ctx.lineWidth = 4;
      ctx.strokeRect(p.x - 6, p.y - 6, p.w + 12, p.h + 12);
    }
  }

  function drawBuilding(b) {
    const isTarget = target && target.rect === b;
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(b.x + 6, b.y + 8, b.w, b.h);
    ctx.textAlign = 'center';
    if (b.id === 'truck' || b.id === 'jeep') {
      // vehicles parked on a pad
      ctx.fillStyle = '#b8ab88';
      ctx.fillRect(b.x, b.y, b.w, b.h);
      drawEmoji(ctx, b.emoji, b.x + b.w / 2, b.y + b.h / 2, 80, b.id === 'jeep');
      if (b.id === 'truck' && Game.s.holding.length) {
        const n = Game.s.holding.length;
        const by = b.y - 18 + Math.sin(t * 5) * 4;
        ctx.fillStyle = '#e8452c';
        ctx.beginPath(); ctx.arc(b.x + b.w - 10, by, 16, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 16px system-ui, sans-serif';
        ctx.fillText(String(n), b.x + b.w - 10, by + 6);
        // peek at what's inside
        Game.s.holding.slice(0, 4).forEach((a, k) => drawEmoji(ctx, SPECIES[a.sp].emoji, b.x + 20 + k * 26, b.y - 14, 22));
      }
      if (b.id === 'jeep') {
        ctx.fillStyle = '#5b3b1c';
        ctx.font = 'bold 14px system-ui, sans-serif';
        ctx.fillText('TO THE WILD →', b.x + b.w / 2, b.y - 10);
      }
    } else {
      ctx.fillStyle = b.wall;
      ctx.fillRect(b.x, b.y + 30, b.w, b.h - 30);
      ctx.fillStyle = b.roof;
      ctx.beginPath();
      ctx.moveTo(b.x - 10, b.y + 34); ctx.lineTo(b.x + b.w / 2, b.y - 10); ctx.lineTo(b.x + b.w + 10, b.y + 34);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#6b4a2a';
      ctx.fillRect(b.x + b.w / 2 - 16, b.y + b.h - 44, 32, 44);
      drawEmoji(ctx, b.emoji, b.x + 40, b.y + 66, 36);
      ctx.fillStyle = '#3a2a1a';
      ctx.font = 'bold 15px system-ui, sans-serif';
      ctx.fillText(b.label, b.x + b.w / 2 + 30, b.y + 66);
    }
    if (isTarget) {
      ctx.strokeStyle = '#fff36b';
      ctx.lineWidth = 4;
      ctx.strokeRect(b.x - 8, b.y - 16, b.w + 16, b.h + 24);
    }
  }

  // The zookeeper is drawn with shapes (not an emoji) so it shows up on every system.
  function drawKeeper() {
    const x = keeper.x, y = keeper.y;
    const bob = keeper.moving ? Math.abs(Math.sin(keeper.step)) * 3 : 0;
    const swing = keeper.moving ? Math.sin(keeper.step) * 5 : 0;
    const dir = keeper.flip ? 1 : -1;
    ctx.save();
    // Draw a bit larger than life so the keeper is easy to spot when the whole zoo is on screen.
    ctx.translate(x, y); ctx.scale(1.5, 1.5); ctx.translate(-x, -y);

    // pulsing "you are here" ring
    const pulse = 0.5 + 0.5 * Math.sin(t * 5);
    ctx.strokeStyle = `rgba(255,236,90,${0.55 + 0.4 * pulse})`;
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.ellipse(x, y + 18, 26 + pulse * 4, 10 + pulse * 1.5, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath(); ctx.ellipse(x, y + 18, 16, 6, 0, 0, Math.PI * 2); ctx.fill();

    const top = y - 30 - bob;
    // legs
    ctx.fillStyle = '#5a4630';
    ctx.fillRect(x - 8 + swing * 0.4, top + 30, 6, 16 - Math.max(0, swing) * 0.3);
    ctx.fillRect(x + 2 - swing * 0.4, top + 30, 6, 16 + Math.min(0, swing) * 0.3);
    // boots
    ctx.fillStyle = '#2e2418';
    ctx.fillRect(x - 9 + swing * 0.4, top + 44, 8, 4);
    ctx.fillRect(x + 1 - swing * 0.4, top + 44, 8, 4);
    // body (khaki shirt)
    ctx.fillStyle = '#c9a25e';
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x - 12, top + 10, 24, 24, 6) : ctx.rect(x - 12, top + 10, 24, 24); ctx.fill();
    // arms
    ctx.fillStyle = '#b38c4c';
    ctx.fillRect(x - 16, top + 13 - swing * 0.3, 5, 16);
    ctx.fillRect(x + 11, top + 13 + swing * 0.3, 5, 16);
    // head
    ctx.fillStyle = '#f0c391';
    ctx.beginPath(); ctx.arc(x, top + 2, 10, 0, Math.PI * 2); ctx.fill();
    // eye, facing the walking direction
    ctx.fillStyle = '#2b2b2b';
    ctx.beginPath(); ctx.arc(x + dir * 4, top + 2, 1.8, 0, Math.PI * 2); ctx.fill();
    // safari hat
    ctx.fillStyle = '#7a5a30';
    ctx.beginPath(); ctx.ellipse(x, top - 5, 16, 4.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#8f6c3c';
    ctx.beginPath(); ctx.ellipse(x, top - 9, 9, 6, 0, Math.PI, 0); ctx.fill();

    if (Game.s.carrying) {
      const sp = SPECIES[Game.s.carrying.sp];
      drawEmoji(ctx, sp.emoji, x, top - 28 - bob * 0.5, 34, keeper.flip);
    }
    ctx.restore();
  }

  function drawPrompt() {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    let text = !UI.isModalOpen() && promptFor(target);
    if (text && Touch.enabled) text = text.replace(/^E: /, '').replace(' (E)', '');
    const pill = (txt, y, color) => {
      ctx.font = 'bold 16px system-ui, sans-serif';
      const w = ctx.measureText(txt).width + 28;
      ctx.fillStyle = 'rgba(20,28,18,0.8)';
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(W / 2 - w / 2, y - 16, w, 32, 10) : ctx.rect(W / 2 - w / 2, y - 16, w, 32);
      ctx.fill();
      ctx.fillStyle = color;
      ctx.fillText(txt, W / 2, y);
    };
    if (text) pill(text, H - 70, '#ffe680');
    if (toast) pill(toast.text, H * 0.2, '#fff');
    if (Game.s.carrying && !text) pill(`Carrying a ${SPECIES[Game.s.carrying.sp].name} — take it to a glowing enclosure`, H - 70, '#b8ffa8');
    ctx.font = 'bold 13px system-ui, sans-serif';
    const hint = Touch.enabled ? 'Drag to walk   •   Tap ✋ to use' : 'WASD / Arrows: walk   •   E: interact';
    const hw = ctx.measureText(hint).width + 20;
    ctx.fillStyle = 'rgba(20,28,18,0.7)';
    ctx.fillRect(W - hw - 10, H - 36, hw, 26);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillText(hint, W - hw / 2 - 10, H - 23);
    ctx.textBaseline = 'alphabetic';
  }

  function hasTarget() { return !!target; }

  return { init, resize, update, render, arriveHome, showToast, hasTarget, debug: () => ({ keeper, plotRect, BUILDINGS }) };
})();
