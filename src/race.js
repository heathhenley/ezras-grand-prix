import { Scene } from '@babylonjs/core/scene';
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';

import { TRACKS, COLORS, BODIES, WHEELS, SPOILERS, MACHINES, LAPS } from './data.js';
import { buildTrack, wrapAngle } from './trackmath.js';
import { buildWorld } from './world.js';
import { buildCar } from './carmesh.js';
import { makeCar, stepCar, collide, progress, resetCar, rescue, addHazards, stepObstacles, slipstream, fireNitro } from './physics.js';
import { placePickups, stepPickups, buildPickups } from './pickups.js';
import { KINDS as ANIMALS } from './animals.js';
import { aiControls, rubberBand, difficulty } from './ai.js';
import { readControls, isTouchDevice } from './input.js';
import { setupSky, castShadows, HORIZON } from './env.js';
import * as sound from './sound.js';
import { createFx } from './fx.js';

export class Race {
  constructor(engine, save, hud, onFinish) {
    this.hud = hud;
    this.onFinish = onFinish;
    this.autoGas = save.autoGas;
    this.readControls = readControls; // swappable (tests drive the player with the AI)
    const def = TRACKS[save.track];
    this.hw = def.width / 2;
    this.track = buildTrack(def.points);
    addHazards(this.track, this.hw, def, { ...ANIMALS, ...MACHINES });
    placePickups(this.track, this.hw, def); // boost pads and nitro stars

    const scene = (this.scene = new Scene(engine));
    const haze = def.sky?.haze ?? HORIZON; // colour the distance fades into
    scene.clearColor = Color4.FromHexString(haze + 'ff');
    scene.fogMode = Scene.FOGMODE_EXP2;
    scene.fogDensity = def.sky?.fog ?? 0.0035;
    scene.fogColor = Color3.FromHexString(haze);
    scene.skipPointerMovePicking = true;

    this.sky = setupSky(scene, { look: def.sky });

    this.world = buildWorld(scene, this.track, def, this.sky.shadows); // world.update(t): start lights, fans, flags
    this.pickups = buildPickups(scene, this.track);

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
    // particles, chase camera and post-processing (fx.js)
    this.fx = createFx(scene, cam, { def, touch: isTouchDevice() });
    this.fx.rig.update(0, this);
    this.sky.follow(this.player.x, this.player.z);

    this.t = -3; // countdown
    this.hitCooldown = 0;
    sound.engineStart(this.cars.length - 1, save.track); // the track picks the background sounds (birds, crowd, wind)
    this.finishedOrder = [];
    this.doneTimer = -1;
  }

  reset() {
    if (this.t > 0 && !this.player.finished) resetCar(this.player, this.track);
  }

  // Nitro: fired by the button, or (with auto gas on, for the littlest drivers) all by itself once the
  // meter is full and the road ahead is straight.
  useNitro(c, ctrl) {
    if (c.isPlayer && this.autoGas && c.nitro >= 1 && !c.finished) {
      const s = this.track.samples, n = this.track.count;
      if (s[c.idx].curve < 0.15 && s[(c.idx + 15) % n].curve < 0.15) ctrl.nitro = 1;
    }
    // the player's button fires once per press, so holding it down does not waste a refilling meter
    const press = ctrl.nitro && !(c.isPlayer && c.nitroHeld);
    if (c.isPlayer) c.nitroHeld = !!ctrl.nitro;
    if (!press || !fireNitro(c)) return;
    if (c.isPlayer) {
      sound.boost?.();
      this.hud.banner?.('NITRO!', 'blue', { hold: 0.8 });
      this.fx?.shake?.(0.3);
    }
    this.fx?.burst?.('boostFlame', c.x, c.y + 0.5, c.z, 1);
  }

  // Big air earns a cheer (the nitro for it is added in stepCar)
  landedJump(c) {
    if (!c.isPlayer || c.airTime < 0.5) return;
    this.hud.banner?.(c.airTime > 0.85 ? 'MEGA JUMP!' : 'NICE JUMP!', 'pink', { hold: 0.9 });
    sound.cheer?.();
  }

