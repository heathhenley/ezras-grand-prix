// Boost pads and nitro stars: where they go round the lap, picking them up, and how they look.
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import '@babylonjs/core/Meshes/thinInstanceMesh';
import { RAMP_LENGTH, GAP_LENGTH, PAD_BOOST, addNitro } from './physics.js';

const PAD_LEN = 8, PAD_W = 6; // meters
const STAR_R = 2.4; // how close a car has to get to grab a star (generous: small kids, big targets)
const STAR_NITRO = 0.14; // meter gained per star
const STAR_BACK = 4; // seconds before a picked-up star comes back

// Works out where the pads and stars go, from the track def or (if it has none) by itself.
// def.boosts: [[fraction round the lap, lateral], ...]; def.stars: [[fraction, lateral], ...] (one star each).
// Call after addHazards, so it can keep clear of the jumps and things in the road.
export function placePickups(track, hw, def) {
  const { count: n, samples } = track, step = track.length / n;
  const lips = (track.jumps ?? []).map((j) => j.idx);
  const things = (track.obstacles ?? []).map((o) => o.idx);
  const gap = (a, b) => Math.min(Math.abs(a - b), n - Math.abs(a - b));
  // a stretch of road that is clear of ramps, landing zones and obstacles
  const clear = (idx) => idx > 25 && idx < n - 12
    && lips.every((l) => !(idx > l - (RAMP_LENGTH + 6) / step && idx < l + (GAP_LENGTH + 6) / step))
    && things.every((t) => gap(t, idx) > 14);
  // nudge a spot forward until it is clear (or give up)
  const settle = (idx) => { for (let k = 0; k < 60; k++) { const i = (idx + k) % n; if (clear(i)) return i; } return -1; };
  const at = (idx, lateral, y = 0) => {
    const s = samples[idx];
    return { idx, lateral, x: s.x + s.rx * lateral, y: y + (s.y ?? 0), z: s.z + s.rz * lateral, h: s.heading, tip: -Math.atan(s.grade ?? 0) }; // y: up off the road, wherever it is
  };

  // Boost pads: listed ones, or one on the run-up to every jump plus one on each of the longest straights
  let pads = (def.boosts ?? []).map(([f, lat]) => at(settle(Math.round(f * n)), lat)).filter((p) => p.idx >= 0);
  if (!def.boosts) {
    for (const l of lips) {
      const i = (l - Math.round((RAMP_LENGTH + 22) / step) + n) % n;
      if (clear(i)) pads.push(at(i, 0));
    }
    // straightness: how little the road bends over the next 60 m
    const flat = samples.map((_, i) => samples[i].curve + samples[(i + 15) % n].curve);
    const want = Math.max(2, 4 - pads.length);
    for (let k = 0; k < want; k++) {
      let best = -1;
      for (let i = 0; i < n; i++) {
        if (!clear(i) || pads.some((p) => gap(p.idx, i) < n / 6)) continue;
        if (best < 0 || flat[i] < flat[best]) best = i;
      }
      if (best >= 0) pads.push(at(best, (k % 2 ? 1 : -1) * hw * 0.25));
    }
  }

  // Stars: listed ones, or wavy lines of five spread round the lap, plus an arc of them over every jump
  let stars = (def.stars ?? []).map(([f, lat]) => at(settle(Math.round(f * n)), lat, 1)).filter((s) => s.idx >= 0);
  if (!def.stars) {
    const lines = 4;
    for (let k = 0; k < lines; k++) {
      const start = settle(Math.round(n * (0.13 + k / lines)));
      if (start < 0) continue;
      const side = (k % 2 ? 1 : -1) * hw * 0.45;
      for (let j = 0; j < 5; j++) {
        const i = (start + j * 4) % n;
        if (clear(i)) stars.push(at(i, side * Math.cos((j / 4) * Math.PI), 1));
      }
    }
    for (const l of lips) {
      for (const [m, y] of [[5, 2.3], [11, 2.5], [17, 2.1]]) stars.push(at((l + Math.round(m / step)) % n, 0, y));
    }
  }
  for (const s of stars) { s.alive = true; s.back = 0; }
  track.pads = pads;
  track.stars = stars;
}

