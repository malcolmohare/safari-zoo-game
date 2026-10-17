// Entry point: the canvas, input, scene switching (shop <-> fishing) and the main loop.

const W = 320, H = 180;   // the game is drawn at this size and scaled up
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const buf = Pixel.canvas(W, H), g = buf.getContext('2d');
const isTouch = (window.matchMedia && matchMedia('(pointer: coarse)').matches) || 'ontouchstart' in window;
if (isTouch) document.body.classList.add('touch');

const LANE_KEYS = {
  Space: 0, Enter: 0, KeyF: 0, KeyD: 0, KeyZ: 0, ArrowLeft: 0, ArrowUp: 0,
  KeyJ: 1, KeyK: 1, KeyX: 1, ArrowRight: 1, ArrowDown: 1,
};

const App = {
  scene: 'shop',
  view: { scale: 1, x: 0, y: 0, dpr: 1 },
  pointers: new Map(),   // pointer id -> lane held during a fight

  start() {
    Analytics.init();
    Game.load();
    UI.init();
    this.bindInput();
    window.addEventListener('resize', () => this.layout());
    UI.refresh();
    Analytics.track('game_open', { day: Game.s.day, touch: isTouch });
    if (!Game.s.seenIntro) UI.showIntro();
    requestAnimationFrame((t) => this.loop(t));
  },

  // Fit the 320x180 picture between the top bar and the bottom action bar.
  layout() {
    const v = this.view, dpr = v.dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(innerWidth * dpr); canvas.height = Math.round(innerHeight * dpr);
    const top = document.getElementById('hud').getBoundingClientRect().bottom + 4;
    const barEl = document.getElementById('bar');
    const bottom = this.scene === 'fish' || barEl.classList.contains('hidden') ? innerHeight : barEl.getBoundingClientRect().top - 4;
    const aw = innerWidth * dpr, ah = Math.max(60, bottom - top) * dpr;
    let s = Math.min(aw / W, ah / H);
    if (s >= 3) s = Math.floor(s);   // whole-number scaling when it costs little; phones keep the bigger fractional fit
    v.scale = s;
    v.x = Math.floor((canvas.width - W * s) / 2);
    v.y = Math.floor(top * dpr + (ah - H * s) / 2);
  },

  toBuf(cx, cy) { const v = this.view; return { x: (cx * v.dpr - v.x) / v.scale, y: (cy * v.dpr - v.y) / v.scale }; },

  bindInput() {
    canvas.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      Snd.ensure();
      if (UI.isOpen()) return;
      if (this.scene === 'fish') {
        const lane = Fishing.lanes() === 2 && e.clientX >= innerWidth / 2 ? 1 : 0;
        this.pointers.set(e.pointerId, lane);
        Fishing.press(lane);
      } else {
        const p = this.toBuf(e.clientX, e.clientY);
        Shop.tap(p.x, p.y);
        UI.refresh();
      }
    });
    const up = (e) => {
      if (!this.pointers.has(e.pointerId)) return;
      const lane = this.pointers.get(e.pointerId);
      this.pointers.delete(e.pointerId);
      Fishing.release(lane);
    };
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', (e) => {
      Snd.ensure();
      if (this.scene !== 'fish' || UI.isOpen()) return;
      if (e.code === 'Escape') { this.endTrip(); return; }
      if (!(e.code in LANE_KEYS)) return;
      e.preventDefault();
      if (!e.repeat) Fishing.press(LANE_KEYS[e.code]);
    });
    window.addEventListener('keyup', (e) => { if (this.scene === 'fish' && e.code in LANE_KEYS) Fishing.release(LANE_KEYS[e.code]); });
  },

  goFishing(spot) {
    Snd.ensure();
    Shop.deselect();
    this.scene = 'fish';
    document.body.classList.add('fishing');
    Fishing.start(spot, (caught) => {
      this.scene = 'shop';
      document.body.classList.remove('fishing');
      Game.s.fishedToday = true;
      Game.save();
      UI.refresh();
      UI.showTripSummary(caught);
    });
    UI.refresh();
  },
  endTrip() {
    if (this.scene !== 'fish') return;
    if (Fishing.fighting() && !confirm('A fish is on the line! Head home anyway?')) return;
    Fishing.end();
  },

  openShop() {
    const n = Game.s.cooler.length;
    if (n && !confirm(`${n} fish ${n > 1 ? 'are' : 'is'} still in the cooler and will go to the wholesaler cheap tonight. Open the shop anyway?`)) return;
    if (!Game.allFish().length && !confirm('Your tanks are empty, so nobody can buy anything. Open anyway?')) return;
    Shop.open((day) => {
      const report = Game.endDay(day.sales);
      UI.refresh();
      UI.showDaySummary(report);
    });
    UI.refresh();
  },

  loop(t) {
    const dt = Math.min(0.05, (t - (this.last || t)) / 1000);
    this.last = t;
    if (this.scene === 'fish') { Fishing.update(dt); Fishing.render(g); }
    else { Shop.update(dt); Shop.render(g); }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#0a1024'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = false;
    const v = this.view;
    ctx.drawImage(buf, v.x, v.y, W * v.scale, H * v.scale);
    // Keep the top bar's money in step with sales during the day.
    if (this.scene === 'shop' && Shop.isOpen() && this.lastMoney !== Game.s.money) { this.lastMoney = Game.s.money; UI.refresh(); }
    requestAnimationFrame((tt) => this.loop(tt));
  },
};

window.addEventListener('DOMContentLoaded', () => App.start());
