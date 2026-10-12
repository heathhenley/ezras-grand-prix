// HTML for the menu, garage, HUD, and results screens.
import { BODIES, COLORS, WHEELS, SPOILERS, TRACKS, UNLOCKS, KIND_LABEL, itemName, isUnlocked, winsNeeded } from './data.js';
import { MAX_LEVEL } from './ai.js';
import { tiltSupported } from './input.js';
import { ordinal } from './race.js';


// ---------- home ----------
// Like the garage, this is laid out on a fixed 1180 x 820 board that is scaled to fit the screen
// (see .home in style.css), and the 3D car shows through the empty card on the right.

// little picture for each track's tile: [background colour, drawing]
const TRACK_ART = {
  oval: ['#6cc04a', '<circle cx="102" cy="14" r="9" fill="#ffd23f"></circle><ellipse cx="55" cy="44" rx="40" ry="17" fill="none" stroke="#4b4f63" stroke-width="9"></ellipse><ellipse cx="55" cy="44" rx="40" ry="17" fill="none" stroke="#ffffff" stroke-width="1.2" stroke-dasharray="4 4"></ellipse>'],
  twisty: ['#3f9a5c', '<path d="M0 60 C30 60 30 32 60 32 S92 6 120 12" fill="none" stroke="#4b4f63" stroke-width="9"></path><polygon points="14,46 24,18 34,46" fill="#1d5634"></polygon><polygon points="78,64 90,36 102,64" fill="#1d5634"></polygon><polygon points="96,34 104,14 112,34" fill="#1d5634"></polygon><polygon points="40,66 48,46 56,66" fill="#1d5634"></polygon>'],
  construction: ['#f2d48a', '<rect x="0" y="56" width="120" height="14" fill="#a78350"></rect><polygon points="32,58 42,18 52,58" fill="#f28c28"></polygon><rect x="36" y="32" width="12" height="5" fill="#ffffff"></rect><rect x="33" y="44" width="18" height="5" fill="#ffffff"></rect><rect x="26" y="56" width="32" height="6" rx="2" fill="#f28c28"></rect><rect x="68" y="36" width="44" height="12" fill="#1b2140"></rect><path d="M72 48 L80 36 M84 48 L92 36 M96 48 L104 36 M108 48 L112 42" stroke="#ffd23f" stroke-width="5"></path><rect x="72" y="48" width="4" height="10" fill="#1b2140"></rect><rect x="104" y="48" width="4" height="10" fill="#1b2140"></rect>'],
  lake: ['#9fd8f2', '<ellipse cx="66" cy="52" rx="24" ry="11" fill="#2fae5a"></ellipse><path d="M84 48 Q98 30 92 14" fill="none" stroke="#2fae5a" stroke-width="8" stroke-linecap="round"></path><circle cx="94" cy="13" r="7" fill="#2fae5a"></circle><circle cx="96" cy="11" r="1.6" fill="#1b2140"></circle><path d="M44 52 L30 46" stroke="#2fae5a" stroke-width="6" stroke-linecap="round"></path><rect x="0" y="54" width="120" height="16" fill="#2a7fb8"></rect><path d="M6 62 q5 -4 10 0 t10 0 M60 64 q5 -4 10 0 t10 0 M92 60 q5 -4 10 0 t10 0" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round"></path>'],
  roadtrip: ['#9fd8f2', '<rect x="0" y="50" width="120" height="20" fill="#2f6fb3"></rect><polygon points="50,52 55,18 67,18 72,52" fill="#ffffff"></polygon><polygon points="52,38 54,28 68,28 70,38" fill="#e5383b"></polygon><rect x="54" y="10" width="14" height="8" fill="#ffd23f"></rect><polygon points="52,10 61,3 70,10" fill="#e5383b"></polygon><path d="M70 14 L100 6 L100 22 Z" fill="#fff6c2" opacity="0.7"></path><path d="M8 60 q5 -4 10 0 t10 0 M86 62 q5 -4 10 0 t10 0" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round"></path>'],
};
const HEAT = ['#2fae5a', '#2fae5a', '#2fae5a', '#f6c915', '#f6c915', '#f6c915', '#f28c28', '#f28c28', '#e5383b', '#e5383b']; // rival speed bars, slow to fast
const HOME_ICON = {
  sound: '<path d="M4 9 H8 L13 5 V19 L8 15 H4 Z" fill="currentColor"></path>',
  soundOn: '<path d="M16 9 Q18 12 16 15 M18.5 6.5 Q22 12 18.5 17.5"></path>',
  soundOff: '<path d="M16 9 L21 15 M21 9 L16 15"></path>',
  gas: '<path d="M4 17 A8 8 0 1 1 20 17"></path><path d="M12 15 L16 9"></path><circle cx="12" cy="15" r="1.6" fill="currentColor"></circle>',
  tilt: '<rect x="4" y="7" width="16" height="10" rx="2" transform="rotate(-14 12 12)"></rect><path d="M3 20 Q12 23 21 18"></path>',
  wrench: '<path d="M14.5 6.5 A4 4 0 0 1 19.5 11.5 L20.5 10.5 A5.5 5.5 0 0 0 13.5 3.5 Z" fill="currentColor"></path><path d="M15 9 L4 20"></path>',
  road: '<path d="M3 20 C8 20 8 12 12 12 S16 4 21 4"></path><path d="M3 20 H21" stroke-dasharray="2 3"></path>',
  flame: '<path d="M12 2 C13 6 18 8 18 14 A6 6 0 0 1 6 14 C6 11 8 9 9 7 C9 10 11 11 12 11 C12 8 11 5 12 2 Z"></path>',
};
const TURTLE = '<svg width="48" height="40" viewBox="0 0 48 40" aria-hidden="true"><path d="M8 28 A14 13 0 0 1 36 28 Z" fill="#2fae5a" stroke="#1d5634" stroke-width="2"></path><path d="M15 27 L22 17 L29 27 M22 17 L22 27" fill="none" stroke="#1d5634" stroke-width="2"></path><circle cx="41" cy="24" r="5" fill="#8bd17c"></circle><circle cx="42.5" cy="22.5" r="1" fill="#1b2140"></circle><rect x="11" y="27" width="5" height="7" rx="2" fill="#8bd17c"></rect><rect x="27" y="27" width="5" height="7" rx="2" fill="#8bd17c"></rect></svg>';
const HARE = '<svg width="44" height="44" viewBox="0 0 44 44" aria-hidden="true"><ellipse cx="18" cy="6" rx="3.5" ry="9" fill="#e9ecf7" transform="rotate(-12 18 14)"></ellipse><ellipse cx="27" cy="6" rx="3.5" ry="9" fill="#e9ecf7" transform="rotate(14 27 14)"></ellipse><ellipse cx="22" cy="33" rx="13" ry="9" fill="#e9ecf7"></ellipse><circle cx="23" cy="21" r="8" fill="#e9ecf7"></circle><circle cx="20" cy="20" r="1.3" fill="#1b2140"></circle><circle cx="26" cy="20" r="1.3" fill="#1b2140"></circle><circle cx="23" cy="24" r="1.3" fill="#f05fa6"></circle></svg>';
const LINE = 'fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"';

