// Opponent driving: chase a point a little way down the road, slow down for bends.
import { wrapAngle } from './trackmath.js';

export function aiControls(c, track, hw, dt, rubber = 1) {
  const { samples, count } = track;

  // drift lanes now and then so they don't drive single-file
  c.laneTimer = (c.laneTimer ?? 0) - dt;
  if (c.laneTimer <= 0) {
    c.laneTimer = 3 + Math.random() * 4;
    c.laneTarget = (Math.random() * 2 - 1) * hw * 0.45;
  }
  c.lane = (c.lane ?? 0) + ((c.laneTarget ?? 0) - (c.lane ?? 0)) * Math.min(1, dt * 0.8);

  const look = (c.idx + 5 + Math.floor(Math.max(0, c.speed) * 0.25)) % count;
  const t = samples[look];
  const tx = t.x + t.rx * c.lane, tz = t.z + t.rz * c.lane;
  const diff = wrapAngle(Math.atan2(tx - c.x, tz - c.z) - c.h);
  const steer = Math.max(-1, Math.min(1, diff * 3));

  let bend = 0;
  for (let k = 0; k <= 24; k += 8) bend = Math.max(bend, samples[(c.idx + k) % count].curve);
  const target = c.stats.max * c.skill * rubber * (1 - Math.min(0.5, bend * 0.45));

  return { steer, throttle: c.speed < target ? 1 : 0, brake: c.speed > target + 4 ? 1 : 0 };
}

// Keeps races close: opponents ease off when far ahead of the player, push a bit when behind.
export function rubberBand(aiProgress, playerProgress) {
  const gap = playerProgress - aiProgress; // + means AI is behind
  return gap > 0 ? 1 + Math.min(0.1, gap / 400) : 1 - Math.min(0.18, -gap / 250);
}
