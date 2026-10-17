// The HTML parts of the game: the top bar, the bottom action bar (with the cooler), and the pop-up menus.

const UI = (() => {
  const $ = (id) => document.getElementById(id);
  let menu = null;   // { render: () => html, onAction: (action, data) => void }

  function init() {
    document.body.addEventListener('click', (e) => {
      const el = e.target.closest('[data-action]');
      if (!el || el.disabled) return;
      Snd.ensure();
      const a = el.dataset.action, d = el.dataset;
      if (el.closest('#modal')) {
        if (a === 'close') { close(); return; }
        if (menu) { menu.onAction(a, d); if (menu) rerender(); }
      } else barAction(a, d);
      refresh();
    });
    window.addEventListener('keydown', (e) => {
      if (isOpen() && e.code === 'Escape' && menu && !menu.noClose) { close(); e.stopPropagation(); }
    }, true);
  }

  function open(render, onAction = () => {}, opts = {}) {
    menu = { render, onAction, ...opts };
    rerender();
    $('modal').classList.remove('hidden');
    $('modal-box').scrollTop = 0;
  }
  function rerender() { $('modal-box').innerHTML = menu.render() + (menu.noClose ? '' : `<button class="link close-x" data-action="close">✕ close</button>`); }
  function close() { $('modal').classList.add('hidden'); menu = null; refresh(); }
  const isOpen = () => !$('modal').classList.contains('hidden');

  function toast(text) {
    const el = document.createElement('div');
    el.className = 'toast'; el.innerHTML = text;
    $('toasts').appendChild(el);
    while ($('toasts').children.length > 3) $('toasts').firstChild.remove();
    setTimeout(() => el.classList.add('out'), 2200);
    setTimeout(() => el.remove(), 2700);
  }

  // ---- Small helpers ----
  const btn = (label, action, data = {}, cost = null, cls = '') => {
    const attrs = Object.entries(data).map(([k, v]) => `data-${k}="${v}"`).join(' ');
    const ok = cost === null || Game.s.money >= cost;
    return `<button class="btn ${cls} ${ok ? '' : 'cant'}" data-action="${action}" ${attrs} ${ok ? '' : 'disabled'}>${label}${cost !== null ? ` <span class="cost">${fmt$(cost)}</span>` : ''}</button>`;
  };
  const stars = (r) => { const n = Math.round(r * 2) / 2; let s = ''; for (let i = 1; i <= 5; i++) s += n >= i ? '★' : n >= i - 0.5 ? '⯪' : '☆'; return s; };
  const heartsHtml = (h) => { const n = Game.hearts(h); return `<span class="hearts">${'♥'.repeat(n)}<span class="off">${'♥'.repeat(5 - n)}</span></span>`; };
  const sizeName = (sp) => ({ 1: 'Small', 2: 'Medium', 4: 'Large' })[sp.size];
  function needs(sp) {
    const bits = [WATER_LABEL[sp.water], TEMP_LABEL[sp.temp]];
    const min = sp.big ? 'Large' : sp.size >= 4 ? 'Medium+' : null;
    if (min) bits.push(`📏 ${min} tank`);
    for (const d of sp.likes) bits.push(`${DECOR[d].icon} ${DECOR[d].name}`);
    if (sp.school) bits.push('🐟🐟🐟 Needs 3+');
    if (sp.aggro) bits.push('😠 Aggressive');
    return bits.map((b) => `<span class="tag">${b}</span>`).join('');
  }

  // ---- Top bar and action bar ----
  function refresh() {
    const s = Game.s;
    $('stat-day').textContent = s.day;
    $('stat-money').textContent = fmt$(s.money);
    $('stat-money').classList.toggle('neg', s.money < 0);
    $('stat-rep').textContent = stars(s.rep);
    const due = Game.rentDueIn();
    $('stat-rent').textContent = `${fmt$(Game.rent())} ${due === 1 ? 'tonight' : `in ${due} days`}`;
    $('stat-rent').classList.toggle('neg', due <= 2 && s.money < Game.rent());
    $('btn-mute').textContent = Snd.isMuted() ? '🔇' : '🔊';
    renderBar();
    App.layout();
  }

  function renderBar() {
    const s = Game.s, bar = $('bar');
    if (App.scene === 'fish') { bar.innerHTML = ''; bar.classList.add('hidden'); $('trip-btns').classList.remove('hidden'); return; }
    $('trip-btns').classList.add('hidden');
    bar.classList.remove('hidden');
    if (Shop.isOpen()) {
      bar.innerHTML = `<div class="bar-row"><span class="bar-note">🏪 Open for business! ${s.up.cashier ? 'Your cashier rings customers up.' : 'Tap customers waiting at the counter to ring them up.'}</span>${btn('Close early', 'closeEarly', {}, null, 'small')}</div>`;
      return;
    }
    const sel = Shop.selected();
    let cooler = '';
    if (s.cooler.length) {
      cooler = `<div class="cooler"><span class="cooler-label">🧊 Cooler</span>${s.cooler.map((f) => `<button class="fish-chip ${sel === f.id ? 'on' : ''}" data-action="select" data-id="${f.id}">${Sprites.img(f.sp, 2)}<span>${SPECIES[f.sp].name}</span></button>`).join('')}</div>`;
      if (sel !== null) {
        const f = s.cooler.find((x) => x.id === sel);
        if (f) cooler += `<div class="bar-row"><span class="bar-note">Tap a tank to put the <b>${SPECIES[f.sp].name}</b> in. Hearts show how happy it would be.</span>${btn(`Sell to wholesaler ${fmt$(Game.wholesale(f))}`, 'sellCooler', { id: f.id }, null, 'small')}${btn('Cancel', 'deselect', {}, null, 'small')}</div>`;
      } else cooler += `<div class="bar-row"><span class="bar-note muted">Tap a fish, then a tank. Anything left in the cooler tonight goes to the wholesaler cheap.</span></div>`;
    }
    bar.innerHTML = `${cooler}<div class="bar-row main-btns">
      <button class="btn fish-btn" data-action="fishing" ${s.fishedToday ? 'disabled' : ''}>🎣 ${s.fishedToday ? 'Fished today' : 'Go fishing'}</button>
      <button class="btn open-btn" data-action="openShop">🏪 Open shop</button>
      <button class="btn alt" data-action="upgrades">🛠️ Upgrades</button>
      <button class="btn alt" data-action="dex">📖 Fishpedia</button></div>`;
  }

  function barAction(a, d) {
    if (a === 'mute') Snd.setMuted(!Snd.isMuted());
    if (a === 'help') showIntro();
    if (a === 'settings') openSettings();
    if (a === 'select') { Shop.select(Number(d.id)); Snd.sfx.click(); }
    if (a === 'deselect') Shop.deselect();
    if (a === 'sellCooler') { const v = Game.sellWholesale(Number(d.id)); Shop.deselect(); Snd.sfx.coin(); toast(`Sold to the wholesaler for <b>${fmt$(v)}</b>`); }
    if (a === 'fishing') openSpots();
    if (a === 'openShop') App.openShop();
    if (a === 'closeEarly') Shop.closeEarly();
    if (a === 'upgrades') openUpgrades();
    if (a === 'dex') openDex();
    if (a === 'endTrip') App.endTrip();
  }

  // ---- Fishing spots ----
  function openSpots() {
    open(() => {
      const s = Game.s;
      const full = s.cooler.length >= Game.coolerCap();
      let html = `<h2>🎣 Where to?</h2><p class="muted">${Game.rodName()} · ${Game.casts()} casts · cooler holds ${Game.coolerCap()} (${s.cooler.length} in it now)</p>`;
      if (full) html += `<p class="neg">🧊 Your cooler is full. Put some fish in tanks (or sell them) before you go.</p>`;
      for (const [k, sp] of Object.entries(SPOTS)) {
        const fish = Object.entries(SPECIES).filter(([, f]) => f.spot === k);
        const got = fish.filter(([fk]) => s.dex[fk]).length;
        const openSpot = Game.spotOpen(k);
        const icons = fish.map(([fk]) => s.dex[fk] ? Sprites.img(fk, 1) : Sprites.img(fk, 1, true)).join('');
        html += `<div class="card spot ${openSpot ? '' : 'locked'}"><div class="spot-head"><span class="em">${sp.icon}</span><div><b>${sp.name}</b> <span class="muted small">${got}/${fish.length} species</span><small>${sp.blurb}</small><div class="spot-fish">${icons}</div></div></div>
          ${openSpot ? (full ? '' : btn('Fish here', 'go', { spot: k })) : `<span class="lock">🔒 Needs ${UPGRADES[sp.need].icon} ${UPGRADES[sp.need].name}</span>`}</div>`;
      }
      return html;
    }, (a, d) => { if (a === 'go') { close(); App.goFishing(d.spot); } });
  }

  function showTripSummary(caught) {
    if (!caught.length) { toast('No fish this time. Better luck tomorrow!'); return; }
    open(() => `<h2>🧊 Back from fishing</h2><p>You caught:</p><ul class="fish-list">${caught.map((f) => `<li>${Sprites.img(f.sp, 2)}<span class="nm">${SPECIES[f.sp].name}<small>${needs(SPECIES[f.sp])}</small></span></li>`).join('')}</ul>
      <p class="muted">They're in the cooler. Tap a fish in the bar at the bottom, then tap a tank to put it in. Match each fish's needs to keep it happy: happy fish sell for more, and customers won't buy sad ones.</p>
      ${btn('To the shop', 'close', {}, null, 'big')}`);
  }

  // ---- Tanks ----
  function openBuyTank(i) {
    open(() => `<h2>🐠 New tank</h2><p>A small tank holds ${TANKS[0].cap} size units of fish (small fish 1, medium 2, large 4). You can make it bigger later.</p>${btn('Buy a small tank', 'buy', {}, TANKS[0].cost, 'big')}`,
      (a) => { if (a === 'buy' && Game.buyTank(i)) { Snd.sfx.buy(); close(); openTank(i); } });
  }

  function openTank(i) {
    open(() => {
      const tk = Game.s.tanks[i];
      if (!tk) return '';
      const T = TANKS[tk.size], locked = Shop.isOpen();
      const seg = (label, action, val, cur, allowed, why) =>
        `<button class="seg ${cur === val ? 'on' : ''}" data-action="${action}" data-v="${val}" ${allowed ? '' : 'disabled'} title="${allowed ? '' : why}">${label}${allowed ? '' : ' 🔒'}</button>`;
      let html = `<h2>🐠 Tank ${i + 1} <span class="muted">${T.name} · ${Game.used(tk)}/${T.cap} full</span></h2>`;
      if (tk.size < 2) html += `<p>${btn(`Upgrade to ${TANKS[tk.size + 1].name} (holds ${TANKS[tk.size + 1].cap})`, 'grow', {}, TANKS[tk.size + 1].cost, 'wide')}</p>`;
      html += `<div class="card"><div class="opt-row"><span>Water</span><div class="segs">${seg(WATER_LABEL.fresh, 'water', 'fresh', tk.water, true)}${seg(WATER_LABEL.salt, 'water', 'salt', tk.water, Game.saltAllowed(), 'Buy the Saltwater Kit')}</div></div>
        <div class="opt-row"><span>Temperature</span><div class="segs">${TEMPS.map((tp) => seg(TEMP_LABEL[tp], 'temp', tp, tk.temp, Game.tempAllowed(tp), tp === 'cold' ? 'Buy Tank Chillers' : 'Buy Tank Heaters')).join('')}</div></div>
        <p class="muted small">Heated or chilled tanks cost ${fmt$(POWER_COST)} a night in power.</p>
        <div class="opt-row"><span>Decor</span><div class="segs">${Object.entries(DECOR).map(([k, d]) => tk.decor[k] ? `<span class="have">${d.icon} ${d.name} ✓</span>` : d.salt && tk.water !== 'salt' ? '' : btn(`${d.icon} ${d.name}`, 'decor', { k }, d.cost, 'small')).join('')}</div></div>
        <div class="opt-row"><span>Clean water</span><div class="meter"><div style="width:${tk.clean}%;background:${tk.clean < 50 ? '#e0603a' : '#68c8e8'}"></div></div>${tk.clean < 100 ? btn('🧽 Clean', 'clean', {}, CLEAN_COST, 'small') : '<span class="have">Sparkling</span>'}</div></div>`;
      html += `<h3>Fish</h3>`;
      if (!tk.fish.length) html += `<p class="muted">No fish yet. ${Game.s.cooler.length ? 'Tap a fish in the cooler, then this tank.' : 'Go fishing to catch some!'}</p>`;
      html += `<ul class="fish-list">`;
      for (const f of tk.fish) {
        const m = Game.mood(f, tk), sp = SPECIES[f.sp];
        html += `<li>${Sprites.img(f.sp, 2)}<span class="nm">${sp.name} ${heartsHtml(m.h)}${f.hp < 3 ? ` <span class="neg small">sick ${'🤒'.repeat(3 - f.hp)}</span>` : ''}
          <small>${m.issues.length ? `<span class="${m.lethal ? 'neg' : 'warn'}">${m.issues.join(' · ')}</span>` : '<span class="pos">Happy!</span>'} · sells for ~${fmt$(Game.price(f, tk))}</small></span>
          ${locked ? '' : btn('To cooler', 'cool', { id: f.id }, null, 'small') + btn(`Sell ${fmt$(Game.wholesale(f))}`, 'sell', { id: f.id }, null, 'small')}</li>`;
      }
      html += `</ul>`;
      if (tk.fish.length) html += `<p class="muted small">Customers today only buy fish with at least ${heartsHtml(minHappy(Game.s.day))}. Unhappy fish get sick overnight and can die. Selling here goes to the wholesaler at a low price.</p>`;
      return html;
    }, (a, d) => {
      if (a === 'grow' && Game.upgradeTank(i)) Snd.sfx.buy();
      if (a === 'water') Game.setWater(i, d.v);
      if (a === 'temp') Game.setTemp(i, d.v);
      if (a === 'decor' && Game.addDecor(i, d.k)) Snd.sfx.buy();
      if (a === 'clean' && Game.cleanTank(i)) Snd.sfx.buy();
      if (a === 'cool') Game.toCooler(Number(d.id));
      if (a === 'sell') { Game.sellWholesale(Number(d.id)); Snd.sfx.coin(); }
    });
  }

  // ---- Upgrades ----
  function openUpgrades() {
    let tab = 'Fishing';
    open(() => {
      const s = Game.s;
      let html = `<h2>🛠️ Upgrades</h2><p class="wallet">💰 ${fmt$(s.money)}</p><div class="tabs">${['Fishing', 'Travel', 'Shop'].map((c) => `<button class="seg ${c === tab ? 'on' : ''}" data-action="tab" data-c="${c}">${c}</button>`).join('')}</div>`;
      for (const [k, u] of Object.entries(UPGRADES)) {
        if (u.cat !== tab) continue;
        const l = s.up[k], max = u.levels.length, cost = Game.upgradeCost(k), missing = Game.upgradeMissing(k);
        const title = k === 'rod' ? `${UPGRADES.rod.names[l]}` : u.name;
        let action;
        if (cost === null) action = '<span class="maxed">MAX</span>';
        else if (missing) action = `<span class="lock">🔒 Needs ${missing}</span>`;
        else action = btn(k === 'rod' ? `→ ${UPGRADES.rod.names[l + 1]}` : max > 1 ? `Level ${l + 1}` : 'Buy', 'buy', { k }, cost);
        html += `<div class="card upgrade"><span class="em">${u.icon}</span><div class="up-info"><b>${title}</b>${max > 1 ? ` <span class="muted small">${l}/${max}</span>` : l ? ' <span class="pos small">owned</span>' : ''}<small>${u.desc(l)}</small></div>${action}</div>`;
      }
      return html;
    }, (a, d) => {
      if (a === 'tab') tab = d.c;
      if (a === 'buy' && Game.buyUpgrade(d.k)) {
        Snd.sfx.buy();
        toast(`${UPGRADES[d.k].icon} <b>${d.k === 'rod' ? Game.rodName() : UPGRADES[d.k].name}</b> bought!`);
        Analytics.track('upgrade', { k: d.k, level: Game.s.up[d.k], day: Game.s.day });
      }
    });
  }

  // ---- Fishpedia ----
  function openDex() {
    open(() => {
      const s = Game.s, total = Object.keys(SPECIES).length, got = Object.keys(s.dex).length;
      let html = `<h2>📖 Fishpedia <span class="muted">${got}/${total}</span></h2>`;
      for (const [k, spot] of Object.entries(SPOTS)) {
        html += `<h3>${spot.icon} ${spot.name}</h3><div class="dex">`;
        for (const [fk, sp] of Object.entries(SPECIES)) {
          if (sp.spot !== k) continue;
          const d = s.dex[fk], seen = s.seen[fk];
          html += `<div class="card dex-card ${d ? '' : 'unknown'}"><div class="dex-img">${Sprites.img(fk, 2, !d)}</div><div><b>${d || seen ? sp.name : '???'}</b>${sp.legendary ? ' <span class="legend">★ legendary</span>' : ''}
            <small>${d ? `Caught ${d.caught} · worth ~${fmt$(sp.value)} · ${sizeName(sp)}` : seen ? `Got away! Needs a ${Game.rodName(sp.rod)}.` : 'Not caught yet'}</small>
            ${d ? `<div class="tags">${needs(sp)}</div>` : seen ? `<small class="muted">Rod ${sp.rod}</small>` : ''}</div></div>`;
        }
        html += `</div>`;
      }
      return html;
    });
  }

  // ---- End of day ----
  function showDaySummary(r) {
    const s = Game.s;
    const group = (list) => { const m = {}; for (const x of list) m[x.sp] = (m[x.sp] || 0) + 1; return Object.entries(m).map(([sp, n]) => `<span class="chip">${Sprites.img(sp, 1)} ${SPECIES[sp].name}${n > 1 ? ' ×' + n : ''}</span>`).join(' '); };
    if (r.gameOver) {
      open(() => `<h2>🔒 Shop closed down</h2><p>You couldn't pay the rent two weeks running, so the landlord changed the locks.</p>
        <p>You lasted <b>${r.day} days</b>, sold <b>${s.stats.sold}</b> fish for <b>${fmt$(s.stats.earned)}</b>, and caught <b>${Object.keys(s.dex).length}</b> of ${Object.keys(SPECIES).length} species.</p>
        ${btn('Start a new shop', 'restart', {}, null, 'big')}`, (a) => { if (a === 'restart') { Game.reset(); Shop.resetSwim(); close(); showIntro(); } }, { noClose: true });
      Analytics.track('game_over', { day: r.day });
      return;
    }
    open(() => `<h2>🌙 End of day ${r.day}</h2>
      <div class="row"><span>Fish sold (${r.sales.length})</span><span class="pos">+${fmt$(r.revenue)}</span></div>
      ${r.sales.length ? `<p>${group(r.sales)}</p>` : '<p class="muted small">No sales today. Customers only buy happy fish, and the ones asking for a species leave if you don\'t have it.</p>'}
      ${r.cooler ? `<div class="row"><span>Cooler fish sold to the wholesaler (${r.cooler.n})</span><span class="pos">+${fmt$(r.cooler.money)}</span></div>` : ''}
      ${r.power ? `<div class="row"><span>Power for heaters and chillers</span><span class="neg">-${fmt$(r.power)}</span></div>` : ''}
      ${r.rent ? `<div class="row"><span>🏠 Weekly rent</span><span class="neg">-${fmt$(r.rent.amount)}</span></div>` : ''}
      <div class="row total"><span>Money</span><span class="${s.money < 0 ? 'neg' : ''}">${fmt$(s.money)}</span></div>
      <div class="row"><span>Reputation</span><span class="stars">${stars(s.rep)}</span></div>
      ${r.rent && r.rent.debt ? `<p class="neg">⚠️ You couldn't cover the rent and you're in debt. Get back above $0 before next week's rent or the shop closes down!</p>` : ''}
      ${r.deaths.length ? `<h3>💀 Lost overnight</h3>${r.deaths.map((x) => `<p class="small">${Sprites.img(x.sp, 1)} ${SPECIES[x.sp].name}: <span class="neg">${x.why}</span></p>`).join('')}` : ''}
      ${r.eaten.length ? `<h3>😱 Eaten!</h3>${r.eaten.map((x) => `<p class="small">The ${SPECIES[x.by].name} ate a ${SPECIES[x.sp].name}. Keep aggressive fish away from small ones.</p>`).join('')}` : ''}
      <p class="muted small">Next rent: ${fmt$(Game.rent())} ${Game.rentDueIn() === 1 ? 'tomorrow night' : `in ${Game.rentDueIn()} days`}. Customers now want fish with at least ${heartsHtml(minHappy(s.day))}.</p>
      ${btn(`☀️ Start day ${s.day}`, 'close', {}, null, 'big')}`, () => {}, { noClose: true });
  }

  // ---- Settings & help ----
  function openSettings() {
    open(() => `<h2>⚙️ Settings</h2>
      <div class="card"><b>Rhythm timing</b><small class="muted"> If hits feel early or late (often with Bluetooth headphones), nudge this. Positive = you tend to hit late.</small>
        <div class="opt-row"><button class="btn small" data-action="off" data-v="-10">−10ms</button><b>${Game.s.offsetMs > 0 ? '+' : ''}${Game.s.offsetMs} ms</b><button class="btn small" data-action="off" data-v="10">+10ms</button></div></div>
      <div class="card"><b>Start over</b><small class="muted"> Erase this shop and start again from day 1.</small><p>${btn('♻️ New game', 'reset', {}, null, 'small')}</p></div>`,
    (a, d) => {
      if (a === 'off') { Game.s.offsetMs = clamp(Game.s.offsetMs + Number(d.v), -300, 300); Game.save(); }
      if (a === 'reset' && confirm('Start a brand new shop? Your progress will be erased.')) { Game.reset(); Shop.resetSwim(); close(); showIntro(); }
    });
  }

  function showIntro() {
    open(() => `<h2>🎣 Welcome to Reel Rhythm!</h2>
      <p>You've opened a little aquarium shop with two empty tanks. Catch fish, keep them happy, and sell them.</p>
      <ol>
        <li><b>Go fishing.</b> Cast, wait for the bobber to dive, then ${isTouch ? 'tap' : 'press Space'} to hook the fish.</li>
        <li><b>Reel it in to the beat.</b> Notes slide toward the ring: ${isTouch ? 'tap' : 'press Space'} as each one reaches it. Hold for long notes. Some fish need two hands: ${isTouch ? 'tap the left or right side of the screen' : 'F and J'}. Misses strain your line; too many and it snaps.</li>
        <li><b>Stock your tanks.</b> Every fish has needs: fresh or salt water, a temperature, tank size, decor, friends of its kind. Happy fish (♥) sell for more.</li>
        <li><b>Open the shop.</b> Customers browse your tanks and bring fish to the counter. ${isTouch ? 'Tap' : 'Click'} them to ring them up before they get bored.</li>
        <li><b>Upgrade.</b> Rent is due every 7 days and goes up each week. Stronger rods land bigger fish, boats reach new waters, and heaters, chillers and saltwater let you keep them.</li>
      </ol>
      ${btn('Let\'s fish!', 'ok', {}, null, 'big')}`, () => { Game.s.seenIntro = true; Game.save(); close(); }, { noClose: true });
  }

  return { init, refresh, isOpen, close, toast, openTank, openBuyTank, openSpots, showTripSummary, showDaySummary, showIntro };
})();
