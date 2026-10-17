// Reel Rhythm balance data: fish species, fishing spots, tanks, decor and upgrades.
// Fish fights are rhythm charts: bpm sets the tempo, lvl (1-5) picks the patterns, lanes is 1 or 2,
// holds adds hold notes, and need is how many reel points (1 per perfect hit) land the fish.

const TEMPS = ['cold', 'temperate', 'tropical'];
const TEMP_LABEL = { cold: '❄️ Cold', temperate: '🌤️ Temperate', tropical: '🔥 Tropical' };
const WATER_LABEL = { fresh: '💧 Fresh', salt: '🧂 Salt' };

// size: 1 small, 2 medium, 4 large. big: needs a Large tank. likes: decor it wants.
// school: unhappy with fewer than 3 of its kind. aggro: scares other fish and may eat small ones at night.
const SPECIES = {
  // ---- Willow Pond (temperate, fresh) ----
  minnow:    { name: 'Minnow', spot: 'pond', rod: 1, size: 1, water: 'fresh', temp: 'temperate', likes: [], school: true,
    bpm: 84, lvl: 1, lanes: 1, need: 8, value: 6, w: 3,
    art: { len: 12, ht: 5, body: '#a8b8c0', belly: '#e0e8e8', fin: '#8898a0', pat: 'lineH', patCol: '#687880' } },
  goldfish:  { name: 'Goldfish', spot: 'pond', rod: 1, size: 1, water: 'fresh', temp: 'temperate', likes: ['plants'],
    bpm: 88, lvl: 1, lanes: 1, need: 10, value: 12, w: 3,
    art: { len: 13, ht: 9, body: '#f88820', belly: '#f8c048', fin: '#f8a040', shape: 'round', tail: 'fancy' } },
  bluegill:  { name: 'Bluegill', spot: 'pond', rod: 1, size: 2, water: 'fresh', temp: 'temperate', likes: ['plants'],
    bpm: 92, lvl: 2, lanes: 1, need: 12, value: 18, w: 2,
    art: { len: 17, ht: 11, body: '#5878a8', belly: '#e8a040', fin: '#486088', pat: 'stripes', patCol: '#3c5880', shape: 'tall' } },
  catfish:   { name: 'Catfish', spot: 'pond', rod: 2, size: 2, water: 'fresh', temp: 'temperate', likes: ['rocks'],
    bpm: 96, lvl: 2, lanes: 1, holds: true, need: 16, value: 35, w: 2,
    art: { len: 22, ht: 7, body: '#786048', belly: '#c8b090', fin: '#584430', shape: 'long', extra: 'whiskers' } },
  koi:       { name: 'Koi', spot: 'pond', rod: 2, size: 4, water: 'fresh', temp: 'temperate', likes: ['plants'],
    bpm: 100, lvl: 3, lanes: 1, need: 22, value: 70, w: 1.2,
    art: { len: 24, ht: 9, body: '#f4f0e0', belly: '#f8f8f0', fin: '#f8d8c8', pat: 'blotch', patCol: '#e85828', shape: 'long', extra: 'whiskers' } },
  pike:      { name: 'Northern Pike', spot: 'pond', rod: 3, size: 4, big: true, water: 'fresh', temp: 'temperate', likes: ['plants'], aggro: true,
    bpm: 112, lvl: 3, lanes: 2, need: 28, value: 140, w: 0.6,
    art: { len: 30, ht: 7, body: '#587838', belly: '#d8e0a8', fin: '#486028', pat: 'spots', patCol: '#c8d888', shape: 'long', extra: 'teeth' } },

  // ---- Pine River (cold, fresh) ----
  grayling:  { name: 'Grayling', spot: 'river', rod: 1, size: 1, water: 'fresh', temp: 'cold', likes: [], school: true,
    bpm: 100, lvl: 2, lanes: 1, need: 10, value: 16, w: 3,
    art: { len: 14, ht: 6, body: '#8890a8', belly: '#d8d8e8', fin: '#a058a0', pat: 'spots', patCol: '#404860', fin2: 'sail' } },
  trout:     { name: 'Rainbow Trout', spot: 'river', rod: 1, size: 2, water: 'fresh', temp: 'cold', likes: ['rocks'],
    bpm: 104, lvl: 2, lanes: 1, need: 14, value: 30, w: 3,
    art: { len: 20, ht: 7, body: '#90a878', belly: '#f0e8d8', fin: '#788860', pat: 'rainbow', patCol: '#e86890', shape: 'long' } },
  salmon:    { name: 'Salmon', spot: 'river', rod: 2, size: 4, water: 'fresh', temp: 'cold', likes: ['rocks'],
    bpm: 108, lvl: 3, lanes: 1, holds: true, need: 22, value: 85, w: 1.5,
    art: { len: 24, ht: 9, body: '#d05040', belly: '#f0c0a0', fin: '#58704c', shape: 'long', pat: 'spots', patCol: '#902820' } },
  sturgeon:  { name: 'Sturgeon', spot: 'river', rod: 3, size: 4, big: true, water: 'fresh', temp: 'cold', likes: ['rocks'],
    bpm: 112, lvl: 4, lanes: 1, holds: true, need: 30, value: 220, w: 0.5,
    art: { len: 32, ht: 8, body: '#606878', belly: '#c8c8c0', fin: '#484e5c', shape: 'long', pat: 'scutes', patCol: '#d0d0c8', extra: 'whiskers' } },

  // ---- Jungle Lagoon (tropical, fresh) ----
  tetra:     { name: 'Neon Tetra', spot: 'lake', rod: 1, size: 1, water: 'fresh', temp: 'tropical', likes: ['plants'], school: true,
    bpm: 110, lvl: 2, lanes: 1, need: 12, value: 22, w: 3,
    art: { len: 11, ht: 5, body: '#4890e8', belly: '#e83838', fin: '#c8d8e8', pat: 'neon', patCol: '#60f0f8' } },
  angelfish: { name: 'Angelfish', spot: 'lake', rod: 1, size: 2, water: 'fresh', temp: 'tropical', likes: ['plants'],
    bpm: 112, lvl: 3, lanes: 1, need: 16, value: 45, w: 2.5,
    art: { len: 17, ht: 13, body: '#e8e0c8', belly: '#f8f0d8', fin: '#d8d0b8', pat: 'stripes', patCol: '#303030', shape: 'diamond', fin2: 'long' } },
  discus:    { name: 'Discus', spot: 'lake', rod: 2, size: 2, water: 'fresh', temp: 'tropical', likes: ['plants'],
    bpm: 116, lvl: 3, lanes: 2, need: 18, value: 95, w: 1.5,
    art: { len: 16, ht: 15, body: '#e86830', belly: '#f0a050', fin: '#c85020', pat: 'waves', patCol: '#38a8d8', shape: 'disc' } },
  piranha:   { name: 'Piranha', spot: 'lake', rod: 2, size: 2, water: 'fresh', temp: 'tropical', likes: [], school: true, aggro: true,
    bpm: 126, lvl: 4, lanes: 1, need: 20, value: 70, w: 2,
    art: { len: 16, ht: 11, body: '#8890a0', belly: '#e04030', fin: '#606878', shape: 'tall', extra: 'teeth', pat: 'spots', patCol: '#b8c0c8' } },
  arowana:   { name: 'Silver Arowana', spot: 'lake', rod: 3, size: 4, big: true, water: 'fresh', temp: 'tropical', likes: [], aggro: true,
    bpm: 120, lvl: 4, lanes: 2, need: 30, value: 280, w: 0.5,
    art: { len: 32, ht: 8, body: '#c8d0d8', belly: '#f0f0f0', fin: '#a8b0b8', pat: 'scales', patCol: '#98a0b0', shape: 'long', extra: 'barbel' } },

  // ---- Coral Reef (tropical, salt) ----
  clownfish: { name: 'Clownfish', spot: 'reef', rod: 1, size: 1, water: 'salt', temp: 'tropical', likes: ['coral'],
    bpm: 116, lvl: 3, lanes: 1, need: 12, value: 55, w: 3,
    art: { len: 13, ht: 7, body: '#f87818', belly: '#f89838', fin: '#f87818', pat: 'clown', patCol: '#f8f8f8', shape: 'round' } },
  tang:      { name: 'Blue Tang', spot: 'reef', rod: 2, size: 2, water: 'salt', temp: 'tropical', likes: ['coral'],
    bpm: 120, lvl: 3, lanes: 2, need: 18, value: 95, w: 2,
    art: { len: 17, ht: 12, body: '#2858d8', belly: '#3870e8', fin: '#202838', pat: 'tang', patCol: '#182040', shape: 'tall', tailCol: '#f8d830' } },
  puffer:    { name: 'Pufferfish', spot: 'reef', rod: 2, size: 2, water: 'salt', temp: 'tropical', likes: ['rocks'],
    bpm: 108, lvl: 3, lanes: 1, holds: true, need: 18, value: 85, w: 2,
    art: { len: 15, ht: 13, body: '#d8c878', belly: '#f8f0d0', fin: '#b8a858', pat: 'spots', patCol: '#504828', shape: 'puff' } },
  lionfish:  { name: 'Lionfish', spot: 'reef', rod: 3, size: 2, water: 'salt', temp: 'tropical', likes: ['rocks'], aggro: true,
    bpm: 124, lvl: 4, lanes: 2, need: 24, value: 170, w: 1,
    art: { len: 18, ht: 10, body: '#f0e0d0', belly: '#f8f0e8', fin: '#d05038', pat: 'stripes', patCol: '#b83020', fin2: 'spines' } },

  // ---- The Deep (cold, salt) ----
  lantern:   { name: 'Lanternfish', spot: 'deep', rod: 2, size: 1, water: 'salt', temp: 'cold', likes: [], school: true,
    bpm: 128, lvl: 4, lanes: 1, need: 14, value: 75, w: 3,
    art: { len: 12, ht: 5, body: '#384868', belly: '#506088', fin: '#283450', pat: 'glow', patCol: '#78f8f0' } },
  angler:    { name: 'Anglerfish', spot: 'deep', rod: 3, size: 2, water: 'salt', temp: 'cold', likes: ['rocks'],
    bpm: 120, lvl: 4, lanes: 2, holds: true, need: 24, value: 250, w: 1.5,
    art: { len: 17, ht: 13, body: '#483838', belly: '#685050', fin: '#302424', shape: 'round', extra: 'lure', teeth: true } },
  swordfish: { name: 'Swordfish', spot: 'deep', rod: 4, size: 4, big: true, water: 'salt', temp: 'cold', likes: [],
    bpm: 138, lvl: 5, lanes: 2, need: 40, value: 520, w: 0.8,
    art: { len: 30, ht: 9, body: '#405878', belly: '#d0d8e0', fin: '#304460', shape: 'long', extra: 'sword', fin2: 'sail' } },
  oarfish:   { name: 'Giant Oarfish', spot: 'deep', rod: 4, size: 4, big: true, water: 'salt', temp: 'cold', likes: ['rocks'],
    bpm: 132, lvl: 5, lanes: 2, holds: true, need: 48, value: 950, w: 0.3, legendary: true,
    art: { len: 38, ht: 6, body: '#c8d0e0', belly: '#e8ecf4', fin: '#e83838', shape: 'ribbon', pat: 'spots', patCol: '#7888a0', fin2: 'crest' } },
};

