// All the tweakable game content lives here: cars, paint, wheels, tracks, and the unlock ladder.

export const LAPS = 3;

export const COLORS = {
  red: { name: 'Red', hex: '#e63946' },
  blue: { name: 'Blue', hex: '#2f6fed' },
  orange: { name: 'Orange', hex: '#ff8c1a' },
  green: { name: 'Green', hex: '#2fbf71' },
  purple: { name: 'Purple', hex: '#8e44ec' },
  pink: { name: 'Pink', hex: '#ff5fa2' },
  yellow: { name: 'Yellow', hex: '#ffd60a' },
  black: { name: 'Midnight', hex: '#23262d' },
};

export const WHEELS = {
  black: { name: 'Street', rim: '#4a4f57' },
  chrome: { name: 'Chrome', rim: '#e3e9f0' },
  gold: { name: 'Gold', rim: '#e8b923' },
};

export const SPOILERS = {
  none: { name: 'None' },
  small: { name: 'Lip' },
  wing: { name: 'Big Wing' },
};

// The car shapes come from src/cars.json (built by tools/build-cars.mjs); scale sizes them up to meters.
// stats: max speed (m/s), accel (m/s^2), turn (rad/s), offroad (speed multiplier on grass)
export const BODIES = {
  racer: { name: 'Racer', scale: 1.55, stats: { max: 40, accel: 24, brake: 40, turn: 2.3, offroad: 0.5 } },
  muscle: { name: 'Rally', scale: 1.5, stats: { max: 45, accel: 21, brake: 38, turn: 2.0, offroad: 0.5 } },
  buggy: { name: 'Truck', scale: 1.45, stats: { max: 38, accel: 28, brake: 42, turn: 2.6, offroad: 0.85 } },
  formula: { name: 'Formula', scale: 1.6, stats: { max: 48, accel: 27, brake: 46, turn: 2.5, offroad: 0.4 } },
  future: { name: 'Super Sport', scale: 1.6, stats: { max: 52, accel: 30, brake: 48, turn: 2.6, offroad: 0.45 } },
};

// Control points (x, z) for closed Catmull-Rom loops. Width is road width in meters.
// scenery lists which models from src/scenery.json get scattered around (repeat a name to see more of it).
function ellipse(rx, rz, n) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    pts.push([Math.sin(a) * rx, Math.cos(a) * rz]);
  }
  return pts;
}

