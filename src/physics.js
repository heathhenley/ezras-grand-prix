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

// Simple circle push-apart so cars bump instead of overlapping
export function collide(cars, r = 1.7) {
  for (let i = 0; i < cars.length; i++) {
    for (let j = i + 1; j < cars.length; j++) {
      const a = cars[i], b = cars[j];
      const dx = b.x - a.x, dz = b.z - a.z;
      const d = Math.hypot(dx, dz);
      if (d > 0 && d < r * 2) {
        const push = (r * 2 - d) / 2, nx = dx / d, nz = dz / d;
        a.x -= nx * push; a.z -= nz * push;
        b.x += nx * push; b.z += nz * push;
        a.speed *= 0.98; b.speed *= 0.98;
      }
    }
  }
}
