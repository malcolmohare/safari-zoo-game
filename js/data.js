// Static game data: regions, species, upgrades. Tweak numbers here to rebalance.

// Regions, in order of distance from base camp. Each region is also an enclosure habitat.
// ground = safari terrain colour, speed = jeep speed multiplier on that ground (tires reduce the penalty).
const BIOMES = {
  savanna:  { name: 'Savanna',  icon: '🌾', color: '#d8c07a', fence: '#7a5a30', ground: [214, 190, 118], speed: 1.0,  buildCost: 150 },
  wetlands: { name: 'Wetlands', icon: '🪷', color: '#7fb89a', fence: '#3f5f45', ground: [120, 160, 104], speed: 0.85, buildCost: 300 },
  jungle:   { name: 'Jungle',   icon: '🌴', color: '#5e9c4c', fence: '#4a3520', ground: [76, 132, 62],   speed: 0.85, buildCost: 600 },
  desert:   { name: 'Desert',   icon: '🌵', color: '#ecd29a', fence: '#9a6a3a', ground: [236, 206, 150], speed: 0.9,  buildCost: 1000 },
  tundra:   { name: 'Tundra',   icon: '❄️', color: '#e4edf5', fence: '#5d6f80', ground: [234, 240, 246], speed: 0.8,  buildCost: 1600 },
};
const REGION_ORDER = ['savanna', 'wetlands', 'jungle', 'desert', 'tundra'];