// picture for a prize tile
function prizePic(kind, id, save, photo) {
  if (kind === 'color') return `<div class="h-swatch" style="background:${COLORS[id].hex}"></div>`;
  if (kind === 'wheels') return `<svg width="40" height="40" viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="18" fill="#15151c" stroke="#4a5378" stroke-width="1.5"></circle><circle cx="20" cy="20" r="10" fill="${WHEELS[id].rim}"></circle></svg>`;
  if (kind === 'spoiler') return svg(40, ICON.spoiler, 'fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"');
  if (kind === 'body') {
    const look = { ...save.car, body: id, spoiler: 'none' };
    return `<img class="g-pic h-pic" alt="" data-look='${JSON.stringify(look)}' ${photo(look) ? `src="${photo(look)}"` : ''}>`;
  }
  return svg(40, HOME_ICON.road, 'fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"');
}

// The "Prizes" card: progress bar, the next prize to win and the three after it. A locked track or
// prize that was just tapped (hint: { kind, id }) covers it with a banner saying how to win it.
function prizesCard(save, hint, photo) {
  const wins = save.wins;
  const all = UNLOCKS.filter((u) => u[0] > 0);
  const got = all.filter((u) => u[0] <= wins).length;
  const start = Math.min(got, Math.max(0, all.length - 4));
  const prizes = all.slice(start, start + 4).map(([need, kind, id], k) => {
    const have = need <= wins, isNext = start + k === got;
    return `<div class="h-prize ${isNext ? 'next' : ''} ${have || isNext ? '' : 'far'} ${have ? '' : 'locked'}" ${have ? '' : `data-action="peek" data-kind="${kind}" data-id="${id}"`}>
      <div class="h-prize-pic">${prizePic(kind, id, save, photo)}</div><span>${itemName(kind, id)}</span>
      <div class="h-prize-need">${svg(16, TROPHY, GOLD)}<b>${need}</b></div></div>`;
  }).join('');

  let hintHtml = '';
  if (hint) {
    const need = winsNeeded(hint.kind, hint.id), more = need - wins;
    hintHtml = `<div class="h-hint g-card">
      <div class="g-hint-lock">${svg(34, ICON.lock, 'fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"')}</div>
      <div class="g-hint-body"><div class="h-hint-text">Win ${more} more race${more === 1 ? '' : 's'} to ${hint.kind === 'track' ? 'drive' : 'get'} ${prizeName(hint.kind, hint.id).replace(/ track$/, '')}!</div>
        <div class="g-bar"><i style="width:${Math.min(100, Math.round((wins / need) * 100))}%"></i></div></div>
      <button class="g-close" data-action="hintclose" aria-label="Close">${svg(28, ICON.close, 'fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"')}</button>
    </div>`;
  }
  return `<div class="h-prizes g-card">
    <div class="h-prizes-top">${svg(30, ICON.gift, 'fill="none" stroke="#ffd23f" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"')}<span>Prizes</span>
      <div class="h-bar"><i style="width:${Math.round((got / all.length) * 100)}%"></i></div><b>${got}/${all.length}</b></div>
    <div class="h-prize-row">${prizes}</div>
    ${hintHtml}
  </div>`;
}

