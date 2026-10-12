// Turns the Kenney "Car Kit" models (CC0, kenney.nl/assets/car-kit) into src/cars.json.
//
//   node tools/build-cars.mjs            rebuild src/cars.json
//   node tools/build-cars.mjs --colors   list the colours used by each model (to fill in CARS below)
//
// Kenney paints every model from one small palette picture. To let the game repaint a car we sort
// each triangle by its palette colour into: paint (takes the garage colour), glass, rim (takes the
// wheel colour), lamps, and trim (keeps its own colour). See classify() for the rules.
// To add a car: drop its .glb from the kit's "GLB format" folder into tools/car-kit, add a line to
// CARS, run this, then add a matching entry to BODIES in src/data.js.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const KIT = path.join(here, 'car-kit');
const OUT = path.join(here, '..', 'src', 'cars.json');

// id (matches BODIES in data.js) -> model file
const CARS = {
  racer: { file: 'sedan-sports' },
  muscle: { file: 'hatchback-sports' },
  buggy: { file: 'truck' },
  formula: { file: 'race' },
  future: { file: 'race-future' },
};
const SPOILERS = { small: 'debris-spoiler-a', wing: 'debris-spoiler-b' };

// ---------- palette picture (plain 8-bit RGBA PNG) ----------
function readPng(file) {
  const b = fs.readFileSync(file);
  const w = b.readUInt32BE(16), h = b.readUInt32BE(20);
  if (b[24] !== 8 || b[25] !== 6 || b[28] !== 0) throw new Error('expected 8-bit RGBA non-interlaced PNG');
  const idat = [];
  for (let p = 8; p < b.length;) {
    const len = b.readUInt32BE(p), type = b.toString('latin1', p + 4, p + 8);
    if (type === 'IDAT') idat.push(b.subarray(p + 8, p + 8 + len));
    p += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const px = Buffer.alloc(w * h * 4), stride = w * 4;
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x++) {
      const v = raw[y * (stride + 1) + 1 + x];
      const a = x >= 4 ? px[y * stride + x - 4] : 0, up = y ? px[(y - 1) * stride + x] : 0, ul = y && x >= 4 ? px[(y - 1) * stride + x - 4] : 0;
      let pred = 0;
      if (f === 1) pred = a;
      else if (f === 2) pred = up;
      else if (f === 3) pred = (a + up) >> 1;
      else if (f === 4) { const pa = Math.abs(up - ul), pb = Math.abs(a - ul), pc = Math.abs(a + up - 2 * ul); pred = pa <= pb && pa <= pc ? a : pb <= pc ? up : ul; }
      px[y * stride + x] = (v + pred) & 255;
    }
  }
  return { w, h, px };
}
const palette = readPng(path.join(KIT, 'colormap.png'));
const hex = (u, v) => {
  const x = Math.min(palette.w - 1, Math.max(0, Math.floor(u * palette.w))), y = Math.min(palette.h - 1, Math.max(0, Math.floor(v * palette.h)));
  const i = (y * palette.w + x) * 4;
  return '#' + [0, 1, 2].map((k) => palette.px[i + k].toString(16).padStart(2, '0')).join('');
};

// ---------- models ----------
function readGlb(name) {
  const b = fs.readFileSync(path.join(KIT, name + '.glb'));
  const jsonLen = b.readUInt32LE(12);
  const j = JSON.parse(b.subarray(20, 20 + jsonLen).toString());
  const bin = b.subarray(20 + jsonLen + 8);
  const read = (ai) => {
    const a = j.accessors[ai], bv = j.bufferViews[a.bufferView];
    const n = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type];
    const size = { 5121: 1, 5123: 2, 5125: 4, 5126: 4 }[a.componentType];
    const stride = bv.byteStride || n * size, base = (bv.byteOffset || 0) + (a.byteOffset || 0);
    const out = [];
    for (let i = 0; i < a.count; i++) for (let k = 0; k < n; k++) {
      const o = base + i * stride + k * size;
      out.push(a.componentType === 5126 ? bin.readFloatLE(o) : a.componentType === 5123 ? bin.readUInt16LE(o) : a.componentType === 5121 ? bin[o] : bin.readUInt32LE(o));
    }
    return out;
  };
  const parts = [];
  const walk = (ni, ox, oy, oz) => {
    const n = j.nodes[ni];
    if (n.rotation || n.scale) throw new Error(`${name}: node ${n.name} has rotation/scale, not handled`);
    const [tx, ty, tz] = n.translation || [0, 0, 0];
    const x = ox + tx, y = oy + ty, z = oz + tz;
    if (n.mesh !== undefined) {
      const p = j.meshes[n.mesh].primitives[0];
      parts.push({ name: n.name, at: [x, y, z], pos: read(p.attributes.POSITION), nor: read(p.attributes.NORMAL), uv: read(p.attributes.TEXCOORD_0), idx: read(p.indices) });
    }
    (n.children || []).forEach((c) => walk(c, x, y, z));
  };
  j.scenes[0].nodes.forEach((i) => walk(i, 0, 0, 0));
  return parts;
}

// colour of each triangle, taken from the palette at the middle of the triangle
function triangles(part) {
  const tris = [];
  for (let t = 0; t < part.idx.length; t += 3) {
    const [a, b, c] = [part.idx[t], part.idx[t + 1], part.idx[t + 2]];
    const u = (part.uv[a * 2] + part.uv[b * 2] + part.uv[c * 2]) / 3, v = (part.uv[a * 2 + 1] + part.uv[b * 2 + 1] + part.uv[c * 2 + 1]) / 3;
    const P = (i) => part.pos.slice(i * 3, i * 3 + 3);
    const [pa, pb, pc] = [P(a), P(b), P(c)];
    const e1 = pb.map((v, k) => v - pa[k]), e2 = pc.map((v, k) => v - pa[k]);
    const area = Math.hypot(e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]) / 2;
    tris.push({ v: [a, b, c], color: hex(u, v), area });
  }
  return tris;
}

