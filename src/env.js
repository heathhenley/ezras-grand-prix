// Shared look: sky lighting, sun + real shadows, tone mapping, and the PBR material helper.
// Everything in public/assets is CC0 (free to use, no credit needed):
//   sky.env / sky.jpg  "Kloofendal 48d Partly Cloudy (Pure Sky)", polyhaven.com
//                      (sky.env is the lighting baked from it, sky.jpg is the picture you see)
//   asphalt_*.jpg      "Asphalt Track", polyhaven.com
//   grass_diff.jpg     "Grass 005", ambientcg.com
//   sand_diff.jpg      "Sand 01", polyhaven.com
//   lava.jpg           "Lava 004", ambientcg.com
//   lava_crust.jpg     "Lava 002", ambientcg.com
import { CubeTexture } from '@babylonjs/core/Materials/Textures/cubeTexture';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { ImageProcessingConfiguration } from '@babylonjs/core/Materials/imageProcessingConfiguration';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import '@babylonjs/core/Materials/Textures/Loaders/envTextureLoader';
import '@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent';
import { DefaultRenderingPipeline } from '@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline';
import '@babylonjs/core/PostProcesses/RenderPipeline/postProcessRenderPipelineManagerSceneComponent';

export const asset = (name) => `${import.meta.env.BASE_URL}assets/${name}`;

// Colour of the haze at the bottom of the sky picture; fog fades the ground into it.
export const HORIZON = '#a8bacf'; // a soft sky blue, so the distance looks airy rather than grey

// Where the sun sits in the sky picture (unit vector pointing at it).
const SUN_DIR = new Vector3(0.531, 0.7325, 0.426).normalize();

// How far around the followed point shadows are drawn, in meters.
const SHADOW_RANGE = 45;

export function pbr(scene, name, hex, roughness = 0.9, metallic = 0) {
  const m = new PBRMaterial(name, scene);
  m.albedoColor = Color3.FromHexString(hex).toLinearSpace();
  m.roughness = roughness;
  m.metallic = metallic;
  return m;
}

export function tiled(scene, file, uScale, vScale) {
  const t = new Texture(asset(file), scene);
  t.uScale = uScale;
  t.vScale = vScale;
  t.anisotropicFilteringLevel = 8;
  return t;
}

// Lights a scene from the sky. Returns { sun, shadows, follow(x, z) }.
// look (optional, per track - see `sky` in data.js) changes the mood: sun: colour of the sunlight,
// tint: [colour, strength 0..1] washed over the whole sky, bright: overall brightness (1 = normal).
export function setupSky(scene, { showSky = true, range = SHADOW_RANGE, look = {}, shadows: wantShadows = true } = {}) {
  scene.environmentTexture = CubeTexture.CreateFromPrefilteredData(asset('sky.env'), scene);
  scene.environmentIntensity = 1.5;

  const ip = scene.imageProcessingConfiguration;
  ip.toneMappingEnabled = true;
  ip.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_KHR_PBR_NEUTRAL; // keeps bright paint colourful
  ip.exposure = 1.1 * (look.bright ?? 1);
  ip.contrast = 1.15;

  const sun = new DirectionalLight('sun', SUN_DIR.scale(-1), scene);
  sun.intensity = 2.4;
  sun.diffuse = look.sun ? Color3.FromHexString(look.sun) : new Color3(1, 0.96, 0.88);
  sun.autoUpdateExtends = false;
  sun.orthoLeft = sun.orthoBottom = -range;
  sun.orthoRight = sun.orthoTop = range;
  sun.shadowMinZ = 1;
  sun.shadowMaxZ = 260;

  let shadows = null; // (a scene that only takes still pictures of cars can do without them)
  if (wantShadows) {
    shadows = new ShadowGenerator(2048, sun);
    shadows.usePercentageCloserFiltering = true;
    shadows.filteringQuality = ShadowGenerator.QUALITY_MEDIUM;
    shadows.bias = 0.002;
    shadows.normalBias = 0.02;
    shadows.darkness = 0.15;
  }

  // The shadow map only covers the area around this point, so keep it on the action.
  const follow = (x, z) => sun.position.set(x + SUN_DIR.x * 120, SUN_DIR.y * 120, z + SUN_DIR.z * 120);
  follow(0, 0);

  if (showSky) {
    const dome = MeshBuilder.CreateSphere('sky', { diameter: 2600, segments: 24, sideOrientation: Mesh.BACKSIDE }, scene);
    const sm = new StandardMaterial('sky', scene);
    const tex = new Texture(asset('sky.jpg'), scene, true); // no mipmaps: they draw a thin seam where the picture wraps
    tex.coordinatesMode = Texture.FIXED_EQUIRECTANGULAR_MODE;
    sm.reflectionTexture = tex;
    sm.disableLighting = true;
    sm.fogEnabled = false;
    // the picture is already tone mapped, so it skips the scene's tone mapping
    sm.imageProcessingConfiguration = new ImageProcessingConfiguration();
    dome.material = sm;
    dome.infiniteDistance = true;
    dome.isPickable = false;
    if (look.tint) {
      // a see-through coloured shell just inside the sky picture
      const veil = MeshBuilder.CreateSphere('skyTint', { diameter: 2500, segments: 12, sideOrientation: Mesh.BACKSIDE }, scene);
      const vm = new StandardMaterial('skyTint', scene);
      vm.emissiveColor = Color3.FromHexString(look.tint[0]);
      vm.disableLighting = true;
      vm.fogEnabled = false;
      vm.alpha = look.tint[1];
      vm.imageProcessingConfiguration = new ImageProcessingConfiguration();
      veil.material = vm;
      veil.infiniteDistance = true;
      veil.isPickable = false;
    }
  }

  return { sun, shadows, follow };
}