const SPOTS = {
  pond:  { name: 'Willow Pond', icon: '🌳', need: null, blurb: 'Calm water and easy fish. Everything here is happy in a plain tank.' },
  river: { name: 'Pine River', icon: '🏔️', need: 'waders', blurb: 'Fast, cold mountain water. These fish need a chilled tank.' },
  lake:  { name: 'Jungle Lagoon', icon: '🌴', need: 'rowboat', blurb: 'Warm, colourful fish. They need a heated tank.' },
  reef:  { name: 'Coral Reef', icon: '🪸', need: 'motorboat', blurb: 'Bright saltwater fish. They need warm saltwater tanks.' },
  deep:  { name: 'The Deep', icon: '🌊', need: 'trawler', blurb: 'Cold, dark saltwater. Strange, valuable, and fast.' },
};

// Tank sizes: cap is total fish size units. Fish sizes: small 1, medium 2, large 4.
const TANKS = [
  { name: 'Small', cap: 3, cost: 30, w: 44, h: 30 },
  { name: 'Medium', cap: 6, cost: 110, w: 56, h: 36 },
  { name: 'Large', cap: 12, cost: 320, w: 68, h: 42 },
];
const DECOR = {
  plants: { name: 'Plants', icon: '🌿', cost: 10 },
  rocks:  { name: 'Rocks & caves', icon: '🪨', cost: 10 },
  coral:  { name: 'Coral', icon: '🪸', cost: 40, salt: true },
};
const CLEAN_COST = 5;      // per tank
const POWER_COST = 3;      // per heated or chilled tank, per night