// Checks every car against the pads and stars. Returns what happened, so race.js can play sounds and
// effects: calls onPad(car, pad) and onStar(car, star).
export function stepPickups(track, cars, dt, onPad, onStar) {
  const n = track.count, step = track.length / n;
  for (const s of track.stars) {
    if (!s.alive && (s.back -= dt) <= 0) s.alive = true;
  }
  for (const c of cars) {
    let onAny = false;
    for (const p of c.finished ? [] : track.pads) {
      const d = (((c.idx - p.idx) % n) + n + n / 2) % n - n / 2; // samples past the pad's middle
      if (Math.abs(d * step) < PAD_LEN / 2 && Math.abs(c.lateral - p.lateral) < PAD_W / 2 + 0.8 && c.y - (c.gy ?? 0) < 0.6) {
        onAny = true;
        if (!c.onPad) onPad(c, p);
        c.boost = Math.max(c.boost, PAD_BOOST);
      }
    }
    c.onPad = onAny;
    if (c.finished) continue;
    for (const s of track.stars) {
      if (!s.alive || Math.abs(s.y - c.y - 0.6) > 1.6) continue;
      const dx = s.x - c.x, dz = s.z - c.z;
      if (dx * dx + dz * dz > STAR_R * STAR_R) continue;
      s.alive = false;
      s.back = STAR_BACK;
      addNitro(c, STAR_NITRO);
      onStar(c, s);
    }
  }
}

// A flat mesh from 2D outline points (x, z), lying on the ground, lit from above.
function flat(name, scene, pts, tris) {
  const m = new Mesh(name, scene), vd = new VertexData();
  vd.positions = pts.flatMap(([x, z]) => [x, 0, z]);
  vd.indices = tris;
  vd.normals = pts.flatMap(() => [0, 1, 0]);
  vd.applyToMesh(m);
  return m;
}

// A chunky five pointed star standing upright, thick enough to read from the side as it spins.
function starMesh(scene) {
  const pos = [], idx = [], nrm = [], T = 0.28;
  const outline = [];
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2, r = k % 2 ? 0.42 : 1;
    outline.push([Math.sin(a) * r, Math.cos(a) * r]);
  }
  for (const side of [1, -1]) { // front and back faces: a fan round the middle
    const base = pos.length / 3;
    pos.push(0, 0, side * T);
    nrm.push(0, 0, side);
    for (const [x, y] of outline) { pos.push(x, y, side * T * 0.35); nrm.push(x * 0.4, y * 0.4, side); }
    for (let k = 0; k < 10; k++) {
      const a = base + 1 + k, b = base + 1 + ((k + 1) % 10);
      if (side > 0) idx.push(base, b, a); else idx.push(base, a, b);
    }
  }
  const vd = new VertexData();
  vd.positions = pos; vd.indices = idx;
  VertexData.ComputeNormals(pos, idx, nrm);
  vd.normals = nrm;
  const m = new Mesh('star', scene);
  vd.applyToMesh(m);
  return m;
}

const glow = (scene, name, hex, alpha = 1) => {
  const m = new StandardMaterial(name, scene);
  m.diffuseColor = Color3.Black();
  m.specularColor = Color3.Black();
  m.emissiveColor = Color3.White(); // the real colour comes from each instance, so the chevrons can pulse
  m.disableLighting = true;
  m.alpha = alpha;
  m.backFaceCulling = false;
  if (hex) m.emissiveColor = Color3.FromHexString(hex);
  return m;
};