export const TRACKS = {
  oval: {
    name: 'Sunny Oval',
    width: 16,
    ground: '#7cc464',
    points: ellipse(130, 70, 14),
    scenery: {
      trees: ['tree_oak', 'tree_detailed', 'tree_default', 'tree_fat', 'tree_tall', 'tree_plateau'],
      small: ['plant_bushLarge', 'plant_bushDetailed', 'stone_largeB'],
    },
  },
  twisty: {
    name: 'Twisty Woods',
    width: 14,
    ground: '#4f9c4b',
    obstacles: 8, // trees growing in the road that you can crash into
    crossers: [['deer', 0.19], ['stag', 0.51], ['fox', 0.73]], // animals walking across the road: [kind, how far round the lap]
    animals: { deer: 5, stag: 3, bear: 2, fox: 4, rabbit: 9, birds: 2 }, // birds = flocks overhead
    scenery: {
      treeCount: 950, // a proper forest
      treeGap: 7, // and it comes right up to the road
      treeSize: [8, 17],
      smallCount: 260,
      trees: ['tree_pineDefaultA', 'tree_pineRoundC', 'tree_pineTallA_detailed', 'tree_pineRoundC', 'tree_oak', 'tree_detailed', 'tree_pineDefaultA'],
      small: ['plant_bushLarge', 'plant_bushDetailed', 'plant_bushDetailed', 'rock_largeA', 'stone_tallD'],
    },
    points: [
      [0, -80], [90, -90], [140, -50], [130, 10], [80, 20], [60, 60], [90, 100],
      [40, 130], [-40, 120], [-70, 70], [-130, 60], [-140, -10], [-100, -60],
    ],
  },
  // jumps: [x, z] spots on the road where a ramp goes (put them on straights). site: cranes [x, z] and
  // half-built steel frames [x, z, floors], which should sit well clear of the road.
  construction: {
    name: 'Construction Site',
    width: 15,
    surface: 'sand',
    ground: '#9b7248', // bare earth
    points: [
      [-170, -90], [-60, -100], [60, -100], [170, -90], [218, -30], [195, 45], [140, 74], [75, 74],
      [32, 36], [-30, 62], [-110, 100], [-190, 70], [-218, -10],
    ],
    jumps: [[-10, -100], [100, 75], [-45, 70]],
    site: {
      cranes: [[-95, -18], [128, -22]],
      frames: [[15, -40, 4], [-160, 8, 2], [72, -8, 3]],
    },
    colors: { rock: '#8a6a45', stone: '#9c7b52', bush: '#6f8f4a' }, // rocks become heaps of earth
    scenery: {
      treeCount: 70,
      trees: ['tree_oak', 'tree_default', 'tree_fat', 'tree_pineDefaultA'],
      small: ['rock_largeA', 'rock_largeD', 'stone_largeB', 'rock_tallF', 'rock_largeA'],
    },
  },
  // A road trip. The map is split into lands, each covering a rectangle [west, east, south, north]
  // with its own ground and scenery. A road sign goes up wherever the road enters a land with a new name.
  // The lap runs: Rhode Island summer -> New Mexico -> Rhode Island winter -> back to summer.
  roadtrip: {
    name: 'Rhode Trip',
    width: 14,
    points: [
      [-160, -130], [-60, -140], [20, -115], [110, -140], [200, -130], [255, -70], [254, 15],
      [250, 62], [228, 90], [204, 64], // desert hairpin, wrapped around the axolotl pond
      [200, 8], [172, -26], [118, -20], [84, 40], [70, 110], [10, 150], [-70, 138], [-140, 152], [-212, 112],
      [-218, 58], [-200, 28], [-172, 24], [-152, 46], [-150, 78], [-127, 97], [-104, 76], // snowy switchback
      [-98, 20], [-116, -32], [-165, -48], [-215, -45], [-235, -95],
    ],
    ocean: { x: -288, side: -1 }, // the beach starts here and the sea lies to the west of it
    lands: [
      {
        area: [-700, 0, -700, 0],
        name: 'Rhode Island',
        motto: 'The Ocean State',
        ground: '#7cc464',
        scenery: {
          trees: ['tree_oak', 'tree_detailed', 'tree_default', 'tree_fat', 'tree_plateau', 'tree_pineDefaultA'],
          small: ['plant_bushLarge', 'plant_bushDetailed', 'stone_largeB'],
        },
      },
      {
        area: [-700, 0, 0, 700],
        name: 'Rhode Island', // same state, so no sign: just winter
        motto: 'The Ocean State',
        surface: 'snow',
        ground: '#eef4fb',
        hills: ['#c3d1e0', '#e2eaf2'],
        snowmen: 8,
        colors: { leaf: '#dfe8f0', pine: '#e3ecf3', bark: '#4b3a30', bush: '#e6eef5', rock: '#98a2ad', stone: '#eef3f8' },
        scenery: {
          trees: ['tree_pineRoundC', 'tree_pineTallA_detailed', 'tree_pineDefaultA', 'tree_pineDefaultA', 'tree_default'],
          small: ['stone_largeB', 'rock_largeA', 'plant_bushLarge'],
        },
      },
      {
        area: [0, 700, -700, 700],
        name: 'New Mexico',
        motto: 'Land of Enchantment',
        surface: 'sand',
        ground: '#e2a468',
        mesas: true, // flat-topped hills on the horizon
        hills: ['#b58f84', '#c4835c'],
        balloons: 8,
        axolotl: { x: 227, z: 34, yaw: Math.PI, size: 2 }, // giant pink one in a pond, inside the hairpin
        colors: { leaf: '#5b9a50', bush: '#8f9352', rock: '#b4683f', stone: '#cf9a6c' },
        scenery: {
          treeSize: [3, 7],
          trees: ['cactus_tall', 'cactus_tall', 'cactus_short', 'cactus_tall', 'rock_tallA', 'rock_tallF'],
          small: ['cactus_short', 'rock_largeD', 'rock_largeA', 'plant_bushLarge', 'rock_tallC'],
        },
      },
    ],
  },
  lake: {
    name: 'Dino Lake',
    width: 14,
    ground: '#6f9a2c', // deep mossy green
    groundMix: 0.75,
    // a hot, hazy, volcanic sky: haze = colour the distance fades into, fog = how thick, tint = [colour, strength]
    // washed over the sky, sun = colour of the sunlight
    sky: { haze: '#e2bd96', fog: 0.0042, tint: ['#ff8440', 0.26], sun: '#ffcf9a', bright: 0.95 },
    hills: ['#b79a8c', '#8f9a62'],
    lake: true, // fills the middle of the loop with water
    jumps: [[-92, -88], [160, -10], [-24, 116]],
    jumpStyle: 'lava', // rock ramps over rivers of lava instead of building-site trenches
    volcano: { x: 70, z: 360 },
    animals: { trex: 3, stego: 4, threehorn: 4, longneck: 3, parasaur: 4, raptor: 6, pterosaurs: 3 },
    animalsAt: [{ kind: 'longneck', x: 15, z: 5, yaw: 2.4 }], // wading in the lake
    crossers: [['stego', 0.3], ['parasaur', 0.42], ['threehorn', 0.64], ['raptor', 0.9]], // dinosaurs walking across the road
    colors: { rock: '#6d625c', stone: '#8a7f78' },
    scenery: {
      treeCount: 340,
      treeSize: [8, 16],
      trees: ['tree_palmTall', 'tree_palmDetailedTall', 'tree_palmBend', 'tree_palmShort', 'tree_palmDetailedShort', 'tree_palmDetailedTall'],
      small: ['rock_largeA', 'rock_tallC', 'plant_flatTall', 'plant_bushLarge', 'plant_bushDetailed', 'rock_tallA'],
    },
    points: [
      [-150, 0], [-120, -70], [-40, -100], [40, -70], [110, -100], [160, -40],
      [140, 40], [70, 60], [20, 110], [-60, 110], [-120, 70],
    ],
  },
};