// The "Rival speed" card: one bar per rival level, turtle to hare. change is +1 / -1 when the
// level has just gone up or down (shown on the results screen).
function rivalsCard(save, change = 0) {
  const level = Math.max(0, Math.min(MAX_LEVEL, save.level)), streak = save.streak ?? 0;
  const bars = HEAT.map((color, i) => `<i class="${change > 0 && i === level ? 'new' : ''}" style="height:${18 + i * 2}px;background:${i <= level ? color : '#11152b'}"></i>`).join('');
  const badge = change > 0 ? `<div class="h-streak">${svg(20, HOME_ICON.flame, 'fill="currentColor"')}<b>Faster!</b></div>`
    : change < 0 ? `<div class="h-streak easier"><b>A bit slower</b></div>`
    : streak >= 2 ? `<div class="h-streak">${svg(20, HOME_ICON.flame, 'fill="currentColor"')}<b>${streak} in a row</b></div>` : '';
  return `<div class="h-rivals g-card" role="img" aria-label="Rival speed ${level + 1} of ${MAX_LEVEL + 1}${streak >= 2 ? `, ${streak} wins in a row` : ''}">
    <div class="h-rivals-top"><span>Rival speed</span>${badge}</div>
    <div class="h-rivals-row">${TURTLE}<div class="h-heat">${bars}</div>${HARE}</div>
  </div>`;
}

