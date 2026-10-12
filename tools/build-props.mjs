// Turns Kenney models into simple fixed props (cones, barriers, parked diggers...) in src/props.json.
//
//   node tools/build-props.mjs
//
// Every folder in tools/props is one Kenney kit: its .glb files plus that kit's colormap.png
// (from the kit's "GLB format/Textures" folder). Unlike the race cars these keep the kit's own colours,
// baked in per corner, and each model becomes a single shape (wheels and other parts merged in).
// Kits used: City Kit Roads and Car Kit, both CC0 from kenney.nl.
// To add a prop: drop the .glb in the right folder, run this, then use its file name in src/world.js.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const KITS = path.join(here, 'props');
const OUT = path.join(here, '..', 'src', 'props.json');
const r3 = (v) => Math.round(v * 1000) / 1000;

// plain 8-bit RGBA PNG -> pixels
function readPng(file) {
  const b = fs.readFileSync(file);
  const w = b.readUInt32BE(16), h = b.readUInt32BE(20);
  if (b[24] !== 8 || b[25] !== 6 || b[28] !== 0) throw new Error(`${file}: expected 8-bit RGBA non-interlaced PNG`);
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

function readModel(file, palette) {
  const b = fs.readFileSync(file);
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
  const hex = (u, v) => {
    const x = Math.min(palette.w - 1, Math.max(0, Math.floor(u * palette.w))), y = Math.min(palette.h - 1, Math.max(0, Math.floor(v * palette.h)));
    const i = (y * palette.w + x) * 4;
    return '#' + [0, 1, 2].map((k) => palette.px[i + k].toString(16).padStart(2, '0')).join('');
  };
  const pos = [], nor = [], col = [];
  let lo = Infinity, hi = -Infinity;
  const walk = (ni, ox, oy, oz) => {
    const n = j.nodes[ni];
    if ((n.rotation || [0, 0, 0, 1]).some((v, i) => Math.abs(v - (i === 3 ? 1 : 0)) > 1e-6) || (n.scale || []).some((v) => v !== 1) || n.matrix) {
      throw new Error(`${file}: node ${n.name} is rotated or scaled, not handled`);
    }
    const [tx, ty, tz] = n.translation || [0, 0, 0];
    const at = [ox + tx, oy + ty, oz + tz];
    for (const p of n.mesh !== undefined ? j.meshes[n.mesh].primitives : []) {
      const P = read(p.attributes.POSITION), N = read(p.attributes.NORMAL), UV = read(p.attributes.TEXCOORD_0), idx = read(p.indices);
      for (let t = 0; t < idx.length; t += 3) {
        const [a, b2, c] = [idx[t], idx[t + 1], idx[t + 2]];
        const color = hex((UV[a * 2] + UV[b2 * 2] + UV[c * 2]) / 3, (UV[a * 2 + 1] + UV[b2 * 2 + 1] + UV[c * 2 + 1]) / 3);
        // the kits are right-handed and the game is left-handed, so the triangle is wound the other way round
        for (const i of [a, c, b2]) {
          for (let k = 0; k < 3; k++) { pos.push(r3(P[i * 3 + k] + at[k])); nor.push(Math.round(N[i * 3 + k] * 100) / 100); }
          col.push(color);
          lo = Math.min(lo, P[i * 3 + 1] + at[1]);
          hi = Math.max(hi, P[i * 3 + 1] + at[1]);
        }
      }
    }
    (n.children || []).forEach((c) => walk(c, ...at));
  };
  j.scenes[j.scene || 0].nodes.forEach((i) => walk(i, 0, 0, 0));
  for (let i = 1; i < pos.length; i += 3) pos[i] = r3(pos[i] - lo); // stand it on the ground
  const colors = [...new Set(col)];
  return { height: r3(hi - lo), pos, nor, colors, colIdx: col.map((c) => colors.indexOf(c)) };
}

const out = {};
for (const kit of fs.readdirSync(KITS).filter((d) => fs.statSync(path.join(KITS, d)).isDirectory()).sort()) {
  const palette = readPng(path.join(KITS, kit, 'colormap.png'));
  for (const f of fs.readdirSync(path.join(KITS, kit)).filter((f) => f.endsWith('.glb')).sort()) {
    const id = f.replace('.glb', '');
    out[id] = readModel(path.join(KITS, kit, f), palette);
    console.log(`${kit}/${id}`.padEnd(34), 'height', String(out[id].height).padEnd(6), 'triangles', out[id].pos.length / 9, 'colours', out[id].colors.length);
  }
}
fs.writeFileSync(OUT, JSON.stringify(out));
console.log('wrote', path.relative(process.cwd(), OUT), (fs.statSync(OUT).size / 1024).toFixed(0) + ' kB');
