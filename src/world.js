import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3, Matrix, Quaternion } from '@babylonjs/core/Maths/math.vector';
import '@babylonjs/core/Meshes/thinInstanceMesh';
import { pbr as mat, tiled } from './env.js';

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

  // Trees scattered away from the road
  const rand = rng(1234);
  const trunk = MeshBuilder.CreateCylinder('trunk', { diameter: 0.8, height: 3, tessellation: 6 }, scene);
  trunk.material = mat(scene, 'bark', '#6b4423');
  const leaves = MeshBuilder.CreateCylinder('leaves', { diameterTop: 0, diameterBottom: 5, height: 7, tessellation: 7 }, scene);
  leaves.material = mat(scene, 'leaf', '#2e7d32');
  const trunks = [], tops = [];
  let tries = 0;
  while (trunks.length < 260 && tries++ < 5000) {
    const x = (rand() - 0.5) * 560, z = (rand() - 0.5) * 460;
    let near = Infinity;
    for (let i = 0; i < count; i += 3) near = Math.min(near, Math.hypot(samples[i].x - x, samples[i].z - z));
    if (near < hw + 14) continue;
    const s = 0.7 + rand() * 0.8;
    trunks.push([x, 1.5 * s, z, 0, s, s, s]);
    tops.push([x, (3 + 3.5) * s, z, rand() * 6, s, s, s]);
  }
  place(trunk, trunks);
  place(leaves, tops);

  for (const m of [post, banner, trunk, leaves]) shadows.addShadowCaster(m, false);

  for (const m of scene.materials) m.freeze();
}
