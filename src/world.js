import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3, Vector4, Matrix, Quaternion } from '@babylonjs/core/Maths/math.vector';
import '@babylonjs/core/Meshes/thinInstanceMesh';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { ImageProcessingConfiguration } from '@babylonjs/core/Materials/imageProcessingConfiguration';
import { pbr as mat, tiled, HORIZON } from './env.js';
import MODELS from './scenery.json'; // Kenney Nature Kit shapes, made by tools/build-scenery.mjs
import PROPS from './props.json'; // cones, barriers, diggers... made by tools/build-props.mjs
import { RAMP_LENGTH, RAMP_HEIGHT, GAP_LENGTH } from './physics.js';
import { MACHINES } from './data.js';
import { addAnimals } from './animals.js';
import '@babylonjs/core/Meshes/instancedMesh';

// Colours for the parts of the scenery models (the kit's own colours are teal and orange).
let HAZE = HORIZON; // colour the distance fades into; a track's sky.haze overrides it (set in buildWorld)
const HILL_COLORS = ['#8195ab', '#7d9a84']; // far ring, near ring
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
// layer 0 is the far ring, 1 the near one. Each land colours its own stretch, and can ask for
// flat-topped desert mesas instead of rolling hills.
function hills(scene, rand, radius, low, high, layer, landAt) {
  const base = Color3.FromHexString(HAZE);
  const waves = [3, 5, 8, 13, 21].map((n) => [n, rand() * 6.28, 1 / Math.sqrt(n)]);
  const N = 240, positions = [], colors = [], indices = [];
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * Math.PI * 2;
    const x = Math.sin(a) * radius, z = Math.cos(a) * radius;
    const land = landAt(x, z);
    let h = 0;
    for (const [n, phase, amp] of waves) h += Math.sin(a * n + phase) * amp;
    let t = Math.max(0, Math.min(1, 0.5 + h * 0.3));
    if (land.mesas) t = t > 0.58 ? 0.95 : t > 0.42 ? 0.5 : 0.1; // steps instead of slopes
    const top = Color3.FromHexString((land.hills ?? HILL_COLORS)[layer]);
    positions.push(x, -2, z, x, low + (high - low) * t, z);
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

// A big road sign on two posts, facing the cars as they arrive: "ENTERING / name / motto".
function stateSign(scene, s, hw, land, shadows) {
  const W = 13, H = 4.2, up = 6.6;
  const tex = new DynamicTexture('sign', { width: 1024, height: 330 }, scene, true);
  const g = tex.getContext();
  g.fillStyle = '#1d6b45';
  g.fillRect(0, 0, 1024, 330);
  g.strokeStyle = '#ffffff';
  g.lineWidth = 10;
  g.strokeRect(14, 14, 996, 302);
  g.fillStyle = '#ffffff';
  g.textAlign = 'center';
  g.font = 'bold 54px system-ui, sans-serif';
  g.fillText('ENTERING', 512, 82);
  g.font = 'bold 128px system-ui, sans-serif';
  g.fillText(land.name, 512, 206, 960);
  g.font = 'italic 46px system-ui, sans-serif';
  g.fillText(land.motto, 512, 282, 960);
  tex.update();

  const face = MeshBuilder.CreatePlane('signFace', { width: W, height: H }, scene);
  const fm = mat(scene, 'signFace', '#ffffff', 0.6);
  fm.albedoTexture = tex;
  face.material = fm;
  face.position.set(s.x, up, s.z);
  face.rotation.y = s.heading;
  // plain backing just behind the face, so the sign is not see-through from the other side
  const back = MeshBuilder.CreateBox('signBack', { width: W + 0.3, height: H + 0.3, depth: 0.25 }, scene);
  back.material = mat(scene, 'signBack', '#1d6b45', 0.6);
  back.position.set(s.x + s.tx * 0.14, up, s.z + s.tz * 0.14);
  back.rotation.y = s.heading;
  const post = MeshBuilder.CreateBox('signPost', { width: 0.45, height: up + H / 2, depth: 0.45 }, scene);
  post.material = mat(scene, 'signPost', '#6f757d', 0.4, 0.8);
  place(post, [-1, 1].map((side) => [s.x + s.rx * side * (hw + 2.2) + s.tx * 0.14, (up + H / 2) / 2, s.z + s.rz * side * (hw + 2.2) + s.tz * 0.14, s.heading]));
  for (const m of [back, post]) shadows.addShadowCaster(m, false);
}

// Snowmen: three snowballs, coal eyes and a carrot nose. spots is a list of [x, z, yaw].
function snowmen(scene, spots, shadows) {
  const ball = MeshBuilder.CreateSphere('snowball', { diameter: 1, segments: 10 }, scene);
  ball.material = mat(scene, 'snow', '#f4f8fc', 0.8);
  const coal = MeshBuilder.CreateSphere('coal', { diameter: 0.16, segments: 6 }, scene);
  coal.material = mat(scene, 'coal', '#1c1c1c', 0.9);
  const nose = MeshBuilder.CreateCylinder('carrot', { diameterTop: 0, diameterBottom: 0.2, height: 0.75, tessellation: 8 }, scene);
  nose.rotation.x = Math.PI / 2; // point it forwards
  nose.bakeCurrentTransformIntoVertices();
  nose.material = mat(scene, 'carrot', '#ff7a1a', 0.7);
  const balls = [], coals = [], noses = [];
  for (const [x, z, yaw] of spots) {
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    balls.push([x, 1.0, z, yaw, 2.3, 2.1, 2.3], [x, 2.55, z, yaw, 1.7, 1.6, 1.7], [x, 3.75, z, yaw, 1.2, 1.2, 1.2]);
    for (const side of [-1, 1]) coals.push([x + fx * 0.5 + fz * side * 0.22, 3.95, z + fz * 0.5 - fx * side * 0.22, yaw]);
    for (const y of [2.3, 2.75]) coals.push([x + fx * 0.82, y, z + fz * 0.82, yaw]); // buttons
    noses.push([x + fx * 0.85, 3.72, z + fz * 0.85, yaw]);
  }
  place(ball, balls);
  place(coal, coals);
  place(nose, noses);
  shadows.addShadowCaster(ball, false);
}

// A giant friendly axolotl sitting in a little pond. size 1 is about 5 m long.
function axolotl(scene, { x, z, yaw = 0, size = 2 }, shadows) {
  const node = new TransformNode('axolotl', scene);
  node.position.set(x, 0, z);
  node.rotation.y = yaw;
  node.scaling.setAll(size);
  const pink = mat(scene, 'axolotl', '#f9a9c6', 0.45), frill = mat(scene, 'axolotlGill', '#e2487d', 0.5), dark = mat(scene, 'axolotlEye', '#15151a', 0.2);
  const blob = (material, [sx, sy, sz], [px, py, pz], turn) => {
    const m = MeshBuilder.CreateSphere('axolotlPart', { diameter: 1, segments: 14 }, scene);
    m.scaling.set(sx, sy, sz);
    m.position.set(px, py, pz);
    if (turn) m.rotation.y = turn;
    m.material = material;
    m.parent = node;
    shadows.addShadowCaster(m, false);
    return m;
  };
  blob(pink, [1.15, 0.9, 2.5], [0, 0.6, 0]); // body
  blob(pink, [1.6, 1.05, 1.35], [0, 0.82, 1.5]); // big wide head
  blob(pink, [0.2, 0.95, 2.0], [0, 0.62, -1.95]); // tail fin
  for (const side of [-1, 1]) {
    blob(dark, [0.17, 0.17, 0.17], [side * 0.5, 1.0, 2.02]); // eyes
    blob(pink, [0.62, 0.22, 0.27], [side * 0.78, 0.2, 0.75], side * 0.5); // front legs
    blob(pink, [0.62, 0.22, 0.27], [side * 0.78, 0.2, -0.65], -side * 0.5); // back legs
    // three feathery gills fanning out from the side of the head
    [0.55, 1.05, 1.55].forEach((lean, k) => {
      const gill = MeshBuilder.CreateCylinder('gill', { diameterTop: 0.04, diameterBottom: 0.26, height: 1.0, tessellation: 8 }, scene);
      gill.rotation.z = -side * lean;
      gill.rotation.x = -0.35;
      gill.position.set(side * (0.75 + Math.sin(lean) * 0.45), 0.95 + Math.cos(lean) * 0.45, 1.3 - k * 0.08);
      gill.material = frill;
      gill.parent = node;
      shadows.addShadowCaster(gill, false);
    });
  }
  // smile: a thin ring poking out of the front of the face
  const smile = MeshBuilder.CreateTorus('smile', { diameter: 0.95, thickness: 0.045, tessellation: 28 }, scene);
  smile.position.set(0, 0.66, 1.72);
  smile.material = dark;
  smile.parent = node;

  const pond = MeshBuilder.CreateDisc('pond', { radius: 4.2 * size, tessellation: 40 }, scene);
  pond.rotation.x = Math.PI / 2;
  pond.position.set(x, 0.05, z);
  pond.material = mat(scene, 'water', '#17607a', 0.05);
  pond.receiveShadows = true;

  scene.onBeforeRenderObservable.add(() => {
    node.rotation.y = yaw + Math.sin(performance.now() / 1400) * 0.12; // looks from side to side
  });
}

// The shape of one prop from props.json, in the kit's own colours.
function propShape(scene, name, material) {
  const p = PROPS[name], m = new Mesh(name, scene), vd = new VertexData();
  const table = p.colors.map((hex) => Color3.FromHexString(hex).toLinearSpace());
  vd.positions = p.pos;
  vd.normals = p.nor;
  vd.indices = Array.from({ length: p.pos.length / 3 }, (_, i) => i);
  vd.colors = p.colIdx.flatMap((i) => [table[i].r, table[i].g, table[i].b, 1]);
  vd.applyToMesh(m);
  m.material = material;
  return m;
}

// Fixed props from props.json (cones, barriers, parked diggers...). Collect where they go with add(),
// then build() makes one shape per kind of prop, however many copies there are.
function propSet(scene, shadows) {
  const spots = {};
  const material = mat(scene, 'prop', '#ffffff', 0.6); // white, so the per-corner colours show through
  return {
    material,
    add(name, x, z, yaw, tall, y = 0) {
      const s = tall / PROPS[name].height;
      (spots[name] ??= []).push([x, y, z, yaw, s, s, s]);
    },
    build() {
      for (const [name, list] of Object.entries(spots)) {
        const m = propShape(scene, name, material);
        place(m, list);
        shadows.addShadowCaster(m, false);
      }
    },
  };
}

// Diggers and trucks driving back and forth across the road (the obstacles made by addCrossers in
// physics.js, which moves them). They do not turn round: they drive across, then reverse back.
// Each has a flashing orange light on the roof.
function movingMachines(scene, movers, track, material, shadows) {
  if (!movers.length) return;
  const lamp = MeshBuilder.CreateSphere('beacon', { diameter: 0.7, segments: 8 }, scene);
  lamp.material = mat(scene, 'beacon', '#ff8c1a', 0.4);
  lamp.material.emissiveColor = new Color3(1.6, 0.6, 0.05);
  lamp.isVisible = false; // only the copies are shown
  const list = movers.map((o, k) => {
    const def = MACHINES[o.kind], m = propShape(scene, o.kind, material);
    m.scaling.setAll(def.tall / PROPS[o.kind].height);
    m.rotation.y = track.samples[o.idx].heading + Math.PI / 2; // nose pointing across the road
    shadows.addShadowCaster(m, false);
    const beacon = lamp.createInstance('beacon');
    return { o, m, beacon, tall: def.tall, phase: k * 0.37 };
  });
  scene.onBeforeRenderObservable.add(() => {
    const t = performance.now() / 1000;
    for (const { o, m, beacon, tall, phase } of list) {
      m.position.set(o.x, 0, o.z);
      beacon.position.set(o.x, tall + 0.3, o.z);
      beacon.isVisible = (t * 2 + phase) % 1 < 0.5;
    }
  });
}

// Giant things standing in the road on the road trip (the obstacles made by addRoadItems in physics.js).
// items: those obstacles, each with a kind.
function roadItems(scene, items, shadows) {
  const spots = (kind) => items.filter((o) => o.kind === kind).map((o) => [o.x, 0, o.z, o.idx * 1.3]);
  const put = (mesh, list) => { place(mesh, list); shadows.addShadowCaster(mesh, false); };

  // green chiles: 4.5 m tall, standing on their tips
  const chiles = spots('chile');
  if (chiles.length) {
    const TALL = 4.5, path = [], widths = [];
    for (let i = 0; i <= 18; i++) {
      const t = i / 18;
      path.push(new Vector3(Math.sin(t * 2.6) * 0.5 - 0.25, 0.05 + t * TALL, 0)); // a gentle curl
      widths.push(0.03 + 0.8 * Math.sin(Math.min(1, t * 1.2) * Math.PI / 2) ** 0.7 * (t > 0.9 ? Math.sqrt(1 - ((t - 0.9) / 0.1) ** 2 * 0.85) : 1)); // thin tip, rounded shoulders
    }
    const pod = MeshBuilder.CreateTube('chile', { path, radiusFunction: (i) => widths[i], tessellation: 14, cap: Mesh.CAP_ALL }, scene);
    pod.material = mat(scene, 'chile', '#4f9a22', 0.3);
    put(pod, chiles);
    const top = path[path.length - 1];
    const stem = MeshBuilder.CreateCylinder('chileStem', { diameterTop: 0.16, diameterBottom: 0.34, height: 0.9, tessellation: 8 }, scene);
    stem.rotation.z = -0.5;
    stem.position.set(top.x + 0.2, top.y + 0.35, 0);
    stem.bakeCurrentTransformIntoVertices();
    stem.material = mat(scene, 'chileStem', '#2f5d1c', 0.7);
    put(stem, chiles);
  }

  // Del's frozen lemonade: a paper cup of yellow slush, with a lemon slice on the rim
  const cups = spots('lemonade');
  if (cups.length) {
    const label = new DynamicTexture('dels', { width: 1024, height: 512 }, scene, true);
    const g = label.getContext();
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, 1024, 512);
    g.fillStyle = '#1f8a4c';
    g.fillRect(0, 0, 1024, 70);
    g.fillRect(0, 442, 1024, 70);
    g.textAlign = 'center';
    for (const x of [256, 768]) { // once on each side of the cup
      g.fillStyle = '#ffd60a';
      g.beginPath();
      g.ellipse(x, 256, 200, 150, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#1f8a4c';
      g.font = 'italic bold 170px Georgia, serif';
      g.fillText("Del's", x, 300);
      g.font = 'bold 44px system-ui, sans-serif';
      g.fillText('LEMONADE', x, 360);
    }
    label.update();
    const white = new Vector4(0, 0.9, 0.01, 0.91); // the ends of the cup take a plain bit of the label
    const cup = MeshBuilder.CreateCylinder('cup', { diameterTop: 2.5, diameterBottom: 1.7, height: 3.2, tessellation: 28, faceUV: [white, new Vector4(1, 0, 0, 1), white] }, scene);
    cup.position.y = 1.6;
    cup.bakeCurrentTransformIntoVertices();
    cup.material = mat(scene, 'cup', '#ffffff', 0.6);
    cup.material.albedoTexture = label;
    put(cup, cups);
    const slush = MeshBuilder.CreateSphere('slush', { diameterX: 2.4, diameterY: 1.5, diameterZ: 2.4, segments: 12 }, scene);
    slush.position.y = 3.2;
    slush.bakeCurrentTransformIntoVertices();
    slush.material = mat(scene, 'slush', '#ffe45c', 0.5);
    put(slush, cups);
    const lemon = MeshBuilder.CreateCylinder('lemon', { diameter: 1.5, height: 0.22, tessellation: 20 }, scene);
    lemon.rotation.x = Math.PI / 2; // stand it on edge, sitting on the rim
    lemon.position.set(1.05, 3.6, 0);
    lemon.bakeCurrentTransformIntoVertices();
    lemon.material = mat(scene, 'lemon', '#ffd60a', 0.5);
    put(lemon, cups);
  }
}

// A jump: a striped ramp across the road, then a dug-up trench with pipes in it, fenced with barriers.
function jump(scene, s, def, props, shadows) {
  const half = def.width / 2 + 1;
  const at = (across, along, y) => [s.x + s.rx * across + s.tx * along, y, s.z + s.rz * across + s.tz * along];
  // wedge: flat at the back, RAMP_HEIGHT tall at the lip. Corners: 0-3 on the ground, 4-5 the top edge.
  const c = [at(-half, -RAMP_LENGTH, 0.02), at(half, -RAMP_LENGTH, 0.02), at(-half, 0, 0.02), at(half, 0, 0.02), at(-half, 0, RAMP_HEIGHT), at(half, 0, RAMP_HEIGHT)];
  const stripes = new DynamicTexture('hazard', { width: 128, height: 128 }, scene, true);
  const g = stripes.getContext();
  g.fillStyle = '#f2b705';
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#1b1b1b';
  for (let k = -128; k < 256; k += 64) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k + 32, 0); g.lineTo(k + 160, 128); g.lineTo(k + 128, 128); g.fill(); }
  stripes.update();
  const face = (name, corners, uvs, material) => {
    const m = new Mesh(name, scene), vd = new VertexData();
    vd.positions = corners.flat();
    vd.indices = corners.length === 4 ? [0, 1, 2, 2, 1, 3] : [0, 1, 2];
    vd.uvs = uvs;
    vd.normals = [];
    VertexData.ComputeNormals(vd.positions, vd.indices, vd.normals);
    vd.applyToMesh(m);
    material.backFaceCulling = false;
    m.material = material;
    m.receiveShadows = true;
    shadows.addShadowCaster(m, false);
  };
  const top = mat(scene, 'rampTop', '#ffffff', 0.7);
  top.albedoTexture = stripes;
  const reps = (half * 2) / 3;
  face('rampTop', [c[0], c[1], c[4], c[5]], [0, 0, reps, 0, 0, RAMP_LENGTH / 3, reps, RAMP_LENGTH / 3], top);
  const side = mat(scene, 'rampSide', '#3a3d42', 0.8);
  face('rampBack', [c[2], c[3], c[4], c[5]], [0, 0, 1, 0, 0, 1, 1, 1], side);
  face('rampLeft', [c[0], c[2], c[4]], [0, 0, 1, 0, 1, 1], side);
  face('rampRight', [c[1], c[3], c[5]], [0, 0, 1, 0, 1, 1], side);

  // the trench: churned-up dirt with big concrete pipes lying across it
  const dirt = mat(scene, 'trench', '#ffffff', 1);
  dirt.albedoTexture = tiled(scene, 'sand_diff.jpg', (half * 2) / GRASS_TILE, GAP_LENGTH / GRASS_TILE);
  dirt.albedoColor = new Color3(0.5, 0.36, 0.24);
  face('trench', [at(-half, 0.3, 0.045), at(half, 0.3, 0.045), at(-half, GAP_LENGTH, 0.045), at(half, GAP_LENGTH, 0.045)], [0, 0, 1, 0, 0, 1, 1, 1], dirt);
  const pipe = MeshBuilder.CreateCylinder('pipe', { diameter: 1.3, height: def.width * 0.8, tessellation: 14 }, scene);
  pipe.rotation.z = Math.PI / 2; // lay it on its side, across the road
  pipe.bakeCurrentTransformIntoVertices();
  pipe.material = mat(scene, 'pipe', '#9a9c9e', 0.85);
  place(pipe, [5, 10.5, 16].map((d, k) => [...at(k === 1 ? 1.2 : -0.8, d, 0.65), s.heading]));
  shadows.addShadowCaster(pipe, false);

  for (const sideOf of [-1, 1]) {
    const edge = sideOf * (half + 1.2);
    for (let d = 1; d < GAP_LENGTH; d += 2.4) { const [x, , z] = at(edge, d, 0); props.add('construction-barrier', x, z, s.heading, 1.15); }
    for (const d of [-RAMP_LENGTH - 14, -RAMP_LENGTH - 8, -RAMP_LENGTH - 2]) { const [x, , z] = at(edge, d, 0); props.add('construction-cone', x, z, 0, 0.9); }
    const [lx, , lz] = at(edge, 0, 0), [wx, , wz] = at(sideOf * (half + 3), -RAMP_LENGTH - 45, 0);
    props.add('construction-light', lx, lz, s.heading, 2.2);
    props.add('road-sign-warning', wx, wz, s.heading + Math.PI / 2, 3.4);
  }
}

