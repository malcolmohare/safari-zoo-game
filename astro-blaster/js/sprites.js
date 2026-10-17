// All of Astro Blaster's art, built in code. Lowercase map letters get automatic top-left
// lighting; capitals (eyes, lights, glass) stay flat.

const Sprites = (() => {
  const P = Pixel;
  const map = (rows, pal) => P.fromMap(rows, pal);

  // ---------- Player ship (nose to the right) ----------
  const SHIP = () => P.memo('ship', () => map([
    '........dd...........',
    '.......dbbd..........',
    '......dbbbbd.........',
    '..cc.aaaaaaaaa.......',
    '.ccaaaaaaaaaaaWWaa...',
    '.ccaaaaaaaaaaaWWWaaa.',
    '.ccaaaaaaaaaaaaaaaa..',
    '..cc.aaaaaaaaa.......',
    '......dbbbbd.........',
    '.......dbbd..........',
    '........dd...........',
  ], { a: '#d0d4e4', b: '#e04838', d: '#a02818', c: '#687088', W: '#60d0f8' }));
  const LIFE = () => P.memo('life', () => map([
    '..b....',
    '.aaaaW.',
    'aaaaaaa',
    '.aaaa..',
    '..b....',
  ], { a: '#d0d4e4', b: '#e04838', W: '#60d0f8' }));

  // ---------- Aliens (facing left), two animation frames each ----------
  const ALIENS = {
    drone: { pal: { a: '#68d838', K: '#181828' }, frames: [[
      '..a.....a..',
      '...a...a...',
      '..aaaaaaa..',
      '.aaKaaaKaa.',
      'aaaaaaaaaaa',
      'a.aaaaaaa.a',
      'a.a.....a.a',
      '...aa.aa...',
    ], [
      '..a.....a..',
      'a..a...a..a',
      'a.aaaaaaa.a',
      'aaaKaaaKaaa',
      'aaaaaaaaaaa',
      '.aaaaaaaaa.',
      '..a.....a..',
      '.a.......a.',
    ]] },
    waver: { pal: { a: '#f868b8', K: '#181828' }, frames: [[
      '...aa...',
      '..aaaa..',
      '.aaaaaa.',
      'aKaaKaaa',
      'aaaaaaaa',
      '..a..a..',
      '.a.aa.a.',
      'a.a..a.a',
    ], [
      '...aa...',
      '..aaaa..',
      '.aaaaaa.',
      'aKaaKaaa',
      'aaaaaaaa',
      '.a.aa.a.',
      'a......a',
      '.a....a.',
    ]] },
    shooter: { pal: { a: '#f89838', K: '#181828', C: '#f8f060' }, frames: [[
      '....aaaa....',
      '.aaaaaaaaaa.',
      'aaaaaaaaaaaa',
      'CaaKKaaKKaaa',
      'aaaaaaaaaaaa',
      '...aa..aa...',
      '..aa.aa.aa..',
      'aa........aa',
    ], [
      '....aaaa....',
      '.aaaaaaaaaa.',
      'aaaaaaaaaaaa',
      'CaaKKaaKKaaa',
      'aaaaaaaaaaaa',
      '..aaa..aaa..',
      '.aa..aa..aa.',
      '..aa....aa..',
    ]] },
    diver: { pal: { a: '#e84848', b: '#a83030', K: '#f8f8f8', F: '#f8d040' }, frames: [[
      '......aaa...',
      '....aaaabbF.',
      '..aaaaKKbb..',
      'aaaaaaaaaabF',
      '..aaaaKKbb..',
      '....aaaabbF.',
      '......aaa...',
    ], [
      '......aaa...',
      '....aaaabb.F',
      '..aaaaKKbb..',
      'aaaaaaaaaab.',
      '..aaaaKKbb.F',
      '....aaaabb..',
      '......aaa...',
    ]] },
    brute: { pal: { a: '#5878d8', b: '#3a4c98', K: '#f83838', C: '#a8b8f8' }, frames: [[
      '.....aaaaaaaa.....',
      '...aaaaaaaaaaaa...',
      '..aaabbbbbbbbaaa..',
      '.aaabbCbbbbCbbaaa.',
      'aKKabbbbbbbbbbaaaa',
      'aKKabbbbbbbbbbaaaa',
      'aaaabbbbbbbbbbaaaa',
      'aaaabbCbbbbCbbaaaa',
      '.aaabbbbbbbbbbaaa.',
      '..aaabbbbbbbbaaa..',
      '...aaaaaaaaaaaa...',
      '..a.a.a....a.a.a..',
      '.a.a.a......a.a.a.',
    ], [
      '.....aaaaaaaa.....',
      '...aaaaaaaaaaaa...',
      '..aaabbbbbbbbaaa..',
      '.aaabbCbbbbCbbaaa.',
      'aKKabbbbbbbbbbaaaa',
      'aKKabbbbbbbbbbaaaa',
      'aaaabbbbbbbbbbaaaa',
      'aaaabbCbbbbCbbaaaa',
      '.aaabbbbbbbbbbaaa.',
      '..aaabbbbbbbbaaa..',
      '...aaaaaaaaaaaa...',
      '.a.a.a......a.a.a.',
      '..a.a.a....a.a.a..',
    ]] },
  };
  function alien(type, frame) { return P.memo('al' + type + frame, () => map(ALIENS[type].frames[frame], ALIENS[type].pal)); }

  // A white silhouette of a sprite, flashed when something takes a hit.
  const flashes = new WeakMap();
  function flash(s) {
    let c = flashes.get(s);
    if (!c) {
      c = P.canvas(s.width, s.height);
      const g = c.getContext('2d');
      g.drawImage(s, 0, 0);
      g.globalCompositeOperation = 'source-in';
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, s.width, s.height);
      flashes.set(s, c);
    }
    return c;
  }

  // ---------- Boss 1: the mothership, whose hull colour changes each time it returns ----------
  const BOSS_HULLS = ['#9098c0', '#c86868', '#68a878', '#c8a048', '#a868c8'];
  function boss(loop, frame) {
    const hull = BOSS_HULLS[loop % BOSS_HULLS.length];
    return P.memo('boss' + hull + frame, () => P.outline(P.pix(66, 46, (x, y) => {
      const lit = (k) => P.shade(hull, k);
      // glass dome with the pilot inside
      const dx = (x + 0.5 - 38) / 14, dy = (y + 0.5 - 17) / 11;
      if (y < 18 && dx * dx + dy * dy <= 1) {
        const ax = (x + 0.5 - 38) / 6, ay = (y + 0.5 - 15) / 5;
        if (ax * ax + ay * ay <= 1) {
          if (y === 13 && (x === 35 || x === 39)) return '#181828';
          return x < 37 ? '#90f070' : '#58c048';
        }
        if (dx < -0.3 && dy < -0.3 && dx * dx + dy * dy > 0.4) return '#e8faff';
        return dy < 0 ? '#80d8f8' : '#58a8d8';
      }
      // main saucer hull
      const hx = (x + 0.5 - 36) / 30, hy = (y + 0.5 - 26) / 11;
      if (hx * hx + hy * hy <= 1) {
        if (y === 26) return (x % 6 === 0) ? ((x / 6 + frame) % 2 ? '#f8e040' : '#f84848') : lit(0.5);
        if (y === 21 && x > 14 && x < 58) return lit(0.75);
        if ((x - 36) ** 2 + (y - 31) ** 2 <= 9) return frame ? '#f87878' : '#f83838';   // the glowing core
        if (hy < -0.4) return lit(1.25);
        if (hy > 0.45) return lit(0.65);
        return hx < -0.5 ? lit(1.1) : lit(0.92);
      }
      // nose cannon
      if (x <= 10 && y >= 24 && y <= 28) return x <= 1 ? '#f8a040' : y === 24 ? '#a0a0b0' : y === 28 ? '#484858' : '#787888';
      // under-pods
      for (const px of [22, 50]) if ((x - px) ** 2 + ((y - 37) * 1.4) ** 2 <= 20) return y < 37 ? lit(0.9) : lit(0.6);
      if (y >= 40 && y <= 44 && (x === 22 || x === 50)) return frame ? '#f8a040' : '#f8e040';
      return null;
    })));
  }

  // ---------- Boss 2: the Space Serpent, a head trailing a chain of armoured segments ----------
  const SERPENT_HULLS = ['#58b868', '#c85898', '#d8a038', '#5888d8'];
  const SERPENT_HEAD = [[
    '.......aaaaaaa......',
    '....aaaaaaaaaaaa....',
    '..aaaaaaaaaaaaaaaa..',
    '.aaaaaaaYYYaaaaaaaa.',
    'aaaaaaaYYKYaaaaaaaaa',
    'aaaaaaaaYYYaaaaaaaaa',
    'aaaaaaaaaaaaaaaaaaaa',
    'WbWbWbbbbbbbbbbbbbbb',
    'bbbbbbbbbbbbbbbbbbbb',
    '.bbbbbbbbbbbbbbbbbbb',
    '...bbbbbbbbbbbbbbbb.',
    '.....bbbbbbbbbbbbb..',
    '........bbbbbbb.....',
  ], [
    '.......aaaaaaa......',
    '....aaaaaaaaaaaa....',
    '..aaaaaaaaaaaaaaaa..',
    '.aaaaaaaYYYaaaaaaaa.',
    'aaaaaaaYYKYaaaaaaaaa',
    'aaaaaaaaYYYaaaaaaaaa',
    'WaWaWaaaaaaaaaaaaaaa',
    '.RRRRRRbbbbbbbbbbbbb',
    '..RRRRRbbbbbbbbbbbbb',
    'WbWbWbbbbbbbbbbbbbbb',
    '...bbbbbbbbbbbbbbbb.',
    '.....bbbbbbbbbbbbb..',
    '........bbbbbbb.....',
  ]];
  const hullOf = (list, mark) => list[mark % list.length];
  function serpentHead(mark, frame, flip) {
    const hull = hullOf(SERPENT_HULLS, mark);
    return P.memo('sh' + hull + frame + (flip ? 1 : 0), () => {
      const s = map(SERPENT_HEAD[frame], { a: hull, b: P.shade(hull, 0.72), Y: '#f8e040', K: '#181828', W: '#f8f8f8', R: '#701828' });
      return flip ? P.flipH(s) : s;
    });
  }
  function serpentSeg(mark, tail) {
    const hull = hullOf(SERPENT_HULLS, mark);
    return P.memo('ss' + hull + (tail ? 1 : 0), () => {
      const r = tail ? 4 : 6, n = r * 2;
      return P.outline(P.pix(n, n, (x, y) => {
        const dx = (x + 0.5 - r) / r, dy = (y + 0.5 - r) / r, d = dx * dx + dy * dy;
        if (d > 1) return null;
        if (!tail && Math.abs(dx) < 0.17) return P.shade(hull, 0.55);   // the seam between scales
        const k = -(dx + dy) * 0.5 - d * 0.3;
        return P.shade(hull, k > 0.15 ? 1.3 : k > -0.35 ? 1 : 0.7);
      }));
    });
  }

  // ---------- Boss 3: the Watcher, a giant eye that blinks shut to armour itself ----------
  const WATCHER_HULLS = ['#9858b8', '#b84848', '#4890a8', '#88a040'];
  const EYE_W = 13, EYE_H = 9.5;
  const eyeD = (x, y) => ((x + 0.5 - 24) / EYE_W) ** 2 + ((y + 0.5 - 24) / EYE_H) ** 2;
  function watcher(mark, frame) {
    const hull = hullOf(WATCHER_HULLS, mark);
    return P.memo('wa' + hull + frame, () => P.outline(P.pix(48, 48, (x, y) => {
      const dx = x + 0.5 - 24, dy = y + 0.5 - 24, d = Math.hypot(dx, dy), ang = Math.atan2(dy, dx);
      // spikes around the rim
      if (d > 19 && d < 23.5 && Math.cos(ang * 10) > 0.6 + (d - 19) * 0.08) return d > 22 ? (frame ? '#f8e040' : '#f89838') : P.shade(hull, 0.6);
      if (d > 19.5) return null;
      const e = eyeD(x, y);
      if (e <= 1) {
        if (e > 0.45 && P.hash(x, y, 3) < 0.07) return frame ? '#e85868' : '#c83848';   // veins
        return dy < -5 && dx < 0 ? '#ffffff' : e > 0.7 && dy > 0 ? '#b8b0c8' : '#e4dcec';
      }
      if (e <= 1.3) return P.shade(hull, 0.5);   // eyelid rim
      const k = (dx + dy) / 19.5;
      return P.shade(hull, k < -0.55 ? 1.3 : k < 0.3 ? 1 : k < 0.8 ? 0.78 : 0.6);
    })));
  }
  // The eyelid, drawn over the iris: frame 1 is half shut, frame 2 fully shut.
  function watcherLid(mark, frame) {
    const hull = hullOf(WATCHER_HULLS, mark);
    return P.memo('wl' + hull + frame, () => P.pix(48, 48, (x, y) => {
      if (eyeD(x, y) > 1.05) return null;
      const dy = y + 0.5 - 24;
      if (frame === 1 && dy > 0.5) return null;
      if (dy > -0.5 && dy < 0.5) return '#181828';                     // lash line
      if (dy >= 0.5) return P.shade(hull, 0.75);
      return dy < -6 ? P.shade(hull, 1.3) : P.shade(hull, 1.05);
    }));
  }
  function iris(charging) {
    return P.memo('iris' + (charging ? 1 : 0), () => P.pix(10, 10, (x, y) => {
      const dx = x + 0.5 - 5, dy = y + 0.5 - 5, d = dx * dx + dy * dy;
      if (d > 20.25) return null;
      if (x === 3 && y === 3) return '#ffffff';
      if (d <= 4) return '#10101c';
      return charging ? (d > 12 ? '#c82828' : '#f85848') : (d > 12 ? '#2868c8' : '#48b0f8');
    }));
  }

  // ---------- Boss 4: the Gemini Twins, a pair of gunships ----------
  const TWIN_HULLS = [['#58c8e8', '#e86848'], ['#e8d048', '#a858e8'], ['#68e888', '#e85898'], ['#e8e8f0', '#787890']];
  function twin(i, mark, frame) {
    const hull = hullOf(TWIN_HULLS, mark)[i];
    return P.memo('tw' + hull + frame, () => P.outline(P.pix(38, 22, (x, y) => {
      const lit = (k) => P.shade(hull, k);
      if (x < 8 && (y === 10 || y === 11)) return x < 2 ? '#f8a040' : y === 10 ? '#a0a0b0' : '#585868';   // cannon
      const cx = (x + 0.5 - 15) / 4.5, cy = (y + 0.5 - 9) / 2.5;
      if (cx * cx + cy * cy <= 1) return cx < -0.2 && cy < 0 ? '#e8faff' : '#60b8f0';                      // cockpit
      const bx = (x + 0.5 - 21) / 15, by = (y + 0.5 - 11) / 5.5;
      if (bx * bx + by * by <= 1) {
        if (y === 12 && x > 12 && x < 32) return lit(0.6);
        if (x === 26 && y > 7 && y < 15) return (frame ? '#f8e040' : '#f84848');
        return by < -0.4 ? lit(1.25) : by > 0.4 ? lit(0.7) : lit(1);
      }
      if (x >= 24 && x <= 35) {                                                                           // swept fins
        if (y >= 1 + (35 - x) * 0.4 && y < 7) return y < 3 + (35 - x) * 0.4 ? lit(1.2) : lit(0.85);
        if (y <= 20 - (35 - x) * 0.4 && y > 14) return lit(0.65);
      }
      if (x >= 36 && y >= 9 && y <= 12) return frame ? '#f8e040' : '#f89838';                            // engine
      return null;
    })));
  }

  // ---------- Power-ups: a capsule with a letter ----------
  const POWER = {
    P: { color: '#e04838', label: 'P', name: 'POWER UP!' },
    R: { color: '#3878e8', label: 'R', name: 'RAPID FIRE!' },
    S: { color: '#38b848', label: 'S', name: 'SHIELD!' },
    B: { color: '#e88a20', label: 'B', name: 'BOMB!' },
    L: { color: '#e858b8', label: '1', name: '1UP!' },
  };
  function powerup(type, frame) {
    return P.memo('pu' + type + frame, () => {
      const c = POWER[type].color;
      const s = P.pix(11, 9, (x, y) => {
        if ((x === 0 || x === 10) && (y === 0 || y === 8)) return null;
        if (y === 0 || x === 0) return P.shade(c, 1.35);
        if (y === 8 || x === 10) return P.shade(c, 0.7);
        return c;
      });
      const g = s.getContext('2d');
      P.text(g, POWER[type].label, 4, 2, '#ffffff', 1, 'left', null);
      const o = P.outline(s, frame ? '#ffffff' : '#10101c');
      return o;
    });
  }

  // ---------- Background planets ----------
  const PLANETS = [['#c86848', '#f0b070'], ['#4878c8', '#90d0f0'], ['#9858c8', '#e0a8f8'], ['#58a868', '#c0e890'], ['#c8a048', '#f8e8a0']];
  function planet(seed) {
    return P.memo('planet' + seed, () => {
      const [dark, light] = PLANETS[seed % PLANETS.length], r = 12 + (seed * 7) % 14, ringed = seed % 2 === 0;
      const w = r * 2 + (ringed ? 16 : 2), h = r * 2 + 2, cx = w / 2, cy = h / 2;
      return P.pix(w, h, (x, y) => {
        const dx = (x + 0.5 - cx) / r, dy = (y + 0.5 - cy) / r, d = dx * dx + dy * dy;
        const ringD = ((x + 0.5 - cx) / (r + 7)) ** 2 + ((y + 0.5 - cy) / 3.2) ** 2;
        const onRing = ringed && ringD <= 1 && ringD >= 0.55;
        if (onRing && (dy > 0 || d > 1)) return P.shade(light, 0.75);
        if (d > 1) return null;
        const band = Math.floor((dy + 1) * 4 + P.hash(seed, Math.floor(dx * 3)) * 0.8) % 2;
        const lightness = 0.55 + 0.6 * Math.max(0, -(dx + dy) * 0.7 + 0.3);
        return P.shade(band ? light : dark, Math.min(1.1, lightness));
      });
    });
  }

  return { SHIP, LIFE, alien, flash, boss, serpentHead, serpentSeg, watcher, watcherLid, iris, twin, powerup, POWER, planet };
})();
