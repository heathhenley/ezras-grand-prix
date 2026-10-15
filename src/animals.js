// Animals and dinosaurs wandering about in the scenery, from the models in public/assets/animals.
// Most are by Quaternius (quaternius.com, CC0 / public domain); the bear and rabbit are CC-BY (credits
// in the README). All were downloaded from poly.pizza.
// Models with walk and idle animations stand around for a bit, then stroll to a new spot nearby.
// Some walk back and forth across the road instead (see addCrossers in physics.js). The flying flocks
// are built here from simple shapes.
// (The deer, stag and fox files were run through tools/fix-glb-skin.mjs first; without that their
// skeletons load wrongly and they crumple.)
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { LoadAssetContainerAsync } from '@babylonjs/core/Loading/sceneLoader';
import '@babylonjs/core/Meshes/instancedMesh';
import '@babylonjs/loaders/glTF/2.0';
import { pbr, asset } from './env.js';

// file: the model in public/assets/animals. tall: its height in meters. roam: how far it wanders from
// where it was put. pace: walking speed in m/s. extra: an animation it does now and then instead of walking.
// girth: how wide it is to crash into, in meters (used when it is crossing the road).
// bright: lifts the model's colours (Quaternius' are rather dark for a sunny day). turn: radians to
// spin a model that was made facing the wrong way.
export const KINDS = {
  deer: { file: 'deer', tall: 2.0, roam: 6, pace: 1.1, extra: 'Eating', girth: 0.8 },
  stag: { file: 'stag', tall: 2.6, roam: 6, pace: 1.1, extra: 'Eating', girth: 0.9 },
  fox: { file: 'fox', tall: 1.1, roam: 7, pace: 1.3, extra: 'Eating', girth: 0.6 },
  bear: { file: 'bear', tall: 2.3, girth: 1.2, bright: 1 }, // has no animations, so it just looks around
  rabbit: { file: 'rabbit', tall: 1.1, roam: 5, pace: 1.4, girth: 0.5, bright: 1 }, // bigger than life, to be seen from the road
  trex: { file: 'trex', tall: 7.5, roam: 7, pace: 2.2, extra: 'Attack', girth: 2.2 }, // its attack is a big roar
  longneck: { file: 'longneck', tall: 9, roam: 6, pace: 1.6, girth: 2.6 },
  stego: { file: 'stego', tall: 4.6, roam: 6, pace: 1.2, girth: 1.7 },
  threehorn: { file: 'threehorn', tall: 3.8, roam: 6, pace: 1.3, extra: 'Attack', girth: 1.6 },
  parasaur: { file: 'parasaur', tall: 4.6, roam: 7, pace: 1.6, girth: 1.3 },
  raptor: { file: 'raptor', tall: 2.4, roam: 7, pace: 2.6, extra: 'Attack', girth: 0.9 },
};

// Loads one kind of model and puts a copy at each spot. Returns the walkers it made.
// A spot with `crossing` (a road obstacle from physics.js) follows that instead of wandering.
async function herd(scene, shadows, kind, spots) {
  const def = KINDS[kind];
  const pack = await LoadAssetContainerAsync(asset(`animals/${def.file}.glb`), scene);
  if (scene.isDisposed) return []; // the race ended while it was loading
  for (const m of pack.materials) m.albedoColor?.scaleInPlace(def.bright ?? 1.7);
  return spots.map(({ x, z, yaw, crossing }, n) => {
    const copy = pack.instantiateModelsToScene((name) => name, false, { doNotInstantiate: true });
    const node = new TransformNode(kind, scene); // what gets moved and turned
    const root = copy.rootNodes[0];
    root.parent = node;
    // size it to `tall`, stand it on the ground in the middle of its node
    const box = root.getHierarchyBoundingVectors(true), k = def.tall / (box.max.y - box.min.y);
    root.scaling.scaleInPlace(k);
    root.position.set(-((box.min.x + box.max.x) / 2) * k, -box.min.y * k, -((box.min.z + box.max.z) / 2) * k);
    if (def.turn) { const spin = new TransformNode('turn', scene); spin.parent = node; spin.rotation.y = def.turn; root.parent = spin; }
    node.position.set(x, 0, z);
    node.rotation.y = yaw;
    for (const m of root.getChildMeshes()) {
      shadows.addShadowCaster(m, false);
      m.alwaysSelectAsActiveMesh = true; // its outline moves as it animates, so never skip drawing it
      m.isPickable = false;
    }
    // clips are named things like "Armature|TRex_Walk", "Walk" or "Bunny_walk"
    const clip = (word) => copy.animationGroups.findLast((g) => new RegExp(`(^|[_|])${word}$`, 'i').test(g.name));
    const w = { node, yaw, home: [x, z], idle: clip('Idle'), walk: clip('Walk'), extra: def.extra && clip(def.extra), roam: def.roam, pace: def.pace, state: 'idle', wait: 1 + ((n * 2.7) % 6), playing: null, crossing, phase: n * 1.7 };
    for (const g of copy.animationGroups) g.stop();
    play(w, crossing ? w.walk : w.idle);
    return w;
  });
}

function play(w, clip, loop = true) {
  if (!clip || w.playing === clip) return;
  w.playing?.stop();
  clip.start(loop, 1);
  w.playing = clip;
}

