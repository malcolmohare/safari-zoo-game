// Persistent game state, save/load, and the shop rules: tanks, fish happiness, upgrades and the nightly tally.

// Bump when balance changes would make old saves misleading.
const SAVE_KEY = 'reel-rhythm-save-v1';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));
const fmt$ = (n) => (n < 0 ? '-$' : '$') + Math.abs(Math.round(n)).toLocaleString();

const newTank = (size = 0) => ({ size, temp: 'temperate', water: 'fresh', decor: {}, clean: 100, fish: [] });

function newState() {
  const up = {};
  for (const k of Object.keys(UPGRADES)) up[k] = 0;
  return {
    day: 1, money: 60, rep: 1,
    up,
    tanks: [newTank(0), newTank(0)],   // one entry per shop slot; null = empty slot
    cooler: [],                        // fish caught today, not in a tank yet: { id, sp, w, hp }
    dex: {},                           // species -> { caught, best }
    seen: {},                          // species -> true once one has bitten
    nextId: 1, fishedToday: false, debtWeeks: 0,
    stats: { sold: 0, earned: 0, caught: 0 },
    seenIntro: false, offsetMs: 0, over: false,
  };
}

const Game = {
  s: null,

  load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) {
        const fresh = newState(), loaded = JSON.parse(raw);
        this.s = Object.assign(fresh, loaded);
        this.s.up = Object.assign(fresh.up, loaded.up);
        const known = (f) => SPECIES[f.sp];
        this.s.cooler = this.s.cooler.filter(known);
        for (const t of this.s.tanks) if (t) t.fish = t.fish.filter(known);
        return;
      }
    } catch (e) { /* storage unavailable or corrupt: start fresh */ }
    this.s = newState();
  },
  save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.s)); } catch (e) { /* ignore */ } },
  reset() { try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ } this.s = newState(); },

  // ---- Gear ----
  rodTier() { return this.s.up.rod + 1; },
  rodName(tier = this.rodTier()) { return UPGRADES.rod.names[tier - 1]; },
  casts() { return castsPerTrip(this.s.up.bait); },
  coolerCap() { return coolerCap(this.s.up.cooler); },
  slots() { return tankSlots(this.s.up.slots); },
  // Timing windows in seconds for Perfect and Good hits.
  windows() { const k = 1 + 0.18 * this.s.up.reel; return { perfect: 0.05 * k, good: 0.11 * k }; },
  lineMax() { return 4 + this.s.up.line * 2; },
  spotOpen(spot) { const n = SPOTS[spot].need; return !n || this.s.up[n] > 0; },

  // ---- Upgrades ----
  upgradeCost(k) { const u = UPGRADES[k], l = this.s.up[k]; return l < u.levels.length ? u.levels[l] : null; },
  upgradeMissing(k) {   // names of upgrades you need first, or ''
    const need = UPGRADES[k].need || {};
    return Object.entries(need).filter(([n, l]) => this.s.up[n] < l).map(([n]) => UPGRADES[n].name).join(', ');
  },
  canBuyUpgrade(k) { const c = this.upgradeCost(k); return c !== null && !this.upgradeMissing(k) && this.s.money >= c; },
  buyUpgrade(k) {
    if (!this.canBuyUpgrade(k)) return false;
    this.s.money -= this.upgradeCost(k);
    this.s.up[k]++;
    if (k === 'slots') while (this.s.tanks.length < this.slots()) this.s.tanks.push(null);
    this.save();
    return true;
  },

  // ---- Catching ----
  // Pick which fish bites at a spot. Bigger rods don't change the odds: too-strong fish still bite and snap the line.
  rollFish(spot) {
    const pool = Object.entries(SPECIES).filter(([, sp]) => sp.spot === spot);
    let r = Math.random() * pool.reduce((s, [, sp]) => s + sp.w, 0);
    for (const [k, sp] of pool) { r -= sp.w; if (r <= 0) return k; }
    return pool[0][0];
  },
  addCatch(sp, w) {
    const s = this.s, f = { id: s.nextId++, sp, w, hp: 3 };
    const d = s.dex[sp] || (s.dex[sp] = { caught: 0, best: 0 });
    const isNew = d.caught === 0;
    d.caught++; d.best = Math.max(d.best, w);
    s.stats.caught++;
    s.cooler.push(f);
    this.save();
    return { fish: f, isNew };
  },

  // ---- Fish & tanks ----
  allFish() { const out = []; for (const t of this.s.tanks) if (t) out.push(...t.fish); return out; },
  findFish(id) {
    const c = this.s.cooler.findIndex((f) => f.id === id);
    if (c >= 0) return { list: this.s.cooler, i: c, tank: null, f: this.s.cooler[c] };
    for (const t of this.s.tanks) if (t) { const i = t.fish.findIndex((f) => f.id === id); if (i >= 0) return { list: t.fish, i, tank: t, f: t.fish[i] }; }
    return null;
  },
  used(tank) { return tank.fish.reduce((s, f) => s + SPECIES[f.sp].size, 0); },

  // How happy a fish is in a tank: h is 0..1, lethal means it dies tonight, issues lists what's wrong.
  // `extra` is an extra fish to pretend is in the tank (to preview a move).
  mood(f, tank, extra = null) {
    const sp = SPECIES[f.sp], issues = [];
    const mates = extra && !tank.fish.includes(extra) ? tank.fish.concat([extra]) : tank.fish;
    let h = 1, lethal = false;
    if (tank.water !== sp.water) { lethal = true; issues.push(sp.water === 'salt' ? 'Needs saltwater!' : 'Needs fresh water!'); }
    const td = TEMPS.indexOf(tank.temp) - TEMPS.indexOf(sp.temp);
    if (Math.abs(td) === 2) { lethal = true; issues.push(td > 0 ? 'Far too hot!' : 'Far too cold!'); }
    else if (td) { h -= 0.45; issues.push(td > 0 ? 'Too warm' : 'Too cold'); }
    const minSize = sp.big ? 2 : sp.size >= 4 ? 1 : 0;
    if (tank.size < minSize) { h -= 0.35; issues.push(`Needs a ${TANKS[minSize].name} tank`); }
    if (mates.reduce((s, m) => s + SPECIES[m.sp].size, 0) > TANKS[tank.size].cap) { h -= 0.3; issues.push('Overcrowded'); }
    for (const d of sp.likes) if (!tank.decor[d]) { h -= 0.2; issues.push(`Wants ${DECOR[d].name.toLowerCase()}`); }
    if (sp.school && mates.filter((m) => m.sp === f.sp).length < 3) { h -= 0.25; issues.push('Lonely: wants 3+ of its kind'); }
    if (!sp.aggro) {
      const bully = mates.find((m) => m.sp !== f.sp && SPECIES[m.sp].aggro);
      if (bully) { h -= 0.25; issues.push(`Scared of the ${SPECIES[bully.sp].name}`); }
    }
    if (tank.clean < 50) { h -= tank.clean < 25 ? 0.5 : 0.25; issues.push(tank.clean < 25 ? 'Filthy water' : 'Dirty water'); }
    if (lethal) h = 0;
    return { h: clamp(h, 0, 1), lethal, issues };
  },
  hearts(h) { return Math.round(h * 5); },
  // What a customer pays for this fish today.
  price(f, tank) {
    const h = tank ? this.mood(f, tank).h : 0.5;
    return Math.max(1, Math.round(SPECIES[f.sp].value * f.w * (0.5 + h) * (1 + this.s.rep * 0.06)));
  },
  wholesale(f) { return Math.max(1, Math.round(SPECIES[f.sp].value * f.w * 0.4)); },

  moveFish(id, tankIdx) {
    const loc = this.findFish(id), tank = this.s.tanks[tankIdx];
    if (!loc || !tank) return false;
    loc.list.splice(loc.i, 1);
    tank.fish.push(loc.f);
    this.save();
    return true;
  },
  toCooler(id) {
    const loc = this.findFish(id);
    if (!loc || !loc.tank) return false;
    loc.list.splice(loc.i, 1);
    this.s.cooler.push(loc.f);
    this.save();
    return true;
  },
  sellWholesale(id) {
    const loc = this.findFish(id);
    if (!loc) return 0;
    const v = this.wholesale(loc.f);
    loc.list.splice(loc.i, 1);
    this.s.money += v;
    this.save();
    return v;
  },

  canSpend(c) { return this.s.money >= c; },
  spend(c) { if (!this.canSpend(c)) return false; this.s.money -= c; this.save(); return true; },
  buyTank(slot) {
    if (this.s.tanks[slot] || slot >= this.slots() || !this.spend(TANKS[0].cost)) return false;
    this.s.tanks[slot] = newTank(0);
    this.save();
    return true;
  },
  upgradeTank(i) {
    const t = this.s.tanks[i];
    if (!t || t.size >= 2 || !this.spend(TANKS[t.size + 1].cost)) return false;
    t.size++;
    this.save();
    return true;
  },
  tempAllowed(temp) { return temp === 'temperate' || (temp === 'cold' ? this.s.up.chiller > 0 : this.s.up.heater > 0); },
  saltAllowed() { return this.s.up.salt > 0; },
  setTemp(i, temp) { const t = this.s.tanks[i]; if (!t || !this.tempAllowed(temp)) return false; t.temp = temp; this.save(); return true; },
  setWater(i, water) {
    const t = this.s.tanks[i];
    if (!t || (water === 'salt' && !this.saltAllowed())) return false;
    t.water = water;
    if (water === 'fresh') delete t.decor.coral;
    this.save();
    return true;
  },
  addDecor(i, d) {
    const t = this.s.tanks[i];
    if (!t || t.decor[d] || (DECOR[d].salt && t.water !== 'salt') || !this.spend(DECOR[d].cost)) return false;
    t.decor[d] = true;
    this.save();
    return true;
  },
  cleanTank(i) {
    const t = this.s.tanks[i];
    if (!t || t.clean >= 100 || !this.spend(CLEAN_COST)) return false;
    t.clean = 100;
    this.save();
    return true;
  },

  rentDueIn() { return 7 - ((this.s.day - 1) % 7); },   // nights until rent (1 = tonight)
  rent() { return rentFor(Math.ceil(this.s.day / 7)); },

  // ---- End of day ----
  // sales: [{ sp, price }] from today's opening. Returns a report for the summary screen.
  endDay(sales) {
    const s = this.s, r = { day: s.day, sales, revenue: sales.reduce((a, x) => a + x.price, 0), deaths: [], eaten: [], cooler: null, power: 0, rent: null, gameOver: false };
    // Fish still in the cooler go to the wholesaler.
    if (s.cooler.length) {
      const v = s.cooler.reduce((a, f) => a + this.wholesale(f), 0);
      r.cooler = { n: s.cooler.length, money: v };
      s.money += v;
      s.cooler = [];
    }
    for (const t of s.tanks) {
      if (!t) continue;
      // Aggressive fish may eat one small fish of another kind.
      for (const a of t.fish.slice()) {
        if (!SPECIES[a.sp].aggro || Math.random() > 0.5) continue;
        const prey = t.fish.find((f) => f !== a && f.sp !== a.sp && SPECIES[f.sp].size === 1);
        if (prey) { t.fish.splice(t.fish.indexOf(prey), 1); r.eaten.push({ sp: prey.sp, by: a.sp }); }
      }
      for (const f of t.fish.slice()) {
        const m = this.mood(f, t);
        if (m.lethal) f.hp = 0;
        else if (m.h < 0.4) f.hp--;
        else if (m.h >= 0.7) f.hp = Math.min(3, f.hp + 1);
        if (f.hp <= 0) { t.fish.splice(t.fish.indexOf(f), 1); r.deaths.push({ sp: f.sp, why: m.lethal ? m.issues[0] : 'Too unhappy' }); }
      }
      if (t.fish.length) t.clean = Math.max(0, t.clean - (8 + 30 * this.used(t) / TANKS[t.size].cap) / (1 + 0.6 * s.up.filter));
      if (t.temp !== 'temperate') r.power += POWER_COST;
    }
    s.money -= r.power;
    if (s.day % 7 === 0) {
      r.rent = { amount: this.rent() };
      s.money -= r.rent.amount;
      if (s.money < 0) {
        s.debtWeeks++;
        r.rent.debt = true;
        if (s.debtWeeks >= 2) { r.gameOver = true; s.over = true; }
      } else s.debtWeeks = 0;
    }
    s.day++;
    s.fishedToday = false;
    this.save();
    return r;
  },
};
