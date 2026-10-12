import { Engine } from '@babylonjs/core/Engines/engine';
import './style.css';

import { loadSave, writeSave } from './save.js';
import { isUnlocked, unlocksBetween, winsNeeded, itemName, KIND_LABEL } from './data.js';
import { MAX_LEVEL } from './ai.js';
import { Showroom } from './showroom.js';
import { Race } from './race.js';
import { bindTouchButtons, isTouchDevice, setTilt } from './input.js';
import { menuHtml, garageHtml, hudHtml, makeHud, resultsHtml, lockedHtml } from './ui.js';
import * as sound from './sound.js';

const canvas = document.getElementById('c');
const ui = document.getElementById('ui');

const engine = new Engine(canvas, true, { stencil: false, powerPreference: 'high-performance' }, false);
// Retina tablets at full resolution are expensive; 1.5x looks sharp and keeps the frame rate up.
engine.setHardwareScalingLevel(1 / Math.min(window.devicePixelRatio || 1, 1.5));

let save = loadSave();
sound.setEnabled(save.sound);
const showroom = new Showroom(engine);
showroom.setCar(save.car);

let screen = 'menu';
let race = null;
let result = null;

const panelSide = () => (innerWidth > innerHeight ? 'left' : 'bottom');

function show(next) {
  screen = next;
  ui.className = `screen-${screen}`;
  if (screen === 'menu') ui.innerHTML = menuHtml(save);
  if (screen === 'garage') ui.innerHTML = garageHtml(save);
  if (screen === 'results') ui.innerHTML = resultsHtml(result.place, result.unlocked, save);
  showroom.frame(panelSide());
}

function startRace() {
  endRace();
  if (save.tilt) setTilt(true); // has to be re-armed from a tap each time the page is opened
  screen = 'race';
  ui.className = 'screen-race';
  ui.innerHTML = hudHtml(isTouchDevice());
  bindTouchButtons(ui);
  race = new Race(engine, save, makeHud(ui), finishRace);
}

function finishRace(place) {
  const before = save.wins;
  save.races++;
  if (place === 1) save.wins++;
  // rivals get tougher after a win and ease off after a bad race, so it stays a close fight
  save.level = Math.max(0, Math.min(MAX_LEVEL, save.level + (place === 1 ? 1 : place >= 3 ? -1 : 0)));
  writeSave(save);
  result = { place, unlocked: unlocksBetween(before, save.wins) };
  endRace();
  show('results');
  if (place === 1) sound.win(); else sound.finish();
  if (result.unlocked.length) setTimeout(sound.prize, 1000);
}

function endRace() {
  race?.dispose();
  race = null;
}

const actions = {
  race: startRace,
  garage: () => show('garage'),
  menu: () => show('menu'),
  quit: () => { endRace(); show('menu'); },
  reset: () => race?.reset(),
  autogas: () => { save.autoGas = !save.autoGas; writeSave(save); show(screen); },
  tilt: async () => { save.tilt = await setTilt(!save.tilt); writeSave(save); if (screen === 'menu') show(screen); },
  sound: () => { save.sound = !save.sound; sound.setEnabled(save.sound); writeSave(save); show(screen); },
  track: ({ id }) => {
    if (!isUnlocked('track', id, save.wins)) return;
    save.track = id; writeSave(save); show(screen);
  },
  pick: ({ kind, id }) => {
    if (!isUnlocked(kind, id, save.wins)) return;
    save.car[kind] = id; writeSave(save);
    showroom.setCar(save.car);
    show(screen);
  },
};

ui.addEventListener('click', (e) => {
  const open = ui.querySelector('.modal');
  if (open) { open.remove(); sound.tap(); return; } // any tap closes the pop-up
  const el = e.target.closest('[data-action]');
  if (!el) return;
  sound.tap();
  if (el.classList.contains('locked')) {
    // tapped something not unlocked yet: say how many more wins it takes
    const kind = el.dataset.kind ?? 'track', id = el.dataset.id;
    ui.insertAdjacentHTML('beforeend', lockedHtml(winsNeeded(kind, id) - save.wins, itemName(kind, id), KIND_LABEL[kind]));
    return;
  }
  actions[el.dataset.action]?.(el.dataset);
});

// Stop iPad Safari from pinch-zooming / bouncing the page, but let the garage list scroll.
// Browsers keep sound off until the first tap or key press.
for (const ev of ['pointerdown', 'keydown']) addEventListener(ev, sound.unlock, { once: true });

document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('touchmove', (e) => { if (!e.target.closest('.scroll')) e.preventDefault(); }, { passive: false });

addEventListener('resize', () => {
  engine.resize();
  if (!race) showroom.frame(panelSide());
});

engine.runRenderLoop(() => {
  const dt = Math.min(engine.getDeltaTime() / 1000, 0.05);
  if (race) {
    race.update(dt);
    race?.scene.render(); // update() may have ended the race
  } else {
    showroom.update(dt);
    showroom.scene.render();
  }
});

show('menu');

if (import.meta.env.PROD && 'serviceWorker' in navigator && window.isSecureContext) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
