// The land right beside the road. Grassy (or snowy, or sandy) banks rise just past the invisible wall,
// and close-up layers sit on them: hedges, stone walls, snowbanks, hoardings, lamp posts, snow poles,
// ferns, flowers, grass, branches hanging over the road... Things flashing past close by make the speed
// feel real, and the banks hide the far distance, so less of it needs to be drawn (see cullByDistance).
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { WALL_MARGIN } from './physics.js';

export const SAFE = WALL_MARGIN + 1.8; // past the road edge: further than any part of a car can reach
export const CHUNK = 220; // meters: size of the map squares that merged meshes are split into
const CELL = 16; // buckets for quick "what is near here" lookups
const ckey = (cx, cz) => (cx + 4096) * 8192 + (cz + 4096);
const smooth = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));

// Quick distance-to-the-road: the road samples sorted into buckets, so only the nearby ones are checked.
export function roadField(track, hw) {
  const cells = new Map();
  for (const s of track.samples) {
    const k = ckey(Math.floor(s.x / CELL), Math.floor(s.z / CELL));
    if (!cells.has(k)) cells.set(k, []);
    cells.get(k).push(s);
  }
  // every bucket within BAND buckets of the road, so faraway spots can give up at once
  const BAND = 4, band = new Set();
  for (const k of cells.keys()) {
    const cx = Math.floor(k / 8192) - 4096, cz = (k % 8192) - 4096;
    for (let i = -BAND; i <= BAND; i++) for (let j = -BAND; j <= BAND; j++) band.add(ckey(cx + i, cz + j));
  }
  return {
    // meters from (x, z) to the edge of the nearest bit of road; anything further than `reach` comes back as reach
    gap(x, z, reach = 60) {
      const n = Math.ceil((reach + hw) / CELL), cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
      if (n <= BAND && !band.has(ckey(cx, cz))) return reach;
      let best = (reach + hw) ** 2;
      for (let i = -n; i <= n; i++) for (let j = -n; j <= n; j++) {
        const l = cells.get(ckey(cx + i, cz + j));
        if (l) for (const s of l) { const d = (s.x - x) ** 2 + (s.z - z) ** 2; if (d < best) best = d; }
      }
      return Math.sqrt(best) - hw;
    },
  };
}

// A quick "is anything built here?" test over a growing list of [x, z, radius] spots (it picks up new
// ones each time it is asked). hit(x, z, r): is (x, z) within r of any of them?
export function spotGrid(list) {
  const cells = new Map(), big = [];
  let done = 0;
  const sync = () => {
    for (; done < list.length; done++) {
      const e = list[done], [x, z, r] = e;
      if (r > 40) { big.push(e); continue; }
      for (let cx = Math.floor((x - r) / CELL); cx <= Math.floor((x + r) / CELL); cx++) for (let cz = Math.floor((z - r) / CELL); cz <= Math.floor((z + r) / CELL); cz++) {
        const k = ckey(cx, cz);
        if (!cells.has(k)) cells.set(k, []);
        cells.get(k).push(e);
      }
    }
  };
  const near = (x, z, r, [bx, bz, br]) => (x - bx) ** 2 + (z - bz) ** 2 < (br + r) ** 2;
  return {
    hit(x, z, r = 0) {
      sync();
      if (big.some((e) => near(x, z, r, e))) return true;
      for (let cx = Math.floor((x - r) / CELL); cx <= Math.floor((x + r) / CELL); cx++) for (let cz = Math.floor((z - r) / CELL); cz <= Math.floor((z + r) / CELL); cz++) {
        const l = cells.get(ckey(cx, cz));
        if (l && l.some((e) => near(x, z, r, e))) return true;
      }
      return false;
    },
  };
}