// A tower crane whose arm swings slowly round.
function crane(scene, x, z, phase, shadows) {
  const yellow = mat(scene, 'crane', '#f2b705', 0.5), dark = mat(scene, 'craneDark', '#2b2f38', 0.6);
  const TALL = 44;
  const box = (w, h, d, px, py, pz, material, parent) => {
    const m = MeshBuilder.CreateBox('crane', { width: w, height: h, depth: d }, scene);
    m.position.set(px, py, pz);
    m.material = material;
    if (parent) m.parent = parent;
    shadows.addShadowCaster(m, false);
    return m;
  };
  box(5, 1, 5, x, 0.5, z, dark); // concrete foot
  box(1.8, TALL, 1.8, x, TALL / 2, z, yellow); // mast
  const top = new TransformNode('craneTop', scene);
  top.position.set(x, TALL, z);
  box(1.4, 1.4, 40, 0, 0.7, 16, yellow, top); // long arm
  box(1.4, 1.4, 12, 0, 0.7, -10, yellow, top); // short arm
  box(3, 2.4, 3.5, 0, -0.2, -14, dark, top); // counterweight
  box(2.2, 2.2, 2.4, 1.9, -1.2, 1, dark, top); // cab
  box(0.6, 9, 0.6, 0, 5, 0, yellow, top); // tower peak
  box(0.15, 20, 0.15, 0, -10, 28, dark, top); // cable
  box(1.4, 1.4, 1.4, 0, -20.5, 28, yellow, top); // load
  scene.onBeforeRenderObservable.add(() => { top.rotation.y = phase + performance.now() / 14000; });
}

