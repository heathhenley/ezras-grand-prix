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
import { RAMP_LENGTH, RAMP_HEIGHT, GAP_LENGTH, WALL_MARGIN } from './physics.js';
import { MACHINES } from './data.js';
import { addAnimals } from './animals.js';
import { buildVenue, NEAR_RANGE } from './venue.js';
import { roadField, makeTerrain, themeOf, cullByDistance, spotGrid, SAFE, CHUNK } from './roadside.js';
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
    // blend the lands on either side, so there is no hard seam where one meets the next
    let mesa = 0;
    const top = new Color3(0, 0, 0), K = 8;
    for (let k = -K; k <= K; k++) {
      const b = a + k * 0.02, land = landAt(Math.sin(b) * radius, Math.cos(b) * radius);
      mesa += land.mesas ? 1 / (2 * K + 1) : 0;
      top.addInPlace(Color3.FromHexString((land.hills ?? HILL_COLORS)[layer]).scale(1 / (2 * K + 1)));
    }
    let h = 0;
    for (const [n, phase, amp] of waves) h += Math.sin(a * n + phase) * amp;
    let t = Math.max(0, Math.min(1, 0.5 + h * 0.3));
    // desert: low flat-topped steps (the big 3D buttes nearer in do the showing off)
    if (mesa) t = t * (1 - mesa) + (t > 0.58 ? 0.45 : t > 0.42 ? 0.28 : 0.1) * mesa;
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
  const y0 = s.y ?? 0; // the road's height there
  face.position.set(s.x, y0 + up, s.z);
  face.rotation.y = s.heading;
  // plain backing just behind the face, so the sign is not see-through from the other side
  const back = MeshBuilder.CreateBox('signBack', { width: W + 0.3, height: H + 0.3, depth: 0.25 }, scene);
  back.material = mat(scene, 'signBack', '#1d6b45', 0.6);
  back.position.set(s.x + s.tx * 0.14, y0 + up, s.z + s.tz * 0.14);
  back.rotation.y = s.heading;
  const post = MeshBuilder.CreateBox('signPost', { width: 0.45, height: up + H / 2, depth: 0.45 }, scene);
  post.material = mat(scene, 'signPost', '#6f757d', 0.4, 0.8);
  place(post, [-1, 1].map((side) => [s.x + s.rx * side * (hw + 2.2) + s.tx * 0.14, y0 + (up + H / 2) / 2 - 0.5, s.z + s.rz * side * (hw + 2.2) + s.tz * 0.14, s.heading]));
  for (const m of [back, post]) shadows.addShadowCaster(m, false);
}

// Snowmen: three snowballs, coal eyes and a carrot nose. spots is a list of [x, z, yaw].
function snowmen(scene, spots, shadows, ground = () => 0) {
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
    const g = ground(x, z) - 0.1; // standing on the ground, hills and all
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    balls.push([x, g + 1.0, z, yaw, 2.3, 2.1, 2.3], [x, g + 2.55, z, yaw, 1.7, 1.6, 1.7], [x, g + 3.75, z, yaw, 1.2, 1.2, 1.2]);
    for (const side of [-1, 1]) coals.push([x + fx * 0.5 + fz * side * 0.22, g + 3.95, z + fz * 0.5 - fx * side * 0.22, yaw]);
    for (const y of [2.3, 2.75]) coals.push([x + fx * 0.82, g + y, z + fz * 0.82, yaw]); // buttons
    noses.push([x + fx * 0.85, g + 3.72, z + fz * 0.85, yaw]);
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
function propSet(scene, shadows, ground = () => 0) {
  const spots = {};
  const material = mat(scene, 'prop', '#ffffff', 0.6); // white, so the per-corner colours show through
  return {
    material,
    add(name, x, z, yaw, tall, y = 0) {
      const s = tall / PROPS[name].height;
      (spots[name] ??= []).push([x, y + ground(x, z), z, yaw, s, s, s]); // y: how far up off the ground
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
      m.position.set(o.x, o.y ?? 0, o.z);
      beacon.position.set(o.x, (o.y ?? 0) + tall + 0.3, o.z);
      beacon.isVisible = (t * 2 + phase) % 1 < 0.5;
    }
  });
}

