// Arcade car physics + lap tracking. Pure JS so it can be simulated headless.
import { locate, wrapAngle } from './trackmath.js';

export const WALL_MARGIN = 7; // how far past the road edge you can go before the invisible wall

// Jumps: a ramp up to a lip, then a stretch of rough ground to fly over. All in meters.
export const RAMP_LENGTH = 11;
export const RAMP_HEIGHT = 1.6;
export const GAP_LENGTH = 20; // rough ground after the lip; land in it and you are slowed down
const GRAVITY = 22; // stronger than real life, so jumps feel snappy
const ROUGH = 0.55; // speed multiplier in the rough

// Marks where the jumps are. spots is a list of [x, z] points on or near the road; each ramp's lip
// goes at the nearest bit of track.
export function addJumps(track, spots = []) {
  track.step = track.length / track.count;
  track.jumps = spots.map(([x, z]) => ({ idx: locate(track, x, z).idx, lip: locate(track, x, z).idx * track.step }));
}

// Everything on a track that the cars have to deal with: jumps, things standing in the road and things
// crossing it. def is the track from data.js. kinds says how big and fast each crossing thing is:
// { name: { girth, pace } } (the animals in animals.js, plus MACHINES in data.js).
export function addHazards(track, hw, def, kinds) {
  addJumps(track, def.jumps);
  addObstacles(track, hw, def.obstacles);
  for (const land of def.lands ?? []) {
    if (!land.inRoad) continue;
    const [x0, x1, z0, z1] = land.area;
    addRoadItems(track, hw, land.inRoad, (s) => s.x >= x0 && s.x < x1 && s.z >= z0 && s.z < z1);
  }
  addCrossers(track, hw, [
    ...(def.crossers ?? []).map(([kind, at]) => ({ kind, at, r: kinds[kind].girth, pace: kinds[kind].pace * 1.6 })), // animals hurry across
    ...(def.machines ?? []).map(([kind, at]) => ({ kind, at, r: kinds[kind].girth, pace: kinds[kind].pace, machine: true })),
  ]);
}

// Stands a solid thing in the road at sample idx. k is its number in the row: they alternate sides,
// so there is always a clear way past.
function standInRoad(track, hw, k, idx, kind, r) {
  const s = track.samples[idx], lateral = (k % 2 ? 1 : -1) * hw * (0.3 + 0.12 * (k % 3));
  // idx, lateral and speed let the rival drivers treat it like a parked car and steer round it
  track.obstacles.push({ kind, idx, lateral, x: s.x + s.rx * lateral, z: s.z + s.rz * lateral, r, speed: 0, fixed: true });
}

// Puts trees in the road, spread round the lap, with none near the start line.
export function addObstacles(track, hw, howMany = 0) {
  track.obstacles = [];
  for (let k = 0; k < howMany; k++) standInRoad(track, hw, k, Math.round(track.count * (0.08 + (0.86 * (k + 0.5)) / howMany)), 'tree', 0.9);
}

// Puts other solid things in the road along one stretch of it (giant chiles in the desert, say).
// item: { kind, count, r (how wide it is to hit) }. inside(sample) says whether a bit of road is in that
// stretch. They keep off the sharp bends, and away from the start line and the ends of the stretch.
// Call after addObstacles.
export function addRoadItems(track, hw, { kind, count, r }, inside) {
  const { samples, count: n } = track, spots = [];
  samples.forEach((s, idx) => {
    if (idx > 40 && idx < n - 40 && s.curve < 0.5 && inside(samples[idx - 15]) && inside(samples[idx + 15])) spots.push(idx);
  });
  for (let k = 0; k < count && spots.length; k++) standInRoad(track, hw, k, spots[Math.floor(((k + 0.5) / count) * spots.length)], kind, r);
}

// Animals and machines that go back and forth across the road, and turn back when something drives into them.
// list: [{ kind, at (0..1 round the lap), r (how wide it is to hit), pace (m/s), machine? }]. Call after addObstacles.
export function addCrossers(track, hw, list = []) {
  list.forEach(({ kind, at, r, pace, machine }, k) => {
    const idx = Math.round(track.count * at);
    const o = { kind, idx, r, pace, machine, speed: 0, fixed: true, cross: true, span: hw + 5, dir: k % 2 ? 1 : -1, lateral: (k % 2 ? -1 : 1) * hw * 0.6, calm: 0, bumped: false };
    track.obstacles.push(o);
  });
  stepObstacles(track, 0);
}

