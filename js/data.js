// Static game data: regions, species, upgrades. Tweak numbers here to rebalance.

// Regions, in order of distance from base camp. Each region is also an enclosure habitat.
// ground = safari terrain colour, speed = jeep speed multiplier on that ground (tires reduce the penalty).
const BIOMES = {
  savanna:  { name: 'Savanna',  icon: '🌾', color: '#d8c07a', fence: '#7a5a30', ground: [214, 190, 118], speed: 1.0,  buildCost: 20 },
  wetlands: { name: 'Wetlands', icon: '🪷', color: '#7fb89a', fence: '#3f5f45', ground: [120, 160, 104], speed: 0.85, buildCost: 80 },
  jungle:   { name: 'Jungle',   icon: '🌴', color: '#5e9c4c', fence: '#4a3520', ground: [76, 132, 62],   speed: 0.85, buildCost: 300 },
  desert:   { name: 'Desert',   icon: '🌵', color: '#ecd29a', fence: '#9a6a3a', ground: [236, 206, 150], speed: 0.9,  buildCost: 1000 },
  tundra:   { name: 'Tundra',   icon: '❄️', color: '#e4edf5', fence: '#5d6f80', ground: [234, 240, 246], speed: 0.8,  buildCost: 3000 },
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

// Sale value scales steeply with how far away a region is. Within a region, an animal's
// value is the region's base price scaled by its appeal relative to the region's commonest animal.
const BIOME_VALUE = { savanna: 10, wetlands: 40, jungle: 150, desert: 500, tundra: 1500 };

const SPECIES_BY_BIOME = {};
for (const [key, def] of Object.entries(SPECIES)) {
  def.key = key;
  (SPECIES_BY_BIOME[def.biome] = SPECIES_BY_BIOME[def.biome] || []).push(def);
}
for (const [biome, list] of Object.entries(SPECIES_BY_BIOME)) {
  const minAppeal = Math.min(...list.map((d) => d.appeal));
  for (const d of list) d.value = Math.max(5, Math.round(BIOME_VALUE[biome] * d.appeal / minAppeal / 5) * 5);
}

// Upgrade tiers are unlocked by your zoo collection: the number of different species on
// display in your enclosures. Tiers stay unlocked once reached.
const TIERS = [
  { species: 0,  cost: 25 },    // tier 1: from the start
  { species: 4,  cost: 100 },   // tier 2
  { species: 9,  cost: 400 },   // tier 3
  { species: 15, cost: 1300 },  // tier 4
  { species: 22, cost: 4000 },  // tier 5
];

// Jeep & net upgrades. Each upgrade's levels are spread across the 5 tiers; a level costs
// its tier's base price × costMult, a bit more for each extra level bought in the same tier.
const UPGRADES = {
  engine:      { name: 'Engine',          icon: '⚙️', desc: 'Higher top speed & acceleration (reach far regions)', max: 5, costMult: 1.2 },
  fuel:        { name: 'Fuel Tank',       icon: '⛽', desc: '+12 seconds per safari', max: 6, costMult: 1.0 },
  tires:       { name: 'Off-road Tires',  icon: '🛞', desc: 'Better steering, less slowdown in mud, sand, snow & water', max: 4, costMult: 0.9 },
  cargo:       { name: 'Cargo Cage',      icon: '📦', desc: '+2 animals per trip', max: 5, costMult: 1.3 },
  netCount:    { name: 'Net Rack',        icon: '🧺', desc: '+3 nets per trip', max: 6, costMult: 0.8 },
  netStrength: { name: 'Heavy Nets',      icon: '🕸️', desc: 'Stronger nets: fewer shots to tangle an animal', max: 4, costMult: 1.5 },
  reload:      { name: 'Net Reloader',    icon: '🔄', desc: 'Fire nets faster', max: 5, costMult: 0.9 },
  netRange:    { name: 'Net Cannon',      icon: '🎯', desc: 'Faster, longer-range nets', max: 4, costMult: 0.9 },
  autoAim:     { name: 'Auto-Aim Turret', icon: '📡', desc: 'Turret locks onto animals in a cone ahead. Wider cone each level; can fire by itself from level 3', max: 5, costMult: 1.4 },
};

const ECON = {
  startMoney: 20,
  towFee: 10,
  startCapacity: 3,
  expandStep: 2,
  maxCapacity: 11,
  expandCostFactor: 0.6,   // expanding costs this × the enclosure's build cost
  plotCols: 4,
  plotRows: 3,
  // Price of each extra plot, in the order you buy them (you start owning one plot).
  landCosts: [20, 50, 100, 200, 400, 700, 1200, 2000, 3200, 5000, 8000],
};

// Auto-aim cone half-angle (degrees) per Auto-Aim Turret level; auto-fire from AUTO_FIRE_LEVEL.
const AUTO_AIM_CONE = [0, 15, 30, 45, 70, 100];
const AUTO_FIRE_LEVEL = 3;

// Tier (1-5) needed to buy level index `level` (0-based) of an upgrade.
function upgradeTier(key, level) {
  return 1 + Math.floor(level * TIERS.length / UPGRADES[key].max);
}

function upgradeCost(key, level) {
  const tier = upgradeTier(key, level);
  let sameTierBefore = 0;
  for (let l = level - 1; l >= 0 && upgradeTier(key, l) === tier; l--) sameTierBefore++;
  const raw = TIERS[tier - 1].cost * UPGRADES[key].costMult * (1 + 0.5 * sameTierBefore);
  return Math.round(raw / 5) * 5;
}
