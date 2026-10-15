// Trackside dressing that makes each track feel like a real race day: a big start gantry with lights,
// grandstands full of bouncing fans, flags, made-up sponsor boards, tyre walls and arrow boards on the
// bends, marshal huts, and a ring of far-off scenery on the horizon. Each track adds its own extras
// (see `dress` in data.js). Nearly everything is merged into a few big flat-shaded meshes that share one
// texture atlas (grouped by map area so chunks out of view are skipped), and the fans, flags and tyre
// stacks are thin instances, so the whole lot costs only a handful of draw calls.
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import '@babylonjs/core/Meshes/thinInstanceMesh';
import { pbr as mat } from './env.js';
import { WALL_MARGIN } from './physics.js';
import { wrapAngle } from './trackmath.js';

const SAFE = WALL_MARGIN + 1.8; // past the road edge: further than any part of a car can reach
const CHUNK = 220; // meters: size of the map squares the merged meshes are split into

// ---------- texture atlas: every sign, banner and board, drawn once onto one canvas ----------
const AW = 2048, AH = 1024;
const R = { // regions, in canvas pixels [x, y, w, h]
  white: [4, 4, 56, 56],
  banner: [0, 64, 2048, 192],
  chevron: [0, 512, 256, 128],
  checker: [256, 512, 128, 128],
  hazard: [384, 512, 256, 64],
  garage: [640, 512, 128, 128],
  windows: [768, 512, 128, 128],
  wood: [896, 512, 128, 128],
  blimp: [0, 896, 1024, 128],
};
const SPONSORS = [
  ['ZOOMY JUICE', '#ff8c1a', '#ffffff'], ['TURBO TOAST', '#e63946', '#ffd23f'], ['BANANA FUEL', '#ffd23f', '#1f2a4f'],
  ['ROCKET SOCKS', '#2f6fed', '#ffffff'], ['CHEESY WHEELS', '#ffffff', '#e63946'], ['DINO DONUTS', '#ff5fa2', '#ffffff'],
  ['EZRA GP', '#1f2a4f', '#ffd23f'], ['SUPER SNACKS', '#2fbf71', '#ffffff'],
];
SPONSORS.forEach((_, k) => { R['ad' + k] = [(k % 4) * 512, 256 + Math.floor(k / 4) * 128, 512, 128]; });
const SIGNS = ['PIT LANE', 'SITE OFFICE', 'WOODS LODGE', 'DINO PARK', 'SNACKS', 'ICE CREAM', 'TICKETS', 'GO GO GO!'];
SIGNS.forEach((_, k) => { R['sign' + k] = [(k % 4) * 512, 640 + Math.floor(k / 4) * 128, 512, 128]; });

