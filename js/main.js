// Entry point: input handling, scene switching and the main loop.

const Input = {
  keys: new Set(),
  justPressed: new Set(),
  mouse: { x: 0, y: 0, down: false },
  down(...codes) { return codes.some((c) => this.keys.has(c)); },
  pressed(code) { return this.justPressed.has(code); },
  endFrame() { this.justPressed.clear(); },
};

const App = {
  scene: 'zoo',
  last: 0,

  start() {
    Game.load();
    Zoo.init(document.getElementById('zoo-canvas'), (i) => UI.onPlotSelected(i));
    Safari.init(document.getElementById('safari-canvas'));
    UI.init();
    this.bindInput();
    window.addEventListener('resize', () => this.resize());
    this.resize();
    UI.refresh();
    if (!Game.s.seenIntro) UI.showIntro();
    requestAnimationFrame((t) => this.loop(t));
  },

  bindInput() {
    const gameKeys = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space']);
    window.addEventListener('keydown', (e) => {
      if (this.scene === 'safari' && gameKeys.has(e.code)) e.preventDefault();
      if (!e.repeat) Input.justPressed.add(e.code);
      Input.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => Input.keys.delete(e.code));
    window.addEventListener('blur', () => { Input.keys.clear(); Input.mouse.down = false; });
    const sc = document.getElementById('safari-canvas');
    sc.addEventListener('mousemove', (e) => { Input.mouse.x = e.offsetX; Input.mouse.y = e.offsetY; });
    sc.addEventListener('mousedown', (e) => { if (e.button === 0) Input.mouse.down = true; Sfx.ensure(); });
    window.addEventListener('mouseup', () => { Input.mouse.down = false; });
    sc.addEventListener('contextmenu', (e) => e.preventDefault());
  },

  resize() {
    if (this.scene === 'zoo') Zoo.resize();
    else Safari.resize();
  },

  setScene(name) {
    this.scene = name;
    document.getElementById('zoo-screen').classList.toggle('hidden', name !== 'zoo');
    document.getElementById('safari-screen').classList.toggle('hidden', name !== 'safari');
    this.resize();
  },

  startSafari() {
    Sfx.ensure();
    Input.keys.clear();
    Input.mouse.down = false;
    this.setScene('safari');
    Input.mouse.x = window.innerWidth / 2;
    Input.mouse.y = window.innerHeight / 3;
    Safari.start((cargo, towed) => this.endSafari(cargo, towed));
  },

  endSafari(cargo, towed) {
    const report = Game.endDay(cargo, towed);
    this.setScene('zoo');
    Zoo.select(-1);
    UI.refresh();
    UI.showReport(report);
    Sfx.cash();
  },

  loop(t) {
    const dt = Math.min(0.05, (t - this.last) / 1000 || 0);
    this.last = t;
    if (this.scene === 'safari') {
      Safari.update(dt, Input);
      Safari.render();
    } else {
      Zoo.render(dt);
    }
    Input.endFrame();
    requestAnimationFrame((tt) => this.loop(tt));
  },
};

window.addEventListener('DOMContentLoaded', () => App.start());
