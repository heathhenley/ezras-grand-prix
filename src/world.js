import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3, Matrix, Quaternion } from '@babylonjs/core/Maths/math.vector';
import '@babylonjs/core/Meshes/thinInstanceMesh';

function mat(scene, name, hex, spec = 0) {
  const m = new StandardMaterial(name, scene);
  m.diffuseColor = Color3.FromHexString(hex);
  m.specularColor = new Color3(spec, spec, spec);
  return m;
}

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

export function buildWorld(scene, track, def) {
  const { samples, count } = track;
  const hw = def.width / 2;

  const ground = MeshBuilder.CreateGround('ground', { width: 1400, height: 1400 }, scene);
  ground.material = mat(scene, 'grass', def.ground);

  // Road surface: a ribbon between the left and right edges
  const left = [], right = [];
  for (const s of samples) {
    left.push(new Vector3(s.x - s.rx * hw, 0.02, s.z - s.rz * hw));
    right.push(new Vector3(s.x + s.rx * hw, 0.02, s.z + s.rz * hw));
  }
  const road = MeshBuilder.CreateRibbon('road', { pathArray: [left, right], closePath: true }, scene);
  const roadMat = mat(scene, 'asphalt', '#555a63');
  roadMat.backFaceCulling = false;
  road.material = roadMat;

  // Red/white curbs along both edges
  const curbR = MeshBuilder.CreateBox('curbR', { width: 1.2, height: 0.12, depth: 2.0 }, scene);
  const curbW = curbR.clone('curbW');
  curbR.material = mat(scene, 'curbRed', '#d62839');
  curbW.material = mat(scene, 'curbWhite', '#f4f4f4');
  const reds = [], whites = [];
  samples.forEach((s, i) => {
    for (const side of [-1, 1]) {
      const off = side * (hw + 0.6);
      (i % 2 ? reds : whites).push([s.x + s.rx * off, 0.06, s.z + s.rz * off, s.heading]);
    }
  });
  place(curbR, reds);
  place(curbW, whites);

  // Dashed center line
  const dash = MeshBuilder.CreateBox('dash', { width: 0.3, height: 0.02, depth: 2.2 }, scene);
  dash.material = mat(scene, 'paintLine', '#f2f2f2');
  place(dash, samples.filter((_, i) => i % 4 === 0 && i > 4 && i < count - 4).map((s) => [s.x, 0.035, s.z, s.heading]));

  // Checkered start/finish line at sample 0
  const sq = MeshBuilder.CreateBox('sq', { width: 1, height: 0.02, depth: 1 }, scene);
  const sqB = sq.clone('sqB');
  sq.material = mat(scene, 'checkW', '#ffffff');
  sqB.material = mat(scene, 'checkB', '#111111');
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
  post.material = mat(scene, 'gantry', '#2b2f38');
  place(post, [-1, 1].map((side) => [s0.x + s0.rx * side * (hw + 2), 3, s0.z + s0.rz * side * (hw + 2), s0.heading]));
  const banner = MeshBuilder.CreateBox('banner', { width: def.width + 4.5, height: 1.4, depth: 0.4 }, scene);
  banner.material = mat(scene, 'banner', '#ffcc00');
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

  for (const m of scene.materials) m.freeze();
}