// [wins needed, kind, id]  — wins needed 0 means you start with it.
export const UNLOCKS = [
  [0, 'body', 'racer'], [0, 'color', 'red'], [0, 'color', 'blue'], [0, 'wheels', 'black'],
  [0, 'spoiler', 'none'], [0, 'track', 'oval'],
  [1, 'color', 'orange'],
  [2, 'wheels', 'chrome'],
  [3, 'spoiler', 'small'],
  [4, 'body', 'muscle'],
  [5, 'track', 'twisty'],
  [6, 'color', 'green'],
  [7, 'wheels', 'gold'],
  [8, 'spoiler', 'wing'],
  [8, 'track', 'construction'],
  [9, 'color', 'purple'],
  [10, 'body', 'buggy'],
  [11, 'track', 'lake'],
  [12, 'track', 'roadtrip'],
  [13, 'color', 'pink'],
  [14, 'body', 'formula'],
  [15, 'color', 'yellow'],
  [18, 'body', 'future'],
  [20, 'color', 'black'],
];

const TABLES = { body: BODIES, color: COLORS, wheels: WHEELS, spoiler: SPOILERS, track: TRACKS };
export const KIND_LABEL = { body: 'Car', color: 'Paint', wheels: 'Wheels', spoiler: 'Spoiler', track: 'Track' };

export function itemName(kind, id) {
  return TABLES[kind][id].name;
}

export function winsNeeded(kind, id) {
  const u = UNLOCKS.find((u) => u[1] === kind && u[2] === id);
  return u ? u[0] : Infinity;
}

export function isUnlocked(kind, id, wins) {
  return wins >= winsNeeded(kind, id);
}

export function unlocksBetween(prevWins, wins) {
  return UNLOCKS.filter((u) => u[0] > prevWins && u[0] <= wins);
}

export function nextUnlock(wins) {
  return UNLOCKS.find((u) => u[0] > wins);
}