// Stand a while, then either do the extra move or stroll to a new spot near home.
function wander(w, dt, t) {
  if (w.crossing) {
    // walking across the road: physics moves it, this just keeps the model on it and facing its way
    const o = w.crossing;
    let turn = o.facing - w.yaw;
    turn = Math.atan2(Math.sin(turn), Math.cos(turn));
    w.yaw += Math.max(-4 * dt, Math.min(4 * dt, turn)); // spins round quickly when it turns back
    w.node.position.set(o.x, 0, o.z);
    w.node.rotation.y = w.yaw;
    return;
  }
  if (!w.walk) { // a model with no walk animation stays put and slowly looks from side to side
    w.node.rotation.y = w.yaw + Math.sin((t + w.phase) * 0.5) * 0.3;
    return;
  }
  if (w.state === 'idle' || w.state === 'extra') {
    w.wait -= dt;
    if (w.wait > 0) return;
    if (w.state === 'idle' && w.extra && Math.random() < 0.3) {
      play(w, w.extra, false);
      w.state = 'extra';
      w.wait = (w.extra.to - w.extra.from) / 60 + 0.2; // clips are timed at 60 frames a second
      return;
    }
    const a = Math.random() * 6.28, r = (0.4 + Math.random() * 0.6) * w.roam;
    w.goal = [w.home[0] + Math.sin(a) * r, w.home[1] + Math.cos(a) * r];
    w.state = 'walk';
    play(w, w.walk);
    return;
  }
  const dx = w.goal[0] - w.node.position.x, dz = w.goal[1] - w.node.position.z, far = Math.hypot(dx, dz);
  if (far < 0.4) {
    w.state = 'idle';
    w.wait = 3 + Math.random() * 6;
    play(w, w.idle);
    return;
  }
  // turn towards the goal, and walk once roughly facing it
  let turn = Math.atan2(dx, dz) - w.yaw;
  turn = Math.atan2(Math.sin(turn), Math.cos(turn));
  w.yaw += Math.max(-1.6 * dt, Math.min(1.6 * dt, turn));
  w.node.rotation.y = w.yaw;
  if (Math.abs(turn) < 0.6) {
    const step = Math.min(far, w.pace * dt);
    w.node.position.x += Math.sin(w.yaw) * step;
    w.node.position.z += Math.cos(w.yaw) * step;
  }
}

// spots: [{ kind, x, z, yaw, crossing? }]. flocks: how many groups circle overhead; flyers picks what they are.
const FORWARD = new Vector3(0, 0, 1), SHOW_RANGE = 170;
const FLYERS = { birds: { size: 1, color: '#2b2b30' }, pterosaurs: { size: 3.2, color: '#8a6f4d' } };
// ground(x, z): how high the ground is there (banks and hills), so they walk up and over them.
export function addAnimals(scene, shadows, spots, flocks = 0, flyers = 'birds', ground = () => 0) {
  const walkers = [], herds = {};
  for (const spot of spots) (herds[spot.kind] ??= []).push(spot);
  // the models arrive a moment after the race starts; a missing file just means no herd
  for (const [kind, list] of Object.entries(herds)) herd(scene, shadows, kind, list).then((made) => walkers.push(...made)).catch(() => {});

  // flyers: two flat wings each, flapping, in loose flocks that circle high up
  const wings = [], circling = [];
  if (flocks) {
    const flyer = FLYERS[flyers];
    const wing = MeshBuilder.CreateBox('wing', { width: 1.1, height: 0.06, depth: 0.5 }, scene);
    wing.setPivotPoint(wing.position.add({ x: -0.55, y: 0, z: 0 })); // hinge at the body end
    wing.material = pbr(scene, 'bird', flyer.color, 0.9);
    wing.isVisible = false; // only the copies are shown
    for (let f = 0; f < flocks; f++) {
      const flock = new TransformNode('flock', scene);
      flock.scaling.setAll(flyer.size);
      for (let b = 0; b < 5; b++) {
        const body = new TransformNode('bird', scene);
        body.parent = flock;
        body.position.set((b - 2) * 3.2, Math.abs(b - 2) * 0.6, -Math.abs(b - 2) * 3.2); // a V shape
        for (const side of [-1, 1]) {
          const w = wing.createInstance('wing');
          w.parent = body;
          w.position.x = side * 0.55;
          w.scaling.x = side; // mirror the hinge for the other side
          wings.push({ w, side, phase: b * 0.9 + f * 2 });
        }
      }
      circling.push({ node: flock, phase: f * 2.6, radius: 90 + f * 60, height: 38 + f * 14 });
    }
  }

  let tick = 0;
  scene.onBeforeRenderObservable.add(() => {
    const t = performance.now() / 1000, dt = Math.min(0.05, scene.getEngine().getDeltaTime() / 1000);
    for (const w of walkers) {
      wander(w, dt, t);
      const p = w.node.position;
      if (p.x !== w.gx || p.z !== w.gz) { w.gx = p.x; w.gz = p.z; p.y = ground(p.x, p.z); } // only when it has moved
    }
    // The models are always drawn while near (they change shape as they move, so the usual check for
    // being on screen does not work), so a few times a second hide the ones far off or behind the camera,
    // and pause their animations.
    const cam = scene.activeCamera;
    if (cam && ++tick % 8 === 0) {
      const c = cam.globalPosition, f = cam.getDirection(FORWARD);
      for (const w of walkers) {
        const p = w.node.position, dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz);
        const show = d < 30 || (d < SHOW_RANGE && (dx * f.x + dz * f.z) / d > -0.1);
        if (show === w.shown) continue;
        w.shown = show;
        w.node.setEnabled(show);
        if (show) w.playing?.play(w.playing.loopAnimation); else w.playing?.pause();
      }
    }
    for (const a of circling) {
      const turn = (t + a.phase) * 0.12;
      a.node.position.set(Math.sin(turn) * a.radius, a.height + Math.sin((t + a.phase) * 0.3) * 4, Math.cos(turn) * a.radius);
      a.node.rotation.y = turn + Math.PI / 2;
    }
    for (const { w, side, phase } of wings) w.rotation.z = side * Math.sin(t * 7 + phase) * 0.6;
  });
}