// hint: { kind, id } of something locked that was just tapped. photo: see garageHtml.
export function menuHtml(save, hint, photo) {
  const wins = save.wins;
  const toggle = (action, on, label, icon) =>
    `<button class="h-toggle ${on ? 'on' : ''}" data-action="${action}" aria-label="${label} ${on ? 'on' : 'off'}" aria-pressed="${on}">${svg(34, icon, LINE)}<span>${label}</span></button>`;

  // tracks, in the order they unlock
  const tracks = Object.entries(TRACKS).sort((a, b) => winsNeeded('track', a[0]) - winsNeeded('track', b[0])).map(([id, t]) => {
    const open = isUnlocked('track', id, wins), sel = save.track === id, [bg, art] = TRACK_ART[id] ?? ['#6cc04a', ''];
    return `<button class="h-track ${sel ? 'sel' : ''} ${open ? '' : 'locked'}" data-action="track" data-id="${id}" aria-label="${t.name}${open ? '' : ', locked'}">
      <div class="h-track-in"><svg width="180" height="104" viewBox="0 0 120 70" aria-hidden="true"><rect width="120" height="70" fill="${bg}"></rect>${art}</svg><span>${t.name}</span></div>
      ${open ? '' : `<div class="g-need h-need">${svg(18, ICON.lock, 'fill="none" stroke="#ffffff" stroke-width="2.6" stroke-linecap="round"')}${svg(18, TROPHY, GOLD)}<span>${winsNeeded('track', id)}</span></div>`}
      ${sel ? `<div class="g-check">${svg(22, ICON.check, 'fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"')}</div>` : ''}
    </button>`;
  }).join('');

  return `<div class="home">
    <div class="h-top">
      <div class="h-title"><span>Ezra's</span><b>Grand Prix</b></div>
      <div class="h-top-right">
        ${toggle('sound', save.sound, 'Sound', HOME_ICON.sound + (save.sound ? HOME_ICON.soundOn : HOME_ICON.soundOff))}
        ${toggle('autogas', save.autoGas, 'Auto gas', HOME_ICON.gas)}
        ${tiltSupported() ? toggle('tilt', save.tilt, 'Tilt', HOME_ICON.tilt) : ''}
        <div class="g-wins h-wins g-card" role="img" aria-label="${wins} wins">${svg(44, ICON.trophy, GOLD)}<span>${wins}</span></div>
      </div>
    </div>
    <div class="h-main">
      <div class="h-left">
        <div class="h-heading">${svg(30, ICON.flag, 'fill="none" stroke="#ffd23f" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" color="#ffd23f"')}<span>Pick a track</span></div>
        <div class="h-tracks">${tracks}<div class="h-soon">More soon!</div></div>
        ${prizesCard(save, hint, photo)}
      </div>
      <div class="h-right">
        <div class="h-car"><button class="h-garage" data-action="garage" aria-label="Open the garage to change your car">${svg(36, HOME_ICON.wrench, 'fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"')}<span>Garage</span></button></div>
        ${rivalsCard(save)}
        <button class="g-go h-go" data-action="race" aria-label="Go race on ${TRACKS[save.track].name}">${svg(64, ICON.flag, 'fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"')}<span>GO!</span></button>
      </div>
    </div>
    <div class="h-credits">Art: Kenney, Quaternius, Poly Haven, ambientCG (CC0) · Black bear by Poly by Google, Rabbit by Sherkiz (CC-BY, via Poly Pizza)</div>
  </div>`;
}

