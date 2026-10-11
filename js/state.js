// Persistent game state, save/load, and the zoo economy.

// Bump the version when balance changes enough that old saves would be misleading.
const SAVE_KEY = 'safari-zoo-save-v4';

function newGameState() {
  const plots = [];
  for (let i = 0; i < ECON.plotCols * ECON.plotRows; i++) plots.push({ owned: i === 0, enclosure: null });
  plots[0].enclosure = { biome: 'savanna', capacity: ECON.startCapacity, animals: [] };
  const upgrades = {};
  for (const k of Object.keys(UPGRADES)) upgrades[k] = 0;
  const amenities = {};
  for (const k of Object.keys(AMENITIES)) amenities[k] = 0;
  return {
    version: 1,
    money: ECON.startMoney,
    day: 1,
    plots,
    upgrades,
    amenities,
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
        this.s.amenities = Object.assign(fresh.amenities, loaded.amenities);
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
  landCost() { return ECON.landCosts[this.ownedPlots() - 1]; },

  allAnimals() {
    const out = [];
    for (const p of this.s.plots) if (p.enclosure) out.push(...p.enclosure.animals);
    return out;
  },

  appeal() {
    let base = 0;
    const uniq = new Set();
    for (const a of this.allAnimals()) { base += SPECIES[a.sp].appeal; uniq.add(a.sp); }
    const variety = 1 + ECON.varietyBonus * Math.max(0, uniq.size - 1);
    return { base, variety, unique: uniq.size, total: Math.round(base * variety) };
  },

  visitorMultiplier() { return 1 + 0.2 * this.s.amenities.marketing; },

  expectedVisitors() {
    const ap = this.appeal().total;
    if (ap === 0) return 2;
    return Math.round((ECON.baseVisitors + ap * ECON.visitorsPerAppeal) * this.visitorMultiplier());
  },

  spendPerVisitor() {
    return {
      ticket: ECON.ticketPrice,
      snack: 0.5 * this.s.amenities.snack,
      gift: 1 * this.s.amenities.gift,
    };
  },

  dailyUpkeep() {
    return this.allAnimals().reduce((s, a) => s + SPECIES[a.sp].upkeep, 0);
  },

  jeepStats() {
    const u = this.s.upgrades;
    return {
      maxSpeed: 260 + u.engine * 45,
      accel: 320 + u.engine * 50,
      turnRate: 2.7 + u.tires * 0.3,
      terrainGrip: u.tires * 0.2,                // reduces terrain slowdown by 20%/level
      fuelMax: 30 + u.fuel * 12,
      nets: 6 + u.netCount * 3,
      cargoMax: 3 + u.cargo * 2,
      reload: 0.75 * Math.pow(0.8, u.reload),
      netPower: 0.5 + u.netStrength * 0.35,
      netSpeed: 650 + u.netRange * 120,
      netRange: 380 + u.netRange * 90,
      aimCone: AUTO_AIM_CONE[u.autoAim] * Math.PI / 180,  // half-angle in radians
      autoFire: u.autoAim >= AUTO_FIRE_LEVEL,
    };
  },

  // ---- Actions (return true on success) ----
  spend(amount) {
    if (this.s.money < amount) { Sfx.error(); return false; }
    this.s.money -= amount;
    Sfx.cash();
    return true;
  },

  buyUpgrade(key) {
    const lvl = this.s.upgrades[key];
    if (lvl >= UPGRADES[key].max) return false;
    if (!this.spend(upgradeCost(key, lvl))) return false;
    this.s.upgrades[key]++;
    this.save();
    return true;
  },

  buyAmenity(key) {
    const lvl = this.s.amenities[key];
    const a = AMENITIES[key];
    if (lvl >= a.costs.length) return false;
    if (!this.spend(a.costs[lvl])) return false;
    this.s.amenities[key]++;
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
    if (!this.spend(BIOMES[biome].buildCost)) return false;
    p.enclosure = { biome, capacity: ECON.startCapacity, animals: [] };
    this.save();
    return true;
  },

  expandCost(enc) { return ECON.expandCostPerSlot * enc.capacity; },

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
    enc.animals.splice(i, 1);
    this.s.money += SPECIES[a.sp].appeal * ECON.sellMultiplier;
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
    this.s.money += SPECIES[a.sp].appeal * ECON.sellMultiplier;
    Sfx.cash();
    this.save();
    return true;
  },

  // Returns null on success, or a reason string.
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

  // Called when a safari ends. The zoo was open while you were out, so the day's
  // income is based on the animals already in enclosures. The new catch goes into the truck.
  // Net zoo income per second of safari time (used for the live counter on the safari HUD).
  incomePerSecond() {
    const per = this.spendPerVisitor();
    const perVisitor = per.ticket + per.snack + per.gift;
    return (this.expectedVisitors() * perVisitor - this.dailyUpkeep()) / ECON.daySeconds;
  },

  endDay(cargo, towed, regionsVisited, secondsOut) {
    const s = this.s;
    const dayFrac = secondsOut / ECON.daySeconds;
    const visitors = Math.max(0, Math.round(this.expectedVisitors() * dayFrac * rand(0.95, 1.05)));
    const per = this.spendPerVisitor();
    const lines = {
      tickets: Math.round(visitors * per.ticket),
      snacks: Math.round(visitors * per.snack),
      gifts: Math.round(visitors * per.gift),
      upkeep: -Math.round(this.dailyUpkeep() * dayFrac),
      tow: towed ? -ECON.towFee : 0,
    };
    const net = Object.values(lines).reduce((a, b) => a + b, 0);
    s.money = Math.max(0, s.money + net);
    s.totalEarned += Math.max(0, net);

    const newSpecies = [];
    for (const sp of cargo) {
      if (!s.discovered[sp] && !newSpecies.includes(sp)) newSpecies.push(sp);
      s.discovered[sp] = true;
      s.holding.push({ id: s.nextId++, sp });
    }
    const newRegions = regionsVisited.filter((r) => !s.regionsVisited[r]);
    for (const r of regionsVisited) s.regionsVisited[r] = true;

    const report = { day: s.day, caught: cargo, newSpecies, newRegions, visitors, lines, net, towed, appeal: this.appeal().total, secondsOut: Math.round(secondsOut) };
    s.lastReport = report;
    s.day++;
    this.save();
    return report;
  },
};