// Moves the road-crossing animals and machines along. Call once a frame.
export function stepObstacles(track, dt) {
  for (const o of track.obstacles ?? []) {
    if (!o.cross) continue;
    o.calm -= dt;
    if (o.bumped && o.calm <= 0) { o.dir *= -1; o.calm = 1.5; } // hit by a car: head back the way it came
    o.bumped = false;
    o.lateral += o.dir * o.pace * dt;
    if (Math.abs(o.lateral) > o.span) { o.lateral = Math.sign(o.lateral) * o.span; o.dir *= -1; } // reached the far verge
    const s = track.samples[o.idx];
    o.x = s.x + s.rx * o.lateral;
    o.z = s.z + s.rz * o.lateral;
    o.facing = s.heading + (o.dir * Math.PI) / 2; // which way it is walking
  }
}

// How far round the lap a point is, in meters (the car's sample plus how far past it the car is)
function along(track, idx, x, z) {
  const s = track.samples[idx];
  return idx * track.step + (x - s.x) * s.tx + (z - s.z) * s.tz;
}

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
    y: 0, // height above the road (ramps and jumps)
    vy: 0,
    air: false,
    climb: 0, // how fast the ramp is lifting the car
    rough: false,
    passedHalf: true,
    finished: false,
    finishTime: 0,
    offroad: false,
  };
}

