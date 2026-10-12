import { Scene } from '@babylonjs/core/scene';
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';

import { TRACKS, COLORS, BODIES, WHEELS, SPOILERS, LAPS } from './data.js';
import { buildTrack, wrapAngle } from './trackmath.js';
import { buildWorld } from './world.js';
import { buildCar } from './carmesh.js';
import { makeCar, stepCar, collide, progress, resetCar, rescue, addJumps, addObstacles, addCrossers, stepObstacles } from './physics.js';
import { KINDS as ANIMALS } from './animals.js';
import { aiControls, rubberBand, difficulty } from './ai.js';
import { readControls } from './input.js';
import { setupSky, castShadows, HORIZON } from './env.js';
import * as sound from './sound.js';

export class Race {
  constructor(engine, save, hud, onFinish) {
    this.hud = hud;
    this.onFinish = onFinish;
    this.autoGas = save.autoGas;
    this.readControls = readControls; // swappable (tests drive the player with the AI)
    const def = TRACKS[save.track];
    this.hw = def.width / 2;
    this.track = buildTrack(def.points);
    addJumps(this.track, def.jumps);
    addObstacles(this.track, this.hw, def.obstacles);
    addCrossers(this.track, this.hw, (def.crossers ?? []).map(([kind, at]) => ({ kind, at, r: ANIMALS[kind].girth, pace: ANIMALS[kind].pace * 1.6 })));

    const scene = (this.scene = new Scene(engine));
    const haze = def.sky?.haze ?? HORIZON; // colour the distance fades into
    scene.clearColor = Color4.FromHexString(haze + 'ff');
    scene.fogMode = Scene.FOGMODE_EXP2;
    scene.fogDensity = def.sky?.fog ?? 0.0035;
    scene.fogColor = Color3.FromHexString(haze);
    scene.skipPointerMovePicking = true;

    this.sky = setupSky(scene, { look: def.sky });

    buildWorld(scene, this.track, def, this.sky.shadows);

    // Grid: 2x2 behind the start line. Player starts 3rd so there's someone to pass.
    const n = this.track.count;
    const slots = [[n - 4, -3.5], [n - 4, 3.5], [n - 9, -3.5], [n - 9, 3.5]];
    const others = Object.keys(COLORS).filter((c) => c !== save.car.color).sort(() => Math.random() - 0.5);
    const rivals = difficulty(save.level);
    const skills = [...rivals.skills];
    this.cars = slots.map(([idx, lat], k) => {
      const isPlayer = k === 2;
      // rivals turn up in any car, even ones the player has not unlocked yet
      const cfg = isPlayer ? save.car : { body: pick(BODIES), color: others[k % others.length], wheels: pick(WHEELS), spoiler: pick(SPOILERS) };
      const mesh = buildCar(scene, cfg);
      castShadows(this.sky.shadows, mesh.root);
      // ...but everyone gets the player's engine, so the race is decided by driving, not by the car
      const c = makeCar(BODIES[save.car.body].stats, this.track, idx, lat);
      c.mesh = mesh;
      c.color = COLORS[cfg.color].hex;
      c.isPlayer = isPlayer;
      c.skill = isPlayer ? 1 : skills.pop();
      if (!isPlayer) { c.ai = rivals; c.maxScale = rivals.maxScale; }
      return c;
    });
    this.player = this.cars[2];
    this.inTheWay = [...this.cars, ...this.track.obstacles]; // what rival drivers steer round
    hud.map(this.track, this.cars);

    const cam = (this.camera = new FreeCamera('cam', new Vector3(0, 5, 0), scene));
    cam.minZ = 0.3;
    cam.maxZ = 1500;
    cam.fov = 0.95;
    this.camH = this.player.h;
    this.placeCamera(1);
    this.sky.follow(this.player.x, this.player.z);

    this.t = -3; // countdown
    this.lastCount = '';
    this.hitCooldown = 0;
    sound.engineStart(this.cars.length - 1);
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
    const target = new Vector3(p.x - fx * 9, 4.2 + p.y * 0.6, p.z - fz * 9);
    this.camera.position = Vector3.Lerp(this.camera.position, target, k);
    this.camera.setTarget(new Vector3(p.x + fx * 5, 1.2 + p.y * 0.8, p.z + fz * 5));
  }