// The look of each kind of place. bank: how tall the banks get (m); open: how much of the way has no bank
// at all (0..1), so there are still glimpses out across the land.
const THEMES = {
  speedway: { bank: 4.6, open: 0.22, tuft: '#5fae48', flowers: ['#ff5fa2', '#ffd23f', '#ffffff', '#e63946', '#8e44ec'], bloom: 0.35, bush: ['#4f9e3d', '#5aa644', '#3f8a35'] },
  woods: { bank: 7, open: 0.05, tuft: '#4c8f3e', flowers: ['#ffffff', '#b38cff', '#ffd23f'], bloom: 0.12, bush: ['#2f6b3a', '#3e7d3f', '#4f8f3a'] },
  site: { bank: 6, open: 0.15, tuft: '#8f9a52', flowers: [], bloom: 0, bush: ['#6f8f4a', '#7d8f55'] },
  jungle: { bank: 6.5, open: 0.08, tuft: '#5d9a2e', flowers: ['#ff5fa2', '#ff8c1a', '#ffd23f', '#e63946'], bloom: 0.25, bush: ['#2f7a2a', '#3f8f30', '#4fa03a'] },
  coast: { bank: 5, open: 0.2, tuft: '#5fae48', flowers: ['#ffffff', '#ffd23f', '#ff5fa2'], bloom: 0.3, bush: ['#4f9e3d', '#5aa644', '#3f8a35'] },
  winter: { bank: 5.5, open: 0.1, tuft: null, flowers: [], bloom: 0, bush: ['#e6eef5', '#d5e2ec', '#c9d9e3'] },
  desert: { bank: 4.4, open: 0.3, tuft: '#c9b16a', flowers: ['#ffd23f', '#ff8c1a'], bloom: 0.1, bush: ['#8f9352', '#a39a5a', '#7f8a4a'] },
};
const BY_STYLE = { speedway: 'speedway', woods: 'woods', site: 'site', jungle: 'jungle' };
export function themeOf(land, def) {
  return land.theme ?? BY_STYLE[def.dress?.style] ?? (land.surface === 'snow' ? 'winter' : land.surface === 'sand' ? 'desert' : 'coast');
}

