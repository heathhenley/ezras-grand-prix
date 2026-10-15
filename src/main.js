import { Engine } from '@babylonjs/core/Engines/engine';
import './style.css';

import { loadSave, writeSave } from './save.js';
import { BODIES, COLORS, WHEELS, SPOILERS, isUnlocked, unlocksBetween, winsNeeded, itemName } from './data.js';
import { MAX_LEVEL } from './ai.js';
import { Showroom } from './showroom.js';
import { PhotoBooth } from './thumbs.js';
import { Race } from './race.js';
import { bindTouchButtons, isTouchDevice, setTilt } from './input.js';
import { menuHtml, garageHtml, hudHtml, makeHud, resultsHtml, prizeName } from './ui.js';
import * as sound from './sound.js';

const canvas = document.getElementById('c');
const ui = document.getElementById('ui');

const engine = new Engine(canvas, true, { stencil: false, powerPreference: 'high-performance' }, false);
// Retina tablets at full resolution are expensive; 1.5x looks sharp and keeps the frame rate up.
engine.setHardwareScalingLevel(1 / Math.min(window.devicePixelRatio || 1, 1.5));

let save = loadSave();
sound.setEnabled(save.sound);
const showroom = new Showroom(engine);
const booth = new PhotoBooth(engine); // takes the little car pictures for the garage tiles
showroom.setCar(save.car);

let screen = 'menu';
let race = null;
let result = null;
let garageTab = 'body'; // which garage tab is open: body, color, wheels or spoiler
let garageHint = null; // { kind, id } of a locked garage item that was just tapped
let homeHint = null; // the same, for a locked track or prize tapped on the home or results screen

// Home, garage and results are drawn on a 1180 x 820 board; this is how much to shrink or grow it to fit the screen.
const boardScale = () => Math.min(innerWidth / 1180, innerHeight / 820);
// where the 3D car goes on each board (see frameBoard in showroom.js)
const CAR_SPOT = {
  menu: { right: 350, up: 150, pxPerMeter: 74, turntable: 0.5 },
  results: { right: 350, up: 150, pxPerMeter: 74, turntable: 0.5 },
  garage: { right: -228, up: 55, pxPerMeter: 104, turntable: 0.52 },
};

function frameShowroom() {
  if (!CAR_SPOT[screen]) return;
  ui.style.setProperty('--gs', boardScale());
  showroom.frameBoard(boardScale(), CAR_SPOT[screen]);
}

// take any car pictures that are not ready yet and drop them into their tiles
function fillPhotos() {
  for (const img of ui.querySelectorAll('img[data-look]:not([src])')) booth.shoot(JSON.parse(img.dataset.look)).then((url) => { img.src = url; }, () => {});
}

function show(next) {
  screen = next;
  ui.className = `screen-${screen}`;
  sound.music('menu'); // the calm tune for home, garage and results (carries on if it's already playing)
  if (screen === 'menu') ui.innerHTML = menuHtml(save, homeHint, (look) => booth.get(look));
  if (screen === 'garage') ui.innerHTML = garageHtml(save, garageTab, garageHint, (look) => booth.get(look));
  if (screen === 'results') ui.innerHTML = resultsHtml(result, save, homeHint, (look) => booth.get(look));
  fillPhotos();
  frameShowroom();
}

function startRace() {
  endRace();
  homeHint = null;
  if (save.tilt) setTilt(true); // has to be re-armed from a tap each time the page is opened
  screen = 'race';
  ui.className = 'screen-race';
  ui.innerHTML = hudHtml(isTouchDevice());
  bindTouchButtons(ui);
  race = new Race(engine, save, makeHud(ui), finishRace);
}

function finishRace(place, runaway, times) {
  const before = save.wins, levelBefore = save.level;
  save.races++;
  if (place === 1) save.wins++;
  save.streak = place === 1 ? (save.streak ?? 0) + 1 : 0;
  // rivals get tougher after a win and ease off after a bad race, so it stays a close fight
  // (a runaway win, with no rival close behind, moves them up two steps)
  save.level = Math.max(0, Math.min(MAX_LEVEL, save.level + (place === 1 ? (runaway ? 2 : 1) : place >= 3 ? -1 : 0)));
  writeSave(save);
  result = { place, unlocked: unlocksBetween(before, save.wins), levelChange: Math.sign(save.level - levelBefore), times };
  homeHint = null;
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
  garage: () => { garageHint = null; homeHint = null; show('garage'); },
  tab: ({ tab }) => { garageTab = tab; garageHint = null; show('garage'); },
  hintclose: () => { garageHint = null; homeHint = null; show(screen); },
  // dice button: a random look from everything unlocked so far
  surprise: () => {
    const any = (kind, table) => { const ids = Object.keys(table).filter((id) => isUnlocked(kind, id, save.wins)); return ids[Math.floor(Math.random() * ids.length)]; };
    save.car = { body: any('body', BODIES), color: any('color', COLORS), wheels: any('wheels', WHEELS), spoiler: any('spoiler', SPOILERS) };
    writeSave(save);
    showroom.setCar(save.car);
    garageHint = null;
    show('garage');
  },
  menu: () => show('menu'),
  quit: () => { endRace(); show('menu'); },
  reset: () => race?.reset(),
  autogas: () => { save.autoGas = !save.autoGas; writeSave(save); show(screen); },
  tilt: async () => { save.tilt = await setTilt(!save.tilt); writeSave(save); if (screen === 'menu') show(screen); },
  sound: () => { save.sound = !save.sound; sound.setEnabled(save.sound); writeSave(save); show(screen); },
  track: ({ id }) => {
    if (!isUnlocked('track', id, save.wins)) return;
    save.track = id; writeSave(save);
    homeHint = null;
    show(screen);
  },
  pick: ({ kind, id }) => {
    if (!isUnlocked(kind, id, save.wins)) return;
    save.car[kind] = id; writeSave(save);
    showroom.setCar(save.car);
    garageHint = null;
    show(screen);
  },
};

ui.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  sound.tap();
  if (el.classList.contains('locked')) {
    // tapped something not unlocked yet: say how many more wins it takes
    const kind = el.dataset.kind ?? 'track', id = el.dataset.id;
    if (screen === 'garage') garageHint = { kind, id }; else homeHint = { kind, id };
    show(screen);
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
  if (!race) frameShowroom();
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