  update(dt) {
    this.t += dt;
    const n = this.track.count;
    const racing = this.t >= 0;
    const pp = progress(this.player, n);
    stepObstacles(this.track, dt);

    for (const c of this.cars) {
      let ctrl = { steer: 0, throttle: 0, brake: 0 };
      if (racing) {
        if (c.isPlayer) {
          // after the finish: brake to a stop (holding the brake at a standstill would start reversing)
          ctrl = c.finished ? { steer: 0, throttle: 0, brake: c.speed > 1 ? 1 : 0 } : this.readControls(this.autoGas);
          sound.engineSet(Math.abs(c.speed) / c.stats.max, !!ctrl.throttle);
          this.playerBraking = !!ctrl.brake;
        }
        else ctrl = aiControls(c, this.track, this.hw, dt, rubberBand(progress(c, n), pp, c.ai), this.inTheWay);
      }
      stepCar(c, ctrl, dt, this.track, this.hw);
      if (racing && !c.isPlayer && !c.finished) rescue(c, this.track, dt); // un-wedge a stuck rival
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
    // rival engines: louder as they get close, and from the side they are on
    const me = this.player, rx = Math.cos(this.camH), rz = -Math.sin(this.camH); // rx, rz: the camera's right
    let k = 0;
    for (const c of this.cars) {
      if (c === me) continue;
      const dx = c.x - me.x, dz = c.z - me.z, far = Math.hypot(dx, dz);
      sound.rivalSet(k++, Math.abs(c.speed) / c.stats.max, far, far > 0.1 ? Math.max(-1, Math.min(1, ((dx * rx + dz * rz) / far) * 0.8)) : 0);
    }
    // tyre squeal: turning hard at speed, or braking hard at speed, on tarmac
    const fast = Math.abs(me.speed) / me.stats.max;
    const cornering = Math.abs(me.steer) * fast, braking = this.playerBraking && fast > 0.45 ? 0.75 : 0;
    const sliding = racing && !me.air && !me.offroad && !me.finished ? Math.max((cornering - 0.5) / 0.35, braking) : 0;
    sound.screechSet(sliding);
    if (this.player.landed) sound.hit(0.45); // thump down after a jump
    this.hitCooldown -= dt;
    if (this.player.bonk > 2 && this.hitCooldown <= 0) { // drove into a tree
      sound.hit(Math.min(1, this.player.bonk / 18));
      this.hitCooldown = 0.3;
    }
    for (const hit of collide(this.cars)) {
      if ((hit.a.isPlayer || hit.b.isPlayer) && hit.impact > 2.5 && this.hitCooldown <= 0) {
        sound.hit(Math.min(1, hit.impact / 14));
        this.hitCooldown = 0.3;
      }
    }

    for (const c of this.cars) {
      c.mesh.root.position.set(c.x, 0, c.z);
      c.mesh.root.rotation.y = c.h;
      c.mesh.lift(c.y, c.air ? -c.vy / Math.max(8, c.speed) : -c.climb / Math.max(8, c.speed), dt);
      c.mesh.animate(c.speed, c.steer, dt);
    }
    this.placeCamera(1 - Math.exp(-dt * 6));
    this.sky.follow(this.player.x, this.player.z);
    this.updateHud();

    if (this.doneTimer > 0) {
      this.doneTimer -= dt;
      // runaway: the player won and nobody else has even finished yet
      if (this.doneTimer <= 0) this.onFinish(this.player.place, this.player.place === 1 && this.finishedOrder.length === 1);
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
    if (count !== this.lastCount) {
      this.lastCount = count;
      if (count === 'GO!') sound.go();
      else if (count.length === 1) sound.countdown();
    }
    this.hud.set(ordinal(place), `Lap ${lap}/${LAPS}`, count, p.offroad);
    this.hud.dots();
  }

  dispose() {
    sound.engineStop();
    this.scene.dispose();
  }
}

const pick = (table) => { const ids = Object.keys(table); return ids[Math.floor(Math.random() * ids.length)]; };

export function ordinal(n) {
  return n + (['th', 'st', 'nd', 'rd'][n] || 'th');
}