// The banks. heightAt(x, z) is how high the ground is there (0 = the flat ground everything else stands on).
// Until freeze() it is flat everywhere; freeze() notes what has been built so far (stands, buildings, the
// lake...), and the banks then keep clear of all of it. They sit on top of `base(x, z)`, the ground's own
// height (hills round a hilly road). Anything in `built` with a 4th value set (small
// things that can sit on a slope) does not count.
export function makeTerrain(track, def, { hw, field, built, landAt, lake, inSea, base = () => 0 }) {
  let flats = null;
  const big = [], START = SAFE + 1; // banks start rising just past the tyre walls and arrow boards
  // smooth wobble across the map, 0..1: where the banks are tall, low or missing
  const noise = (x, z) => 0.5 + 0.3 * Math.sin(x * 0.021 + z * 0.013 + 0.7) + 0.13 * Math.sin(x * 0.047 - z * 0.039 + 1.3) + 0.07 * Math.sin(-x * 0.11 + z * 0.093 + 2.1);
  // 0 on (or right next to) something that needs flat ground, 1 well clear of it
  const clear = (x, z) => {
    let m = 1;
    const l = flats.get(ckey(Math.floor(x / CELL), Math.floor(z / CELL)));
    if (l) for (const [bx, bz, br] of l) { const d = Math.hypot(x - bx, z - bz) - br; if (d < 7) m = Math.min(m, smooth((d - 1) / 6)); }
    for (const [bx, bz, br] of big) { const d = Math.hypot(x - bx, z - bz) - br; if (d < 7) m = Math.min(m, smooth((d - 1) / 6)); }
    if (lake && m > 0) m = Math.min(m, lake.covers(x, z, 7) ? 0 : lake.covers(x, z, 13) ? 0.4 : lake.covers(x, z, 19) ? 0.75 : 1);
    if (inSea(x, 12)) m = 0;
    else if (inSea(x, 24)) m = Math.min(m, 0.5);
    return m;
  };
  // the shape worked out from scratch (slow: it is only used to fill in the grid, in freeze)
  const shape = (x, z) => {
    const n = noise(x, z), g = field.gap(x, z, 52), u = g - START - n * 1.5;
    if (u <= 0 || g >= 52) return 0;
    const t = THEMES[themeOf(landAt(x, z), def)];
    const rise = 5 + n * 3, top = 3 + n * 10, fall = 14;
    const p = u < rise ? smooth(u / rise) : u < rise + top ? 1 : smooth(1 - (u - rise - top) / fall);
    const peak = t.bank * smooth((n - t.open) / 0.25) * (0.7 + 0.6 * n);
    if (p <= 0 || peak <= 0) return 0;
    const lump = 1 + 0.12 * Math.sin(x * 0.31 + Math.sin(z * 0.2)) * Math.sin(z * 0.27);
    return peak * p * lump * clear(x, z);
  };
  // the grid of heights the banks are built from, 3 m apart, and a lookup that matches the built triangles
  const STEP = 3, pad = hw + START + 45;
  let x0 = 0, z0 = 0, W = 0, D = 0, H = null;
  const corner = (k) => (H[k] > 0.03 ? H[k] : -0.4);
  const heightAt = (x, z) => {
    if (!H) return 0;
    const fx = (x - x0) / STEP, fz = (z - z0) / STEP, i = Math.floor(fx), j = Math.floor(fz);
    if (i < 0 || j < 0 || i >= W - 1 || j >= D - 1) return 0;
    const u = fx - i, v = fz - j, k = j * W + i, a = corner(k), b = corner(k + 1), c = corner(k + W + 1), d = corner(k + W);
    return Math.max(0, u >= v ? a + (b - a) * u + (c - b) * v : a + (c - d) * u + (d - a) * v);
  };
  return {
    heightAt,
    // the lowest ground round a spot: stand things there, so no edge floats on a slope
    groundAt: (x, z, r = 1) => Math.min(heightAt(x, z), heightAt(x + r, z), heightAt(x - r, z), heightAt(x, z + r), heightAt(x, z - r)),
    freeze() {
      flats = new Map();
      for (const [x, z, r, onBank] of built) {
        if (onBank) continue;
        if (r > 40) { big.push([x, z, r]); continue; }
        const reach = r + 8;
        for (let cx = Math.floor((x - reach) / CELL); cx <= Math.floor((x + reach) / CELL); cx++) for (let cz = Math.floor((z - reach) / CELL); cz <= Math.floor((z + reach) / CELL); cz++) {
          const k = ckey(cx, cz);
          if (!flats.has(k)) flats.set(k, []);
          flats.get(k).push([x, z, r]);
        }
      }
      const xs = track.samples.map((s) => s.x), zs = track.samples.map((s) => s.z);
      x0 = Math.floor((Math.min(...xs) - pad) / STEP) * STEP;
      z0 = Math.floor((Math.min(...zs) - pad) / STEP) * STEP;
      W = Math.ceil((Math.max(...xs) + pad - x0) / STEP) + 1;
      D = Math.ceil((Math.max(...zs) + pad - z0) / STEP) + 1;
      const grid = new Float32Array(W * D);
      for (let j = 0; j < D; j++) for (let i = 0; i < W; i++) grid[j * W + i] = shape(x0 + i * STEP, z0 + j * STEP);
      H = grid;
    },
    // Builds the banks as a height grid, in map-square chunks, using each land's own ground (so they
    // blend into the flat ground round them). groundMat(land): the material for that land's ground.
    build(scene, groundMat, tile) {
      if (!H) return [];
      const groups = new Map(), mats = new Map(), meshes = [];
      for (let j = 0; j < D - 1; j++) for (let i = 0; i < W - 1; i++) {
        const k = j * W + i;
        if (Math.max(H[k], H[k + 1], H[k + W], H[k + W + 1]) < 0.03) continue;
        const cx = x0 + (i + 0.5) * STEP, cz = z0 + (j + 0.5) * STEP, land = landAt(cx, cz);
        const key = `${land.name ?? ''}${land.surface ?? ''}${land.ground}|${Math.floor(cx / CHUNK)},${Math.floor(cz / CHUNK)}`;
        if (!groups.has(key)) groups.set(key, { land, P: [], U: [], I: [], idx: new Map() });
        const g = groups.get(key);
        const v = (ii, jj) => {
          const kk = jj * W + ii;
          let id = g.idx.get(kk);
          if (id === undefined) {
            id = g.P.length / 3;
            g.idx.set(kk, id);
            const x = x0 + ii * STEP, z = z0 + jj * STEP, h = H[kk];
            g.P.push(x, base(x, z) + (h > 0.03 ? h : -0.4), z); // the foot tucks just under the ground
            g.U.push(x / tile, z / tile);
          }
          return id;
        };
        const a = v(i, j), b = v(i + 1, j), c = v(i + 1, j + 1), d = v(i, j + 1);
        g.I.push(a, b, c, a, c, d); // wound to face up
      }
      for (const [key, g] of groups) {
        const m = new Mesh('bank' + key, scene), vd = new VertexData();
        vd.positions = g.P;
        vd.indices = g.I;
        vd.uvs = g.U;
        vd.normals = [];
        VertexData.ComputeNormals(g.P, g.I, vd.normals);
        vd.applyToMesh(m);
        if (!mats.has(g.land)) mats.set(g.land, groundMat(g.land));
        m.material = mats.get(g.land);
        m.receiveShadows = true;
        m.isPickable = false;
        m.freezeWorldMatrix();
        meshes.push(m);
      }
      return meshes;
    },
  };
}

