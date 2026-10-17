// Persistent game state, save/load, and the zoo economy.

// Bump the version when balance changes enough that old saves would be misleading.
const SAVE_KEY = 'safari-zoo-save-v8';

function newGameState() {
  const plots = [];
  for (let i = 0; i < ECON.plotCols * ECON.plotRows; i++) plots.push({ owned: i === 0, enclosure: null });
  plots[0].enclosure = { biome: 'savanna', capacity: ECON.startCapacity, animals: [] };
  const upgrades = {};
  for (const k of Object.keys(UPGRADES)) upgrades[k] = 0;
  return {
    version: 1,
    money: ECON.startMoney,
    day: 1,
    plots,
    upgrades,
    tier: 1,          // highest upgrade tier unlocked (never goes back down)
    perks: {},        // perk key -> true once bought
    resources: Object.fromEntries(Object.keys(RESOURCES).map((k) => [k, 0])),
    nextId: 1,
    discovered: {},   // species key -> true once caught
    regionsVisited: { savanna: true },
    holding: [],      // caught animals waiting in the truck: [{ id, sp }]
    carrying: null,   // animal the zookeeper is carrying: { id, sp } or null
    lastReport: null,
    seenIntro: false,
    autoFireOn: true,   // player toggle for the Auto-Aim Turret's auto-fire (F / AUTO button)
    totalEarned: 0,
  };
}

