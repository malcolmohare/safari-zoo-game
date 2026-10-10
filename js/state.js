// Persistent game state, save/load, and the zoo economy.

const SAVE_KEY = 'safari-zoo-save-v1';

function newGameState() {
  const plots = [];
  for (let i = 0; i < ECON.plotCols * ECON.plotRows; i++) plots.push({ enclosure: null });
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
    landLevel: 0,
    upgrades,
    amenities,
    nextId: 1,
    discovered: {},   // species key -> true once caught
    lastReport: null,
    seenIntro: false,
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
  unlockedPlots() { return ECON.plotCols * (1 + this.s.landLevel); },
  isPlotUnlocked(i) { return i < this.unlockedPlots(); },

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
      snack: 1.5 * this.s.amenities.snack,
      gift: 2.5 * this.s.amenities.gift,
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
      fuelMax: 60 + u.fuel * 20,
      cargoMax: 3 + u.cargo * 2,
      reload: 0.75 * Math.pow(0.8, u.reload),
      netPower: 1 + u.netStrength * 0.75,
      netSpeed: 650 + u.netRange * 120,
      netRange: 380 + u.netRange * 90,
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

  buyLand() {
    const cost = ECON.landCosts[this.s.landLevel];
    if (cost === undefined) return false;
    if (!this.spend(cost)) return false;
    this.s.landLevel++;
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

  // Put an animal into the best enclosure for it. Returns plot index or -1.
  placeAnimal(sp) {
    const biome = SPECIES[sp].biome;
    let best = -1, bestScore = -Infinity;
    this.s.plots.forEach((p, i) => {
      const e = p.enclosure;
      if (!e || e.biome !== biome || e.animals.length >= e.capacity) return;
      // Prefer enclosures that already have this species, then the emptiest.
      const same = e.animals.some((a) => a.sp === sp) ? 100 : 0;
      const score = same + (e.capacity - e.animals.length);
      if (score > bestScore) { bestScore = score; best = i; }
    });
    if (best >= 0) this.s.plots[best].enclosure.animals.push({ id: this.s.nextId++, sp });
    return best;
  },

  // Called when a safari ends: place animals, then run one day of the zoo.
  endDay(cargo, towed) {
    const s = this.s;
    const placed = [], traded = [];
    let tradeIncome = 0;
    for (const sp of cargo) {
      s.discovered[sp] = true;
      const where = this.placeAnimal(sp);
      if (where >= 0) placed.push(sp);
      else {
        traded.push(sp);
        tradeIncome += SPECIES[sp].appeal * ECON.overflowMultiplier;
      }
    }

    const visitors = Math.max(0, Math.round(this.expectedVisitors() * rand(0.9, 1.1)));
    const per = this.spendPerVisitor();
    const lines = {
      tickets: Math.round(visitors * per.ticket),
      snacks: Math.round(visitors * per.snack),
      gifts: Math.round(visitors * per.gift),
      trades: tradeIncome,
      upkeep: -this.dailyUpkeep(),
      tow: towed ? -ECON.towFee : 0,
    };
    const net = Object.values(lines).reduce((a, b) => a + b, 0);
    s.money = Math.max(0, s.money + net);
    s.totalEarned += Math.max(0, net);

    const report = { day: s.day, placed, traded, visitors, lines, net, towed, appeal: this.appeal().total };
    s.lastReport = report;
    s.day++;
    this.save();
    return report;
  },
};