export function castShadows(shadows, root) {
  for (const m of root.getChildMeshes()) if (m.name !== 'contact') shadows.addShadowCaster(m, false);
}

// A soft dark edge round the screen, so the eye goes to the middle. Used by the scene and the sky.
function vignette(ip) {
  ip.vignetteEnabled = true;
  ip.vignetteWeight = 1.25;
  ip.vignetteStretch = 0.3;
  ip.vignetteColor.set(0.05, 0.07, 0.16, 0); // a navy tint rather than black: friendlier
  ip.vignetteBlendMode = ImageProcessingConfiguration.VIGNETTEMODE_MULTIPLY;
}

// Post-processing for the race camera: anti-aliasing, a gentle glow on bright things (lamps, flames,
// sparks) and a touch of colour fringing while boosting. Tone mapping stays in the materials (see
// setupSky) so the sky picture can skip it. If the frame rate drops, the extras switch off one by one.
// Returns { update(dt, player), dispose() }.
export function setupPost(scene, camera, { touch = false } = {}) {
  vignette(scene.imageProcessingConfiguration);
  const sky = scene.getMaterialByName('sky');
  if (sky?.imageProcessingConfiguration) vignette(sky.imageProcessingConfiguration);

  const engine = scene.getEngine();
  const pipe = new DefaultRenderingPipeline('post', false, scene, [camera]);
  pipe.imageProcessingEnabled = false;
  pipe.samples = engine.webGLVersion >= 2 ? 4 : 1; // MSAA is nearly free on tablet GPUs
  pipe.fxaaEnabled = pipe.samples < 2;
  pipe.bloomEnabled = true;
  pipe.bloomThreshold = 0.88;
  pipe.bloomWeight = 0.25;
  pipe.bloomKernel = touch ? 32 : 48;
  pipe.bloomScale = touch ? 0.35 : 0.5;
  pipe.chromaticAberrationEnabled = !touch;
  if (!touch) { pipe.chromaticAberration.aberrationAmount = 0; pipe.chromaticAberration.radialIntensity = 1.5; } // clean in the middle

  let fringe = 0, slow = 0, step = 0, watch = 0;
  return {
    update(dt, player) {
      // frame rate watchdog: after a few seconds of struggling, drop the next most expensive extra
      watch += dt;
      if (watch > 2) slow = dt > 1 / 45 ? slow + dt : Math.max(0, slow - dt * 0.5);
      if (slow > 2.5 && step < 3) {
        slow = 0;
        step++;
        if (step === 1) pipe.bloomEnabled = false;
        if (step === 2) pipe.chromaticAberrationEnabled = false;
        if (step === 3) { pipe.samples = 1; pipe.fxaaEnabled = true; }
      }
      if (pipe.chromaticAberrationEnabled && pipe.chromaticAberration) { // null once the pipeline is disposed
        fringe += ((player.boost > 0 ? 9 : 0) - fringe) * Math.min(1, dt * 5);
        pipe.chromaticAberration.aberrationAmount = fringe;
      }
    },
    dispose() { pipe.dispose(); },
  };
}