const r3 = (v) => Math.round(v * 1000) / 1000;

// Collects triangles into one buffer per group. offset moves the part's own origin into car space.
function makeGroups() {
  const groups = {};
  return {
    groups,
    add(group, part, tri, offset = [0, 0, 0]) {
      const g = (groups[group] ??= { pos: [], nor: [], col: group === 'trim' ? [] : undefined });
      // the kit is right-handed and the game is left-handed, so the triangle is wound the other way round
      for (const i of [tri.v[0], tri.v[2], tri.v[1]]) {
        for (let k = 0; k < 3; k++) { g.pos.push(r3(part.pos[i * 3 + k] + offset[k])); g.nor.push(Math.round(part.nor[i * 3 + k] * 100) / 100); }
        if (g.col) g.col.push(tri.color);
      }
    },
  };
}

function finish(groups) {
  // trim colours become a small lookup table + one index per vertex
  for (const g of Object.values(groups)) {
    if (!g.col) { delete g.col; continue; }
    const table = [...new Set(g.col)];
    g.colIdx = g.col.map((c) => table.indexOf(c));
    g.colors = table;
    delete g.col;
  }
  return groups;
}

// Which material a palette colour stands for. Worked out from the colours the kit uses (see --colors).
function classify(color) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16));
  const hi = Math.max(r, g, b), lo = Math.min(r, g, b);
  if (b === 255 && r < g) return 'glass'; // pale blue-white
  if (r === 255 && g >= 0xcf && b <= 0x3c) return 'head'; // pure yellow
  if (r >= 0xd9 && g <= 0x57 && b <= 0x3f) return 'tail'; // deep red, a touch redder than red paint
  if (hi > 120 && (hi - lo) / hi > 0.35) return 'paint'; // anything else colourful is bodywork
  return 'trim'; // greys, black, white
}
const isTyre = (color) => parseInt(color.slice(1, 3), 16) < 0x50;

if (process.argv.includes('--colors')) {
  const files = [...new Set([...Object.values(CARS).map((c) => c.file), ...Object.values(SPOILERS), ...process.argv.slice(2).filter((a) => !a.startsWith('--'))])];
  for (const f of files) {
    console.log('\n' + f);
    for (const part of readGlb(f)) {
      if (part.name.startsWith('wheel') && part.name !== 'wheel-front-left') continue;
      const hist = {};
      for (const t of triangles(part)) hist[t.color] = (hist[t.color] || 0) + t.area;
      console.log('  ' + part.name.padEnd(18), Object.entries(hist).sort((a, b) => b[1] - a[1]).map(([c, a]) => `${c} ${a.toFixed(2)}`).join('  '));
    }
  }
  process.exit(0);
}

const out = { cars: {}, spoilers: {} };
for (const [id, car] of Object.entries(CARS)) {
  const body = makeGroups(), wheel = makeGroups();
  const wheels = [];
  let min = [9, 9, 9], max = [-9, -9, -9], deck = 0;
  const parts = readGlb(car.file);
  for (const part of parts) {
    if (part.name === 'spoiler') continue; // the garage adds spoilers itself
    if (part.name.startsWith('wheel')) {
      const left = part.at[0] > 0;
      wheels.push({ x: r3(part.at[0]), y: r3(part.at[1]), z: r3(part.at[2]), front: part.name.includes('front'), left });
      // one shared wheel shape (taken from a left wheel; right wheels are mirrored in the game)
      if (part.name === 'wheel-front-left') for (const t of triangles(part)) wheel.add(isTyre(t.color) ? 'tyre' : 'rim', part, t);
      continue;
    }
    for (const t of triangles(part)) body.add(classify(t.color), part, t, part.at);
    for (let i = 0; i < part.pos.length; i += 3) for (let k = 0; k < 3; k++) {
      const v = part.pos[i + k] + part.at[k];
      min[k] = Math.min(min[k], v); max[k] = Math.max(max[k], v);
    }
  }
  // where a spoiler sits: on top of the bodywork near the back
  for (const part of parts) {
    if (part.name.startsWith('wheel') || part.name === 'spoiler') continue;
    for (let i = 0; i < part.pos.length; i += 3) {
      const z = part.pos[i + 2] + part.at[2];
      if (z < min[2] + 0.35) deck = Math.max(deck, part.pos[i + 1] + part.at[1]);
    }
  }
  out.cars[id] = { size: max.map((v, k) => r3(v - min[k])), spoilerAt: [0, r3(deck), r3(min[2] + 0.2)], body: finish(body.groups), wheel: finish(wheel.groups), wheels };
  const count = (g) => Object.entries(g).map(([k, v]) => `${k}:${v.pos.length / 9}`).join(' ');
  console.log(id.padEnd(8), car.file.padEnd(18), 'size', out.cars[id].size.join(' x '), '| body', count(body.groups), '| wheel', count(wheel.groups), '| deck', r3(deck));
}
for (const [id, file] of Object.entries(SPOILERS)) {
  const g = makeGroups();
  for (const part of readGlb(file)) for (const t of triangles(part)) g.add(classify(t.color), part, t, part.at);
  out.spoilers[id] = finish(g.groups);
}
fs.writeFileSync(OUT, JSON.stringify(out));
console.log('wrote', path.relative(process.cwd(), OUT), (fs.statSync(OUT).size / 1024).toFixed(0) + ' kB');
