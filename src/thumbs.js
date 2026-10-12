// Small side-on pictures of the real car models, for the garage tiles.
// Each one is photographed once in a little scene of its own and then remembered.
import { Scene } from '@babylonjs/core/scene';
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import { Camera } from '@babylonjs/core/Cameras/camera';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Color4 } from '@babylonjs/core/Maths/math.color';
import { CreateScreenshotUsingRenderTargetAsync } from '@babylonjs/core/Misc/screenshotTools';
import { buildCar } from './carmesh.js';
import { setupSky } from './env.js';

const WIDE = 4.8; // meters of car the picture covers, nose to tail (tall is half that)
const SIZE = { width: 288, height: 144 }; // picture size in pixels; shown at about a third of that

export class PhotoBooth {
  constructor(engine) {
    this.engine = engine;
    const scene = (this.scene = new Scene(engine));
    scene.clearColor = new Color4(0, 0, 0, 0); // see-through background
    setupSky(scene, { showSky: false, shadows: false });
    // looking straight at the car's side from far away with no perspective, nose to the right
    const cam = (this.camera = new FreeCamera('side', new Vector3(30, 1.1, 0), scene));
    cam.setTarget(new Vector3(0, 1.1, 0));
    cam.mode = Camera.ORTHOGRAPHIC_CAMERA;
    cam.orthoLeft = -WIDE / 2;
    cam.orthoRight = WIDE / 2;
    cam.orthoBottom = -1.22; // the camera is 1.1 m up, so this is just below the tyres
    cam.orthoTop = WIDE / 2 - 1.22;
    this.done = new Map(); // look -> picture (a data: URL)
    this.queue = Promise.resolve(); // one photo at a time
  }

  // The picture for a look if it has already been taken, otherwise ''.
  get(cfg) {
    return this.done.get(JSON.stringify(cfg)) ?? '';
  }

  // Takes the picture (if needed) and resolves to it.
  shoot(cfg) {
    const key = JSON.stringify(cfg);
    if (this.done.has(key)) return Promise.resolve(this.done.get(key));
    const job = this.queue.then(async () => {
      if (this.done.has(key)) return this.done.get(key);
      const car = buildCar(this.scene, cfg);
      // Give up after a few seconds (it can stall if a race starts or ends at just the wrong moment);
      // the picture is simply tried again the next time it is needed.
      const giveUp = new Promise((_, fail) => setTimeout(() => fail(new Error('photo timed out')), 3000));
      try {
        const url = await Promise.race([giveUp, (async () => {
          // wait for this car's own materials (not for the whole scene: that can wait for ever on
          // leftovers from a race that was quit the moment it started)
          const parts = car.root.getChildMeshes();
          while (!parts.every((m) => m.isReady(true))) await new Promise((next) => setTimeout(next, 30));
          return CreateScreenshotUsingRenderTargetAsync(this.engine, this.camera, SIZE, 'image/png', 4);
        })()]);
        this.done.set(key, url);
        return url;
      } finally {
        car.dispose();
      }
    });
    this.queue = job.catch(() => {});
    return job;
  }
}
