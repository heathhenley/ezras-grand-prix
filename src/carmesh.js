import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { BODIES, COLORS, WHEELS } from './data.js';
import { pbr } from './env.js';

const mat = (scene, hex, roughness, metallic = 0) => pbr(scene, 'carMat', hex, roughness, metallic);

// Glossy paint: coloured base under a clear lacquer layer that reflects the sky.
function paintMat(scene, hex) {
  const m = mat(scene, hex, 0.5, 0.15);
  m.clearCoat.isEnabled = true;
  m.clearCoat.intensity = 0.7;
  m.clearCoat.roughness = 0.06;
  return m;
}

function lampMat(scene, hex, glow) {
  const m = mat(scene, hex, 0.2);
  m.emissiveColor = Color3.FromHexString(hex).toLinearSpace().scale(glow);
  return m;
}

// Builds a little blocky car from primitives. Forward is +Z.
export function buildCar(scene, cfg) {
  const body = BODIES[cfg.body];
  const d = body.dims;
  const root = new TransformNode('car', scene);
  const paint = paintMat(scene, COLORS[cfg.color].hex);
  const dark = mat(scene, '#22252b', 0.6);
  const glass = mat(scene, '#6b7887', 0.04, 1); // tinted mirror, so the windows show the sky

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
    box(0.3, 0.02, d.l * 0.98, 0, top + 0.005, 0, paintMat(scene, '#f2f2f2')); // racing stripe
  }

  // lights
  const head = lampMat(scene, '#fff3b0', 1.5);
  const tail = lampMat(scene, '#ff2a2a', 1.2);
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
  const tire = mat(scene, '#161616', 0.85);
  const rim = mat(scene, WHEELS[cfg.wheels].rim, 0.3, 1);
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

  // soft dark patch right under the car; the real sun shadow falls off to one side
  const contact = MeshBuilder.CreateDisc('contact', { radius: 0.5, tessellation: 20 }, scene);
  contact.rotation.x = Math.PI / 2;
  contact.scaling.set(d.w * 1.05, d.l * 1.0, 1);
  contact.position.y = 0.045;
  const cm = new StandardMaterial('contact', scene);
  cm.diffuseColor = cm.specularColor = Color3.Black();
  cm.disableLighting = true;
  cm.alpha = 0.4;
  cm.backFaceCulling = false;
  contact.material = cm;
  contact.parent = root;

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
