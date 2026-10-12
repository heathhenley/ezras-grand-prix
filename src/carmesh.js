import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { BODIES, COLORS, WHEELS } from './data.js';

function mat(scene, hex, spec = 0.2, emissive = false) {
  const m = new StandardMaterial('carMat', scene);
  m.diffuseColor = Color3.FromHexString(hex);
  m.specularColor = new Color3(spec, spec, spec);
  if (emissive) m.emissiveColor = Color3.FromHexString(hex);
  return m;
}

// Builds a little blocky car from primitives. Forward is +Z.
export function buildCar(scene, cfg) {
  const body = BODIES[cfg.body];
  const d = body.dims;
  const root = new TransformNode('car', scene);
  const paint = mat(scene, COLORS[cfg.color].hex, 0.6);
  const dark = mat(scene, '#22252b', 0.1);
  const glass = mat(scene, '#1c2a3a', 0.9);

  const box = (w, h, l, x, y, z, material) => {
    const m = MeshBuilder.CreateBox('part', { width: w, height: h, depth: l }, scene);
    m.position.set(x, y, z);
    m.material = material;
    m.parent = root;
    return m;
  };

  const top = d.clear + d.h;
  box(d.w, d.h, d.l, 0, d.clear + d.h / 2, 0, paint);
  box(d.w * 0.96, 0.18, 0.25, 0, d.clear + 0.1, d.l / 2, dark); // front bumper
  box(d.w * 0.96, 0.18, 0.25, 0, d.clear + 0.1, -d.l / 2, dark); // rear bumper

  if (body.style === 'buggy') {
    // open roll cage
    const bar = (x, z) => {
      const m = MeshBuilder.CreateCylinder('bar', { diameter: 0.12, height: d.cabinH, tessellation: 6 }, scene);
      m.position.set(x, top + d.cabinH / 2, z);
      m.material = dark;
      m.parent = root;
    };
    const hx = d.w * 0.4, hz = d.cabinL / 2;
    bar(hx, d.cabinZ + hz); bar(-hx, d.cabinZ + hz); bar(hx, d.cabinZ - hz); bar(-hx, d.cabinZ - hz);
    box(d.w * 0.86, 0.12, d.cabinL + 0.12, 0, top + d.cabinH, d.cabinZ, paint);
    box(0.6, 0.5, 0.6, 0, top + 0.25, d.cabinZ - 0.1, dark); // seat
  } else {
    box(d.w * 0.82, d.cabinH, d.cabinL, 0, top + d.cabinH / 2, d.cabinZ, glass);
    box(d.w * 0.84, 0.08, d.cabinL * 0.8, 0, top + d.cabinH + 0.04, d.cabinZ, paint); // roof
    if (body.style === 'muscle') box(0.5, 0.18, 0.9, 0, top + 0.09, d.l * 0.25, dark); // hood scoop
    box(0.3, 0.02, d.l * 0.98, 0, top + 0.005, 0, mat(scene, '#ffffff', 0.3)); // racing stripe
  }

  // lights
  const head = mat(scene, '#fff3b0', 0, true);
  const tail = mat(scene, '#ff2a2a', 0, true);
  for (const s of [-1, 1]) {
    box(0.35, 0.15, 0.06, s * d.w * 0.33, top - 0.15, d.l / 2 + 0.01, head);
    box(0.35, 0.12, 0.06, s * d.w * 0.33, top - 0.15, -d.l / 2 - 0.01, tail);
  }

  // spoiler
  if (cfg.spoiler === 'small') {
    box(d.w * 0.9, 0.12, 0.35, 0, top + 0.08, -d.l / 2 + 0.2, paint);
  } else if (cfg.spoiler === 'wing') {
    for (const s of [-1, 1]) box(0.08, 0.55, 0.2, s * d.w * 0.32, top + 0.27, -d.l / 2 + 0.3, dark);
    box(d.w * 1.0, 0.07, 0.55, 0, top + 0.57, -d.l / 2 + 0.25, paint);
  }

  // wheels: pivot handles steer (y) + spin (x); child cylinders are turned on their side
  const tire = mat(scene, '#161616', 0.05);
  const rim = mat(scene, WHEELS[cfg.wheels].rim, 0.9);
  const wheels = [];
  for (const [x, z, front] of [[d.wheelX, d.wheelZf, true], [-d.wheelX, d.wheelZf, true], [d.wheelX, d.wheelZr, false], [-d.wheelX, d.wheelZr, false]]) {
    const pivot = new TransformNode('wheel', scene);
    pivot.parent = root;
    pivot.position.set(x, d.wheelD / 2, z);
    const t = MeshBuilder.CreateCylinder('tire', { diameter: d.wheelD, height: d.wheelW, tessellation: 14 }, scene);
    t.rotation.z = Math.PI / 2;
    t.material = tire;
    t.parent = pivot;
    const r = MeshBuilder.CreateCylinder('rim', { diameter: d.wheelD * 0.55, height: d.wheelW + 0.04, tessellation: 6 }, scene);
    r.rotation.z = Math.PI / 2;
    r.material = rim;
    r.parent = pivot;
    wheels.push({ pivot, front });
  }

  // soft blob shadow
  const shadow = MeshBuilder.CreateDisc('shadow', { radius: 0.5, tessellation: 20 }, scene);
  shadow.rotation.x = Math.PI / 2;
  shadow.scaling.set(d.w * 1.4, d.l * 1.15, 1);
  shadow.position.y = 0.045;
  const sm = mat(scene, '#000000', 0);
  sm.alpha = 0.35;
  sm.backFaceCulling = false;
  shadow.material = sm;
  shadow.parent = root;

  let spin = 0;
  return {
    root,
    stats: body.stats,
    // called every frame with current speed (m/s) and steer (-1..1)
    animate(speed, steer, dt) {
      spin += (speed * dt) / (d.wheelD / 2);
      for (const w of wheels) {
        w.pivot.rotation.x = spin;
        w.pivot.rotation.y = w.front ? steer * 0.45 : 0;
      }
    },
    dispose() {
      root.dispose(false, true);
    },
  };
}
