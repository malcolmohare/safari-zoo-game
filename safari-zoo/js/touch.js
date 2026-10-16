// Touch controls for phones and tablets: a floating joystick on the left half of the
// screen plus on-screen buttons. Buttons feed the same Input key codes the keyboard uses.

const TouchControls = (() => {
  const enabled = (window.matchMedia && matchMedia('(pointer: coarse)').matches) || 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  const RADIUS = 60;   // joystick throw in CSS pixels
  const stick = { id: null, ox: 0, oy: 0 };
  let ui = null;

  function init() {
    if (!enabled) return;
    document.body.classList.add('touch');
    ui = {
      base: document.getElementById('stick-base'),
      knob: document.getElementById('stick-knob'),
      fire: document.getElementById('tbtn-fire'),
      home: document.getElementById('tbtn-home'),
      pause: document.getElementById('tbtn-pause'),
      auto: document.getElementById('tbtn-auto'),
      use: document.getElementById('tbtn-use'),
      pausePanel: document.getElementById('touch-pause'),
    };

    // Joystick: starts wherever a finger lands on the game canvas (left side on safari,
    // anywhere on the zoo map).
    for (const id of ['zoo-canvas', 'safari-canvas']) {
      const c = document.getElementById(id);
      c.addEventListener('touchstart', (e) => {
        e.preventDefault();
        Sfx.ensure();
        for (const t of e.changedTouches) {
          if (stick.id !== null) break;
          if (id === 'safari-canvas' && t.clientX > window.innerWidth * 0.6) continue;
          stick.id = t.identifier;
          stick.ox = t.clientX; stick.oy = t.clientY;
          moveStick(t.clientX, t.clientY);
        }
      }, { passive: false });
    }
    window.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) if (t.identifier === stick.id) { moveStick(t.clientX, t.clientY); e.preventDefault(); }
    }, { passive: false });
    const end = (e) => { for (const t of e.changedTouches) if (t.identifier === stick.id) releaseStick(); };
    window.addEventListener('touchend', end);
    window.addEventListener('touchcancel', end);

    // Buttons press and release virtual keys.
    document.querySelectorAll('[data-key]').forEach((b) => {
      const code = b.dataset.key;
      b.addEventListener('touchstart', (e) => {
        e.preventDefault();
        Sfx.ensure();
        Input.keys.add(code);
        Input.justPressed.add(code);
        b.classList.add('down');
      }, { passive: false });
      const up = (e) => { e.preventDefault(); Input.keys.delete(code); b.classList.remove('down'); };
      b.addEventListener('touchend', up, { passive: false });
      b.addEventListener('touchcancel', up, { passive: false });
    });
  }

  function moveStick(x, y) {
    let dx = x - stick.ox, dy = y - stick.oy;
    const d = Math.hypot(dx, dy);
    if (d > RADIUS) { dx = dx / d * RADIUS; dy = dy / d * RADIUS; }
    Input.axis.x = dx / RADIUS;
    Input.axis.y = dy / RADIUS;
    Input.axis.active = true;
    ui.base.style.display = 'block';
    ui.base.style.left = stick.ox + 'px';
    ui.base.style.top = stick.oy + 'px';
    ui.knob.style.transform = `translate(${dx}px, ${dy}px)`;
  }

  function releaseStick() {
    stick.id = null;
    Input.axis.x = Input.axis.y = 0;
    Input.axis.active = false;
    ui.base.style.display = 'none';
  }

  // Called every frame to show only the buttons that make sense right now.
  function sync(scene) {
    if (!enabled) return;
    const modal = UI.isModalOpen();
    const show = (el, on) => { el.style.display = on ? '' : 'none'; };
    const sf = scene === 'safari' ? Safari.touchState() : null;
    show(ui.fire, sf && !sf.paused);
    show(ui.home, sf && sf.canGoHome && !sf.paused);
    show(ui.pause, sf && !sf.paused);
    show(ui.auto, sf && !sf.paused && sf.hasAutoFire);
    if (sf && sf.hasAutoFire) {
      ui.auto.classList.toggle('on', Game.s.autoFireOn);
      ui.auto.textContent = Game.s.autoFireOn ? 'AUTO ON' : 'AUTO OFF';
    }
    show(ui.pausePanel, sf && sf.paused);
    show(ui.use, scene === 'zoo' && !modal && Zoo.hasTarget());
    if (modal && stick.id !== null) releaseStick();
  }

  return { enabled, init, sync };
})();
