// Static game data: biomes, species, upgrades. Tweak numbers here to rebalance.

const BIOMES = {
  savanna: { name: 'Savanna', icon: '🌾', color: '#d8c07a', dark: '#b89e58', fence: '#7a5a30', buildCost: 150 },
  jungle:  { name: 'Jungle',  icon: '🌴', color: '#5e9c4c', dark: '#467a38', fence: '#4a3520', buildCost: 400 },
  tundra:  { name: 'Tundra',  icon: '❄️', color: '#e4edf5', dark: '#c3d2df', fence: '#5d6f80', buildCost: 800 },
};

// speed is in world units/sec (jeep starts at ~260).
// hp = how many nets it takes to tangle it. flee = distance at which it runs from the jeep.
// rarity = spawn weight within its biome (higher = more common).
// group = [min, max] herd size.
// behavior: 'skittish' (runs), 'calm' (only runs when very close), 'aggressive' (charges the jeep), 'erratic' (zig-zags)
const SPECIES = {
  zebra:       { name: 'Zebra',        emoji: '🦓', biome: 'savanna', appeal: 3,  hp: 1, speed: 170, flee: 230, size: 34, rarity: 10, group: [3, 5], behavior: 'skittish' },
  antelope:    { name: 'Antelope',     emoji: '🦌', biome: 'savanna', appeal: 4,  hp: 1, speed: 225, flee: 290, size: 30, rarity: 8,  group: [3, 6], behavior: 'skittish' },
  giraffe:     { name: 'Giraffe',      emoji: '🦒', biome: 'savanna', appeal: 8,  hp: 2, speed: 140, flee: 210, size: 46, rarity: 5,  group: [1, 3], behavior: 'skittish' },
  elephant:    { name: 'Elephant',     emoji: '🐘', biome: 'savanna', appeal: 11, hp: 4, speed: 90,  flee: 110, size: 52, rarity: 3,  group: [2, 3], behavior: 'calm' },
  rhino:       { name: 'Rhino',        emoji: '🦏', biome: 'savanna', appeal: 15, hp: 4, speed: 175, flee: 0,   aggro: 220, size: 46, rarity: 2, group: [1, 1], behavior: 'aggressive' },
  lion:        { name: 'Lion',         emoji: '🦁', biome: 'savanna', appeal: 14, hp: 3, speed: 215, flee: 0,   aggro: 260, size: 38, rarity: 2, group: [1, 2], behavior: 'aggressive' },

  monkey:      { name: 'Monkey',       emoji: '🐒', biome: 'jungle',  appeal: 5,  hp: 1, speed: 200, flee: 250, size: 30, rarity: 10, group: [2, 4], behavior: 'erratic' },
  parrot:      { name: 'Parrot',       emoji: '🦜', biome: 'jungle',  appeal: 6,  hp: 1, speed: 235, flee: 260, size: 28, rarity: 7,  group: [2, 3], behavior: 'erratic', flies: true },
  sloth:       { name: 'Sloth',        emoji: '🦥', biome: 'jungle',  appeal: 9,  hp: 2, speed: 35,  flee: 80,  size: 32, rarity: 4,  group: [1, 1], behavior: 'calm' },
  gorilla:     { name: 'Gorilla',      emoji: '🦍', biome: 'jungle',  appeal: 13, hp: 4, speed: 130, flee: 0,   aggro: 200, size: 44, rarity: 3, group: [1, 3], behavior: 'aggressive' },
  tiger:       { name: 'Tiger',        emoji: '🐅', biome: 'jungle',  appeal: 18, hp: 3, speed: 245, flee: 0,   aggro: 270, size: 42, rarity: 2, group: [1, 1], behavior: 'aggressive' },

  penguin:     { name: 'Penguin',      emoji: '🐧', biome: 'tundra',  appeal: 6,  hp: 1, speed: 85,  flee: 200, size: 30, rarity: 10, group: [4, 7], behavior: 'skittish' },
  arcticfox:   { name: 'Arctic Fox',   emoji: '🦊', biome: 'tundra',  appeal: 9,  hp: 1, speed: 255, flee: 300, size: 30, rarity: 6,  group: [1, 2], behavior: 'erratic' },
  seal:        { name: 'Seal',         emoji: '🦭', biome: 'tundra',  appeal: 10, hp: 2, speed: 70,  flee: 160, size: 40, rarity: 5,  group: [2, 4], behavior: 'calm' },
  polarbear:   { name: 'Polar Bear',   emoji: '🐻‍❄️', biome: 'tundra', appeal: 20, hp: 5, speed: 175, flee: 0, aggro: 250, size: 50, rarity: 3, group: [1, 1], behavior: 'aggressive' },
  snowleopard: { name: 'Snow Leopard', emoji: '🐆', biome: 'tundra',  appeal: 28, hp: 3, speed: 280, flee: 340, size: 38, rarity: 1,  group: [1, 1], behavior: 'skittish' },
};