// The steel skeleton of a building going up. Returns box placements [x, y, z, yaw, sx, sy, sz] for place().
function steelFrame(x, z, floors, yaw) {
  const out = [], SPAN = 8, HIGH = 4.2, T = 0.45;
  const at = (lx, lz) => [x + Math.cos(yaw) * lx + Math.sin(yaw) * lz, z - Math.sin(yaw) * lx + Math.cos(yaw) * lz];
  for (let i = -1; i <= 1; i++) for (let k = -1; k <= 1; k++) {
    const [px, pz] = at(i * SPAN, k * SPAN);
    out.push([px, (floors * HIGH) / 2, pz, yaw, T, floors * HIGH, T]); // column
    for (let f = 1; f <= floors; f++) {
      if (i < 1) { const [bx, bz] = at(i * SPAN + SPAN / 2, k * SPAN); out.push([bx, f * HIGH, bz, yaw, SPAN, T, T]); }
      if (k < 1) { const [bx, bz] = at(i * SPAN, k * SPAN + SPAN / 2); out.push([bx, f * HIGH, bz, yaw, T, T, SPAN]); }
    }
  }
  return out;
}

// A lava jump: a rock ramp, then a river of lava flowing across the road.
function lavaJump(scene, s, def, lava, shadows) {
  const half = def.width / 2 + 1;
  const at = (across, along, y) => [s.x + s.rx * across + s.tx * along, y, s.z + s.rz * across + s.tz * along];
  // corners go [left-near, right-near, left-far, right-far]; wide x long is its size in meters, for the texture
  const quad = (name, corners, material, wide = 1, long = 1) => {
    const m = new Mesh(name, scene), vd = new VertexData();
    vd.positions = corners.flat();
    vd.indices = corners.length === 4 ? [0, 1, 2, 2, 1, 3] : [0, 1, 2];
    vd.uvs = [0, 0, wide / 9, 0, 0, long / 9, wide / 9, long / 9].slice(0, corners.length * 2);
    vd.normals = [];
    VertexData.ComputeNormals(vd.positions, vd.indices, vd.normals);
    vd.applyToMesh(m);
    material.backFaceCulling = false;
    m.material = material;
    return m;
  };
  const rock = mat(scene, 'lavaRock', '#3b3431', 0.95);
  const c = [at(-half, -RAMP_LENGTH, 0.02), at(half, -RAMP_LENGTH, 0.02), at(-half, 0, 0.02), at(half, 0, 0.02), at(-half, 0, RAMP_HEIGHT), at(half, 0, RAMP_HEIGHT)];
  for (const m of [quad('rampTop', [c[0], c[1], c[4], c[5]], rock), quad('rampBack', [c[2], c[3], c[4], c[5]], rock), quad('rampL', [c[0], c[2], c[4]], rock), quad('rampR', [c[1], c[3], c[5]], rock)]) {
    m.receiveShadows = true;
    shadows.addShadowCaster(m, false);
  }
  // the lava runs out to both sides (on a lake track it reaches the shore), between banks of cooled, cracked crust
  const far = half + 27;
  const crust = mat(scene, 'lavaCrust', '#ffffff', 0.9);
  crust.albedoTexture = tiled(scene, 'lava_crust.jpg', 1, 1);
  crust.emissiveTexture = crust.albedoTexture;
  crust.emissiveColor = new Color3(1.6, 1.3, 1.1); // the cracks glow
  quad('bank', [at(-far, -2.5, 0.04), at(far, -2.5, 0.04), at(-far, GAP_LENGTH + 2.5, 0.04), at(far, GAP_LENGTH + 2.5, 0.04)], crust, far * 2, GAP_LENGTH + 5);
  quad('lava', [at(-far, 0.3, 0.07), at(far, 0.3, 0.07), at(-far, GAP_LENGTH, 0.07), at(far, GAP_LENGTH, 0.07)], lava, far * 2, GAP_LENGTH);
  // craggy dark rocks along the banks beside the road (the nature kit's rock shapes, all in basalt)
  const spots = {};
  const SHAPES = ['rock_largeD', 'rock_tallF', 'rock_largeA', 'rock_tallA', 'rock_tallC'];
  for (const sideOf of [-1, 1]) [-3, 2, 7, 12, 17, 22].forEach((d, k) => {
    const name = SHAPES[(k + (sideOf > 0 ? 2 : 0)) % SHAPES.length];
    const [x, , z] = at(sideOf * (half + 2 + (k % 3) * 0.7), d, 0), tall = 1.6 + ((k * 7) % 5) * 0.45, sz = tall / MODELS[name].height;
    (spots[name] ??= []).push([x, -0.1, z, d * 1.3 + sideOf, sz * 0.75, sz, sz * 0.75]);
  });
  for (const [name, list] of Object.entries(spots)) {
    const m = new Mesh('lavaRock', scene), vd = new VertexData();
    const all = Object.values(MODELS[name].groups);
    vd.positions = all.flatMap((g) => g.pos);
    vd.normals = all.flatMap((g) => g.nor);
    vd.indices = Array.from({ length: vd.positions.length / 3 }, (_, i) => i);
    vd.applyToMesh(m);
    m.material = rock;
    place(m, list);
    shadows.addShadowCaster(m, false);
  }
}