// speed is in world units/sec (jeep starts at ~260).
// hp = net power needed to tangle it (a basic net has 0.5 power). flee = distance at which it runs from the jeep.
// rarity = spawn weight within its region (higher = more common). Rare animals (rarity <= 3) prefer the far side of their region.
// group = [min, max] herd size.
// behavior: 'skittish' (runs), 'calm' (only runs when very close), 'aggressive' (charges the jeep), 'erratic' (zig-zags)
// flies / swims: can cross ponds.
const SPECIES = {
  zebra:       { name: 'Zebra',        emoji: '🦓', biome: 'savanna',  appeal: 3,  hp: 1, speed: 170, flee: 230, size: 34, rarity: 10, group: [3, 5], behavior: 'skittish' },
  warthog:     { name: 'Warthog',      emoji: '🐗', biome: 'savanna',  appeal: 3,  hp: 1, speed: 160, flee: 200, size: 30, rarity: 8,  group: [1, 3], behavior: 'erratic' },
  antelope:    { name: 'Antelope',     emoji: '🦌', biome: 'savanna',  appeal: 4,  hp: 1, speed: 225, flee: 290, size: 30, rarity: 8,  group: [3, 6], behavior: 'skittish' },
  giraffe:     { name: 'Giraffe',      emoji: '🦒', biome: 'savanna',  appeal: 7,  hp: 2, speed: 140, flee: 210, size: 46, rarity: 5,  group: [1, 3], behavior: 'skittish' },
  elephant:    { name: 'Elephant',     emoji: '🐘', biome: 'savanna',  appeal: 11, hp: 4, speed: 90,  flee: 110, size: 52, rarity: 2,  group: [2, 3], behavior: 'calm' },
  lion:        { name: 'Lion',         emoji: '🦁', biome: 'savanna',  appeal: 13, hp: 3, speed: 215, flee: 0, aggro: 260, size: 38, rarity: 2, group: [1, 2], behavior: 'aggressive' },

  frog:        { name: 'Frog',         emoji: '🐸', biome: 'wetlands', appeal: 5,  hp: 1, speed: 130, flee: 150, size: 24, rarity: 10, group: [2, 4], behavior: 'erratic', swims: true },
  duck:        { name: 'Duck',         emoji: '🦆', biome: 'wetlands', appeal: 5,  hp: 1, speed: 190, flee: 220, size: 26, rarity: 9,  group: [3, 5], behavior: 'skittish', flies: true },
  flamingo:    { name: 'Flamingo',     emoji: '🦩', biome: 'wetlands', appeal: 8,  hp: 1, speed: 200, flee: 260, size: 34, rarity: 7,  group: [3, 6], behavior: 'skittish', swims: true },
  beaver:      { name: 'Beaver',       emoji: '🦫', biome: 'wetlands', appeal: 9,  hp: 2, speed: 110, flee: 170, size: 30, rarity: 5,  group: [1, 2], behavior: 'calm', swims: true },
  hippo:       { name: 'Hippo',        emoji: '🦛', biome: 'wetlands', appeal: 16, hp: 5, speed: 160, flee: 0, aggro: 200, size: 50, rarity: 3, group: [1, 3], behavior: 'aggressive', swims: true },
  crocodile:   { name: 'Crocodile',    emoji: '🐊', biome: 'wetlands', appeal: 18, hp: 4, speed: 200, flee: 0, aggro: 230, size: 46, rarity: 2, group: [1, 1], behavior: 'aggressive', swims: true },

  monkey:      { name: 'Monkey',       emoji: '🐒', biome: 'jungle',   appeal: 8,  hp: 1, speed: 200, flee: 250, size: 30, rarity: 10, group: [2, 4], behavior: 'erratic' },
  parrot:      { name: 'Parrot',       emoji: '🦜', biome: 'jungle',   appeal: 9,  hp: 1, speed: 235, flee: 260, size: 28, rarity: 8,  group: [2, 3], behavior: 'erratic', flies: true },
  sloth:       { name: 'Sloth',        emoji: '🦥', biome: 'jungle',   appeal: 12, hp: 2, speed: 35,  flee: 80,  size: 32, rarity: 5,  group: [1, 1], behavior: 'calm' },
  orangutan:   { name: 'Orangutan',    emoji: '🦧', biome: 'jungle',   appeal: 15, hp: 3, speed: 150, flee: 220, size: 40, rarity: 4,  group: [1, 2], behavior: 'skittish' },
  gorilla:     { name: 'Gorilla',      emoji: '🦍', biome: 'jungle',   appeal: 20, hp: 4, speed: 130, flee: 0, aggro: 200, size: 44, rarity: 3, group: [1, 3], behavior: 'aggressive' },
  tiger:       { name: 'Tiger',        emoji: '🐅', biome: 'jungle',   appeal: 25, hp: 3, speed: 245, flee: 0, aggro: 270, size: 42, rarity: 2, group: [1, 1], behavior: 'aggressive' },

  lizard:      { name: 'Lizard',       emoji: '🦎', biome: 'desert',   appeal: 10, hp: 1, speed: 230, flee: 220, size: 24, rarity: 10, group: [1, 3], behavior: 'erratic' },
  scorpion:    { name: 'Scorpion',     emoji: '🦂', biome: 'desert',   appeal: 11, hp: 1, speed: 150, flee: 0, aggro: 140, size: 24, rarity: 8, group: [1, 2], behavior: 'aggressive' },
  camel:       { name: 'Camel',        emoji: '🐫', biome: 'desert',   appeal: 14, hp: 3, speed: 120, flee: 150, size: 46, rarity: 6,  group: [2, 4], behavior: 'calm' },
  kangaroo:    { name: 'Kangaroo',     emoji: '🦘', biome: 'desert',   appeal: 17, hp: 2, speed: 265, flee: 300, size: 38, rarity: 5,  group: [2, 3], behavior: 'erratic' },
  snake:       { name: 'Cobra',        emoji: '🐍', biome: 'desert',   appeal: 20, hp: 2, speed: 210, flee: 0, aggro: 220, size: 32, rarity: 3, group: [1, 1], behavior: 'aggressive' },
  rhino:       { name: 'Rhino',        emoji: '🦏', biome: 'desert',   appeal: 26, hp: 5, speed: 185, flee: 0, aggro: 240, size: 48, rarity: 2, group: [1, 1], behavior: 'aggressive' },

  penguin:     { name: 'Penguin',      emoji: '🐧', biome: 'tundra',   appeal: 13, hp: 1, speed: 85,  flee: 200, size: 30, rarity: 10, group: [4, 7], behavior: 'skittish' },
  seal:        { name: 'Seal',         emoji: '🦭', biome: 'tundra',   appeal: 16, hp: 2, speed: 70,  flee: 160, size: 40, rarity: 7,  group: [2, 4], behavior: 'calm', swims: true },
  arcticfox:   { name: 'Arctic Fox',   emoji: '🦊', biome: 'tundra',   appeal: 18, hp: 1, speed: 255, flee: 300, size: 30, rarity: 6,  group: [1, 2], behavior: 'erratic' },
  polarbear:   { name: 'Polar Bear',   emoji: '🐻‍❄️', biome: 'tundra', appeal: 30, hp: 5, speed: 175, flee: 0, aggro: 250, size: 50, rarity: 3, group: [1, 1], behavior: 'aggressive' },
  snowleopard: { name: 'Snow Leopard', emoji: '🐆', biome: 'tundra',   appeal: 38, hp: 3, speed: 280, flee: 340, size: 38, rarity: 1,  group: [1, 1], behavior: 'skittish' },
  mammoth:     { name: 'Woolly Mammoth', emoji: '🦣', biome: 'tundra', appeal: 50, hp: 7, speed: 95,  flee: 120, size: 60, rarity: 1,  group: [1, 1], behavior: 'calm' },
};