const SPECIES_BY_BIOME = {};
for (const [key, def] of Object.entries(SPECIES)) {
  def.key = key;
  def.upkeep = Math.ceil(def.appeal * 0.8);
  (SPECIES_BY_BIOME[def.biome] = SPECIES_BY_BIOME[def.biome] || []).push(def);
}

// Jeep & net upgrades. cost(level) = baseCost * growth^level
const UPGRADES = {
  engine:      { name: 'Engine',        icon: '⚙️', desc: 'Higher top speed & acceleration', max: 5, baseCost: 120, growth: 1.7 },
  tires:       { name: 'Off-road Tires', icon: '🛞', desc: 'Better steering, less slowdown in jungle/snow/water', max: 4, baseCost: 100, growth: 1.8 },
  fuel:        { name: 'Fuel Tank',     icon: '⛽', desc: '+20 seconds per safari', max: 5, baseCost: 90,  growth: 1.7 },
  cargo:       { name: 'Cargo Cage',    icon: '📦', desc: '+2 animals per trip', max: 5, baseCost: 150, growth: 1.75 },
  reload:      { name: 'Net Reloader',  icon: '🔄', desc: 'Fire nets faster', max: 5, baseCost: 110, growth: 1.7 },
  netStrength: { name: 'Heavy Nets',    icon: '🕸️', desc: 'Each net counts as more (big animals need several)', max: 4, baseCost: 200, growth: 1.9 },
  netRange:    { name: 'Net Cannon',    icon: '🎯', desc: 'Faster, longer-range nets', max: 4, baseCost: 100, growth: 1.8 },
};

// Zoo-wide amenities. Explicit cost per level.
const AMENITIES = {
  snack:     { name: 'Snack Bar',   icon: '🍿', desc: '+$1.50 per visitor per level', costs: [200, 550, 1300] },
  gift:      { name: 'Gift Shop',   icon: '🧸', desc: '+$2.50 per visitor per level', costs: [450, 1100, 2600] },
  marketing: { name: 'Billboards',  icon: '📣', desc: '+20% visitors per level',      costs: [300, 700, 1500, 3200] },
};

const ECON = {
  startMoney: 100,
  ticketPrice: 5,
  baseVisitors: 8,
  visitorsPerAppeal: 3,
  varietyBonus: 0.15,      // per extra unique species
  sellMultiplier: 10,      // selling an animal from an enclosure = appeal * this
  overflowMultiplier: 8,   // caught but no room = traded away for appeal * this
  towFee: 40,
  startCapacity: 3,
  expandStep: 2,
  maxCapacity: 11,
  expandCostPerSlot: 80,   // cost = this * current capacity
  plotCols: 4,
  plotRows: 3,
  landCosts: [600, 2000],  // each purchase unlocks another row of 4 plots
};

function upgradeCost(key, level) {
  const u = UPGRADES[key];
  return Math.round(u.baseCost * Math.pow(u.growth, level) / 5) * 5;
}