// A volcano on the horizon: craggy ridged slopes, a glowing crater, rivers of lava winding down the side
// that faces the track, and smoke drifting up.
function volcano(scene, { x, z, height = 135, width = 300 }, lava) {
  const RINGS = 18, SEGS = 40, rand = rng(9);
  const jitter = Array.from({ length: (RINGS + 1) * SEGS }, () => rand());
  // how far out the slope is at height t (0 = foot, 1 = rim) in direction a: a wide skirt steepening
  // towards the top, with ridges and gullies running down it
  const reach = (t, a) => (width / 2) * (0.12 + 0.88 * Math.pow(1 - t, 1.75))
    * (1 + 0.11 * Math.sin(a * 7 + 1) * (1 - t * 0.6) + 0.05 * Math.sin(a * 15 + 2) + 0.04 * Math.sin(a * 3));
  const haze = Color3.FromHexString(HAZE).toLinearSpace();
  const shade = (t) => {
    const foot = Color3.FromHexString('#5b5a3c').toLinearSpace(), mid = Color3.FromHexString('#3d3531').toLinearSpace(), top = Color3.FromHexString('#56261c').toLinearSpace();
    const c = t < 0.35 ? Color3.Lerp(foot, mid, t / 0.35) : Color3.Lerp(mid, top, Math.pow((t - 0.35) / 0.65, 2.5));
    return Color3.Lerp(c, haze, 0.3 * (1 - t)); // the foot fades into the distance haze
  };
  const positions = [], colors = [], indices = [];
  for (let r = 0; r <= RINGS; r++) {
    const t = r / RINGS;
    for (let k = 0; k <= SEGS; k++) {
      const a = (k / SEGS) * Math.PI * 2, j = jitter[r * SEGS + (k % SEGS)];
      const out = reach(t, a) * (1 + (j - 0.5) * 0.1), c = shade(t).scale(0.85 + j * 0.3);
      positions.push(x + Math.sin(a) * out, height * t + (r === RINGS ? j * 9 : (j - 0.5) * 4) - 2, z + Math.cos(a) * out);
      colors.push(c.r, c.g, c.b, 1);
      if (r < RINGS && k < SEGS) {
        const i = r * (SEGS + 1) + k;
        indices.push(i, i + 1, i + SEGS + 1, i + 1, i + SEGS + 2, i + SEGS + 1);
      }
    }
  }
  const cone = new Mesh('volcano', scene), vd = new VertexData();
  Object.assign(vd, { positions, colors, indices });
  vd.normals = [];
  VertexData.ComputeNormals(positions, indices, vd.normals);
  vd.applyToMesh(cone);
  cone.convertToFlatShadedMesh(); // hard facets, so it reads as rock
  cone.material = mat(scene, 'volcano', '#ffffff', 1);
  cone.material.backFaceCulling = false;
  cone.material.fogEnabled = false; // it is far away; the haze is painted into its colours instead
  cone.isPickable = false;

  // a strip of lava lying on the mountain. path gives [t, direction, width] down its length.
  const ribbon = (name, path) => {
    const P = [], U = [], I = [];
    path.forEach(([t, a, w], i) => {
      const out = reach(t, a) + 2.5, turn = w / 2 / Math.max(20, out);
      for (const side of [-1, 1]) {
        P.push(x + Math.sin(a + side * turn) * out, height * t - 0.5, z + Math.cos(a + side * turn) * out);
        U.push(i * 0.5, side > 0 ? w / 14 : 0);
      }
      if (i) I.push(i * 2 - 2, i * 2 - 1, i * 2, i * 2 - 1, i * 2 + 1, i * 2);
    });
    const m = new Mesh(name, scene), v = new VertexData();
    Object.assign(v, { positions: P, uvs: U, indices: I });
    v.normals = [];
    VertexData.ComputeNormals(P, I, v.normals);
    v.applyToMesh(m);
    m.material = lava;
    m.isPickable = false;
  };
  const toTrack = Math.atan2(-x, -z);
  for (const [turn, end, phase] of [[-0.55, 0.3, 0], [-0.08, 0.12, 2], [0.4, 0.42, 4], [0.9, 0.55, 1]]) {
    const path = [];
    for (let t = 1; t >= end; t -= 0.045) path.push([t, toTrack + turn + 0.1 * Math.sin(t * 11 + phase) * (1 - t), 5 + (1 - t) * 14]); // winds, and spreads lower down
    ribbon('lavaStream', path);
  }
  // the crater: a pool of lava just inside the rim
  const crater = MeshBuilder.CreateDisc('crater', { radius: width * 0.07, tessellation: 20 }, scene);
  crater.rotation.x = Math.PI / 2;
  crater.position.set(x, height - 4, z);
  crater.material = lava;

  // smoke: soft grey puffs that swell and thin out as they climb and drift
  const puff = MeshBuilder.CreateSphere('smoke', { diameter: 1, segments: 6 }, scene);
  puff.isVisible = false;
  const puffs = Array.from({ length: 12 }, (_, k) => {
    const sm = new StandardMaterial('smoke', scene);
    sm.disableLighting = true;
    sm.fogEnabled = false;
    const grey = 0.28 + (k % 4) * 0.07;
    sm.emissiveColor = new Color3(grey, grey * 0.97, grey * 0.95);
    const p = puff.clone('puff');
    p.isVisible = true;
    p.material = sm;
    p.isPickable = false;
    return { p, sm, k };
  });
  scene.onBeforeRenderObservable.add(() => {
    const t = performance.now() / 1000;
    for (const { p, sm, k } of puffs) {
      const life = (t * 0.05 + k / puffs.length) % 1; // 0 = just out of the crater, 1 = drifted away
      p.position.set(x + life * life * 90 + Math.sin(k * 2.3 + t * 0.2) * 9, height + 4 + life * 130, z + Math.cos(k * 1.7) * 10);
      p.scaling.set(22 + life * 70, 18 + life * 50, 22 + life * 70);
      sm.alpha = 0.8 * (1 - life) * Math.min(1, life * 8);
    }
  });
}

