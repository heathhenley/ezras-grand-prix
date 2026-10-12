import { Engine } from '@babylonjs/core/Engines/engine';
import './style.css';

import { loadSave, writeSave } from './save.js';
import { isUnlocked, unlocksBetween } from './data.js';
import { Showroom } from './showroom.js';
import { Race } from './race.js';
import { bindTouchButtons, isTouchDevice } from './input.js';
import { menuHtml, garageHtml, hudHtml, makeHud, resultsHtml } from './ui.js';

const canvas = document.getElementById('c');
const ui = document.getElementById('ui');

const engine = new Engine(canvas, true, { stencil: false, powerPreference: 'high-performance' }, false);
// Retina tablets at full resolution are expensive; 1.5x looks sharp and keeps the frame rate up.
engine.setHardwareScalingLevel(1 / Math.min(window.devicePixelRatio || 1, 1.5));

let save = loadSave();
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
  writeSave(save);
  result = { place, unlocked: unlocksBetween(before, save.wins) };
  endRace();
  show('results');
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
  const el = e.target.closest('[data-action]');
  if (!el) return;
  if (el.classList.contains('locked')) {
    el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake');
    return;
  }
  actions[el.dataset.action]?.(el.dataset);
});

// Stop iPad Safari from pinch-zooming / bouncing the page, but let the garage list scroll.
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
