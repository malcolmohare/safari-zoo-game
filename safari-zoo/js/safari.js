// The top-down "go catch animals" part of the game.

const Safari = (() => {
  // The world is a tall strip: base camp at the bottom, then each region further north.
  const WORLD_W = 3000;
  const BAND = 1400;                                   // height of each region
  const WORLD_H = BAND * REGION_ORDER.length + 400;    // savanna gets extra room for base camp
  const TERRAIN_SCALE = 5;                             // terrain texture is world size / 5 pixels
  const BASE = { x: WORLD_W / 2, y: WORLD_H - 220, r: 170 };
  const CELL = 200;                                    // obstacle spatial-grid cell size
  const POP_PER_REGION = 12;
  const JEEP_R = 20;

  // Obstacles and decoration per region: [emojis, count, collision radius, draw size]
  const REGION_FEATURES = {
    savanna:  { ponds: 5,  ice: 0,  obstacles: [[['🌳'], 60, 16, 52], [['🪨'], 30, 18, 36]] },
    wetlands: { ponds: 26, ice: 0,  obstacles: [[['🌳'], 45, 16, 52], [['🪨'], 15, 18, 34]] },
    jungle:   { ponds: 3,  ice: 0,  obstacles: [[['🌴', '🌳', '🌴'], 300, 16, 56], [['🪨'], 20, 18, 36]] },
    desert:   { ponds: 2,  ice: 0,  obstacles: [[['🪨'], 80, 18, 38], [['🌴'], 25, 16, 52]] },
    tundra:   { ponds: 0,  ice: 10, obstacles: [[['🌲'], 110, 15, 50], [['🪨'], 30, 18, 36]] },
  };

  let canvas, ctx, view, W = 0, H = 0, VW = 0, VH = 0;   // W, H: screen size in CSS px; VW, VH: view size in world units
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
      ponds: [], ice: [], obstacles: [], grid: new Map(),
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

    // Resource nodes to gather (one resource type per region).
    w.resources = [];
    for (const b of REGION_ORDER) {
      let placed = 0;
      for (let tries = 0; placed < ECON.resourceNodesPerRegion && tries < ECON.resourceNodesPerRegion * 4 + 60; tries++) {
        const p = randPointIn(b, 350);
        if (!p || inCircles(w.ponds, p.x, p.y, 20)) continue;
        if (nearbyObstaclesIn(w, p.x, p.y).some((o) => dist(o.x, o.y, p.x, p.y) < o.r + 30)) continue;
        w.resources.push({ x: p.x, y: p.y, res: BIOMES[b].resource, phase: rand(0, 6) });
        placed++;
      }
    }

    buildTiles(w);
  }

  // The ground is a grid of 16x16 pixel-art tiles (32 world units each). Each tile stores its
  // region, its kind (see Pixel.tile) and a variant; the minimap is the same grid, one pixel per tile.
  const TILE = Pixel.T * Pixel.ART;
  function buildTiles(w) {
    const tw = Math.ceil(WORLD_W / TILE), th = Math.ceil(WORLD_H / TILE);
    const kinds = new Uint8Array(tw * th), biomes = new Uint8Array(tw * th), vars = new Uint8Array(tw * th);
    const ox = w.ph[0] * 50, oy = w.ph[1] * 50;
    const mm = Pixel.canvas(tw, th), mg = mm.getContext('2d');
    for (let ty = 0; ty < th; ty++) {
      for (let tx = 0; tx < tw; tx++) {
        const x = tx * TILE + TILE / 2, y = ty * TILE + TILE / 2, i = ty * tw + tx;
        const large = Pixel.fbm(x * 0.0025 + ox, y * 0.0025 + oy), med = Pixel.fbm(x * 0.012 + oy, y * 0.012 + ox);
        // Ragged, natural-looking borders between regions.
        const bi = regionIndexAt(x, y + (large - 0.5) * 140);
        let kind = 0;
        if (inCircles(w.ponds, x, y)) kind = 4;
        else if (inCircles(w.ice, x, y)) kind = 5;
        else if (dist(x, y, BASE.x, BASE.y) < BASE.r) kind = 6;
        else if (med > 0.64) kind = 2;
        else if (large > 0.56) kind = 1;
        else if (Pixel.hash(tx, ty, 9) < 0.04) kind = 3;
        kinds[i] = kind; biomes[i] = bi; vars[i] = (Pixel.hash(tx, ty) * 4) | 0;
        mg.fillStyle = Pixel.tileColor(REGION_ORDER[bi], kind);
        mg.fillRect(tx, ty, 1, 1);
      }
    }
    w.tiles = { tw, th, kinds, biomes, vars };
    w.minimap = mm;
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
      message(S.cargo.length ? `💥 Your jeep broke down! All ${S.cargo.length} animal${S.cargo.length > 1 ? 's' : ''} escaped. A tow truck hauls you home (-$${ECON.towFee})` : `💥 Your jeep broke down! A tow truck hauls you home (-$${ECON.towFee})`, 3.5);
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
    view = Pixel.makeView(c);
  }

  function resize() {
    view.resize(2);   // 2 CSS px per art pixel, so one world unit is one CSS pixel
    W = view.W; H = view.H;
    VW = view.w * Pixel.ART; VH = view.h * Pixel.ART;
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
    // A breakdown lets every animal in the cage escape; running out of fuel (or calling the
    // tow truck) lets half of them get away, rounded up.
    const cargo = S.cargo.slice();
    const nEscape = S.brokeDown ? cargo.length : towed ? Math.ceil(cargo.length / 2) : 0;
    const escaped = [];
    for (let i = 0; i < nEscape; i++) escaped.push(cargo.splice(randInt(0, cargo.length - 1), 1)[0]);
    onEnd(cargo, towed, [...S.regionsVisited], { ...S.gathered }, escaped);
  }

  // ---------------- Update ----------------

  function update(dt, input) {
    if (!S || S.ended) return;
    if (input.pressed('Escape') || input.pressed('KeyP')) S.paused = !S.paused;
    if (S.paused) {
      if (input.pressed('KeyQ')) { S.paused = false; S.outOfFuelT = 0; S.fuel = 0; message(S.cargo.length ? 'Calling the tow truck... half your animals will slip away' : 'Calling the tow truck...', 3); }
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
        message(S.cargo.length > 0 ? `Out of fuel! Half your animals slip away while you wait for the tow truck (-$${ECON.towFee})` : `Out of fuel! A tow truck hauls you home (-$${ECON.towFee})`, 3.5);
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
    S.cam.x = clamp(S.cam.x, Math.min(VW / 2, WORLD_W / 2), Math.max(WORLD_W - VW / 2, WORLD_W / 2));
    S.cam.y = clamp(S.cam.y, Math.min(VH / 2, WORLD_H / 2), Math.max(WORLD_H - VH / 2, WORLD_H / 2));
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
  // The world is drawn into a low-res buffer (one pixel per art pixel, A world units) and scaled
  // up with crisp pixels. Text and the HUD are drawn on top at full resolution.

  const A = Pixel.ART;
  const CAMP_PROPS = [
    { kind: 'tent', dx: -70, dy: -40, color: '#e0782c' },
    { kind: 'tent', dx: 75, dy: -25, color: '#6b9a3a' },
    { kind: 'flag', dx: 0, dy: -110 },
    { kind: 'pump', dx: -90, dy: 60 },
    { kind: 'sign', dx: 0, dy: 104, text: 'BASE CAMP' },
  ];

  function obstacleSprite(o) {
    if (o.sprite) return o.sprite;
    switch (o.kind) {
      case 'acacia': o.sprite = Pixel.acacia(o.variant); break;
      case 'broadleaf': o.sprite = Pixel.roundTree(Pixel.LEAF[o.biome === 'wetlands' ? 'wetlands' : 'broadleaf'][o.variant % 3]); break;
      case 'jungle': o.sprite = Pixel.roundTree(Pixel.LEAF.jungle[o.variant % 3], 1.25); break;
      case 'palm': o.sprite = o.biome === 'desert' ? Pixel.cactus(o.variant) : Pixel.palm(o.variant); break;
      case 'pine': o.sprite = Pixel.pine(o.biome === 'tundra'); break;
      default: o.sprite = Pixel.rock(Math.round(o.size * 0.55), o.tint, o.biome === 'tundra', o.variant % 3);
    }
    return o.sprite;
  }
  const animalSize = (def) => clamp(Math.round(def.size * 0.66), 14, 40);

  function drawTiles(g, ox, oy) {
    const tl = S.world.tiles, TT = Pixel.T, tw = tl.tw;
    const tx0 = Math.max(0, Math.floor(ox / TT)), ty0 = Math.max(0, Math.floor(oy / TT));
    const tx1 = Math.min(tw - 1, Math.floor((ox + view.w) / TT)), ty1 = Math.min(tl.th - 1, Math.floor((oy + view.h) / TT));
    const frame = Math.floor(S.t * 4) % 6, sway = Math.floor(S.t * 1.6) % 2;
    const kindAt = (x, y) => (x < 0 || y < 0 || x >= tw || y >= tl.th) ? -1 : tl.kinds[y * tw + x];
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const i = ty * tw + tx, kind = tl.kinds[i];
        const px = tx * TT - ox, py = ty * TT - oy;
        g.drawImage(Pixel.tile(REGION_ORDER[tl.biomes[i]], kind, tl.vars[i], kind === 4 ? frame : sway), px, py);
        if (kind === 4 || kind === 5) {
          // foam / frost where water and ice meet land
          g.fillStyle = kind === 4 ? '#e8f8ff' : '#ffffff';
          if (kindAt(tx, ty - 1) !== kind) g.fillRect(px, py, TT, 1);
          if (kindAt(tx, ty + 1) !== kind) g.fillRect(px, py + TT - 1, TT, 1);
          if (kindAt(tx - 1, ty) !== kind) g.fillRect(px, py, 1, TT);
          if (kindAt(tx + 1, ty) !== kind) g.fillRect(px + TT - 1, py, 1, TT);
        } else if (kind === 6) {
          g.fillStyle = '#a88050';
          if (kindAt(tx, ty - 1) !== 6) g.fillRect(px, py, TT, 1);
          if (kindAt(tx, ty + 1) !== 6) g.fillRect(px, py + TT - 1, TT, 1);
          if (kindAt(tx - 1, ty) !== 6) g.fillRect(px, py, 1, TT);
          if (kindAt(tx + 1, ty) !== 6) g.fillRect(px + TT - 1, py, 1, TT);
        }
      }
    }
  }

  function render() {
    if (!S) return;
    const g = view.g;
    const shx = S.shake ? rand(-S.shake, S.shake) : 0, shy = S.shake ? rand(-S.shake, S.shake) : 0;
    const camX = S.cam.x - VW / 2 + shx, camY = S.cam.y - VH / 2 + shy;   // world position of the view's top-left
    const ox = Math.round(camX / A), oy = Math.round(camY / A);
    const X = (wx) => Math.round(wx / A) - ox, Y = (wy) => Math.round(wy / A) - oy;
    const css = view.css, labels = [];
    const toScreen = (wx, wy) => [(Math.round(wx / A) - ox) * css, (Math.round(wy / A) - oy) * css];
    const vis = (x, y) => x > camX - 120 && x < camX + VW + 120 && y > camY - 40 && y < camY + VH + 140;

    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#304828';
    g.fillRect(0, 0, view.w, view.h);
    drawTiles(g, ox, oy);

    // Missed nets lying on the ground
    for (const n of S.groundNets) if (vis(n.x, n.y)) Pixel.drawAt(g, Pixel.netSprite(11), X(n.x), Y(n.y) + 5, 0.85);

    // Auto-aim cone
    if (S.stats.aimCone > 0) {
      const j = S.jeep, c = S.stats.aimCone, r = S.stats.netRange / A;
      g.fillStyle = 'rgba(255,240,120,0.1)';
      g.beginPath(); g.moveTo(X(j.x), Y(j.y)); g.arc(X(j.x), Y(j.y), r, j.angle - c, j.angle + c); g.closePath(); g.fill();
    }

    // Everything that stands up is sorted by its base so nearer things overlap farther ones.
    const items = [];
    for (const o of S.world.obstacles) if (!o.dead && vis(o.x, o.y)) items.push({ y: o.y, o });
    for (const a of S.animals) if (vis(a.x, a.y)) items.push({ y: a.y + a.def.size * 0.3, a });
    for (const r of S.world.resources) if (!r.taken && vis(r.x, r.y)) items.push({ y: r.y, r });
    for (const p of CAMP_PROPS) if (vis(BASE.x + p.dx, BASE.y + p.dy)) items.push({ y: BASE.y + p.dy, p });
    items.push({ y: S.jeep.y, jeep: true });
    // Region signposts on the track north
    for (let k = 0; k < REGION_ORDER.length - 1; k++) {
      const sx = BASE.x + 80, sy = boundaryY(k, sx) + 50;
      if (vis(sx, sy)) items.push({ y: sy, sign: { x: sx, y: sy, text: `↑ ${BIOMES[REGION_ORDER[k + 1]].icon} ${BIOMES[REGION_ORDER[k + 1]].name}` } });
    }
    // Ranger fence at the first region you don't have a permit for
    const lastOpen = Game.s.tier - 1;
    if (lastOpen < REGION_ORDER.length - 1) {
      const step = 32, fx0 = Math.max(0, Math.floor((camX - 60) / step) * step), fx1 = Math.min(WORLD_W, camX + VW + 60);
      for (let x = fx0; x <= fx1; x += step) {
        const y = boundaryY(lastOpen, x);
        if (y > camY - 40 && y < camY + VH + 60) items.push({ y, post: { x, y, nx: x + step, ny: boundaryY(lastOpen, x + step) } });
      }
      for (let x = Math.floor(fx0 / 500) * 500 + 250; x <= fx1; x += 500) {
        const y = boundaryY(lastOpen, x) + 6;
        if (y > camY - 40 && y < camY + VH + 60) items.push({ y, barrier: { x, y } });
      }
    }
    items.sort((p, q) => p.y - q.y);

    // Shadows first, so they never fall on top of a neighbour's sprite.
    for (const it of items) {
      if (it.o) { const s = obstacleSprite(it.o); Pixel.drawShadow(g, X(it.o.x) + 2, Y(it.o.y) + (it.o.kind === 'rock' ? 3 : 4), s.width * (it.o.kind === 'rock' ? 0.9 : 0.7)); }
      else if (it.a) Pixel.drawShadow(g, X(it.a.x) + 1, Y(it.y), animalSize(it.a.def) * 0.7);
      else if (it.jeep) Pixel.drawShadow(g, X(S.jeep.x) + 1, Y(S.jeep.y) + 2, 30);
      else if (it.r) Pixel.drawShadow(g, X(it.r.x), Y(it.r.y) + 1, 12);
      else if (it.p && it.p.kind === 'tent') Pixel.drawShadow(g, X(BASE.x + it.p.dx) + 2, Y(BASE.y + it.p.dy), 30);
    }

    const j = S.jeep;
    for (const it of items) {
      if (it.o) {
        const o = it.o, s = obstacleSprite(o), isTree = o.kind !== 'rock';
        const bx = X(o.x), by = Y(o.y) + (isTree ? 4 : Math.round(s.height * 0.4));
        // Canopies go see-through when the jeep is hidden behind them.
        const hides = isTree && j.y < o.y && j.y > o.y - s.height * A && Math.abs(j.x - o.x) < s.width * A * 0.5;
        Pixel.drawAt(g, s, bx, by, hides ? 0.5 : 1);
      } else if (it.a) drawAnimal(g, it.a, X, Y);
      else if (it.r) {
        const r = it.r, glint = Math.floor(S.t * 2 + r.phase) % 3 === 0;
        Pixel.ring(g, X(r.x), Y(r.y) + 1, 10 + (Math.floor(S.t * 3 + r.phase) % 2), 5, '#f8d848', true);
        Pixel.drawAt(g, Pixel.resource(r.res, glint ? 1 : 0), X(r.x), Y(r.y) + 2 - (Math.sin(S.t * 4 + r.phase) > 0 ? 1 : 0));
      } else if (it.jeep) drawJeep(g, X, Y);
      else if (it.p) {
        const p = it.p, x = X(BASE.x + p.dx), y = Y(BASE.y + p.dy);
        if (p.kind === 'tent') Pixel.drawAt(g, Pixel.tent(p.color), x, y + 4);
        else if (p.kind === 'flag') Pixel.drawAt(g, Pixel.flag(Math.floor(S.t * 3) % 2), x + 6, y + 4);
        else if (p.kind === 'pump') Pixel.drawAt(g, Pixel.pump(), x, y + 4);
        else if (p.kind === 'sign') { Pixel.drawAt(g, Pixel.board(44), x, y + 4); labels.push({ wx: BASE.x + p.dx, wy: BASE.y + p.dy - 22, text: p.text, size: 11, color: '#3a2410', plain: true }); }
      } else if (it.sign) {
        const s = it.sign;
        Pixel.drawAt(g, Pixel.board(62), X(s.x), Y(s.y) + 4);
        labels.push({ wx: s.x, wy: s.y - 22, text: s.text, size: 11, color: '#3a2410', plain: true });
      } else if (it.post) {
        const p = it.post;
        Pixel.line(g, X(p.x), Y(p.y) - 9, X(p.nx), Y(p.ny) - 9, '#e08a30', 1);
        Pixel.line(g, X(p.x), Y(p.y) - 5, X(p.nx), Y(p.ny) - 5, '#e08a30', 1);
        Pixel.drawAt(g, Pixel.fencePost('#8a5f37'), X(p.x), Y(p.y) + 1);
      } else if (it.barrier) {
        const b = it.barrier, next = BIOMES[REGION_ORDER[lastOpen + 1]];
        Pixel.drawAt(g, Pixel.barrier(), X(b.x), Y(b.y) + 2);
        labels.push({ wx: b.x, wy: b.y + 26, text: `${next.icon} ${next.name}: tier ${lastOpen + 2} permit`, size: 12, color: '#ffe680', panel: true });
      }
    }

    // Particles (dust, debris, sparkles)
    for (const p of S.particles) {
      const s = Math.max(1, Math.round(p.r / A * (1 - p.t / p.life * 0.5)));
      g.globalAlpha = p.t / p.life > 0.6 ? 0.5 : 1;
      g.fillStyle = p.color;
      g.fillRect(X(p.x) - (s >> 1), Y(p.y) - (s >> 1), s, s);
    }
    g.globalAlpha = 1;

    // Nets in flight, with their shadows on the ground
    for (const n of S.nets) {
      const s = Pixel.netSprite(9 + n.traveled / n.max * 4), lift = 6 + Math.round(Math.sin(Math.min(1, n.traveled / n.max) * Math.PI) * 4);
      Pixel.drawShadow(g, X(n.x), Y(n.y), 8);
      Pixel.drawAt(g, s, X(n.x), Y(n.y) - lift + (s.height >> 1));
    }

    // Auto-aim target lock: blinking corner brackets
    if (S.target && Math.floor(S.t * 6) % 3) {
      const a = S.target, h = animalSize(a.def), cx = X(a.x), cy = Y(a.y + a.def.size * 0.3) - (h >> 1), r = (h >> 1) + 3;
      g.fillStyle = '#ff4d4d';
      for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        g.fillRect(cx + sx * r - (sx > 0 ? 3 : 0), cy + sy * r - (sy > 0 ? 0 : 0), 4, 1);
        g.fillRect(cx + sx * r - (sx > 0 ? 0 : 0), cy + sy * r - (sy > 0 ? 3 : 0), 1, 4);
      }
    }

    // Arrow back to base when far away
    const bd = dist(j.x, j.y, BASE.x, BASE.y);
    if (bd > 500) {
      const ang = Math.atan2(BASE.y - j.y, BASE.x - j.x), idx = ((Math.round(ang / (Math.PI * 2) * 16) % 16) + 16) % 16;
      const blink = S.fuel < 15 ? Math.floor(S.t * 6) % 2 : 1;
      if (blink) Pixel.drawAt(g, Pixel.arrow(idx), X(j.x) + Math.cos(ang) * 32, Y(j.y) - 6 + Math.sin(ang) * 26 + 8, S.fuel < 15 ? 1 : 0.75);
    }

    view.present(ctx);

    // Full-resolution text on top
    for (const l of labels) {
      const [sx, sy] = toScreen(l.wx, l.wy);
      if (l.panel) {
        ctx.font = Pixel.font(l.size);
        const w = ctx.measureText(l.text).width + 20;
        Pixel.panel(ctx, sx - w / 2, sy - l.size, w, l.size * 2, 0.8);
        Pixel.text(ctx, l.text, sx, sy, { size: l.size, color: l.color, outline: null });
      } else Pixel.text(ctx, l.text, sx, sy, { size: l.size * Math.min(1.2, css / 2 + 0.2), color: l.color, outline: l.plain ? null : undefined, weight: 700 });
    }
    for (const f of S.floats) {
      const [sx, sy] = toScreen(f.x, f.y);
      ctx.globalAlpha = 1 - f.t / f.life;
      Pixel.text(ctx, f.text, sx, sy, { size: f.size, color: f.color, weight: 700 });
    }
    ctx.globalAlpha = 1;
    renderHUD();
  }

  function drawAnimal(g, a, X, Y) {
    const def = a.def, size = animalSize(def);
    const s = Pixel.animal(def.key, size, a.facing < 0);
    const hop = a.spd > 20 ? (Math.sin(a.bob) > 0 ? 1 : 0) : 0;
    const fly = def.flies ? 5 : 0;
    const wiggle = a.state === 'tangled' ? (Math.floor(S.t * 20) % 2 ? 1 : -1) : 0;
    const bx = X(a.x) + wiggle, by = Y(a.y + def.size * 0.3) - hop - fly;
    if (s) Pixel.drawAt(g, s, bx, by + 1);
    else { g.fillStyle = '#a08060'; g.fillRect(bx - 4, by - 8, 8, 8); }
    const top = by - size;
    const bar = (frac, color) => {
      const w = Math.max(10, size - 4);
      g.fillStyle = '#181820'; g.fillRect(bx - (w >> 1) - 1, top - 4, w + 2, 4);
      g.fillStyle = color; g.fillRect(bx - (w >> 1), top - 3, Math.round(w * clamp(frac, 0, 1)), 2);
    };
    if (a.state === 'tangled') {
      const n = Pixel.netSprite(size * 0.9);
      Pixel.drawAt(g, n, bx, by - (size - n.height) / 2);
      const frac = a.tangleT / a.tangleMax;
      bar(frac, frac > 0.35 ? '#f8d848' : (Math.floor(S.t * 8) % 2 ? '#f84848' : '#a82828'));
    } else if (a.netHits > 0.01) bar(a.netHits / def.hp, '#f8f8f8');
    if (a.state === 'charge') Pixel.drawAt(g, Pixel.anger(), bx + (size >> 1), top + 2);
  }

  function drawJeep(g, X, Y) {
    const j = S.jeep, s = Pixel.jeep(j.angle);
    const bump = Math.abs(j.speed) > 60 && Math.floor(S.t * 12) % 2 ? 1 : 0;
    const x = X(j.x), y = Y(j.y) - bump;
    g.drawImage(s, x - s.anchorX, y - s.anchorY);
    // Net launcher turret on the back
    const px = X(j.x - Math.cos(j.angle) * 10), py = Y(j.y - Math.sin(j.angle) * 10) - 9 - bump;
    const ex = px + Math.cos(j.turret) * 8, ey = py + Math.sin(j.turret) * 6;
    Pixel.line(g, px, py + 1, ex, ey + 1, '#181820', 2);
    Pixel.line(g, px, py, ex, ey, '#606068', 2);
    g.fillStyle = '#181820'; g.fillRect(px - 2, py - 2, 5, 5);
    g.fillStyle = '#808088'; g.fillRect(px - 1, py - 1, 3, 3);
  }

  // ---------------- HUD ----------------

  function renderHUD() {
    const st = S.stats;
    const reg = BIOMES[REGION_ORDER[S.region]];
    const nHearts = Math.ceil(st.hpMax / 20), perRow = 10;
    const pw = Math.max(220, Math.min(nHearts, perRow) * 18 + 28, st.cargoMax * 26 + 28);
    const heartRows = Math.ceil(nHearts / perRow);
    const x0 = 26;
    let y = 26;
    Pixel.panel(ctx, 12, 12, pw, 14 + 20 + heartRows * 18 + 26 + 30 + 26 + (st.autoFire ? 20 : 0) + 24 + 22, 0.82);

    Pixel.text(ctx, `Day ${Game.s.day} · ${reg.icon} ${reg.name}`, x0, y, { size: 14, align: 'left', outline: null, color: '#f8e8b0' });
    y += 14;
    // Hearts: one heart per 20 health
    for (let i = 0; i < nHearts; i++) {
      const hp = S.hp - i * 20, state = hp >= 15 ? 2 : hp >= 5 ? 1 : 0;
      Pixel.blit(ctx, Pixel.heart(state), x0 + (i % perRow) * 18, y + Math.floor(i / perRow) * 18, 2);
    }
    y += heartRows * 18 + 6;
    // Fuel gauge
    Pixel.blit(ctx, Pixel.fuel(), x0, y, 2);
    const fFrac = clamp(S.fuel / st.fuelMax, 0, 1), bw = pw - 96, bx = x0 + 26;
    ctx.fillStyle = '#f4f0e0'; ctx.fillRect(bx, y + 4, bw + 4, 14);
    ctx.fillStyle = '#181820'; ctx.fillRect(bx + 2, y + 6, bw, 10);
    ctx.fillStyle = fFrac > 0.3 ? '#58d048' : fFrac > 0.15 ? '#f8c838' : (Math.sin(S.t * 10) > 0 ? '#f84848' : '#a82828');
    ctx.fillRect(bx + 2, y + 6, Math.round(bw * fFrac), 10);
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(bx + 2, y + 6, Math.round(bw * fFrac), 2);
    Pixel.text(ctx, `${Math.ceil(S.fuel)}s`, bx + bw + 10, y + 11, { size: 13, align: 'left', outline: null });
    y += 26;
    // Cargo cage slots
    for (let i = 0; i < st.cargoMax; i++) {
      const sx = x0 + i * 26;
      ctx.fillStyle = 'rgba(244,240,224,0.5)'; ctx.fillRect(sx, y, 24, 24);
      ctx.fillStyle = '#101638'; ctx.fillRect(sx + 2, y + 2, 20, 20);
      if (S.cargo[i]) Pixel.blit(ctx, Pixel.animal(S.cargo[i], 18, false), sx + 2, y + 2, 1);
    }
    y += 30;
    // Nets
    Pixel.blit(ctx, Pixel.netSprite(9), x0 - 1, y - 2, 2);
    Pixel.text(ctx, `${S.netsLeft} / ${st.nets}`, x0 + 28, y + 9, { size: 14, align: 'left', outline: null, color: S.netsLeft > 0 ? '#fff' : '#ff7070' });
    if (S.reloadT > 0 && S.netsLeft > 0) { ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(x0 + 100, y + 6, 60 * clamp(S.reloadT / st.reload, 0, 1), 6); }
    y += 26;
    if (st.autoFire) {
      Pixel.text(ctx, `Auto-fire: ${Game.s.autoFireOn ? 'ON' : 'OFF'}${TouchControls.enabled ? '' : '  (F)'}`, x0, y + 4, { size: 13, align: 'left', outline: null, color: Game.s.autoFireOn ? '#8be07a' : 'rgba(255,255,255,0.6)' });
      y += 20;
    }
    // Cargo value and gathered resources
    Pixel.blit(ctx, Pixel.rupee(), x0 + 2, y - 2, 2);
    Pixel.text(ctx, `Cargo worth ${fmtMoney(S.cargo.reduce((sum, sp) => sum + SPECIES[sp].value, 0))}`, x0 + 26, y + 10, { size: 14, align: 'left', outline: null, color: '#f8d848' });
    y += 24;
    const got = Object.entries(S.gathered).filter(([, v]) => v > 0).map(([k, v]) => `${RESOURCES[k].emoji} ${v}`).join('  ');
    Pixel.text(ctx, `Gathered: ${got || 'nothing yet'}`, x0, y + 8, { size: 13, align: 'left', outline: null });

    // Minimap (top-right)
    const mmH = Math.min(W < 600 ? 170 : 300, H * 0.5, (W - pw - 70) * WORLD_H / WORLD_W), ms = mmH / WORLD_H, mmW = WORLD_W * ms;
    const mx = Math.round(W - mmW - 18), my = 18;
    Pixel.panel(ctx, mx - 6, my - 6, mmW + 12, mmH + 12, 1);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(S.world.minimap, mx, my, mmW, mmH);
    for (let k = 0; k < REGION_ORDER.length; k++) {
      const b = REGION_ORDER[k];
      const cy = my + (regionTop(k) + BAND / 2) * ms;
      const known = Game.s.regionsVisited[b] || S.regionsVisited.has(b);
      drawEmoji(ctx, known ? BIOMES[b].icon : '❔', mx - 18, cy, 16);
    }
    ctx.fillStyle = '#6a3a18'; ctx.fillRect(Math.round(mx + BASE.x * ms) - 3, Math.round(my + BASE.y * ms) - 3, 6, 6);
    ctx.fillStyle = '#f8d848';
    for (const a of S.animals) if (a.state === 'tangled') ctx.fillRect(Math.round(mx + a.x * ms) - 2, Math.round(my + a.y * ms) - 2, 4, 4);
    if (Math.floor(S.t * 4) % 2) { ctx.fillStyle = '#f83838'; ctx.fillRect(Math.round(mx + S.jeep.x * ms) - 3, Math.round(my + S.jeep.y * ms) - 3, 6, 6); }
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1;
    ctx.strokeRect(Math.round(mx + (S.cam.x - VW / 2) * ms) + 0.5, Math.round(my + (S.cam.y - VH / 2) * ms) + 0.5, Math.round(VW * ms), Math.round(VH * ms));

    // Bottom: hints / prompts
    if (S.atBase && (S.leftBase || S.t > 3)) {
      const how = TouchControls.enabled ? 'Tap 🏁' : 'Press E';
      const txt = S.cargo.length ? `${how} to drive home with ${S.cargo.length} animal${S.cargo.length > 1 ? 's' : ''}` : `${how} to end the safari and head home`;
      banner(txt, H - 60, '#ffe680');
      if (!Game.s.perks.campRefill) banner('Tip: buy the ⛺ Camp Supply Depot at the Garage to refill fuel and nets here', H - 104, '#fff', 13);
      else banner(S.refilling ? '⛽ Refilling fuel and nets, repairing the jeep...' : '✅ Fuel, nets and health are full. Head back out, or go home', H - 104, S.refilling ? '#9fe08f' : '#fff', 14);
    } else if (S.t < 12) {
      const fireHint = S.stats.autoFire ? 'Space: fire  •  F: auto-fire on/off' : 'Space: fire net from the front';
      if (TouchControls.enabled) banner(`Drag on the left to drive  •  Hold 🕸️ to fire${S.stats.autoFire ? '  •  AUTO: auto-fire on/off' : ''}`, H - 30, '#fff', 13);
      else banner(`WASD / Arrows: drive   •   ${fireHint}   •   Esc: pause`, H - 30, '#fff', 13);
    }

    if (S.msg) Pixel.dialog(ctx, S.msg.text, W / 2, Math.max(H * 0.18, 20), Math.min(W - 24, 560), 17);

    if (S.paused) {
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(0, 0, W, H);
      Pixel.dialog(ctx, 'Paused', W / 2, H / 2 - 60, 260, 30, '#f8d848');
      if (!TouchControls.enabled) Pixel.text(ctx, 'Esc to resume  •  Q to call the tow truck and go home now', W / 2, H / 2 + 12, { size: 16 });
    }
  }

  // A one-line message box centred at y (shrinks long text to fit narrow screens).
  function banner(text, y, color, size = 16) {
    ctx.font = Pixel.font(size);
    const tw = ctx.measureText(text).width;
    if (tw > W - 50) { size = Math.max(9, size * (W - 50) / tw); ctx.font = Pixel.font(size); }
    const w = ctx.measureText(text).width + 32;
    Pixel.panel(ctx, W / 2 - w / 2, y - size * 0.95 - 4, w, size * 1.9 + 8, 0.85);
    Pixel.text(ctx, text, W / 2, y, { size, color, outline: null });
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
