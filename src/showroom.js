// The turntable scene behind the menu and garage screens.
import { Scene } from '@babylonjs/core/scene';
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { buildCar } from './carmesh.js';

export class Showroom {
  constructor(engine) {
    const scene = (this.scene = new Scene(engine));
    scene.clearColor = new Color4(0.11, 0.16, 0.29, 1);

    const hemi = new HemisphericLight('hemi', new Vector3(0, 1, 0), scene);
    hemi.intensity = 0.8;
    hemi.groundColor = new Color3(0.2, 0.2, 0.3);
    const key = new DirectionalLight('key', new Vector3(-0.5, -1, 0.6), scene);
    key.intensity = 0.7;

    const floor = MeshBuilder.CreateCylinder('turntable', { diameter: 9, height: 0.3, tessellation: 48 }, scene);
    floor.position.y = -0.15;
    const fm = new StandardMaterial('floor', scene);
    fm.diffuseColor = Color3.FromHexString('#2a3558');
    fm.specularColor = new Color3(0.3, 0.3, 0.3);
    floor.material = fm;

    // camera target is offset so the car sits beside the UI panel
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
    this.car.root.rotation.y = this.angle;
  }

  // Nudge the car away from the UI panel. The offset is added to the view
  // translation, so +x moves the car right on screen and +y moves it up.
  frame(panelSide) {
    this.camera.targetScreenOffset.x = panelSide === 'left' ? 1.8 : 0;
    this.camera.targetScreenOffset.y = panelSide === 'bottom' ? 1.4 : 0;
  }

  update(dt) {
    this.angle += dt * 0.5;
    if (this.car) {
      this.car.root.rotation.y = this.angle;
      this.car.animate(0, 0, dt);
    }
  }
}
