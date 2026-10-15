// Visual juice for the race: tyre smoke, dust, sparks, boost flames, confetti, speed lines, plus the
// chase camera (camera.js) and the post-processing (env.js).
// All particles are sprites from two fixed pools (one see-through, one glowing), so a busy moment
// never costs more than two draw calls and nothing is allocated while racing.
//
// createFx(scene, camera, { def }) -> { update(dt, race), burst(kind, x, y, z, strength), shake(amount), dispose() }
//   kind: 'sparks' | 'dust' | 'confetti' | 'boostFlame' | 'splash' | 'smoke' | 'embers'; strength about 0..1
import { SpriteManager } from '@babylonjs/core/Sprites/spriteManager';
import { Sprite } from '@babylonjs/core/Sprites/sprite';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Constants } from '@babylonjs/core/Engines/constants';
import '@babylonjs/core/Sprites/spriteSceneComponent';
import { chaseCam } from './camera.js';
import { setupPost } from './env.js';

const CELL = 64;
const PUFF = 0, DOT = 1, PAPER = 2, STREAK = 3, FLAME = 4;

// The sprite sheet, drawn once on a canvas: a soft puff, a glowing dot, a paper square, a streak, a flame.
function sheet() {
  const c = document.createElement('canvas');
  c.width = CELL * 8; c.height = CELL; // power of two wide, so mipmaps work
  const g = c.getContext('2d'), m = CELL / 2;
  const radial = (cx, r, stops) => {
    const gr = g.createRadialGradient(cx, m, 0, cx, m, r);
    for (const [at, a] of stops) gr.addColorStop(at, `rgba(255,255,255,${a})`);
    g.fillStyle = gr;
    g.beginPath(); g.arc(cx, m, r, 0, Math.PI * 2); g.fill();
  };
  // puff: a few overlapping blobs, so smoke looks like chunky cartoon clouds rather than a blur
  for (const [dx, dy, r] of [[0, 0, 24], [-9, 5, 16], [10, 4, 15], [3, -9, 15]]) {
    const gr = g.createRadialGradient(m + dx, m + dy, 0, m + dx, m + dy, r);
    gr.addColorStop(0, 'rgba(255,255,255,0.85)'); gr.addColorStop(0.65, 'rgba(255,255,255,0.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(m + dx, m + dy, r, 0, Math.PI * 2); g.fill();
  }
  radial(CELL + m, 26, [[0, 1], [0.25, 0.9], [0.5, 0.3], [1, 0]]);
  g.fillStyle = '#fff'; g.fillRect(CELL * 2 + 14, 20, 36, 24);
  const st = g.createLinearGradient(CELL * 3 + 2, 0, CELL * 4 - 2, 0);
  st.addColorStop(0, 'rgba(255,255,255,0)'); st.addColorStop(0.7, 'rgba(255,255,255,0.9)'); st.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = st; g.fillRect(CELL * 3 + 2, m - 2, CELL - 4, 4);
  radial(CELL * 4 + m, 28, [[0, 1], [0.35, 0.8], [0.7, 0.25], [1, 0]]);
  return c.toDataURL();
}

// A fixed pool of sprites with simple physics: drift, drag, gravity, grow, fade.
function pool(scene, name, url, cap, additive) {
  const mgr = new SpriteManager(name, url, cap, CELL, scene);
  mgr.disableDepthWrite = true; // see-through things should not hide each other
  mgr.isPickable = false;
  if (additive) { mgr.blendMode = Constants.ALPHA_ADD; mgr.fogEnabled = false; }
  const sprites = [];
  for (let i = 0; i < cap; i++) { const s = new Sprite(name, mgr); s.isVisible = false; sprites.push(s); }
  const f = () => new Float32Array(cap);
  const P = { vx: f(), vy: f(), vz: f(), age: f(), life: f(), s0: f(), s1: f(), a0: f(), drag: f(), grav: f(), spin: f(), r0: f(), g0: f(), b0: f(), r1: f(), g1: f(), b1: f(), flip: f() };
  let next = 0, live = 0;
  return {
    mgr,
    // when the pool is full the oldest particle is reused: busy moments just look a bit thinner
    spawn(x, y, z, vx, vy, vz, life, s0, s1, r, g, b, a, cell, grav = 0, drag = 1, r1 = r, g1 = g, b1 = b) {
      const i = next; next = (next + 1) % cap;
      const s = sprites[i];
      if (!s.isVisible) live++;
      s.isVisible = true;
      s.position.set(x, y, z);
      s.cellIndex = cell;
      s.angle = Math.random() * 6.28;
      s.width = s.height = s0;
      P.vx[i] = vx; P.vy[i] = vy; P.vz[i] = vz; P.age[i] = 0; P.life[i] = life;
      P.s0[i] = s0; P.s1[i] = s1; P.a0[i] = a; P.grav[i] = grav; P.drag[i] = drag;
      P.spin[i] = (Math.random() - 0.5) * (cell === PAPER ? 10 : 1.5);
      P.r0[i] = r; P.g0[i] = g; P.b0[i] = b; P.r1[i] = r1; P.g1[i] = g1; P.b1[i] = b1;
      P.flip[i] = cell === PAPER ? 4 + Math.random() * 8 : 0;
      s.color.set(r, g, b, a);
      return i;
    },
    update(dt, cam) {
      if (!live) return;
      live = 0;
      for (let i = 0; i < cap; i++) {
        const s = sprites[i];
        if (!s.isVisible) continue;
        const age = (P.age[i] += dt), u = age / P.life[i];
        if (u >= 1) { s.isVisible = false; continue; }
        live++;
        const d = Math.exp(-P.drag[i] * dt);
        P.vx[i] *= d; P.vz[i] *= d; P.vy[i] = P.vy[i] * d - P.grav[i] * dt;
        const p = s.position;
        p.x += P.vx[i] * dt; p.y += P.vy[i] * dt; p.z += P.vz[i] * dt;
        if (p.y < 0.05 && P.grav[i] > 0) { p.y = 0.05; P.vy[i] *= -0.3; P.vx[i] *= 0.6; P.vz[i] *= 0.6; } // bounce off the ground
        const size = P.s0[i] + (P.s1[i] - P.s0[i]) * Math.sqrt(u);
        s.width = P.flip[i] ? size * Math.abs(Math.cos(age * P.flip[i])) + 0.04 : size; // confetti tumbles
        s.height = s.cellIndex === STREAK ? size * 0.12 : size;
        if (s.cellIndex === STREAK) s.angle = cam.streakAngle(p);
        else s.angle += P.spin[i] * dt;
        // pop in quickly, fade out gently
        const a = P.a0[i] * Math.min(1, u * 8) * (1 - u) * (1 - u);
        s.color.set(P.r0[i] + (P.r1[i] - P.r0[i]) * u, P.g0[i] + (P.g1[i] - P.g0[i]) * u, P.b0[i] + (P.b1[i] - P.b0[i]) * u, a);
      }
    },
  };
}

const rgb = (hex) => Color3.FromHexString(hex);
const mix = (a, b, t) => new Color3(a.r + (b.r - a.r) * t, a.g + (b.g - a.g) * t, a.b + (b.b - a.b) * t);
const EARTH = rgb('#8a6a45');
const CONFETTI = ['#ffd23f', '#ff4f6d', '#3fb8ff', '#5ee06a', '#b36bff', '#ff9a2e', '#ffffff'].map(rgb);

// What colour the dirt is that a car throws up off the road, from the track's (or land's) ground and surface.
function dirtColor(ground = '#7cc464', surface = 'grass') {
  if (surface === 'snow') return rgb('#f2f6fc');
  if (surface === 'sand') return mix(rgb(ground), rgb('#f3dcb2'), 0.35);
  return mix(rgb(ground), EARTH, 0.72).scale(1.15); // grass: torn turf, mostly brown
}

export function createFx(scene, camera, { def = {}, touch = false } = {}) {
  const url = sheet();
  const soft = pool(scene, 'fxSoft', url, touch ? 420 : 640, false);
  const glow = pool(scene, 'fxGlow', url, touch ? 260 : 380, true);
  const rig = chaseCam(camera);
  const post = setupPost(scene, camera, { touch });

  // dirt colour wherever a car is: lands (road trip) each have their own ground
  const lands = (def.lands ?? []).map((l) => ({ area: l.area, c: dirtColor(l.ground, l.surface) }));
  const baseDirt = dirtColor(def.ground, def.surface);
  const dirtAt = (x, z) => {
    for (const l of lands) if (x >= l.area[0] && x < l.area[1] && z >= l.area[2] && z < l.area[3]) return l.c;
    return baseDirt;
  };
  const lava = def.jumpStyle === 'lava';

  // per-car memory (last speed, emit timers), kept here so the physics objects stay clean
  const memo = new Map();
  const mem = (c) => { let m = memo.get(c); if (!m) memo.set(c, (m = { speed: c.speed, decel: 0, smoke: 0, dust: 0, flame: 0 })); return m; };
  let lines = 0, celebrate = -1, wasFinished = false, carryX = 0, carryZ = 0;
  const R = Math.random;

  // where a streak sits on screen decides its angle: speed lines all point out from the middle
  const cam = {
    streakAngle(p) {
      const v = camera.getViewMatrix().m; // world -> view: rows give the camera's right and up
      const dx = p.x - camera.position.x, dy = p.y - camera.position.y, dz = p.z - camera.position.z;
      return Math.atan2(dx * v[1] + dy * v[5] + dz * v[9], dx * v[0] + dy * v[4] + dz * v[8]);
    },
  };
  const near = (x, z, r = 90) => Math.abs(x - camera.position.x) < r && Math.abs(z - camera.position.z) < r;

  const fx = {
    rig,
    shake(amount) { rig.shake(amount); },

    burst(kind, x, y, z, strength = 1) {
      if (!near(x, z, 120)) return;
      const k = Math.max(0.2, Math.min(1.5, strength));
      if (kind === 'sparks') {
        for (let i = 0, n = Math.round(10 + 22 * k); i < n; i++) {
          const a = R() * 6.28, sp = 4 + R() * 9 * k;
          glow.spawn(x, y, z, Math.cos(a) * sp, 2 + R() * 6 * k, Math.sin(a) * sp, 0.3 + R() * 0.4, 0.4, 0.1, 1, 0.85, 0.4, 1, DOT, 22, 1.5, 1, 0.35, 0.05);
        }
        glow.spawn(x, y, z, 0, 0, 0, 0.12, 1.2 * k + 0.6, 2.2 * k + 1, 1, 0.9, 0.6, 0.9, FLAME); // flash
        for (let i = 0; i < 3; i++) soft.spawn(x, y, z, (R() - 0.5) * 3, 1 + R(), (R() - 0.5) * 3, 0.7, 0.6, 1.8, 0.85, 0.85, 0.85, 0.45, PUFF, 0, 2);
      } else if (kind === 'dust' || kind === 'splash') {
        // a ring of dirt (or water) kicked out sideways, like landing after a jump
        const c = kind === 'splash' ? rgb('#d8f2ff') : dirtAt(x, z);
        for (let i = 0, n = Math.round(10 + 14 * k); i < n; i++) {
          const a = (i / n) * 6.28 + R() * 0.3, sp = 3 + R() * 4 * k;
          soft.spawn(x + Math.cos(a) * 0.8, y + 0.2, z + Math.sin(a) * 0.8, carryX + Math.cos(a) * sp, 0.6 + R() * 1.5 * k, carryZ + Math.sin(a) * sp,
            0.8 + R() * 0.6, 0.7, 2.4 + k, c.r, c.g, c.b, 0.85, PUFF, kind === 'splash' ? 6 : 0.5, 2.5);
        }
        if (kind === 'splash') for (let i = 0; i < 20 * k; i++) soft.spawn(x, y, z, (R() - 0.5) * 5, 4 + R() * 5 * k, (R() - 0.5) * 5, 0.8, 0.25, 0.15, 0.85, 0.95, 1, 0.9, DOT, 18, 0.3);
      } else if (kind === 'confetti') {
        for (let i = 0, n = Math.round(90 * k); i < n; i++) {
          const a = R() * 6.28, sp = 2 + R() * 6, c = CONFETTI[i % CONFETTI.length];
          soft.spawn(x + (R() - 0.5) * 2, y, z + (R() - 0.5) * 2, Math.cos(a) * sp, 7 + R() * 7, Math.sin(a) * sp, 2.5 + R() * 1.5, 0.32, 0.32, c.r, c.g, c.b, 1.6, PAPER, 6, 1.8);
        }
      } else if (kind === 'boostFlame') {
        // a whoosh of flame (fired when a boost starts; the steady exhaust flames come from update)
        for (let i = 0, n = Math.round(8 + 10 * k); i < n; i++) {
          const a = R() * 6.28, sp = 2 + R() * 4;
          glow.spawn(x, y, z, Math.cos(a) * sp, 0.5 + R() * 2, Math.sin(a) * sp, 0.25 + R() * 0.2, 0.8 + k, 0.3, 1, 0.9, 0.5, 1.4, FLAME, 0, 3, 1, 0.3, 0.05);
        }
      } else if (kind === 'smoke') {
        soft.spawn(x, y, z, (R() - 0.5) * 1.5, 0.6 + R(), (R() - 0.5) * 1.5, 1 + R() * 0.6, 0.5, 2.6 + k, 0.96, 0.96, 0.98, 0.75 * k, PUFF, -0.4, 1.4);
      } else if (kind === 'embers') {
        for (let i = 0; i < 6 * k + 2; i++) glow.spawn(x, y, z, (R() - 0.5) * 3, 3 + R() * 4, (R() - 0.5) * 3, 0.6 + R() * 0.5, 0.3, 0.1, 1, 0.6, 0.15, 1, DOT, 9, 0.5, 0.9, 0.15, 0);
      }
    },

    update(dt, race) {
      rig.update(dt, race);
      const p = race.player;
      for (const c of race.cars) {
        const m = mem(c), sz = c.mesh.size ?? [2, 1, 4];
        const accel = dt > 0 ? (c.speed - m.speed) / dt : 0;
        m.speed = c.speed;
        m.decel += (Math.max(0, -accel) - m.decel) * Math.min(1, dt * 10);
        c.mesh.brake?.(c.isPlayer ? !!race.playerBraking && c.speed > 0.5 : m.decel > 12 && c.speed > 1);
        if (c.landed) {
          carryX = Math.sin(c.h) * c.speed * 0.6; carryZ = Math.cos(c.h) * c.speed * 0.6; // the dust is flung along with the car
          fx.burst(lava && c.rough ? 'embers' : 'dust', c.x, c.y, c.z, Math.min(1.2, 0.4 + Math.abs(c.speed) / 50));
          carryX = carryZ = 0;
          c.mesh.bump?.(0.6);
          if (c === p) rig.shake(0.35);
        }
        if (!near(c.x, c.z) || race.t < 0) continue;
        const fx_ = Math.sin(c.h), fz = Math.cos(c.h), rx = fz, rz = -fx_;
        const fast = Math.abs(c.speed) / c.stats.max;
        const back = -sz[2] * 0.36, half = sz[0] * 0.4;
        // tyre smoke: hard cornering or hard braking at speed, on the road
        const slide = !c.air && !c.offroad ? Math.max((Math.abs(c.steer) * fast - 0.55) / 0.3, m.decel > 25 && fast > 0.4 ? 0.8 : 0) : 0;
        if (slide > 0) {
          m.smoke += dt * 26 * Math.min(1, slide);
          while (m.smoke >= 1) {
            m.smoke--;
            const side = R() < 0.5 ? -1 : 1;
            fx.burst('smoke', c.x + fx_ * back + rx * half * side, 0.25, c.z + fz * back + rz * half * side, Math.min(1, slide));
          }
        }
        // dirt off the back wheels when driving on grass, sand or snow (or bouncing through the rough)
        if ((c.offroad || c.rough) && !c.air && fast > 0.12) {
          m.dust += dt * 30 * Math.min(1, fast * 1.4);
          const col = lava && c.rough ? null : dirtAt(c.x, c.z);
          while (m.dust >= 1) {
            m.dust--;
            const side = R() < 0.5 ? -1 : 1, x = c.x + fx_ * back + rx * half * side, z = c.z + fz * back + rz * half * side;
            if (!col) { fx.burst('embers', x, 0.3, z, 0.3); continue; }
            const kick = c.speed * 0.25;
            soft.spawn(x, 0.3, z, -fx_ * kick + rx * side * 1.5 + (R() - 0.5) * 2, 1.2 + R() * 2, -fz * kick + rz * side * 1.5 + (R() - 0.5) * 2,
              0.8 + R() * 0.5, 0.6, 2.2 + fast * 1.6, col.r * (0.9 + R() * 0.2), col.g * (0.9 + R() * 0.2), col.b * (0.9 + R() * 0.2), 1.25, PUFF, 1.5, 2.2);
            if (R() < 0.35) soft.spawn(x, 0.3, z, -fx_ * kick * 0.5 + (R() - 0.5) * 3, 3 + R() * 3, -fz * kick * 0.5 + (R() - 0.5) * 3, 0.6, 0.16, 0.14, col.r * 0.7, col.g * 0.7, col.b * 0.7, 1, PAPER, 16, 0.5);
          }
        }
        // boost: flames out of the exhaust, trailing behind the car
        if (c.boost > 0) {
          m.flame += dt * 90;
          while (m.flame >= 1) {
            m.flame--;
            const x = c.x + fx_ * (back - 0.3), z = c.z + fz * (back - 0.3), y = c.y + sz[1] * 0.3;
            const v = c.speed * 0.75 - 6; // world speed: a bit slower than the car, so the flame streams out the back
            const side = (R() < 0.5 ? -0.35 : 0.35) * half; // two exhausts
            glow.spawn(x + rx * side, y + (R() - 0.5) * 0.1, z + rz * side, fx_ * v, 0.4, fz * v,
              0.16 + R() * 0.12, 1 + R() * 0.4, 0.25, 1, 0.95, 0.6, 1.8, FLAME, 0, 0, 1, 0.35, 0.05);
          }
        }
      }

      // speed lines: streaks rushing past the camera when the player is flat out or boosting
      if (race.t > 0 && !p.finished) {
        const fast = Math.abs(p.speed) / p.stats.max, want = (p.boost > 0 ? 40 : 0) + Math.max(0, fast - 0.85) * 160;
        lines += dt * want;
        const cp = camera.position;
        const hx = Math.sin(p.h), hz = Math.cos(p.h);
        while (lines >= 1) {
          lines--;
          const a = R() * 6.28, r = 3 + R() * 3, d = 8 + R() * 8;
          const x = cp.x + hx * d + hz * Math.cos(a) * r, y = cp.y - 1 + Math.sin(a) * r * 0.5, z = cp.z + hz * d - hx * Math.cos(a) * r;
          const v = p.speed * 0.5 - 30;
          if (y > 0.3) soft.spawn(x, y, z, hx * v, 0, hz * v, 0.28, 1.6 + R() * 1.2, 2.8, 1, 1, 1, 0.4, STREAK);
        }
      }

      // the player won: confetti, a few pops of it
      if (p.finished && !wasFinished) { wasFinished = true; if (p.place === 1) celebrate = 0; }
      if (celebrate >= 0) {
        const before = celebrate;
        celebrate += dt;
        // pops just ahead of the (still braking) car, then either side of it, close to the camera
        const pops = [[0, 0, 1], [0.45, -3.5, 0.55], [0.9, 3.5, 0.55], [1.6, 0, 1]];
        for (const [at, side, toward] of pops) if (before <= at && celebrate > at) {
          const v = Math.max(0, p.speed), ahead = 2 + Math.min(30, (v * v) / (2 * p.stats.brake)); // where the car will stop
          const tx = p.x + Math.sin(p.h) * ahead, tz = p.z + Math.cos(p.h) * ahead;
          const cx = camera.position.x, cz = camera.position.z, dx = tx - cx, dz = tz - cz, d = Math.hypot(dx, dz) || 1;
          fx.burst('confetti', cx + dx * toward + (dz / d) * side, p.y + 1.2, cz + dz * toward - (dx / d) * side, 1);
        }
        if (celebrate > 2) celebrate = -1;
      }

      soft.update(dt, cam);
      glow.update(dt, cam);
      post.update(dt, p);
    },

    dispose() {
      post.dispose();
      soft.mgr.dispose();
      glow.mgr.dispose();
    },
  };
  return fx;
}
