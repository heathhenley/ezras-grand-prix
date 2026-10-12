import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3, Matrix, Quaternion } from '@babylonjs/core/Maths/math.vector';
import '@babylonjs/core/Meshes/thinInstanceMesh';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { ImageProcessingConfiguration } from '@babylonjs/core/Materials/imageProcessingConfiguration';
import { pbr as mat, tiled, HORIZON } from './env.js';
import MODELS from './scenery.json'; // Kenney Nature Kit shapes, made by tools/build-scenery.mjs

// Colours for the parts of the scenery models (the kit's own colours are teal and orange).
const SCENERY_COLORS = { leaf: '#4f9e3d', pine: '#2c6b43', bark: '#6e4b2e', bush: '#5aa644', rock: '#8b8e92', stone: '#a6a9ad' };

const GRASS_TILE = 5; // meters covered by one repeat of the grass texture
const ROAD_TILE = 4;

function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A ring of hills far away, fading into the haze at the bottom. Flat colours, no lighting.
function hills(scene, rand, radius, low, high, hex) {
  const top = Color3.FromHexString(hex), base = Color3.FromHexString(HORIZON);
  const waves = [3, 5, 8, 13, 21].map((n) => [n, rand() * 6.28, 1 / Math.sqrt(n)]);
  const N = 160, positions = [], colors = [], indices = [];
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * Math.PI * 2;
    let h = 0;
    for (const [n, phase, amp] of waves) h += Math.sin(a * n + phase) * amp;
    const y = low + (high - low) * Math.max(0, Math.min(1, 0.5 + h * 0.3));
    const x = Math.sin(a) * radius, z = Math.cos(a) * radius;
    positions.push(x, -2, z, x, y, z);
    colors.push(base.r, base.g, base.b, 1, top.r, top.g, top.b, 1);
    if (i < N) indices.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  }
  const mesh = new Mesh('hills', scene);
  const vd = new VertexData();
  Object.assign(vd, { positions, colors, indices });
  vd.applyToMesh(mesh);
  const m = new StandardMaterial('hills', scene);
  m.emissiveColor = Color3.White();
  m.disableLighting = true;
  m.fogEnabled = false;
  m.backFaceCulling = false;
  m.imageProcessingConfiguration = new ImageProcessingConfiguration(); // plain colours, no tone mapping
  mesh.material = m;
  mesh.isPickable = false;
}

// Outline of a lake that fills the inside of the loop: in every direction from the middle it
// stops a safe distance short of the road. Returns the middle, a radius per direction, and a test.
function lakeOutline(track, hw) {
  const { samples } = track, N = 72;
  const cx = samples.reduce((t, s) => t + s.x, 0) / samples.length, cz = samples.reduce((t, s) => t + s.z, 0) / samples.length;
  const slot = (x, z) => Math.floor(((Math.atan2(x - cx, z - cz) / (Math.PI * 2) + 1) % 1) * N) % N;
  const reach = new Array(N).fill(Infinity); // distance to the road in each direction
  for (const s of samples) reach[slot(s.x, s.z)] = Math.min(reach[slot(s.x, s.z)], Math.hypot(s.x - cx, s.z - cz));
  let radius = reach.map((_, i) => {
    let near = Infinity;
    for (let k = -4; k <= 4; k++) near = Math.min(near, reach[(i + k + N) % N]);
    return Math.max(0, near - hw - 24);
  });
  for (let pass = 0; pass < 3; pass++) radius = radius.map((r, i) => (radius[(i + N - 1) % N] + r * 2 + radius[(i + 1) % N]) / 4);
  return { cx, cz, radius, N, covers: (x, z, extra = 0) => Math.hypot(x - cx, z - cz) < radius[slot(x, z)] + extra };
}

// A flat patch in the shape of the lake outline, grown outwards by `grow` meters.
function lakePatch(scene, name, lake, grow, y, material) {
  const positions = [lake.cx, y, lake.cz], normals = [0, 1, 0], indices = [];
  for (let i = 0; i < lake.N; i++) {
    const a = ((i + 0.5) / lake.N) * Math.PI * 2, r = lake.radius[i] + grow;
    positions.push(lake.cx + Math.sin(a) * r, y, lake.cz + Math.cos(a) * r);
    normals.push(0, 1, 0);
    indices.push(0, i + 1, ((i + 1) % lake.N) + 1);
  }
  const mesh = new Mesh(name, scene);
  const vd = new VertexData();
  Object.assign(vd, { positions, normals, indices });
  vd.applyToMesh(mesh);
  material.backFaceCulling = false;
  mesh.material = material;
  mesh.receiveShadows = true;
  mesh.isPickable = false;
}