// Upgrades. levels[i] is the cost of reaching level i+1. need: other upgrades required first.
// Rods are a hard gate: a fish with rod > your rod level snaps the line.
const UPGRADES = {
  rod:       { cat: 'Fishing', name: 'Fishing Rod', icon: '🎣', levels: [180, 650, 2200], base: 1,
    names: ['Bamboo Rod', 'Fiberglass Rod', 'Carbon Rod', 'Titanium Rod'],
    desc: (l) => `Stronger rods hold bigger fish. Rod ${l} can land fish that need rod ${l} or less.` },
  reel:      { cat: 'Fishing', name: 'Smooth Reel', icon: '⚙️', levels: [90, 300, 800],
    desc: () => 'Wider timing window: hits count as Perfect or Good more easily.' },
  line:      { cat: 'Fishing', name: 'Strong Line', icon: '🧵', levels: [70, 240, 700],
    desc: () => 'The line takes more misses before it snaps.' },
  bait:      { cat: 'Fishing', name: 'Bait Box', icon: '🪱', levels: [100, 350, 900],
    desc: (l) => `More casts per fishing trip (${4 + l * 1} now).` },
  cooler:    { cat: 'Fishing', name: 'Cooler', icon: '🧊', levels: [60, 220, 650],
    desc: (l) => `Carry more fish home per trip (${coolerCap(l)} now).` },

  waders:    { cat: 'Travel', name: 'Waders', icon: '🥾', levels: [150], desc: () => 'Wade into Pine River (cold-water fish).' },
  rowboat:   { cat: 'Travel', name: 'Rowboat', icon: '🛶', levels: [450], need: { waders: 1 }, desc: () => 'Row out on the Jungle Lagoon (tropical fish).' },
  motorboat: { cat: 'Travel', name: 'Motorboat', icon: '🚤', levels: [1400], need: { rowboat: 1 }, desc: () => 'Reach the Coral Reef (saltwater fish).' },
  trawler:   { cat: 'Travel', name: 'Trawler', icon: '🚢', levels: [4000], need: { motorboat: 1 }, desc: () => 'Head out to The Deep (deep-sea fish).' },

  chiller:   { cat: 'Shop', name: 'Tank Chillers', icon: '❄️', levels: [120], desc: () => 'Lets you set tanks to Cold (river and deep-sea fish).' },
  heater:    { cat: 'Shop', name: 'Tank Heaters', icon: '🔥', levels: [200], desc: () => 'Lets you set tanks to Tropical (lagoon and reef fish).' },
  salt:      { cat: 'Shop', name: 'Saltwater Kit', icon: '🧂', levels: [700], need: { heater: 1 }, desc: () => 'Lets you fill tanks with saltwater and add coral.' },
  slots:     { cat: 'Shop', name: 'Shop Expansion', icon: '🏗️', levels: [200, 600, 1600],
    desc: (l) => `Room for more tanks (${tankSlots(l)} now).` },
  filter:    { cat: 'Shop', name: 'Better Filters', icon: '🫧', levels: [120, 400, 1000],
    desc: () => 'Tanks get dirty more slowly.' },
  ads:       { cat: 'Shop', name: 'Advertising', icon: '📣', levels: [80, 300, 900],
    desc: () => 'More customers visit every day.' },
  cashier:   { cat: 'Shop', name: 'Hire a Cashier', icon: '🧑‍💼', levels: [350],
    desc: () => 'Customers at the counter are rung up automatically.' },
};

const coolerCap = (l) => [3, 5, 8, 12][l];
const tankSlots = (l) => [2, 3, 4, 6][l];
const castsPerTrip = (l) => 4 + l;

// Rent is due every 7th night and grows each week.
const rentFor = (week) => Math.round((50 + 60 * Math.pow(week - 1, 1.5)) / 5) * 5;
// Customers want happier fish as the days go on.
const minHappy = (day) => Math.min(0.7, 0.2 + day * 0.02);