const Game = {
  s: null,

  load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) {
        const loaded = JSON.parse(raw);
        // Merge onto a fresh state so newly-added fields get defaults.
        const fresh = newGameState();
        this.s = Object.assign(fresh, loaded);
        this.s.upgrades = Object.assign(fresh.upgrades, loaded.upgrades);
        this.s.resources = Object.assign(fresh.resources, loaded.resources);
        // The first legendaries were fantasy animals; they became real endangered species.
        const RENAMED = { unicorn: 'whiterhino', nessie: 'baiji', trex: 'tamarin', scarab: 'addax', frostdragon: 'amurleopard' };
        const fix = (a) => { if (a && RENAMED[a.sp]) a.sp = RENAMED[a.sp]; };
        this.s.holding.forEach(fix); fix(this.s.carrying);
        for (const p of this.s.plots) if (p.enclosure) p.enclosure.animals.forEach(fix);
        for (const [o, n] of Object.entries(RENAMED)) if (this.s.discovered[o]) { this.s.discovered[n] = this.s.discovered[o]; delete this.s.discovered[o]; }
        // Drop anything else the game no longer knows about.
        this.s.holding = this.s.holding.filter((a) => SPECIES[a.sp]);
        if (this.s.carrying && !SPECIES[this.s.carrying.sp]) this.s.carrying = null;
        for (const p of this.s.plots) if (p.enclosure) p.enclosure.animals = p.enclosure.animals.filter((a) => SPECIES[a.sp]);
        // Older saves tracked time on display instead of a value multiplier.
        for (const a of this.allAnimals()) {
          if (a.mult === undefined && a.zooTime) a.mult = Math.min(ECON.maxValueMult, 1 + ECON.valueGrowthPerMin * a.zooTime / 60);
          delete a.zooTime;
        }
        return;
      }
    } catch (e) { /* storage unavailable or corrupt: start fresh */ }
    this.s = newGameState();
  },

  save() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.s)); } catch (e) { /* ignore */ }
  },

  reset() {
    try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
    this.s = newGameState();
  },

  // ---- Queries ----
  isPlotUnlocked(i) { return this.s.plots[i].owned; },
  ownedPlots() { return this.s.plots.filter((p) => p.owned).length; },
  // Price of the next plot (undefined once you own them all).
  landCost() {
    const n = this.ownedPlots() - 1;
    if (ECON.landCosts[n] === undefined) return undefined;
    return { money: ECON.landCosts[n], res: ECON.landResCosts[n] };
  },

  // ---- Animal value ----
  // Sale value: grows the longer the animal has been on display in an enclosure.
  // Each animal keeps its own multiplier, which grows at its enclosure's rate.
  valueMult(a) { return a.mult || 1; },

  // Expansions done on an enclosure (0 = original size).
  encLevel(enc) { return Math.round((enc.capacity - ECON.startCapacity) / ECON.expandStep); },
  // How fast animals in this enclosure gain value (multiplier per minute) and how high they can go.
  encGrowth(enc) {
    const lvl = this.encLevel(enc);
    return {
      perMin: ECON.valueGrowthPerMin * (1 + ECON.expandGrowthBonus * lvl),
      cap: ECON.maxValueMult + ECON.expandCapBonus * lvl,
    };
  },
  animalValue(a) { return Math.round(SPECIES[a.sp].value * this.valueMult(a)); },

  // Called every frame: animals in enclosures age (only while the game is running).
  tick(dt) {
    for (const p of this.s.plots) {
      if (!p.enclosure) continue;
      const g = this.encGrowth(p.enclosure);
      for (const a of p.enclosure.animals) {
        const m = a.mult || 1;
        if (m < g.cap) a.mult = Math.min(g.cap, m + g.perMin * dt / 60);
      }
    }
    this._saveT = (this._saveT || 0) + dt;
    if (this._saveT > 10) { this._saveT = 0; this.save(); }
  },

  buyPerk(key) {
    if (this.s.perks[key]) return false;
    if (!this.spend(PERKS[key].cost)) return false;
    this.s.perks[key] = true;
    Analytics.track('perk_bought', { perk: key });
    this.save();
    return true;
  },

  allAnimals() {
    const out = [];
    for (const p of this.s.plots) if (p.enclosure) out.push(...p.enclosure.animals);
    return out;
  },

  // ---- Collection & tiers ----
  // Species currently on display in an enclosure.
  exhibitedSpecies() {
    return new Set(this.allAnimals().map((a) => a.sp));
  },

  // Tier your current collection qualifies for (ignores tiers already reached).
  collectionTier() {
    const n = this.exhibitedSpecies().size;
    let t = 1;
    TIERS.forEach((tier, i) => { if (n >= tier.species) t = i + 1; });
    return t;
  },

  // Raise the unlocked tier if the collection has grown. Returns the new tier, or 0.
  checkTierUp() {
    const t = this.collectionTier();
    if (t > this.s.tier) { this.s.tier = t; Analytics.track('tier_reached', { tier: t, day: this.s.day }); return t; }
    return 0;
  },

  nextTierInfo() {
    const next = TIERS[this.s.tier];  // TIERS is 0-indexed, tier numbers are 1-based
    if (!next) return null;
    return { tier: this.s.tier + 1, need: next.species, have: this.exhibitedSpecies().size };
  },

  // Each upgrade level adds a small step; see UPGRADES in data.js for the level counts.
  jeepStats() {
    const u = this.s.upgrades;
    return {
      maxSpeed: Math.round(260 + u.engine * 4.5),
      accel: 320 + u.engine * 5,
      turnRate: 2.7 + u.tires * 0.024,
      terrainGrip: u.tires * 0.016,              // reduces terrain slowdown (up to 80%)
      fuelMax: 30 + u.fuel * 1.5,
      hpMax: 100 + u.armor * 4,
      nets: 6 + u.netCount,
      cargoMax: 3 + u.cargo,
      reload: 0.75 * Math.pow(0.8, u.reload / 10),
      netPower: 0.5 + u.netStrength * 0.03,
      netSpeed: 650 + u.netRange * 9.6,
      netRange: 380 + u.netRange * 7.2,
      aimCone: autoAimCone(u.autoAim) * Math.PI / 180,  // half-angle in radians
      autoFire: u.autoAim >= AUTO_FIRE_LEVEL,
    };
  },

  // ---- Actions (return true on success) ----
  // A cost is either a number (money) or { money, res: { resourceKey: amount } }.
  canAfford(cost) {
    if (typeof cost === 'number') return this.s.money >= cost;
    if (this.s.money < (cost.money || 0)) return false;
    return Object.entries(cost.res || {}).every(([k, v]) => this.s.resources[k] >= v);
  },

  spend(cost) {
    if (!this.canAfford(cost)) { Sfx.error(); return false; }
    if (typeof cost === 'number') this.s.money -= cost;
    else {
      this.s.money -= cost.money || 0;
      for (const [k, v] of Object.entries(cost.res || {})) this.s.resources[k] -= v;
    }
    Sfx.cash();
    return true;
  },

  buildCost(biome) { return { money: BIOMES[biome].buildCost, res: { [BIOMES[biome].resource]: ECON.enclosureResource } }; },

  buyUpgrade(key) {
    const lvl = this.s.upgrades[key];
    if (lvl >= UPGRADES[key].levels || upgradeTier(key, lvl) > this.s.tier) return false;
    if (!this.spend(upgradeFullCost(key, lvl))) return false;
    this.s.upgrades[key]++;
    Analytics.track('upgrade_bought', { upgrade: key, level: this.s.upgrades[key] });
    this.save();
    return true;
  },

  buyPlot(i) {
    const cost = this.landCost();
    if (cost === undefined || this.s.plots[i].owned) return false;
    if (!this.spend(cost)) return false;
    this.s.plots[i].owned = true;
    this.save();
    return true;
  },

  buildEnclosure(plotIdx, biome) {
    const p = this.s.plots[plotIdx];
    if (p.enclosure || !this.isPlotUnlocked(plotIdx)) return false;
    if (!this.spend(this.buildCost(biome))) return false;
    p.enclosure = { biome, capacity: ECON.startCapacity, animals: [] };
    this.save();
    return true;
  },

  expandCost(enc) {
    return {
      money: Math.max(10, Math.round(BIOMES[enc.biome].buildCost * ECON.expandCostFactor / 5) * 5),
      res: { [BIOMES[enc.biome].resource]: ECON.expandResource },
    };
  },

  expandEnclosure(plotIdx) {
    const enc = this.s.plots[plotIdx].enclosure;
    if (!enc || enc.capacity >= ECON.maxCapacity) return false;
    if (!this.spend(this.expandCost(enc))) return false;
    enc.capacity = Math.min(ECON.maxCapacity, enc.capacity + ECON.expandStep);
    this.save();
    return true;
  },

  sellAnimal(plotIdx, animalId) {
    const enc = this.s.plots[plotIdx].enclosure;
    if (!enc) return false;
    const i = enc.animals.findIndex((a) => a.id === animalId);
    if (i < 0) return false;
    const a = enc.animals[i];
    const value = this.animalValue(a);
    enc.animals.splice(i, 1);
    this.s.money += value;
    this.s.totalEarned += value;
    Sfx.cash();
    this.save();
    return true;
  },

  // ---- Truck (holding) & carrying ----
  carryFromHolding(id) {
    if (this.s.carrying) return false;
    const i = this.s.holding.findIndex((a) => a.id === id);
    if (i < 0) return false;
    this.s.carrying = this.s.holding.splice(i, 1)[0];
    this.save();
    return true;
  },

  returnCarried() {
    if (!this.s.carrying) return false;
    this.s.holding.push(this.s.carrying);
    this.s.carrying = null;
    this.save();
    return true;
  },

  sellFromHolding(id) {
    const i = this.s.holding.findIndex((a) => a.id === id);
    if (i < 0) return false;
    const a = this.s.holding.splice(i, 1)[0];
    const value = this.animalValue(a);
    this.s.money += value;
    this.s.totalEarned += value;
    Sfx.cash();
    this.save();
    return true;
  },

  // Returns null on success, or a reason string. Check Game.checkTierUp() afterwards.
  placeCarried(plotIdx) {
    const a = this.s.carrying;
    const enc = this.s.plots[plotIdx].enclosure;
    if (!a || !enc) return 'Nothing to place.';
    const def = SPECIES[a.sp];
    if (enc.biome !== def.biome) return `${def.name}s need a ${BIOMES[def.biome].name} enclosure.`;
    if (enc.animals.length >= enc.capacity) return 'This enclosure is full. Expand it or build another.';
    enc.animals.push(a);
    this.s.carrying = null;
    this.save();
    return null;
  },

  // Called when a safari ends: the catch goes into the truck to be sold or exhibited.
  endTrip(cargo, towed, regionsVisited, gathered, escaped = []) {
    const s = this.s;
    for (const [k, v] of Object.entries(gathered)) s.resources[k] += v;
    const towFee = towed ? Math.min(s.money, ECON.towFee) : 0;
    s.money -= towFee;

    const newSpecies = [];
    for (const sp of cargo) {
      if (!s.discovered[sp] && !newSpecies.includes(sp)) newSpecies.push(sp);
      s.discovered[sp] = true;
      s.holding.push({ id: s.nextId++, sp });
    }
    const newRegions = regionsVisited.filter((r) => !s.regionsVisited[r]);
    for (const r of regionsVisited) s.regionsVisited[r] = true;

    const value = cargo.reduce((sum, sp) => sum + SPECIES[sp].value, 0);
    const report = { day: s.day, caught: cargo, escaped, newSpecies, newRegions, towed, towFee, value, gathered };
    s.lastReport = report;
    s.day++;
    this.save();
    return report;
  },
};