  // Slipstream, boost pads and stars, once a frame while racing
  stepBoosts(dt) {
    slipstream(this.cars, this.track, dt);
    stepPickups(this.track, this.cars, dt,
      (c) => {
        this.fx?.burst?.('boostFlame', c.x, c.y + 0.5, c.z, 0.6);
        if (!c.isPlayer) return;
        sound.boost?.();
        this.hud.banner?.('BOOST!', 'blue', { hold: 0.6 });
      },
      (c, s) => {
        if (!c.isPlayer) return;
        sound.pickup?.();
        this.fx?.burst?.('confetti', s.x, s.y + 0.8, s.z, 0.2);
      });
    const p = this.player;
    this.hud.nitro?.(p.nitro);
    // tell the player once each time the meter fills (with auto gas it fires by itself instead)
    if (p.nitro >= 1 && !this.nitroTold && !this.autoGas) this.hud.banner?.('NITRO READY!', 'green', { hold: 1.2, sub: 'Press NITRO!' });
    this.nitroTold = p.nitro >= 1;
  }

  update(dt) {
    this.t += dt;
    this.world?.update?.(this.t);
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
          sound.engineSet(Math.abs(c.speed) / c.stats.max, !!ctrl.throttle, c.boost > 0);
          this.playerBraking = !!ctrl.brake;
        }
        else ctrl = aiControls(c, this.track, this.hw, dt, rubberBand(progress(c, n), pp, c.ai), this.inTheWay);
        this.useNitro(c, ctrl);
      }
      stepCar(c, ctrl, dt, this.track, this.hw);
      if (c.landed) this.landedJump(c);
      if (racing && !c.isPlayer && !c.finished) rescue(c, this.track, dt); // un-wedge a stuck rival
      if (!c.finished && c.lap >= LAPS) {
        c.finished = true;
        c.finishTime = this.t;
        this.finishedOrder.push(c);
        if (c.isPlayer) {
          c.place = this.finishedOrder.length;
          this.doneTimer = 2.2;
          sound.crossLine?.(c.place); // crowd roar, and the race music bows out
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
      const p = this.player;
      this.fx.burst('sparks', p.x + Math.sin(p.h) * 1.8, p.y + 0.5, p.z + Math.cos(p.h) * 1.8, p.bonk / 14);
      this.fx.shake(Math.min(0.5, p.bonk / 30));
    }
    for (const hit of collide(this.cars)) {
      if ((hit.a.isPlayer || hit.b.isPlayer) && hit.impact > 2.5 && this.hitCooldown <= 0) {
        sound.hit(Math.min(1, hit.impact / 14));
        this.hitCooldown = 0.3;
        this.fx.shake(Math.min(0.45, hit.impact / 28));
      }
      // sparks where they touched, for anyone's bump (fx skips the ones too far away to see)
      if (hit.impact > 3) this.fx.burst('sparks', (hit.a.x + hit.b.x) / 2, 0.6 + Math.max(hit.a.y, hit.b.y), (hit.a.z + hit.b.z) / 2, hit.impact / 14);
    }
    if (racing) this.stepBoosts(dt);
    this.pickups.update(dt, this.t);

    for (const c of this.cars) {
      c.mesh.root.position.set(c.x, 0, c.z);
      c.mesh.root.rotation.y = c.h;
      c.mesh.lift(c.y, c.air ? -c.vy / Math.max(8, c.speed) : -c.climb / Math.max(8, c.speed), dt);
      c.mesh.animate(c.speed, c.steer, dt);
    }
    this.fx.update(dt, this); // particles and the camera
    this.sky.follow(this.player.x, this.player.z);
    this.updateHud(dt);

    if (this.doneTimer > 0) {
      this.doneTimer -= dt;
      // runaway: the player won and nobody else has even finished yet
      if (this.doneTimer <= 0) this.onFinish(this.player.place, this.player.place === 1 && this.finishedOrder.length === 1, { time: this.player.finishTime, best: this.hs?.best ?? 0 });
    }
  }

  // Feeds the HUD. Each hud call is cheap and only touches the page when its value changes.
  updateHud(dt = 0) {
    const n = this.track.count, p = this.player, hud = this.hud, t = this.t;
    const hs = (this.hs ??= { shown: 3, pend: 3, held: 0, maxLap: 0, lapStart: 0, best: 0, wrong: 0 });
    const racing = t >= 0;

    // start lights: one more red lamp each second, then all green and GO!
    const lights = t < 0 ? Math.max(1, Math.min(3, 4 - Math.ceil(-t))) : t < 1 ? 'go' : null;
    if (lights !== hs.lights) {
      hs.lights = lights;
      if (lights === 'go') { hud.banner('GO!', 'green', { hold: 0.7 }); sound.lightsBeep ? sound.lightsBeep(true) : sound.go(); }
      else if (lights) sound.lightsBeep ? sound.lightsBeep(false) : sound.countdown();
      hud.lights(lights);
    }

    // place: only counts a change once it has held for a moment, so two cars side by side don't flicker it
    let place = p.place;
    if (!p.finished) place = 1 + this.cars.filter((c) => c !== p && (c.finished || progress(c, n) > progress(p, n))).length;
    if (place !== hs.pend) { hs.pend = place; hs.held = 0; } else hs.held += dt;
    if (hs.pend !== hs.shown && (hs.held > 0.25 || p.finished || !racing)) {
      const gained = racing ? Math.sign(hs.shown - hs.pend) : 0;
      if (gained > 0 && !p.finished) sound.overtake?.();
      hs.shown = hs.pend;
      hud.place(hs.shown, gained);
    } else hud.place(hs.shown);

    // laps: flash the lap time as each one is done, and a banner for the last lap
    if (p.lap > hs.maxLap) {
      hs.maxLap = p.lap;
      const lapTime = t - hs.lapStart, isBest = !hs.best || lapTime < hs.best;
      hs.lapStart = t;
      if (isBest) hs.best = lapTime;
      hud.best(hs.best);
      if (!p.finished) {
        hud.lapDone(p.lap, lapTime, isBest);
        if (p.lap === LAPS - 1) { hud.banner('FINAL LAP!', 'gold', { slide: true, hold: 1.6 }); sound.finalLap ? sound.finalLap() : sound.lap?.(); }
        else sound.lap?.();
      }
    }
    hud.lap(Math.min(LAPS, Math.max(1, p.lap + 1)), LAPS);
    hud.timer(racing ? (p.finished ? p.finishTime : t) : 0);

    // gauges
    const speed = Math.abs(p.speed), frac = speed / p.stats.max;
    hud.speed(speed * 3.6, frac);
    if (p.nitro !== undefined) hud.nitro(p.nitro);
    hud.fast(racing ? frac : 0, p.boost > 0);
    hud.offroad(racing && p.offroad && !p.finished);

    // facing back round the track for a second: a friendly nudge (kept up while it stays true)
    const s = this.track.samples[p.idx];
    const backwards = racing && !p.finished && !p.air && p.speed > 3 && Math.abs(wrapAngle(p.h - s.heading)) > 1.9;
    hs.wrong = backwards ? hs.wrong + dt : 0;
    if (hs.wrong > 1) hud.banner('WRONG WAY', 'red', { hold: 0.5 });

    if (p.finished) hud.finish(p.place);
    hud.dots();
  }

  dispose() {
    sound.engineStop();
    this.fx.dispose();
    this.scene.dispose();
  }
}

const pick = (table) => { const ids = Object.keys(table); return ids[Math.floor(Math.random() * ids.length)]; };

export function ordinal(n) {
  return n + (['th', 'st', 'nd', 'rd'][n] || 'th');
}
