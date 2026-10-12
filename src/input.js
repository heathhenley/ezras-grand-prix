// Keyboard + on-screen touch buttons, merged into one control state.

const touch = { left: false, right: false, gas: false, brake: false };
const keys = new Set();

addEventListener('keydown', (e) => keys.add(e.code));
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => {
  keys.clear();
  for (const k in touch) touch[k] = false;
});

const any = (...codes) => codes.some((c) => keys.has(c));

export function readControls(autoGas) {
  const left = touch.left || any('ArrowLeft', 'KeyA');
  const right = touch.right || any('ArrowRight', 'KeyD');
  const brake = touch.brake || any('ArrowDown', 'KeyS', 'Space');
  const gas = touch.gas || any('ArrowUp', 'KeyW') || (autoGas && !brake);
  return { steer: (right ? 1 : 0) - (left ? 1 : 0), throttle: gas ? 1 : 0, brake: brake ? 1 : 0 };
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
