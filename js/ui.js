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
  // Pop-up notification (stacked at the top of the screen, fades out on its own).
  function notify(icon, title, detail = '') {
    const box = $('toasts');
    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = `<span class="t-icon">${icon}</span><div><b>${title}</b>${detail ? `<small>${detail}</small>` : ''}</div>`;
    box.appendChild(el);
    while (box.children.length > 4) box.firstChild.remove();
    Sfx.upgrade();
    setTimeout(() => el.classList.add('out'), 2600);
    setTimeout(() => el.remove(), 3100);
  }

  function isModalOpen() { return !$('modal').classList.contains('hidden'); }

  function refresh() {
    const s = Game.s;
    $('stat-money').textContent = fmtMoney(s.money);
    $('stat-day').textContent = s.day;
    $('stat-collection').textContent = `${Game.exhibitedSpecies().size}/${Object.keys(SPECIES).length}`;
    const next = Game.nextTierInfo();
    $('stat-tier').textContent = next ? `${s.tier} (next: ${next.need})` : `${s.tier} (max)`;
    $('stat-truck').textContent = s.holding.length + (s.carrying ? 1 : 0);
    // Resources you've found so far (hidden until you've visited their region or own some).
    $('stat-res').innerHTML = Object.entries(RESOURCES)
      .filter(([k, r]) => s.resources[k] > 0 || s.regionsVisited[r.biome])
      .map(([k, r]) => `<span title="${r.name}">${r.emoji} ${s.resources[k]}</span>`).join(' ');
    $('btn-mute').textContent = Sfx.muted ? '🔇' : '🔊';
  }

  // ---- Small HTML helpers ----
  // cost: null, a money amount, or { money, res: { resourceKey: amount } }
  const btn = (label, action, data = {}, cost = null, extraClass = '') => {
    const attrs = Object.entries(data).map(([k, v]) => `data-${k}="${v}"`).join(' ');
    const afford = cost === null || Game.canAfford(cost);
    return `<button class="btn ${extraClass} ${afford ? '' : 'cant'}" data-action="${action}" ${attrs} ${afford ? '' : 'disabled'}>${label}${cost !== null ? ` <span class="cost">${costText(cost)}</span>` : ''}</button>`;
  };
  function costText(cost) {
    if (typeof cost === 'number') return fmtMoney(cost);
    const parts = [];
    if (cost.money) parts.push(fmtMoney(cost.money));
    for (const [k, v] of Object.entries(cost.res || {})) {
      const short = Game.s.resources[k] < v;
      parts.push(`<span class="${short ? 'short' : ''}">${v}${RESOURCES[k].emoji}</span>`);
    }
    return parts.join(' · ');
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
      html += tierCard();
      for (const [k, perk] of Object.entries(PERKS)) {
        const owned = s.perks[k];
        html += `<div class="card upgrade perk"><div class="up-head"><span class="em">${perk.icon}</span><div class="up-info"><b>${perk.name}</b> <span class="muted small">perk</span><small>${perk.desc}</small></div></div>
          ${owned ? '<span class="maxed">OWNED</span>' : btn('Buy', 'perk', { key: k }, perk.cost)}</div>`;
      }
      for (const [k, u] of Object.entries(UPGRADES)) {
        const lvl = s.upgrades[k], cap = upgradeCap(k, s.tier);
        let action;
        if (lvl >= u.levels) action = '<span class="maxed">MAX</span>';
        else if (lvl >= cap) action = `<span class="locked">🔒 Tier ${s.tier + 1}<br>for more</span>`;
        else {
          const cost = upgradeFullCost(k, lvl);
          let cost5 = { money: 0, res: {} };
          for (let l = lvl; l < lvl + 5; l++) cost5 = addCosts(cost5, upgradeFullCost(k, l));
          action = `<div class="up-btns">${btn('+1', 'upgrade', { key: k }, cost)}${cap - lvl >= 5 ? btn('+5', 'upgrade5', { key: k }, cost5, 'small') : ''}</div>`;
        }
        html += `<div class="card upgrade"><div class="up-head"><span class="em">${u.icon}</span><div class="up-info">
            <b>${u.name}</b> <span class="muted small">Lv ${lvl}/${u.levels}</span>
            <div class="lvlbar"><div class="fill" style="width:${lvl / u.levels * 100}%"></div><div class="cap" style="left:${cap / u.levels * 100}%"></div></div>
            <small>${statLine(k, st)} · each level: ${u.per}</small></div></div>${action}</div>`;
      }
      return html;
    }, (action, d) => {
      if (action === 'upgrade' || action === 'upgrade5') {
        const u = UPGRADES[d.key], before = statLine(d.key, Game.jeepStats()), lvl0 = Game.s.upgrades[d.key];
        for (let i = 0; i < (action === 'upgrade5' ? 5 : 1); i++) if (!Game.buyUpgrade(d.key)) break;
        const lvl = Game.s.upgrades[d.key];
        if (lvl > lvl0) {
          const after = statLine(d.key, Game.jeepStats());
          notify(u.icon, `${u.name} Lv ${lvl}${lvl - lvl0 > 1 ? ` (+${lvl - lvl0})` : ''}`, `${after.replace('Now: ', '')} <span class="was">(was ${before.replace('Now: ', '')})</span>`);
        }
      }
      if (action === 'perk' && Game.buyPerk(d.key)) notify(PERKS[d.key].icon, `${PERKS[d.key].name} unlocked!`, PERKS[d.key].desc);
    });
  }

  // Current value of the stat an upgrade improves.
  function statLine(k, st) {
    switch (k) {
      case 'engine': return `Now: ${st.maxSpeed} top speed`;
      case 'fuel': return `Now: ${st.fuelMax.toFixed(1)}s`;
      case 'tires': return `Now: ${Math.round(st.terrainGrip * 100)}% less slowdown`;
      case 'cargo': return `Now: ${st.cargoMax} animals`;
      case 'netCount': return `Now: ${st.nets} nets`;
      case 'netStrength': return `Now: ${st.netPower.toFixed(2)} power`;
      case 'reload': return `Now: ${st.reload.toFixed(2)}s reload`;
      case 'netRange': return `Now: ${Math.round(st.netRange)} range`;
      case 'armor': return `Now: ${st.hpMax} max health`;
      case 'autoAim': return st.aimCone > 0 ? `Now: ±${Math.round(st.aimCone * 180 / Math.PI)}° cone${st.autoFire ? ' + auto-fire' : ''}` : 'Not installed';
    }
    return '';
  }

  function landCard() {
    const cost = Game.landCost();
    if (cost === undefined) return `<div class="card"><h3>🗺️ Land</h3><p class="muted">You own all the land there is!</p></div>`;
    return `<div class="card"><h3>🗺️ Land</h3><p>You own ${Game.ownedPlots()} of ${Game.s.plots.length} plots. To buy another, walk up to a 🪧 for-sale sign. The next plot costs <b>${costLabel(cost)}</b>, and each one after that costs more (and needs resources from further regions).</p></div>`;
  }

  function openLand(plotIdx) {
    open(() => `<h2>🪧 Plot for sale</h2>${money()}<p>Buy this plot to build another enclosure on it. Plots cost money plus resources gathered on safari, and each one costs more than the last.</p>${btn('Buy this plot', 'buy', {}, Game.landCost(), 'wide')}`, (action) => {
      if (action === 'buy' && Game.buyPlot(plotIdx)) { notify('🪧', 'New plot bought!', 'Walk up to it to build an enclosure.'); close(); }
    });
  }

  // Collection progress and what it unlocks.
  function tierCard() {
    const s = Game.s, have = Game.exhibitedSpecies().size, next = Game.nextTierInfo();
    let html = `<div class="card"><h3>🏆 Upgrade tier ${s.tier} of ${TIERS.length}</h3>
      <p>You have <b>${have}</b> of ${Object.keys(SPECIES).length} species on display.</p>`;
    if (next) {
      const prev = TIERS[s.tier - 1].species;
      const pct = clamp((have - prev) / (next.need - prev), 0, 1) * 100;
      html += `<div class="progress"><div style="width:${pct}%"></div></div>
        <p class="muted small">Display <b>${next.need}</b> different species in your enclosures to reach tier ${next.tier}: more upgrade levels, plus a permit to explore the <b>${BIOMES[REGION_ORDER[next.tier - 1]].icon} ${BIOMES[REGION_ORDER[next.tier - 1]].name}</b>.</p>`;
    } else html += `<p class="muted small">Every tier is unlocked!</p>`;
    return html + `</div>`;
  }

  function openOffice() {
    open(() => `<h2>🏢 Office</h2>${money()}${tierCard()}${landCard()}${fieldGuide()}`);
  }

  function fieldGuide() {
    const s = Game.s, exhibited = Game.exhibitedSpecies();
    let html = `<div class="card"><h3>📖 Field guide <span class="muted">${Object.keys(s.discovered).length}/${Object.keys(SPECIES).length} species</span></h3>
      <p class="muted small">Regions get further from base camp as you go down the list, and their animals are worth far more. Species with a gold ring are on display in your zoo.</p>`;
    REGION_ORDER.forEach((bk, k) => {
      const b = BIOMES[bk];
      const visited = s.regionsVisited[bk];
      html += `<div class="guide-region"><div class="guide-name">${visited ? `${b.icon} ${b.name}` : '❔ Unexplored'} <span class="muted small">${k === 0 ? 'around base camp' : s.tier > k ? `region ${k + 1}` : `🔒 needs tier ${k + 1} permit`}</span></div><div class="guide-row">`;
      for (const d of SPECIES_BY_BIOME[bk]) {
        const known = s.discovered[d.key];
        const tip = known ? `${d.name} — sells for ${fmtMoney(d.value)}, net power needed ${d.hp}${d.behavior === 'aggressive' ? ', dangerous!' : ''}` : '???';
        const shown = exhibited.has(d.key);
        html += `<span class="guide-sp ${known ? '' : 'unknown'} ${shown ? 'shown' : ''}" title="${tip}">${visited || known ? animalImg(d.key) : '❔'}</span>`;
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
        html += btn(`${b.icon} ${b.name} enclosure`, 'build', { biome: k }, Game.buildCost(k), 'wide');
      }
      return html;
    }, (action, d) => {
      if (action === 'build' && Game.buildEnclosure(plotIdx, d.biome)) {
        notify(BIOMES[d.biome].icon, `${BIOMES[d.biome].name} enclosure built!`, `Room for ${ECON.startCapacity} animals.`);
        close();
      }
    });
  }

  function openEnclosure(plotIdx) {
    open(() => {
      const enc = Game.s.plots[plotIdx].enclosure;
      const b = BIOMES[enc.biome];
      let html = `<h2>${b.icon} ${b.name} enclosure <span class="muted">${enc.animals.length}/${enc.capacity}</span></h2>${money()}`;
      const g = Game.encGrowth(enc);
      html += `<div class="card"><div class="row"><span>💰 Animal value growth</span><b>+${Math.round(g.perMin * 100)}%/min, up to ×${g.cap.toFixed(2).replace(/\.?0+$/, '')}</b></div>`;
      if (enc.capacity < ECON.maxCapacity) {
        const ng = { perMin: g.perMin + ECON.valueGrowthPerMin * ECON.expandGrowthBonus, cap: g.cap + ECON.expandCapBonus };
        html += `<p class="muted small">Expanding makes animals here gain value faster (+${Math.round(ng.perMin * 100)}%/min) and higher (up to ×${ng.cap.toFixed(2).replace(/\.?0+$/, '')}).</p></div>`;
        html += btn(`Expand (+${ECON.expandStep} space, faster value, decorations)`, 'expand', {}, Game.expandCost(enc), 'wide');
      } else html += `<p class="muted small">Maximum size reached.</p></div>`;
      if (!enc.animals.length) html += `<p class="muted">No animals yet. Catch ${b.name.toLowerCase()} animals on safari and carry them here from the truck.</p>`;
      html += `<ul class="animal-list">`;
      for (const a of enc.animals) {
        const d = SPECIES[a.sp];
        const onlyOne = Game.allAnimals().filter((x) => x.sp === a.sp).length === 1;
        const mult = Game.valueMult(a);
        const growth = mult >= g.cap - 0.001 ? `💰 ×${mult.toFixed(2)} (max for this pen)` : `💰 ×${mult.toFixed(2)} and rising`;
        html += `<li><span class="em">${animalImg(d.key)}</span><span class="nm">${d.name}<small>${onlyOne ? '🏆 only one on display' : 'duplicate'} · ${growth}</small></span>${btn(`Sell ${fmtMoney(Game.animalValue(a))}`, 'sell', { id: a.id }, null, 'small')}</li>`;
      }
      return html + `</ul>`;
    }, (action, d) => {
      if (action === 'expand' && Game.expandEnclosure(plotIdx)) {
        const enc = Game.s.plots[plotIdx].enclosure, g = Game.encGrowth(enc);
        notify(BIOMES[enc.biome].icon, `${BIOMES[enc.biome].name} enclosure expanded!`,
          `${enc.capacity} spaces · animal value +${Math.round(g.perMin * 100)}%/min, up to ×${g.cap.toFixed(2).replace(/\.?0+$/, '')} · new decorations`);
      }
      if (action === 'sell') { Game.sellAnimal(plotIdx, Number(d.id)); }
    });
  }

  function openTruck() {
    open(() => {
      const s = Game.s;
      const exhibited = Game.exhibitedSpecies();
      let html = `<h2>🚚 Animal Truck</h2>${money()}<p>Sell animals for money, or carry a new species to a matching enclosure to grow your collection and unlock upgrade tiers.</p><ul class="animal-list">`;
      for (const a of s.holding) {
        const d = SPECIES[a.sp], b = BIOMES[d.biome];
        const room = s.plots.some((p) => p.enclosure && p.enclosure.biome === d.biome && p.enclosure.animals.length < p.enclosure.capacity);
        const isNew = !exhibited.has(a.sp);
        const note = isNew ? '<span class="pos">🏆 new for your collection!</span>' : 'already on display';
        html += `<li><span class="em">${animalImg(d.key)}</span><span class="nm">${d.name}<small>${b.icon} ${b.name} · ${note}${isNew && !room ? ' · <span class="neg">needs a ' + b.name + ' enclosure with space</span>' : ''}</small></span>
          ${btn('Carry', 'carry', { id: a.id }, null, 'small')} ${btn(`Sell ${fmtMoney(d.value)}`, 'sellh', { id: a.id }, null, 'small')}</li>`;
      }
      const dupes = s.holding.filter((a) => exhibited.has(a.sp));
      if (dupes.length > 1) html += `</ul>${btn(`Sell all ${dupes.length} already on display`, 'selldupes', {}, null, 'wide')}<ul class="animal-list">`;
      if (!s.holding.length) html += `<li class="muted">Empty.</li>`;
      return html + `</ul>`;
    }, (action, d) => {
      if (action === 'carry' && Game.carryFromHolding(Number(d.id))) { Sfx.hit(); close(); }
      if (action === 'sellh') { Game.sellFromHolding(Number(d.id)); if (!Game.s.holding.length) close(); }
      if (action === 'selldupes') {
        const ex = Game.exhibitedSpecies();
        for (const a of Game.s.holding.filter((x) => ex.has(x.sp))) Game.sellFromHolding(a.id);
        if (!Game.s.holding.length) close();
      }
    });
  }

  function openSafariConfirm() {
    open(() => {
      const s = Game.s, st = Game.jeepStats();
      const waiting = s.holding.length + (s.carrying ? 1 : 0);
      return `<h2>🚙 Head out on safari?</h2>
        <p>Catch animals to sell or to add to your collection. Animals from further regions are worth much more.</p>
        ${waiting ? `<p class="muted">🚚 ${waiting} animal${waiting > 1 ? 's are' : ' is'} still waiting in the truck. They'll stay there until you sell them or put them in an enclosure.</p>` : ''}
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
        <li>Drive into netted animals to load them, and drive over glowing resources (🌾 grass in the savanna) to gather them. Then return to base camp and ${TouchControls.enabled ? 'tap 🏁' : 'press E'} before your fuel runs out.</li>
        <li>Enclosures and land cost money <b>and</b> resources: grass in the savanna, then wood, mushrooms, cactus and ice from each new region. Jeep upgrades only cost money.</li>
        <li>Back home, your catch waits in the <b>🚚 truck</b>. <b>Sell</b> animals there for money; that's how you earn.</li>
        <li>Carry one of each new species to an enclosure matching its home region. The more different species on display, the higher your <b>tier</b>. Each tier unlocks more levels of every upgrade at the <b>🔧 Garage</b>, and a permit to explore the next region.</li>
      </ol>
      <p class="muted">The wild has five regions, each further north than the last: Savanna → Wetlands → Jungle → Desert → Tundra. Animals from further regions are worth far more, but you'll need a faster jeep and more fuel to reach them.</p>
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
      return Object.entries(m).map(([sp, n]) => `<span class="chip">${animalImg(sp)} ${SPECIES[sp].name}${n > 1 ? ' ×' + n : ''}</span>`).join(' ');
    };
    open(() => `
      <h2>🌅 Back from safari (day ${r.day})</h2>
      ${r.towed ? `<p class="neg">🚚 Your jeep had to be towed home (-${fmtMoney(r.towFee)}).</p>` : ''}
      ${r.newRegions.length ? `<p>🗺️ New region${r.newRegions.length > 1 ? 's' : ''} explored: ${r.newRegions.map((b) => `<span class="chip">${BIOMES[b].icon} ${BIOMES[b].name}</span>`).join(' ')}</p>` : ''}
      <h3>🚙 Safari haul</h3>
      ${r.caught.length ? `<p>${chips(r.caught)}</p><p>Worth <b class="pos">${fmtMoney(r.value)}</b> if you sell them all. They're waiting in the 🚚 truck.</p>` : '<p class="muted">You came back empty-handed this time.</p>'}
      ${Object.values(r.gathered).some((v) => v > 0) ? `<h3>🧺 Resources gathered</h3><p>${Object.entries(r.gathered).filter(([, v]) => v > 0).map(([k, v]) => `<span class="chip">${RESOURCES[k].emoji} ${v} ${RESOURCES[k].name}</span>`).join(' ')}</p>` : ''}
      ${r.newSpecies.length ? `<p>📖 New species: ${chips(r.newSpecies)}<br><span class="muted small">Put one of each in an enclosure to grow your collection.</span></p>` : ''}
      ${btn('Back to the zoo', 'ok', {}, null, 'big')}`, () => close(), { closeOnE: true });
  }

  return {
    init, refresh, isModalOpen, close,
    openGarage, openOffice, openLand, openBuild, openEnclosure, openTruck, openSafariConfirm,
    showIntro, showReport, notify,
  };
})();
