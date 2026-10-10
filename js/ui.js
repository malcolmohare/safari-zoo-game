// The zoo's top bar and all the pop-up menus (opened by walking up to things).

const UI = (() => {
  const $ = (id) => document.getElementById(id);
  let menu = null;   // { render: () => html, onAction: (action, data) => void }

  function init() {
    document.getElementById('hud').addEventListener('click', (e) => {
      const el = e.target.closest('[data-action]');
      if (!el) return;
      Sfx.ensure();
      if (el.dataset.action === 'mute') Sfx.muted = !Sfx.muted;
      if (el.dataset.action === 'reset' && confirm('Start a brand new zoo? Your progress will be erased.')) {
        Game.reset();
        showIntro();
      }
      refresh();
    });
    $('modal').addEventListener('click', (e) => {
      const el = e.target.closest('[data-action]');
      if (!el || el.disabled || !menu) return;
      Sfx.ensure();
      if (el.dataset.action === 'close') { close(); return; }
      menu.onAction(el.dataset.action, el.dataset);
      if (menu) rerender();
      refresh();
    });
    window.addEventListener('keydown', (e) => {
      if (!isModalOpen()) return;
      if (e.code === 'Escape' || (e.code === 'KeyE' && menu && menu.closeOnE)) { close(); e.stopPropagation(); }
    }, true);
  }

  function open(render, onAction = () => {}, opts = {}) {
    menu = { render, onAction, ...opts };
    rerender();
    $('modal').classList.remove('hidden');
  }
  function rerender() { $('modal-box').innerHTML = menu.render() + (menu.noClose ? '' : `<button class="link close-x" data-action="close">✕ close (Esc)</button>`); }
  function close() {
    $('modal').classList.add('hidden');
    menu = null;
    refresh();
  }
  function isModalOpen() { return !$('modal').classList.contains('hidden'); }

  function refresh() {
    const s = Game.s;
    $('stat-money').textContent = fmtMoney(s.money);
    $('stat-day').textContent = s.day;
    $('stat-appeal').textContent = Game.appeal().total;
    $('stat-visitors').textContent = '~' + Game.expectedVisitors();
    $('stat-truck').textContent = s.holding.length + (s.carrying ? 1 : 0);
    $('btn-mute').textContent = Sfx.muted ? '🔇' : '🔊';
  }

  // ---- Small HTML helpers ----
  const btn = (label, action, data = {}, cost = null, extraClass = '') => {
    const attrs = Object.entries(data).map(([k, v]) => `data-${k}="${v}"`).join(' ');
    const afford = cost === null || Game.s.money >= cost;
    return `<button class="btn ${extraClass} ${afford ? '' : 'cant'}" data-action="${action}" ${attrs} ${afford ? '' : 'disabled'}>${label}${cost !== null ? ` <span class="cost">${fmtMoney(cost)}</span>` : ''}</button>`;
  };
  function pips(level, max) {
    let s = '';
    for (let i = 0; i < max; i++) s += `<span class="pip ${i < level ? 'on' : ''}"></span>`;
    return `<span class="pips">${s}</span>`;
  }
  const money = () => `<p class="wallet">💰 ${fmtMoney(Game.s.money)}</p>`;

  // ---- Menus ----

  function openGarage() {
    open(() => {
      const s = Game.s, st = Game.jeepStats();
      let html = `<h2>🔧 Garage</h2>${money()}
        <div class="card stats-grid">
          <div><small>Top speed</small><b>${st.maxSpeed}</b></div>
          <div><small>Fuel</small><b>${st.fuelMax}s</b></div>
          <div><small>Cargo</small><b>${st.cargoMax}</b></div>
          <div><small>Nets</small><b>${st.nets}</b></div>
          <div><small>Net power</small><b>${st.netPower.toFixed(2)}</b></div>
          <div><small>Reload</small><b>${st.reload.toFixed(2)}s</b></div>
        </div>`;
      for (const [k, u] of Object.entries(UPGRADES)) {
        const lvl = s.upgrades[k], maxed = lvl >= u.max;
        html += `<div class="card upgrade"><div class="up-head"><span class="em">${u.icon}</span><div><b>${u.name}</b>${pips(lvl, u.max)}<small>${u.desc}</small></div></div>
          ${maxed ? '<span class="maxed">MAX</span>' : btn('Upgrade', 'upgrade', { key: k }, upgradeCost(k, lvl))}</div>`;
      }
      return html;
    }, (action, d) => { if (action === 'upgrade') Game.buyUpgrade(d.key); });
  }

  function landCard() {
    const cost = Game.landCost();
    if (cost === undefined) return `<div class="card"><h3>🗺️ Land</h3><p class="muted">You own all the land there is!</p></div>`;
    return `<div class="card"><h3>🗺️ Land</h3><p>You own ${Game.ownedPlots()} of ${Game.s.plots.length} plots. To buy another, walk up to a 🪧 for-sale sign. The next plot costs <b>${fmtMoney(cost)}</b>, and each one after that costs more.</p></div>`;
  }

  function openLand(plotIdx) {
    open(() => `<h2>🪧 Plot for sale</h2>${money()}<p>Buy this plot to build another enclosure on it. Each plot you buy makes the next one more expensive.</p>${btn('Buy this plot', 'buy', {}, Game.landCost(), 'wide')}`, (action) => {
      if (action === 'buy' && Game.buyPlot(plotIdx)) close();
    });
  }

  function openOffice() {
    open(() => {
      const s = Game.s;
      const ap = Game.appeal();
      const per = Game.spendPerVisitor();
      let html = `<h2>🏢 Office</h2>${money()}
        <div class="card"><h3>📊 Tomorrow's forecast</h3>
          <div class="row"><span>Animal appeal</span><b>${ap.base}</b></div>
          <div class="row"><span>Variety bonus (${ap.unique} species)</span><b>×${ap.variety.toFixed(2)}</b></div>
          <div class="row"><span>Visitors</span><b>~${Game.expectedVisitors()}</b></div>
          <div class="row"><span>Spend per visitor</span><b>${fmtMoney(per.ticket + per.snack + per.gift)}</b></div>
          <div class="row"><span>Animal food</span><b class="neg">-${fmtMoney(Game.dailyUpkeep())}</b></div>
          <p class="muted small">Only animals in enclosures count — not ones waiting in the truck.</p>
        </div>`;
      html += landCard();
      html += `<h3>🍿 Amenities</h3>`;
      for (const [k, a] of Object.entries(AMENITIES)) {
        const lvl = s.amenities[k], maxed = lvl >= a.costs.length;
        html += `<div class="card upgrade"><div class="up-head"><span class="em">${a.icon}</span><div><b>${a.name}</b>${pips(lvl, a.costs.length)}<small>${a.desc}</small></div></div>
          ${maxed ? '<span class="maxed">MAX</span>' : btn(lvl ? 'Upgrade' : 'Build', 'amenity', { key: k }, a.costs[lvl])}</div>`;
      }
      html += fieldGuide();
      return html;
    }, (action, d) => {
      if (action === 'amenity') Game.buyAmenity(d.key);
    });
  }

  function fieldGuide() {
    const s = Game.s;
    let html = `<div class="card"><h3>📖 Field guide <span class="muted">${Object.keys(s.discovered).length}/${Object.keys(SPECIES).length} species</span></h3>
      <p class="muted small">Regions get further from base camp as you go down the list. Further regions have more valuable animals.</p>`;
    REGION_ORDER.forEach((bk, k) => {
      const b = BIOMES[bk];
      const visited = s.regionsVisited[bk];
      html += `<div class="guide-region"><div class="guide-name">${visited ? `${b.icon} ${b.name}` : '❔ Unexplored'} <span class="muted small">${k === 0 ? 'around base camp' : `region ${k + 1}`}</span></div><div class="guide-row">`;
      for (const d of SPECIES_BY_BIOME[bk]) {
        const known = s.discovered[d.key];
        const tip = known ? `${d.name} — appeal ${d.appeal}, net power needed ${d.hp}${d.behavior === 'aggressive' ? ', dangerous!' : ''}` : '???';
        html += `<span class="guide-sp ${known ? '' : 'unknown'}" title="${tip}">${visited || known ? d.emoji : '❔'}</span>`;
      }
      html += `</div></div>`;
    });
    return html + `</div>`;
  }

  function openBuild(plotIdx) {
    open(() => {
      let html = `<h2>🏗️ Build an enclosure</h2>${money()}<p>Animals can only live in an enclosure that matches their home region.</p>`;
      for (const k of REGION_ORDER) {
        const b = BIOMES[k];
        html += btn(`${b.icon} ${b.name} enclosure`, 'build', { biome: k }, b.buildCost, 'wide');
      }
      return html;
    }, (action, d) => {
      if (action === 'build' && Game.buildEnclosure(plotIdx, d.biome)) close();
    });
  }

  function openEnclosure(plotIdx) {
    open(() => {
      const enc = Game.s.plots[plotIdx].enclosure;
      const b = BIOMES[enc.biome];
      let html = `<h2>${b.icon} ${b.name} enclosure <span class="muted">${enc.animals.length}/${enc.capacity}</span></h2>${money()}`;
      if (enc.capacity < ECON.maxCapacity) html += btn(`Expand (+${ECON.expandStep} space)`, 'expand', {}, Game.expandCost(enc), 'wide');
      else html += `<p class="muted">Maximum size reached.</p>`;
      if (!enc.animals.length) html += `<p class="muted">No animals yet. Catch ${b.name.toLowerCase()} animals on safari and carry them here from the truck.</p>`;
      html += `<ul class="animal-list">`;
      for (const a of enc.animals) {
        const d = SPECIES[a.sp];
        html += `<li><span class="em">${d.emoji}</span><span class="nm">${d.name}<small>⭐${d.appeal} · food ${fmtMoney(d.upkeep)}/day</small></span>${btn(`Sell ${fmtMoney(d.appeal * ECON.sellMultiplier)}`, 'sell', { id: a.id }, null, 'small')}</li>`;
      }
      return html + `</ul>`;
    }, (action, d) => {
      if (action === 'expand') Game.expandEnclosure(plotIdx);
      if (action === 'sell') Game.sellAnimal(plotIdx, Number(d.id));
    });
  }

  function openTruck() {
    open(() => {
      const s = Game.s;
      let html = `<h2>🚚 Animal Truck</h2><p>Pick an animal to carry, then walk it to a matching enclosure. Enclosures that can take it will glow.</p><ul class="animal-list">`;
      for (const a of s.holding) {
        const d = SPECIES[a.sp], b = BIOMES[d.biome];
        const room = s.plots.some((p) => p.enclosure && p.enclosure.biome === d.biome && p.enclosure.animals.length < p.enclosure.capacity);
        html += `<li><span class="em">${d.emoji}</span><span class="nm">${d.name}<small>${b.icon} ${b.name} · ⭐${d.appeal}${room ? '' : ' · <span class="neg">no space yet</span>'}</small></span>
          ${btn('Carry', 'carry', { id: a.id }, null, 'small')} ${btn(`Sell ${fmtMoney(d.appeal * ECON.sellMultiplier)}`, 'sellh', { id: a.id }, null, 'small')}</li>`;
      }
      if (!s.holding.length) html += `<li class="muted">Empty.</li>`;
      return html + `</ul>`;
    }, (action, d) => {
      if (action === 'carry' && Game.carryFromHolding(Number(d.id))) { Sfx.hit(); close(); }
      if (action === 'sellh') { Game.sellFromHolding(Number(d.id)); if (!Game.s.holding.length) close(); }
    });
  }

  function openSafariConfirm() {
    open(() => {
      const s = Game.s, st = Game.jeepStats();
      const waiting = s.holding.length + (s.carrying ? 1 : 0);
      return `<h2>🚙 Head out on safari?</h2>
        <p>The zoo stays open while you're away. You'll earn money from the animals that are <b>in enclosures</b> when you leave.</p>
        ${waiting ? `<p class="neg">⚠️ ${waiting} animal${waiting > 1 ? 's are' : ' is'} still in the truck and won't earn anything today.</p>` : ''}
        <div class="card stats-grid">
          <div><small>Fuel</small><b>${st.fuelMax}s</b></div><div><small>Nets</small><b>${st.nets}</b></div><div><small>Cargo</small><b>${st.cargoMax}</b></div>
        </div>
        ${btn('🚙 Let\'s go!', 'go', {}, null, 'big')}`;
    }, (action) => {
      if (action === 'go') { close(); App.startSafari(); }
    });
  }

  function showIntro() {
    open(() => `
      <h2>🦁 Welcome to Safari Zoo!</h2>
      <p>You've just bought a tiny zoo with one empty savanna enclosure. Time to fill it!</p>
      <ol>
        ${TouchControls.enabled
          ? `<li>Drag your thumb to walk your zookeeper to the <b>🚙 jeep</b>, then tap <b>✋</b> to go on safari.</li>
        <li>On safari, drag on the left side of the screen to drive and hold <b>🕸️</b> to fire a net straight out of the front of the jeep. You only have a few nets, but missed ones can be picked back up.</li>`
          : `<li>Walk your zookeeper (WASD / arrows) to the <b>🚙 jeep</b> and press <b>E</b> to go on safari.</li>
        <li>Drive with WASD and press Space to fire a net straight out of the front of the jeep. You only have a few nets, but missed ones can be picked back up.</li>`}
        <li>Drive into netted animals to load them, then return to base camp and ${TouchControls.enabled ? 'tap 🏁' : 'press E'} before your fuel runs out.</li>
        <li>Back home, your catch waits in the <b>🚚 truck</b>. Carry each animal to an enclosure that matches its home region.</li>
        <li>Visitors pay to see animals in your enclosures. Spend money at the <b>🔧 Garage</b> and <b>🏢 Office</b>, and walk up to 🪧 for-sale signs to buy more plots.</li>
      </ol>
      <p class="muted">The wild has five regions, each further north than the last: Savanna → Wetlands → Jungle → Desert → Tundra. Further regions have more valuable animals but need a faster jeep and more fuel to reach.</p>
      ${btn('Let\'s go!', 'ok', {}, null, 'big')}`, () => {
      Game.s.seenIntro = true;
      Game.save();
      close();
    }, { noClose: true });
  }

  function showReport(r) {
    const chips = (arr) => {
      const m = {};
      for (const sp of arr) m[sp] = (m[sp] || 0) + 1;
      return Object.entries(m).map(([sp, n]) => `<span class="chip">${SPECIES[sp].emoji} ${SPECIES[sp].name}${n > 1 ? ' ×' + n : ''}</span>`).join(' ');
    };
    const L = r.lines;
    const line = (label, v) => (v ? `<div class="row"><span>${label}</span><b class="${v < 0 ? 'neg' : 'pos'}">${v < 0 ? '' : '+'}${fmtMoney(v)}</b></div>` : '');
    open(() => `
      <h2>🌅 End of Day ${r.day}</h2>
      ${r.towed ? '<p class="neg">🚚 Your jeep had to be towed home.</p>' : ''}
      ${r.newRegions.length ? `<p>🗺️ New region${r.newRegions.length > 1 ? 's' : ''} explored: ${r.newRegions.map((b) => `<span class="chip">${BIOMES[b].icon} ${BIOMES[b].name}</span>`).join(' ')}</p>` : ''}
      <h3>🚙 Safari haul</h3>
      ${r.caught.length ? `<p>${chips(r.caught)}</p><p class="muted">They're waiting in the 🚚 truck. Carry them to their enclosures!</p>` : '<p class="muted">You came back empty-handed this time.</p>'}
      ${r.newSpecies.length ? `<p>📖 New in your field guide: ${chips(r.newSpecies)}</p>` : ''}
      <h3>🎟️ While you were out</h3>
      <p><b>${r.visitors}</b> visitors came to the zoo.</p>
      ${line('Tickets', L.tickets)}${line('Snack bar', L.snacks)}${line('Gift shop', L.gifts)}
      ${line('Animal food', L.upkeep)}${line('Tow truck', L.tow)}
      <div class="row total"><span>Profit</span><b class="${r.net < 0 ? 'neg' : 'pos'}">${fmtMoney(r.net)}</b></div>
      ${btn('Back to the zoo', 'ok', {}, null, 'big')}`, () => close(), { closeOnE: true });
  }

  return {
    init, refresh, isModalOpen, close,
    openGarage, openOffice, openLand, openBuild, openEnclosure, openTruck, openSafariConfirm,
    showIntro, showReport,
  };
})();