const BALLOON_COLORS = [['#e63946', '#ffd60a'], ['#2f6fed', '#ffffff'], ['#ff8c1a', '#8e44ec'], ['#2fbf71', '#ffd60a'], ['#ff5fa2', '#ffffff'], ['#00a6c7', '#ff8c1a']];
// outline of a balloon from the mouth up to the crown: [radius, height], in balloon-radius units
const BALLOON_SHAPE = [[0.16, 0], [0.45, 0.35], [0.8, 0.8], [0.98, 1.25], [1, 1.5], [0.93, 1.8], [0.75, 2.05], [0.45, 2.25], [0, 2.35]];

// A striped hot air balloon with a basket. Returns the node to move around.
function balloon(scene, radius, [hexA, hexB]) {
  const node = new TransformNode('balloon', scene);
  const shape = BALLOON_SHAPE.map(([r, y]) => new Vector3(r * radius, y * radius, 0));
  const stripes = [[], []];
  for (let k = 0; k < 8; k++) {
    const wedge = MeshBuilder.CreateLathe('wedge', { shape, arc: 1 / 8, tessellation: 3, sideOrientation: Mesh.DOUBLESIDE }, scene);
    wedge.rotation.y = (k / 8) * Math.PI * 2;
    stripes[k % 2].push(wedge);
  }
  [hexA, hexB].forEach((hex, k) => {
    const half = Mesh.MergeMeshes(stripes[k], true);
    half.material = mat(scene, 'balloon', hex, 0.7);
    half.material.fogEnabled = false; // keep the colours bright even when far away
    half.parent = node;
  });
  const basket = MeshBuilder.CreateBox('basket', { width: radius * 0.24, height: radius * 0.2, depth: radius * 0.24 }, scene);
  basket.material = mat(scene, 'basket', '#7a5230', 0.9);
  basket.position.y = -radius * 0.28;
  basket.parent = node;
  return node;
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
  HAZE = def.sky?.haze ?? HORIZON;

  // Most tracks are a single "land". A road-trip track is split into several (see lands in data.js),
  // each covering a rectangle of the map with its own ground, plants, hills and extras.
  const lands = (def.lands ?? [def]).map((l) => ({ ...l, area: l.area ?? [-700, 700, -700, 700] }));
  const landAt = (x, z) => lands.find(({ area: [x0, x1, z0, z1] }) => x >= x0 && x < x1 && z >= z0 && z < z1) ?? lands[0];
  const sea = def.ocean; // { x: where the beach starts, side: -1 west / +1 east }
  const inSea = (x, pad = 0) => sea && (x - sea.x) * sea.side > -pad;

  for (const land of lands) {
    const [x0, x1, z0, z1] = land.area, wide = x1 - x0, deep = z1 - z0;
    const ground = MeshBuilder.CreateGround('ground', { width: wide, height: deep }, scene);
    ground.position.set((x0 + x1) / 2, 0, (z0 + z1) / 2);
    const gm = mat(scene, 'ground', '#ffffff', 1);
    const surface = land.surface ?? 'grass';
    if (surface !== 'snow') gm.albedoTexture = tiled(scene, surface === 'grass' ? 'grass_diff.jpg' : 'sand_diff.jpg', wide / GRASS_TILE, deep / GRASS_TILE);
    // grass and sand keep their own shade by tinting the photo; snow is plain blue-white
    const tint = Color3.FromHexString(land.ground).toLinearSpace();
    gm.albedoColor = surface === 'snow' ? new Color3(0.8, 0.87, 0.97)
      : surface === 'sand' ? Color3.Lerp(Color3.White(), tint, 0.55).scale(1.25)
      : Color3.Lerp(Color3.White(), tint, land.groundMix ?? 0.3).scale(0.8); // groundMix: how strongly the grass takes the colour
    gm.specularIntensity = 0.3;
    ground.material = gm;
    ground.receiveShadows = true;
  }

  // Seaside: a strip of beach, then water out to the horizon
  if (sea) {
    const strip = (name, from, to, y, material) => {
      const m = MeshBuilder.CreateGround(name, { width: Math.abs(to - from), height: 1400 }, scene);
      m.position.set((from + to) / 2, y, 0);
      m.material = material;
      m.receiveShadows = true;
    };
    const beach = mat(scene, 'beach', '#ffffff', 1);
    beach.albedoTexture = tiled(scene, 'sand_diff.jpg', 40 / GRASS_TILE, 1400 / GRASS_TILE);
    beach.albedoColor = new Color3(1.25, 1.2, 1.05);
    strip('beach', sea.x, sea.x + sea.side * 40, 0.03, beach);
    strip('sea', sea.x + sea.side * 30, sea.side * 700, 0.06, mat(scene, 'water', '#17607a', 0.05));
  }

  // a patch of earth and roots round each tree that grows in the road
  const roadTrees = (track.obstacles ?? []).filter((o) => o.kind === 'tree');
  if (roadTrees.length) {
    const roots = MeshBuilder.CreateDisc('roots', { radius: 1, tessellation: 18 }, scene);
    roots.rotation.x = Math.PI / 2;
    roots.bakeCurrentTransformIntoVertices();
    roots.material = mat(scene, 'roots', '#5b4128', 1);
    roots.material.backFaceCulling = false;
    place(roots, roadTrees.map((o) => [o.x, 0.05, o.z, 0, 2.2, 1, 2.2]));
    roots.receiveShadows = true;
  }

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

  // Jumps (see addJumps in physics.js) and the building site around them
  const props = propSet(scene, shadows);
  const movers = (track.obstacles ?? []).filter((o) => o.machine); // machines driving across the road
  const built = []; // [x, z, radius] of things the plants must keep clear of
  // glowing lava (shared by lava jumps and the volcano); it pulses, so it is left out of the freeze below
  const lava = mat(scene, 'lava', '#1a0500', 0.9);
  lava.emissiveTexture = tiled(scene, 'lava.jpg', 1, 1);
  lava.backFaceCulling = false;
  lava.fogEnabled = false;
  const glow = () => {
    const t = performance.now() / 1000;
    lava.emissiveColor.setAll(1.5 + Math.sin(t * 2) * 0.2); // pulses...
    lava.emissiveTexture.uOffset = t * 0.03; // ...and flows
  };
  glow();
  for (const j of track.jumps ?? []) {
    const s = samples[j.idx];
    if (def.jumpStyle === 'lava') {
      lavaJump(scene, s, def, lava, shadows);
      // nothing grows along the lava
      for (let side = -35; side <= 35; side += 10) built.push([s.x + s.rx * side + s.tx * 10, s.z + s.rz * side + s.tz * 10, 16]);
    } else jump(scene, s, def, props, shadows);
  }
  if (def.volcano) {
    volcano(scene, def.volcano, lava);
    built.push([def.volcano.x, def.volcano.z, (def.volcano.width ?? 270) / 2 + 6]);
  }
  if (def.jumpStyle === 'lava' || def.volcano) scene.onBeforeRenderObservable.add(glow);
  if (def.site) {
    def.site.cranes.forEach(([x, z], k) => { crane(scene, x, z, k * 2.1, shadows); built.push([x, z, 8]); });
    const steel = MeshBuilder.CreateBox('steel', { size: 1 }, scene);
    steel.material = mat(scene, 'steel', '#b24a2e', 0.6, 0.3);
    place(steel, def.site.frames.flatMap(([x, z, floors], k) => { built.push([x, z, 18]); return steelFrame(x, z, floors, k * 0.5); }));
    shadows.addShadowCaster(steel, false);

    const siteRand = rng(77);
    const near = (i, idx, far) => Math.abs(((i - idx + count * 1.5) % count) - count / 2) < far; // samples i and idx are close together
    const nearJump = (i) => (track.jumps ?? []).some((j) => near(i, j.idx, 45));
    const nearMover = (i) => movers.some((o) => near(i, o.idx, 5)); // where a machine drives across
    // parked machines and stacks of crates beside the road
    for (let n = 0; n < 14; n++) {
      const i = Math.floor(((n + siteRand()) / 14) * count), s = samples[i];
      const off = (n % 2 ? 1 : -1) * (hw + 11 + siteRand() * 12), x = s.x + s.rx * off, z = s.z + s.rz * off;
      const name = Object.keys(MACHINES)[n % 4];
      if (nearMover(i)) continue;
      props.add(name, x, z, s.heading + (siteRand() - 0.5) * 2.4, MACHINES[name].tall);
      built.push([x, z, 7]);
    }
    for (let n = 0; n < 26; n++) {
      const i = Math.floor(siteRand() * count), s = samples[i];
      const off = (siteRand() < 0.5 ? 1 : -1) * (hw + 5 + siteRand() * 6), x = s.x + s.rx * off, z = s.z + s.rz * off, yaw = siteRand() * 6.28;
      if (nearMover(i)) continue;
      props.add('box', x, z, yaw, 1.3);
      if (n % 2) props.add('box', x + 0.2, z + 0.1, yaw + 0.5, 1.3, 1.3);
      if (n % 3 === 0) props.add('box', x + 1.5, z + 0.3, yaw + 1, 1.3);
    }
    // runs of site fencing along the outside of the road, and cones round the bends
    samples.forEach((s, i) => {
      if (nearJump(i) || nearMover(i)) return;
      if (i % 2 === 0 && Math.floor(i / 40) % 3 === 0) props.add('construction-fence', s.x - s.rx * (hw + 4.5), s.z - s.rz * (hw + 4.5), s.heading, 2.1);
      if (i % 3 === 0 && s.curve > 0.5) props.add('construction-cone', s.x + s.rx * (hw + 1.6), s.z + s.rz * (hw + 1.6), 0, 0.9);
    });
  }
  // a row of cones on each side of the road, leading up to where a machine drives across
  for (const o of movers) {
    for (const back of [16, 11, 6]) {
      const s = samples[(o.idx - back + count) % count];
      for (const side of [-1, 1]) props.add('construction-cone', s.x + s.rx * side * (hw + 1.6), s.z + s.rz * side * (hw + 1.6), 0, 0.9);
    }
    built.push([samples[o.idx].x, samples[o.idx].z, hw + 12]); // keep its path clear of trees and rocks
  }
  props.build();
  movingMachines(scene, movers, track, props.material, shadows);
  roadItems(scene, (track.obstacles ?? []).filter((o) => !o.cross && o.kind !== 'tree'), shadows);

  // Animals beside the road (how many of each kind is set per track in data.js)
  const crossers = (track.obstacles ?? []).filter((o) => o.cross && !o.machine);
  if (def.animals || crossers.length) {
    const wild = rng(404), list = [];
    // the ones that walk across the road follow their obstacle (see addCrossers in physics.js)
    for (const o of crossers) list.push({ kind: o.kind, x: o.x, z: o.z, yaw: o.facing, crossing: o });
    // some stand exactly where the track says (a long-neck out in the lake, say)
    for (const a of def.animalsAt ?? []) { list.push(a); built.push([a.x, a.z, 8]); }
    for (const [kind, howMany] of Object.entries(def.animals ?? {})) {
      if (kind === 'birds' || kind === 'pterosaurs') continue;
      for (let n = 0, tries = 0; n < howMany && tries < howMany * 30; tries++) {
        const s = samples[Math.floor(wild() * count)], off = (wild() < 0.5 ? 1 : -1) * (hw + 9 + wild() * 24);
        const x = s.x + s.rx * off, z = s.z + s.rz * off;
        if (built.some(([bx, bz, r]) => Math.hypot(x - bx, z - bz) < r + 3)) continue;
        if (lake?.covers(x, z, 13) || inSea(x, 13)) continue; // not in the water, with room to wander
        if (Math.min(...samples.filter((_, i) => i % 3 === 0).map((p) => Math.hypot(p.x - x, p.z - z))) < hw + 8) continue; // too near another bit of road
        // most of them stand watching the road
        list.push({ kind, x, z, yaw: Math.atan2(s.x - x, s.z - z) + (wild() - 0.5) * 1.6 });
        built.push([x, z, 5]);
        n++;
      }
    }
    addAnimals(scene, shadows, list, def.animals?.birds ?? def.animals?.pterosaurs, def.animals?.pterosaurs ? 'pterosaurs' : 'birds');
  }

  // Trees, bushes and rocks scattered away from the road
  const rand = rng(1234);
  const roadGap = (x, z) => {
    let near = Infinity;
    for (let i = 0; i < count; i += 3) near = Math.min(near, Math.hypot(samples[i].x - x, samples[i].z - z));
    return near - hw;
  };
  const clearings = [...built, ...lands.filter((l) => l.axolotl).map((l) => [l.axolotl.x, l.axolotl.z, 6 * (l.axolotl.size ?? 2)])];
  lands.forEach((land, k) => {
    // the part of this land that is close enough to the track to be worth planting
    const [x0, x1, z0, z1] = [Math.max(land.area[0], -360), Math.min(land.area[1], 360), Math.max(land.area[2], -300), Math.min(land.area[3], 300)];
    const share = ((x1 - x0) * (z1 - z0)) / (720 * 600);
    const spots = {}; // model name -> where its copies go
    // trees growing right in the road (see addObstacles in physics.js): big ones, so they are easy to spot
    if (k === 0) {
      for (const o of roadTrees) {
        const name = land.scenery.trees[0], s = 11 / MODELS[name].height;
        (spots[name] ??= []).push([o.x, 0, o.z, o.idx, s * 1.25, s, s * 1.25]);
      }
    }
    const scatter = (names, howMany, gap, sizeFor) => {
      for (let n = 0, tries = 0; n < howMany && tries < howMany * 20; tries++) {
        const x = x0 + rand() * (x1 - x0), z = z0 + rand() * (z1 - z0);
        if (inSea(x, 8) || roadGap(x, z) < gap || lake?.covers(x, z, 7)) continue;
        if (clearings.some(([cx, cz, r]) => Math.hypot(x - cx, z - cz) < r)) continue;
        const name = names[Math.floor(rand() * names.length)];
        const s = sizeFor() / MODELS[name].height;
        (spots[name] ??= []).push([x, 0, z, rand() * 6.28, s, s * (0.9 + rand() * 0.25), s]);
        n++;
      }
    };
    const [small, tall] = land.scenery.treeSize ?? [7, 14]; // meters
    scatter(land.scenery.trees, land.scenery.treeCount ?? Math.round(360 * share), land.scenery.treeGap ?? 14, () => small + rand() * (tall - small));
    scatter(land.scenery.small, land.scenery.smallCount ?? Math.round(200 * share), 9, () => 0.8 + rand() * 1.6); // bushes and rocks

    const colors = { ...SCENERY_COLORS, ...land.colors }, mats = {};
    for (const [name, list] of Object.entries(spots)) {
      for (const [kind, g] of Object.entries(MODELS[name].groups)) {
        const m = new Mesh(`${name}-${kind}`, scene);
        const vd = new VertexData();
        vd.positions = g.pos;
        vd.normals = g.nor;
        vd.indices = Array.from({ length: g.pos.length / 3 }, (_, i) => i);
        vd.applyToMesh(m);
        m.material = mats[kind] ??= mat(scene, kind, colors[kind], 0.9);
        place(m, list);
        shadows.addShadowCaster(m, false);
      }
    }

    // Hot air balloons hanging in the sky, bobbing gently
    for (let b = 0; b < (land.balloons ?? 0); b++) {
      const node = balloon(scene, 6 + rand() * 4, BALLOON_COLORS[(b + k) % BALLOON_COLORS.length]);
      const x = x0 + 30 + rand() * (x1 - x0 - 90), z = z0 + 30 + rand() * (z1 - z0 - 60), y = 28 + rand() * 50, phase = rand() * 6.28;
      node.position.set(x, y, z);
      scene.onBeforeRenderObservable.add(() => {
        const t = performance.now() / 1000;
        node.position.y = y + Math.sin(t * 0.35 + phase) * 3;
        node.rotation.y = t * 0.05 + phase;
      });
    }

    // Snowmen standing beside the road, watching the cars come
    if (land.snowmen) {
      const here = samples.filter((s) => landAt(s.x, s.z) === land), list = [];
      for (let n = 0; n < land.snowmen && here.length; n++) {
        const s = here[Math.floor(((n + 0.5) / land.snowmen) * here.length)], off = (n % 2 ? 1 : -1) * (hw + 5 + rand() * 4);
        list.push([s.x + s.rx * off, s.z + s.rz * off, s.heading + Math.PI + (n % 2 ? 0.5 : -0.5)]);
      }
      snowmen(scene, list, shadows);
    }

    if (land.axolotl) axolotl(scene, land.axolotl, shadows);
  });
  for (const m of [post, banner]) shadows.addShadowCaster(m, false);

  // Signs where the road crosses from one named land into another
  samples.forEach((s, i) => {
    const next = samples[(i + 1) % count], from = landAt(s.x, s.z), to = landAt(next.x, next.z);
    if (to.name && from.name !== to.name) stateSign(scene, next, hw, to, shadows);
  });

  hills(scene, rand, 640, 45, 120, 0, landAt);
  hills(scene, rand, 480, 12, 55, 1, landAt);

  for (const m of scene.materials) if (m.name !== 'lava') m.freeze();
}
