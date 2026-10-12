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

// dims are in meters; stats: max speed (m/s), accel (m/s^2), turn (rad/s), offroad (speed multiplier on grass)
export const BODIES = {
  racer: {
    name: 'Racer',
    style: 'racer',
    dims: { w: 1.8, l: 4.0, h: 0.55, clear: 0.35, cabinL: 1.7, cabinH: 0.5, cabinZ: -0.2, wheelD: 0.7, wheelW: 0.35, wheelX: 0.95, wheelZf: 1.3, wheelZr: -1.3 },
    stats: { max: 40, accel: 24, brake: 40, turn: 2.3, offroad: 0.5 },
  },
  muscle: {
    name: 'Muscle',
    style: 'muscle',
    dims: { w: 2.0, l: 4.4, h: 0.7, clear: 0.35, cabinL: 1.8, cabinH: 0.55, cabinZ: -0.4, wheelD: 0.8, wheelW: 0.42, wheelX: 1.05, wheelZf: 1.45, wheelZr: -1.45 },
    stats: { max: 45, accel: 21, brake: 38, turn: 2.0, offroad: 0.5 },
  },
  buggy: {
    name: 'Buggy',
    style: 'buggy',
    dims: { w: 1.7, l: 3.2, h: 0.45, clear: 0.6, cabinL: 1.3, cabinH: 0.8, cabinZ: -0.3, wheelD: 1.0, wheelW: 0.45, wheelX: 1.0, wheelZf: 1.1, wheelZr: -1.1 },
    stats: { max: 38, accel: 28, brake: 42, turn: 2.6, offroad: 0.85 },
  },
};

// Control points (x, z) for closed Catmull-Rom loops. Width is road width in meters.
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
  },
  twisty: {
    name: 'Twisty Woods',
    width: 14,
    ground: '#5fae55',
    points: [
      [0, -80], [90, -90], [140, -50], [130, 10], [80, 20], [60, 60], [90, 100],
      [40, 130], [-40, 120], [-70, 70], [-130, 60], [-140, -10], [-100, -60],
    ],
  },
  lake: {
    name: 'Lake Loop',
    width: 14,
    ground: '#8fcf6a',
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
  [9, 'color', 'purple'],
  [10, 'body', 'buggy'],
  [12, 'track', 'lake'],
  [13, 'color', 'pink'],
  [15, 'color', 'yellow'],
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
