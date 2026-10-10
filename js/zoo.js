// The zoo map view: enclosures, wandering animals and visitors.

const Zoo = (() => {
  let canvas, ctx, W = 0, H = 0;
  let layout = null;
  let selected = -1;
  let hover = -1;
  let t = 0;
  const animalPos = new Map();   // animal id -> wander state (not saved)
  let visitors = [];
  let onSelect = null;

  function init(c, selectCallback) {
    canvas = c;
    ctx = c.getContext('2d');
    onSelect = selectCallback;
    canvas.addEventListener('mousemove', (e) => { hover = plotAt(e.offsetX, e.offsetY); });
    canvas.addEventListener('mouseleave', () => { hover = -1; });
    canvas.addEventListener('click', (e) => {
      const p = plotAt(e.offsetX, e.offsetY);
      select(p);
    });
  }

  function select(p) {
    selected = p;
    onSelect(p);
  }

  function resize() {
    const r = canvas.parentElement.getBoundingClientRect();
    W = Math.max(1, r.width); H = Math.max(1, r.height);
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    computeLayout();
  }

  function computeLayout() {
    const cols = ECON.plotCols, rows = ECON.plotRows;
    const g = 30, margin = 36, bottom = 56;
    const pw = (W - margin * 2 - g * (cols - 1)) / cols;
    const ph = (H - margin - bottom - g * (rows - 1)) / rows;
    const plots = [];
    for (let i = 0; i < cols * rows; i++) {
      const c = i % cols, rFromBottom = Math.floor(i / cols);
      const r = rows - 1 - rFromBottom;
      plots.push({ x: margin + c * (pw + g), y: margin + r * (ph + g), w: pw, h: ph });
    }
    // Path network nodes sit on the gutter intersections.
    const xs = [], ys = [];
    for (let c = 0; c <= cols; c++) xs.push(margin - g / 2 + c * (pw + g));
    for (let r = 0; r <= rows; r++) ys.push(margin - g / 2 + r * (ph + g));
    layout = { plots, g, margin, bottom, pw, ph, xs, ys };
  }

  function plotAt(x, y) {
    if (!layout) return -1;
    return layout.plots.findIndex((p) => x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h);
  }

  // ---- Visitors walking the paths ----
  function minPathRow() {
    // Top-most gutter row (index into ys) that borders unlocked land.
    const unlockedRows = 1 + Game.s.landLevel;
    return ECON.plotRows - unlockedRows;
  }

  function syncVisitors() {
    const last = Game.s.lastReport ? Game.s.lastReport.visitors : 0;
    const want = Math.min(40, Math.ceil(last / 12));
    const people = ['🚶', '🚶‍♀️', '🧍', '👨‍👩‍👧', '🧒', '👵', '🧑‍🦽'];
    while (visitors.length < want) {
      const cx = randInt(0, layout.xs.length - 1), cy = layout.ys.length - 1;
      visitors.push({ cx, cy, nx: cx, ny: cy, p: 1, emoji: people[randInt(0, people.length - 1)], speed: rand(0.25, 0.5) });
    }
    if (visitors.length > want) visitors.length = want;
  }

  function updateVisitors(dt) {
    const minRow = minPathRow();
    for (const v of visitors) {
      v.p += dt * v.speed;
      if (v.p >= 1) {
        v.cx = v.nx; v.cy = v.ny; v.p = 0;
        const opts = [];
        if (v.cx > 0) opts.push([v.cx - 1, v.cy]);
        if (v.cx < layout.xs.length - 1) opts.push([v.cx + 1, v.cy]);
        if (v.cy > minRow) opts.push([v.cx, v.cy - 1]);
        if (v.cy < layout.ys.length - 1) opts.push([v.cx, v.cy + 1]);
        const pick = opts[randInt(0, opts.length - 1)];
        v.nx = pick[0]; v.ny = pick[1];
      }
      if (v.cy < minRow) { v.cy = v.ny = layout.ys.length - 1; }
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

  // ---- Rendering ----
  function render(dt) {
    t += dt;
    if (!layout) return;
    syncVisitors();
    updateVisitors(dt);
    updateAnimals(dt);

    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.fillStyle = '#86bf5f';
    ctx.fillRect(0, 0, W, H);

    // Grass texture dots
    ctx.fillStyle = 'rgba(60,120,40,0.18)';
    for (let i = 0; i < 120; i++) {
      const x = (i * 97.3) % W, y = (i * 61.7 + (i % 7) * 13) % H;
      ctx.fillRect(x, y, 3, 3);
    }

    const L = layout, minRow = minPathRow();
    // Paths
    ctx.strokeStyle = '#e9dcb0';
    ctx.lineWidth = L.g - 8;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let r = minRow; r < L.ys.length; r++) { ctx.moveTo(L.xs[0], L.ys[r]); ctx.lineTo(L.xs[L.xs.length - 1], L.ys[r]); }
    for (const x of L.xs) { ctx.moveTo(x, L.ys[minRow]); ctx.lineTo(x, L.ys[L.ys.length - 1]); }
    // entrance path
    const ex = W / 2;
    ctx.moveTo(ex, L.ys[L.ys.length - 1]); ctx.lineTo(ex, H);
    ctx.stroke();

    // Plots
    L.plots.forEach((p, i) => drawPlot(p, i));

    // Visitors
    for (const v of visitors) {
      const x = lerp(L.xs[v.cx], L.xs[v.nx], v.p), y = lerp(L.ys[v.cy], L.ys[v.ny], v.p);
      drawEmoji(ctx, v.emoji, x, y - 6 + Math.sin(t * 10 + v.speed * 50) * 1, 18, L.xs[v.nx] > L.xs[v.cx]);
    }

    // Entrance
    const gy = H - 26;
    ctx.fillStyle = '#7a4b25';
    ctx.fillRect(ex - 70, gy - 16, 140, 26);
    ctx.fillStyle = '#ffe9a8';
    ctx.font = 'bold 14px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🎟️ ENTRANCE', ex, gy - 3);
    ctx.textBaseline = 'alphabetic';
  }

  function drawPlot(p, i) {
    const unlocked = Game.isPlotUnlocked(i);
    const enc = Game.s.plots[i].enclosure;
    const isSel = i === selected, isHover = i === hover;

    if (!unlocked) {
      ctx.fillStyle = 'rgba(40,70,30,0.35)';
      ctx.fillRect(p.x, p.y, p.w, p.h);
      ctx.strokeStyle = 'rgba(30,50,20,0.4)';
      ctx.setLineDash([6, 6]);
      ctx.lineWidth = 2;
      ctx.strokeRect(p.x, p.y, p.w, p.h);
      ctx.setLineDash([]);
      drawEmoji(ctx, '🔒', p.x + p.w / 2, p.y + p.h / 2 - 8, 26, false, 0.7);
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.font = '12px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Land for sale', p.x + p.w / 2, p.y + p.h / 2 + 22);
    } else if (!enc) {
      ctx.fillStyle = isHover || isSel ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.1)';
      ctx.fillRect(p.x, p.y, p.w, p.h);
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.setLineDash([8, 6]);
      ctx.lineWidth = 2;
      ctx.strokeRect(p.x + 1, p.y + 1, p.w - 2, p.h - 2);
      ctx.setLineDash([]);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 15px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('＋ Build enclosure', p.x + p.w / 2, p.y + p.h / 2 + 5);
    } else {
      const b = BIOMES[enc.biome];
      ctx.fillStyle = b.color;
      ctx.fillRect(p.x, p.y, p.w, p.h);
      // a little scenery, positioned deterministically per plot
      const deco = { savanna: ['🌳', '🌾'], jungle: ['🌴', '🌿'], tundra: ['🧊', '🌲'] }[enc.biome];
      const s = Math.min(p.w, p.h);
      drawEmoji(ctx, deco[0], p.x + p.w * 0.85, p.y + p.h * 0.28, s * 0.26);
      drawEmoji(ctx, deco[1], p.x + p.w * 0.12, p.y + p.h * 0.82, s * 0.16);
      // water trough / pool
      ctx.fillStyle = enc.biome === 'tundra' ? '#7cc0e6' : '#5aa9d6';
      ctx.beginPath();
      ctx.ellipse(p.x + p.w * 0.2, p.y + p.h * 0.32, p.w * 0.1, p.h * 0.07, 0, 0, Math.PI * 2);
      ctx.fill();

      // animals, sorted by y for depth
      const list = enc.animals.map((a) => ({ a, s: animalState(a) })).sort((m, n) => m.s.y - n.s.y);
      const size = clamp(s * 0.2, 18, 44);
      for (const { a, s: st } of list) {
        const x = p.x + st.x * p.w, y = p.y + st.y * p.h;
        const bob = st.wait > 0 ? 0 : Math.abs(Math.sin(st.bob)) * 2;
        drawEmoji(ctx, SPECIES[a.sp].emoji, x, y - bob, size, st.flip);
      }

      // fence
      ctx.strokeStyle = b.fence;
      ctx.lineWidth = 4;
      ctx.strokeRect(p.x, p.y, p.w, p.h);
      ctx.fillStyle = b.fence;
      const posts = 8;
      for (let k = 0; k <= posts; k++) {
        const fx = p.x + (p.w * k) / posts, fy = p.y + (p.h * k) / posts;
        ctx.fillRect(fx - 3, p.y - 3, 6, 6); ctx.fillRect(fx - 3, p.y + p.h - 3, 6, 6);
        ctx.fillRect(p.x - 3, fy - 3, 6, 6); ctx.fillRect(p.x + p.w - 3, fy - 3, 6, 6);
      }

      // sign
      const label = `${b.icon} ${enc.animals.length}/${enc.capacity}`;
      ctx.font = 'bold 12px system-ui, sans-serif';
      const lw = ctx.measureText(label).width + 14;
      ctx.fillStyle = '#5b3b1c';
      ctx.fillRect(p.x + 8, p.y + 8, lw, 20);
      ctx.fillStyle = '#ffeec2';
      ctx.textAlign = 'left';
      ctx.fillText(label, p.x + 15, p.y + 22);
    }

    if (isSel || (isHover && unlocked && enc)) {
      ctx.strokeStyle = isSel ? '#fff36b' : 'rgba(255,255,255,0.7)';
      ctx.lineWidth = 3;
      ctx.strokeRect(p.x - 6, p.y - 6, p.w + 12, p.h + 12);
    }
  }

  return { init, resize, render, select, get selected() { return selected; } };
})();
