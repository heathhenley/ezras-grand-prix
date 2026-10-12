// The turntable scene behind the menu and garage screens.
import { Scene } from '@babylonjs/core/scene';
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Color4 } from '@babylonjs/core/Maths/math.color';
import { buildCar } from './carmesh.js';
import { setupSky, castShadows, pbr } from './env.js';

export class Showroom {
  constructor(engine) {
    const scene = (this.scene = new Scene(engine));
    scene.clearColor = new Color4(0.11, 0.16, 0.29, 1);

    this.sky = setupSky(scene, { showSky: false, range: 6 });

    const floor = (this.floor = MeshBuilder.CreateCylinder('turntable', { diameter: 9, height: 0.3, tessellation: 48 }, scene));
    floor.position.y = -0.15;
    floor.material = pbr(scene, 'floor', '#2a3558', 0.6);
    floor.receiveShadows = true;

    this.camera = new ArcRotateCamera('cam', -Math.PI / 2.4, 1.2, 9.5, new Vector3(0, 0.8, 0), scene);
    this.camera.fov = 0.7;
    this.angle = 0;
    this.car = null;
    this.cfgKey = '';
  }

  setCar(cfg) {
    const key = JSON.stringify(cfg);
    if (key === this.cfgKey) return;
    this.cfgKey = key;
    this.car?.dispose();
    this.car = buildCar(this.scene, cfg);
    castShadows(this.sky.shadows, this.car.root);
    this.car.root.rotation.y = this.angle;
  }

  // Home, garage and results are drawn on a 1180 x 820 board, shown on screen at `scale`, with an empty card
  // for the car. This puts the car in that card: right/up are how far the card's middle is from the
  // board's middle (in board pixels), pxPerMeter how big the car is drawn, turntable its size (1 = full).
  frameBoard(scale, { right, up, pxPerMeter, turntable }) {
    this.camera.radius = innerHeight / (2 * Math.tan(this.camera.fov / 2) * pxPerMeter * scale);
    this.camera.targetScreenOffset.x = right / pxPerMeter;
    this.camera.targetScreenOffset.y = up / pxPerMeter;
    this.floor.scaling.x = this.floor.scaling.z = turntable;
  }

  update(dt) {
    this.angle += dt * 0.5;
    if (this.car) {
      this.car.root.rotation.y = this.angle;
      this.car.animate(0, 0, dt);
    }
  }
}