export function stepCar(c, ctrl, dt, track, hw) {
  const st = c.stats;
  c.offroad = Math.abs(c.lateral) > hw + 0.8;
  const max = st.max * (c.offroad ? st.offroad : c.rough ? ROUGH : 1) * (c.maxScale ?? 1);

  // ease steering toward the input so tapping buttons isn't twitchy
  c.steer += (ctrl.steer - c.steer) * Math.min(1, dt * 8);

  if (c.air) {
    // nothing to push against in the air: the car just keeps its speed
  } else if (ctrl.brake) {
    if (c.speed > 0.5) c.speed -= st.brake * dt;
    else c.speed = Math.max(-10, c.speed - st.accel * 0.5 * dt); // reverse
  } else if (ctrl.throttle) {
    if (c.speed < 0) c.speed += st.brake * dt;
    else c.speed += st.accel * dt * (1 - 0.5 * Math.min(1, c.speed / max));
  } else {
    c.speed -= Math.sign(c.speed) * Math.min(Math.abs(c.speed), 5 * dt);
  }
  if (c.speed > max && !c.air) c.speed = Math.max(max, c.speed - 25 * dt);

  const a = Math.abs(c.speed);
  // steering needs some speed, but even at a crawl the car can turn enough to nose round an obstacle
  const grip = Math.min(1, Math.max(a / 6, a > 0.4 ? 0.35 : 0)) * (1 - 0.35 * Math.min(1, a / st.max)) * (c.air ? 0.15 : 1);
  c.h = wrapAngle(c.h + c.steer * st.turn * grip * Math.sign(c.speed) * dt);
  c.x += Math.sin(c.h) * c.speed * dt;
  c.z += Math.cos(c.h) * c.speed * dt;

  // solid obstacles: stop the car going through, and take away the speed it had heading into them
  c.bonk = 0;
  for (const o of track.obstacles ?? []) {
    if (c.y > 2) continue; // flying over
    for (const off of [HIT_OFF, -HIT_OFF]) {
      const fx = Math.sin(c.h), fz = Math.cos(c.h);
      const dx = o.x - (c.x + fx * off), dz = o.z - (c.z + fz * off), d = Math.hypot(dx, dz), reach = o.r + HIT_R;
      if (d >= reach || d === 0) continue;
      const nx = dx / d, nz = dz / d, into = fx * nx + fz * nz;
      c.x -= nx * (reach - d);
      c.z -= nz * (reach - d);
      const closing = c.speed * into;
      if (closing > 0) {
        c.speed -= closing * 1.3 * into; // head-on bounces back a little; a glancing blow costs little
        // and the nose is knocked away from it, so the car glances off and round instead of ramming it again
        const right = nx * fz - nz * fx; // + means the obstacle is to the right of the nose
        c.h -= Math.sign(Math.abs(right) > 0.05 ? right : o.lateral - c.lateral || 1) * Math.min(0.3, closing * 0.03);
        c.bonk = Math.max(c.bonk, closing);
        if (o.cross) o.bumped = true;
      }
    }
  }

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

  // ramps: the car rides up the ramp, and if it is still climbing when the ramp ends, it flies
  if (track.jumps?.length) {
    const d = along(track, loc.idx, c.x, c.z), onRoad = Math.abs(loc.lateral) <= hw + 1;
    let ground = 0, rough = false;
    for (const j of track.jumps) {
      const past = d - j.lip; // meters past the lip (negative = before it)
      if (onRoad && past > -RAMP_LENGTH && past <= 0) ground = RAMP_HEIGHT * (1 + past / RAMP_LENGTH);
      if (onRoad && past > 0 && past < GAP_LENGTH) rough = true;
    }
    c.landed = false;
    if (c.air) {
      c.vy -= GRAVITY * dt;
      c.y += c.vy * dt;
      if (c.y <= ground) { c.y = ground; c.vy = 0; c.air = false; c.landed = true; }
    } else if (ground < c.y - 0.05 && c.climb > 1) {
      c.air = true; // drove off the end of the ramp
      c.vy = c.climb;
    } else {
      c.climb = Math.max(0, Math.min(12, (ground - c.y) / dt));
      c.y = ground;
    }
    c.rough = rough && !c.air;
  }
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

// Safety net for rival cars: if one has barely moved round the lap for a few seconds (wedged against
// a tree, a dinosaur, the wall or another car), put it back on the road beside whatever is in the way.
// Call once a frame while racing. Returns true when it stepped in.
export function rescue(c, track, dt) {
  const p = progress(c, track.count);
  if (c.stallMark === undefined || Math.abs(p - c.stallMark) > 3) { // has moved 6 m since last check
    c.stallMark = p;
    c.stallTime = 0;
    return false;
  }
  c.stallTime += dt;
  if (c.stallTime < 3) return false;
  const blocker = (track.obstacles ?? []).find((o) => Math.abs(o.idx - c.idx) < 8);
  const lateral = blocker ? (blocker.lateral > 0 ? -4 : 4) : 0;
  const s = track.samples[c.idx];
  resetCar(c, track);
  c.x = s.x + s.rx * lateral;
  c.z = s.z + s.rz * lateral;
  c.lateral = lateral;
  c.speed = 8; // rolling, so it can steer straight away
  c.stallMark = p;
  c.stallTime = 0;
  return true;
}

// Put a stuck car back on the road, facing the right way
export function resetCar(c, track) {
  const s = track.samples[c.idx];
  c.x = s.x; c.z = s.z; c.h = s.heading;
  c.speed = 0; c.steer = 0; c.lateral = 0;
  c.y = 0; c.vy = 0; c.air = false; c.climb = 0;
}

// Each car is two circles, one over each axle, which fits a car shape much better than one big circle.
const HIT_R = 1.05; // circle radius (half a car's width)
const HIT_OFF = 0.95; // how far each circle sits in front of / behind the car's middle
const BOUNCE = 0.2; // 0 = cars stick together after a bump, 1 = they bounce apart like pool balls

// Pushes overlapping cars apart and trades speed between them like a real bump: the car behind
// slows down and the car in front gets shoved forward. Rubbing side by side costs no speed: the
// two cars are just nudged to point slightly away from each other, so they peel apart.
// Returns the bumps that happened: [{ a, b, impact }] where impact is the closing speed in m/s.
export function collide(cars) {
  const hits = [];
  for (let i = 0; i < cars.length; i++) {
    for (let j = i + 1; j < cars.length; j++) {
      const a = cars[i], b = cars[j];
      if (Math.hypot(b.x - a.x, b.z - a.z) > 2 * (HIT_R + HIT_OFF) || Math.abs(a.y - b.y) > 1.2) continue; // too far, or one is flying over
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
        // how much of this is nose-to-tail (1) rather than door-to-door (0)
        const square = Math.max(0, (Math.max(Math.abs(an), Math.abs(bn)) - 0.4) / 0.6);
        const shove = (closing * (1 + BOUNCE) / 2) * square;
        a.speed -= shove * an;
        b.speed += shove * bn;
        hits.push({ a, b, impact: closing });
        // door-to-door: turn each car a touch away from the other
        const peel = (1 - square) * Math.min(0.02, closing * 0.004);
        a.h -= Math.sign(fa[1] * nx - fa[0] * nz) * peel;
        b.h += Math.sign(fb[1] * nx - fb[0] * nz) * peel;
      }
    }
  }
  return hits;
}
