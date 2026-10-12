// HTML for the menu, garage, HUD, and results screens.
import { BODIES, COLORS, WHEELS, SPOILERS, TRACKS, UNLOCKS, KIND_LABEL, itemName, isUnlocked, winsNeeded } from './data.js';
import { MAX_LEVEL } from './ai.js';
import { tiltSupported } from './input.js';
import { ordinal } from './race.js';

const lockBadge = (n) => `<span class="lock">🔒 ${n} win${n === 1 ? '' : 's'}</span>`;

const KIND_ICON = { body: '🏎️', wheels: '🛞', spoiler: '💨', track: '🏁' };

// Progress bar + the next few prizes, shown on the menu and results screens.
function unlockBar(wins) {
  const prizes = UNLOCKS.filter((u) => u[0] > 0);
  const got = prizes.filter((u) => u[0] <= wins).length;
  const coming = prizes.filter((u) => u[0] > wins).slice(0, 4);
  const head = `<div class="label">Prizes <b>${got}/${prizes.length}</b></div>
    <div class="bar"><i style="width:${Math.round((got / prizes.length) * 100)}%"></i></div>`;
  if (!coming.length) return `<div class="unlocks">${head}<div class="hint">You unlocked everything! 🌟</div></div>`;
  const tiles = coming.map(([need, kind, id], k) => {
    const left = need - wins;
    const icon = kind === 'color' ? `<i class="swatch" style="background:${COLORS[id].hex}"></i>` : `<span class="ico">${KIND_ICON[kind]}</span>`;
    return `<div class="prize locked ${k === 0 ? 'next' : ''}" data-action="peek" data-kind="${kind}" data-id="${id}">${icon}
      <b>${itemName(kind, id)}</b><small>${KIND_LABEL[kind]}</small>
      <em>${left} win${left === 1 ? '' : 's'}</em></div>`;
  }).join('');
  return `<div class="unlocks">${head}<div class="prizes">${tiles}</div></div>`;
}

const rivalsHtml = (level) => `<div class="rivals">Rivals <span>${'●'.repeat(level)}${'○'.repeat(MAX_LEVEL - level)}</span></div>`;

// Pop-up shown when something still locked is tapped.
export function lockedHtml(winsLeft, name, kindLabel) {
  return `<div class="modal"><div class="modal-box">
    <div class="modal-lock">🔒</div>
    <div class="modal-title">Get ${winsLeft} more win${winsLeft === 1 ? '' : 's'}!</div>
    <div class="modal-sub">to unlock <b>${name}</b> <span>${kindLabel.toLowerCase()}</span></div>
    <button class="big go">OK</button>
  </div></div>`;
}

export function menuHtml(save) {
  // listed in the order they unlock
  const tracks = Object.entries(TRACKS).sort((a, b) => winsNeeded('track', a[0]) - winsNeeded('track', b[0])).map(([id, t]) => {
    const open = isUnlocked('track', id, save.wins);
    return `<button class="chip ${save.track === id ? 'sel' : ''} ${open ? '' : 'locked'}" data-action="track" data-id="${id}">
      ${t.name}${open ? '' : lockBadge(winsNeeded('track', id))}</button>`;
  }).join('');
  return `<div class="panel scroll">
    <h1>Ezra's<br><span>Grand Prix</span></h1>
    <div class="trophies">🏆 ${save.wins} win${save.wins === 1 ? '' : 's'}</div>
    <div class="label">Track</div>
    <div class="chips">${tracks}</div>
    <button class="big go" data-action="race">RACE!</button>
    <button class="big" data-action="garage">🔧 Garage</button>
    <div class="row">
      <button class="small" data-action="autogas">Auto gas: <b>${save.autoGas ? 'ON' : 'OFF'}</b></button>
      <button class="small" data-action="sound">Sound: <b>${save.sound ? 'ON' : 'OFF'}</b></button>
      ${tiltSupported() ? `<button class="small" data-action="tilt">Tilt steering: <b>${save.tilt ? 'ON' : 'OFF'}</b></button>` : ''}
    </div>
    ${rivalsHtml(save.level)}
    ${unlockBar(save.wins)}
    <div class="credits">Art: Kenney, Quaternius, Poly Haven, ambientCG (CC0) · Black bear by Poly by Google, Rabbit by Sherkiz (CC-BY, via Poly Pizza)</div>
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
      <svg id="hmap" class="minimap" viewBox="0 0 100 100"></svg>
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
  const mapEl = root.querySelector('#hmap');
  let last = [];
  let toMap = null, dots = [];
  return {
    // mini map: draws the track outline once, with a dot per car (the player's is bigger and on top)
    map(track, cars) {
      const xs = track.samples.map((s) => s.x), zs = track.samples.map((s) => s.z);
      const midX = (Math.min(...xs) + Math.max(...xs)) / 2, midZ = (Math.min(...zs) + Math.max(...zs)) / 2;
      const k = 84 / Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs));
      toMap = (x, z) => [(50 + (x - midX) * k).toFixed(1), (50 - (z - midZ) * k).toFixed(1)];
      const d = track.samples.filter((_, i) => i % 3 === 0).map((s, i) => (i ? 'L' : 'M') + toMap(s.x, s.z).join(' ')).join('') + 'Z';
      const [sx, sy] = toMap(xs[0], zs[0]);
      const ramps = (track.jumps ?? []).map((j) => toMap(track.samples[j.idx].x, track.samples[j.idx].z))
        .map(([x, y]) => `<rect class="jump" x="${x - 2.6}" y="${y - 2.6}" width="5.2" height="5.2" rx="1"/>`).join('')
        + (track.obstacles ?? []).filter((o) => !o.cross).map((o) => toMap(o.x, o.z)).map(([x, y]) => `<circle class="tree" cx="${x}" cy="${y}" r="2"/>`).join('');
      const order = [...cars].sort((a, b) => a.isPlayer - b.isPlayer);
      mapEl.innerHTML = `<path class="edge" d="${d}"/><path class="road" d="${d}"/><circle class="start" cx="${sx}" cy="${sy}" r="2.4"/>${ramps}`
        + order.map((c) => `<circle class="car ${c.isPlayer ? 'me' : ''}" r="${c.isPlayer ? 4.6 : 3.4}" fill="${c.color}"/>`).join('');
      dots = [...mapEl.querySelectorAll('.car')].map((el, i) => [el, order[i]]);
    },
    dots() {
      for (const [el, c] of dots) {
        const [x, y] = toMap(c.x, c.z);
        el.setAttribute('cx', x);
        el.setAttribute('cy', y);
      }
    },
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
  return `<div class="panel center scroll">
    <div class="place ${place === 1 ? 'gold' : ''}">${title}</div>
    <div class="sub">${sub}</div>
    ${news}
    <button class="big go" data-action="race">Race again</button>
    <button class="big" data-action="garage">🔧 Garage</button>
    <button class="small" data-action="menu">Menu</button>
    ${unlockBar(save.wins)}
  </div>`;
}
