// The top-down "go catch animals" part of the game.

const Safari = (() => {
  const WORLD = 3600;
  const TERRAIN_SCALE = 4;           // terrain texture is WORLD / 4 pixels
  const BASE = { x: WORLD / 2, y: WORLD - 260, r: 170 };
  const CELL = 200;                  // obstacle spatial-grid cell size
  const TARGET_POP = { savanna: 30, jungle: 24, tundra: 20 };
  const JEEP_R = 20;

  let canvas, ctx, W = 0, H = 0;
  let S = null;       // runtime state for the current safari
  let onEnd = null;   // callback(cargo, towed)

  // ---------------- World generation ----------------

  function biomeAt(x, y) {
    const w = S.world;
    const p = w.ph;
    const ty = 1150 + Math.sin(x * 0.0035 + p[0]) * 130 + Math.sin(x * 0.011 + p[1]) * 45;
    if (y < ty) return 'tundra';
    const mx = w.jungleLeft ? WORLD - x : x;
    const jy = 2350 + Math.sin(x * 0.005 + p[2]) * 110;
    const jx = 1550 + Math.sin(y * 0.004 + p[1]) * 170 + Math.sin(y * 0.013 + p[0]) * 50;
    if (y < jy && mx > jx) return 'jungle';
    return 'savanna';
  }

  function inCircles(list, x, y, pad = 0) {
    for (const c of list) if ((x - c.x) ** 2 + (y - c.y) ** 2 < (c.r + pad) ** 2) return c;
    return null;
  }

  function genWorld() {
    const w = {
      ph: [rand(0, 100), rand(0, 100), rand(0, 100)],
      jungleLeft: Math.random() < 0.5,
      ponds: [], ice: [], obstacles: [], grid: new Map(), decor: [],
    };
    S.world = w;

    const randPointIn = (biome, minBaseDist = 400) => {
      for (let i = 0; i < 200; i++) {
        const x = rand(80, WORLD - 80), y = rand(80, WORLD - 80);
        if (biomeAt(x, y) !== biome) continue;
        if (dist(x, y, BASE.x, BASE.y) < minBaseDist) continue;
        return { x, y };
      }
      return null;
    };

    for (let i = 0; i < 7; i++) { const p = randPointIn('savanna', 450); if (p) w.ponds.push({ ...p, r: rand(70, 150) }); }
    for (let i = 0; i < 6; i++) { const p = randPointIn('tundra'); if (p) w.ice.push({ ...p, r: rand(110, 210) }); }

    const addObs = (biome, n, emojis, r, size, minBaseDist = 300) => {
      for (let i = 0; i < n; i++) {
        const p = randPointIn(biome, minBaseDist);
        if (!p || inCircles(w.ponds, p.x, p.y, 20) || inCircles(w.ice, p.x, p.y, 10)) continue;
        const o = { x: p.x, y: p.y, r, size, emoji: emojis[randInt(0, emojis.length - 1)] };
        w.obstacles.push(o);
        const key = Math.floor(o.x / CELL) + ',' + Math.floor(o.y / CELL);
        if (!w.grid.has(key)) w.grid.set(key, []);
        w.grid.get(key).push(o);
      }
    };
    addObs('savanna', 70, ['🌳'], 16, 52);
    addObs('savanna', 35, ['🪨'], 18, 36);
    addObs('jungle', 280, ['🌴', '🌳', '🌴'], 16, 56);
    addObs('jungle', 25, ['🪨'], 18, 36);
    addObs('tundra', 110, ['🌲'], 15, 50);
    addObs('tundra', 35, ['🪨'], 18, 36);
    // Draw rocks under everything else, trees on top (painter's order by y).
    w.obstacles.sort((a, b) => a.y - b.y);

    // Non-colliding ground decoration.
    for (let i = 0; i < 260; i++) {
      const x = rand(0, WORLD), y = rand(0, WORLD);
      const b = biomeAt(x, y);
      if (inCircles(w.ponds, x, y) || inCircles(w.ice, x, y)) continue;
      const opts = { savanna: ['🌾', '🌾', '🌼'], jungle: ['🌿', '🍄', '🌺'], tundra: ['❄️', '🌨️'] }[b];
      w.decor.push({ x, y, emoji: opts[randInt(0, opts.length - 1)], size: rand(14, 22) });
    }

    w.terrain = renderTerrain(w);
  }

  function renderTerrain(w) {
    const n = WORLD / TERRAIN_SCALE;
    const c = document.createElement('canvas');
    c.width = c.height = n;
    const g = c.getContext('2d');
    const img = g.createImageData(n, n);
    const base = { savanna: [214, 190, 118], jungle: [86, 142, 70], tundra: [234, 240, 246] };
    for (let py = 0; py < n; py++) {
      for (let px = 0; px < n; px++) {
        const x = px * TERRAIN_SCALE, y = py * TERRAIN_SCALE;
        const col = base[biomeAt(x, y)];
        const v = Math.sin(x * 0.02) * Math.cos(y * 0.017) * 6 + Math.sin(x * 0.003 + y * 0.004) * 8 + (Math.random() - 0.5) * 10;
        const i = (py * n + px) * 4;
        img.data[i] = col[0] + v; img.data[i + 1] = col[1] + v; img.data[i + 2] = col[2] + v; img.data[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    const s = 1 / TERRAIN_SCALE;
    for (const p of w.ponds) {
      g.fillStyle = '#c9b170';
      g.beginPath(); g.arc(p.x * s, p.y * s, (p.r + 10) * s, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#4f9fd1';
      g.beginPath(); g.arc(p.x * s, p.y * s, p.r * s, 0, Math.PI * 2); g.fill();
    }
    for (const p of w.ice) {
      g.fillStyle = '#b6dcf0';
      g.beginPath(); g.arc(p.x * s, p.y * s, p.r * s, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 1;
      g.beginPath(); g.arc(p.x * s, p.y * s, p.r * s * 0.6, 0.3, 1.6); g.stroke();
    }
    // Base camp dirt patch.
    g.fillStyle = '#a88a5a';
    g.beginPath(); g.arc(BASE.x * s, BASE.y * s, BASE.r * s, 0, Math.PI * 2); g.fill();
    return c;
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
      const x = rand(100, WORLD - 100), y = rand(100, WORLD - 100);
      if (biomeAt(x, y) !== biome) continue;
      if (dist(x, y, BASE.x, BASE.y) < 650) continue;
      if (awayFromJeep && dist(x, y, S.jeep.x, S.jeep.y) < 750) continue;
      if (inCircles(S.world.ponds, x, y, 30)) continue;
      pos = { x, y };
    }
    if (!pos) return;
    const def = weightedPick(SPECIES_BY_BIOME[biome], (d) => d.rarity);
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
          floatText(a.x, a.y - 30, `+${def.name}!`, '#fff36b', 20);
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
        S.fuel = Math.max(0, S.fuel - 4);
        S.shake = 12;
        floatText(j.x, j.y - 30, '-4s fuel', '#ff7070', 16);
        Sfx.bump();
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
    const outside = nx < 40 || ny < 40 || nx > WORLD - 40 || ny > WORLD - 40;
    if (outside || biomeAt(nx, ny) !== def.biome || (!def.flies && inCircles(S.world.ponds, nx, ny)) ||
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
      fuel: stats.fuelMax, reloadT: 0, t: 0,
      msg: null, shake: 0, cargoWarnT: 0, respawnT: 0,
      leftBase: false, ended: false, outOfFuelT: -1, paused: false,
      shownPickupTip: false,
    };
    genWorld();
    for (const b of Object.keys(TARGET_POP)) {
      let guard = 0;
      while (biomeCount(b) < TARGET_POP[b] && guard++ < 50) spawnGroup(b, false);
    }
    S.cam.x = S.jeep.x; S.cam.y = S.jeep.y;
    resize();
    message('Drive out and net some animals! Watch your fuel ⛽', 3.5);
  }

  function finish(towed) {
    if (S.ended) return;
    S.ended = true;
    onEnd(S.cargo.slice(), towed);
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
    const st = S.stats, j = S.jeep;

    // Fuel
    if (S.outOfFuelT < 0) {
      S.fuel -= dt;
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
    const up = canDrive && input.down('KeyW', 'ArrowUp');
    const down = canDrive && input.down('KeyS', 'ArrowDown');
    const left = canDrive && input.down('KeyA', 'ArrowLeft');
    const right = canDrive && input.down('KeyD', 'ArrowRight');
    const ter = terrainAt(j.x, j.y);
    let mult = 1;
    if (ter.water) mult = 0.45;
    else if (ter.biome === 'jungle') mult = 0.85;
    else if (ter.biome === 'tundra') mult = 0.8;
    mult = 1 - (1 - mult) * (1 - st.terrainGrip);
    const top = st.maxSpeed * mult;

    if (up) j.speed += st.accel * dt;
    else if (down) j.speed -= (j.speed > 0 ? st.accel * 1.8 : st.accel * 0.6) * dt;
    else j.speed *= Math.pow(ter.ice ? 0.6 : 0.15, dt);
    if (j.speed > top) j.speed = lerp(j.speed, top, Math.min(1, dt * 4));
    j.speed = Math.max(-top * 0.45, j.speed);

    const steer = (right ? 1 : 0) - (left ? 1 : 0);
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
          j.speed *= 0.4;
          if (impact > 120) { S.shake = Math.min(10, impact / 30); Sfx.bump(); }
        }
      }
    }
    j.x = clamp(j.x, JEEP_R, WORLD - JEEP_R);
    j.y = clamp(j.y, JEEP_R, WORLD - JEEP_R);

    // Dust trail
    if (Math.abs(j.speed) > 80 && Math.random() < dt * 30) {
      const col = ter.water ? '#d9f0ff' : ter.biome === 'tundra' ? '#ffffff' : ter.biome === 'jungle' ? '#6b8a4a' : '#c8ad74';
      S.particles.push({
        x: j.x - Math.cos(j.angle) * 22 + rand(-6, 6), y: j.y - Math.sin(j.angle) * 22 + rand(-6, 6),
        vx: rand(-20, 20), vy: rand(-20, 20), t: 0, life: 0.6, color: col, r: rand(3, 6),
      });
    }

    // Camera (with a little look-ahead)
    const lookX = j.x + j.vx * 0.35, lookY = j.y + j.vy * 0.35;
    S.cam.x = lerp(S.cam.x, lookX, Math.min(1, dt * 4));
    S.cam.y = lerp(S.cam.y, lookY, Math.min(1, dt * 4));
    S.cam.x = clamp(S.cam.x, Math.min(W / 2, WORLD / 2), Math.max(WORLD - W / 2, WORLD / 2));
    S.cam.y = clamp(S.cam.y, Math.min(H / 2, WORLD / 2), Math.max(WORLD - H / 2, WORLD / 2));
    S.shake = Math.max(0, S.shake - dt * 30);

    // Aiming & shooting
    const aimX = S.cam.x - W / 2 + input.mouse.x, aimY = S.cam.y - H / 2 + input.mouse.y;
    j.turret = dist(aimX, aimY, j.x, j.y) > 30 ? Math.atan2(aimY - j.y, aimX - j.x) : j.angle;
    S.reloadT -= dt;
    if (canDrive && (input.mouse.down || input.down('Space')) && S.reloadT <= 0) {
      S.reloadT = st.reload;
      const sx = j.x + Math.cos(j.turret) * 20, sy = j.y + Math.sin(j.turret) * 20;
      S.nets.push({
        x: sx, y: sy,
        vx: Math.cos(j.turret) * st.netSpeed + j.vx * 0.5,
        vy: Math.sin(j.turret) * st.netSpeed + j.vy * 0.5,
        traveled: 0, max: st.netRange, rot: 0,
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
          if (o.size > 40 && dist(n.x, n.y, o.x, o.y) < o.r) { n.dead = true; burst(n.x, n.y, '#eee', 4); break; }
        }
      }
      if (n.traveled > n.max) n.dead = true;
    }
    S.nets = S.nets.filter((n) => !n.dead);

    // Animals
    S.cargoWarnT -= dt;
    for (const a of S.animals) if (a.alive) updateAnimal(a, dt);
    S.animals = S.animals.filter((a) => a.alive);
    S.respawnT -= dt;
    if (S.respawnT <= 0) {
      S.respawnT = 1.5;
      for (const b of Object.keys(TARGET_POP)) if (biomeCount(b) < TARGET_POP[b] - 3) spawnGroup(b, true);
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
    if (S.atBase && (S.leftBase || S.t > 3) && input.pressed('KeyE')) finish(false);
  }

  // ---------------- Rendering ----------------

  function drawJeep(j) {
    ctx.save();
    ctx.translate(j.x, j.y);
    ctx.rotate(j.angle);
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(-24, -13, 50, 30);
    // wheels
    ctx.fillStyle = '#222';
    for (const [wx, wy] of [[-16, -16], [12, -16], [-16, 11], [12, 11]]) ctx.fillRect(wx, wy, 11, 5);
    // body
    ctx.fillStyle = '#5d7a3a';
    roundRect(-24, -13, 48, 26, 5); ctx.fill();
    ctx.fillStyle = '#6f8f47';
    roundRect(-20, -10, 30, 20, 3); ctx.fill();
    // windshield
    ctx.fillStyle = '#9fd3e8';
    ctx.fillRect(8, -10, 5, 20);
    // hood
    ctx.fillStyle = '#4e6830';
    ctx.fillRect(13, -11, 10, 22);
    // headlights
    ctx.fillStyle = '#fff6b0';
    ctx.fillRect(22, -10, 2, 4); ctx.fillRect(22, 6, 2, 4);
    // spare tire
    ctx.fillStyle = '#222';
    ctx.beginPath(); ctx.arc(-25, 0, 6, 0, Math.PI * 2); ctx.fill();
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
    ctx.drawImage(S.world.terrain, 0, 0, WORLD, WORLD);

    const vis = (x, y, m = 80) => x > camX - m && x < camX + W + m && y > camY - m && y < camY + H + m;

    for (const d of S.world.decor) if (vis(d.x, d.y)) drawEmoji(ctx, d.emoji, d.x, d.y, d.size, false, 0.7);

    // Base camp
    drawEmoji(ctx, '⛺', BASE.x - 70, BASE.y - 40, 48);
    drawEmoji(ctx, '⛺', BASE.x + 75, BASE.y - 25, 44);
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
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.beginPath(); ctx.ellipse(a.x, a.y + def.size * 0.38, def.size * 0.38, def.size * 0.13, 0, 0, Math.PI * 2); ctx.fill();
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

    // Nets in flight
    for (const n of S.nets) drawNet(n.x, n.y, 9 + n.traveled / n.max * 7, n.rot);

    drawJeep(S.jeep);

    // Trees & rocks on top (so you can hide under the canopy)
    for (const o of S.world.obstacles) {
      if (!vis(o.x, o.y)) continue;
      const nearJeep = dist(o.x, o.y - o.size * 0.3, S.jeep.x, S.jeep.y) < o.size * 0.6;
      drawEmoji(ctx, o.emoji, o.x, o.y - o.size * 0.3, o.size, false, nearJeep ? 0.5 : 1);
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
    const cargoW = Math.max(220, st.cargoMax * 30 + 34);
    panel(12, 12, cargoW, 92);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 15px system-ui, sans-serif';
    ctx.fillText(`Day ${Game.s.day} — Safari`, 24, 30);
    // fuel bar
    const fFrac = S.fuel / st.fuelMax;
    ctx.fillText('⛽', 22, 56);
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(46, 48, cargoW - 100, 16);
    ctx.fillStyle = fFrac > 0.3 ? '#7bd36b' : (Math.sin(S.t * 10) > 0 ? '#ff5050' : '#a83232');
    ctx.fillRect(46, 48, (cargoW - 100) * fFrac, 16);
    ctx.fillStyle = '#fff';
    ctx.font = '13px system-ui, sans-serif';
    ctx.fillText(`${Math.ceil(S.fuel)}s`, cargoW - 46, 56);
    // cargo slots
    for (let i = 0; i < st.cargoMax; i++) {
      const x = 36 + i * 30, y = 84;
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x - 12, y - 12, 25, 25);
      if (S.cargo[i]) drawEmoji(ctx, SPECIES[S.cargo[i]].emoji, x + 0.5, y + 0.5, 20);
    }

    // Reload indicator near cursor-ish: small bar under fuel
    // Minimap (top-right)
    const mm = Math.min(170, W * 0.28), mx = W - mm - 12, my = 12;
    panel(mx - 4, my - 4, mm + 8, mm + 8);
    ctx.drawImage(S.world.terrain, mx, my, mm, mm);
    const ms = mm / WORLD;
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
      const txt = S.cargo.length ? `Press E to drive home with ${S.cargo.length} animal${S.cargo.length > 1 ? 's' : ''}` : 'Press E to end the safari and head home';
      banner(txt, H - 60, '#ffe680');
    } else if (S.t < 12) {
      banner('WASD / Arrows: drive   •   Mouse: aim   •   Click / Space: fire net   •   Esc: pause', H - 30, '#fff', 13);
    }

    if (S.msg) banner(S.msg.text, H * 0.22, '#fff', 18);

    if (S.paused) {
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 36px system-ui, sans-serif';
      ctx.fillText('Paused', W / 2, H / 2 - 30);
      ctx.font = '16px system-ui, sans-serif';
      ctx.fillText('Esc to resume  •  Q to call the tow truck and go home now', W / 2, H / 2 + 12);
    }
    ctx.textBaseline = 'alphabetic';
  }

  function banner(text, y, color, size = 16) {
    ctx.font = `bold ${size}px system-ui, sans-serif`;
    const w = ctx.measureText(text).width + 30;
    panel(W / 2 - w / 2, y - size * 0.9, w, size * 1.8);
    ctx.fillStyle = color;
    ctx.fillText(text, W / 2, y);
  }

  return { init, start, update, render, resize, debug: () => S };
})();
