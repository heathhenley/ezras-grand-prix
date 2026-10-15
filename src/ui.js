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

// ---------- race HUD ----------
// The HTML is built once per race. makeHud then only touches text, attributes and classes when a value
// actually changes (never rebuilding HTML each frame), and every animation is transform / opacity only,
// so the HUD stays cheap on an iPad.
const MEDAL = ['', 'gold', 'silver', 'bronze', 'fourth'];
// speedometer: a 270 degree dial round (100, 100), open at the bottom; the nitro ring sits inside it
const DIAL = 'M49.1 150.9 A72 72 0 1 1 150.9 150.9';
const NITRO_RING = 'M64.6 135.4 A50 50 0 1 1 135.4 135.4';
const TICKS = Array.from({ length: 11 }, (_, i) => {
  const a = ((135 + i * 27) * Math.PI) / 180, r0 = i % 5 ? 84 : 80, r1 = 90;
  return `M${(100 + Math.cos(a) * r0).toFixed(1)} ${(100 + Math.sin(a) * r0).toFixed(1)} L${(100 + Math.cos(a) * r1).toFixed(1)} ${(100 + Math.sin(a) * r1).toFixed(1)}`;
}).join('');

// 83.4 -> "1:23.4"
export const clock = (t) => {
  t = Math.max(0, t);
  const m = Math.floor(t / 60), s = t - m * 60;
  return `${m}:${s < 10 ? '0' : ''}${s.toFixed(1)}`;
};

export function hudHtml(showTouch) {
  return `<div class="hud ${showTouch ? 'is-touch' : ''}">
      <div class="hud-vig" id="hvig"></div>
      <div class="hud-l">
        <div class="hud-pos fourth" id="hpos"><b>3</b><span>rd</span><i class="hud-arrow"></i></div>
        <div class="hud-cards">
          <div class="hud-card hud-lap" id="hlapc"><small>LAP</small><b id="hlap">1</b><span id="hlaps">/2</span></div>
          <div class="hud-card hud-time"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ffd23f" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="13" r="8"></circle><path d="M12 13 L12 9 M10 3 H14"></path></svg><b id="htime">0:00.0</b></div>
          <div class="hud-card hud-best" id="hbestc"><small>BEST</small><b id="hbest"></b></div>
        </div>
      </div>
      <div class="hud-r">
        <button class="hud-btn" data-action="reset" title="Back on the road" aria-label="Back on the road"><svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12 A8 8 0 1 0 7 5.8"></path><path d="M3 4 V9 H8"></path></svg></button>
        <button class="hud-btn" data-action="quit" title="Quit race" aria-label="Quit race"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true"><path d="M6 6 L18 18 M18 6 L6 18"></path></svg></button>
      </div>
      <div class="hud-map"><svg id="hmap" class="minimap" viewBox="0 0 100 100"></svg></div>
      <div class="hud-lights" id="hlights"><i></i><i></i><i></i></div>
      <div class="hud-toast" id="htoast"></div>
      <div class="hud-banners" id="hban"></div>
      <div class="hud-off" id="hoff">Get back on the road!</div>
      <div class="hud-speedo" id="hspeed">
        <svg viewBox="0 0 200 200" aria-hidden="true">
          <circle class="sp-bg" cx="100" cy="100" r="96"></circle>
          <path class="sp-ticks" d="${TICKS}"></path>
          <path class="sp-track" d="${DIAL}"></path>
          <path class="sp-fill" id="hsfill" d="${DIAL}" pathLength="100" stroke-dasharray="0 100"></path>
          <path class="sp-ntrack" d="${NITRO_RING}"></path>
          <path class="sp-nfill" id="hnfill" d="${NITRO_RING}" pathLength="100" stroke-dasharray="0 100"></path>
        </svg>
        <b id="hkmh">0</b><small>km/h</small>
        <span class="sp-nlabel">NITRO</span>
      </div>
    </div>
    ${showTouch ? `<div class="touch">
      <div class="pad left"><button data-key="left" aria-label="Steer left">◀</button><button data-key="right" aria-label="Steer right">▶</button></div>
      <div class="pad right"><button data-key="nitro" class="nitro" aria-label="Nitro boost" style="background:rgba(255,140,26,0.65);font-size:1.15rem">NITRO</button><button data-key="brake" class="brake">BRAKE</button><button data-key="gas" class="gas">GO</button></div>
    </div>` : `<div class="keys-hint">Arrows / WASD to drive · Space to brake · Shift for NITRO</div>`}`;
}

