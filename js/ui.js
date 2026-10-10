// Sidebar (shop / enclosure management) and modal dialogs.

const UI = (() => {
  let tab = 'zoo';
  let selectedPlot = -1;
  const $ = (id) => document.getElementById(id);

  function init() {
    document.querySelectorAll('.tabs button').forEach((b) => {
      b.addEventListener('click', () => { tab = b.dataset.tab; refresh(); });
    });
    // All shop buttons use data-action attributes; one delegated listener handles them.
    document.getElementById('sidebar').addEventListener('click', (e) => {
      const el = e.target.closest('[data-action]');
      if (!el || el.disabled) return;
      Sfx.ensure();
      handle(el.dataset.action, el.dataset);
      refresh();
    });
    $('modal').addEventListener('click', (e) => {
      const el = e.target.closest('[data-action]');
      if (!el) return;
      Sfx.ensure();
      handleModal(el.dataset.action);
    });
  }

  function handle(action, d) {
    switch (action) {
      case 'upgrade': Game.buyUpgrade(d.key); break;
      case 'amenity': Game.buyAmenity(d.key); break;
      case 'land': Game.buyLand(); break;
      case 'build': Game.buildEnclosure(selectedPlot, d.biome); break;
      case 'expand': Game.expandEnclosure(selectedPlot); break;
      case 'sell': Game.sellAnimal(selectedPlot, Number(d.id)); break;
      case 'deselect': Zoo.select(-1); break;
      case 'mute': Sfx.muted = !Sfx.muted; break;
      case 'reset':
        if (confirm('Start a brand new zoo? Your progress will be erased.')) { Game.reset(); Zoo.select(-1); showIntro(); }
        break;
      case 'safari': App.startSafari(); break;
    }
  }

  let modalHandler = null;
  function handleModal(action) {
    if (modalHandler) modalHandler(action);
  }

  function showModal(html, handler) {
    $('modal-box').innerHTML = html;
    $('modal').classList.remove('hidden');
    modalHandler = handler;
  }
  function hideModal() {
    $('modal').classList.add('hidden');
    modalHandler = null;
  }
  function isModalOpen() { return !$('modal').classList.contains('hidden'); }

  function onPlotSelected(i) {
    selectedPlot = i;
    if (i >= 0) tab = 'zoo';
    refresh();
  }

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

  function refresh() {
    const s = Game.s;
    const ap = Game.appeal();
    $('stat-money').textContent = fmtMoney(s.money);
    $('stat-day').textContent = s.day;
    $('stat-appeal').textContent = ap.total;
    $('stat-visitors').textContent = '~' + Game.expectedVisitors();
    document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    $('btn-mute').textContent = Sfx.muted ? '🔇' : '🔊';

    let html = '';
    if (tab === 'zoo') html = zooTab();
    else if (tab === 'garage') html = garageTab();
    else html = amenitiesTab();
    $('tab-content').innerHTML = html;
  }

  function zooTab() {
    const s = Game.s;
    let html = '';
    const i = selectedPlot;
    if (i >= 0) {
      const enc = s.plots[i].enclosure;
      html += `<div class="card selected-card">`;
      if (!Game.isPlotUnlocked(i)) {
        const cost = ECON.landCosts[s.landLevel];
        html += `<h3>🔒 Land for sale</h3><p>Buy the next row of land to unlock 4 more plots.</p>`;
        if (cost !== undefined) html += btn('Buy land', 'land', {}, cost, 'wide');
      } else if (!enc) {
        html += `<h3>Empty plot</h3><p>Build an enclosure. Animals only live in their own habitat.</p>`;
        for (const [k, b] of Object.entries(BIOMES)) {
          html += btn(`${b.icon} ${b.name} enclosure`, 'build', { biome: k }, b.buildCost, 'wide');
        }
      } else {
        const b = BIOMES[enc.biome];
        html += `<h3>${b.icon} ${b.name} enclosure <span class="muted">${enc.animals.length}/${enc.capacity}</span></h3>`;
        if (enc.capacity < ECON.maxCapacity) html += btn(`Expand (+${ECON.expandStep} space)`, 'expand', {}, Game.expandCost(enc), 'wide');
        else html += `<p class="muted">Maximum size reached.</p>`;
        if (!enc.animals.length) html += `<p class="muted">No animals yet. Catch some ${b.name.toLowerCase()} animals on safari!</p>`;
        html += `<ul class="animal-list">`;
        for (const a of enc.animals) {
          const d = SPECIES[a.sp];
          html += `<li><span class="em">${d.emoji}</span><span class="nm">${d.name}<small>⭐${d.appeal} · food ${fmtMoney(d.upkeep)}/day</small></span>${btn('Sell', 'sell', { id: a.id }, null, 'small')}<small class="sellv">${fmtMoney(d.appeal * ECON.sellMultiplier)}</small></li>`;
        }
        html += `</ul>`;
      }
      html += `<button class="link" data-action="deselect">close</button></div>`;
    } else {
      html += `<div class="card"><p>👆 Click a plot on the map to build or manage an enclosure.</p>`;
      const cost = ECON.landCosts[s.landLevel];
      if (cost !== undefined) html += btn('🗺️ Buy more land (+4 plots)', 'land', {}, cost, 'wide');
      html += `</div>`;
    }

    // Economy summary
    const ap = Game.appeal();
    const per = Game.spendPerVisitor();
    const perTotal = per.ticket + per.snack + per.gift;
    html += `<div class="card"><h3>📊 Tomorrow's forecast</h3>
      <div class="row"><span>Animal appeal</span><b>${ap.base}</b></div>
      <div class="row"><span>Variety bonus (${ap.unique} species)</span><b>×${ap.variety.toFixed(2)}</b></div>
      <div class="row"><span>Visitors</span><b>~${Game.expectedVisitors()}</b></div>
      <div class="row"><span>Spend per visitor</span><b>${fmtMoney(perTotal)}</b></div>
      <div class="row"><span>Animal food</span><b class="neg">-${fmtMoney(Game.dailyUpkeep())}</b></div>
    </div>`;

    // Field guide
    html += `<div class="card"><h3>📖 Field guide <span class="muted">${Object.keys(s.discovered).length}/${Object.keys(SPECIES).length}</span></h3>`;
    for (const [bk, b] of Object.entries(BIOMES)) {
      html += `<div class="guide-row"><span class="guide-biome">${b.icon}</span>`;
      for (const d of SPECIES_BY_BIOME[bk]) {
        const known = s.discovered[d.key];
        html += `<span class="guide-sp ${known ? '' : 'unknown'}" title="${known ? `${d.name} — appeal ${d.appeal}, needs ${d.hp} net${d.hp > 1 ? 's' : ''}` : '???'}">${d.emoji}</span>`;
      }
      html += `</div>`;
    }
    html += `<p class="muted small">Hover for details. Rarer animals live further from base camp's savanna — tundra is up north.</p></div>`;
    return html;
  }

  function garageTab() {
    const s = Game.s;
    const st = Game.jeepStats();
    let html = `<div class="card"><h3>🚙 Your jeep</h3>
      <div class="row"><span>Top speed</span><b>${st.maxSpeed}</b></div>
      <div class="row"><span>Fuel (seconds)</span><b>${st.fuelMax}</b></div>
      <div class="row"><span>Cargo space</span><b>${st.cargoMax}</b></div>
      <div class="row"><span>Net power</span><b>${st.netPower}</b></div>
      <div class="row"><span>Reload</span><b>${st.reload.toFixed(2)}s</b></div>
      <div class="row"><span>Net range</span><b>${st.netRange}</b></div></div>`;
    for (const [k, u] of Object.entries(UPGRADES)) {
      const lvl = s.upgrades[k];
      const maxed = lvl >= u.max;
      html += `<div class="card upgrade"><div class="up-head"><span class="em">${u.icon}</span><div><b>${u.name}</b>${pips(lvl, u.max)}<small>${u.desc}</small></div></div>
        ${maxed ? '<span class="maxed">MAX</span>' : btn('Upgrade', 'upgrade', { key: k }, upgradeCost(k, lvl))}</div>`;
    }
    return html;
  }

  function amenitiesTab() {
    const s = Game.s;
    let html = `<div class="card"><p>Amenities make each visitor worth more, or bring more of them in.</p></div>`;
    for (const [k, a] of Object.entries(AMENITIES)) {
      const lvl = s.amenities[k];
      const maxed = lvl >= a.costs.length;
      html += `<div class="card upgrade"><div class="up-head"><span class="em">${a.icon}</span><div><b>${a.name}</b>${pips(lvl, a.costs.length)}<small>${a.desc}</small></div></div>
        ${maxed ? '<span class="maxed">MAX</span>' : btn(lvl ? 'Upgrade' : 'Build', 'amenity', { key: k }, a.costs[lvl])}</div>`;
    }
    return html;
  }

  // ---- Modals ----

  function showIntro() {
    showModal(`
      <h2>🦁 Welcome to Safari Zoo!</h2>
      <p>You've just bought a tiny zoo with one empty savanna enclosure. Time to fill it!</p>
      <ol>
        <li><b>Go on Safari</b> — drive your jeep (WASD/arrows), aim with the mouse and click to fire nets.</li>
        <li><b>Drive into netted animals</b> to load them into your cargo cage before they wriggle free.</li>
        <li>Big animals need several nets. Some of them <b>fight back</b> 💢!</li>
        <li><b>Return to base camp</b> and press E before your fuel runs out (or pay for a tow).</li>
        <li>A day passes at the zoo: visitors pay to see your animals. Spend the money on <b>enclosures</b>, <b>amenities</b> and <b>jeep upgrades</b>.</li>
      </ol>
      <p class="muted">Animals go into a matching habitat. If there's no room, they're traded to another zoo for cash.</p>
      <button class="btn big" data-action="ok">Let's go!</button>`, () => {
      Game.s.seenIntro = true;
      Game.save();
      hideModal();
      refresh();
    });
  }

  function showReport(r) {
    const count = (arr) => {
      const m = {};
      for (const sp of arr) m[sp] = (m[sp] || 0) + 1;
      return Object.entries(m).map(([sp, n]) => `<span class="chip">${SPECIES[sp].emoji} ${SPECIES[sp].name}${n > 1 ? ' ×' + n : ''}</span>`).join(' ');
    };
    const L = r.lines;
    const line = (label, v) => (v ? `<div class="row"><span>${label}</span><b class="${v < 0 ? 'neg' : 'pos'}">${v < 0 ? '' : '+'}${fmtMoney(v)}</b></div>` : '');
    let caught = '';
    if (!r.placed.length && !r.traded.length) caught = `<p class="muted">You came back empty-handed this time.</p>`;
    if (r.placed.length) caught += `<p>New residents: ${count(r.placed)}</p>`;
    if (r.traded.length) caught += `<p>No room for: ${count(r.traded)} <br><small class="muted">Traded to another zoo. Build or expand ${[...new Set(r.traded.map((sp) => BIOMES[SPECIES[sp].biome].name))].join(' / ')} enclosures to keep them!</small></p>`;
    showModal(`
      <h2>🌅 End of Day ${r.day}</h2>
      ${r.towed ? '<p class="neg">🚚 Your jeep had to be towed home.</p>' : ''}
      <h3>🚙 Safari haul</h3>${caught}
      <h3>🎟️ At the zoo</h3>
      <p><b>${r.visitors}</b> visitors came to see your animals (appeal ${r.appeal}).</p>
      ${line('Tickets', L.tickets)}${line('Snack bar', L.snacks)}${line('Gift shop', L.gifts)}
      ${line('Animal trades', L.trades)}${line('Animal food', L.upkeep)}${line('Tow truck', L.tow)}
      <div class="row total"><span>Profit</span><b class="${r.net < 0 ? 'neg' : 'pos'}">${fmtMoney(r.net)}</b></div>
      <button class="btn big" data-action="ok">Back to the zoo</button>`, () => {
      hideModal();
      refresh();
    });
  }

  return { init, refresh, onPlotSelected, showIntro, showReport, isModalOpen };
})();