const SPECIES_BY_BIOME = {};
for (const [key, def] of Object.entries(SPECIES)) {
  def.key = key;
  def.upkeep = Math.ceil(def.appeal * 0.4);
  (SPECIES_BY_BIOME[def.biome] = SPECIES_BY_BIOME[def.biome] || []).push(def);
}

// Jeep & net upgrades. cost(level) = baseCost * growth^level
const UPGRADES = {
  engine:      { name: 'Engine',         icon: '⚙️', desc: 'Higher top speed & acceleration (reach far regions)', max: 5, baseCost: 120, growth: 1.7 },
  fuel:        { name: 'Fuel Tank',      icon: '⛽', desc: '+12 seconds per safari', max: 6, baseCost: 90,  growth: 1.7 },
  tires:       { name: 'Off-road Tires', icon: '🛞', desc: 'Better steering, less slowdown in mud, sand, snow & water', max: 4, baseCost: 100, growth: 1.8 },
  cargo:       { name: 'Cargo Cage',     icon: '📦', desc: '+2 animals per trip', max: 5, baseCost: 150, growth: 1.75 },
  netCount:    { name: 'Net Rack',       icon: '🧺', desc: '+3 nets per trip', max: 6, baseCost: 80,  growth: 1.6 },
  netStrength: { name: 'Heavy Nets',     icon: '🕸️', desc: 'Stronger nets: fewer shots to tangle an animal', max: 4, baseCost: 200, growth: 1.9 },
  reload:      { name: 'Net Reloader',   icon: '🔄', desc: 'Fire nets faster', max: 5, baseCost: 110, growth: 1.7 },
  netRange:    { name: 'Net Cannon',     icon: '🎯', desc: 'Faster, longer-range nets', max: 4, baseCost: 100, growth: 1.8 },
  autoAim:     { name: 'Auto-Aim Turret', icon: '📡', desc: 'Turret locks onto animals in a cone ahead. Wider cone each level; fires by itself from level 3', max: 5, baseCost: 150, growth: 1.8 },
};

// Zoo-wide amenities. Explicit cost per level.
const AMENITIES = {
  snack:     { name: 'Snack Bar',   icon: '🍿', desc: '+$0.50 per visitor per level', costs: [200, 550, 1300] },
  gift:      { name: 'Gift Shop',   icon: '🧸', desc: '+$1 per visitor per level', costs: [450, 1100, 2600] },
  marketing: { name: 'Billboards',  icon: '📣', desc: '+20% visitors per level',      costs: [300, 700, 1500, 3200] },
};

const ECON = {
  startMoney: 50,
  ticketPrice: 2,
  baseVisitors: 3,
  visitorsPerAppeal: 1,
  varietyBonus: 0.08,      // per extra unique species
  sellMultiplier: 4,       // selling an animal = appeal * this
  towFee: 15,
  // The zoo earns money only while you're out on safari: one full "day" of visitors per
  // this many seconds away. Short trips earn proportionally less, so quick in-and-out
  // trips can't be used to farm money.
  daySeconds: 30,
  startCapacity: 3,
  expandStep: 2,
  maxCapacity: 11,
  expandCostPerSlot: 80,   // cost = this * current capacity
  plotCols: 4,
  plotRows: 3,
  // Price of each extra plot, in the order you buy them (you start owning one plot).
  landCosts: [150, 250, 400, 600, 850, 1150, 1500, 1900, 2400, 3000, 3700],
};

// Auto-aim cone half-angle (degrees) per Auto-Aim Turret level; auto-fire from AUTO_FIRE_LEVEL.
const AUTO_AIM_CONE = [0, 15, 30, 45, 70, 100];
const AUTO_FIRE_LEVEL = 3;

function upgradeCost(key, level) {
  const u = UPGRADES[key];
  return Math.round(u.baseCost * Math.pow(u.growth, level) / 5) * 5;
}