// The race calls these as things change. All are cheap to call every frame: they bail out early when
// nothing is different.
export function makeHud(root) {
  const $ = (id) => root.querySelector('#' + id);
  const hud = root.querySelector('.hud');
  const posEl = $('hpos'), posNum = posEl.querySelector('b'), posSuf = posEl.querySelector('span'), arrow = posEl.querySelector('.hud-arrow');
  const lapCard = $('hlapc'), lapEl = $('hlap'), lapsEl = $('hlaps'), timeEl = $('htime'), bestCard = $('hbestc'), bestEl = $('hbest');
  const lightsEl = $('hlights'), bulbs = [...lightsEl.querySelectorAll('i')];
  const bans = $('hban'), toastEl = $('htoast'), off = $('hoff'), vig = $('hvig');
  const kmhEl = $('hkmh'), sFill = $('hsfill'), nFill = $('hnfill'), mapEl = $('hmap');
  const last = {};
  const changed = (key, v) => (last[key] === v ? false : ((last[key] = v), true));
  const pop = (el, frames, ms = 420) => el.animate?.(frames, { duration: ms, easing: 'cubic-bezier(.2,1.6,.4,1)' });
  let toMap = null, dots = [], banner = null, toastTimer = 0;

  return {
    // mini map: draws the track once, then dots() moves a dot per rival and an arrow for the player
    map(track, cars) {
      const xs = track.samples.map((s) => s.x), zs = track.samples.map((s) => s.z);
      const midX = (Math.min(...xs) + Math.max(...xs)) / 2, midZ = (Math.min(...zs) + Math.max(...zs)) / 2;
      const k = 80 / Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs));
      toMap = (x, z) => [(50 + (x - midX) * k).toFixed(1), (50 - (z - midZ) * k).toFixed(1)];
      const d = track.samples.filter((_, i) => i % 3 === 0).map((s, i) => (i ? 'L' : 'M') + toMap(s.x, s.z).join(' ')).join('') + 'Z';
      const s0 = track.samples[0], [sx, sy] = toMap(s0.x, s0.z), deg = ((s0.heading * 180) / Math.PI).toFixed(1);
      const ramps = (track.jumps ?? []).map((j) => toMap(track.samples[j.idx].x, track.samples[j.idx].z))
        .map(([x, y]) => `<rect class="jump" x="${x - 2.6}" y="${y - 2.6}" width="5.2" height="5.2" rx="1"/>`).join('')
        + (track.obstacles ?? []).filter((o) => !o.cross).map((o) => toMap(o.x, o.z)).map(([x, y]) => `<circle class="tree" cx="${x}" cy="${y}" r="1.8"/>`).join('');
      const rivals = cars.filter((c) => !c.isPlayer), me = cars.find((c) => c.isPlayer);
      // start / finish line: a little chequered strip across the road, turned to match it
      mapEl.innerHTML = `<defs><pattern id="hchk" width="2" height="2" patternUnits="userSpaceOnUse"><rect width="2" height="2" fill="#fff"/><rect width="1" height="1" fill="#1b2140"/><rect x="1" y="1" width="1" height="1" fill="#1b2140"/></pattern></defs>
        <path class="edge" d="${d}"/><path class="road" d="${d}"/><path class="line" d="${d}"/>${ramps}
        <g transform="translate(${sx} ${sy}) rotate(${deg})"><rect class="start" x="-5" y="-1.5" width="10" height="3" fill="url(#hchk)"/></g>`
        + rivals.map((c) => `<circle class="car" r="3.2" fill="${c.color}"/>`).join('')
        + `<g class="me"><path d="M0 -6 L4.6 4.6 L0 2.4 L-4.6 4.6 Z" fill="${me.color}"/></g>`;
      dots = [...mapEl.querySelectorAll('.car')].map((el, i) => [el, rivals[i]]);
      this.meEl = mapEl.querySelector('.me');
      this.me = me;
    },
    dots() {
      for (const [el, c] of dots) {
        const [x, y] = toMap(c.x, c.z);
        el.setAttribute('cx', x);
        el.setAttribute('cy', y);
      }
      const [x, y] = toMap(this.me.x, this.me.z);
      this.meEl.setAttribute('transform', `translate(${x} ${y}) rotate(${((this.me.h * 180) / Math.PI).toFixed(0)})`);
    },

    // n: 1..4. gained: +1 when we just moved up, -1 when we dropped back (pops the badge and flashes an arrow)
    place(n, gained = 0) {
      if (!changed('place', n)) return;
      posNum.textContent = n;
      posSuf.textContent = ['th', 'st', 'nd', 'rd'][n] || 'th';
      posEl.className = `hud-pos ${MEDAL[n] ?? 'fourth'}`;
      if (gained) {
        pop(posEl, [{ transform: 'scale(1)' }, { transform: `scale(${gained > 0 ? 1.35 : 0.8})` }, { transform: 'scale(1)' }], 500);
        arrow.className = `hud-arrow ${gained > 0 ? 'up' : 'down'}`;
        arrow.getAnimations?.().forEach((a) => a.cancel());
        arrow.animate?.([{ opacity: 0, transform: `translateY(${gained > 0 ? 18 : -18}px) scale(.6)` }, { opacity: 1, transform: 'translateY(0) scale(1.1)', offset: 0.25 }, { opacity: 1, transform: 'translateY(0) scale(1)', offset: 0.8 }, { opacity: 0, transform: `translateY(${gained > 0 ? -14 : 14}px)` }], { duration: 1100, easing: 'ease-out' });
      }
    },
    lap(n, of) {
      if (!changed('lap', n * 100 + of)) return;
      lapEl.textContent = n;
      lapsEl.textContent = '/' + of;
      lapCard.classList.toggle('final', n === of && of > 1);
      if (last.lapShown) pop(lapCard, [{ transform: 'scale(1)' }, { transform: 'scale(1.25)' }, { transform: 'scale(1)' }], 500);
      last.lapShown = true;
    },
    timer(t) {
      const s = clock(t);
      if (changed('time', s)) timeEl.textContent = s;
    },
    best(t) {
      if (!changed('best', t)) return;
      bestCard.classList.toggle('show', t > 0);
      if (t > 0) bestEl.textContent = clock(t);
    },
    // a lap was just finished: flash its time (and a star when it beat the best lap)
    lapDone(n, t, isBest) {
      this.toast(`Lap ${n}  ${clock(t)}`, isBest && n > 1 ? 'BEST!' : '');
      pop(timeEl.parentNode, [{ transform: 'scale(1)' }, { transform: 'scale(1.2)' }, { transform: 'scale(1)' }]);
    },
    // a smaller message that drops in under the top of the screen for a couple of seconds
    toast(text, tag = '', ms = 2200) {
      toastEl.innerHTML = '';
      toastEl.append(text);
      if (tag) { const b = document.createElement('b'); b.textContent = tag; toastEl.append(b); }
      toastEl.classList.remove('show');
      void toastEl.offsetWidth; // restart the drop-in animation
      toastEl.classList.add('show');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => toastEl.classList.remove('show'), ms);
    },

    // countdown lights: n red lamps lit (0..3), 'go' = all green, null = slide away
    lights(n) {
      if (!changed('lights', n)) return;
      lightsEl.classList.toggle('show', n !== null);
      lightsEl.classList.toggle('go', n === 'go');
      bulbs.forEach((b, i) => {
        const on = n === 'go' || (typeof n === 'number' && i < n);
        if (on && !b.classList.contains('on')) pop(b, [{ transform: 'scale(.6)' }, { transform: 'scale(1.15)' }, { transform: 'scale(1)' }], 300);
        b.classList.toggle('on', on);
      });
    },

    // Big slanted words across the middle of the screen: 'GO!', 'BOOST!', 'NICE JUMP!', 'WRONG WAY'...
    // style: 'gold' (default), 'green', 'blue', 'red', 'pink' or 'win'. opts: { hold: seconds on screen,
    // sub: small line under it, slide: true to whoosh across instead of popping in }.
    // Calling it again with the same text while it shows just keeps it up (safe to call every frame).
    banner(text, style = 'gold', opts = {}) {
      const hold = opts.hold ?? 1.1;
      if (banner && banner.text === text && !banner.leaving) {
        clearTimeout(banner.timer);
        banner.timer = setTimeout(leave, hold * 1000, banner);
        return;
      }
      if (banner) leave(banner, true);
      const el = document.createElement('div');
      el.className = `hud-banner ${style} ${opts.slide ? 'slide' : 'pop'}`;
      const word = document.createElement('b');
      word.textContent = text;
      word.dataset.text = text;
      el.append(word);
      if (opts.sub) { const s = document.createElement('span'); s.textContent = opts.sub; el.append(s); }
      bans.append(el);
      banner = { el, text };
      banner.timer = setTimeout(leave, hold * 1000, banner);
    },
    // hides a banner that was shown with a long hold (e.g. 'WRONG WAY' once you turn round)
    clearBanner(text) {
      if (banner && (!text || banner.text === text)) leave(banner);
    },

    speed(kmh, frac) {
      if (!changed('kmh', Math.round(kmh))) return;
      kmhEl.textContent = Math.round(kmh);
      sFill.setAttribute('stroke-dasharray', `${(Math.max(0, Math.min(1, frac)) * 100).toFixed(1)} 100`);
      sFill.style.opacity = frac > 0.01 ? 1 : 0; // a zero-length round-capped line would still show a dot
    },
    // 0..1. The nitro ring only appears once this has been called.
    nitro(v) {
      v = Math.max(0, Math.min(1, v || 0));
      if (!changed('nitro', Math.round(v * 200))) return;
      hud.classList.add('has-nitro');
      nFill.setAttribute('stroke-dasharray', `${(v * 100).toFixed(1)} 100`);
      nFill.style.opacity = v > 0.01 ? 1 : 0;
      hud.classList.toggle('nitro-full', v >= 0.995);
    },
    // edges of the screen darken a little at top speed and glow blue while boosting
    fast(frac, boosting) {
      const o = Math.round(Math.max(0, Math.min(1, (frac - 0.6) / 0.4)) * 20) / 20;
      if (changed('vig', o)) vig.style.opacity = boosting ? 1 : o;
      if (changed('boost', !!boosting)) { hud.classList.toggle('boosting', !!boosting); vig.style.opacity = boosting ? 1 : o; }
    },
    offroad(on) {
      if (changed('off', !!on)) off.classList.toggle('show', !!on);
    },
    // the player crossed the line for the last time
    finish(place) {
      if (!changed('finish', place)) return;
      hud.classList.add('done');
      this.banner(place === 1 ? 'YOU WIN!' : 'FINISH!', place === 1 ? 'win' : 'gold', { hold: 10, sub: `${place}${['th', 'st', 'nd', 'rd'][place] || 'th'} place` });
    },
  };

  // slide or fade a banner away, then drop its element
  function leave(b, now) {
    if (!b || b.leaving) return;
    b.leaving = true;
    clearTimeout(b.timer);
    if (banner === b) banner = null;
    b.el.classList.add(now ? 'gone' : 'out');
    setTimeout(() => b.el.remove(), now ? 200 : 450);
  }
}

