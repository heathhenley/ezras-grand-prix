import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { BODIES, COLORS, WHEELS } from './data.js';
import { pbr } from './env.js';
import MODELS from './cars.json'; // Kenney Car Kit shapes, sorted into paint / glass / trim / ... by tools/build-cars.mjs

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

// One group of triangles from cars.json -> a mesh. Trim carries its own colour per corner.
function part(scene, name, g, material, parent) {
  const m = new Mesh(name, scene);
  const vd = new VertexData();
  vd.positions = g.pos;
  vd.normals = g.nor;
  vd.indices = Array.from({ length: g.pos.length / 3 }, (_, i) => i);
  if (g.colors) {
    const table = g.colors.map((hex) => Color3.FromHexString(hex).toLinearSpace());
    vd.colors = g.colIdx.flatMap((i) => [table[i].r, table[i].g, table[i].b, 1]);
  }
  vd.applyToMesh(m);
  m.material = material;
  m.parent = parent;
  return m;
}

// Builds a car from the model data. Forward is +Z.
export function buildCar(scene, cfg) {
  const body = BODIES[cfg.body];
  const model = MODELS.cars[cfg.body];
  const root = new TransformNode('car', scene);
  const scaled = new TransformNode('model', scene); // model units -> meters
  scaled.parent = root;
  scaled.scaling.setAll(body.scale);

  const mats = {
    paint: paintMat(scene, COLORS[cfg.color].hex),
    glass: mat(scene, '#6b7887', 0.04, 1), // tinted mirror, so the windows show the sky
    trim: mat(scene, '#ffffff', 0.55), // white, so the per-corner colours show through
    head: lampMat(scene, '#fff3b0', 1.5),
    tail: lampMat(scene, '#ff2a2a', 1.2),
    tyre: mat(scene, '#161616', 0.85),
    rim: mat(scene, WHEELS[cfg.wheels].rim, 0.3, 1),
  };
  const group = (groups, parent) => {
    for (const [kind, g] of Object.entries(groups)) part(scene, kind, g, mats[kind], parent);
  };

  group(model.body, scaled);

  const spoiler = MODELS.spoilers[cfg.spoiler];
  if (spoiler) {
    const mount = new TransformNode('spoiler', scene);
    mount.parent = scaled;
    mount.position.fromArray(model.spoilerAt);
    group(spoiler, mount);
  }

  // wheels: pivot handles steer (y) + spin (x)
  const wheels = [];
  for (const w of model.wheels) {
    const pivot = new TransformNode('wheel', scene);
    pivot.parent = scaled;
    pivot.position.set(w.x, w.y, w.z);
    const shape = new TransformNode('wheelShape', scene);
    shape.parent = pivot;
    if (!w.left) shape.scaling.x = -1; // one wheel shape, mirrored for the other side
    group(model.wheel, shape);
    wheels.push({ pivot, front: w.front });
  }
  const wheelRadius = model.wheels[0].y * body.scale;

  // soft dark patch right under the car; the real sun shadow falls off to one side
  const contact = MeshBuilder.CreateDisc('contact', { radius: 0.5, tessellation: 20 }, scene);
  contact.rotation.x = Math.PI / 2;
  contact.scaling.set(model.size[0] * body.scale * 1.1, model.size[2] * body.scale * 0.95, 1);
  contact.position.y = 0.045;
  const cm = new StandardMaterial('contact', scene);
  cm.diffuseColor = cm.specularColor = Color3.Black();
  cm.disableLighting = true;
  cm.alpha = 0.4;
  cm.backFaceCulling = false;
  contact.material = cm;
  contact.parent = root;

  let spin = 0, tilt = 0;
  return {
    root,
    stats: body.stats,
    // height above the road and nose up/down (ramps and jumps); the dark patch stays on the ground
    lift(y, slope, dt) {
      tilt += (Math.atan(slope) - tilt) * Math.min(1, dt * 10);
      scaled.position.y = y;
      scaled.rotation.x = tilt;
      contact.visibility = Math.max(0.3, 1 - y / 4);
    },
    // called every frame with current speed (m/s) and steer (-1..1)
    animate(speed, steer, dt) {
      spin += (speed * dt) / wheelRadius;
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