// Hides meshes that are far from the camera (checked a few times a second). list: [mesh, how far it
// stays shown]. A mesh counts as near if any part of its box is within range.
export function cullByDistance(scene, list) {
  const items = list.filter(([m]) => m).map(([m, range]) => {
    const { minimumWorld: a, maximumWorld: b } = m.getBoundingInfo().boundingBox;
    return { m, range, x0: a.x, x1: b.x, z0: a.z, z1: b.z };
  });
  let wait = 0;
  const check = () => {
    const cam = scene.activeCamera;
    if (!cam) return;
    const { x, z } = cam.globalPosition;
    for (const it of items) {
      const dx = Math.max(it.x0 - x, 0, x - it.x1), dz = Math.max(it.z0 - z, 0, z - it.z1);
      const on = dx * dx + dz * dz < it.range * it.range;
      if (on !== it.m.isEnabled(false)) it.m.setEnabled(on);
    }
  };
  scene.onBeforeRenderObservable.add(() => {
    if (--wait > 0) return;
    wait = 8;
    check();
  });
  return check;
}

// The close-up layers along both sides of the lap. o: { track, hw, def, B (shadow-casting chunk batch at
// x, z), D (detail batch: small things that cast no shadow), frame, free(x, z, r), claim(x, z, r),
// ground(x, z, r) (bank height), landAt, rand, avoided(i), flag(batch, x, y, z, tall, col), uv(name), lake,
// outside (+1/-1: the side away from the middle of the loop) }
export function dressRoadside(o) {
  const { track, hw, def, B, D, frame, free, claim, ground, landAt, rand, avoided, flag, uv, lake } = o;
  const { samples, count } = track;
  const pick = (list) => list[Math.floor(rand() * list.length)];
  const themeAt = (x, z) => themeOf(landAt(x, z), def);
  const EDGE = hw + SAFE + 1.5; // the hedges, walls and snowbanks
  const POST = hw + SAFE + 0.9; // posts and poles

  for (const side of [-1, 1]) {
    let wire = null; // the top of the last telephone pole, to string the wire from
    for (let i = 0; i < count; i++) {
      const s = samples[i], dist = i * 2;
      const spot = (off, along = 0) => [s.x + s.rx * side * off + s.tx * along, s.z + s.rz * side * off + s.tz * along];
      const [ex, ez] = spot(EDGE), T = themeAt(ex, ez), look = THEMES[T];
      const face = Math.atan2(side * s.rx, side * s.rz); // local +z points away from the road
      const skip = avoided(i);

      // ---- grass tufts and flowers, near the road and up the banks (detail: no shadows) ----
      // (soft little things, so they may grow in the run-off too, right up to the kerb)
      for (let k = 0; k < 2; k++) {
        const off = hw + 1.8 + rand() ** 1.2 * (SAFE + 16), [x, z] = spot(off, (rand() - 0.5) * 2);
        if (!free(x, z, 0.3, 1.5)) continue;
        const y = ground(x, z, 0.3) - 0.05, f = frame(x, y, z, rand() * 6), d = D(x, z);
        if (look.flowers.length && rand() < look.bloom) flower(d, f, pick(look.flowers));
        else if (look.tuft) tuft(d, f, look.tuft, 0.6 + rand() * 0.5);
        else if (T === 'winter' && rand() < 0.3) d.ball(f, 0, 0, 0, 0.5 + rand() * 0.4, 0.25, 0.5, '#f4f8fc', 5, 2); // snow lumps
      }

      // ---- the edge: a continuous line just past the wall (every 4 m) ----
      if (i % 2 === 0 && !skip) {
        const t = samples[(i + 2) % count];
        const a = spot(EDGE), c = [t.x + t.rx * side * EDGE, t.z + t.rz * side * EDGE];
        const len = Math.hypot(c[0] - a[0], c[1] - a[1]);
        const mx = (a[0] + c[0]) / 2, mz = (a[1] + c[1]) / 2;
        if (len < 8 && free(a[0], a[1], 0.7) && free(c[0], c[1], 0.7) && free(mx, mz, 0.7)) {
          const f = frame(mx, Math.min(ground(a[0], a[1]), ground(c[0], c[1])), mz, Math.atan2(c[0] - a[0], c[1] - a[1]));
          edge(T, f, len, dist, B(mx, mz), side);
        }
      }

      // ---- posts at a steady beat: the strongest sense of speed ----
      if (!skip) post(T, i, dist, side, spot, face);

      // ---- bushes, ferns, rocks and cacti up on the banks ----
      if (i % 3 === 0) {
        const off = hw + SAFE + 4 + rand() * 13, [x, z] = spot(off, (rand() - 0.5) * 4);
        if (free(x, z, 1.4)) {
          const y = ground(x, z, 1) - 0.2, f = frame(x, y, z, rand() * 6), b = B(x, z);
          bankPlant(T, f, b, look);
          claim(x, z, 1.2);
        }
      }

      // ---- Twisty Woods: big trees leaning their branches right over the road ----
      if (T === 'woods' && i % 13 === (side > 0 ? 0 : 6) && !skip && s.curve < 0.9) {
        const off = hw + SAFE + 1.8, [x, z] = spot(off);
        if (free(x, z, 1.2)) {
          canopy(B(x, z), frame(x, ground(x, z, 1), z, face + Math.PI), off - hw * 0.55);
          claim(x, z, 2);
        }
      }
    }

    function post(T, i, dist, side, spot, face) {
      const s = samples[i];
      if (T === 'speedway' && dist % 22 === (side > 0 ? 0 : 12)) { // lamp posts, with a flag on every third
        const [x, z] = spot(POST);
        if (!free(x, z, 0.6)) return;
        const b = B(x, z), f = frame(x, 0, z, face);
        if ((dist / 22) % 3 < 1) { flag(b, x, 0, z, 6.5, null); claim(x, z, 0.8); return; }
        b.cyl(f, 0, 0, 0, 0.13, 0.09, 6.8, 6, '#d9dde3', { capCol: '#9aa0a8' });
        b.box(f, 0, 6.7, -1.0, 0.16, 0.16, 2.2, '#d9dde3');
        b.box(f, 0, 6.55, -2.0, 0.5, 0.22, 0.9, '#2b2f38', { topCol: '#2b2f38' });
        b.box(f, 0, 6.42, -2.0, 0.4, 0.06, 0.75, '#fff6c8');
        claim(x, z, 0.8);
      } else if (T === 'winter' && dist % 12 === (side > 0 ? 0 : 6)) { // red and white snow poles
        const [x, z] = spot(POST);
        if (!free(x, z, 0.4)) return;
        const b = B(x, z), f = frame(x, ground(x, z, 0.3), z, face);
        for (let k = 0; k < 4; k++) b.cyl(f, 0, k * 0.6, 0, 0.07, 0.07, 0.6, 5, k % 2 ? '#ffffff' : '#e63946');
        claim(x, z, 0.5);
      } else if (T === 'jungle' && dist % 18 === (side > 0 ? 0 : 9)) { // bamboo tiki torches
        const [x, z] = spot(POST);
        if (!free(x, z, 0.5)) return;
        const b = B(x, z), f = frame(x, 0, z, face);
        b.cyl(f, 0, 0, 0, 0.1, 0.09, 2.6, 6, '#c9a35b');
        for (const y of [0.8, 1.7]) b.cyl(f, 0, y, 0, 0.12, 0.12, 0.08, 6, '#a37a43');
        b.cyl(f, 0, 2.5, 0, 0.16, 0.28, 0.4, 6, '#6b4a2a');
        b.cyl(f, 0, 2.85, 0, 0.24, 0, 0.75, 5, '#ff8c1a');
        b.cyl(f, 0, 2.85, 0, 0.13, 0, 0.5, 5, '#ffd23f', { twist: 0.5 });
        claim(x, z, 0.6);
      } else if (T === 'site' && dist % 44 === (side > 0 ? 0 : 22)) { // floodlight towers
        const [x, z] = spot(POST + 0.4);
        if (!free(x, z, 1)) return;
        const b = B(x, z), f = frame(x, 0, z, face);
        b.box(f, 0, 0.2, 0, 1.4, 0.4, 1.4, '#59616b');
        b.box(f, 0, 4.5, 0, 0.3, 9, 0.3, '#f2b705');
        b.box(f, 0, 9.1, -0.2, 2.6, 0.2, 0.2, '#2b2f38');
        for (const lx of [-0.9, 0, 0.9]) b.box(f, lx, 9.5, -0.35, 0.7, 0.55, 0.3, '#2b2f38', { frontCol: '#fff6c8' });
        claim(x, z, 1.2);
      } else if ((T === 'coast' || T === 'desert') && side === (o.outside ?? -1) && dist % 34 === 0) { // telephone poles, with a wire
        const [x, z] = spot(POST + 2);
        if (!free(x, z, 0.5)) { wire = null; return; }
        const b = B(x, z), f = frame(x, ground(x, z, 0.4) - 0.1, z, face + Math.PI / 2);
        b.cyl(f, 0, 0, 0, 0.17, 0.13, 8.2, 6, '#7a5230');
        b.box(f, 0, 7.6, 0, 0.14, 0.16, 2.0, '#6b4528');
        for (const lz of [-0.8, 0.8]) b.box(f, 0, 7.75, lz, 0.1, 0.16, 0.1, '#ffffff');
        const top = f.at(0, 7.8, 0);
        if (wire && Math.hypot(top[0] - wire[0], top[2] - wire[2]) < 45) {
          const len = Math.hypot(top[0] - wire[0], top[2] - wire[2]), mid = [(top[0] + wire[0]) / 2, 0, (top[2] + wire[2]) / 2];
          const g = frame(mid[0], 0, mid[2], Math.atan2(top[0] - wire[0], top[2] - wire[2]));
          for (const lx of [-0.8, 0.8]) { // two wires, each sagging in the middle (three straight bits)
            b.box(g, lx, 7.6 - 0.35, -len / 3, 0.05, 0.05, len / 3 + 0.1, '#2b2b2e', { pitch: 0.06 });
            b.box(g, lx, 7.6 - 0.62, 0, 0.05, 0.05, len / 3 + 0.1, '#2b2b2e');
            b.box(g, lx, 7.6 - 0.35, len / 3, 0.05, 0.05, len / 3 + 0.1, '#2b2b2e', { pitch: -0.06 });
          }
        }
        wire = top;
        claim(x, z, 0.6);
      } else if (T === 'desert' && side !== (o.outside ?? -1) && dist % 6 === 0 && Math.floor(dist / 90) % 3 !== 2) { // ranch fence
        const [x, z] = spot(POST), t = samples[(i + 3) % count];
        const c = [t.x + t.rx * side * POST, t.z + t.rz * side * POST];
        if (!free(x, z, 0.4) || !free(c[0], c[1], 0.4)) return;
        const b = B(x, z), f = frame(x, ground(x, z, 0.3), z, Math.atan2(c[0] - x, c[1] - z)), len = Math.hypot(c[0] - x, c[1] - z);
        b.box(f, 0, 0.65, 0, 0.18, 1.3, 0.18, '#8b6a3e');
        for (const y of [0.55, 1.05]) b.box(f, 0, y, len / 2, 0.04, 0.04, len, '#6e5a44');
      }
    }
  }

  // ---- the edge pieces, each `len` long along local z, centred on f ----
  function edge(T, f, len, dist, b, side) {
    const run = Math.floor(dist / 64) % 4; // runs with breaks, so it is not one endless wall
    if (T === 'speedway' && run !== 3) { // clipped hedge
      b.box(f, 0, 0.55, 0, 1.1, 1.1, len + 0.15, '#3f8f3a', { topCol: '#4fa84a' });
      if (rand() < 0.25) b.ball(f, 0, 1.1, (rand() - 0.5) * len, 0.18, 0.18, 0.18, pick(['#ff5fa2', '#ffffff', '#ffd23f']), 5, 3);
    } else if (T === 'coast' && run !== 3) { // New England stone wall
      const stones = ['#9ea3a8', '#8a8f94', '#b3b6b9', '#7d8287'];
      for (let k = 0; k < 3; k++) b.box(f, (rand() - 0.5) * 0.15, 0.2, -len / 2 + (k + 0.5) * (len / 3), 0.95, 0.42, len / 3 + 0.05, pick(stones), { roll: (rand() - 0.5) * 0.1 });
      for (let k = 0; k < 2; k++) b.box(f, (rand() - 0.5) * 0.1, 0.6, -len / 2 + (k + 0.5) * (len / 2), 0.8, 0.38, len / 2 + 0.04, pick(stones), { roll: (rand() - 0.5) * 0.12 });
    } else if (T === 'winter') { // a ploughed snowbank, lumpy
      b.ball(f, 0, 0.05, 0, 1.7, 1.0 + rand() * 0.4, len * 0.66, '#f4f8fc', 7, 4);
      if (rand() < 0.4) b.ball(f, (rand() - 0.5), 0.6, (rand() - 0.5) * len, 0.8, 0.6, 0.8, '#eaf1f8', 5, 3);
    } else if (T === 'site') {
      if (run < 2) { // tall plywood hoarding with a hazard stripe along the top
        b.box(f, 0, 1.25, 0, 0.12, 2.2, len + 0.05, run ? '#ffffff' : '#f2b705', { side: run ? '#e3e5e8' : '#d99e00' });
        // the stripes, on a board turned so its face looks at the road
        b.box(frame(...f.at(-side * 0.08, 0, 0), f.yaw + side * Math.PI / 2), 0, 2.25, 0, len + 0.05, 0.3, 0.03, '#ffffff', { front: uv('hazard') });
        b.box(f, side * 0.3, 0.6, 0, 0.12, 1.2, 0.12, '#59616b', { roll: side * 0.5 }); // brace behind
      } else if (run === 2) { // orange safety mesh on little posts
        b.box(f, 0, 0.55, -len / 2, 0.1, 1.1, 0.1, '#59616b');
        b.box(f, 0, 0.6, 0, 0.03, 0.75, len, '#ff8c1a');
      }
    } else if (T === 'woods' && rand() < 0.4) { // mossy boulders
      b.ball(f, 0, 0.2, 0, 0.9 + rand() * 0.6, 0.7 + rand() * 0.4, 1 + rand() * 0.8, '#858b80', 6, 3, { band: [2, '#858b80'] });
      b.ball(f, 0, 0.75, 0, 0.8, 0.25, 0.9, '#5f8f2c', 6, 2);
    } else if (T === 'jungle') { // big fern fans
      fern(b, f.sub(0, 0, (rand() - 0.5) * len * 0.5, rand() * 6), 1.1 + rand() * 0.6, pick(['#3f8f30', '#2f7a2a', '#4fa03a']));
    } else if (T === 'desert' && rand() < 0.35) { // a little heap of red rocks
      for (let k = 0; k < 3; k++) b.ball(f, (rand() - 0.5) * 1.4, 0, (rand() - 0.5) * len * 0.8, 0.5 + rand() * 0.5, 0.4 + rand() * 0.5, 0.5 + rand() * 0.4, pick(['#b4683f', '#c97a4a', '#9c5534']), 5, 3);
    }
  }

  function bankPlant(T, f, b, look) {
    if (T === 'woods' || T === 'jungle') {
      if (rand() < 0.55) return fern(b, f, 1.2 + rand() * 0.8, pick(look.bush));
    }
    if (T === 'desert') {
      if (rand() < 0.5) return cactus(b, f, 1.6 + rand() * 1.8);
      for (let k = 0; k < 2; k++) b.ball(f, (rand() - 0.5) * 2, 0, (rand() - 0.5) * 2, 0.6 + rand() * 0.6, 0.5 + rand() * 0.5, 0.6 + rand() * 0.5, pick(['#b4683f', '#c97a4a', '#cf9a6c']), 5, 3);
      return;
    }
    if (T === 'site' && rand() < 0.6) { // rubble
      for (let k = 0; k < 3; k++) b.ball(f, (rand() - 0.5) * 2.4, 0, (rand() - 0.5) * 2.4, 0.5 + rand() * 0.5, 0.35 + rand() * 0.3, 0.5 + rand() * 0.4, pick(['#8b8e92', '#9a9a96', '#8a6a45']), 5, 3);
      return;
    }
    if (T === 'winter' && rand() < 0.5) { // a little snowy fir
      const h = 1.6 + rand() * 1.6;
      b.cyl(f, 0, 0, 0, h * 0.35, 0, h, 6, '#2f5f3e');
      b.cyl(f, 0, h * 0.35, 0, h * 0.28, 0, h * 0.7, 6, '#eef4fb', { twist: 0.5 });
      return;
    }
    // a round bush, sometimes in flower (blue and pink hydrangeas by the sea)
    const r = 0.8 + rand() * 0.7, col = pick(look.bush);
    b.ball(f, 0, r * 0.55, 0, r, r * 0.75, r, col, 6, 4);
    b.ball(f, r * 0.5, r * 0.75, r * 0.2, r * 0.6, r * 0.55, r * 0.6, col, 5, 3);
    if (T === 'coast' && rand() < 0.5) for (let k = 0; k < 4; k++) { const a = k * 1.6 + rand(); b.ball(f, Math.sin(a) * r * 0.75, r * (0.85 + rand() * 0.3), Math.cos(a) * r * 0.75, 0.3, 0.26, 0.3, pick(['#7da7ff', '#b38cff', '#ff9ccf']), 5, 3); }
  }

  function cactus(b, f, h) {
    const col = '#4f8f3a';
    b.cyl(f, 0, 0, 0, 0.28, 0.24, h, 7, col);
    b.ball(f, 0, h, 0, 0.24, 0.2, 0.24, col, 7, 3);
    for (const side of [-1, 1]) {
      if (rand() < 0.3) continue;
      const y = h * (0.35 + rand() * 0.25), up = h * 0.35;
      b.box(f, side * 0.45, y, 0, 0.5, 0.3, 0.3, col);
      b.cyl(f, side * 0.62, y, 0, 0.17, 0.15, up, 6, col);
      b.ball(f, side * 0.62, y + up, 0, 0.15, 0.13, 0.15, col, 6, 3);
    }
    if (rand() < 0.4) b.ball(f, 0, h + 0.18, 0, 0.12, 0.1, 0.12, '#ff5fa2', 5, 3); // a flower on top
  }

  // a fan of long leaves arching up and out
  function fern(b, f, size, col) {
    for (let k = 0; k < 7; k++) {
      const g = f.sub(0, 0, 0, (k / 7) * Math.PI * 2 + rand() * 0.4);
      b.box(g, 0, size * 0.4, size * 0.75, size * 0.32, 0.06, size * 1.6, col, { pitch: -0.55 - rand() * 0.3 });
    }
  }

  // a big tree at the roadside whose branches reach over the road. f: its frame, facing the road (+z);
  // reach: how far out over the road the leaves go
  function canopy(b, f, reach) {
    const bark = '#6e4b2e', leaves = ['#3e8a3a', '#4f9e3d', '#2f7a35'];
    b.cyl(f, 0, 0, 0, 0.75, 0.5, 9, 7, bark);
    b.box(f, 0, 7.6, reach * 0.4, 0.5, 0.5, reach * 0.9, bark, { pitch: -0.28 }); // the bough
    b.ball(f, 0, 10.5, -0.5, 4.2, 3.2, 4.2, pick(leaves), 7, 4);
    for (let k = 1; k <= 3; k++) {
      const z = (k / 3) * reach, r = 3.4 - k * 0.3;
      b.ball(f, (rand() - 0.5) * 2, 9.4 + rand() * 0.8, z, r, r * 0.6, r, pick(leaves), 7, 4);
    }
  }

  // ---- reeds and lily pads round the lake ----
  if (lake) {
    for (let a = 0; a < Math.PI * 2; a += 0.012) {
      const slot = Math.floor((a / (Math.PI * 2)) * lake.N) % lake.N, r = lake.radius[slot] + 0.5 + rand() * 3.5;
      const x = lake.cx + Math.sin(a) * r, z = lake.cz + Math.cos(a) * r;
      if (!free(x, z, 0.5) || rand() < 0.35) continue;
      const f = frame(x, 0, z, rand() * 6), d = D(x, z);
      for (let k = 0; k < 4; k++) d.cyl(f, (rand() - 0.5) * 0.8, 0, (rand() - 0.5) * 0.8, 0.06, 0, 1.2 + rand() * 1.2, 3, '#6f9a3c');
      if (rand() < 0.4) d.cyl(f, 0.2, 1.2, 0, 0.09, 0.09, 0.5, 5, '#7a4e25'); // a bulrush head
    }
    for (let n = 0; n < 60; n++) {
      const a = rand() * Math.PI * 2, slot = Math.floor((a / (Math.PI * 2)) * lake.N) % lake.N, r = lake.radius[slot] - 2 - rand() * 10;
      if (r < 5) continue;
      const x = lake.cx + Math.sin(a) * r, z = lake.cz + Math.cos(a) * r;
      D(x, z).cyl(frame(x, 0.07, z, rand() * 6), 0, 0, 0, 0.8 + rand() * 0.5, 0.8, 0.04, 8, '#4f9a3a', { capCol: '#5fae48' });
    }
  }
}

function tuft(b, f, col, s) {
  for (let k = 0; k < 3; k++) {
    const a = k * 2.1 + 0.3;
    b.cyl(f, Math.sin(a) * 0.14 * s, 0, Math.cos(a) * 0.14 * s, 0.12 * s, 0, (0.32 + k * 0.08) * s, 3, col, { twist: k * 0.3 });
  }
}
function flower(b, f, col) {
  b.cyl(f, 0, 0, 0, 0.14, 0, 0.3, 3, '#4f9e3d');
  b.ball(f, 0, 0.38, 0, 0.13, 0.08, 0.13, col, 5, 2);
  b.ball(f, 0, 0.42, 0, 0.05, 0.04, 0.05, '#ffd23f', 4, 2);
}