// After a race. Same board as the home screen: the result and any new prizes on the left; the car,
// the rivals and the buttons on the right. result: { place, unlocked, levelChange }.
export function resultsHtml(result, save, hint, photo) {
  const { place, unlocked, levelChange, times } = result, won = place === 1;
  const sub = won ? 'You won!' : place === 2 ? 'So close! Try again!' : 'Keep practicing. You got this!';
  const medal = MEDAL[place] ?? 'fourth';
  // podium: 2nd, 1st, 3rd, then a low step for 4th, with the player's car colour standing on theirs
  const steps = [2, 1, 3, 4].map((n) => `<div class="r-step s${n} ${n === place ? 'me' : ''}">${n === place ? `<i class="r-you" style="--car:${COLORS[save.car.color]?.hex ?? '#ffd23f'}"><span>YOU</span></i>` : ''}<b>${n}</b></div>`).join('');
  const chips = times?.time > 0 ? `<div class="r-times"><span>${svg(24, '<circle cx="12" cy="13" r="8"></circle><path d="M12 13 L12 9 M10 3 H14"></path>', 'fill="none" stroke="#ffd23f" stroke-width="2.6" stroke-linecap="round"')}${clock(times.time)}</span>${times.best > 0 ? `<span><small>BEST LAP</small>${clock(times.best)}</span>` : ''}</div>` : '';
  // a shower of paper confetti over the board after a win (plays once)
  const confetti = won ? `<div class="r-confetti" aria-hidden="true">${Array.from({ length: 36 }, (_, i) =>
    `<i style="--x:${((i * 37) % 100).toFixed(0)}%;--d:${((i * 7) % 11) / 10}s;--r:${(i * 53) % 360}deg;--c:${['#ffd23f', '#f05fa6', '#4fd2ff', '#2fbf71', '#f28c28', '#ffffff'][i % 6]}"></i>`).join('')}</div>` : '';
  const news = unlocked.length ? `<div class="r-new g-card">
      <div class="r-new-title">${svg(30, ICON.gift)}<span>New prize${unlocked.length === 1 ? '' : 's'}!</span></div>
      <div class="r-new-row">${unlocked.map(([, kind, id], i) => `<div class="r-new-tile" style="--i:${i}"><div class="h-prize-pic">${prizePic(kind, id, save, photo)}</div><span>${itemName(kind, id)}</span><small>${KIND_LABEL[kind]}</small></div>`).join('')}</div>
    </div>` : '';
  return `<div class="home results">${confetti}
    <div class="h-top">
      <div class="h-title"><span>Ezra's</span><b>Grand Prix</b></div>
      <div class="h-top-right"><div class="g-wins h-wins g-card" role="img" aria-label="${save.wins} wins">${svg(44, ICON.trophy, GOLD)}<span>${save.wins}</span></div></div>
    </div>
    <div class="h-main">
      <div class="h-left">
        <div class="r-result g-card ${won ? 'won' : ''} ${unlocked.length ? 'compact' : ''}">
          <div class="r-head">
            <div class="r-medal ${medal}">${won ? svg(96, ICON.trophy, 'fill="#1f2a4f" stroke="#1f2a4f" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"') : `<b>${place}</b>`}</div>
            <div class="r-words"><div class="r-place">${ordinal(place)} place${won ? '!' : ''}</div><div class="r-sub">${sub}</div>${chips}</div>
          </div>
          <div class="r-podium">${steps}</div>
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
