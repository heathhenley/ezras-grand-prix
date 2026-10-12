// Progress lives in localStorage on the device. No accounts, no servers.

const KEY = 'backyard-gp-save-v1';

const DEFAULT = {
  wins: 0,
  races: 0,
  level: 0, // rival level, see difficulty() in ai.js
  streak: 0, // wins in a row
  track: 'oval',
  autoGas: true,
  sound: true,
  tilt: false, // steer by tipping the tablet
  car: { body: 'racer', color: 'red', wheels: 'black', spoiler: 'none' },
};

const clone = (o) => JSON.parse(JSON.stringify(o));

export function loadSave() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && typeof s === 'object') return { ...clone(DEFAULT), ...s, car: { ...DEFAULT.car, ...s.car } };
  } catch {}
  return clone(DEFAULT);
}

export function writeSave(s) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {}
}
