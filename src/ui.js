// HTML for the menu, garage, HUD, and results screens.
import { BODIES, COLORS, WHEELS, SPOILERS, TRACKS, KIND_LABEL, itemName, isUnlocked, winsNeeded, nextUnlock } from './data.js';
import { ordinal } from './race.js';

const lockBadge = (n) => `<span class="lock">🔒 ${n} win${n === 1 ? '' : 's'}</span>`;

function nextHint(wins) {
  const nx = nextUnlock(wins);
  if (!nx) return `<div class="hint">You unlocked everything! 🌟</div>`;
  const left = nx[0] - wins;
  return `<div class="hint">${left} more win${left === 1 ? '' : 's'} → <b>${itemName(nx[1], nx[2])}</b> ${KIND_LABEL[nx[1]].toLowerCase()}</div>`;
}

export function menuHtml(save) {
  const tracks = Object.entries(TRACKS).map(([id, t]) => {
    const open = isUnlocked('track', id, save.wins);
    return `<button class="chip ${save.track === id ? 'sel' : ''} ${open ? '' : 'locked'}" data-action="track" data-id="${id}">
      ${t.name}${open ? '' : lockBadge(winsNeeded('track', id))}</button>`;
  }).join('');
  return `<div class="panel">
    <h1>Backyard<br><span>Grand Prix</span></h1>
    <div class="trophies">🏆 ${save.wins} win${save.wins === 1 ? '' : 's'}</div>
    <div class="label">Track</div>
    <div class="chips">${tracks}</div>
    <button class="big go" data-action="race">RACE!</button>
    <button class="big" data-action="garage">🔧 Garage</button>
    <button class="small" data-action="autogas">Auto gas: <b>${save.autoGas ? 'ON' : 'OFF'}</b></button>
    ${nextHint(save.wins)}
  </div>`;
}

export function garageHtml(save) {
  const section = (kind, table) => {
    const chips = Object.entries(table).map(([id, item]) => {
      const open = isUnlocked(kind, id, save.wins);
      const sel = save.car[kind] === id;
      const swatch = kind === 'color' ? `<i class="swatch" style="background:${item.hex}"></i>` : '';
      return `<button class="chip ${sel ? 'sel' : ''} ${open ? '' : 'locked'}" data-action="pick" data-kind="${kind}" data-id="${id}">
        ${swatch}${item.name}${open ? '' : lockBadge(winsNeeded(kind, id))}</button>`;
    }).join('');
    return `<div class="label">${KIND_LABEL[kind]}</div><div class="chips">${chips}</div>`;
  };
  return `<div class="panel scroll">
    <button class="back" data-action="menu">← Back</button>
    <h2>Garage</h2>
    ${section('body', BODIES)}
    ${section('color', COLORS)}
    ${section('wheels', WHEELS)}
    ${section('spoiler', SPOILERS)}
    <button class="big go" data-action="race">RACE!</button>
  </div>`;
}

export function hudHtml(showTouch) {
  return `<div class="hud">
      <div class="hud-l"><div id="hpos" class="pos"></div><div id="hlap" class="lap"></div></div>
      <div class="hud-r">
        <button class="hud-btn" data-action="reset" title="Back on the road">↺</button>
        <button class="hud-btn" data-action="quit" title="Quit race">✕</button>
      </div>
      <div id="hcount" class="count"></div>
      <div id="hoff" class="offroad">Get back on the road!</div>
    </div>
    ${showTouch ? `<div class="touch">
      <div class="pad left"><button data-key="left">◀</button><button data-key="right">▶</button></div>
      <div class="pad right"><button data-key="brake" class="brake">BRAKE</button><button data-key="gas" class="gas">GO</button></div>
    </div>` : `<div class="keys-hint">Arrows / WASD to drive · Space to brake</div>`}`;
}

export function makeHud(root) {
  const pos = root.querySelector('#hpos'), lap = root.querySelector('#hlap');
  const count = root.querySelector('#hcount'), off = root.querySelector('#hoff');
  let last = [];
  return {
    set(p, l, c, o) {
      if (p !== last[0]) pos.textContent = p;
      if (l !== last[1]) lap.textContent = l;
      if (c !== last[2]) { count.textContent = c; count.classList.toggle('show', !!c); }
      if (o !== last[3]) off.classList.toggle('show', o);
      last = [p, l, c, o];
    },
  };
}

export function resultsHtml(place, unlocked, save) {
  const title = place === 1 ? '🏆 1st place!' : `${ordinal(place)} place`;
  const sub = place === 1 ? 'You won!' : place === 2 ? 'So close! Try again!' : 'Keep practicing — you got this!';
  const news = unlocked.map(([, kind, id]) =>
    `<div class="unlock">✨ NEW ${KIND_LABEL[kind].toUpperCase()}: <b>${itemName(kind, id)}</b></div>`).join('');
  return `<div class="panel center">
    <div class="place ${place === 1 ? 'gold' : ''}">${title}</div>
    <div class="sub">${sub}</div>
    ${news}
    <button class="big go" data-action="race">Race again</button>
    <button class="big" data-action="garage">🔧 Garage</button>
    <button class="small" data-action="menu">Menu</button>
    ${nextHint(save.wins)}
  </div>`;
}
