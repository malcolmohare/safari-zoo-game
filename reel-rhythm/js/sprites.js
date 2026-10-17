// Pixel-art sprites built in code: fish (from each species' `art` description), shop customers,
// and small helpers for showing sprites in the HTML menus.

const Sprites = (() => {
  const SHAPE_P = { round: 2, tall: 2, long: 2.6, ribbon: 5, diamond: 1.25, disc: 2, puff: 2 };

  // A fish facing right. Body is a superellipse, with a tail fan, dorsal and belly fins, a pattern and an eye.
  function buildFish(key) {
    const a = SPECIES[key].art, L = a.len, Ht = a.ht;
    const tailLen = Math.max(3, Math.round(L * (a.shape === 'ribbon' ? 0.1 : a.tail === 'fancy' ? 0.38 : 0.24)));
    const tallFin = { sail: 0.6, long: 0.7, spines: 0.75, crest: 0.45 }[a.fin2] || 0.3;
    const finH = Math.max(2, Math.round(Ht * tallFin));
    const swordLen = a.extra === 'sword' ? Math.round(L * 0.4) : 0;
    const lureH = a.extra === 'lure' ? 5 : 0;
    const top = finH + lureH, bot = Math.max(2, Math.round(Ht * (a.fin2 === 'long' ? 0.6 : 0.3)));
    const w = L + swordLen, h = top + Ht + bot;
    const bx0 = tailLen - 1, bx1 = L - 1;
    const rx = (bx1 - bx0) / 2, cx = bx0 + rx, cy = top + (Ht - 1) / 2, ry = Ht / 2;
    const p = SHAPE_P[a.shape] || 2;
    const taper = !['round', 'puff', 'disc', 'diamond'].includes(a.shape);
    const hh = (x) => {
      const u = Math.abs(x - cx) / rx;
      if (u >= 1) return -1;
      let v = ry * Math.pow(1 - Math.pow(u, p), 1 / p);
      if (taper && x < cx) v *= 1 - 0.4 * Math.pow((cx - x) / rx, 2);
      return v;
    };
    const fx0 = cx - rx * 0.6, fx1 = cx + rx * (a.fin2 === 'crest' ? 0.95 : 0.3);
    const vx0 = cx - rx * 0.45, vx1 = cx + rx * 0.05;
    const ex = Math.round(cx + rx * (a.shape === 'disc' || a.shape === 'diamond' ? 0.5 : 0.62)), ey = Math.round(cy - ry * 0.25);
    const tailCol = a.tailCol || a.fin;
    const u = (x) => (x - bx0) / (bx1 - bx0);

    const src = Pixel.pix(w, h, (x, y) => {
      const dy = y - cy, half = hh(x);
      // Eye
      if (Ht >= 9 && (x === ex || x === ex + 1) && (y === ey || y === ey + 1)) return x === ex && y === ey ? '#f8f8f0' : '#101018';
      if (Ht < 9 && x === ex && y === ey) return '#101018';
      // Sword
      if (swordLen && x > bx1 - 2 && Math.abs(dy) < 0.8 && x < w) return '#a8b0c0';
      // Anglerfish lure: a stalk up from the head ending in a glowing bulb
      if (lureH) {
        const lx = Math.round(cx + rx * 0.45), topY = Math.round(cy - ry);
        if (x === lx && y < topY && y >= topY - lureH) return '#584848';
        if (y === topY - lureH && x > lx && x <= lx + 3) return x === lx + 3 ? '#f8f088' : '#584848';
        if (x === lx + 3 && y === topY - lureH + 1) return '#f8f088';
      }
      if (half >= 0 && Math.abs(dy) <= half) {
        const rel = dy / Math.max(0.5, half);
        let c = rel > 0.35 ? a.belly : a.body;
        const pc = a.patCol;
        switch (a.pat) {
          case 'stripes': if (u(x) > 0.15 && u(x) < 0.8 && Math.floor((x - bx0) / Math.max(2, Math.round(L / 7))) % 2) c = pc; break;
          case 'lineH': if (Math.abs(rel) < 0.2 && u(x) > 0.1 && u(x) < 0.85) c = pc; break;
          case 'neon': c = rel > 0.1 && u(x) < 0.6 ? a.belly : a.body; if (rel > -0.45 && rel < -0.05 && u(x) < 0.85) c = pc; break;
          case 'spots': if (rel < 0.5 && Pixel.hash(x, y, 7) < 0.2) c = pc; break;
          case 'blotch': if (Pixel.hash(Math.floor(x / 3), Math.floor(y / 3), 3) < 0.45) c = pc; break;
          case 'rainbow': if (Math.abs(rel) < 0.28 && u(x) > 0.1) c = pc; else if (rel < 0 && Pixel.hash(x, y, 2) < 0.12) c = '#405030'; break;
          case 'scutes': if (rel < -0.3 && rel > -0.8 && x % 3 === 0) c = pc; break;
          case 'waves': if (Math.sin(x * 1.4 + y * 0.9) > 0.55) c = pc; break;
          case 'scales': if ((x + (y % 2)) % 3 === 0 && rel < 0.6) c = pc; break;
          case 'glow': if (rel > 0.5 && x % 2 === 0) c = pc; break;
          case 'clown': for (const k of [0.85, 0.5, 0.15]) { const d = Math.abs(u(x) - k) * (bx1 - bx0); if (d < 1.1) c = pc; else if (d < 1.9 && c !== pc) c = '#201810'; } break;
          case 'tang': if (rel < 0.05 && rel > -0.7 && u(x) > 0.1 && u(x) < 0.75 && !(rel > -0.4 && u(x) > 0.3 && u(x) < 0.55)) c = pc; break;
        }
        if (a.teeth || a.extra === 'teeth') if (x >= bx1 - 1 && Math.abs(dy - ry * 0.3) < 0.7 && x % 2 === 0) return '#f8f8f0';
        if (rel < -0.6) return Pixel.shade(c, 1.18);
        if (rel > 0.75) return Pixel.shade(c, 0.82);
        return c;
      }
      // Tail fan (forked unless fancy)
      if (x <= tailLen) {
        const k = 1 - x / tailLen, th = 1 + ry * (a.tail === 'fancy' ? 1.1 : 0.9) * k;
        if (Math.abs(dy) <= th) {
          const forkW = tailLen * 0.45;
          if (a.tail !== 'fancy' && a.shape !== 'ribbon' && x < forkW && Math.abs(dy) < ry * 0.55 * (1 - x / forkW)) return null;
          return Math.abs(dy) > th - 1 ? Pixel.shade(tailCol, 0.85) : tailCol;
        }
      }
      // Dorsal fin
      if (x >= fx0 && x <= fx1 && dy < 0 && half >= 0) {
        const t = (x - fx0) / (fx1 - fx0);
        let fh = finH * Math.sin(Math.PI * t);
        if (a.fin2 === 'sail' || a.fin2 === 'spines') fh = finH * (1 - t * 0.7);
        if (a.fin2 === 'crest') fh = t > 0.85 ? finH : finH * 0.35;
        if (-dy > half && -dy <= half + fh) return a.fin2 === 'spines' && x % 2 ? '#f0e0d0' : a.fin;
      }
      // Belly fin
      if (x >= vx0 && x <= vx1 && dy > 0 && half >= 0) {
        const t = (x - vx0) / (vx1 - vx0), fh = bot * Math.sin(Math.PI * t);
        if (dy > half && dy <= half + fh) return a.fin2 === 'spines' && x % 2 ? '#f0e0d0' : a.fin;
      }
      // Whiskers / barbels hang from the chin
      if (a.extra === 'whiskers' || a.extra === 'barbel') {
        const mx = bx1 - 1, my = Math.round(cy + ry * 0.3);
        for (let i = 1; i <= (a.extra === 'barbel' ? 2 : 4); i++) if (x === mx - i + 1 && y === my + i) return '#302820';
      }
      return null;
    });
    return Pixel.outline(src);
  }

  const fish = (key, flip = false) => Pixel.memo(`fish:${key}:${flip}`, () => flip ? Pixel.flipH(fish(key)) : buildFish(key));
  // A solid shape of a fish (unknown species, shadows under the water).
  function silhouette(key, color = '#203048') {
    return Pixel.memo(`sil:${key}:${color}`, () => {
      const s = fish(key), c = Pixel.canvas(s.width, s.height), g = c.getContext('2d');
      g.drawImage(s, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = color; g.fillRect(0, 0, c.width, c.height);
      return c;
    });
  }

  // <img> tags for the HTML menus, scaled up with crisp pixels.
  const urls = new Map();
  function img(key, scale = 2, unknown = false) {
    const id = `${key}:${unknown}`;
    let u = urls.get(id);
    if (!u) { u = (unknown ? silhouette(key, '#3a4878') : fish(key)).toDataURL(); urls.set(id, u); }
    const s = fish(key);
    return `<img class="px" src="${u}" width="${s.width * scale}" height="${s.height * scale}" alt="">`;
  }

  // ---- People ----
  const PERSON = [
    '..hhhh..', '.hhhhhh.', '.hssssh.', '.sEssEs.', '..ssss..',
    '.cccccc.', 'cccccccc', 'sccccccs', 'sccccccs', '.cccccc.',
    '.pppppp.', '.pp..pp.', '.pp..pp.', '.bb..bb.',
  ];
  const WALK = ['.pppppp.', '..pp.pp.', '.pp...pp', '.bb...bb'];
  const HAIR = ['#302018', '#684020', '#c89040', '#181818', '#a83820', '#d8d0c0', '#5a3a8a'];
  const SKIN = ['#f8d0a8', '#e0a878', '#a87048', '#704828', '#f0c090'];
  const SHIRT = ['#d84848', '#4878d8', '#48a858', '#e8c040', '#a858c8', '#e88838', '#38a8a8', '#f0f0f0'];
  const PANTS = ['#384868', '#504030', '#303038', '#606878', '#2c5040'];
  function person(look, frame = 0, flip = false) {
    return Pixel.memo(`p:${look.join(',')}:${frame}:${flip}`, () => {
      const rows = PERSON.slice();
      if (frame) for (let i = 0; i < 4; i++) rows[10 + i] = WALK[i];
      if (look[4]) { rows[6] = 'cccaaccc'; rows[7] = 'sccaaccs'; rows[8] = 'scaaaacs'; rows[9] = '.caaaac.'; }   // apron
      const pal = { h: HAIR[look[0]], s: SKIN[look[1]], c: SHIRT[look[2]], p: PANTS[look[3]], b: '#303030', E: '#181818', a: '#58a8d0' };
      const s = Pixel.fromMap(rows, pal);
      return flip ? Pixel.flipH(s) : s;
    });
  }
  const randomLook = () => [HAIR.length, SKIN.length, SHIRT.length, PANTS.length].map((n) => Math.floor(Math.random() * n)).concat(0);

  return { fish, silhouette, img, person, randomLook };
})();
