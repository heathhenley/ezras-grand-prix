// Turns Kenney "Nature Kit" models (CC0, kenney.nl/assets/nature-kit) into src/scenery.json.
//
//   node tools/build-scenery.mjs
//
// Each model is split by the kit's material names (leaves, bark, rock...). The game gives those its
// own colours (see SCENERY_COLORS in src/world.js), because the kit's teal-and-orange palette does not
// suit the photo sky and grass.
// To add a model: drop its .glb from the kit's "GLTF format" folder into tools/nature-kit, run this,
// then use its file name (without .glb) in a track's scenery list in src/data.js.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const KIT = path.join(here, 'nature-kit');
const OUT = path.join(here, '..', 'src', 'scenery.json');

// kit material name -> the game's material kinds
const KIND = { leafsGreen: 'leaf', leafsDark: 'pine', woodBark: 'bark', woodBarkDark: 'bark', grass: 'bush', dirt: 'rock', _defaultMat: 'stone', stone: 'stone', stoneDark: 'stone' };

const r3 = (v) => Math.round(v * 1000) / 1000;

function readGlb(file) {
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
  // turn/scale/move a point by a node's own placement (quaternion rotation, as glTF stores it)
  const place = (n, v, isNormal) => {
    const [sx, sy, sz] = n.scale || [1, 1, 1], [qx, qy, qz, qw] = n.rotation || [0, 0, 0, 1], t = n.translation || [0, 0, 0];
    const x = v[0] * sx, y = v[1] * sy, z = v[2] * sz;
    const cx = qy * z - qz * y, cy = qz * x - qx * z, cz = qx * y - qy * x;
    const out = [x + 2 * (qw * cx + qy * cz - qz * cy), y + 2 * (qw * cy + qz * cx - qx * cz), z + 2 * (qw * cz + qx * cy - qy * cx)];
    return isNormal ? out : out.map((c, k) => c + t[k]);
  };
  const groups = {};
  let height = 0;
  const walk = (ni, chain) => {
    const n = j.nodes[ni];
    if (n.matrix) throw new Error(`${file}: node ${n.name} uses a matrix, not handled`);
    chain = [n, ...chain]; // innermost first
    const world = (v, isNormal) => chain.reduce((p, node) => place(node, p, isNormal), v);
    for (const p of n.mesh !== undefined ? j.meshes[n.mesh].primitives : []) {
      const name = j.materials[p.material].name;
      const kind = KIND[name];
      if (!kind) throw new Error(`${file}: unknown material "${name}" - add it to KIND`);
      const pos = read(p.attributes.POSITION), nor = read(p.attributes.NORMAL);
      const idx = p.indices !== undefined ? read(p.indices) : pos.map((_, i) => i).slice(0, pos.length / 3);
      const g = (groups[kind] ??= { pos: [], nor: [] });
      for (let t = 0; t < idx.length; t += 3) {
        // the kit is right-handed and the game is left-handed, so the triangle is wound the other way round
        for (const i of [idx[t], idx[t + 2], idx[t + 1]]) {
          const P = world(pos.slice(i * 3, i * 3 + 3), false), N = world(nor.slice(i * 3, i * 3 + 3), true);
          const len = Math.hypot(...N) || 1;
          for (let k = 0; k < 3; k++) { g.pos.push(r3(P[k])); g.nor.push(Math.round((N[k] / len) * 100) / 100); }
          height = Math.max(height, P[1]);
        }
      }
    }
    (n.children || []).forEach((c) => walk(c, chain));
  };
  j.scenes[j.scene || 0].nodes.forEach((i) => walk(i, []));
  return { height: r3(height), groups };
}

const out = {};
for (const f of fs.readdirSync(KIT).filter((f) => f.endsWith('.glb')).sort()) {
  const id = f.replace('.glb', '');
  out[id] = readGlb(path.join(KIT, f));
  console.log(id.padEnd(26), 'height', String(out[id].height).padEnd(6), Object.entries(out[id].groups).map(([k, g]) => `${k}:${g.pos.length / 9}`).join(' '));
}
fs.writeFileSync(OUT, JSON.stringify(out));
console.log('wrote', path.relative(process.cwd(), OUT), (fs.statSync(OUT).size / 1024).toFixed(0) + ' kB');
