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
  function flash(s, key) {
    return P.memo('flash' + key, () => {
      const c = P.canvas(s.width, s.height), g = c.getContext('2d');
      g.drawImage(s, 0, 0);
      g.globalCompositeOperation = 'source-in';
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, s.width, s.height);
      return c;
    });
  }

  // ---------- The boss: a mothership whose hull colour changes every loop ----------
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

  return { SHIP, LIFE, alien, flash, boss, powerup, POWER, planet };
})();
