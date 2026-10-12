import { Scene } from '@babylonjs/core/scene';
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';

import { TRACKS, COLORS, LAPS } from './data.js';
import { buildTrack, wrapAngle } from './trackmath.js';
import { buildWorld } from './world.js';
import { buildCar } from './carmesh.js';
import { makeCar, stepCar, collide, progress, resetCar } from './physics.js';
import { aiControls, rubberBand } from './ai.js';
import { readControls } from './input.js';

const SKY = '#9fd3ff';

export class Race {
  constructor(engine, save, hud, onFinish) {
    this.hud = hud;
    this.onFinish = onFinish;
    this.autoGas = save.autoGas;
    this.readControls = readControls; // swappable (tests drive the player with the AI)
    const def = TRACKS[save.track];
    this.hw = def.width / 2;
    this.track = buildTrack(def.points);

    const scene = (this.scene = new Scene(engine));
    scene.clearColor = Color4.FromHexString(SKY + 'ff');
    scene.fogMode = Scene.FOGMODE_EXP2;
    scene.fogDensity = 0.0035;
    scene.fogColor = Color3.FromHexString(SKY);
    scene.skipPointerMovePicking = true;

    const hemi = new HemisphericLight('hemi', new Vector3(0, 1, 0), scene);
    hemi.intensity = 0.75;
    hemi.groundColor = new Color3(0.35, 0.4, 0.35);
    const sun = new DirectionalLight('sun', new Vector3(-0.4, -1, 0.3), scene);
    sun.intensity = 0.6;

    buildWorld(scene, this.track, def);

    // Grid: 2x2 behind the start line. Player starts 3rd so there's someone to pass.
    const n = this.track.count;
    const slots = [[n - 4, -3.5], [n - 4, 3.5], [n - 9, -3.5], [n - 9, 3.5]];
    const others = Object.keys(COLORS).filter((c) => c !== save.car.color).sort(() => Math.random() - 0.5);
    const skills = [0.92, 0.88, 0.84];
    this.cars = slots.map(([idx, lat], k) => {
      const isPlayer = k === 2;
      const cfg = isPlayer ? save.car : { ...save.car, color: others[k % others.length], spoiler: 'none', wheels: 'black' };
      const mesh = buildCar(scene, cfg);
      const c = makeCar(mesh.stats, this.track, idx, lat);
      c.mesh = mesh;
      c.isPlayer = isPlayer;
      c.skill = isPlayer ? 1 : skills.pop();
      return c;
    });
    this.player = this.cars[2];

    const cam = (this.camera = new FreeCamera('cam', new Vector3(0, 5, 0), scene));
    cam.minZ = 0.3;
    cam.maxZ = 1500;
    cam.fov = 0.95;
    this.camH = this.player.h;
    this.placeCamera(1);

    this.t = -3; // countdown
    this.finishedOrder = [];
    this.doneTimer = -1;
  }

  reset() {
    if (this.t > 0 && !this.player.finished) resetCar(this.player, this.track);
  }

  placeCamera(k) {
    const p = this.player;
    this.camH += wrapAngle(p.h - this.camH) * k;
    const fx = Math.sin(this.camH), fz = Math.cos(this.camH);
    const target = new Vector3(p.x - fx * 9, 4.2, p.z - fz * 9);
    this.camera.position = Vector3.Lerp(this.camera.position, target, k);
    this.camera.setTarget(new Vector3(p.x + fx * 5, 1.2, p.z + fz * 5));
  }

  update(dt) {
    this.t += dt;
    const n = this.track.count;
    const racing = this.t >= 0;
    const pp = progress(this.player, n);

    for (const c of this.cars) {
      let ctrl = { steer: 0, throttle: 0, brake: 0 };
      if (racing) {
        if (c.isPlayer) ctrl = c.finished ? { steer: 0, throttle: 0, brake: 1 } : this.readControls(this.autoGas);
        else ctrl = aiControls(c, this.track, this.hw, dt, rubberBand(progress(c, n), pp));
      }
      stepCar(c, ctrl, dt, this.track, this.hw);
      if (!c.finished && c.lap >= LAPS) {
        c.finished = true;
        c.finishTime = this.t;
        this.finishedOrder.push(c);
        if (c.isPlayer) {
          c.place = this.finishedOrder.length;
          this.doneTimer = 2.2;
        }
      }
    }
    collide(this.cars);

    for (const c of this.cars) {
      c.mesh.root.position.set(c.x, 0, c.z);
      c.mesh.root.rotation.y = c.h;
      c.mesh.animate(c.speed, c.steer, dt);
    }
    this.placeCamera(1 - Math.exp(-dt * 6));
    this.updateHud();

    if (this.doneTimer > 0) {
      this.doneTimer -= dt;
      if (this.doneTimer <= 0) this.onFinish(this.player.place);
    }
  }

  updateHud() {
    const n = this.track.count;
    const p = this.player;
    let place;
    if (p.finished) place = p.place;
    else {
      const ahead = this.cars.filter((c) => c !== p && (c.finished || progress(c, n) > progress(p, n))).length;
      place = ahead + 1;
    }
    const lap = Math.min(LAPS, Math.max(1, p.lap + 1));
    let count = '';
    if (this.t < 0) count = String(Math.ceil(-this.t));
    else if (this.t < 0.8) count = 'GO!';
    if (p.finished) count = place === 1 ? 'YOU WIN!' : 'FINISH!';
    this.hud.set(ordinal(place), `Lap ${lap}/${LAPS}`, count, p.offroad);
  }

  dispose() {
    this.scene.dispose();
  }
}

export function ordinal(n) {
  return n + (['th', 'st', 'nd', 'rd'][n] || 'th');
}
