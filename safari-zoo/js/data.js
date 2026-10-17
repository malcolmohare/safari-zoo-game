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

// Resources gathered on safari, one per region. Drive over a glowing node to collect it.
// Enclosures and expansions cost their region's resource; land and perks cost resources too.
const RESOURCES = {
  grass:    { name: 'Grass',     emoji: '🌾', biome: 'savanna' },
  wood:     { name: 'Wood',      emoji: '🪵', biome: 'wetlands' },
  mushroom: { name: 'Mushrooms', emoji: '🍄', biome: 'jungle' },
  cactus:   { name: 'Cactus',    emoji: '🌵', biome: 'desert' },
  ice:      { name: 'Ice',       emoji: '🧊', biome: 'tundra' },
};
for (const [k, r] of Object.entries(RESOURCES)) BIOMES[r.biome].resource = k;

// speed is in world units/sec (jeep starts at ~260).
// hp = net power needed to tangle it (a basic net has 0.5 power). flee = distance at which it runs from the jeep.
// rarity = spawn weight within its region (higher = more common). Rare animals (rarity <= 3) prefer the far side of their region.
// group = [min, max] herd size.
// behavior: 'skittish' (runs), 'calm' (only runs when very close), 'aggressive' (charges the jeep), 'erratic' (zig-zags)
// flies / swims: can cross ponds.
// legendary: a critically endangered animal, one per region. Very rare, always alone, found deep in its region, worth a fortune.
const SPECIES = {
  zebra:       { name: 'Zebra',        emoji: '🦓', biome: 'savanna',  appeal: 3,  hp: 1, speed: 170, flee: 230, size: 34, rarity: 10, group: [3, 5], behavior: 'skittish' },
  warthog:     { name: 'Warthog',      emoji: '🐗', biome: 'savanna',  appeal: 3,  hp: 1, speed: 160, flee: 200, size: 30, rarity: 8,  group: [1, 3], behavior: 'erratic' },
  antelope:    { name: 'Antelope',     emoji: '🦌', biome: 'savanna',  appeal: 4,  hp: 1, speed: 225, flee: 290, size: 30, rarity: 8,  group: [3, 6], behavior: 'skittish' },
  giraffe:     { name: 'Giraffe',      emoji: '🦒', biome: 'savanna',  appeal: 7,  hp: 2, speed: 140, flee: 210, size: 46, rarity: 5,  group: [1, 3], behavior: 'skittish' },
  elephant:    { name: 'Elephant',     emoji: '🐘', biome: 'savanna',  appeal: 11, hp: 4, speed: 90,  flee: 110, size: 52, rarity: 2,  group: [2, 3], behavior: 'calm' },
  lion:        { name: 'Lion',         emoji: '🦁', biome: 'savanna',  appeal: 13, hp: 3, speed: 215, flee: 0, aggro: 260, size: 38, rarity: 2, group: [1, 2], behavior: 'aggressive' },
  buffalo:     { name: 'Cape Buffalo', emoji: '🐃', biome: 'savanna',  appeal: 9,  hp: 3, speed: 150, flee: 0, aggro: 220, size: 46, rarity: 4, group: [2, 4], behavior: 'aggressive' },
  eagle:       { name: 'Martial Eagle', emoji: '🦅', biome: 'savanna', appeal: 8,  hp: 1, speed: 240, flee: 280, size: 30, rarity: 6,  group: [1, 2], behavior: 'erratic', flies: true },
  whiterhino:  { name: 'Northern White Rhino', emoji: '🦏', biome: 'savanna', appeal: 60, hp: 3, speed: 170, flee: 0, aggro: 240, size: 50, rarity: 0, group: [1, 1], behavior: 'aggressive', legendary: true },

  frog:        { name: 'Frog',         emoji: '🐸', biome: 'wetlands', appeal: 5,  hp: 1, speed: 130, flee: 150, size: 24, rarity: 10, group: [2, 4], behavior: 'erratic', swims: true },
  duck:        { name: 'Duck',         emoji: '🦆', biome: 'wetlands', appeal: 5,  hp: 1, speed: 190, flee: 220, size: 26, rarity: 9,  group: [3, 5], behavior: 'skittish', flies: true },
  flamingo:    { name: 'Flamingo',     emoji: '🦩', biome: 'wetlands', appeal: 8,  hp: 1, speed: 200, flee: 260, size: 34, rarity: 7,  group: [3, 6], behavior: 'skittish', swims: true },
  beaver:      { name: 'Beaver',       emoji: '🦫', biome: 'wetlands', appeal: 9,  hp: 2, speed: 110, flee: 170, size: 30, rarity: 5,  group: [1, 2], behavior: 'calm', swims: true },
  hippo:       { name: 'Hippo',        emoji: '🦛', biome: 'wetlands', appeal: 16, hp: 5, speed: 160, flee: 0, aggro: 200, size: 50, rarity: 3, group: [1, 3], behavior: 'aggressive', swims: true },
  crocodile:   { name: 'Crocodile',    emoji: '🐊', biome: 'wetlands', appeal: 18, hp: 4, speed: 200, flee: 0, aggro: 230, size: 46, rarity: 2, group: [1, 1], behavior: 'aggressive', swims: true },
  otter:       { name: 'Otter',        emoji: '🦦', biome: 'wetlands', appeal: 7,  hp: 1, speed: 180, flee: 210, size: 28, rarity: 8,  group: [2, 3], behavior: 'erratic', swims: true },
  swan:        { name: 'Swan',         emoji: '🦢', biome: 'wetlands', appeal: 10, hp: 2, speed: 170, flee: 240, size: 34, rarity: 6,  group: [2, 3], behavior: 'skittish', flies: true },
  baiji:       { name: 'Baiji River Dolphin', emoji: '🐬', biome: 'wetlands', appeal: 70, hp: 4, speed: 220, flee: 300, size: 46, rarity: 0, group: [1, 1], behavior: 'skittish', swims: true, legendary: true },

  monkey:      { name: 'Monkey',       emoji: '🐒', biome: 'jungle',   appeal: 8,  hp: 1, speed: 200, flee: 250, size: 30, rarity: 10, group: [2, 4], behavior: 'erratic' },
  parrot:      { name: 'Parrot',       emoji: '🦜', biome: 'jungle',   appeal: 9,  hp: 1, speed: 235, flee: 260, size: 28, rarity: 8,  group: [2, 3], behavior: 'erratic', flies: true },
  sloth:       { name: 'Sloth',        emoji: '🦥', biome: 'jungle',   appeal: 12, hp: 2, speed: 35,  flee: 80,  size: 32, rarity: 5,  group: [1, 1], behavior: 'calm' },
  orangutan:   { name: 'Orangutan',    emoji: '🦧', biome: 'jungle',   appeal: 15, hp: 3, speed: 150, flee: 220, size: 40, rarity: 4,  group: [1, 2], behavior: 'skittish' },
  gorilla:     { name: 'Gorilla',      emoji: '🦍', biome: 'jungle',   appeal: 20, hp: 4, speed: 130, flee: 0, aggro: 200, size: 44, rarity: 3, group: [1, 3], behavior: 'aggressive' },
  tiger:       { name: 'Tiger',        emoji: '🐅', biome: 'jungle',   appeal: 25, hp: 3, speed: 245, flee: 0, aggro: 270, size: 42, rarity: 2, group: [1, 1], behavior: 'aggressive' },
  peacock:     { name: 'Peacock',      emoji: '🦚', biome: 'jungle',   appeal: 11, hp: 1, speed: 200, flee: 240, size: 32, rarity: 7,  group: [1, 3], behavior: 'skittish' },
  panda:       { name: 'Panda',        emoji: '🐼', biome: 'jungle',   appeal: 22, hp: 3, speed: 60,  flee: 120, size: 40, rarity: 3,  group: [1, 2], behavior: 'calm' },
  tamarin:     { name: 'Golden Lion Tamarin', emoji: '🐒', biome: 'jungle', appeal: 80, hp: 3, speed: 270, flee: 300, size: 28, rarity: 0, group: [1, 1], behavior: 'erratic', legendary: true },

  lizard:      { name: 'Lizard',       emoji: '🦎', biome: 'desert',   appeal: 10, hp: 1, speed: 230, flee: 220, size: 24, rarity: 10, group: [1, 3], behavior: 'erratic' },
  scorpion:    { name: 'Scorpion',     emoji: '🦂', biome: 'desert',   appeal: 11, hp: 1, speed: 150, flee: 0, aggro: 140, size: 24, rarity: 8, group: [1, 2], behavior: 'aggressive' },
  camel:       { name: 'Camel',        emoji: '🐫', biome: 'desert',   appeal: 14, hp: 3, speed: 120, flee: 150, size: 46, rarity: 6,  group: [2, 4], behavior: 'calm' },
  kangaroo:    { name: 'Kangaroo',     emoji: '🦘', biome: 'desert',   appeal: 17, hp: 2, speed: 265, flee: 300, size: 38, rarity: 5,  group: [2, 3], behavior: 'erratic' },
  snake:       { name: 'Cobra',        emoji: '🐍', biome: 'desert',   appeal: 20, hp: 2, speed: 210, flee: 0, aggro: 220, size: 32, rarity: 3, group: [1, 1], behavior: 'aggressive' },
  rhino:       { name: 'Rhino',        emoji: '🦏', biome: 'desert',   appeal: 26, hp: 5, speed: 185, flee: 0, aggro: 240, size: 48, rarity: 2, group: [1, 1], behavior: 'aggressive' },
  hedgehog:    { name: 'Desert Hedgehog', emoji: '🦔', biome: 'desert', appeal: 12, hp: 1, speed: 140, flee: 180, size: 24, rarity: 8, group: [1, 3], behavior: 'erratic' },
  tortoise:    { name: 'Desert Tortoise', emoji: '🐢', biome: 'desert', appeal: 15, hp: 3, speed: 35, flee: 60, size: 34, rarity: 6, group: [1, 2], behavior: 'calm' },
  addax:       { name: 'Addax',        emoji: '🦌', biome: 'desert',   appeal: 90, hp: 4, speed: 280, flee: 340, size: 36, rarity: 0,  group: [1, 1], behavior: 'skittish', legendary: true },

  penguin:     { name: 'Penguin',      emoji: '🐧', biome: 'tundra',   appeal: 13, hp: 1, speed: 85,  flee: 200, size: 30, rarity: 10, group: [4, 7], behavior: 'skittish' },
  seal:        { name: 'Seal',         emoji: '🦭', biome: 'tundra',   appeal: 16, hp: 2, speed: 70,  flee: 160, size: 40, rarity: 7,  group: [2, 4], behavior: 'calm', swims: true },
  arcticfox:   { name: 'Arctic Fox',   emoji: '🦊', biome: 'tundra',   appeal: 18, hp: 1, speed: 255, flee: 300, size: 30, rarity: 6,  group: [1, 2], behavior: 'erratic' },
  polarbear:   { name: 'Polar Bear',   emoji: '🐻‍❄️', biome: 'tundra', appeal: 30, hp: 5, speed: 175, flee: 0, aggro: 250, size: 50, rarity: 3, group: [1, 1], behavior: 'aggressive' },
  snowleopard: { name: 'Snow Leopard', emoji: '🐆', biome: 'tundra',   appeal: 38, hp: 3, speed: 280, flee: 340, size: 38, rarity: 1,  group: [1, 1], behavior: 'skittish' },
  mammoth:     { name: 'Woolly Mammoth', emoji: '🦣', biome: 'tundra', appeal: 50, hp: 7, speed: 95,  flee: 120, size: 60, rarity: 1,  group: [1, 1], behavior: 'calm' },
  wolf:        { name: 'Arctic Wolf',  emoji: '🐺', biome: 'tundra',   appeal: 25, hp: 3, speed: 250, flee: 0, aggro: 260, size: 38, rarity: 5, group: [2, 4], behavior: 'aggressive' },
  owl:         { name: 'Snowy Owl',    emoji: '🦉', biome: 'tundra',   appeal: 22, hp: 1, speed: 230, flee: 260, size: 28, rarity: 6,  group: [1, 2], behavior: 'skittish', flies: true },
  amurleopard: { name: 'Amur Leopard', emoji: '🐆', biome: 'tundra',   appeal: 100, hp: 5, speed: 310, flee: 360, size: 40, rarity: 0, group: [1, 1], behavior: 'skittish', legendary: true },
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
// display in your enclosures. Tiers stay unlocked once reached. Tier N also gives you a
// permit for the Nth region of the wild (tier 1 = Savanna only).
// budget = what one upgrade's levels in that tier cost in total (× the upgrade's costMult).
// It's sized to roughly 15 safari trips of selling that tier's animals.
const TIERS = [
  { species: 0,  budget: 80 },     // tier 1: Savanna
  { species: 7,  budget: 320 },    // tier 2: Wetlands (7 of the 8 savanna species)
  { species: 13, budget: 1000 },   // tier 3: Jungle
  { species: 21, budget: 3200 },   // tier 4: Desert
  { species: 29, budget: 10000 },  // tier 5: Tundra
];

// Jeep & net upgrades. Each has many small levels, spread evenly across the 5 tiers
// (levels must be a multiple of 5). `per` describes one level's effect; the actual
// numbers live in Game.jeepStats().
const UPGRADES = {
  engine:      { name: 'Engine',          icon: '⚙️', per: '+4.5 top speed', levels: 50, costMult: 1.2 },
  fuel:        { name: 'Fuel Tank',       icon: '⛽', per: '+1.5s of fuel', levels: 50, costMult: 1.0 },
  tires:       { name: 'Off-road Tires',  icon: '🛞', per: 'Better steering, less slowdown in mud, sand, snow & water', levels: 50, costMult: 0.9 },
  cargo:       { name: 'Cargo Cage',      icon: '📦', per: '+1 animal per trip', levels: 10, costMult: 1.3 },
  netCount:    { name: 'Net Rack',        icon: '🧺', per: '+1 net per trip', levels: 30, costMult: 0.8 },
  netStrength: { name: 'Heavy Nets',      icon: '🕸️', per: '+0.03 net power (fewer nets per animal)', levels: 50, costMult: 1.5 },
  reload:      { name: 'Net Reloader',    icon: '🔄', per: 'Fire nets a little faster', levels: 50, costMult: 0.9 },
  netRange:    { name: 'Net Cannon',      icon: '🎯', per: 'Nets fly faster and further', levels: 50, costMult: 0.9 },
  armor:       { name: 'Armor Plating',   icon: '🛡️', per: '+4 max health, so you can take more crashes and charges', levels: 50, costMult: 1.1 },
  autoAim:     { name: 'Auto-Aim Turret', icon: '📡', per: 'Turret locks onto animals in a wider cone ahead. Fires by itself from level 21', levels: 50, costMult: 1.4 },
};

const ECON = {
  startMoney: 20,
  resourceNodesPerRegion: 5,     // resources are scarce: only a few nodes per region
  resourcePerNode: 2,
  enclosureResource: 10,   // building an enclosure also costs this much of its region's resource
  expandResource: 5,       // expanding one costs this much
  towFee: 10,
  startCapacity: 3,
  expandStep: 2,
  maxCapacity: 11,
  expandCostFactor: 0.6,   // expanding costs this × the enclosure's build cost
  plotCols: 4,
  plotRows: 3,
  // Price of each extra plot, in the order you buy them (you start owning one plot).
  landCosts: [20, 50, 100, 200, 400, 700, 1200, 2000, 3200, 5000, 8000],
  // ...plus resources, stepping through the regions as you buy more land.
  landResCosts: [
    { grass: 10 }, { grass: 20 }, { wood: 10 }, { wood: 20 }, { mushroom: 10 }, { mushroom: 20 },
    { cactus: 10 }, { cactus: 20 }, { ice: 10 }, { ice: 20 }, { ice: 40 },
  ],
  // Animals on display become more valuable over time (real play time): +growth per
  // minute, up to maxValueMult × their base value. Each expansion of the enclosure makes
  // growth faster and raises the cap.
  valueGrowthPerMin: 0.2,
  maxValueMult: 3,
  expandGrowthBonus: 0.5,  // +50% of the base growth rate per expansion
  expandCapBonus: 0.75,    // +0.75× to the cap per expansion
};

// One-off perks bought at the Garage.
const PERKS = {
  campRefill: {
    name: 'Camp Supply Depot', icon: '⛺',
    desc: 'Refill fuel and nets and repair the jeep whenever you drive back into base camp',
    cost: { money: 120, res: { grass: 25 } },
  },
};

// Auto-aim: cone half-angle in degrees for a given Auto-Aim Turret level; auto-fire from AUTO_FIRE_LEVEL.
const autoAimCone = (lvl) => (lvl > 0 ? 8 + (lvl - 1) * 1.9 : 0);
const AUTO_FIRE_LEVEL = 21;

// Tier (1-5) needed to buy level index `level` (0-based) of an upgrade.
function upgradeTier(key, level) {
  return 1 + Math.floor(level * TIERS.length / UPGRADES[key].levels);
}

// Highest level of an upgrade you can own at a given tier.
function upgradeCap(key, tier) {
  return UPGRADES[key].levels * tier / TIERS.length;
}

const niceRound = (n) => (n < 20 ? Math.max(1, Math.round(n)) : n < 200 ? Math.round(n / 5) * 5 : Math.round(n / 10) * 10);

// Each level costs its tier's budget split across the tier's levels, rising from 60% to 140%
// of the average within the tier.
function upgradeCost(key, level) {
  const u = UPGRADES[key], tier = upgradeTier(key, level);
  const perTier = u.levels / TIERS.length, i = level - (tier - 1) * perTier;
  const avg = TIERS[tier - 1].budget * u.costMult / perTier;
  return niceRound(avg * (0.6 + 0.8 * i / Math.max(1, perTier - 1)));
}

// Full price of an upgrade level: { money, res: { resourceKey: amount } }.
// Jeep upgrades cost money only; resources go into enclosures, land and perks.
function upgradeFullCost(key, level) {
  return { money: upgradeCost(key, level), res: {} };
}

// Add two costs together (used for "buy 5 levels").
function addCosts(a, b) {
  const res = { ...a.res };
  for (const [k, v] of Object.entries(b.res || {})) res[k] = (res[k] || 0) + v;
  return { money: (a.money || 0) + (b.money || 0), res };
}