function place(mesh, list) {
  // list of [x, y, z, yaw, sx, sy, sz]
  const ms = list.map(([x, y, z, yaw, sx = 1, sy = 1, sz = 1]) =>
    Matrix.Compose(new Vector3(sx, sy, sz), Quaternion.FromEulerAngles(0, yaw, 0), new Vector3(x, y, z)));
  if (ms.length) mesh.thinInstanceAdd(ms);
  mesh.freezeWorldMatrix();
}

// shadows: the ShadowGenerator from setupSky()
export function buildWorld(scene, track, def, shadows) {
  const { samples, count } = track;
  const hw = def.width / 2;

  const ground = MeshBuilder.CreateGround('ground', { width: 1400, height: 1400 }, scene);
  const grass = mat(scene, 'grass', '#ffffff', 1);
  grass.albedoTexture = tiled(scene, 'grass_diff.jpg', 1400 / GRASS_TILE, 1400 / GRASS_TILE);
  // each track keeps its own shade of green by tinting the photo
  grass.albedoColor = Color3.Lerp(Color3.White(), Color3.FromHexString(def.ground).toLinearSpace(), 0.3).scale(0.8);
  grass.specularIntensity = 0.3;
  ground.material = grass;
  ground.receiveShadows = true;

  // Road surface: a strip between the left and right edges, with the texture running along it
  const laps = Math.round(track.length / ROAD_TILE); // whole repeats, so there is no seam at the start line
  const positions = [], normals = [], uvs = [], indices = [];
  for (let i = 0; i <= count; i++) {
    const s = samples[i % count];
    positions.push(s.x - s.rx * hw, 0.02, s.z - s.rz * hw, s.x + s.rx * hw, 0.02, s.z + s.rz * hw);
    normals.push(0, 1, 0, 0, 1, 0);
    const v = (i / count) * laps;
    uvs.push(0, v, def.width / ROAD_TILE, v);
    if (i < count) indices.push(i * 2, i * 2 + 2, i * 2 + 1, i * 2 + 1, i * 2 + 2, i * 2 + 3);
  }
  const road = new Mesh('road', scene);
  const vd = new VertexData();
  Object.assign(vd, { positions, normals, uvs, indices });
  vd.applyToMesh(road);
  const roadMat = mat(scene, 'asphalt', '#ffffff', 1);
  roadMat.albedoColor = new Color3(2, 2, 2.05); // the photo is of very dark tarmac; lift it to a sunlit grey
  roadMat.albedoTexture = tiled(scene, 'asphalt_diff.jpg', 1, 1);
  roadMat.bumpTexture = tiled(scene, 'asphalt_nor.jpg', 1, 1);
  roadMat.metallicTexture = tiled(scene, 'asphalt_arm.jpg', 1, 1); // R = occlusion, G = roughness, B = metal
  roadMat.useAmbientOcclusionFromMetallicTextureRed = true;
  roadMat.useRoughnessFromMetallicTextureGreen = true;
  roadMat.useMetallnessFromMetallicTextureBlue = true;
  roadMat.backFaceCulling = false;
  road.material = roadMat;
  road.receiveShadows = true;

  // Red/white curbs along both edges
  const curbR = MeshBuilder.CreateBox('curbR', { width: 1.2, height: 0.12, depth: 2.0 }, scene);
  const curbW = MeshBuilder.CreateBox('curbW', { width: 1.2, height: 0.12, depth: 2.0 }, scene);
  curbR.material = mat(scene, 'curbRed', '#d62839', 0.6);
  curbW.material = mat(scene, 'curbWhite', '#e8e8e8', 0.6);
  const reds = [], whites = [];
  samples.forEach((s, i) => {
    for (const side of [-1, 1]) {
      const off = side * (hw + 0.6);
      // reds sit a hair higher so neighbours don't flicker where they overlap on the inside of a bend
      (i % 2 ? reds : whites).push([s.x + s.rx * off, i % 2 ? 0.066 : 0.06, s.z + s.rz * off, s.heading]);
    }
  });
  place(curbR, reds);
  place(curbW, whites);
  curbR.receiveShadows = curbW.receiveShadows = true;

  // Dashed center line
  const dash = MeshBuilder.CreateBox('dash', { width: 0.3, height: 0.02, depth: 2.2 }, scene);
  dash.material = mat(scene, 'paintLine', '#e6e6e6', 0.7);
  place(dash, samples.filter((_, i) => i % 4 === 0 && i > 4 && i < count - 4).map((s) => [s.x, 0.035, s.z, s.heading]));

  // Checkered start/finish line at sample 0
  const sq = MeshBuilder.CreateBox('sq', { width: 1, height: 0.02, depth: 1 }, scene);
  const sqB = MeshBuilder.CreateBox('sqB', { width: 1, height: 0.02, depth: 1 }, scene);
  sq.material = mat(scene, 'checkW', '#ececec', 0.7);
  sqB.material = mat(scene, 'checkB', '#111111', 0.7);
  const s0 = samples[0];
  const wsq = [], bsq = [];
  const cols = Math.floor(def.width);
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < 2; r++) {
      const lat = -hw + 0.5 + c, fwd = r - 0.5;
      const x = s0.x + s0.rx * lat + s0.tx * fwd, z = s0.z + s0.rz * lat + s0.tz * fwd;
      ((c + r) % 2 ? bsq : wsq).push([x, 0.04, z, s0.heading]);
    }
  }
  place(sq, wsq);
  place(sqB, bsq);

  // Start gantry
  const post = MeshBuilder.CreateBox('post', { width: 0.5, height: 6, depth: 0.5 }, scene);
  post.material = mat(scene, 'gantry', '#2b2f38', 0.4, 0.8);
  place(post, [-1, 1].map((side) => [s0.x + s0.rx * side * (hw + 2), 3, s0.z + s0.rz * side * (hw + 2), s0.heading]));
  const banner = MeshBuilder.CreateBox('banner', { width: def.width + 4.5, height: 1.4, depth: 0.4 }, scene);
  banner.material = mat(scene, 'banner', '#ffcc00', 0.5);
  banner.position.set(s0.x, 6, s0.z);
  banner.rotation.y = s0.heading;

  // Lake in the middle of the loop: a sandy shore with still water on top that mirrors the sky
  const lake = def.lake ? lakeOutline(track, hw) : null;
  if (lake) {
    lakePatch(scene, 'shore', lake, 4, 0.03, mat(scene, 'sand', '#cdb98a', 0.95));
    lakePatch(scene, 'water', lake, 0, 0.06, mat(scene, 'water', '#17607a', 0.05));
  }

  // Trees, bushes and rocks scattered away from the road
  const rand = rng(1234);
  const spots = {}; // model name -> where its copies go
  const scatter = (names, howMany, gap, sizeFor) => {
    for (let n = 0, tries = 0; n < howMany && tries < howMany * 20; tries++) {
      const x = (rand() - 0.5) * 640, z = (rand() - 0.5) * 540;
      let near = Infinity;
      for (let i = 0; i < count; i += 3) near = Math.min(near, Math.hypot(samples[i].x - x, samples[i].z - z));
      if (near < hw + gap || lake?.covers(x, z, 7)) continue;
      const name = names[Math.floor(rand() * names.length)];
      const s = sizeFor() / MODELS[name].height;
      (spots[name] ??= []).push([x, 0, z, rand() * 6.28, s, s * (0.9 + rand() * 0.25), s]);
      n++;
    }
  };
  scatter(def.scenery.trees, def.scenery.treeCount ?? 300, 14, () => 7 + rand() * 7); // 7-14 m tall
  scatter(def.scenery.small, 170, 9, () => 0.8 + rand() * 1.6); // bushes and rocks

  const sceneryMats = {};
  for (const [name, list] of Object.entries(spots)) {
    for (const [kind, g] of Object.entries(MODELS[name].groups)) {
      const m = new Mesh(`${name}-${kind}`, scene);
      const vd = new VertexData();
      vd.positions = g.pos;
      vd.normals = g.nor;
      vd.indices = Array.from({ length: g.pos.length / 3 }, (_, i) => i);
      vd.applyToMesh(m);
      m.material = sceneryMats[kind] ??= mat(scene, kind, SCENERY_COLORS[kind], 0.9);
      place(m, list);
      shadows.addShadowCaster(m, false);
    }
  }
  for (const m of [post, banner]) shadows.addShadowCaster(m, false);

  hills(scene, rand, 640, 45, 120, '#8195ab');
  hills(scene, rand, 480, 12, 55, '#7d9a84');

  for (const m of scene.materials) m.freeze();
}
