// Chase camera for the race: a sweeping intro shot during the countdown, a chase cam that leans into
// corners and widens its view with speed, a little shake on bumps, and a slow orbit after the finish.
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { wrapAngle } from './trackmath.js';

const BASE_FOV = 0.95;
const smooth = (u) => u * u * (3 - 2 * u);

export function chaseCam(camera) {
  const pos = new Vector3(), look = new Vector3(), aim = new Vector3(), want = new Vector3();
  let since = 0, ahead = 5, high = 4.2, dist = 9, blend = 1, heading = null, fov = BASE_FOV, trauma = 0, time = 0, orbit = 0, lean = 0, lift = 0, floor = null, settled = false;

  return {
    // amount 0..1: how hard the bump was. Several bumps add up, but it never gets violent.
    shake(amount) { trauma = Math.min(0.8, trauma + amount); },

    update(dt, race) {
      const p = race.player, fx = Math.sin(p.h), fz = Math.cos(p.h);
      const fast = Math.min(1.2, Math.abs(p.speed) / p.stats.max), boost = p.boost > 0 ? 1 : 0;
      const k = 1 - Math.exp(-dt * 6);
      time += dt;
      if (heading === null) heading = p.h;
      // hills: ride up and down with the road (floor); jumps: follow the car up, but softly (lift)
      const road = race.track.samples[p.idx]?.y ?? 0;
      if (floor === null) floor = road;
      floor += (road - floor) * Math.min(1, dt * 10);
      lift += (p.y - road - lift) * Math.min(1, dt * 8);

      if (race.t < 0) {
        // countdown: swing round from in front of the grid to the usual spot behind the car
        const u = smooth(Math.min(1, (race.t + 3) / 2.7));
        const a = p.h + Math.PI * 0.95 * (1 - u), r = 9 + 9 * (1 - u), up = 4.2 + 4 * (1 - u);
        heading = p.h;
        pos.set(p.x - Math.sin(a) * r, floor + up, p.z - Math.cos(a) * r);
        look.set(p.x + fx * 5 * u, floor + 1.2 + 0.4 * (1 - u), p.z + fz * 5 * u);
        settled = false;
      } else if (p.finished) {
        // past the line: drift slowly round the car (starting from wherever the chase cam was)
        since += dt;
        orbit += dt * 0.6 * Math.min(1, since / 0.8);
        dist += (8.5 - dist) * Math.min(1, dt * 1.5);
        high += (3.2 - high) * Math.min(1, dt * 1.5);
        const a = heading + orbit;
        pos.set(p.x - Math.sin(a) * dist, floor + high + lift, p.z - Math.cos(a) * dist);
        ahead -= ahead * Math.min(1, dt * 3); // from looking down the road to looking at the car
        look.set(p.x + fx * ahead, floor + 1 + lift, p.z + fz * ahead);
      } else {
        // The camera's heading lags the car's, so in a corner you see a bit of the car's side. It pulls
        // back a little with speed, but rides along with the car, so it never falls behind at top speed.
        heading += wrapAngle(p.h - heading) * k;
        lean += (p.steer * fast - lean) * Math.min(1, dt * 3);
        dist += (9 + fast * 1.4 + boost * 1.6 - dist) * Math.min(1, dt * 2.5);
        const hx = Math.sin(heading), hz = Math.cos(heading), rx = hz, rz = -hx;
        ahead = 5 + fast * 4;
        const side = lean * 1.1;
        high = 4.2 - fast * 0.35;
        const up = floor + high + lift * 0.6;
        want.set(p.x - hx * dist - rx * side * 0.4, up, p.z - hz * dist - rz * side * 0.4);
        aim.set(p.x + fx * ahead + rx * side, floor + 1.2 + lift * 0.8, p.z + fz * ahead + rz * side);
        if (!settled) { blend = 0.15; settled = true; } // the intro shot just ended: glide the last bit
        blend = Math.min(1, blend + dt * 2);
        Vector3.LerpToRef(pos, want, blend, pos);
        look.copyFrom(aim);
      }
      // never down in a hillside behind the car
      const ground = race.track.groundAt?.(pos.x, pos.z) ?? 0;
      if (pos.y < ground + 1.5) pos.y = ground + 1.5;
      race.camH = heading; // the sound uses it to pan rival engines

      // wider view the faster you go, wider still while boosting
      const fovWant = BASE_FOV + (race.t >= 0 && !p.finished ? fast * 0.13 + boost * 0.12 : 0);
      fov += (fovWant - fov) * Math.min(1, dt * (fovWant > fov ? 4 : 2));
      camera.fov = fov;

      // shake: wobbles made of a few sine waves, fading out quickly
      trauma = Math.max(0, trauma - dt * 1.6);
      const s = trauma * trauma * 0.5;
      camera.position.set(
        pos.x + s * (Math.sin(time * 37) + Math.sin(time * 61) * 0.5),
        pos.y + s * (Math.sin(time * 43 + 1) + Math.sin(time * 71) * 0.5),
        pos.z + s * Math.sin(time * 53 + 2),
      );
      camera.setTarget(look);
    },
  };
}
