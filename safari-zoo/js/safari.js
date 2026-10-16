// The top-down "go catch animals" part of the game.

const Safari = (() => {
  // The world is a tall strip: base camp at the bottom, then each region further north.
  const WORLD_W = 3000;
  const BAND = 1400;                                   // height of each region
  const WORLD_H = BAND * REGION_ORDER.length + 400;    // savanna gets extra room for base camp
  const TERRAIN_SCALE = 5;                             // terrain texture is world size / 5 pixels
  const BASE = { x: WORLD_W / 2, y: WORLD_H - 220, r: 170 };
  const CELL = 200;                                    // obstacle spatial-grid cell size
  const POP_PER_REGION = 24;
  const JEEP_R = 20;

  // Obstacles and decoration per region: [emojis, count, collision radius, draw size]
  const REGION_FEATURES = {
    savanna:  { ponds: 5,  ice: 0,  obstacles: [[['🌳'], 60, 16, 52], [['🪨'], 30, 18, 36]] },
    wetlands: { ponds: 26, ice: 0,  obstacles: [[['🌳'], 45, 16, 52], [['🪨'], 15, 18, 34]] },
    jungle:   { ponds: 3,  ice: 0,  obstacles: [[['🌴', '🌳', '🌴'], 300, 16, 56], [['🪨'], 20, 18, 36]] },
    desert:   { ponds: 2,  ice: 0,  obstacles: [[['🪨'], 80, 18, 38], [['🌴'], 25, 16, 52]] },
    tundra:   { ponds: 0,  ice: 10, obstacles: [[['🌲'], 110, 15, 50], [['🪨'], 30, 18, 36]] },
  };

  let canvas, ctx, W = 0, H = 0;
  let S = null;       // runtime state for the current safari
  let onEnd = null;   // callback(cargo, towed, regionsVisited)

  // ---------------- World generation ----------------

  // y coordinate of the northern edge of region index k (wavy).
  function boundaryY(k, x) {
    const p = S.world.ph;
    return regionTop(k) + Math.sin(x * 0.004 + p[k % 3]) * 90 + Math.sin(x * 0.013 + p[(k + 1) % 3]) * 35;
  }
  // Straight-line top of region k (before waviness).
  function regionTop(k) { return WORLD_H - 400 - BAND * (k + 1); }

  function regionIndexAt(x, y) {
    for (let k = 0; k < REGION_ORDER.length - 1; k++) if (y > boundaryY(k, x)) return k;
    return REGION_ORDER.length - 1;
  }
  function biomeAt(x, y) { return REGION_ORDER[regionIndexAt(x, y)]; }

  // 0 at the near (south) edge of a region, 1 at the far (north) edge.
  function depthInRegion(k, y) {
    const bottom = k === 0 ? BASE.y : regionTop(k - 1);
    return clamp((bottom - y) / (bottom - regionTop(k)), 0, 1);
  }

  function inCircles(list, x, y, pad = 0) {
    for (const c of list) if ((x - c.x) ** 2 + (y - c.y) ** 2 < (c.r + pad) ** 2) return c;
    return null;
  }

  function randPointIn(biome, minBaseDist = 400) {
    const k = REGION_ORDER.indexOf(biome);
    for (let i = 0; i < 200; i++) {
      const x = rand(80, WORLD_W - 80);
      const y = rand(Math.max(80, regionTop(k) - 120), Math.min(WORLD_H - 80, (k === 0 ? WORLD_H : regionTop(k - 1)) + 120));
      if (biomeAt(x, y) !== biome) continue;
      if (dist(x, y, BASE.x, BASE.y) < minBaseDist) continue;
      return { x, y };
    }
    return null;
  }

  function genWorld() {
    const w = {
      ph: [rand(0, 100), rand(0, 100), rand(0, 100)],
      ponds: [], ice: [], obstacles: [], grid: new Map(), decor: [],
    };
    S.world = w;

    for (const b of REGION_ORDER) {
      const f = REGION_FEATURES[b];
      for (let i = 0; i < f.ponds; i++) { const p = randPointIn(b, 450); if (p) w.ponds.push({ ...p, r: rand(60, 150) }); }
      for (let i = 0; i < f.ice; i++) { const p = randPointIn(b); if (p) w.ice.push({ ...p, r: rand(110, 210) }); }
    }
    for (const b of REGION_ORDER) {
      for (const [emojis, n, r, size] of REGION_FEATURES[b].obstacles) {
        for (let i = 0; i < n; i++) {
          const p = randPointIn(b, 300);
          if (!p || inCircles(w.ponds, p.x, p.y, 20) || inCircles(w.ice, p.x, p.y, 10)) continue;
          const emoji = emojis[randInt(0, emojis.length - 1)];
          const o = { x: p.x, y: p.y, r, size, emoji, biome: b, variant: randInt(0, 5) };
          // How it's drawn: top-down trees get a canopy wider than their trunk (the collision circle).
          if (emoji === '🪨') { o.kind = 'rock'; o.draw = size * 1.15; o.tint = b === 'desert' ? 'sand' : b === 'jungle' || b === 'wetlands' ? 'dark' : 'grey'; }
          else if (emoji === '🌴') { o.kind = 'palm'; o.draw = size * 1.6; }
          else if (emoji === '🌲') { o.kind = 'pine'; o.draw = size * 1.35; }
          else { o.kind = b === 'savanna' ? 'acacia' : b === 'jungle' ? 'jungle' : 'broadleaf'; o.draw = size * (b === 'savanna' ? 1.7 : 1.5); }
          w.obstacles.push(o);
          const key = Math.floor(o.x / CELL) + ',' + Math.floor(o.y / CELL);
          if (!w.grid.has(key)) w.grid.set(key, []);
          w.grid.get(key).push(o);
        }
      }
    }
    // Painter's order by y so lower things overlap higher ones.
    w.obstacles.sort((a, b) => a.y - b.y);

    // Non-colliding ground decoration.
    const DETAILS = {
      savanna: ['drytuft', 'drytuft', 'tuft', 'flowers'], wetlands: ['reeds', 'tuft', 'fern'],
      jungle: ['fern', 'fern', 'tuft'], desert: ['pebbles', 'pebbles', 'drytuft'], tundra: ['snowmound', 'snowmound', 'snowmound'],
    };
    for (let i = 0; i < 1600; i++) {
      const x = rand(0, WORLD_W), y = rand(0, WORLD_H);
      if (inCircles(w.ponds, x, y) || inCircles(w.ice, x, y)) continue;
      const opts = DETAILS[biomeAt(x, y)];
      w.decor.push({ x, y, kind: opts[randInt(0, opts.length - 1)], seed: randInt(0, 5), size: rand(18, 30) });
    }

    // Resource nodes to gather (one resource type per region).
    w.resources = [];
    for (const b of REGION_ORDER) {
      let placed = 0;
      for (let tries = 0; placed < ECON.resourceNodesPerRegion && tries < ECON.resourceNodesPerRegion * 4; tries++) {
        const p = randPointIn(b, 350);
        if (!p || inCircles(w.ponds, p.x, p.y, 20)) continue;
        if (nearbyObstaclesIn(w, p.x, p.y).some((o) => dist(o.x, o.y, p.x, p.y) < o.r + 30)) continue;
        w.resources.push({ x: p.x, y: p.y, res: BIOMES[b].resource, phase: rand(0, 6) });
        placed++;
      }
    }

    w.terrain = renderTerrain(w);
  }

  // Ground colours per region: [main, patches, accent].
  const GROUND = {
    savanna:  [[206, 182, 112], [176, 160, 92], [186, 148, 98]],
    wetlands: [[112, 146, 92],  [86, 124, 74],  [118, 104, 74]],
    jungle:   [[66, 112, 52],   [48, 92, 42],   [88, 128, 60]],
    desert:   [[232, 202, 146], [214, 180, 124], [240, 216, 168]],
    tundra:   [[236, 241, 247], [212, 224, 238], [246, 249, 252]],
  };

  function renderTerrain(w) {
    const nw = Math.ceil(WORLD_W / TERRAIN_SCALE), nh = Math.ceil(WORLD_H / TERRAIN_SCALE);
    const c = document.createElement('canvas');
    c.width = nw; c.height = nh;
    const g = c.getContext('2d');
    const img = g.createImageData(nw, nh);
    const ox = w.ph[0] * 50, oy = w.ph[1] * 50;
    for (let py = 0; py < nh; py++) {
      for (let px = 0; px < nw; px++) {
        const x = px * TERRAIN_SCALE, y = py * TERRAIN_SCALE;
        const large = Sprites.fbm(x * 0.0025 + ox, y * 0.0025 + oy);
        const med = Sprites.fbm(x * 0.012 + oy, y * 0.012 + ox);
        // Ragged, natural-looking borders between regions.
        const biome = biomeAt(x, y + (large - 0.5) * 140);
        const pal = GROUND[biome];
        let col = Sprites.mix(pal[0], pal[1], Math.min(1, Math.max(0, (large - 0.35) * 2.5)));
        if (med > 0.68) col = Sprites.mix(col, pal[2], Math.min(1, (med - 0.68) * 4));
        let v = (med - 0.5) * 18 + (Math.random() - 0.5) * 7;
        if (biome === 'desert') v += Math.sin(x * 0.05 + y * 0.018 + large * 9) * 7;      // dune ripples
        if (biome === 'tundra') col = Sprites.mix(col, [196, 212, 232], Math.max(0, (large - 0.6) * 1.5)); // blue drift shadows
        const i = (py * nw + px) * 4;
        img.data[i] = col[0] + v; img.data[i + 1] = col[1] + v; img.data[i + 2] = col[2] + v; img.data[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    const s = 1 / TERRAIN_SCALE;
    for (const p of w.ponds) {
      const wet = biomeAt(p.x, p.y) === 'wetlands';
      const px = p.x * s, py = p.y * s, pr = p.r * s;
      // damp shoreline
      let gr = g.createRadialGradient(px, py, pr * 0.9, px, py, pr + 18 * s);
      gr.addColorStop(0, wet ? 'rgba(70,90,50,0.9)' : 'rgba(150,120,70,0.9)');
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr;
      g.beginPath(); g.arc(px, py, pr + 18 * s, 0, Math.PI * 2); g.fill();
      // water, deeper in the middle
      gr = g.createRadialGradient(px - pr * 0.2, py - pr * 0.2, pr * 0.1, px, py, pr);
      gr.addColorStop(0, wet ? '#2c5e6a' : '#2f6f9a');
      gr.addColorStop(0.7, wet ? '#3f7a7a' : '#3f8fbf');
      gr.addColorStop(1, wet ? '#6f9a80' : '#7fb8cf');
      g.fillStyle = gr;
      g.beginPath(); g.arc(px, py, pr, 0, Math.PI * 2); g.fill();
    }
    for (const p of w.ice) {
      const px = p.x * s, py = p.y * s, pr = p.r * s;
      const gr = g.createRadialGradient(px - pr * 0.3, py - pr * 0.3, 0, px, py, pr);
      gr.addColorStop(0, '#e6f6ff'); gr.addColorStop(0.7, '#b9dff2'); gr.addColorStop(1, 'rgba(170,210,235,0.6)');
      g.fillStyle = gr;
      g.beginPath(); g.arc(px, py, pr, 0, Math.PI * 2); g.fill();
      // a few faint hairline cracks
      g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 0.4;
      for (let k = 0; k < 5; k++) {
        g.beginPath();
        let x = px + rand(-pr, pr) * 0.6, y = py + rand(-pr, pr) * 0.6;
        g.moveTo(x, y);
        for (let t = 0; t < 3; t++) { x += rand(-pr, pr) * 0.12; y += rand(-pr, pr) * 0.12; g.lineTo(x, y); }
        g.stroke();
      }
    }
    // Base camp: trampled dirt.
    const gr = g.createRadialGradient(BASE.x * s, BASE.y * s, 0, BASE.x * s, BASE.y * s, BASE.r * s);
    gr.addColorStop(0, '#a3845a'); gr.addColorStop(0.85, '#a88a5e'); gr.addColorStop(1, 'rgba(168,138,94,0)');
    g.fillStyle = gr;
    g.beginPath(); g.arc(BASE.x * s, BASE.y * s, BASE.r * s, 0, Math.PI * 2); g.fill();
    return c;
  }

  function nearbyObstaclesIn(w, x, y) {
    const cx = Math.floor(x / CELL), cy = Math.floor(y / CELL), out = [];
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      const arr = w.grid.get((cx + dx) + ',' + (cy + dy));
      if (arr) out.push(...arr);
    }
    return out;
  }

  // Take health off the jeep; at 0 it breaks down and gets towed home.
  function damageJeep(dmg) {
    S.hp = Math.max(0, S.hp - dmg);
    if (S.hp <= 0 && S.outOfFuelT < 0) {
      S.outOfFuelT = 0;
      S.brokeDown = true;
      message(`💥 Your jeep broke down! A tow truck hauls you home (-$${ECON.towFee})`, 3);
      Sfx.error();
    }
  }

  // Destroy an obstacle the jeep crashed into: it's removed from the world in a burst of debris.
  function smashObstacle(o) {
    o.dead = true;
    const key = Math.floor(o.x / CELL) + ',' + Math.floor(o.y / CELL);
    const arr = S.world.grid.get(key);
    if (arr) arr.splice(arr.indexOf(o), 1);
    const colors = { rock: o.tint === 'sand' ? ['#b08a5a', '#d6b588'] : ['#8d8d8d', '#b5b5b5'], pine: ['#2f6b3a', '#6b4a2a'], palm: ['#5a8c36', '#8a6a3a'] }[o.kind] || ['#4f8f3a', '#7a5230'];
    for (const c of colors) burst(o.x, o.y - o.size * 0.3, c, 12);
  }

  function nearbyObstacles(x, y) {
    const cx = Math.floor(x / CELL), cy = Math.floor(y / CELL);
    const out = [];
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      const arr = S.world.grid.get((cx + dx) + ',' + (cy + dy));
      if (arr) out.push(...arr);
    }
    return out;
  }

  function terrainAt(x, y) {
    return {
      biome: biomeAt(x, y),
      water: !!inCircles(S.world.ponds, x, y),
      ice: !!inCircles(S.world.ice, x, y),
    };
  }

  // ---------------- Animals ----------------

  function spawnGroup(biome, awayFromJeep) {
    let pos = null;
    for (let i = 0; i < 40 && !pos; i++) {
      const p = randPointIn(biome, 650);
      if (!p) continue;
      if (awayFromJeep && dist(p.x, p.y, S.jeep.x, S.jeep.y) < 750) continue;
      if (inCircles(S.world.ponds, p.x, p.y, 30)) continue;
      pos = p;
    }
    if (!pos) return;
    // Rare animals are more likely deep in their region, common ones near its edge.
    const depth = depthInRegion(REGION_ORDER.indexOf(biome), pos.y);
    const def = weightedPick(SPECIES_BY_BIOME[biome], (d) => d.rarity <= 3 ? d.rarity * (0.2 + 1.8 * depth) : d.rarity * (1.3 - 0.6 * depth));
    const n = randInt(def.group[0], def.group[1]);
    for (let i = 0; i < n; i++) {
      const x = pos.x + rand(-70, 70), y = pos.y + rand(-70, 70);
      if (biomeAt(x, y) !== biome) continue;
      S.animals.push({
        def, x, y, dir: rand(0, Math.PI * 2), spd: 0,
        state: 'wander', timer: rand(0, 3), netHits: 0, sinceHit: 99,
        slowT: 0, tangleT: 0, angryT: 0, recoilT: 0, facing: Math.random() < 0.5 ? 1 : -1,
        bob: rand(0, 10), alive: true,
      });
    }
  }

  function biomeCount(b) {
    let n = 0;
    for (const a of S.animals) if (a.def.biome === b) n++;
    return n;
  }

  function updateAnimal(a, dt) {
    const def = a.def, j = S.jeep;
    const d = dist(a.x, a.y, j.x, j.y);
    a.bob += dt * (a.spd > 20 ? 14 : 3);
    a.sinceHit += dt;
    a.slowT = Math.max(0, a.slowT - dt);
    a.angryT = Math.max(0, a.angryT - dt);
    a.recoilT = Math.max(0, a.recoilT - dt);
    if (a.sinceHit > 2.5) a.netHits = Math.max(0, a.netHits - 0.5 * dt);

    if (a.state === 'tangled') {
      a.spd = 0;
      a.tangleT -= dt;
      if (d < def.size / 2 + JEEP_R + 8) {
        if (S.cargo.length < S.stats.cargoMax) {
          a.alive = false;
          S.cargo.push(def.key);
          S.caughtThisTrip++;
          floatText(a.x, a.y - 30, `+${def.name} (${fmtMoney(def.value)})`, '#fff36b', 20);
          burst(a.x, a.y, '#ffe680', 18);
          Sfx.capture();
          if (S.cargo.length >= S.stats.cargoMax) message('Cargo full! Head back to base camp 🏕️', 3);
          return;
        } else if (S.cargoWarnT <= 0) {
          message('Cargo full! Upgrade your Cargo Cage to carry more.', 2.5);
          S.cargoWarnT = 2.5;
          Sfx.error();
        }
      }
      if (a.tangleT <= 0) {
        a.state = 'flee';
        a.netHits = 0;
        a.timer = 3;
        if (def.behavior === 'aggressive') a.angryT = 3;
        floatText(a.x, a.y - 30, 'Escaped!', '#ff8a8a', 16);
        Sfx.escape();
      }
      return;
    }

    let targetSpd = 0;
    const slow = a.slowT > 0 ? 0.5 : 1;

    if (def.behavior === 'aggressive' && a.recoilT <= 0 && (d < def.aggro || a.angryT > 0) && d < 900) {
      // Charge the jeep!
      a.state = 'charge';
      a.dir = Math.atan2(j.y - a.y, j.x - a.x);
      targetSpd = def.speed * slow;
      if (d < def.size / 2 + JEEP_R) {
        // Ram!
        const ang = Math.atan2(j.y - a.y, j.x - a.x);
        j.vx += Math.cos(ang) * 420; j.vy += Math.sin(ang) * 420;
        j.speed *= -0.3;
        // Bigger, tougher animals hit harder.
        const dmg = Math.round(6 + def.hp * 3);
        S.shake = 12;
        floatText(j.x, j.y - 30, `-${dmg} ❤️`, '#ff7070', 16);
        Sfx.bump();
        damageJeep(dmg);
        a.recoilT = 2.2;
        a.angryT = 0;
        a.dir = ang + Math.PI;
      }
    } else if (a.recoilT > 0) {
      a.state = 'wander';
      targetSpd = def.speed * 0.4;
    } else if (def.flee && d < def.flee) {
      a.state = 'flee';
      const away = Math.atan2(a.y - j.y, a.x - j.x);
      if (def.behavior === 'erratic') {
        a.timer -= dt;
        if (a.timer <= 0) { a.zig = rand(-1.1, 1.1); a.timer = rand(0.25, 0.6); }
        a.dir = away + (a.zig || 0);
      } else {
        a.dir += angleDiff(a.dir, away + Math.sin(a.bob * 0.3) * 0.3) * Math.min(1, dt * 6);
      }
      targetSpd = def.speed * slow;
    } else {
      a.state = 'wander';
      a.timer -= dt;
      if (a.timer <= 0) {
        a.timer = rand(1.5, 4);
        a.wanderMove = Math.random() < 0.6;
        a.dir += rand(-1.5, 1.5);
      }
      targetSpd = a.wanderMove ? def.speed * 0.22 * slow : 0;
    }

    a.spd = lerp(a.spd, targetSpd, Math.min(1, dt * 5));
    const nx = a.x + Math.cos(a.dir) * a.spd * dt;
    const ny = a.y + Math.sin(a.dir) * a.spd * dt;
    const outside = nx < 40 || ny < 40 || nx > WORLD_W - 40 || ny > WORLD_H - 40;
    if (outside || biomeAt(nx, ny) !== def.biome || (!def.flies && !def.swims && inCircles(S.world.ponds, nx, ny)) ||
        dist(nx, ny, BASE.x, BASE.y) < BASE.r + 40) {
      // Bump into a boundary: turn away.
      a.dir += Math.PI + rand(-0.6, 0.6);
      a.spd *= 0.3;
    } else {
      a.x = nx; a.y = ny;
    }
    if (!def.flies) {
      for (const o of nearbyObstacles(a.x, a.y)) {
        const dd = dist(a.x, a.y, o.x, o.y), min = o.r + def.size * 0.3;
        if (dd < min && dd > 0.01) {
          a.x = o.x + (a.x - o.x) / dd * min;
          a.y = o.y + (a.y - o.y) / dd * min;
        }
      }
    }
    if (Math.abs(Math.cos(a.dir)) > 0.2 && a.spd > 5) a.facing = Math.cos(a.dir) > 0 ? -1 : 1;
  }

  // Closest animal inside the auto-aim cone that still needs netting.
  function findAimTarget() {
    const j = S.jeep, st = S.stats;
    let best = null, bestScore = Infinity;
    for (const a of S.animals) {
      if (!a.alive || a.state === 'tangled') continue;
      const d = dist(a.x, a.y, j.x, j.y);
      if (d > st.netRange) continue;
      const off = Math.abs(angleDiff(j.angle, Math.atan2(a.y - j.y, a.x - j.x)));
      if (off > st.aimCone) continue;
      // Skip animals that nets already in flight will tangle.
      const incoming = S.nets.filter((n) => n.target === a).length * st.netPower;
      if (a.netHits + incoming >= a.def.hp) continue;
      const score = d * (1 + off);   // prefer close and straight ahead
      if (score < bestScore) { bestScore = score; best = a; }
    }
    return best;
  }

  function hitAnimal(a) {
    const def = a.def;
    a.netHits += S.stats.netPower;
    a.sinceHit = 0;
    a.slowT = 2.2;
    burst(a.x, a.y, '#ffffff', 8);
    if (a.netHits >= def.hp) {
      a.state = 'tangled';
      a.tangleT = a.tangleMax = 7;
      floatText(a.x, a.y - 34, 'Netted!', '#ffffff', 18);
      if (!S.shownPickupTip) {
        message(`Drive into the netted ${def.name} to load it into your jeep!`, 3.5);
        S.shownPickupTip = true;
      }
      Sfx.tangle();
    } else {
      const left = Math.ceil((def.hp - a.netHits) / S.stats.netPower);
      floatText(a.x, a.y - 34, `${left} more net${left > 1 ? 's' : ''}!`, '#ffe9a8', 15);
      if (def.behavior === 'aggressive') a.angryT = 4;
      Sfx.hit();
    }
  }

  // ---------------- Effects ----------------

  function floatText(x, y, text, color, size = 16) {
    S.floats.push({ x, y, text, color, size, t: 0, life: 1.4 });
  }
  function burst(x, y, color, n) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2), s = rand(40, 160);
      S.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, t: 0, life: rand(0.3, 0.7), color, r: rand(2, 4) });
    }
  }
  function message(text, secs = 2.5) { S.msg = { text, t: secs }; }

  // ---------------- Lifecycle ----------------

  function init(c) {
    canvas = c;
    ctx = c.getContext('2d');
  }

  function resize() {
    const r = canvas.parentElement.getBoundingClientRect();
    W = Math.max(1, r.width); H = Math.max(1, r.height);
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
  }

  function start(endCallback) {
    onEnd = endCallback;
    const stats = Game.jeepStats();
    S = {
      stats,
      jeep: { x: BASE.x, y: BASE.y - 20, angle: -Math.PI / 2, speed: 0, vx: 0, vy: 0, turret: -Math.PI / 2 },
      cam: { x: BASE.x, y: BASE.y },
      animals: [], nets: [], particles: [], floats: [],
      cargo: [], caughtThisTrip: 0,
      fuel: stats.fuelMax, reloadT: 0, t: 0, crashT: 0,
      msg: null, shake: 0, cargoWarnT: 0, respawnT: 0,
      leftBase: false, ended: false, outOfFuelT: -1, paused: false, fenceWarnT: 0,
      hp: stats.hpMax, brokeDown: false,
      shownPickupTip: false,
      netsLeft: stats.nets, groundNets: [], netWarnT: 0, netRefillT: 0, refilling: false,
      gathered: Object.fromEntries(Object.keys(RESOURCES).map((k) => [k, 0])),
      region: 0, regionsVisited: new Set(['savanna']),
    };
    genWorld();
    for (const b of REGION_ORDER) {
      let guard = 0;
      while (biomeCount(b) < POP_PER_REGION && guard++ < 50) spawnGroup(b, false);
    }
    S.cam.x = S.jeep.x; S.cam.y = S.jeep.y;
    resize();
    message('Drive out and net some animals! Watch your fuel ⛽', 3.5);
  }

  function finish(towed) {
    if (S.ended) return;
    S.ended = true;
    onEnd(S.cargo.slice(), towed, [...S.regionsVisited], { ...S.gathered });
  }

  // ---------------- Update ----------------

  function update(dt, input) {
    if (!S || S.ended) return;
    if (input.pressed('Escape') || input.pressed('KeyP')) S.paused = !S.paused;
    if (S.paused) {
      if (input.pressed('KeyQ')) { S.paused = false; S.outOfFuelT = 0; S.fuel = 0; message('Calling the tow truck...', 3); }
      return;
    }
    S.t += dt;
    S.crashT -= dt;
    const st = S.stats, j = S.jeep;

    // Fuel
    if (S.outOfFuelT < 0) {
      if (!S.atBase) S.fuel -= dt;   // no fuel used while parked at base camp
      if (S.fuel <= 0) {
        S.fuel = 0;
        S.outOfFuelT = 0;
        message(`Out of fuel! A tow truck hauls you home (-$${ECON.towFee})`, 3);
        Sfx.error();
      }
    } else {
      S.outOfFuelT += dt;
      if (S.outOfFuelT > 2.8) { finish(true); return; }
    }
    const canDrive = S.outOfFuelT < 0;

    // Driving
    let up = canDrive && input.down('KeyW', 'ArrowUp');
    let down = canDrive && input.down('KeyS', 'ArrowDown');
    const left = canDrive && input.down('KeyA', 'ArrowLeft');
    const right = canDrive && input.down('KeyD', 'ArrowRight');
    let steer = (right ? 1 : 0) - (left ? 1 : 0);
    // Touch joystick: the jeep turns to face the stick direction and drives that way.
    const ax = input.axis;
    if (canDrive && ax.active && Math.hypot(ax.x, ax.y) > 0.25) {
      const diff = angleDiff(j.angle, Math.atan2(ax.y, ax.x));
      if (Math.abs(diff) < 2.2 || j.speed > 40) {
        up = true;
        steer = clamp(diff * 2.5, -1, 1);
      } else {
        // Stick points behind you: back up while swinging the nose around.
        down = true;
        steer = -clamp(diff * 2.5, -1, 1);
      }
    }
    const ter = terrainAt(j.x, j.y);
    let mult = ter.water ? 0.45 : BIOMES[ter.biome].speed;
    mult = 1 - (1 - mult) * (1 - st.terrainGrip);
    const top = st.maxSpeed * mult;

    if (up) j.speed += st.accel * dt;
    else if (down) j.speed -= (j.speed > 0 ? st.accel * 1.8 : st.accel * 0.6) * dt;
    else j.speed *= Math.pow(ter.ice ? 0.6 : 0.15, dt);
    if (j.speed > top) j.speed = lerp(j.speed, top, Math.min(1, dt * 4));
    j.speed = Math.max(-top * 0.45, j.speed);

    j.angle += steer * st.turnRate * dt * clamp(j.speed / 110, -1, 1);

    const grip = ter.ice ? 1.6 : 9;
    const dvx = Math.cos(j.angle) * j.speed, dvy = Math.sin(j.angle) * j.speed;
    j.vx += (dvx - j.vx) * Math.min(1, grip * dt);
    j.vy += (dvy - j.vy) * Math.min(1, grip * dt);
    j.x += j.vx * dt;
    j.y += j.vy * dt;

    // Obstacle collisions
    for (const o of nearbyObstacles(j.x, j.y)) {
      const dd = dist(j.x, j.y, o.x, o.y), min = o.r + JEEP_R;
      if (dd < min && dd > 0.01) {
        const nx = (j.x - o.x) / dd, ny = (j.y - o.y) / dd;
        j.x = o.x + nx * min; j.y = o.y + ny * min;
        const impact = -(j.vx * nx + j.vy * ny);
        if (impact > 0) {
          j.vx += nx * impact * 1.4; j.vy += ny * impact * 1.4;
          j.speed *= 0.25;
          if (impact > 60 && S.crashT <= 0) {
            // A real crash smashes the obstacle and damages the jeep (~1 health per 10 impact speed).
            const dmg = Math.max(2, Math.round(impact / 10));
            S.crashT = 0.4;
            S.shake = Math.min(12, impact / 25);
            smashObstacle(o);
            floatText(j.x, j.y - 30, `Crash! -${dmg} ❤️`, '#ff7070', 16);
            Sfx.bump();
            damageJeep(dmg);
          }
        }
      }
    }
    j.x = clamp(j.x, JEEP_R, WORLD_W - JEEP_R);
    j.y = clamp(j.y, JEEP_R, WORLD_H - JEEP_R);

    // Region permits: a ranger fence blocks the border of the first region your tier doesn't cover.
    const lastOpen = Game.s.tier - 1;
    if (lastOpen < REGION_ORDER.length - 1) {
      const fy = boundaryY(lastOpen, j.x) + JEEP_R;
      if (j.y < fy) {
        j.y = fy;
        if (j.vy < 0) j.vy *= -0.3;
        j.speed *= 0.5;
        S.fenceWarnT -= dt;
        if (S.fenceWarnT <= 0) {
          const next = BIOMES[REGION_ORDER[lastOpen + 1]];
          message(`🚧 The ${next.name} needs a tier ${lastOpen + 2} permit: display ${TIERS[lastOpen + 1].species} species in your zoo`, 3.5);
          Sfx.bump();
          S.fenceWarnT = 3.5;
        }
      }
    }

    // Dust trail
    if (Math.abs(j.speed) > 80 && Math.random() < dt * 30) {
      const g = BIOMES[ter.biome].ground;
      const col = ter.water ? '#d9f0ff' : ter.biome === 'tundra' ? '#ffffff' : `rgb(${g[0] - 20},${g[1] - 20},${g[2] - 20})`;
      S.particles.push({
        x: j.x - Math.cos(j.angle) * 22 + rand(-6, 6), y: j.y - Math.sin(j.angle) * 22 + rand(-6, 6),
        vx: rand(-20, 20), vy: rand(-20, 20), t: 0, life: 0.6, color: col, r: rand(3, 6),
      });
    }

    // Camera (with a little look-ahead)
    const lookX = j.x + j.vx * 0.35, lookY = j.y + j.vy * 0.35;
    S.cam.x = lerp(S.cam.x, lookX, Math.min(1, dt * 4));
    S.cam.y = lerp(S.cam.y, lookY, Math.min(1, dt * 4));
    S.cam.x = clamp(S.cam.x, Math.min(W / 2, WORLD_W / 2), Math.max(WORLD_W - W / 2, WORLD_W / 2));
    S.cam.y = clamp(S.cam.y, Math.min(H / 2, WORLD_H / 2), Math.max(WORLD_H - H / 2, WORLD_H / 2));
    S.shake = Math.max(0, S.shake - dt * 30);

    // Aiming & shooting
    // Nets fire straight out of the front, unless the Auto-Aim Turret has locked onto an animal.
    S.target = st.aimCone > 0 ? findAimTarget() : null;
    let aimAng = j.angle;
    if (S.target) {
      // Lead the target a little so nets land where it's going.
      const a = S.target, t = dist(a.x, a.y, j.x, j.y) / st.netSpeed;
      const px = a.x + Math.cos(a.dir) * a.spd * t, py = a.y + Math.sin(a.dir) * a.spd * t;
      aimAng = Math.atan2(py - j.y, px - j.x);
    }
    j.turret += angleDiff(j.turret, aimAng) * Math.min(1, dt * 18);
    S.reloadT -= dt;
    S.netWarnT -= dt;
    const manualFire = input.mouse.down || input.down('Space');
    if (st.autoFire && input.pressed('KeyF')) {
      Game.s.autoFireOn = !Game.s.autoFireOn;
      Game.save();
      message(Game.s.autoFireOn ? 'Auto-fire ON' : 'Auto-fire OFF: the turret still aims, you fire', 2);
      Sfx.hit();
    }
    const autoFire = st.autoFire && Game.s.autoFireOn && S.target && S.netsLeft > 0;
    const wantFire = canDrive && (manualFire || autoFire) && S.reloadT <= 0;
    if (wantFire && S.netsLeft <= 0) {
      if (S.netWarnT <= 0) {
        message(S.groundNets.length ? 'Out of nets! Drive over missed nets to pick them back up.' : 'Out of nets! Head back to base camp.', 2.5);
        Sfx.error();
        S.netWarnT = 2.5;
      }
    } else if (wantFire) {
      S.reloadT = st.reload;
      S.netsLeft--;
      j.turret = aimAng;
      const sx = j.x + Math.cos(aimAng) * 20, sy = j.y + Math.sin(aimAng) * 20;
      S.nets.push({
        x: sx, y: sy,
        vx: Math.cos(aimAng) * st.netSpeed + j.vx * 0.5,
        vy: Math.sin(aimAng) * st.netSpeed + j.vy * 0.5,
        traveled: 0, max: st.netRange, rot: 0, target: S.target,
      });
      Sfx.shoot();
    }

    // Nets
    for (const n of S.nets) {
      const step = Math.hypot(n.vx, n.vy) * dt;
      n.x += n.vx * dt; n.y += n.vy * dt; n.traveled += step; n.rot += dt * 10;
      for (const a of S.animals) {
        if (!a.alive || a.state === 'tangled') continue;
        if (dist(n.x, n.y, a.x, a.y) < a.def.size * 0.5 + 12) { hitAnimal(a); n.dead = true; break; }
      }
      if (!n.dead) {
        for (const o of nearbyObstacles(n.x, n.y)) {
          if (o.size > 40 && dist(n.x, n.y, o.x, o.y) < o.r) {
            n.dead = true;
            burst(n.x, n.y, '#eee', 4);
            // Bounce off and land just in front of the obstacle.
            const a = Math.atan2(n.y - o.y, n.x - o.x);
            S.groundNets.push({ x: o.x + Math.cos(a) * (o.r + 26), y: o.y + Math.sin(a) * (o.r + 26), rot: n.rot });
            break;
          }
        }
      }
      if (!n.dead && n.traveled > n.max) {
        // A miss: the net lands on the ground and can be picked up again.
        n.dead = true;
        S.groundNets.push({ x: n.x, y: n.y, rot: n.rot });
      }
    }
    S.nets = S.nets.filter((n) => !n.dead);

    // Gather resources by driving over them.
    for (const r of S.world.resources) {
      if (!r.taken && dist(r.x, r.y, j.x, j.y) < JEEP_R + 20) {
        r.taken = true;
        S.gathered[r.res] += ECON.resourcePerNode;
        floatText(r.x, r.y - 20, `+${ECON.resourcePerNode} ${RESOURCES[r.res].emoji}`, '#ffe680', 16);
        burst(r.x, r.y, '#ffe680', 8);
        Sfx.tone(660, 0.08, 'triangle', 0.05); Sfx.tone(990, 0.1, 'triangle', 0.05, 0, 0.06);
      }
    }

    // Pick up missed nets by driving over them.
    for (const g of S.groundNets) {
      if (dist(g.x, g.y, j.x, j.y) < JEEP_R + 18) {
        g.taken = true;
        S.netsLeft++;
        floatText(g.x, g.y - 20, '+1 net', '#ffffff', 14);
        Sfx.hit();
      }
    }
    S.groundNets = S.groundNets.filter((g) => !g.taken);

    // Region tracking
    const ri = regionIndexAt(j.x, j.y);
    if (ri !== S.region) {
      S.region = ri;
      const b = REGION_ORDER[ri], def = BIOMES[b];
      const isNew = !Game.s.regionsVisited[b] && !S.regionsVisited.has(b);
      S.regionsVisited.add(b);
      message(isNew ? `New region discovered: the ${def.name} ${def.icon}!` : `Entering the ${def.name} ${def.icon}`, 3);
    }

    // Animals
    S.cargoWarnT -= dt;
    for (const a of S.animals) if (a.alive) updateAnimal(a, dt);
    S.animals = S.animals.filter((a) => a.alive);
    S.respawnT -= dt;
    if (S.respawnT <= 0) {
      S.respawnT = 1.5;
      for (const b of REGION_ORDER) if (biomeCount(b) < POP_PER_REGION - 3) spawnGroup(b, true);
    }

    // Particles & floats
    for (const p of S.particles) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.92; p.vy *= 0.92; }
    S.particles = S.particles.filter((p) => p.t < p.life);
    for (const f of S.floats) { f.t += dt; f.y -= 30 * dt; }
    S.floats = S.floats.filter((f) => f.t < f.life);
    if (S.msg) { S.msg.t -= dt; if (S.msg.t <= 0) S.msg = null; }

    // Base camp
    const atBase = dist(j.x, j.y, BASE.x, BASE.y) < BASE.r;
    if (!atBase) S.leftBase = true;
    S.atBase = atBase && canDrive;
    // Base camp refills fuel and nets (quickly, but not instantly).
    S.refilling = false;
    if (S.atBase && Game.s.perks.campRefill) {
      if (S.fuel < st.fuelMax) {
        S.fuel = Math.min(st.fuelMax, S.fuel + st.fuelMax * 0.5 * dt);
        S.refilling = true;
      }
      if (S.hp < st.hpMax) {
        S.hp = Math.min(st.hpMax, S.hp + st.hpMax * 0.5 * dt);
        S.refilling = true;
      }
      if (S.netsLeft < st.nets) {
        S.netRefillT -= dt;
        if (S.netRefillT <= 0) { S.netsLeft++; S.netRefillT = 0.12; Sfx.tone(520, 0.04, 'triangle', 0.03); }
        S.refilling = true;
      }
    }
    if (S.atBase && (S.leftBase || S.t > 3) && input.pressed('KeyE')) finish(false);
  }

  // ---------------- Rendering ----------------

  // A canvas tent seen from above: two roof halves, lit and shaded, with a ridge line.
  function drawTent(x, y, size, rot, color) {
    Sprites.shadow(ctx, x, y, size * 0.6, size * 0.45, 0.35, 0.3);
    ctx.save();
    ctx.translate(x, y); ctx.rotate(rot);
    const w = size * 0.55, h = size * 0.4;
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.moveTo(-w, -h); ctx.lineTo(w, -h); ctx.lineTo(w, 0); ctx.lineTo(-w, 0); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath(); ctx.moveTo(-w, 0); ctx.lineTo(w, 0); ctx.lineTo(w, h); ctx.lineTo(-w, h); ctx.closePath(); ctx.fill();
    ctx.fillStyle = color; ctx.globalAlpha = 0.75;
    ctx.fillRect(-w, 0, w * 2, h);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-w - 4, 0); ctx.lineTo(w + 4, 0); ctx.stroke();
    ctx.restore();
  }

  function drawJeep(j) {
    Sprites.shadow(ctx, j.x, j.y, 30, 20, 0.45, 0.3);
    ctx.save();
    ctx.translate(j.x, j.y);
    ctx.rotate(j.angle);
    // wheels with tread
    for (const [wx, wy] of [[-17, -17], [11, -17], [-17, 11], [11, 11]]) {
      ctx.fillStyle = '#1b1b1b';
      ctx.fillRect(wx, wy, 12, 6);
      ctx.fillStyle = '#3a3a3a';
      for (let k = 1; k < 12; k += 3) ctx.fillRect(wx + k, wy, 1, 6);
    }
    // body with metallic shading
    let gr = ctx.createLinearGradient(0, -13, 0, 13);
    gr.addColorStop(0, '#7f9c52'); gr.addColorStop(0.5, '#5d7a3a'); gr.addColorStop(1, '#3f5626');
    ctx.fillStyle = gr;
    roundRect(-24, -13, 48, 26, 5); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 1; ctx.stroke();
    // open cargo bed at the back
    ctx.fillStyle = '#4a3b26';
    roundRect(-21, -10, 20, 20, 2); ctx.fill();
    ctx.strokeStyle = '#2b2116'; ctx.lineWidth = 1;
    for (let k = -18; k < 0; k += 4) { ctx.beginPath(); ctx.moveTo(k, -10); ctx.lineTo(k, 10); ctx.stroke(); }
    // roll bar
    ctx.strokeStyle = '#2a2a2a'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(-1, -12); ctx.lineTo(-1, 12); ctx.stroke();
    // seats
    ctx.fillStyle = '#3b2f22';
    ctx.fillRect(1, -9, 6, 7); ctx.fillRect(1, 2, 6, 7);
    // windshield with reflection
    gr = ctx.createLinearGradient(8, -11, 13, 11);
    gr.addColorStop(0, '#d8f2ff'); gr.addColorStop(0.4, '#8cc4dc'); gr.addColorStop(1, '#4f7f95');
    ctx.fillStyle = gr;
    ctx.fillRect(8, -11, 4, 22);
    // hood with a centre crease
    gr = ctx.createLinearGradient(12, -12, 24, 12);
    gr.addColorStop(0, '#6f8f47'); gr.addColorStop(1, '#46602b');
    ctx.fillStyle = gr;
    roundRect(12, -12, 12, 24, 3); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(13, 0); ctx.lineTo(23, 0); ctx.stroke();
    // headlights
    ctx.fillStyle = '#fff6c8';
    ctx.beginPath(); ctx.arc(23, -8, 2, 0, Math.PI * 2); ctx.arc(23, 8, 2, 0, Math.PI * 2); ctx.fill();
    // spare tyre
    ctx.fillStyle = '#1b1b1b';
    ctx.beginPath(); ctx.arc(-25, 0, 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#555';
    ctx.beginPath(); ctx.arc(-25, 0, 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    // Net launcher turret
    ctx.save();
    ctx.translate(j.x - Math.cos(j.angle) * 6, j.y - Math.sin(j.angle) * 6);
    ctx.rotate(j.turret);
    ctx.fillStyle = '#3a3a3a';
    ctx.fillRect(0, -3.5, 22, 7);
    ctx.fillStyle = '#555';
    ctx.beginPath(); ctx.arc(0, 0, 7, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawNet(x, y, r, rot, alpha = 1) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = '#f4f4f4';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath();
    for (let i = -1; i <= 1; i++) {
      ctx.moveTo(i * r * 0.5, -r * 0.87); ctx.lineTo(i * r * 0.5, r * 0.87);
      ctx.moveTo(-r * 0.87, i * r * 0.5); ctx.lineTo(r * 0.87, i * r * 0.5);
    }
    ctx.stroke();
    ctx.fillStyle = '#c0392b';
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2 + Math.PI / 4;
      ctx.beginPath(); ctx.arc(Math.cos(a) * r, Math.sin(a) * r, 2.5, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  function render() {
    if (!S) return;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.fillStyle = '#2b3a22';
    ctx.fillRect(0, 0, W, H);

    const sx = S.shake ? rand(-S.shake, S.shake) : 0, sy = S.shake ? rand(-S.shake, S.shake) : 0;
    const camX = S.cam.x - W / 2 + sx, camY = S.cam.y - H / 2 + sy;
    ctx.save();
    ctx.translate(-camX, -camY);

    // Terrain
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(S.world.terrain, 0, 0, WORLD_W, WORLD_H);
    // Fine grain so the ground stays crisp up close.
    if (!S.grain) S.grain = Sprites.grainPattern(ctx);
    ctx.fillStyle = S.grain;
    ctx.fillRect(camX, camY, W, H);

    const vis = (x, y, m = 80) => x > camX - m && x < camX + W + m && y > camY - m && y < camY + H + m;

    // Water shimmer
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1.5;
    for (const p of S.world.ponds) {
      if (!vis(p.x, p.y, p.r)) continue;
      for (let k = 0; k < 3; k++) {
        const ph = S.t * 0.6 + k * 2.1 + p.x * 0.01;
        const rx = p.x + Math.cos(ph) * p.r * 0.4, ry = p.y + Math.sin(ph * 0.7) * p.r * 0.35;
        ctx.beginPath(); ctx.arc(rx, ry, p.r * 0.18, Math.PI * 1.1, Math.PI * 1.6); ctx.stroke();
      }
    }

    for (const d of S.world.decor) if (vis(d.x, d.y)) Sprites.draw(ctx, Sprites.makeDetail(d.kind, d.seed), d.x, d.y, d.size);

    // Shadows of trees and rocks (drawn on the ground, under animals and the jeep)
    for (const o of S.world.obstacles) {
      if (o.dead || !vis(o.x, o.y, o.draw)) continue;
      const rr = o.kind === 'rock' ? o.draw * 0.5 : o.draw * 0.48;
      Sprites.shadow(ctx, o.x, o.y, rr, rr * 0.85, o.kind === 'rock' ? 0.4 : 0.32, o.kind === 'rock' ? 0.22 : 0.35);
    }

    // Base camp
    drawTent(BASE.x - 70, BASE.y - 40, 64, 0.15, '#c96b2c');
    drawTent(BASE.x + 75, BASE.y - 25, 56, -0.2, '#6b8a3a');
    drawEmoji(ctx, '🚩', BASE.x, BASE.y - 110, 36);
    drawEmoji(ctx, '⛽', BASE.x - 90, BASE.y + 60, 30);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = 'bold 14px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('BASE CAMP', BASE.x, BASE.y + 110);

    // Particles (ground layer)
    for (const p of S.particles) {
      ctx.globalAlpha = 1 - p.t / p.life;
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Animals
    for (const a of S.animals) {
      if (!vis(a.x, a.y)) continue;
      const def = a.def;
      Sprites.shadow(ctx, a.x + def.size * 0.06, a.y + def.size * 0.34, def.size * 0.42, def.size * 0.16, 0.38, 0.3);
      const bob = a.spd > 20 ? Math.abs(Math.sin(a.bob)) * 4 : Math.sin(a.bob) * 0.8;
      const fly = def.flies ? 10 : 0;
      const wiggle = a.state === 'tangled' ? Math.sin(S.t * 30) * 2 : 0;
      drawEmoji(ctx, def.emoji, a.x + wiggle, a.y - bob - fly, def.size, a.facing < 0);
      if (a.state === 'tangled') {
        drawNet(a.x, a.y - fly, def.size * 0.55, 0.3);
        // escape timer ring
        const frac = a.tangleT / a.tangleMax;
        ctx.strokeStyle = frac > 0.35 ? '#ffe14d' : '#ff5c5c';
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(a.x, a.y - fly, def.size * 0.7, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac); ctx.stroke();
      } else if (a.netHits > 0.01) {
        // partial net progress bar
        const w = def.size * 0.9, frac = Math.min(1, a.netHits / def.hp);
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(a.x - w / 2, a.y - def.size * 0.75, w, 5);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(a.x - w / 2, a.y - def.size * 0.75, w * frac, 5);
      }
      if (a.state === 'charge') drawEmoji(ctx, '💢', a.x + def.size * 0.4, a.y - def.size * 0.6, 16);
    }

    // Resource nodes (gold ring so they stand out from scenery)
    for (const r of S.world.resources) {
      if (r.taken || !vis(r.x, r.y)) continue;
      const pulse = 0.5 + 0.5 * Math.sin(S.t * 4 + r.phase);
      ctx.strokeStyle = `rgba(255,214,90,${0.5 + 0.4 * pulse})`;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(r.x, r.y, 20 + pulse * 3, 0, Math.PI * 2); ctx.stroke();
      drawEmoji(ctx, RESOURCES[r.res].emoji, r.x, r.y - 2 - pulse * 2, 28);
    }

    // Missed nets lying on the ground
    for (const g of S.groundNets) if (vis(g.x, g.y)) drawNet(g.x, g.y, 10, g.rot, 0.75);

    // Ranger fence at the first region you don't have a permit for
    const lastOpen = Game.s.tier - 1;
    if (lastOpen < REGION_ORDER.length - 1) {
      const fx0 = Math.max(0, Math.floor((camX - 40) / 30) * 30), fx1 = Math.min(WORLD_W, camX + W + 40);
      if (vis(camX + W / 2, boundaryY(lastOpen, camX + W / 2), H)) {
        ctx.strokeStyle = '#d9822b';
        ctx.lineWidth = 4;
        for (const off of [-14, -4]) {
          ctx.beginPath();
          for (let x = fx0; x <= fx1; x += 30) {
            const y = boundaryY(lastOpen, x) + off;
            if (x === fx0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
        ctx.fillStyle = '#6b4a2a';
        for (let x = fx0; x <= fx1; x += 60) ctx.fillRect(x - 3, boundaryY(lastOpen, x) - 24, 6, 28);
        const next = BIOMES[REGION_ORDER[lastOpen + 1]];
        ctx.textAlign = 'center';
        ctx.font = 'bold 13px system-ui, sans-serif';
        for (let x = Math.floor(fx0 / 500) * 500 + 250; x <= fx1; x += 500) {
          const y = boundaryY(lastOpen, x);
          drawEmoji(ctx, '🚧', x, y - 34, 30);
          ctx.fillStyle = 'rgba(20,28,18,0.75)';
          ctx.fillRect(x - 90, y + 6, 180, 22);
          ctx.fillStyle = '#ffe680';
          ctx.fillText(`${next.icon} ${next.name}: tier ${lastOpen + 2} permit`, x, y + 22);
        }
      }
    }

    // Region signposts on the track north
    ctx.textAlign = 'center';
    for (let k = 0; k < REGION_ORDER.length - 1; k++) {
      const sx = BASE.x + 80, sy = boundaryY(k, sx) + 50;
      if (!vis(sx, sy, 200)) continue;
      const next = BIOMES[REGION_ORDER[k + 1]];
      ctx.fillStyle = '#6b4a2a';
      ctx.fillRect(sx - 3, sy - 6, 6, 40);
      ctx.fillStyle = '#8a5f35';
      ctx.fillRect(sx - 70, sy - 36, 140, 32);
      ctx.fillStyle = '#ffeec2';
      ctx.font = 'bold 14px system-ui, sans-serif';
      ctx.fillText(`↑ ${next.icon} ${next.name}`, sx, sy - 15);
    }

    // Auto-aim cone and target lock
    if (S.stats.aimCone > 0) {
      const j = S.jeep, c = S.stats.aimCone, r = S.stats.netRange;
      ctx.fillStyle = 'rgba(255,240,120,0.07)';
      ctx.strokeStyle = 'rgba(255,240,120,0.25)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(j.x, j.y);
      ctx.arc(j.x, j.y, r, j.angle - c, j.angle + c);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
    }
    if (S.target) {
      const a = S.target, rr = a.def.size * 0.6 + 4;
      ctx.strokeStyle = '#ff4d4d';
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(a.x, a.y, rr, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath();
      for (const k of [0, 1, 2, 3]) {
        const ang = k * Math.PI / 2 + S.t * 2;
        ctx.moveTo(a.x + Math.cos(ang) * (rr - 6), a.y + Math.sin(ang) * (rr - 6));
        ctx.lineTo(a.x + Math.cos(ang) * (rr + 6), a.y + Math.sin(ang) * (rr + 6));
      }
      ctx.stroke();
    }

    // Nets in flight
    for (const n of S.nets) drawNet(n.x, n.y, 9 + n.traveled / n.max * 7, n.rot);

    drawJeep(S.jeep);

    // Trees & rocks on top (so you can hide under the canopy)
    for (const o of S.world.obstacles) {
      if (o.dead || !vis(o.x, o.y)) continue;
      // Canopies go see-through when the jeep drives underneath.
      const nearJeep = o.kind !== 'rock' && dist(o.x, o.y, S.jeep.x, S.jeep.y) < o.draw * 0.45;
      const sprite = o.kind === 'rock' ? Sprites.makeRock(Math.round(o.draw), o.tint, o.variant, o.biome === 'tundra') : Sprites.makeTree(o.kind, Math.round(o.draw), o.variant);
      Sprites.draw(ctx, sprite, o.x, o.y, o.draw * (o.kind === 'rock' ? 1.2 : 1.3), nearJeep ? 0.45 : 1);
    }

    // Floating texts
    ctx.textAlign = 'center';
    for (const f of S.floats) {
      ctx.globalAlpha = 1 - f.t / f.life;
      ctx.font = `bold ${f.size}px system-ui, sans-serif`;
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.strokeText(f.text, f.x, f.y);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;

    // Arrow back to base when far away
    const bd = dist(S.jeep.x, S.jeep.y, BASE.x, BASE.y);
    if (bd > 500) {
      const ang = Math.atan2(BASE.y - S.jeep.y, BASE.x - S.jeep.x);
      const lowFuel = S.fuel < 15;
      ctx.save();
      ctx.translate(S.jeep.x + Math.cos(ang) * 60, S.jeep.y + Math.sin(ang) * 60);
      ctx.rotate(ang);
      ctx.fillStyle = lowFuel ? `rgba(255,80,80,${0.6 + 0.4 * Math.sin(S.t * 10)})` : 'rgba(255,255,255,0.6)';
      ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(-6, -8); ctx.lineTo(-2, 0); ctx.lineTo(-6, 8); ctx.closePath(); ctx.fill();
      ctx.restore();
    }

    ctx.restore();
    Sprites.vignette(ctx, W, H);
    renderHUD();
  }

  function panel(x, y, w, h) {
    ctx.fillStyle = 'rgba(20,28,18,0.72)';
    roundRect(x, y, w, h, 10);
    ctx.fill();
  }

  function renderHUD() {
    const st = S.stats;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    // Top-left: fuel + cargo
    const cargoW = Math.max(240, st.cargoMax * 30 + 34);
    panel(12, 12, cargoW, st.autoFire ? 208 : 186);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 15px system-ui, sans-serif';
    const reg = BIOMES[REGION_ORDER[S.region]];
    ctx.fillText(`Day ${Game.s.day} — ${reg.icon} ${reg.name}`, 24, 30);
    // fuel bar
    const fFrac = clamp(S.fuel / st.fuelMax, 0, 1);
    ctx.fillText('⛽', 22, 56);
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(46, 48, cargoW - 100, 16);
    ctx.fillStyle = fFrac > 0.3 ? '#7bd36b' : (Math.sin(S.t * 10) > 0 ? '#ff5050' : '#a83232');
    ctx.fillRect(46, 48, (cargoW - 100) * fFrac, 16);
    ctx.fillStyle = '#fff';
    ctx.font = '13px system-ui, sans-serif';
    ctx.fillText(`${Math.ceil(S.fuel)}s`, cargoW - 46, 56);
    // health bar
    const hFrac = clamp(S.hp / st.hpMax, 0, 1);
    ctx.fillText('❤️', 22, 78);
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(46, 70, cargoW - 100, 16);
    ctx.fillStyle = hFrac > 0.3 ? '#e0605a' : (Math.sin(S.t * 10) > 0 ? '#ff3030' : '#8a2020');
    ctx.fillRect(46, 70, (cargoW - 100) * hFrac, 16);
    ctx.fillStyle = '#fff';
    ctx.fillText(`${Math.ceil(S.hp)}`, cargoW - 46, 78);
    // cargo slots
    for (let i = 0; i < st.cargoMax; i++) {
      const x = 36 + i * 30, y = 106;
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x - 12, y - 12, 25, 25);
      if (S.cargo[i]) drawEmoji(ctx, SPECIES[S.cargo[i]].emoji, x + 0.5, y + 0.5, 20);
    }
    // nets left
    ctx.font = 'bold 14px system-ui, sans-serif';
    ctx.fillStyle = S.netsLeft > 0 ? '#fff' : '#ff7070';
    ctx.fillText(`🕸️ Nets: ${S.netsLeft} / ${st.nets}`, 24, 138);
    if (S.reloadT > 0 && S.netsLeft > 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.fillRect(150, 134, 60 * clamp(S.reloadT / st.reload, 0, 1), 6);
    }

    if (st.autoFire) {
      ctx.font = 'bold 12px system-ui, sans-serif';
      ctx.fillStyle = Game.s.autoFireOn ? '#8be07a' : 'rgba(255,255,255,0.55)';
      ctx.fillText(`📡 Auto-fire: ${Game.s.autoFireOn ? 'ON' : 'OFF'}${TouchControls.enabled ? '' : '  (F to toggle)'}`, 24, 160);
    }
    // zoo earnings ticking up while you're away
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.fillStyle = '#f2c94c';
    ctx.fillText(`💰 Cargo worth: ${fmtMoney(S.cargo.reduce((sum, sp) => sum + SPECIES[sp].value, 0))}`, 24, st.autoFire ? 182 : 160);
    const got = Object.entries(S.gathered).filter(([, v]) => v > 0).map(([k, v]) => `${RESOURCES[k].emoji} ${v}`).join('  ');
    ctx.fillStyle = '#fff';
    ctx.fillText(`Gathered: ${got || 'nothing yet'}`, 24, st.autoFire ? 204 : 182);

    // Minimap (top-right)
    const mmH = Math.min(300, H * 0.5, (W - 290) * WORLD_H / WORLD_W), ms = mmH / WORLD_H, mmW = WORLD_W * ms;
    const mx = W - mmW - 12, my = 12;
    panel(mx - 4, my - 4, mmW + 8, mmH + 8);
    ctx.drawImage(S.world.terrain, mx, my, mmW, mmH);
    // region icons down the left edge of the minimap
    for (let k = 0; k < REGION_ORDER.length; k++) {
      const b = REGION_ORDER[k];
      const cy = my + (regionTop(k) + BAND / 2) * ms;
      const known = Game.s.regionsVisited[b] || S.regionsVisited.has(b);
      drawEmoji(ctx, known ? BIOMES[b].icon : '❔', mx - 16, cy, 16);
    }
    ctx.fillStyle = '#8b5a2b';
    ctx.beginPath(); ctx.arc(mx + BASE.x * ms, my + BASE.y * ms, 5, 0, Math.PI * 2); ctx.fill();
    for (const a of S.animals) {
      if (a.state !== 'tangled') continue;
      ctx.fillStyle = '#ffe14d';
      ctx.fillRect(mx + a.x * ms - 2, my + a.y * ms - 2, 4, 4);
    }
    ctx.fillStyle = '#ff3b3b';
    ctx.beginPath(); ctx.arc(mx + S.jeep.x * ms, my + S.jeep.y * ms, 3.5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 1;
    ctx.strokeRect(mx + (S.cam.x - W / 2) * ms, my + (S.cam.y - H / 2) * ms, W * ms, H * ms);

    // Bottom: hints / prompts
    ctx.textAlign = 'center';
    if (S.atBase && (S.leftBase || S.t > 3)) {
      const how = TouchControls.enabled ? 'Tap 🏁' : 'Press E';
      const txt = S.cargo.length ? `${how} to drive home with ${S.cargo.length} animal${S.cargo.length > 1 ? 's' : ''}` : `${how} to end the safari and head home`;
      banner(txt, H - 60, '#ffe680');
      if (!Game.s.perks.campRefill) banner('Tip: buy the ⛺ Camp Supply Depot at the Garage to refill fuel and nets here', H - 100, '#fff', 13);
      else banner(S.refilling ? '⛽ Refilling fuel and nets, repairing the jeep...' : '✅ Fuel, nets and health are full — head back out, or go home', H - 100, S.refilling ? '#9fe08f' : '#fff', 14);
    } else if (S.t < 12) {
      const fireHint = S.stats.autoFire ? 'Space: fire  •  F: auto-fire on/off' : 'Space: fire net from the front';
      if (TouchControls.enabled) banner(`Drag on the left to drive  •  Hold 🕸️ to fire${S.stats.autoFire ? '  •  AUTO: auto-fire on/off' : ''}`, H - 30, '#fff', 13);
      else banner(`WASD / Arrows: drive   •   ${fireHint}   •   Esc: pause`, H - 30, '#fff', 13);
    }

    if (S.msg) banner(S.msg.text, H * 0.22, '#fff', 18);

    if (S.paused) {
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 36px system-ui, sans-serif';
      ctx.fillText('Paused', W / 2, H / 2 - 30);
      ctx.font = '16px system-ui, sans-serif';
      if (!TouchControls.enabled) ctx.fillText('Esc to resume  •  Q to call the tow truck and go home now', W / 2, H / 2 + 12);
    }
    ctx.textBaseline = 'alphabetic';
  }

  function banner(text, y, color, size = 16) {
    ctx.font = `bold ${size}px system-ui, sans-serif`;
    // Shrink long messages to fit narrow (portrait phone) screens.
    const tw = ctx.measureText(text).width;
    if (tw > W - 40) { size = Math.max(9, size * (W - 40) / tw); ctx.font = `bold ${size}px system-ui, sans-serif`; }
    const w = ctx.measureText(text).width + 30;
    panel(W / 2 - w / 2, y - size * 0.9, w, size * 1.8);
    ctx.fillStyle = color;
    ctx.fillText(text, W / 2, y);
  }

  function touchState() {
    return {
      paused: !!(S && S.paused),
      canGoHome: !!(S && S.atBase && (S.leftBase || S.t > 3)),
      hasAutoFire: !!(S && S.stats.autoFire),
    };
  }

  return { init, start, update, render, resize, touchState, debug: () => S };
})();