// Builds the pad and star meshes. Returns { update(dt, t) } to animate them once a frame.
export function buildPickups(scene, track) {
  const pads = track.pads, stars = track.stars;
  const all = [];

  // pad base: a dark blue plate with a glowing rim, then three chevrons that light up in a running wave
  const plate = flat('padPlate', scene, [[-PAD_W / 2, -PAD_LEN / 2], [PAD_W / 2, -PAD_LEN / 2], [PAD_W / 2, PAD_LEN / 2], [-PAD_W / 2, PAD_LEN / 2]], [0, 2, 1, 0, 3, 2]);
  plate.material = glow(scene, 'padPlateMat', '#2a62e8', 0.9);
  // a chevron pointing down the road (+z), as two slanted bars
  const w = PAD_W * 0.4, th = 1.05, tip = 1.5;
  const chev = flat('padChevron', scene, [[-w, -tip], [-w, -tip + th], [0, th], [w, -tip + th], [w, -tip], [0, 0]], [0, 1, 2, 0, 2, 5, 5, 2, 3, 5, 3, 4]);
  chev.material = glow(scene, 'padChevMat');
  const plateM = new Float32Array(pads.length * 16), chevM = new Float32Array(pads.length * 3 * 16);
  const chevC = new Float32Array(pads.length * 3 * 4);
  const q = new Quaternion(), one = new Vector3(1, 1, 1), v = new Vector3(), mtx = new Matrix();
  pads.forEach((p, i) => {
    Quaternion.FromEulerAnglesToRef(p.tip ?? 0, p.h, 0, q); // lying along the slope of the road
    Matrix.ComposeToRef(one, q, v.set(p.x, p.y + 0.07, p.z), mtx);
    mtx.copyToArray(plateM, i * 16);
    for (let k = 0; k < 3; k++) {
      const off = (k - 1) * 2.5 - 0.3;
      Matrix.ComposeToRef(one, q, v.set(p.x + Math.sin(p.h) * off, p.y + 0.09 - Math.sin(p.tip ?? 0) * off, p.z + Math.cos(p.h) * off), mtx);
      mtx.copyToArray(chevM, (i * 3 + k) * 16);
    }
  });
  if (pads.length) {
    plate.thinInstanceSetBuffer('matrix', plateM, 16, true);
    chev.thinInstanceSetBuffer('matrix', chevM, 16, true);
    chev.thinInstanceSetBuffer('color', chevC, 4, false);
  }
  plate.isPickable = chev.isPickable = false;
  all.push(plate, chev);

  // stars: gold, spinning and bobbing; picked-up ones shrink to nothing until they come back
  const star = starMesh(scene);
  const sm = new StandardMaterial('starMat', scene);
  sm.diffuseColor = Color3.FromHexString('#ffd23f');
  sm.emissiveColor = Color3.FromHexString('#d99a00'); // lit from inside, so it shines even from the shady side
  sm.specularColor = new Color3(1, 1, 0.8);
  sm.specularPower = 24;
  star.material = sm;
  star.isPickable = false;
  const starM = new Float32Array(Math.max(1, stars.length) * 16);
  const size = new Float32Array(stars.length).fill(1);
  if (stars.length) star.thinInstanceSetBuffer('matrix', starM, 16, false);
  else star.setEnabled(false);
  if (!pads.length) { plate.setEnabled(false); chev.setEnabled(false); }
  all.push(star);
  for (const m of all) m.alwaysSelectAsActiveMesh = true; // thin instances are spread round the whole lap

  const sc = new Vector3();
  return {
    update(dt, t) {
      if (pads.length) {
        // a bright wave runs up each pad, from the back chevron to the front one
        for (let i = 0; i < pads.length; i++) {
          for (let k = 0; k < 3; k++) {
            const b = Math.max(0, Math.cos(t * 7 - k * 1.3)) ** 2; // 0..1, peaks run front-wards
            const o = (i * 3 + k) * 4;
            chevC[o] = 1; chevC[o + 1] = 0.72 + 0.28 * b; chevC[o + 2] = 0.1 + 0.8 * b; chevC[o + 3] = 1; // gold, flashing white
          }
        }
        chev.thinInstanceBufferUpdated('color');
      }
      if (stars.length) {
        Quaternion.FromEulerAnglesToRef(0, t * 3, 0, q);
        for (let i = 0; i < stars.length; i++) {
          const s = stars[i];
          size[i] += ((s.alive ? 1 : 0) - size[i]) * Math.min(1, dt * (s.alive ? 4 : 14));
          const k = size[i] * 0.9;
          Matrix.ComposeToRef(sc.set(k, k, k), q, v.set(s.x, s.y + 0.2 + Math.sin(t * 3 + i) * 0.18, s.z), mtx);
          mtx.copyToArray(starM, i * 16);
        }
        star.thinInstanceBufferUpdated('matrix');
      }
    },
    dispose() { for (const m of all) m.dispose(); },
  };
}
