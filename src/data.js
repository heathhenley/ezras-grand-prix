// All the tweakable game content lives here: cars, paint, wheels, tracks, and the unlock ladder.

export const LAPS = 2;

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
  formula: { name: 'Formula', scale: 1.6, stats: { max: 46, accel: 27, brake: 46, turn: 2.5, offroad: 0.4 } },
  future: { name: 'Super Sport', scale: 1.6, stats: { max: 49, accel: 30, brake: 48, turn: 2.6, offroad: 0.45 } },
};

// Control points (x, z) for closed Catmull-Rom loops. Width is road width in meters.
// scenery lists which models from src/scenery.json get scattered around (repeat a name to see more of it).
// dress: the race-day dressing built in venue.js. style: speedway / woods / site / jungle / trip (colours of
// the stands, tyre walls or barriers on the bends...). stands: how many grandstands by the start.
// far: what fills the horizon (trees, pines, city, jungle, snow, none). The rest are extras for that track.
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
    balloons: 3,
    dress: { style: 'speedway', stands: 2, pits: true, blimp: true, ferris: [-45, -5], far: 'city' },
    // boost pads: [how far round the lap 0..1, meters left(-)/right(+) of the middle]. Tracks without
    // boosts (or stars) get them placed automatically on the straights and before the jumps (see pickups.js).
    boosts: [[0.08, -3], [0.45, 3], [0.55, -3]],
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
    crossers: [['deer', 0.19], ['rabbit', 0.295], ['stag', 0.51], ['fox', 0.73], ['deer', 0.83]], // animals walking across the road: [kind, how far round the lap]
    // rolling hills: up through the trees, a whoop at 0.5 that gives a little float, flat under the footbridge,
    // then down into a hollow (heights: [fraction round the lap, meters], see addElevation in trackmath.js)
    heights: [[0, 0], [0.06, 0], [0.17, 6], [0.21, 6], [0.3, 1], [0.36, 1], [0.44, 2], [0.46, 3], [0.5, 5], [0.54, 3], [0.6, 0], [0.66, 0], [0.79, -3], [0.84, -3], [0.93, 0]],
    dress: { style: 'woods', stands: 1, bridge: 0.62, cabin: true, toadstools: 45, logs: 30, woodFence: true, far: 'pines' },
    animals: { deer: 7, stag: 4, bear: 3, fox: 6, rabbit: 12, birds: 3 }, // birds = flocks overhead
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
  // machines: diggers and trucks driving back and forth across the road: [kind from MACHINES, how far round
  // the lap]. Keep them off the jumps.
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
    // dirt mounds between the jumps (the jumps themselves sit on the flat; heights: see twisty)
    heights: [[0, 0], [0.17, 0], [0.21, 4], [0.245, 4], [0.3, 0], [0.36, 0], [0.42, 6], [0.47, 6], [0.525, 0], [0.57, 0], [0.62, -2.5], [0.675, 0], [0.72, 0], [0.77, 3], [0.85, 3], [0.94, 0]],
    machines: [['tractor-shovel', 0.25], ['truck-flat', 0.4], ['tractor', 0.8], ['tractor-shovel', 0.92]],
    site: {
      cranes: [[-95, -18], [128, -22]],
      frames: [[15, -40, 4], [-160, 8, 2], [72, -8, 3]],
      parked: 24, // machines parked beside the road
    },
    dress: { style: 'site', stands: 1, site: true, far: 'city' },
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
  // inRoad: giant things standing in that land's stretch of road to steer round: { kind, count, r: how
  // wide it is to hit, in meters }. The kinds are built in world.js.
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
    // a rise in the desert, and a snowy hill with the switchback on top (flat round the axolotl pond and the beach)
    heights: [[0, 0], [0.18, 0], [0.23, 4], [0.26, 4], [0.3, 0], [0.66, 0], [0.72, 5], [0.79, 5], [0.85, 0]],
    // buttes: big layered rock towers out in the New Mexico desert: [x, z, radius, height, seed]
    dress: { style: 'trip', stands: 2, buttes: [[335, -55, 34, 48, 1], [372, 118, 48, 64, 2], [318, 240, 30, 40, 3], [430, -190, 52, 74, 4], [175, 300, 40, 46, 5], [130, -310, 44, 56, 6], [470, 40, 40, 60, 7], [265, -265, 30, 36, 8], [520, 230, 60, 85, 9], [80, 420, 55, 70, 10]] },
    lands: [
      {
        area: [-700, 0, -700, 0],
        name: 'Rhode Island',
        motto: 'The Ocean State',
        ground: '#7cc464',
        far: 'trees',
        inRoad: { kind: 'lemonade', count: 3, r: 1.1 }, // cups of Del's frozen lemonade
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
        far: 'snow',
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
        far: 'none', // the buttes in dress fill this horizon
        hills: ['#b58f84', '#c4835c'],
        balloons: 8,
        inRoad: { kind: 'chile', count: 5, r: 0.9 }, // green chiles
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
  // A pretzel of three loops that crosses itself twice: once on a tall bridge, once with a leap clean over
  // the road below. heights: [fraction round the lap, meters] keys, eased from one to the next (see
  // addElevation in trackmath.js). leaps: [fraction] where the road jumps over itself. Bridges are found by
  // themselves wherever the road passes over itself.
  skybridge: {
    name: 'Sky Bridge',
    width: 15,
    ground: '#78c45a',
    balloons: 5,
    points: [
      [-223.1, 0], [-218.5, 23.2], [-205.3, 42.8], [-185.7, 55.9], [-162.6, 60.5], [-139.4, 55.9], [-119.8, 42.8], [-98.4, 21.4],
      [-77, 0], [-57.9, -15.2], [-36, -25.8], [-12.2, -31.2], [12.2, -31.2], [36, -25.8], [57.9, -15.2], [77, 0], [98.4, 21.4],
      [119.8, 42.8], [139.4, 55.9], [162.6, 60.5], [185.7, 55.9], [205.3, 42.8], [218.5, 23.2], [223.1, 0], [218.5, -23.2],
      [205.3, -42.8], [185.7, -55.9], [162.6, -60.5], [139.4, -55.9], [119.8, -42.8], [98.4, -21.4], [77, 0], [57.9, 15.2],
      [36, 25.8], [12.2, 31.2], [-12.2, 31.2], [-36, 25.8], [-57.9, 15.2], [-77, 0], [-98.4, -21.4], [-119.8, -42.8],
      [-139.4, -55.9], [-162.6, -60.5], [-185.7, -55.9], [-205.3, -42.8], [-218.5, -23.2],
    ],
    // up the left loop onto the bridge (0.176), down under the leap (0.324), over a bump and up round the
    // right loop to the leap (0.676), then down under the bridge (0.824) and home
    heights: [[0, 0], [0.05, 0], [0.15, 6.5], [0.205, 6.5], [0.295, -1.5], [0.35, -1.5], [0.42, 2.5], [0.437, 3.6], [0.455, 2.2],
      [0.53, 3], [0.635, 6.5], [0.668, 6.5], [0.7, 6.1], [0.795, -1.5], [0.855, -1.5], [0.95, 0]],
    leaps: [0.676],
    boosts: [[0.06, 0], [0.38, -3], [0.6, 0], [0.9, 3]],
    dress: { style: 'speedway', stands: 2, far: 'trees' },
    scenery: {
      treeCount: 260,
      trees: ['tree_oak', 'tree_detailed', 'tree_default', 'tree_fat', 'tree_tall', 'tree_plateau'],
      small: ['plant_bushLarge', 'plant_bushDetailed', 'stone_largeB'],
    },
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
    animals: { trex: 4, stego: 5, threehorn: 5, longneck: 4, parasaur: 6, raptor: 9, pterosaurs: 4 },
    animalsAt: [{ kind: 'longneck', x: 15, z: 5, yaw: 2.4 }], // wading in the lake
    crossers: [['stego', 0.22], ['trex', 0.32], ['parasaur', 0.42], ['threehorn', 0.6], ['raptor', 0.69], ['raptor', 0.9]], // dinosaurs walking across the road (keep them off the jumps)
    colors: { rock: '#6d625c', stone: '#8a7f78' },
    dress: { style: 'jungle', stands: 1, arches: [0.13, 0.57], nests: 4, far: 'jungle' },
    scenery: {
      treeCount: 340,
      treeSize: [8, 16],
      smallCount: 560, // thick jungle ferns
      trees: ['tree_palmTall', 'tree_palmDetailedTall', 'tree_palmBend', 'tree_palmShort', 'tree_palmDetailedShort', 'tree_palmDetailedTall'],
      small: ['rock_largeA', 'plant_flatTall', 'plant_flatTall', 'plant_bushLarge', 'plant_bushDetailed', 'plant_flatTall', 'plant_bushDetailed', 'rock_tallA'],
    },
    points: [
      [-150, 0], [-120, -70], [-40, -100], [40, -70], [110, -100], [160, -40],
      [140, 40], [70, 60], [20, 110], [-60, 110], [-120, 70],
    ],
  },
};

// Building-site machines (shapes in src/props.json). tall: height in meters. girth: how wide it is to
// crash into, in meters, and pace: how fast it drives, in m/s (for the ones crossing the road).
export const MACHINES = {
  'tractor-shovel': { tall: 3.6, girth: 2.2, pace: 3 },
  'truck-flat': { tall: 3.1, girth: 2.3, pace: 4 },
  'garbage-truck': { tall: 3.9, girth: 2.6, pace: 3.5 },
  tractor: { tall: 3.6, girth: 1.9, pace: 2.5 },
};

// [wins needed, kind, id]  — wins needed 0 means you start with it.
// The first wins go track, upgrade, track, upgrade... until every track is open.
export const UNLOCKS = [
  [0, 'body', 'racer'], [0, 'color', 'red'], [0, 'color', 'blue'], [0, 'wheels', 'black'],
  [0, 'spoiler', 'none'], [0, 'track', 'oval'],
  [1, 'track', 'twisty'],
  [2, 'color', 'orange'],
  [3, 'track', 'construction'],
  [4, 'wheels', 'chrome'],
  [5, 'track', 'lake'],
  [6, 'body', 'muscle'],
  [7, 'track', 'roadtrip'],
  [8, 'spoiler', 'small'],
  [9, 'track', 'skybridge'],
  [9, 'color', 'green'],
  [10, 'wheels', 'gold'],
  [11, 'body', 'buggy'],
  [12, 'spoiler', 'wing'],
  [13, 'color', 'purple'],
  [14, 'body', 'formula'],
  [15, 'color', 'pink'],
  [16, 'color', 'yellow'],
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