function drawAtlas(scene, title) {
  const tex = new DynamicTexture('venueAtlas', { width: AW, height: AH }, scene, true);
  const g = tex.getContext();
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, AW, AH);
  const text = (s, x, y, size, color, max, font = 'system-ui, sans-serif', style = 'bold') => {
    g.fillStyle = color;
    g.font = `${style} ${size}px ${font}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(s, x, y, max);
  };
  const checks = (x, y, w, h, n) => {
    const sz = h / n;
    for (let i = 0; i * sz < w; i++) for (let j = 0; j < n; j++) {
      g.fillStyle = (i + j) % 2 ? '#111111' : '#ffffff';
      g.fillRect(x + i * sz, y + j * sz, Math.min(sz, w - i * sz), sz);
    }
  };
  // start / finish banner: chequered ends, the track name in the middle
  {
    const [x, y, w, h] = R.banner;
    g.fillStyle = '#1f2a4f';
    g.fillRect(x, y, w, h);
    checks(x, y, 260, h, 4);
    checks(x + w - 260, y, 260, h, 4);
    g.fillStyle = '#ffd23f';
    g.fillRect(x + 260, y + 10, w - 520, 12);
    g.fillRect(x + 260, y + h - 22, w - 520, 12);
    text('START ★ FINISH', x + w / 2, y + 78, 92, '#ffd23f', w - 600);
    text(title.toUpperCase(), x + w / 2, y + 146, 44, '#ffffff', w - 600);
  }
  // sponsor boards (all made up)
  SPONSORS.forEach(([name, bg, fg], k) => {
    const [x, y, w, h] = R['ad' + k];
    g.fillStyle = bg;
    g.fillRect(x + 2, y + 2, w - 4, h - 4);
    g.fillStyle = fg;
    g.beginPath();
    g.arc(x + 64, y + h / 2, 38, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = bg;
    g.font = 'bold 50px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('★', x + 64, y + h / 2 + 2);
    text(name, x + 290, y + h / 2 + 2, 62, fg, 380, 'system-ui, sans-serif', 'italic 900');
  });
  // big signs for buildings and stalls
  SIGNS.forEach((s, k) => {
    const [x, y, w, h] = R['sign' + k];
    g.fillStyle = ['#1f2a4f', '#f2b705', '#6e4b2e', '#2f7d3a', '#e63946', '#ff5fa2', '#2f6fed', '#2fbf71'][k];
    g.fillRect(x + 2, y + 2, w - 4, h - 4);
    g.strokeStyle = '#ffffff';
    g.lineWidth = 8;
    g.strokeRect(x + 12, y + 12, w - 24, h - 24);
    text(s, x + w / 2, y + h / 2 + 3, 70, k === 1 ? '#1b1b1b' : '#ffffff', w - 50);
  });
  // corner arrows: white chevrons on red, pointing right (flipped for left-hand bends)
  {
    const [x, y, w, h] = R.chevron;
    g.fillStyle = '#e63946';
    g.fillRect(x, y, w, h);
    g.fillStyle = '#ffffff';
    for (const cx of [x + 40, x + 115, x + 190]) {
      g.beginPath();
      g.moveTo(cx - 22, y + 14); g.lineTo(cx + 2, y + 14); g.lineTo(cx + 40, y + h / 2);
      g.lineTo(cx + 2, y + h - 14); g.lineTo(cx - 22, y + h - 14); g.lineTo(cx + 16, y + h / 2);
      g.fill();
    }
  }
  checks(...R.checker.slice(0, 3), 4);
  {
    const [x, y, w, h] = R.hazard;
    g.fillStyle = '#f2b705';
    g.fillRect(x, y, w, h);
    g.fillStyle = '#1b1b1b';
    for (let k = -64; k < w + 64; k += 64) { g.beginPath(); g.moveTo(x + k, y + h); g.lineTo(x + k + 32, y + h); g.lineTo(x + k + 64, y); g.lineTo(x + k + 32, y); g.fill(); }
    g.clearRect(x + w, y, 64, h); // keep the stripes inside their box
    g.fillStyle = '#ffffff';
    g.fillRect(x + w, y, 64, h);
  }
  {
    const [x, y, w, h] = R.garage; // roller shutter
    for (let k = 0; k < 16; k++) { g.fillStyle = k % 2 ? '#d8dbe0' : '#ffffff'; g.fillRect(x, y + k * 8, w, 8); }
  }
  {
    const [x, y, w, h] = R.windows; // a wall with two rows of windows (tinted by the building colour)
    g.fillStyle = '#ffffff';
    g.fillRect(x, y, w, h);
    g.fillStyle = '#5f7fa8';
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) g.fillRect(x + 16 + i * 60, y + 16 + j * 60, 36, 40);
  }
  {
    const [x, y, w, h] = R.wood; // planks
    for (let k = 0; k < 8; k++) { g.fillStyle = k % 2 ? '#c99a62' : '#b8854f'; g.fillRect(x, y + k * 16, w, 16); }
  }
  {
    const [x, y, w, h] = R.blimp;
    g.fillStyle = '#1f2a4f';
    g.fillRect(x, y, w, h);
    text("EZRA'S GRAND PRIX", x + w / 2, y + h / 2 + 4, 84, '#ffd23f', w - 40, 'system-ui, sans-serif', 'italic 900');
  }
  tex.update();
  tex.wrapU = tex.wrapV = 0; // clamp
  return tex;
}
const uvOf = (name, flip = false) => {
  const [x, y, w, h] = R[name], p = 3; // pull in a little, so mipmaps don't bleed in from the neighbours
  const u0 = (x + p) / AW, u1 = (x + w - p) / AW, v0 = 1 - (y + h - p) / AH, v1 = 1 - (y + p) / AH;
  return flip ? [u1, v0, u0, v1] : [u0, v0, u1, v1];
};
const WHITE = uvOf('white');

// ---------- geometry: a pile of flat-shaded triangles that becomes one mesh ----------
const colorCache = {};
const lin = (c) => (typeof c === 'string' ? (colorCache[c] ??= Color3.FromHexString(c).toLinearSpace()) : c);

// A frame turns local coordinates (x right, y up, z forward) into world ones; yaw 0 faces +z.
export function frame(x, y, z, yaw = 0) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return { x, y, z, yaw, at: (lx, ly, lz) => [x + lx * c + lz * s, y + ly, z - lx * s + lz * c], sub: (lx, ly, lz, turn = 0) => frame(x + lx * c + lz * s, y + ly, z - lx * s + lz * c, yaw + turn) };
}

class Batch {
  constructor() { this.P = []; this.C = []; this.U = []; }
  // one triangle; `inside` is a point behind it, so it can be wound to face outwards
  tri(a, b, c, col, uv, inside) {
    const k = lin(col);
    if (inside) {
      const n = cross(sub(a, b), sub(c, b)), m = [(a[0] + b[0] + c[0]) / 3 - inside[0], (a[1] + b[1] + c[1]) / 3 - inside[1], (a[2] + b[2] + c[2]) / 3 - inside[2]];
      if (n[0] * m[0] + n[1] * m[1] + n[2] * m[2] < 0) { [b, c] = [c, b]; if (uv) uv = [uv[0], uv[1], uv[4], uv[5], uv[2], uv[3]]; }
    }
    this.P.push(...a, ...b, ...c);
    for (let i = 0; i < 3; i++) this.C.push(k.r, k.g, k.b, 1);
    this.U.push(...(uv ?? [WHITE[0], WHITE[1], WHITE[0], WHITE[1], WHITE[0], WHITE[1]]));
  }
  // a four-sided face, corners going round; uv: [u0, v0, u1, v1] laid a=bottom-left .. d=top-left
  quad(a, b, c, d, col, uv = WHITE, inside) {
    const [u0, v0, u1, v1] = uv;
    this.tri(a, b, c, col, [u0, v0, u1, v0, u1, v1], inside);
    this.tri(a, c, d, col, [u0, v0, u1, v1, u0, v1], inside);
  }
  // a box centred at (cx, cy, cz) in frame f. o: { pitch, roll, front: uv for the -z face, back: uv for the +z face, top }
  box(f, cx, cy, cz, w, h, d, col, o = {}) {
    const { pitch = 0, roll = 0 } = o, cp = Math.cos(pitch), sp = Math.sin(pitch), cr = Math.cos(roll), sr = Math.sin(roll);
    const P = (x, y, z) => {
      let X = x * cr - y * sr, Y = x * sr + y * cr, Z = z; // roll round z
      [Y, Z] = [Y * cp - Z * sp, Y * sp + Z * cp]; // then pitch round x
      return f.at(cx + X, cy + Y, cz + Z);
    };
    const x = w / 2, y = h / 2, z = d / 2, mid = f.at(cx, cy, cz);
    const v = [P(-x, -y, -z), P(x, -y, -z), P(x, y, -z), P(-x, y, -z), P(-x, -y, z), P(x, -y, z), P(x, y, z), P(-x, y, z)];
    const c2 = o.side ?? col;
    this.quad(v[0], v[1], v[2], v[3], o.frontCol ?? col, o.front ?? WHITE, mid); // -z: the front, as seen from in front
    this.quad(v[5], v[4], v[7], v[6], col, o.back ?? WHITE, mid); // +z
    this.quad(v[3], v[2], v[6], v[7], o.topCol ?? col, o.top ?? WHITE, mid); // top
    if (!o.noBottom) this.quad(v[4], v[5], v[1], v[0], c2, WHITE, mid);
    this.quad(v[1], v[5], v[6], v[2], c2, WHITE, mid); // +x
    this.quad(v[4], v[0], v[3], v[7], c2, WHITE, mid); // -x
  }
  // a cylinder (or cone, or frustum) standing on (cx, cy, cz); lie: true lays it along local x
  cyl(f, cx, cy, cz, r0, r1, h, seg, col, o = {}) {
    const at = o.lie ? (a, r, y) => f.at(cx + y, cy + Math.sin(a) * r, cz + Math.cos(a) * r) : (a, r, y) => f.at(cx + Math.sin(a) * r, cy + y, cz + Math.cos(a) * r);
    const mid = o.lie ? f.at(cx + h / 2, cy, cz) : f.at(cx, cy + h / 2, cz), top = at(0, 0, h), bottom = at(0, 0, 0);
    for (let i = 0; i < seg; i++) {
      const a = ((i + (o.twist ?? 0)) / seg) * Math.PI * 2, b = ((i + 1 + (o.twist ?? 0)) / seg) * Math.PI * 2;
      if (r1 > 0) this.quad(at(a, r0, 0), at(b, r0, 0), at(b, r1, h), at(a, r1, h), o.sideCol ?? col, WHITE, mid);
      else this.tri(at(a, r0, 0), at(b, r0, 0), top, o.sideCol ?? col, null, mid);
      if (r1 > 0 && o.cap !== false) this.tri(at(a, r1, h), at(b, r1, h), top, o.capCol ?? col, null, mid);
      if (o.base) this.tri(at(a, r0, 0), at(b, r0, 0), bottom, col, null, mid);
    }
  }
  // a lumpy low-poly ball
  ball(f, cx, cy, cz, rx, ry, rz, col, seg = 6, rings = 4, o = {}) {
    const mid = f.at(cx, cy, cz);
    const pt = (i, j) => {
      const a = (i / seg) * Math.PI * 2, b = (j / rings) * Math.PI - Math.PI / 2;
      return f.at(cx + Math.cos(b) * Math.sin(a) * rx, cy + Math.sin(b) * ry, cz + Math.cos(b) * Math.cos(a) * rz);
    };
    for (let j = 0; j < rings; j++) for (let i = 0; i < seg; i++) {
      const c = o.band && j < o.band[0] ? o.band[1] : col;
      if (j > 0) this.tri(pt(i, j), pt(i + 1, j), pt(i + 1, j + 1), c, null, mid);
      if (j < rings - 1) this.tri(pt(i, j), pt(i + 1, j + 1), pt(i, j + 1), c, null, mid);
    }
  }
  // a flat patch lying on the ground (or anything flat facing up): corners going round
  flat(a, b, c, d, col, uv) { this.quad(a, b, c, d, col, uv, [a[0], a[1] - 1, a[2]]); }
  build(scene, name, material) {
    if (!this.P.length) return null;
    const m = new Mesh(name, scene), vd = new VertexData();
    vd.positions = this.P;
    vd.colors = this.C;
    vd.uvs = this.U;
    vd.indices = Array.from({ length: this.P.length / 3 }, (_, i) => i);
    vd.normals = [];
    VertexData.ComputeNormals(vd.positions, vd.indices, vd.normals);
    vd.applyToMesh(m);
    m.material = material;
    m.isPickable = false;
    return m;
  }
}
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

// A thin-instanced shape: add() copies, then build(). Each copy can have its own colour.
function instances(scene, name, batch, material) {
  const list = [];
  return {
    list,
    add(x, y, z, yaw, s = 1, col = '#ffffff') { list.push([x, y, z, yaw, s, lin(col)]); },
    build(parent) {
      if (!list.length) return null;
      const m = batch.build(scene, name, material);
      const mats = new Float32Array(list.length * 16), cols = new Float32Array(list.length * 4);
      list.forEach(([x, y, z, yaw, s, c], i) => {
        writeMatrix(mats, i, x, y, z, yaw, s);
        cols.set([c.r, c.g, c.b, 1], i * 4);
      });
      m.thinInstanceSetBuffer('matrix', mats, 16, !parent?.dynamic);
      if (!parent?.plain) m.thinInstanceSetBuffer('color', cols, 4, true); // (plain: no colour per copy)
      if (parent?.node) m.parent = parent.node;
      m.thinInstanceRefreshBoundingInfo(false);
      if (!parent?.dynamic && !parent?.node) m.freezeWorldMatrix();
      m.alwaysSelectAsActiveMesh = !!parent?.dynamic;
      return { mesh: m, mats };
    },
  };
}
function writeMatrix(m, i, x, y, z, yaw, s) {
  const c = Math.cos(yaw) * s, n = Math.sin(yaw) * s, o = i * 16;
  m[o] = c; m[o + 1] = 0; m[o + 2] = -n; m[o + 3] = 0;
  m[o + 4] = 0; m[o + 5] = s; m[o + 6] = 0; m[o + 7] = 0;
  m[o + 8] = n; m[o + 9] = 0; m[o + 10] = c; m[o + 11] = 0;
  m[o + 12] = x; m[o + 13] = y; m[o + 14] = z; m[o + 15] = 1;
}

function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pickOf = (rand, list) => list[Math.floor(rand() * list.length)];

const SHIRTS = ['#e63946', '#2f6fed', '#ffd23f', '#2fbf71', '#ff8c1a', '#8e44ec', '#ff5fa2', '#ffffff', '#00a6c7', '#1f2a4f'];
const SKINS = ['#f1c7a5', '#d9a07a', '#a86b45', '#7a4a2c', '#f6d2b8', '#c68a5e'];
const FLAG_COLORS = ['#e63946', '#ffd23f', '#2f6fed', '#2fbf71', '#ff8c1a', '#ffffff', '#8e44ec', '#ff5fa2'];

// Looks for each kind of track: stand colours, what the tyre walls and arrow boards are made of, and so on.
const STYLES = {
  speedway: { seats: ['#e63946', '#ffffff', '#2f6fed', '#ffd23f'], frame: '#1f2a4f', roof: ['#ffd23f', '#1f2a4f'], tower: '#1f2a4f', gravel: '#a8926c' },
  woods: { seats: ['#a8743f', '#8b5a2b', '#c48d55'], frame: '#5a3b22', roof: ['#2f6b43', '#3e8a55'], tower: '#5a3b22', gravel: '#8f7a55' },
  site: { seats: ['#9aa3ad', '#f2b705', '#9aa3ad'], frame: '#59616b', roof: ['#f2b705', '#2b2f38'], tower: '#2b2f38', gravel: '#6e6a62', barriers: true },
  jungle: { seats: ['#c99a5b', '#a37a43', '#2fbf71', '#ff8c1a'], frame: '#6b4a2a', roof: ['#3f8f3a', '#e0b84f'], tower: '#5b4128', gravel: '#9c8a66' },
  trip: { seats: ['#2f6fed', '#ffffff', '#e63946'], frame: '#1f2a4f', roof: ['#ffffff', '#2f6fed'], tower: '#1f2a4f', gravel: null },
};

// Builds it all. ctx: { roadGap(x, z), built (list of [x, z, r] that plants keep clear of), blocked(x, z, r),
// props (the propSet from world.js), landAt }. Returns { update(raceTime) } for the moving bits.
export function buildVenue(scene, track, def, shadows, ctx) {
  const { samples, count } = track;
  const hw = def.width / 2;
  const dress = def.dress ?? {};
  const style = STYLES[dress.style ?? 'speedway'];
  const rand = rng(def.name.length * 97 + 5);
  const atlas = drawAtlas(scene, def.name);
  const material = mat(scene, 'venue', '#ffffff', 0.75);
  material.albedoTexture = atlas;
  const chunks = new Map();
  // far: the horizon scenery, kept in its own chunks that cast no shadows
  const B = (x, z, far = false) => { const key = `${far ? 'far' : ''}${Math.floor(x / CHUNK)},${Math.floor(z / CHUNK)}`; if (!chunks.has(key)) chunks.set(key, new Batch()); return chunks.get(key); };
  const ground = new Batch(); // flat paint and gravel: never casts shadows
  const updates = [];
  let placedAds = 0;
  const landmarks = []; // sample indices of the big set pieces (handy for screenshots)
  const xz = (p) => [p[0], p[2]];

  // ---- where things may go ----
  const avoid = []; // sample indices to keep clear of (jumps, things crossing the road, trees in the road)
  for (const j of track.jumps ?? []) avoid.push([j.idx, 40]);
  for (const o of track.obstacles ?? []) avoid.push([o.idx, o.cross ? 10 : 6]);
  const near = (i, j, far) => Math.abs(((i - j + count * 1.5) % count) - count / 2) < far;
  const avoided = (i) => avoid.some(([j, far]) => near(i, j, far));
  // is the spot (x, z) at least `gap` meters clear of every bit of road, the water and other buildings?
  const free = (x, z, r, gap = SAFE) => ctx.roadGap(x, z) > gap + r && !ctx.blocked(x, z, r);
  // check a rectangle in frame f (x from x0 to x1, z from z0 to z1) is free, then claim it
  const claimRect = (f, x0, x1, z0, z1, gap = SAFE) => {
    const pts = [];
    for (let x = x0; x <= x1 + 0.01; x += Math.max(1, (x1 - x0) / Math.ceil((x1 - x0) / 4))) for (let z = z0; z <= z1 + 0.01; z += Math.max(1, (z1 - z0) / Math.ceil((z1 - z0) / 4))) pts.push(f.at(x, 0, z));
    if (!pts.every(([x, , z]) => free(x, z, 0, gap))) return false;
    const r = Math.max(x1 - x0, z1 - z0) / 2;
    for (const [x, , z] of pts) ctx.built.push([x, z, Math.min(4, r)]);
    const [cx, , cz] = f.at((x0 + x1) / 2, 0, (z0 + z1) / 2);
    ctx.built.push([cx, cz, r * 0.9]);
    return true;
  };
  // a frame standing beside sample i, `off` meters out on `side` (+1 right, -1 left), facing back at the road
  const beside = (i, side, off, along = 0) => {
    const s = samples[(i + count) % count];
    const x = s.x + s.rx * side * off + s.tx * along, z = s.z + s.rz * side * off + s.tz * along;
    return frame(x, 0, z, Math.atan2(side * s.rx, side * s.rz)); // local +z points away from the road
  };
  const turnAt = (i) => wrapAngle(samples[(i + 15) % count].heading - samples[i].heading); // + bends right

  // ---- fans: thin instances in three groups that hop at different times ----
  const groups = [0, 1, 2].map((k) => {
    const node = new TransformNode('fans' + k, scene);
    return { node, body: instances(scene, 'fanBody', personBody(), material), head: instances(scene, 'fanHead', personHead(), material), phase: k * 2.1 };
  });
  const fan = (x, y, z, yaw, shirt, s = 1) => {
    const g = groups[Math.floor(rand() * 3)];
    g.body.add(x, y, z, yaw, s, shirt ?? pickOf(rand, SHIRTS));
    g.head.add(x, y, z, yaw, s, pickOf(rand, SKINS));
  };
  // a block of standing fans: rows x cols, in frame f, facing local -z. With steps, each row stands on a
  // wooden riser a little higher than the one in front, so everyone can see.
  const crowd = (f, cols, rows, spacing = 0.95, fill = 0.8, steps = false) => {
    for (let r = 0; r < rows; r++) {
      const up = steps ? r * 0.45 : 0;
      if (steps && r) B(f.x, f.z).box(f, 0, up / 2, r * spacing, cols * spacing + 0.4, up, spacing, '#c99a62', { side: '#8b5a2b' });
      for (let c = 0; c < cols; c++) {
        if (rand() > fill) continue;
        const [x, , z] = f.at((c - (cols - 1) / 2) * spacing + (rand() - 0.5) * 0.3, 0, r * spacing + (rand() - 0.5) * 0.25);
        fan(x, up, z, f.yaw + Math.PI + (rand() - 0.5) * 0.6, null, 1.15 + rand() * 0.2);
      }
    }
  };

  // ---- flags on poles, fluttering ----
  const flags = [], FLAG_WIND = 2.2; // all point the same way, downwind
  const plainFlags = instances(scene, 'flag', flagShape(false), null), checkFlags = instances(scene, 'flagCheck', flagShape(true), null);
  const flag = (b, x, y, z, tall, col, checked = false) => {
    b.cyl(frame(x, y, z), 0, 0, 0, 0.07, 0.06, tall, 5, '#d9dde3');
    (checked ? checkFlags : plainFlags).add(x, y + tall - 1.0, z, FLAG_WIND, 1.2, col ?? pickOf(rand, FLAG_COLORS));
    flags.push(0);
  };

  // ---- tyre stacks, thin instances ----
  const tyres = instances(scene, 'tyres', tyreStack(), material);
  const TYRE_COLS = ['#2b2b2e', '#2b2b2e', '#e63946', '#ffffff', '#2b2b2e', '#2f6fed', '#ffd23f'];

  // ---- sponsor hoarding: a long low board on legs, facing back at the road ----
  const hoarding = (f, k, w = 6) => {
    const b = B(f.x, f.z);
    b.box(f, 0, 1.35, 0, w, 1.3, 0.18, '#ffffff', { front: uvOf('ad' + (k % SPONSORS.length)), side: '#c8ccd2' });
    for (const x of [-w / 2 + 0.4, w / 2 - 0.4]) b.box(f, x, 0.35, 0.12, 0.14, 0.7, 0.14, '#7d838c');
  };

  // ================= START / FINISH =================
  const s0 = samples[0];
  {
    const span = hw + SAFE + 0.6, f = frame(s0.x, 0, s0.z, s0.heading); // local x across the road, z along it
    const b = B(s0.x, s0.z), TOP = 7.2, TALL = 3.0;
    for (const side of [-1, 1]) {
      const x = side * span;
      // lattice tower: four corner posts with rungs
      for (const [dx, dz] of [[-0.55, -0.55], [0.55, -0.55], [0.55, 0.55], [-0.55, 0.55]]) b.box(f, x + dx, (TOP + TALL) / 2, dz, 0.22, TOP + TALL, 0.22, style.tower);
      for (let y = 0.8; y < TOP + TALL; y += 1.3) b.box(f, x, y, 0, 1.3, 0.14, 1.3, y % 2.6 < 1.3 ? '#ffd23f' : style.tower);
      b.box(f, x, 0.15, 0, 2.2, 0.3, 2.2, '#9aa0a8'); // foot
      flag(b, ...f.at(x, TOP + TALL, 0), 3.2, '#ffffff', true);
      ctx.built.push([...xz(f.at(x, 0, 0)), 3]);
    }
    // the banner: chequered beam with the name, readable from both sides
    b.box(f, 0, TOP + TALL / 2, 0, span * 2 + 1.4, TALL, 0.6, '#ffffff', { front: uvOf('banner'), back: uvOf('banner'), side: '#1f2a4f', topCol: '#1f2a4f' });
    b.box(f, 0, TOP + TALL + 0.15, 0, span * 2 + 1.6, 0.3, 0.9, '#ffd23f');
    b.box(f, 0, TOP - 0.15, 0, span * 2 + 1.6, 0.3, 0.9, '#ffd23f');
    // the start lights: a dark pod under the banner with five lamps looking back down the grid
    b.box(f, 0, TOP - 1.0, -0.1, 6.4, 1.3, 0.7, '#15171c');
    for (let k = 0; k < 5; k++) b.cyl(f, (k - 2) * 1.2, TOP - 1.0, -0.45, 0.42, 0.42, 0.05, 10, '#2a2d33', { lie: false, cap: true });
    const lampShape = new Batch();
    lampShape.ball(frame(0, 0, 0), 0, 0, 0, 0.42, 0.42, 0.16, '#ffffff', 10, 5);
    const lamp = (hex) => {
      const m = new StandardMaterial('startLamp', scene);
      m.disableLighting = true;
      m.emissiveColor = Color3.FromHexString(hex);
      m.fogEnabled = false;
      const inst = instances(scene, 'startLamp', lampShape, m);
      for (let k = 0; k < 5; k++) inst.add(...f.at((k - 2) * 1.2, TOP - 1.0, -0.5), s0.heading);
      return inst.build({ plain: true }).mesh;
    };
    const reds = lamp('#ff2a2a'), greens = lamp('#3dff6a');
    reds.thinInstanceCount = 0;
    greens.thinInstanceCount = 0;
    updates.push((t) => {
      // the reds come on one by one through the countdown, then they all go green
      reds.thinInstanceCount = t < 0 ? Math.max(0, Math.min(5, Math.ceil((t + 3) / 0.6))) : 0;
      greens.thinInstanceCount = t >= 0 && t < 30 ? 5 : 0;
    });
  }
  // grid boxes painted on the road where the cars line up
  for (const [back, lat] of [[4, -3.5], [4, 3.5], [9, -3.5], [9, 3.5]]) {
    const s = samples[count - back], f = frame(s.x + s.rx * lat, 0.034, s.z + s.rz * lat, s.heading);
    const bar = (x0, z0, x1, z1) => ground.flat(f.at(x0, 0, z0), f.at(x1, 0, z0), f.at(x1, 0, z1), f.at(x0, 0, z1), '#f2f2f2');
    bar(-1.5, 2.6, 1.5, 2.9);
    bar(-1.5, 1.2, -1.25, 2.9);
    bar(1.25, 1.2, 1.5, 2.9);
  }

  // ================= GRANDSTANDS by the start =================
  const stands = dress.stands ?? 2;
  const placed = [];
  const tries = [];
  // stands go on the outside of the loop first (the side away from the middle), then the inside
  const outside = -Math.sign(samples.reduce((t, _, i) => t + turnAt(i), 0)) || -1;
  for (const side of [outside, -outside]) for (const along of [0, 16, -18, 34, -36, 52, -54, 70, -72]) tries.push([along, side]);
  for (const [along, side] of tries) {
    if (placed.length >= stands) break;
    const i = (Math.round(along / 2) + count) % count;
    if (avoided(i)) continue;
    const f = beside(i, side, hw + SAFE + 1.2);
    if (placed.some(([pi, ps]) => ps === side && Math.abs(pi - along) < 28)) continue;
    if (!claimRect(f, -15, 15, 0, 10.5)) continue;
    grandstand(f);
    placed.push([along, side]);
  }
  function grandstand(f) {
    const b = B(f.x, f.z), W = 28, TIERS = 6, STEP = 1.15, RISE = 0.72, base = 1.1;
    // catch fence along the front
    for (let x = -W / 2; x <= W / 2 + 0.01; x += 3.5) b.box(f, x, 1.6, -0.6, 0.12, 3.2, 0.12, '#c8ccd2');
    for (const y of [1.0, 2.0, 3.1]) b.box(f, 0, y, -0.6, W, 0.06, 0.06, '#c8ccd2');
    // front wall with sponsor panels
    for (let k = 0; k < 4; k++) b.box(f, -W / 2 + 3.5 + k * 7, base / 2, 0.2, 7, base, 0.4, '#ffffff', { front: uvOf('ad' + ((k + placedAds++) % SPONSORS.length)) });
    for (let k = 0; k < TIERS; k++) {
      const z0 = 0.4 + k * STEP, top = base + k * RISE;
      b.box(f, 0, top / 2, z0 + STEP / 2, W, top, STEP, style.seats[k % style.seats.length], { noBottom: true, side: style.frame });
      // fans on the step, a few seats left empty
      for (let x = -W / 2 + 0.6; x < W / 2 - 0.4; x += 0.78) if (rand() < 0.86) fan(...f.at(x + (rand() - 0.5) * 0.15, top, z0 + STEP * 0.55), f.yaw + Math.PI + (rand() - 0.5) * 0.5, null, 1.05);
    }
    const back = 0.4 + TIERS * STEP, roofY = base + TIERS * RISE + 3.6;
    b.box(f, 0, roofY / 2, back + 0.2, W + 0.6, roofY, 0.4, style.frame); // back wall
    for (const side of [-1, 1]) b.box(f, side * (W / 2 + 0.2), (base + TIERS * RISE) / 2, back / 2 + 0.2, 0.4, base + TIERS * RISE, back, style.frame);
    for (let x = -W / 2; x <= W / 2 + 0.01; x += W / 4) {
      b.box(f, x, roofY / 2, back + 0.2, 0.5, roofY, 0.5, style.frame);
      b.box(f, x, roofY - 1.0, back - 2.4, 0.3, 0.3, 5.2, style.frame, { pitch: -0.35 }); // strut holding up the roof
    }
    // striped roof, tipped up at the front
    const stripes = 8;
    for (let k = 0; k < stripes; k++) b.box(f, -W / 2 - 0.5 + (k + 0.5) * ((W + 1) / stripes), roofY + 0.3, back / 2 - 0.3, (W + 1) / stripes, 0.35, back + 2.2, style.roof[k % 2], { pitch: 0.08 });
    for (let k = 0; k < 5; k++) { const [x, y, z] = f.at(-W / 2 + 1 + k * ((W - 2) / 4), roofY + 0.5, back - 0.3); flag(b, x, y, z, 3.6); }
  }

  // ================= around the lap: bends, boards, marshals =================
  // bends: runs of samples turning harder than BEND, with the outside of the bend on `side`
  const BEND = dress.bend ?? 0.58, bends = [];
  {
    let start = -1;
    const sharp = samples.map((s) => s.curve > BEND);
    const first = sharp.indexOf(false); // start scanning from a straight bit, so no run wraps round the start
    if (first >= 0) for (let n = 0; n <= count; n++) {
      const i = (first + n) % count;
      if (sharp[i] && start < 0) start = n;
      if ((!sharp[i] || n === count) && start >= 0) {
        const a = first + start, len = n - start;
        if (len >= 6) bends.push({ a, len, side: -Math.sign(turnAt((a + Math.floor(len / 2)) % count)) || 1 });
        start = -1;
      }
    }
  }
  const tyreLine = (i, side, off, along) => {
    const s = samples[i % count], x = s.x + s.rx * side * off + s.tx * along, z = s.z + s.rz * side * off + s.tz * along;
    if (!free(x, z, 0.5)) return false;
    tyres.add(x, 0, z, rand() * 6.28, 1, TYRE_COLS[Math.floor(i / 2) % TYRE_COLS.length]);
    return true;
  };
  bends.forEach((bend, k) => {
    const { a, len, side } = bend;
    // apex region: the curve number looks ahead ~30 m, so the actual bend sits a little later than the run
    for (let n = 6; n < len + 10; n++) {
      const i = (a + n) % count;
      if (avoided(i)) continue;
      if (style.barriers) { if (n % 2 === 0) { const f = beside(i, side, hw + SAFE + 0.3); if (free(f.x, f.z, 0.4)) ctx.props.add('construction-barrier', f.x, f.z, samples[i].heading, 1.15); } }
      else { tyreLine(i, side, hw + SAFE + 0.45, 0); tyreLine(i, side, hw + SAFE + 0.45, 1); }
      // arrow boards behind the tyres, every 12 m, turned to face cars coming into the bend
      if (n % 6 === 0 && n < len + 4) {
        const s = samples[i], off = hw + SAFE + 2.2, x = s.x + s.rx * side * off, z = s.z + s.rz * side * off;
        const back = samples[(i - 12 + count) % count];
        if (!free(x, z, 0.8)) continue;
        const f = frame(x, 0, z, Math.atan2(x - back.x, z - back.z));
        const b = B(x, z);
        b.box(f, 0, 1.75, 0, 3.2, 1.6, 0.14, '#ffffff', { front: uvOf('chevron', side > 0), side: '#e63946' });
        for (const lx of [-1.1, 1.1]) b.box(f, lx, 0.5, 0.12, 0.14, 1.0, 0.14, '#7d838c');
        ctx.built.push([x, z, 2]);
      }
    }
    // a few sponsor boards and a bank of fans on the outside of every other bend, where there is room
    if (k % 2 === 0) {
      const i = (a + Math.floor(len / 2) + 6) % count;
      const f = beside(i, side, hw + SAFE + 4.5);
      if (!avoided(i) && claimRect(f, -9, 9, -0.5, 5)) {
        hoarding(f.sub(-6, 0, 0), k);
        hoarding(f.sub(0, 0, 0), k + 3);
        hoarding(f.sub(6, 0, 0), k + 5);
        crowd(f.sub(0, 0, 1.5), 18, 4, 0.95, 0.8, true);
        flag(B(f.x, f.z), ...f.at(-9.5, 0, 1), 5, null);
        flag(B(f.x, f.z), ...f.at(9.5, 0, 1), 5, null);
      }
    }
    // gravel trap: a run-off patch on the outside of the bend, flat, so cars can drive over it
    if (style.gravel) {
      const g0 = a + 4, g1 = a + len + 12;
      for (let n = g0; n < g1; n++) {
        const s = samples[n % count], t = samples[(n + 1) % count], inner = hw + 1.25;
        const fade = Math.min(1, (n - g0) / 6, (g1 - n) / 6), outer = hw + 1.25 + (WALL_MARGIN - 0.8) * fade;
        if (outer - inner < 0.3) continue;
        const p = (q, d) => [q.x + q.rx * side * d, 0.028, q.z + q.rz * side * d];
        ground.flat(p(s, inner), p(t, inner), p(t, outer), p(s, outer), Color3.Lerp(lin(style.gravel), lin('#ffffff'), ((n * 7) % 5) * 0.03));
      }
    }
  });

  // straights: marshal huts and sponsor boards every so often, on whichever side has room
  for (let i = 30, k = 0; i < count - 30; i += 70, k++) {
    if (avoided(i) || samples[i].curve > BEND * 0.6) continue;
    for (const side of k % 2 ? [1, -1] : [-1, 1]) {
      const f = beside(i, side, hw + SAFE + 1);
      if (!claimRect(f, -4, 9, -0.5, 3)) continue;
      const b = B(f.x, f.z);
      // little white hut with an orange roof, and a marshal in orange waving at you
      b.box(f, 0, 1.15, 1.2, 1.8, 2.3, 1.8, '#ffffff', { side: '#e9ecef' });
      b.box(f, 0, 2.45, 1.2, 2.2, 0.3, 2.2, '#ff8c1a');
      b.box(f, 0, 1.4, 0.28, 1.2, 0.7, 0.05, '#5f7fa8'); // window
      fan(...f.at(1.6, 0, 0.6), f.yaw + Math.PI, '#ff8c1a', 1.2);
      flag(b, ...f.at(-1.4, 0, 0.6), 2.8, '#ffd23f');
      hoarding(f.sub(5.5, 0, 0.5), k + 1);
      break;
    }
  }


  // ================= extras for each kind of track =================
  const extras = { pits, blimp, ferris, bridge, cabin, toadstools, logs, woodFence, site, arches, nests };
  for (const [name, fn] of Object.entries(extras)) if (dress[name]) fn(dress[name]);

  // sponsor boards along the start straight, just past the walls
  for (const side of [-1, 1]) for (const along of [-60, -46, 30, 44, 58]) {
    const i = (Math.round(along / 2) + count) % count;
    if (avoided(i)) continue;
    const f = beside(i, side, hw + SAFE + 0.6);
    if (claimRect(f, -3.2, 3.2, -0.3, 0.6)) hoarding(f, Math.abs(along) + (side > 0 ? 1 : 0));
  }

  // A pit building on the far side of the start straight, with garages, a sign and mechanics.
  function pits() {
    const side = placed.length ? -placed[0][1] : 1;
    for (const along of [26, -26, 40, -40, 56, -56]) { // (clear of the gantry legs)
      const i = (Math.round(along / 2) + count) % count, f = beside(i, side, hw + SAFE + 2.5);
      if (!claimRect(f, -22, 22, 0, 10)) continue;
      const b = B(f.x, f.z), W = 42;
      b.box(f, 0, 2.6, 5.5, W, 5.2, 9, '#ffffff', { side: '#e9ecef', top: WHITE, topCol: '#c8ccd2' });
      b.box(f, 0, 5.0, 0.95, W + 0.2, 0.7, 0.1, '#1f2a4f');
      for (let k = 0; k < 7; k++) b.box(f, -W / 2 + 3 + k * 6, 1.7, 0.95, 4.4, 3.4, 0.06, SHIRTS[k], { front: uvOf('garage') });
      b.box(f, 0, 6.7, 3, 10, 2.4, 0.3, '#ffffff', { front: uvOf('sign0'), back: uvOf('sign0') });
      for (const x of [-4, 4]) b.box(f, x, 5.6, 3, 0.25, 1.4, 0.25, '#7d838c');
      for (let k = 0; k < 7; k++) {
        const [x, , z] = f.at(-W / 2 + 3 + k * 6 + 1.5, 0, -0.6);
        fan(x, 0, z, f.yaw + Math.PI, SHIRTS[k], 1.15);
        tyres.add(...f.at(-W / 2 + 1.2 + k * 6, 0, -0.5), 0, 1, '#2b2b2e');
      }
      for (let k = 0; k < 6; k++) flag(b, ...f.at(-W / 2 + 2 + k * 7.6, 5.2, 9), 3, SHIRTS[k]);
      return;
    }
  }

  // An airship drifting slowly round high above the track.
  function blimp() {
    const b = new Batch(), f = frame(0, 0, 0);
    b.ball(f, 0, 0, 0, 5.5, 5.5, 14, '#ffffff', 14, 8);
    for (const [r, p] of [[0, 1], [Math.PI / 2, 1], [Math.PI, 1], [-Math.PI / 2, 1]]) b.box(f, Math.sin(r) * 3.2, Math.cos(r) * 3.2, -12, Math.abs(Math.sin(r)) > 0.5 ? 5 : 0.3, Math.abs(Math.sin(r)) > 0.5 ? 0.3 : 5, 4, '#e63946');
    b.box(f, 0, -5.8, 1, 2.2, 1.4, 5, '#1f2a4f');
    for (const side of [-1, 1]) {
      const g = frame(side * 5.62, 0, 0, -side * Math.PI / 2); // front face looking outwards
      b.box(g, 0, 0.2, 0, 16, 3.2, 0.1, '#ffffff', { front: uvOf('blimp'), side: '#1f2a4f', topCol: '#1f2a4f' });
    }
    const m = b.build(scene, 'blimp', material);
    const cx = track.samples.reduce((t, s) => t + s.x, 0) / count, cz = track.samples.reduce((t, s) => t + s.z, 0) / count;
    updates.push(() => {
      const a = performance.now() / 60000 * Math.PI * 2; // once round a minute
      m.position.set(cx + Math.sin(a) * 160, 62 + Math.sin(a * 3) * 3, cz + Math.cos(a) * 110);
      m.rotation.y = a + Math.PI / 2;
    });
  }

  // A big wheel turning slowly in the infield. at: [x, z].
  function ferris([x, z]) {
    const f = frame(x, 0, z, Math.atan2(s0.x - x, s0.z - z) + Math.PI / 2); // side-on to the start, so you see it turn
    const RAD = 15, HUB = RAD + 3;
    if (!free(x, z, 10, SAFE + 4)) return;
    ctx.built.push([x, z, RAD]);
    const b = B(x, z);
    for (const side of [-1, 1]) for (const lean of [-1, 1]) b.box(f, lean * (HUB / 2) * Math.sin(0.42), HUB / 2, side * 2.2, 0.6, HUB / Math.cos(0.42), 0.6, '#e9ecef', { roll: lean * 0.42 });
    b.box(f, 0, 0.4, 0, 16, 0.8, 7, '#e63946'); // platform
    const node = new TransformNode('wheel', scene);
    node.position.set(...f.at(0, HUB, 0));
    node.rotation.y = f.yaw;
    const w = new Batch(), o = frame(0, 0, 0);
    for (let k = 0; k < 24; k++) { // the rim, as straight pieces
      const a = (k / 24) * Math.PI * 2, piece = 2 * RAD * Math.sin(Math.PI / 24) + 0.2;
      for (const zz of [-1.6, 1.6]) w.box(o, Math.sin(a + Math.PI / 24) * RAD, Math.cos(a + Math.PI / 24) * RAD, zz, piece, 0.45, 0.45, k % 2 ? '#ffd23f' : '#e63946', { roll: -(a + Math.PI / 24) });
    }
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      for (const zz of [-1.6, 1.6]) w.box(o, Math.sin(a) * RAD / 2, Math.cos(a) * RAD / 2, zz, 0.25, RAD, 0.25, '#ffffff', { roll: -a });
    }
    w.cyl(o, -0.1, 0, 0, 1.2, 1.2, 0.2, 10, '#1f2a4f', { lie: true });
    const wheel = w.build(scene, 'wheelRim', material);
    wheel.parent = node;
    const cab = new Batch();
    cab.box(o, 0, -1.6, 0, 2.2, 1.8, 2.2, '#ffffff', { side: '#ffffff' });
    cab.box(o, 0, -0.5, 0, 2.6, 0.3, 2.6, '#ffffff');
    cab.box(o, 0, 0, 0, 0.15, 1, 0.15, '#7d838c');
    const cabs = instances(scene, 'gondola', cab, material);
    for (let k = 0; k < 12; k++) cabs.add(0, 0, 0, f.yaw, 1, SHIRTS[k % SHIRTS.length]);
    const { mesh, mats } = cabs.build({ dynamic: true });
    const [hx, hy, hz] = f.at(0, HUB, 0), c = Math.cos(f.yaw), sn = Math.sin(f.yaw);
    updates.push(() => {
      const spin = performance.now() / 9000;
      node.rotation.z = spin; // local z is the axle (built in the wheel's own frame)
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2 - spin, lx = Math.sin(a) * RAD, ly = Math.cos(a) * RAD;
        writeMatrix(mats, k, hx + lx * c, hy + ly, hz - lx * sn, f.yaw, 1);
      }
      mesh.thinInstanceBufferUpdated('matrix');
    });
  }

  // A wooden footbridge over the road, full of fans. at: how far round the lap (0..1).
  function bridge(at) {
    const span = hw + SAFE + 1.6, DECK = 6.8;
    // from `at`, go on round the lap to the first straight-ish spot with room for the legs and steps
    let i = Math.floor(at * count), f = null;
    for (let n = 0; n < count / 3 && !f; n += 3, i = (i + 3) % count) {
      const q = samples[i], g = frame(q.x, 0, q.z, q.heading); // local x across the road
      if (!avoided(i) && q.curve < 0.5 && [-1, 1].every((side) => free(...xz(g.at(side * span, 0, 0)), 1.2) && free(...xz(g.at(side * (span + 4.5), 0, 0)), 2))) f = g;
    }
    if (!f) return;
    const s = samples[(i - 3 + count) % count];
    landmarks.push((i - 3 + count) % count);
    const b = B(s.x, s.z), wood = '#8b5a2b', dark = '#5a3b22';
    for (const side of [-1, 1]) {
      for (const dz of [-1.4, 1.4]) b.box(f, side * span, DECK / 2, dz, 0.7, DECK + 2.6, 0.7, dark); // log posts
      b.box(f, side * (span + 3.2), DECK / 2 - 0.1, 0, 9, 0.3, 3.0, wood, { roll: side * -0.9 }); // steps down
      ctx.built.push([...xz(f.at(side * (span + 3), 0, 0)), 5]);
    }
    b.box(f, 0, DECK, 0, span * 2 + 1.2, 0.5, 3.4, wood, { top: uvOf('wood') });
    for (const dz of [-1.55, 1.55]) {
      b.box(f, 0, DECK + 1.15, dz, span * 2 + 1.2, 0.16, 0.16, dark);
      for (let x = -span; x <= span; x += 2) b.box(f, x, DECK + 0.6, dz, 0.14, 1.1, 0.14, dark);
    }
    // a sign hanging under it, facing the cars as they come
    b.box(f, 0, DECK - 0.9, -1.2, 8, 1.4, 0.15, '#ffffff', { front: uvOf('sign2'), back: uvOf('sign2') });
    for (let x = -span + 1; x < span - 0.5; x += 0.85) for (const dz of [-0.9, 0.9]) if (rand() < 0.75) fan(...f.at(x, DECK + 0.25, dz), s.heading + (dz < 0 ? Math.PI : 0), null, 1.05);
  }

  // A log cabin near the start.
  function cabin() {
    for (const [i0, side] of [[30, -1], [30, 1], [-35, -1], [-35, 1], [60, 1], [60, -1]]) {
      const i = (i0 + count) % count, f = beside(i, side, hw + SAFE + 5);
      if (!claimRect(f, -6, 6, -1, 9)) continue;
      const b = B(f.x, f.z), log = '#8b5a2b';
      for (let y = 0.25; y < 3.2; y += 0.5) {
        b.cyl(f, -5, y, 0.5, 0.26, 0.26, 10, 6, y % 1 < 0.5 ? log : '#7a4e25', { lie: true });
        b.cyl(f, -5, y + 0.25, 7.5, 0.26, 0.26, 10, 6, log, { lie: true });
        for (const x of [-4.8, 4.8]) b.box(f, x, y + 0.12, 4, 0.5, 0.5, 7.4, log);
      }
      for (const side2 of [-1, 1]) b.box(f, 0, 4.2, 4 + side2 * 2.1, 11.4, 0.35, 5.2, '#a33a2a', { pitch: side2 * 0.55 }); // roof
      b.box(f, 0, 3.6, 4, 9.4, 1.2, 6.4, '#7a4e25'); // gable fill
      b.box(f, 0, 1.2, 0.22, 1.4, 2.4, 0.1, '#4a2f18'); // door
      for (const x of [-2.8, 2.8]) b.box(f, x, 1.8, 0.22, 1.4, 1.0, 0.1, '#ffe29a'); // warm windows
      b.box(f, 3.4, 5.0, 6, 0.9, 2.6, 0.9, '#8b8e92'); // chimney
      b.box(f, 0, 3.7, -0.6, 6, 1.2, 0.15, '#ffffff', { front: uvOf('sign2') });
      for (const x of [-2.5, 2.5]) b.box(f, x, 2.0, -0.6, 0.15, 3.2, 0.15, log);
      crowd(f.sub(-7.5, 0, 1.5, 0), 4, 2, 1.1, 0.8);
      return;
    }
  }

  // Giant red toadstools with white spots, dotted about the forest floor. howMany: how many.
  function toadstools(howMany) {
    for (let n = 0, tries = 0; n < howMany && tries < howMany * 30; tries++) {
      const i = Math.floor(rand() * count), side = rand() < 0.5 ? -1 : 1, s = samples[i];
      const off = hw + SAFE + 1 + rand() * 22, x = s.x + s.rx * side * off, z = s.z + s.rz * side * off;
      if (!free(x, z, 1.5)) continue;
      const tall = 0.8 + rand() * 1.6, f = frame(x, 0, z, rand() * 6), b = B(x, z);
      b.cyl(f, 0, 0, 0, tall * 0.28, tall * 0.22, tall, 7, '#f4ead8');
      b.ball(f, 0, tall, 0, tall * 0.75, tall * 0.42, tall * 0.75, '#e63946', 9, 4, { band: [2, '#f4ead8'] });
      for (let k = 0; k < 5; k++) { const a = k * 1.3 + rand(); b.ball(f, Math.sin(a) * tall * 0.45, tall + tall * 0.3, Math.cos(a) * tall * 0.45, tall * 0.11, tall * 0.07, tall * 0.11, '#ffffff', 5, 3); }
      ctx.built.push([x, z, 2]);
      n++;
    }
  }

  // Fallen logs lying beside the road.
  function logs(howMany) {
    for (let n = 0, tries = 0; n < howMany && tries < howMany * 30; tries++) {
      const i = Math.floor(rand() * count), side = rand() < 0.5 ? -1 : 1, s = samples[i];
      const off = hw + SAFE + 2 + rand() * 18, x = s.x + s.rx * side * off, z = s.z + s.rz * side * off;
      if (!free(x, z, 3)) continue;
      const len = 3 + rand() * 4, r = 0.3 + rand() * 0.25, f = frame(x, 0, z, rand() * 6), b = B(x, z);
      b.cyl(f, -len / 2, r * 0.9, 0, r, r * 0.85, len, 7, '#6e4b2e', { capCol: '#d1a46e', base: true });
      if (rand() < 0.6) b.ball(f, len * 0.2, r * 1.8, 0, 0.3, 0.2, 0.3, '#e63946', 6, 3, { band: [2, '#f4ead8'] }); // a little toadstool on top
      ctx.built.push([x, z, len / 2 + 0.5]);
      n++;
    }
  }

  // Post-and-rail wooden fencing along the straighter parts, just past the walls.
  function woodFence() {
    for (const side of [-1, 1]) for (let i = 0; i < count; i += 2) {
      if (Math.floor(i / 50) % 2 || avoided(i) || samples[i].curve > BEND) continue;
      const s = samples[i], t = samples[(i + 2) % count], off = hw + SAFE + 0.4;
      const a = [s.x + s.rx * side * off, s.z + s.rz * side * off], c = [t.x + t.rx * side * off, t.z + t.rz * side * off];
      if (!free(a[0], a[1], 0.3) || !free(c[0], c[1], 0.3)) continue;
      const f = frame(a[0], 0, a[1], Math.atan2(c[0] - a[0], c[1] - a[1])), len = Math.hypot(c[0] - a[0], c[1] - a[1]), b = B(a[0], a[1]);
      if (i % 4 === 0) b.box(f, 0, 0.6, 0, 0.22, 1.2, 0.22, '#5a3b22');
      for (const y of [0.45, 0.95]) b.box(f, 0, y, len / 2, 0.1, 0.14, len + 0.1, '#a8743f');
    }
  }

  // Building-site extras: barrier lines, pipe stacks, porta-potties, the site office.
  function site() {
    const props = ctx.props;
    // pipe stacks and potty rows, scattered where there is space
    const spot = (r) => {
      for (let tries = 0; tries < 60; tries++) {
        const i = Math.floor(rand() * count), side = rand() < 0.5 ? -1 : 1, s = samples[i];
        if (avoided(i)) continue;
        const off = hw + SAFE + r + 1 + rand() * 14;
        const f = frame(s.x + s.rx * side * off, 0, s.z + s.rz * side * off, Math.atan2(side * s.rx, side * s.rz));
        if (claimRect(f, -r, r, -r * 0.6, r * 0.6)) return f;
      }
      return null;
    };
    for (let n = 0; n < 7; n++) {
      const f = spot(4);
      if (!f) continue;
      const b = B(f.x, f.z), col = n % 2 ? '#a8abae' : '#d0d3d6';
      for (const [row, cnt] of [[0, 4], [1, 3], [2, 2]]) for (let k = 0; k < cnt; k++) b.cyl(f, -3, 0.65 + row * 1.15, (k - (cnt - 1) / 2) * 1.32, 0.66, 0.66, 6, 10, col, { lie: true, capCol: '#7d8084' });
    }
    for (let n = 0; n < 4; n++) {
      const f = spot(4);
      if (!f) continue;
      const b = B(f.x, f.z);
      for (let k = 0; k < 4; k++) {
        const x = (k - 1.5) * 1.6;
        b.box(f, x, 1.2, 0, 1.4, 2.4, 1.4, '#2f6fed', { frontCol: '#4b86ff' });
        b.box(f, x, 2.48, 0, 1.5, 0.16, 1.5, '#ffffff');
        b.box(f, x + 0.35, 1.4, -0.72, 0.18, 0.18, 0.05, k % 2 ? '#e63946' : '#2fbf71'); // vacant / engaged
      }
    }
    // heaps of sand and gravel, skips full of rubble and pallets of bricks, all over the site
    const xs = samples.map((q) => q.x), zs = samples.map((q) => q.z);
    const [minX, maxX, minZ, maxZ] = [Math.min(...xs) - 50, Math.max(...xs) + 50, Math.min(...zs) - 50, Math.max(...zs) + 50];
    for (let n = 0, tries = 0; n < 70 && tries < 900; tries++) {
      const x = minX + rand() * (maxX - minX), z = minZ + rand() * (maxZ - minZ), kind = n % 4, r = kind < 2 ? 6 : 2.6;
      if (!free(x, z, r + 1)) continue;
      const f = frame(x, 0, z, rand() * 6), b = B(x, z);
      if (kind < 2) {
        const R = 3 + rand() * 4.5, H = R * (0.45 + rand() * 0.25);
        b.cyl(f, 0, -0.1, 0, R, R * 0.2, H, 9, pickOf(rand, ['#c9a36a', '#9a9a96', '#b58a55', '#8f8a80', '#a8743f']), { twist: rand() });
      } else if (kind === 2) { // a yellow skip full of rubble
        b.box(f, 0, 0.8, 0, 4, 1.6, 2.1, '#f2b705', { side: '#d99e00' });
        for (let k = 0; k < 4; k++) b.ball(f, (k - 1.5) * 0.9, 1.6, (rand() - 0.5) * 0.8, 0.6, 0.35, 0.5, '#8b8e92', 5, 3);
      } else { // pallets of bricks
        b.box(f, 0, 0.07, 0, 4.2, 0.14, 1.4, '#c99a62');
        for (let k = 0; k < 3; k++) b.box(f, (k - 1) * 1.35, 0.7, 0, 1.2, 1.1, 1.2, '#b5523b', { topCol: '#c96a50' });
      }
      ctx.built.push([x, z, r]);
      n++;
    }
    // the site office: a portable cabin up on blocks, with steps and a sign
    for (const [i0, side] of [[25, 1], [25, -1], [-30, 1], [-30, -1], [60, 1], [60, -1]]) {
      const i = (i0 + count) % count, f = beside(i, side, hw + SAFE + 4);
      if (!claimRect(f, -7, 7, -1, 6)) continue;
      const b = B(f.x, f.z);
      for (const x of [-5, 0, 5]) b.box(f, x, 0.3, 2.6, 0.8, 0.6, 3, '#8b8e92');
      b.box(f, 0, 2.1, 2.6, 12, 3, 3.6, '#ffffff', { front: uvOf('windows'), frontCol: '#f2f2f2', side: '#e3e5e8' });
      b.box(f, 0, 3.7, 2.6, 12.4, 0.2, 4, '#59616b');
      b.box(f, 0, 4.4, 1.0, 6, 1.3, 0.15, '#ffffff', { front: uvOf('sign1') });
      for (let k = 0; k < 3; k++) b.box(f, 4.5, 0.2 + k * 0.2, -0.4 - k * 0.3, 1.4, 0.2, 0.5, '#59616b');
      for (let k = 0; k < 6; k++) fan(...f.at(-6 + k * 1.3, 0, -1.6), f.yaw + Math.PI, '#ff8c1a', 1.15); // workers in hi-vis
      break;
    }
    // hazard-stripe boards on the outside of the bends
    bends.forEach(({ a, len, side }) => {
      const i = (a + Math.floor(len / 2)) % count;
      if (avoided(i)) return;
      const f = beside(i, side, hw + SAFE + 3.5);
      if (!free(f.x, f.z, 3)) return;
      const b = B(f.x, f.z);
      b.box(f, 0, 1.2, 0, 6, 1.0, 0.15, '#ffffff', { front: uvOf('hazard'), back: uvOf('hazard') });
      for (const x of [-2.6, 2.6]) b.box(f, x, 0.5, 0.1, 0.15, 1.0, 0.15, '#59616b');
      for (const x of [-4, 4]) { const [cx, , cz] = f.at(x, 0, -0.5); props.add('construction-cone', cx, cz, 0, 0.9); }
      ctx.built.push([f.x, f.z, 4]);
    });
    // extra cones lining the straights
    samples.forEach((s, i) => {
      if (i % 9 || avoided(i) || Math.floor(i / 60) % 2) return;
      for (const side of [-1, 1]) { const x = s.x + s.rx * side * (hw + 1.7), z = s.z + s.rz * side * (hw + 1.7); props.add('construction-cone', x, z, i, 0.9); }
    });
  }

  // Stone arches over the road, mossy on top. list: how far round the lap (0..1) for each.
  function arches(list) {
    for (const at of list) {
      // from `at`, go on round the lap to the first spot with room for both legs
      let i = Math.floor(at * count), f, span = hw + SAFE + 2.4;
      for (let n = 0; n < count / 3; n += 3, i = (i + 3) % count) {
        const q = samples[i];
        f = frame(q.x, 0, q.z, q.heading);
        if (!avoided(i) && q.curve < 0.5 && [-1, 1].every((side) => free(...xz(f.at(side * span, 0, 0)), 2))) break;
        f = null;
      }
      if (!f) continue;
      const s = samples[i];
      landmarks.push(i);
      const b = B(s.x, s.z), r2 = rng(i);
      const stones = ['#8a7f78', '#776d66', '#9c918a', '#6d625c'];
      for (const side of [-1, 1]) {
        for (let y = 0, k = 0; y < 11; k++) {
          const h = 1.6 + r2() * 0.8, w = 3.6 - y * 0.06 + r2() * 0.6;
          b.box(f, side * (span + (r2() - 0.5) * 0.5), y + h / 2, (r2() - 0.5) * 0.6, w, h, 3.2 + r2() * 0.6, stones[k % 4], { roll: (r2() - 0.5) * 0.12 });
          y += h * 0.92;
        }
        const [x, , z] = f.at(side * span, 0, 0);
        ctx.built.push([x, z, 4]);
      }
      // the top: a chunky lintel made of a few big blocks, a little uneven, with moss and ferns
      for (let k = -3; k <= 3; k++) {
        const x = (k / 3) * span, y = 11.6 + Math.cos((k / 3) * 1.2) * 1.4;
        b.box(f, x, y, 0, span / 3 + 1.2, 2.6 + r2() * 0.6, 3.6, stones[(k + 4) % 4], { roll: (r2() - 0.5) * 0.2 });
        b.box(f, x, y + 1.45, 0, span / 3 + 1, 0.5, 3.8, '#5f8f2c');
      }
    }
  }

  // Nests of big spotted dino eggs. howMany: how many nests.
  function nests(howMany) {
    for (let n = 0, tries = 0; n < howMany && tries < 200; tries++) {
      const i = Math.floor(rand() * count), side = rand() < 0.5 ? -1 : 1, s = samples[i];
      const off = hw + SAFE + 3 + rand() * 10, x = s.x + s.rx * side * off, z = s.z + s.rz * side * off;
      if (!free(x, z, 3)) continue;
      const f = frame(x, 0, z, rand() * 6), b = B(x, z);
      b.cyl(f, 0, 0, 0, 2.6, 2.2, 0.6, 10, '#8b6a3e', { capCol: '#6e5230' });
      for (let k = 0; k < 4; k++) {
        const a = k * 1.7, egg = ['#f4ead8', '#cfe8c2', '#f6d7a8', '#d8e4f4'][k];
        b.ball(f, Math.sin(a) * 1.0, 1.3, Math.cos(a) * 1.0, 0.6, 0.85, 0.6, egg, 8, 5);
        b.ball(f, Math.sin(a) * 1.0 + 0.3, 1.6, Math.cos(a) * 1.0 + 0.45, 0.14, 0.14, 0.14, '#8e44ec', 5, 3);
      }
      ctx.built.push([x, z, 4]);
      n++;
    }
  }

  // ================= far-off scenery to fill the horizon =================
  farRing();
  function farRing() {
    const cx = samples.reduce((t, s) => t + s.x, 0) / count, cz = samples.reduce((t, s) => t + s.z, 0) / count;
    const r2 = rng(31);
    for (let n = 0; n < 420; n++) {
      const a = r2() * Math.PI * 2, d = 300 + r2() * 150;
      const x = cx + Math.sin(a) * d * 1.15, z = cz + Math.cos(a) * d;
      const land = ctx.landAt(x, z), kind = land.far ?? dress.far ?? 'trees';
      if (kind === 'none' || ctx.blocked(x, z, 10) || ctx.roadGap(x, z) < 90) continue;
      const f = frame(x, 0, z, r2() * 6), b = B(x, z, true);
      if (kind === 'city' && Math.sin(a * 2 + 1) > 0.55) { // a town off in one or two directions
        const w = 12 + r2() * 14, h = 12 + r2() * 34 * (r2() < 0.15 ? 2 : 1);
        b.box(f, 0, h / 2, 0, w, h, w * (0.7 + r2() * 0.5), pickOf(r2, ['#9fb0c4', '#c4b39c', '#8fa0b8', '#b0a2c4', '#c9bfa8', '#d7a98c']), { front: uvOf('windows'), back: uvOf('windows'), noBottom: true });
        continue;
      }
      if (kind === 'pines' || kind === 'snow' || (kind === 'trees' && r2() < 0.3)) {
        const h = 16 + r2() * 18, col = kind === 'snow' ? pickOf(r2, ['#dfe8f0', '#cfdbe6']) : pickOf(r2, ['#2c6b43', '#2f5f3e', '#3b7a4c']);
        b.cyl(f, 0, 0, 0, 1, 0.8, 3, 5, '#5a3b22', { cap: false });
        b.cyl(f, 0, 2.5, 0, h * 0.28, 0, h, 6, col);
      } else if (kind === 'palms' || kind === 'jungle') {
        const h = 12 + r2() * 14;
        b.ball(f, 0, h * 0.55, 0, h * 0.45, h * 0.5, h * 0.45, pickOf(r2, ['#3f7f2c', '#4f8f30', '#2f6a28']), 6, 4);
      } else if (kind === 'trees' || kind === 'city') {
        const h = 12 + r2() * 12;
        b.cyl(f, 0, 0, 0, 0.9, 0.7, h * 0.4, 5, '#6e4b2e', { cap: false });
        b.ball(f, 0, h * 0.62, 0, h * 0.42, h * 0.38, h * 0.42, pickOf(r2, ['#4f9e3d', '#5aa644', '#3f8a35', '#6aae4a']), 6, 4);
      }
    }
  }
  // New Mexico: big layered rock buttes and mesas standing out in the desert
  if (dress.buttes) for (const spec of dress.buttes) butte(...spec);
  function butte(x, z, radius, height, seed) {
    if (ctx.roadGap(x, z) < radius * 1.45 + 25) return; // keep well back from the road
    const r2 = rng(seed), b = B(x, z, true), f = frame(x, 0, z, r2() * 6);
    const N = 11, shape = Array.from({ length: N }, () => 0.75 + r2() * 0.45);
    const STRATA = ['#c0623a', '#dc8c52', '#efb983', '#a64b30', '#e39e60', '#b85a36'];
    const ring = (r, y) => shape.map((k, i) => { const a = (i / N) * Math.PI * 2; return f.at(Math.sin(a) * r * k, y, Math.cos(a) * r * k); });
    const layer = (r0, r1, y0, y1, col) => {
      const lo = ring(r0, y0), hi = ring(r1, y1), mid = f.at(0, (y0 + y1) / 2, 0);
      for (let i = 0; i < N; i++) { const j = (i + 1) % N; b.quad(lo[i], lo[j], hi[j], hi[i], col, WHITE, mid); }
    };
    // a scree skirt at the bottom, then straight-sided bands of rock, then a flat cap
    layer(radius * 1.45, radius * 1.05, -1, height * 0.22, '#d49a66');
    const bands = 4 + Math.floor(r2() * 3);
    let y = height * 0.22, r = radius * 1.05;
    for (let k = 0; k < bands; k++) {
      const h = ((height * 0.78) / bands) * (0.7 + r2() * 0.6), r1 = r * (0.93 + r2() * 0.05);
      layer(r, r1, y, y + h, STRATA[(k + seed) % STRATA.length]);
      if (k < bands - 1) layer(r1, r1 * 0.97, y + h, y + h + 0.01, '#a35a38'); // a thin ledge between bands
      y += h; r = r1 * 0.97;
    }
    const top = ring(r, y), mid = f.at(0, y, 0);
    for (let i = 0; i < N; i++) b.tri(top[i], top[(i + 1) % N], mid, '#e8b67c', null, f.at(0, y - 5, 0));
    ctx.built.push([x, z, radius * 1.5]);
  }

  // ================= put it all together =================
  // The horizon pieces skip the real fog (which would wash them out to nothing) and get a lighter haze
  // painted into their colours instead, more of it the further they are from the road.
  const farMat = mat(scene, 'venueFar', '#ffffff', 0.9);
  farMat.albedoTexture = atlas;
  farMat.fogEnabled = false;
  const haze = scene.fogColor.toLinearSpace(), density = scene.fogDensity * 0.62;
  for (const [key, batch] of chunks) {
    if (!key.startsWith('far')) continue;
    for (let i = 0, v = 0; v < batch.P.length; v += 3, i += 4) {
      const d = ctx.roadGap(batch.P[v], batch.P[v + 2]) + 70, k = 1 - Math.exp(-((d * density) ** 2));
      for (let c = 0; c < 3; c++) batch.C[i + c] += ([haze.r, haze.g, haze.b][c] - batch.C[i + c]) * k;
    }
  }
  for (const [key, batch] of chunks) {
    const m = batch.build(scene, 'venue' + key, key.startsWith('far') ? farMat : material);
    if (!m) continue;
    m.receiveShadows = true;
    m.freezeWorldMatrix();
    if (!key.startsWith('far')) shadows.addShadowCaster(m, false);
  }
  const paintMat = mat(scene, 'venuePaint', '#ffffff', 1); // fully rough, or it glints white at low angles
  paintMat.albedoTexture = atlas;
  paintMat.specularIntensity = 0.3;
  const g = ground.build(scene, 'venuePaint', paintMat);
  if (g) { g.receiveShadows = true; g.freezeWorldMatrix(); }
  tyres.build();
  for (const gr of groups) { gr.body.build({ node: gr.node }); gr.head.build({ node: gr.node }); }
  // flags: double-sided, fluttering
  const flagMat = mat(scene, 'flag', '#ffffff', 0.8);
  flagMat.albedoTexture = atlas;
  flagMat.backFaceCulling = false;
  const flagMeshes = [plainFlags, checkFlags].map((set) => {
    for (const row of set.list) row.push(rand() * 6.28);
    const built = buildFlags(set, flagMat);
    return built && { ...built, list: set.list };
  }).filter(Boolean);
  updates.push((t, now) => {
    for (const gr of groups) gr.node.position.y = Math.max(0, Math.sin(now * 6.5 + gr.phase)) * 0.28; // hop!
    for (const { mesh, mats, list } of flagMeshes) {
      list.forEach(([x, y, z, yaw, s, , ph], i) => writeMatrix(mats, i, x, y, z, yaw + Math.sin(now * 3.1 + ph) * 0.35 + Math.sin(now * 7.3 + ph * 2) * 0.08, s));
      mesh.thinInstanceBufferUpdated('matrix');
    }
  });
  function buildFlags(set, m) {
    const out = set.build({ dynamic: true });
    if (!out) return null;
    out.mesh.material = m;
    return out;
  }

  return {
    landmarks,
    update(t) {
      const now = performance.now() / 1000;
      for (const u of updates) u(t, now);
    },
  };
}

// a person: legs, body and arms waving in the air (the head is a separate shape, so it can be a different colour)
function personBody() {
  const b = new Batch(), f = frame(0, 0, 0);
  b.box(f, 0, 0.35, 0, 0.36, 0.7, 0.22, '#5a6078');
  b.box(f, 0, 0.98, 0, 0.5, 0.62, 0.3, '#ffffff');
  for (const side of [-1, 1]) b.box(f, side * 0.36, 1.45, 0, 0.13, 0.62, 0.13, '#ffffff', { roll: side * -0.45 });
  return b;
}
function personHead() {
  const b = new Batch(), f = frame(0, 0, 0);
  b.ball(f, 0, 1.47, 0, 0.19, 0.21, 0.19, '#ffffff', 6, 4);
  return b;
}
// three tyres in a stack; the colour of the copy paints them
function tyreStack() {
  const b = new Batch(), f = frame(0, 0, 0);
  for (let k = 0; k < 3; k++) b.cyl(f, 0, k * 0.3, 0, 0.42, 0.42, 0.27, 9, '#ffffff', { twist: k * 0.5, capCol: '#3a3a3e' });
  return b;
}
// a flag hanging off its pole (the pole is at x = 0), with a ripple in it
function flagShape(checked) {
  const b = new Batch(), W = 1.5, H = 0.95, N = 4;
  const [u0, v0, u1, v1] = checked ? uvOf('checker') : WHITE;
  const p = (k, y) => [(k / N) * W, y, Math.sin((k / N) * 5) * 0.12 * (k / N)];
  for (let k = 0; k < N; k++) {
    const ua = u0 + ((u1 - u0) * k) / N, ub = u0 + ((u1 - u0) * (k + 1)) / N;
    b.quad(p(k, 0), p(k + 1, 0), p(k + 1, H), p(k, H), '#ffffff', [ua, v0, ub, v1]);
  }
  return b;
}