// ---------- garage ----------
// Laid out on a fixed 1180 x 820 board (a tablet in landscape) that is scaled to fit the screen;
// see .garage in style.css. The big 3D car shows through the empty stage card on the left.
const svg = (size, body, attrs = 'fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"') =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" ${attrs} aria-hidden="true">${body}</svg>`;
const TROPHY = '<path d="M7 4 H17 V9 A5 5 0 0 1 7 9 Z"></path><path d="M12 14 V18" fill="none"></path><path d="M8 21 H16 M9 18 H15" fill="none"></path>';
const GOLD = 'fill="#ffd23f" stroke="#ffd23f" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"';
const ICON = {
  home: '<path d="M3 11 L12 3 L21 11"></path><path d="M5 10 V21 H19 V10"></path><path d="M10 21 V15 H14 V21"></path>',
  trophy: TROPHY + '<path d="M7 6 H4 A3 3 0 0 0 7 11" fill="none"></path><path d="M17 6 H20 A3 3 0 0 1 17 11" fill="none"></path>',
  dice: '<rect x="4" y="4" width="16" height="16" rx="3"></rect>' + [[8.5, 8.5], [15.5, 8.5], [12, 12], [8.5, 15.5], [15.5, 15.5]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.4" fill="currentColor"></circle>`).join(''),
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"></rect><path d="M8 11 V8 A4 4 0 0 1 16 8 V11"></path>',
  close: '<path d="M6 6 L18 18 M18 6 L6 18"></path>',
  gift: '<path d="M4 10 H20 V20 H4 Z"></path><path d="M3 7 H21 V10 H3 Z"></path><path d="M12 7 V20"></path><path d="M12 7 C10 3 6 4 8 7 M12 7 C14 3 18 4 16 7"></path>',
  check: '<path d="M5 12 L10 17 L19 7"></path>',
  flag: '<path d="M5 21 V4"></path><path d="M5 4 H19 L16 8 L19 12 H5" fill="currentColor"></path>',
  body: '<path d="M3 16 L5 10 Q6 8 8 8 H16 Q18 8 19 10 L21 16 V18 H3 Z"></path><circle cx="7" cy="18" r="2" fill="currentColor"></circle><circle cx="17" cy="18" r="2" fill="currentColor"></circle>',
  color: '<path d="M12 3 C12 3 5 11 5 15 A7 7 0 0 0 19 15 C19 11 12 3 12 3 Z"></path>',
  wheels: '<circle cx="12" cy="12" r="9"></circle><circle cx="12" cy="12" r="3"></circle><path d="M12 3 V9 M12 15 V21 M3 12 H9 M15 12 H21"></path>',
  spoiler: '<path d="M3 6 H21 V9 H3 Z"></path><path d="M8 9 V16 M16 9 V16"></path><path d="M4 18 H20"></path>',
};
const GARAGE_TABS = { body: ['Car', BODIES], color: ['Color', COLORS], wheels: ['Wheels', WHEELS], spoiler: ['Wing', SPOILERS] };
const NOUN = { body: '', color: ' paint', wheels: ' wheels', spoiler: '', track: ' track' };
export const prizeName = (kind, id) => itemName(kind, id) + NOUN[kind];

// tab: which of body / color / wheels / spoiler is showing. hint: { kind, id } of a locked item just tapped.
// photo(look) gives the side-on picture of a car look if it has been taken already, else '' (see thumbs.js);
// main.js fills in any missing ones a moment later.
export function garageHtml(save, tab, hint, photo) {
  const car = save.car;
  const carPicture = (look) => `<img class="g-pic" alt="" data-look='${JSON.stringify(look)}' ${photo(look) ? `src="${photo(look)}"` : ''}>`;
  const tabs = Object.entries(GARAGE_TABS).map(([kind, [label]]) =>
    `<button class="g-tab ${kind === tab ? 'on' : ''}" data-action="tab" data-tab="${kind}" aria-label="${label}">${svg(48, ICON[kind], 'fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"')}<span>${label}</span></button>`).join('');

  const tiles = Object.entries(GARAGE_TABS[tab][1]).map(([id, item]) => {
    const open = isUnlocked(tab, id, save.wins), sel = car[tab] === id;
    const picture = tab === 'body' ? carPicture({ ...car, body: id, spoiler: 'none' })
      : tab === 'color' ? `<div class="g-swatch" style="background:${item.hex}"></div>`
      : tab === 'wheels' ? `<svg width="64" height="64" viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="18" fill="#15151c" stroke="#4a5378" stroke-width="1.5"></circle><circle cx="20" cy="20" r="10" fill="${item.rim}"></circle><circle cx="20" cy="20" r="3.5" fill="#15151c" opacity="0.5"></circle></svg>`
      : carPicture({ ...car, spoiler: id });
    return `<button class="g-tile ${sel ? 'sel' : ''} ${open ? '' : 'locked'}" data-action="pick" data-kind="${tab}" data-id="${id}" aria-label="${prizeName(tab, id)}${open ? '' : ', locked'}">
      <div class="g-tile-in">${picture}<span>${item.name}</span></div>
      ${open ? '' : `<div class="g-need">${svg(18, ICON.lock, 'fill="none" stroke="#ffffff" stroke-width="2.6" stroke-linecap="round"')}${svg(18, TROPHY, GOLD)}<span>${winsNeeded(tab, id)}</span></div>`}
      ${sel ? `<div class="g-check">${svg(22, ICON.check, 'fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"')}</div>` : ''}
    </button>`;
  }).join('');

  const plural = (n, word) => `${n} more ${word}${n === 1 ? '' : 's'}`;
  let hintHtml = '';
  if (hint) {
    const need = winsNeeded(hint.kind, hint.id);
    hintHtml = `<div class="g-hint g-card">
      <div class="g-hint-lock">${svg(34, ICON.lock, 'fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"')}</div>
      <div class="g-hint-body"><div class="g-hint-text">Win ${plural(need - save.wins, 'race')} to get ${prizeName(hint.kind, hint.id)}!</div>
        <div class="g-bar"><i style="width:${Math.min(100, Math.round((save.wins / need) * 100))}%"></i></div></div>
      <button class="g-close" data-action="hintclose" aria-label="Close">${svg(28, ICON.close, 'fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"')}</button>
    </div>`;
  }
  const next = UNLOCKS.find((u) => u[0] > save.wins);
  const left = next ? next[0] - save.wins : 0;

  return `<div class="garage">
    <div class="g-top">
      <button class="g-round" data-action="menu" aria-label="Back to home">${svg(40, ICON.home, 'fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"')}</button>
      <div class="g-wins g-card" role="img" aria-label="${save.wins} wins">${svg(44, ICON.trophy, GOLD)}<span>${save.wins}</span></div>
    </div>
    <div class="g-main">
      <div class="g-left">
        <div class="g-stage">
          <button class="g-dice" data-action="surprise" aria-label="Surprise me: pick a random look">${svg(48, ICON.dice, 'fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"')}</button>
          ${hintHtml}
        </div>
        <div class="g-next g-card">
          <div class="g-gift">${svg(44, ICON.gift)}</div>
          <div class="g-next-body"><div class="g-next-title ${next && prizeName(next[1], next[2]).length > 14 ? 'long' : ''}">${next ? `Next prize: ${prizeName(next[1], next[2])}` : 'You unlocked everything!'}</div>
            <div class="g-bar"><i style="width:${next ? Math.min(100, Math.round((save.wins / next[0]) * 100)) : 100}%"></i></div></div>
          <div class="g-more"><div>${svg(30, TROPHY, GOLD)}<b>${next ? left : '★'}</b></div><span>${next ? (left === 1 ? 'more win' : 'more wins') : 'champ'}</span></div>
        </div>
      </div>
      <div class="g-right">
        <div class="g-tabs">${tabs}</div>
        <div class="g-grid">${tiles}</div>
        <button class="g-go" data-action="race" aria-label="Go race!">${svg(56, ICON.flag, 'fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"')}<span>GO!</span></button>
      </div>
    </div>
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

// After a race. Same board as the home screen: the result and any new prizes on the left; the car,
// the rivals and the buttons on the right. result: { place, unlocked, levelChange }.
export function resultsHtml(result, save, hint, photo) {
  const { place, unlocked, levelChange } = result, won = place === 1;
  const sub = won ? 'You won!' : place === 2 ? 'So close! Try again!' : 'Keep practicing. You got this!';
  const news = unlocked.length ? `<div class="r-new g-card">
      <div class="r-new-title">${svg(30, ICON.gift)}<span>New prize${unlocked.length === 1 ? '' : 's'}!</span></div>
      <div class="r-new-row">${unlocked.map(([, kind, id]) => `<div class="r-new-tile"><div class="h-prize-pic">${prizePic(kind, id, save, photo)}</div><span>${itemName(kind, id)}</span><small>${KIND_LABEL[kind]}</small></div>`).join('')}</div>
    </div>` : '';
  return `<div class="home results">
    <div class="h-top">
      <div class="h-title"><span>Ezra's</span><b>Grand Prix</b></div>
      <div class="h-top-right"><div class="g-wins h-wins g-card" role="img" aria-label="${save.wins} wins">${svg(44, ICON.trophy, GOLD)}<span>${save.wins}</span></div></div>
    </div>
    <div class="h-main">
      <div class="h-left">
        <div class="r-result g-card ${won ? 'won' : ''}">
          <div class="r-medal">${won ? svg(96, ICON.trophy, GOLD) : `<b>${place}</b>`}</div>
          <div class="r-words"><div class="r-place">${ordinal(place)} place${won ? '!' : ''}</div><div class="r-sub">${sub}</div></div>
        </div>
        ${news}
        ${prizesCard(save, hint, photo)}
      </div>
      <div class="h-right">
        <div class="h-car"><button class="h-garage" data-action="garage" aria-label="Open the garage to change your car">${svg(36, HOME_ICON.wrench, 'fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"')}<span>Garage</span></button></div>
        ${rivalsCard(save, levelChange)}
        <div class="r-buttons">
          <button class="r-home" data-action="menu" aria-label="Back to home">${svg(56, ICON.home, 'fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"')}</button>
          <button class="g-go h-go" data-action="race" aria-label="Race again on ${TRACKS[save.track].name}">${svg(64, ICON.flag, 'fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"')}<span>GO!</span></button>
        </div>
      </div>
    </div>
  </div>`;
}
