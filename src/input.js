// Keyboard + on-screen touch buttons, merged into one control state.

const touch = { left: false, right: false, gas: false, brake: false, nitro: false };
const keys = new Set();

addEventListener('keydown', (e) => keys.add(e.code));
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => {
  keys.clear();
  for (const k in touch) touch[k] = false;
});

const any = (...codes) => codes.some((c) => keys.has(c));

// ---- tilt steering: tip the tablet left/right like a steering wheel ----
const TILT_FULL = 22; // degrees of tilt for full steering lock
const TILT_DEAD = 0.08; // ignore tiny wobbles around level
let tilt = null; // -1..1 once readings arrive, null when tilt steering is off

function onTilt(e) {
  if (e.beta == null || e.gamma == null) return;
  const b = (e.beta * Math.PI) / 180, g = (e.gamma * Math.PI) / 180;
  // How much of gravity points toward the right edge of the screen. This works whether the tablet is
  // lying nearly flat or held up like a wheel, and in any of the four screen rotations.
  const turned = (((screen.orientation?.angle ?? window.orientation ?? 0) % 360) + 360) % 360;
  const right = turned === 90 ? Math.sin(b) : turned === 270 ? -Math.sin(b) : (turned === 180 ? -1 : 1) * Math.cos(b) * Math.sin(g);
  const v = right / Math.sin((TILT_FULL * Math.PI) / 180);
  tilt = Math.abs(v) < TILT_DEAD ? 0 : Math.max(-1, Math.min(1, v));
}

// Browsers only give tilt readings to touch devices on https pages (or localhost).
export const tiltSupported = () => 'DeviceOrientationEvent' in window && window.isSecureContext && isTouchDevice();

// Turns tilt steering on or off. Must be called from a tap: iPads ask the player for permission.
// Resolves to whether it is now on.
export async function setTilt(on) {
  removeEventListener('deviceorientation', onTilt);
  tilt = null;
  if (!on || !tiltSupported()) return false;
  try {
    const ask = DeviceOrientationEvent.requestPermission;
    if (typeof ask === 'function' && (await ask.call(DeviceOrientationEvent)) !== 'granted') return false;
  } catch {
    return false;
  }
  addEventListener('deviceorientation', onTilt);
  return true;
}

export function readControls(autoGas) {
  const left = touch.left || any('ArrowLeft', 'KeyA');
  const right = touch.right || any('ArrowRight', 'KeyD');
  const brake = touch.brake || any('ArrowDown', 'KeyS', 'Space');
  const gas = touch.gas || any('ArrowUp', 'KeyW') || (autoGas && !brake);
  // buttons and keys win over tilt, so the arrows still work as a backup
  const steer = (right ? 1 : 0) - (left ? 1 : 0) || (tilt ?? 0);
  const nitro = touch.nitro || any('ShiftLeft', 'ShiftRight', 'KeyN');
  return { steer, throttle: gas ? 1 : 0, brake: brake ? 1 : 0, nitro: nitro ? 1 : 0 };
}

export function bindTouchButtons(root) {
  for (const k in touch) touch[k] = false;
  root.querySelectorAll('[data-key]').forEach((el) => {
    const k = el.dataset.key;
    const on = (e) => {
      e.preventDefault();
      touch[k] = true;
      el.classList.add('on');
      try { el.setPointerCapture(e.pointerId); } catch {}
    };
    const off = () => {
      touch[k] = false;
      el.classList.remove('on');
    };
    el.addEventListener('pointerdown', on);
    for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) el.addEventListener(t, off);
  });
}

export const isTouchDevice = () => navigator.maxTouchPoints > 0 || 'ontouchstart' in window;
