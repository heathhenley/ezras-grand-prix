// Arcade car physics + lap tracking. Pure JS so it can be simulated headless.
import { locate, wrapAngle } from './trackmath.js';

export const WALL_MARGIN = 7; // how far past the road edge you can go before the invisible wall

export function makeCar(stats, track, idx, lateral) {
  const s = track.samples[idx];
  return {
    stats,
    x: s.x + s.rx * lateral,
    z: s.z + s.rz * lateral,
    h: s.heading,
    speed: 0,
    steer: 0,
    idx,
    lateral,
    lap: -1, // laps completed; starts at -1 because the grid is behind the line
    passedHalf: true,
    finished: false,
    finishTime: 0,
    offroad: false,
  };
}

export function stepCar(c, ctrl, dt, track, hw) {
  const st = c.stats;
  c.offroad = Math.abs(c.lateral) > hw + 0.8;
  const max = st.max * (c.offroad ? st.offroad : 1) * (c.maxScale ?? 1);

  // ease steering toward the input so tapping buttons isn't twitchy
  c.steer += (ctrl.steer - c.steer) * Math.min(1, dt * 8);

  if (ctrl.brake) {
    if (c.speed > 0.5) c.speed -= st.brake * dt;
    else c.speed = Math.max(-10, c.speed - st.accel * 0.5 * dt); // reverse
  } else if (ctrl.throttle) {
    if (c.speed < 0) c.speed += st.brake * dt;
    else c.speed += st.accel * dt * (1 - 0.5 * Math.min(1, c.speed / max));
  } else {
    c.speed -= Math.sign(c.speed) * Math.min(Math.abs(c.speed), 5 * dt);
  }
  if (c.speed > max) c.speed = Math.max(max, c.speed - 25 * dt);

  const a = Math.abs(c.speed);
  const grip = Math.min(1, a / 6) * (1 - 0.35 * Math.min(1, a / st.max));
  c.h = wrapAngle(c.h + c.steer * st.turn * grip * Math.sign(c.speed) * dt);
  c.x += Math.sin(c.h) * c.speed * dt;
  c.z += Math.cos(c.h) * c.speed * dt;

  const loc = locate(track, c.x, c.z, c.idx);
  const wall = hw + WALL_MARGIN;
  if (Math.abs(loc.lateral) > wall) {
    const s = track.samples[loc.idx];
    const push = loc.lateral - Math.sign(loc.lateral) * wall;
    c.x -= s.rx * push;
    c.z -= s.rz * push;
    c.speed *= 1 - Math.min(1, 3 * dt);
    loc.lateral = Math.sign(loc.lateral) * wall;
  }
  updateLap(c, loc.idx, track.count);
  c.idx = loc.idx;
  c.lateral = loc.lateral;
}

function updateLap(c, idx, n) {
  const prev = c.idx;
  if (prev > n * 0.8 && idx < n * 0.2) {
    if (c.passedHalf) { c.lap++; c.passedHalf = false; }
  } else if (prev < n * 0.2 && idx > n * 0.8) {
    c.lap--; // drove backwards over the line
    c.passedHalf = true;
  }
  if (idx > n * 0.4 && idx < n * 0.6) c.passedHalf = true;
}

export function progress(c, n) {
  return c.lap * n + c.idx;
}

// Put a stuck car back on the road, facing the right way
export function resetCar(c, track) {
  const s = track.samples[c.idx];
  c.x = s.x; c.z = s.z; c.h = s.heading;
  c.speed = 0; c.steer = 0; c.lateral = 0;
}

// Each car is two circles, one over each axle, which fits a car shape much better than one big circle.
const HIT_R = 1.05; // circle radius (half a car's width)
const HIT_OFF = 0.95; // how far each circle sits in front of / behind the car's middle
const BOUNCE = 0.2; // 0 = cars stick together after a bump, 1 = they bounce apart like pool balls

// Pushes overlapping cars apart and trades speed between them like a real bump: the car behind
// slows down and the car in front gets shoved forward. Rubbing side by side costs no speed.
// Returns the bumps that happened: [{ a, b, impact }] where impact is the closing speed in m/s.
export function collide(cars) {
  const hits = [];
  for (let i = 0; i < cars.length; i++) {
    for (let j = i + 1; j < cars.length; j++) {
      const a = cars[i], b = cars[j];
      if (Math.hypot(b.x - a.x, b.z - a.z) > 2 * (HIT_R + HIT_OFF)) continue;
      const fa = [Math.sin(a.h), Math.cos(a.h)], fb = [Math.sin(b.h), Math.cos(b.h)];

      // deepest overlap between any of a's circles and any of b's
      let overlap = 0, nx = 0, nz = 0;
      for (const sa of [-HIT_OFF, HIT_OFF]) {
        for (const sb of [-HIT_OFF, HIT_OFF]) {
          const dx = b.x + fb[0] * sb - (a.x + fa[0] * sa), dz = b.z + fb[1] * sb - (a.z + fa[1] * sa);
          const d = Math.hypot(dx, dz);
          if (d > 0 && HIT_R * 2 - d > overlap) { overlap = HIT_R * 2 - d; nx = dx / d; nz = dz / d; }
        }
      }
      if (!overlap) continue;

      a.x -= nx * overlap / 2; a.z -= nz * overlap / 2;
      b.x += nx * overlap / 2; b.z += nz * overlap / 2;

      // how fast they are closing along the line between them (n points from a to b)
      const an = fa[0] * nx + fa[1] * nz, bn = fb[0] * nx + fb[1] * nz;
      const closing = a.speed * an - b.speed * bn;
      if (closing > 0) {
        const shove = closing * (1 + BOUNCE) / 2;
        a.speed -= shove * an;
        b.speed += shove * bn;
        hits.push({ a, b, impact: closing });
      }
    }
  }
  return hits;
}