// Giant things standing in the road on the road trip (the obstacles made by addRoadItems in physics.js).
// items: those obstacles, each with a kind.
function roadItems(scene, items, shadows) {
  const spots = (kind) => items.filter((o) => o.kind === kind).map((o) => [o.x, o.y ?? 0, o.z, o.idx * 1.3]);
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
function jump(scene, s, def, props, shadows, leap = false) {
  const half = def.width / 2 + (leap ? -0.4 : 1); // a leap's kicker fits between the bridge railings
  const at = (across, along, y) => [s.x + s.rx * across + s.tx * along, y + (s.y ?? 0) + (s.grade ?? 0) * along, s.z + s.rz * across + s.tz * along];
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
  if (leap) return; // the open gap and the landing are part of the bridge (see bridges())

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
  const at = (across, along, y) => [s.x + s.rx * across + s.tx * along, y + (s.y ?? 0) + (s.grade ?? 0) * along, s.z + s.rz * across + s.tz * along];
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

// The ground of one land on a hilly track: a grid that is fine near the road (where the hills are) and
// coarse out to the edge of the land, with no cracks between the two (every row and column runs right
// across). terrain is from addElevation in trackmath.js; gy(x, z) reads its heights.
function hillyGround(scene, terrain, [x0, x1, z0, z1], gy) {
  const lines = (lo, hi, t0, n) => {
    const t1 = t0 + (n - 1) * terrain.cell, out = new Set([lo, hi]);
    for (let v = Math.ceil(lo / 100) * 100; v < hi; v += 100) if (v < t0 || v > t1) out.add(v);
    for (let k = 0; k < n; k++) { const v = t0 + k * terrain.cell; if (v > lo && v < hi) out.add(v); }
    return [...out].sort((a, b) => a - b);
  };
  const xs = lines(x0, x1, terrain.x0, terrain.nx), zs = lines(z0, z1, terrain.z0, terrain.nz);
  const positions = [], uvs = [], indices = [], W = xs.length;
  for (const z of zs) for (const x of xs) { positions.push(x, gy(x, z), z); uvs.push((x - x0) / (x1 - x0), (z - z0) / (z1 - z0)); }
  for (let j = 0; j < zs.length - 1; j++) for (let i = 0; i < W - 1; i++) {
    const k = j * W + i;
    indices.push(k, k + 1, k + W, k + 1, k + W + 1, k + W); // wound to face up
  }
  const m = new Mesh('ground', scene), vd = new VertexData();
  Object.assign(vd, { positions, uvs, indices, normals: [] });
  VertexData.ComputeNormals(positions, indices, vd.normals);
  vd.applyToMesh(m);
  m.isPickable = false;
  return m;
}

// Bridges and leaps (marked on the samples by addElevation in trackmath.js): a deck under the road with
// friendly blue sides, white railings with a red top along the edges (and funnelling in to the bridge on
// the way up), and pairs of pillars standing on the ground, kept clear of the road underneath.
function bridges(scene, track, hw, gy, shadows) {
  const { samples, count } = track;
  if (!samples.some((s) => s.bridge || s.gap)) return;
  const P = [], C = [], I = [];
  const col = (hex) => Color3.FromHexString(hex).toLinearSpace();
  const quad = (a, b, c, d, k) => { // corners going round, seen from the front
    const n = P.length / 3;
    P.push(...a, ...b, ...c, ...d);
    for (let i = 0; i < 4; i++) C.push(k.r, k.g, k.b, 1);
    I.push(n, n + 1, n + 2, n, n + 2, n + 3);
  };
  const at = (s, lat, y) => [s.x + s.rx * lat, y, s.z + s.rz * lat];
  const SIDE = col('#2f6fed'), UNDER = col('#9aa3ae'), RAIL = col('#f1f3f6'), TOP = col('#e63946'), DECK = 1.1, EDGE = hw + 1.3;
  const next = (i) => (i + 1) % count;
  for (let i = 0; i < count; i++) {
    const s = samples[i], t = samples[next(i)], y0 = s.y, y1 = t.y;
    // the deck: two blue sides and a grey underside
    if (s.bridge && t.bridge) {
      for (const side of [-1, 1]) {
        const a = at(s, side * EDGE, y0 + 0.01), b = at(t, side * EDGE, y1 + 0.01), c = at(t, side * EDGE, y1 - DECK), d = at(s, side * EDGE, y0 - DECK);
        if (side > 0) quad(a, b, c, d, SIDE); else quad(b, a, d, c, SIDE);
        // the strip of deck between the road edge and the railing
        const e = at(s, side * hw, y0 + 0.019), f = at(t, side * hw, y1 + 0.019);
        if (side > 0) quad(e, f, b, a, UNDER); else quad(f, e, a, b, UNDER);
      }
      quad(at(s, -EDGE, y0 - DECK), at(t, -EDGE, y1 - DECK), at(t, EDGE, y1 - DECK), at(s, EDGE, y0 - DECK), UNDER);
    }
    // the deck ends at the gap of a leap (and wherever a bridge runs into the ground): a square end
    const prev = samples[(i - 1 + count) % count];
    if (s.bridge && (prev.gap || t.gap)) {
      const k = t.gap ? 1 : -1, [x, z] = [s.x + s.tx * k * 1, s.z + s.tz * k * 1], e = { ...s, x, z };
      const a = at(e, -EDGE, y0 + 0.02), b = at(e, EDGE, y0 + 0.02), c = at(e, EDGE, y0 - DECK), d = at(e, -EDGE, y0 - DECK);
      if (k > 0) quad(a, b, c, d, SIDE); else quad(b, a, d, c, SIDE);
      if (k > 0) quad(at(s, -EDGE, y0 + 0.02), at(e, -EDGE, y0 + 0.02), at(e, EDGE, y0 + 0.02), at(s, EDGE, y0 + 0.02), UNDER);
      else quad(at(e, -EDGE, y0 + 0.02), at(s, -EDGE, y0 + 0.02), at(s, EDGE, y0 + 0.02), at(e, EDGE, y0 + 0.02), UNDER);
    }
    // railings: wherever the wall closes in, a low barrier just outside it (none across the gap)
    const railed = (q) => !q.gap && q.wall < hw + WALL_MARGIN - 0.05;
    if (railed(s) && railed(t)) {
      for (const side of [-1, 1]) {
        const li = s.wall + 1, lt = t.wall + 1, H = 0.85, T = 0.5, body = Math.floor(i / 2) % 2 ? TOP : RAIL; // red and white blocks, like the curbs
        const base0 = s.bridge ? y0 : Math.min(y0, gy(...[s.x + s.rx * side * li, s.z + s.rz * side * li])) - 0.3;
        const base1 = t.bridge ? y1 : Math.min(y1, gy(...[t.x + t.rx * side * lt, t.z + t.rz * side * lt])) - 0.3;
        const face = (l0, l1, h0, h1, k, flip) => {
          const a = at(s, side * l0, base0 + h0), b = at(t, side * l1, base1 + h0), c = at(t, side * l1, y1 + h1), d = at(s, side * l0, y0 + h1);
          if ((side > 0) !== flip) quad(d, c, b, a, k); else quad(c, d, a, b, k);
        };
        face(li, lt, 0, H, body, false); // inner face
        face(li + T, lt + T, 0, H, body, true); // outer face
        // top
        const a = at(s, side * li, y0 + H), b = at(t, side * lt, y1 + H), c = at(t, side * (lt + T), y1 + H), d = at(s, side * (li + T), y0 + H);
        if (side > 0) quad(a, b, c, d, body); else quad(b, a, d, c, body);
      }
    }
  }
  const m = new Mesh('bridgeDeck', scene), vd = new VertexData();
  Object.assign(vd, { positions: P, colors: C, indices: I, normals: [] });
  VertexData.ComputeNormals(P, I, vd.normals);
  vd.applyToMesh(m);
  m.material = mat(scene, 'bridge', '#ffffff', 0.7);
  m.material.backFaceCulling = false;
  m.material.twoSidedLighting = true; // lit the same from either side, whichever way each face was wound
  m.receiveShadows = true;
  m.isPickable = false;
  shadows.addShadowCaster(m, false);

  // pillars: a pair under the deck every 12 m, standing on the ground, never in the road below
  const clear = (x, z, i) => samples.every((q, j) => { const d = Math.abs(i - j); return Math.min(d, count - d) < 30 || (q.x - x) ** 2 + (q.z - z) ** 2 > (hw + WALL_MARGIN + 2) ** 2; });
  const legs = [], caps = [];
  for (let i = 0; i < count; i += 6) {
    const s = samples[i];
    if (!s.bridge) continue;
    const feet = [-1, 1].map((side) => [s.x + s.rx * side * (hw - 1.5), s.z + s.rz * side * (hw - 1.5)]);
    if (!feet.every(([x, z]) => clear(x, z, i))) continue;
    const top = s.y - DECK;
    for (const [x, z] of feet) {
      const foot = gy(x, z) - 0.5, tall = top - foot;
      if (tall > 0.8) legs.push([x, foot + tall / 2, z, s.heading, 1, tall, 1]);
    }
    caps.push([s.x, top - 0.35, s.z, s.heading, 2 * hw, 1, 1]);
  }
  const leg = MeshBuilder.CreateCylinder('pillar', { diameter: 1.6, height: 1, tessellation: 12 }, scene);
  leg.material = mat(scene, 'pillar', '#c9ced6', 0.8);
  const cap = MeshBuilder.CreateBox('pillarCap', { width: 1, height: 0.7, depth: 1.6 }, scene);
  cap.material = mat(scene, 'pillarCap', '#ffd23f', 0.6);
  place(leg, legs);
  place(cap, caps);
  for (const p of [leg, cap]) { p.receiveShadows = true; shadows.addShadowCaster(p, false); }
}

function place(mesh, list) {
  // list of [x, y, z, yaw, sx, sy, sz, pitch] (pitch: + tips the nose down, for things lying on a slope)
  const ms = list.map(([x, y, z, yaw, sx = 1, sy = 1, sz = 1, pitch = 0]) =>
    Matrix.Compose(new Vector3(sx, sy, sz), Quaternion.FromEulerAngles(pitch, yaw, 0), new Vector3(x, y, z)));
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

  const groundMat = (land, uScale, vScale) => {
    const gm = mat(scene, 'ground', '#ffffff', 1);
    const surface = land.surface ?? 'grass';
    if (surface !== 'snow') gm.albedoTexture = tiled(scene, surface === 'grass' ? 'grass_diff.jpg' : 'sand_diff.jpg', uScale, vScale);
    // grass and sand keep their own shade by tinting the photo; snow is plain blue-white
    const tint = Color3.FromHexString(land.ground).toLinearSpace();
    gm.albedoColor = surface === 'snow' ? new Color3(0.8, 0.87, 0.97)
      : surface === 'sand' ? Color3.Lerp(Color3.White(), tint, 0.55).scale(1.25)
      : Color3.Lerp(Color3.White(), tint, land.groundMix ?? 0.3).scale(0.8); // groundMix: how strongly the grass takes the colour
    gm.specularIntensity = 0.3;
    return gm;
  };
  const gy = track.groundAt ?? (() => 0); // the height of the ground anywhere (hills round a hilly road)
  for (const land of lands) {
    const [x0, x1, z0, z1] = land.area, wide = x1 - x0, deep = z1 - z0;
    const ground = track.terrain ? hillyGround(scene, track.terrain, land.area, gy) : MeshBuilder.CreateGround('ground', { width: wide, height: deep }, scene);
    if (!track.terrain) ground.position.set((x0 + x1) / 2, 0, (z0 + z1) / 2);
    ground.material = groundMat(land, wide / GRASS_TILE, deep / GRASS_TILE);
    ground.receiveShadows = true;
  }
  // Where two lands meet, fade one ground into the other across a wavy strip, instead of a hard straight edge.
  // Sand spreads over snow and grass, snow over grass.
  const RANK = { grass: 0, snow: 1, sand: 2 };
  for (const A of lands) {
    const [x0, x1, z0, z1] = A.area, WIDE = 30, COLS = 6;
    // each edge: the point at u (0..1) along it, and the direction out of A
    const edges = [[(u) => [x0, z0 + (z1 - z0) * u], [-1, 0]], [(u) => [x1, z0 + (z1 - z0) * u], [1, 0]], [(u) => [x0 + (x1 - x0) * u, z0], [0, -1]], [(u) => [x0 + (x1 - x0) * u, z1], [0, 1]]];
    for (const [edge, [ox, oz]] of edges) {
      const positions = [], colors = [], uvs = [], indices = [];
      const rows = Math.ceil((ox ? z1 - z0 : x1 - x0) / 4);
      let any = false;
      for (let r = 0; r <= rows; r++) {
        const [ex, ez] = edge(r / rows), other = landAt(ex + ox * 2, ez + oz * 2);
        const show = Math.abs(ex) < 600 && Math.abs(ez) < 600 && other !== A && RANK[A.surface ?? 'grass'] > RANK[other.surface ?? 'grass'];
        const along = ox ? ez : ex, wobble = 0.35 * Math.sin(along * 0.045) + 0.2 * Math.sin(along * 0.13 + 1.7);
        any ||= show;
        for (let c = 0; c <= COLS; c++) {
          const d = (c / COLS) * WIDE, x = ex + ox * (d - 3), z = ez + oz * (d - 3);
          positions.push(x, gy(x, z) + 0.012, z);
          uvs.push(x / GRASS_TILE, z / GRASS_TILE);
          colors.push(1, 1, 1, show && c < COLS ? Math.max(0, Math.min(1, 1.15 - (d / WIDE) * 1.6 + wobble)) : 0);
          if (r < rows && c < COLS) { const i = r * (COLS + 1) + c; indices.push(i, i + 1, i + COLS + 1, i + 1, i + COLS + 2, i + COLS + 1); }
        }
      }
      if (!any) continue;
      const strip = new Mesh('landEdge', scene), vd = new VertexData();
      Object.assign(vd, { positions, colors, uvs, indices });
      vd.normals = positions.map((_, i) => (i % 3 === 1 ? 1 : 0)); // straight up, whichever way the edge runs
      vd.applyToMesh(strip);
      const sm = groundMat(A, 1, 1);
      sm.transparencyMode = 2; // alpha blend, using the fade in the vertex colours
      sm.backFaceCulling = false;
      strip.hasVertexAlpha = true;
      strip.material = sm;
      strip.receiveShadows = true;
      strip.isPickable = false;
    }
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
    place(roots, roadTrees.map((o) => [o.x, (o.y ?? 0) + 0.05, o.z, 0, 2.2, 1, 2.2]));
    roots.receiveShadows = true;
  }

  // Road surface: a strip between the left and right edges, with the texture running along it
  const laps = Math.round(track.length / ROAD_TILE); // whole repeats, so there is no seam at the start line
  const positions = [], normals = [], uvs = [], indices = [];
  for (let i = 0; i <= count; i++) {
    const s = samples[i % count];
    const y = (s.y ?? 0) + 0.02;
    positions.push(s.x - s.rx * hw, y, s.z - s.rz * hw, s.x + s.rx * hw, y, s.z + s.rz * hw);
    normals.push(0, 1, 0, 0, 1, 0);
    const v = (i / count) * laps;
    uvs.push(0, v, def.width / ROAD_TILE, v);
    // no road over the open gap of a leap
    if (i < count && !s.gap && !samples[(i + 1) % count].gap) indices.push(i * 2, i * 2 + 2, i * 2 + 1, i * 2 + 1, i * 2 + 2, i * 2 + 3);
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
  const tip = (s) => -Math.atan(s.grade ?? 0); // tilts a flat thing to lie along the slope of the road
  samples.forEach((s, i) => {
    if (s.gap || s.wall < hw + 0.6) return; // railings take over from the curbs on bridges
    for (const side of [-1, 1]) {
      const off = side * (hw + 0.6);
      // reds sit a hair higher so neighbours don't flicker where they overlap on the inside of a bend
      (i % 2 ? reds : whites).push([s.x + s.rx * off, (s.y ?? 0) + (i % 2 ? 0.066 : 0.06), s.z + s.rz * off, s.heading, 1, 1, 1, tip(s)]);
    }
  });
  place(curbR, reds);
  place(curbW, whites);
  curbR.receiveShadows = curbW.receiveShadows = true;

  // Dashed center line
  const dash = MeshBuilder.CreateBox('dash', { width: 0.3, height: 0.02, depth: 2.2 }, scene);
  dash.material = mat(scene, 'paintLine', '#e6e6e6', 0.7);
  place(dash, samples.filter((s, i) => i % 4 === 0 && i > 4 && i < count - 4 && !s.gap).map((s) => [s.x, (s.y ?? 0) + 0.035, s.z, s.heading, 1, 1, 1, tip(s)]));

  // Checkered start/finish line at sample 0
  const sq = MeshBuilder.CreateBox('sq', { width: 1, height: 0.02, depth: 1 }, scene);
  const sqB = MeshBuilder.CreateBox('sqB', { width: 1, height: 0.02, depth: 1 }, scene);
  sq.material = mat(scene, 'checkW', '#ececec', 0.7);
  sqB.material = mat(scene, 'checkB', '#111111', 0.7);
  const s0 = samples[0];
  const wsq = [], bsq = [];
  const cols = Math.round(def.width / 0.8), SQ = def.width / cols; // three rows of squares right across the road
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < 3; r++) {
      const lat = -hw + SQ * (c + 0.5), fwd = (r - 1) * SQ;
      const x = s0.x + s0.rx * lat + s0.tx * fwd, z = s0.z + s0.rz * lat + s0.tz * fwd;
      ((c + r) % 2 ? bsq : wsq).push([x, (s0.y ?? 0) + 0.04 + (s0.grade ?? 0) * fwd, z, s0.heading, SQ, 1, SQ, tip(s0)]);
    }
  }
  for (const fwd of [-1.5 * SQ - 0.25, 1.5 * SQ + 0.25]) wsq.push([s0.x + s0.tx * fwd, (s0.y ?? 0) + 0.04 + (s0.grade ?? 0) * fwd, s0.z + s0.tz * fwd, s0.heading, def.width, 1, 0.3, tip(s0)]);
  place(sq, wsq);
  place(sqB, bsq);
  // (the start gantry, grandstands and the rest of the race-day dressing are in venue.js)

  bridges(scene, track, hw, gy, shadows); // decks on pillars, railings, and the gaps of the leaps

  // Lake in the middle of the loop: a sandy shore with still water on top that mirrors the sky
  const lake = def.lake ? lakeOutline(track, hw) : null;
  if (lake) {
    lakePatch(scene, 'shore', lake, 4, 0.03, mat(scene, 'sand', '#cdb98a', 0.95));
    lakePatch(scene, 'water', lake, 0, 0.06, mat(scene, 'water', '#17607a', 0.05));
  }

  // Jumps (see addJumps in physics.js) and the building site around them
  const props = propSet(scene, shadows, gy);
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
    } else jump(scene, s, def, props, shadows, !!j.leap);
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
    const parked = def.site.parked ?? 14;
    for (let n = 0; n < parked; n++) {
      const i = Math.floor(((n + siteRand()) / parked) * count), s = samples[i];
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
      built.push([x, z, 2.5]);
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
  // Race-day dressing: gantry, grandstands, fans, flags, boards, tyre walls... (see venue.js)
  const roadGap = (x, z) => {
    let near = Infinity;
    for (let i = 0; i < count; i += 2) near = Math.min(near, (samples[i].x - x) ** 2 + (samples[i].z - z) ** 2);
    return Math.sqrt(near) - hw;
  };
  const axolotls = lands.filter((l) => l.axolotl).map((l) => [l.axolotl.x, l.axolotl.z, 6 * (l.axolotl.size ?? 2)]);
  const builtGrid = spotGrid(built); // (a quick lookup: by now there are a great many things in `built`)
  const blocked = (x, z, r = 0) => builtGrid.hit(x, z, r)
    || axolotls.some(([bx, bz, br]) => Math.hypot(x - bx, z - bz) < br + r) || lake?.covers(x, z, r + 6) || inSea(x, r + 6);
  // banks along the road (roadside.js): shaped once venue.js has put down everything that needs flat ground
  const field = roadField(track, hw);
  const terrain = makeTerrain(track, def, { hw, field, built, landAt, lake, inSea, base: gy });
  const ground = (x, z, r = 1) => gy(x, z) + terrain.groundAt(x, z, r); // the ground, banks and all
  const venue = buildVenue(scene, track, def, shadows, { roadGap, built, blocked, props, landAt, field, lake, terrain: { freeze: terrain.freeze, groundAt: ground } });
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
        if (builtGrid.hit(x, z, 3)) continue;
        if (lake?.covers(x, z, 13) || inSea(x, 13)) continue; // not in the water, with room to wander
        if (Math.min(...samples.filter((_, i) => i % 3 === 0).map((p) => Math.hypot(p.x - x, p.z - z))) < hw + 8) continue; // too near another bit of road
        // most of them stand watching the road
        list.push({ kind, x, z, yaw: Math.atan2(s.x - x, s.z - z) + (wild() - 0.5) * 1.6 });
        built.push([x, z, 5]);
        n++;
      }
    }
    addAnimals(scene, shadows, list, def.animals?.birds ?? def.animals?.pterosaurs, def.animals?.pterosaurs ? 'pterosaurs' : 'birds', (x, z) => gy(x, z) + terrain.heightAt(x, z));
  }

  // Trees, bushes and rocks scattered away from the road
  const rand = rng(1234);
  const farCull = []; // [mesh, how far off it is still drawn]
  const clearings = [...built, ...lands.filter((l) => l.axolotl).map((l) => [l.axolotl.x, l.axolotl.z, 6 * (l.axolotl.size ?? 2)])], clear = spotGrid(clearings);
  lands.forEach((land, k) => {
    // the part of this land that is close enough to the track to be worth planting
    const [x0, x1, z0, z1] = [Math.max(land.area[0], -360), Math.min(land.area[1], 360), Math.max(land.area[2], -300), Math.min(land.area[3], 300)];
    const share = ((x1 - x0) * (z1 - z0)) / (720 * 600);
    const spots = {}; // model name -> where its copies go
    // trees growing right in the road (see addObstacles in physics.js): big ones, so they are easy to spot
    if (k === 0) {
      for (const o of roadTrees) {
        const name = land.scenery.trees[0], s = 11 / MODELS[name].height;
        (spots[name] ??= []).push([o.x, o.y ?? 0, o.z, o.idx, s * 1.25, s, s * 1.25]);
      }
    }
    // copies go in map-square chunks, so the ones out of view (or far off in the haze) are skipped
    // (low: bushes and rocks, too small to bother casting shadows)
    const put = (name, x, z, s, sink = 0.1, low = false) => {
      const key = `${name}|${Math.floor(x / CHUNK)},${Math.floor(z / CHUNK)}|${low ? 'low' : ''}`;
      (spots[key] ??= []).push([x, ground(x, z, 1.2) - sink, z, rand() * 6.28, s, s * (0.9 + rand() * 0.25), s]);
    };
    const ok = (x, z, r = 0) => !inSea(x, 8) && !lake?.covers(x, z, 7) && landAt(x, z) === land && !clear.hit(x, z, r);
    // Only the land near the road is planted: further out it is hidden behind the banks and the tree
    // lines (and lost in the haze), and the ring of far-off scenery in venue.js fills the horizon.
    const FAR = 120;
    const scatter = (names, howMany, gap, sizeFor, low = false) => {
      for (let n = 0, tries = 0; n < howMany && tries < howMany * 20; tries++) {
        // a spot beside a random bit of road, out to FAR from it
        const q = samples[Math.floor(rand() * count)], off = (rand() < 0.5 ? -1 : 1) * (hw + gap + rand() * (FAR - gap));
        const x = q.x + q.rx * off, z = q.z + q.rz * off;
        if (x < x0 || x > x1 || z < z0 || z > z1 || field.gap(x, z, gap + 1) < gap || !ok(x, z)) continue;
        const name = names[Math.floor(rand() * names.length)];
        put(name, x, z, sizeFor() / MODELS[name].height, 0.1, low);
        n++;
      }
    };
    const [small, tall] = land.scenery.treeSize ?? [7, 14]; // meters
    const treeSize = () => small + rand() * (tall - small);
    scatter(land.scenery.trees, Math.round((land.scenery.treeCount ?? 360 * share) * 0.55), land.scenery.treeGap ?? 14, treeSize);
    scatter(land.scenery.small, Math.round((land.scenery.smallCount ?? 200 * share) * 0.55), 9, () => 0.8 + rand() * 1.6, true); // bushes and rocks
    // tree lines hugging the road, up on the banks: they flash past and hide the far distance
    const ROW = { woods: 6.5, jungle: 8, winter: 8, coast: 11, speedway: 13, desert: 16, site: 26 }[themeOf(land, def)] ?? 12;
    for (const side of [-1, 1]) for (let d = rand() * ROW; d < track.length; d += ROW * (0.7 + rand() * 0.6)) {
      const q = samples[Math.floor(d / (track.length / count)) % count], off = hw + SAFE + 5 + rand() ** 1.5 * 14;
      const x = q.x + q.rx * side * off, z = q.z + q.rz * side * off;
      if (field.gap(x, z, 20) < SAFE + 4 || !ok(x, z, 2)) continue;
      const name = land.scenery.trees[Math.floor(rand() * land.scenery.trees.length)];
      put(name, x, z, treeSize() / MODELS[name].height, 0.3);
      clearings.push([x, z, 2.5]);
    }

    // One mesh per model, with each part (leaves, bark...) painted in through vertex colours, so a tree is one
    // draw call rather than two or three
    const colors = { ...SCENERY_COLORS, ...land.colors }, shapes = {};
    const plantMat = mat(scene, 'plants', '#ffffff', 0.9);
    const shape = (name) => (shapes[name] ??= (() => {
      const P = [], N = [], C = [];
      for (const [kind, g] of Object.entries(MODELS[name].groups)) {
        const c = Color3.FromHexString(colors[kind]).toLinearSpace();
        P.push(...g.pos);
        N.push(...g.nor);
        for (let i = 0; i < g.pos.length / 3; i++) C.push(c.r, c.g, c.b, 1);
      }
      return { P, N, C };
    })());
    for (const [key, list] of Object.entries(spots)) {
      const name = key.split('|')[0], { P, N, C } = shape(name);
      const m = new Mesh(name, scene), vd = new VertexData();
      Object.assign(vd, { positions: P, normals: N, colors: C, indices: Array.from({ length: P.length / 3 }, (_, i) => i) });
      vd.applyToMesh(m);
      m.material = plantMat;
      m.isPickable = false;
      place(m, list);
      if (!key.endsWith('low')) shadows.addShadowCaster(m, false);
      if (key.includes('|')) farCull.push([m, key.endsWith('low') ? NEAR_RANGE * 0.6 : NEAR_RANGE]);
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
      snowmen(scene, list, shadows, gy);
    }

    if (land.axolotl) axolotl(scene, land.axolotl, shadows);
  });

  // Signs where the road crosses from one named land into another
  samples.forEach((s, i) => {
    const next = samples[(i + 1) % count], from = landAt(s.x, s.z), to = landAt(next.x, next.z);
    if (to.name && from.name !== to.name) stateSign(scene, next, hw, to, shadows);
  });

  // the banks themselves, in each land's own ground
  for (const m of terrain.build(scene, (land) => groundMat(land, 1, 1), GRASS_TILE)) farCull.push([m, NEAR_RANGE + 120]);
  cullByDistance(scene, farCull);

  hills(scene, rand, 640, 45, 120, 0, landAt);
  hills(scene, rand, 480, 12, 55, 1, landAt);

  for (const m of scene.materials) if (m.name !== 'lava') m.freeze();
  return venue; // { update(raceTime) }: start lights, hopping fans, flags, the blimp...
}
