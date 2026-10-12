// Opponent driving: chase a point a little way down the road, slow down for bends.
import { wrapAngle } from './trackmath.js';

export const MAX_LEVEL = 10;

// How good the opponents are at each rival level (0 = gentle, MAX_LEVEL = tough).
// The level goes up when the player wins and down when they finish 3rd or 4th (see main.js).
export function difficulty(level) {
  const t = Math.max(0, Math.min(MAX_LEVEL, level)) / MAX_LEVEL;
  return {
    skills: [0.85, 0.89, 0.93].map((s) => s + 0.12 * t), // share of top speed each opponent aims for
    maxScale: 1 + 0.1 * t, // how far past the normal top speed they may go when chasing
    caution: 0.43 - 0.4 * t, // how much they slow for bends
    easeOff: 0.17 - 0.14 * t, // how much they wait for the player when ahead
    catchUp: 0.05 + 0.07 * t, // how hard they push when behind
    line: t, // 0 = wander around the road, 1 = cut every corner on the inside
  };
}
const EASY = difficulty(0);

// cars: everyone in the race, so the driver can steer round the car in front
export function aiControls(c, track, hw, dt, rubber = 1, cars = []) {
  const { samples, count } = track;
  const ai = c.ai ?? EASY;

  // which way the road bends ahead: + is a right-hander, - a left-hander
  const turn = wrapAngle(samples[(c.idx + 20) % count].heading - samples[(c.idx + 4) % count].heading);

  // drift lanes now and then so they don't drive single-file
  c.laneTimer = (c.laneTimer ?? 0) - dt;
  if (c.laneTimer <= 0) {
    c.laneTimer = 3 + Math.random() * 4;
    c.laneWander = (Math.random() * 2 - 1) * hw * 0.45;
  }
  // better drivers hug the inside of the bend instead of wandering
  const apex = Math.max(-1, Math.min(1, turn * 3)) * hw * 0.6;
  const hug = ai.line * Math.min(1, Math.abs(turn) * 4);
  c.laneTarget = (c.laneWander ?? 0) * (1 - hug) + apex * hug;
  c.lane = (c.lane ?? 0) + ((c.laneTarget ?? 0) - (c.lane ?? 0)) * Math.min(1, dt * 0.8);

  // pull out to pass a car that is just ahead in the same lane, instead of driving into the back of it
  let dodge = 0;
  for (const o of cars) {
    if (o === c) continue;
    const ahead = (o.idx - c.idx + count) % count; // in track samples, 2 m each
    const side = o.lateral - c.lateral;
    if (ahead < 1 || ahead > 9 || Math.abs(side) > 2.6 || o.speed > c.speed + 2) continue;
    // go round whichever side it is not on; if it is dead ahead, the side with more road
    dodge = (Math.abs(side) > 0.3 ? -Math.sign(side) : o.lateral > 0 ? -1 : 1) * 3;
  }
  c.dodge = (c.dodge ?? 0) + (dodge - (c.dodge ?? 0)) * Math.min(1, dt * 3);
  const lane = Math.max(-hw + 1.5, Math.min(hw - 1.5, c.lane + c.dodge));

  const look = (c.idx + 5 + Math.floor(Math.max(0, c.speed) * 0.25)) % count;
  const t = samples[look];
  const tx = t.x + t.rx * lane, tz = t.z + t.rz * lane;
  const diff = wrapAngle(Math.atan2(tx - c.x, tz - c.z) - c.h);
  const steer = Math.max(-1, Math.min(1, diff * 3));

  let bend = 0;
  for (let k = 0; k <= 24; k += 8) bend = Math.max(bend, samples[(c.idx + k) % count].curve);
  const target = c.stats.max * c.skill * rubber * (1 - Math.min(0.5, bend * ai.caution));

  return { steer, throttle: c.speed < target ? 1 : 0, brake: c.speed > target + 4 ? 1 : 0 };
}

// Keeps races close: opponents ease off when far ahead of the player, push a bit when behind.
export function rubberBand(aiProgress, playerProgress, ai = EASY) {
  const gap = playerProgress - aiProgress; // + means AI is behind
  return gap > 0 ? 1 + Math.min(ai.catchUp, gap / 400) : 1 - Math.min(ai.easeOff, -gap / 250);
}
