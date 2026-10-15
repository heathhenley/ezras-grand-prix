// All sounds are made on the spot with the Web Audio API, so there are no sound files to load.
// Browsers only allow sound after a tap or key press; unlock() is called from the first one.
//
// Everything runs into one of four buses (sfx, engine, music, ambience) so the mix can be balanced,
// then through a gentle compressor and a limiter so lots of sounds at once never clip.
// Music and ambience are scheduled a little ahead by a timer (tick) so they stay in time even if a frame is slow.

let ctx = null;
let master, sfxBus, engineBus, ambBus, musicBus, musicFade, duck;
let noiseBuf = null, shaperCurve = null;
let enabled = true;
let engine = null;
let warned = false;

const VOLUME = 0.85;
// the mix: music sits under the engine so the car still feels loud and fast
const MIX = { sfx: 1, engine: 0.95, music: 0.24, amb: 0.55 };

function audio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = enabled ? VOLUME : 0;
    const comp = ctx.createDynamicsCompressor(); // glue: evens things out a little
    comp.threshold.value = -16; comp.knee.value = 10; comp.ratio.value = 3.5; comp.attack.value = 0.005; comp.release.value = 0.25;
    const limit = ctx.createDynamicsCompressor(); // safety net: nothing gets past about -2 dB
    limit.threshold.value = -2; limit.knee.value = 0; limit.ratio.value = 20; limit.attack.value = 0.002; limit.release.value = 0.12;
    master.connect(comp).connect(limit).connect(ctx.destination);
    sfxBus = bus(MIX.sfx, master);
    engineBus = bus(MIX.engine, master);
    ambBus = bus(MIX.amb, master);
    duck = bus(1, master); // dips the music under big moments
    musicFade = bus(1, duck); // fades between songs
    musicBus = bus(MIX.music, musicFade);
    // one shared buffer of hiss, used by every noisy sound
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    // soft clipping curve that gives the engine a bit of growl
    shaperCurve = new Float32Array(512);
    for (let i = 0; i < 512; i++) shaperCurve[i] = Math.tanh((i / 255.5 - 1) * 2.2);
    setInterval(tick, 40);
    // save the iPad's battery when the game is in the background
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) ctx.suspend?.()?.catch?.(() => {}); else if (enabled) resume();
    });
    if (wantMusic) { const w = wantMusic; wantMusic = null; music(w); }
  }
  if (ctx.state === 'suspended' && !document.hidden) resume();
  return ctx;
}

function resume() {
  try { const p = ctx.resume(); p?.catch?.(() => {}); } catch { /* old Safari */ }
}

function bus(vol, out) {
  const g = ctx.createGain();
  g.gain.value = vol;
  g.connect(out);
  return g;
}

// the audio context, but only if sound is on and has been unlocked; one-shot sounds do nothing otherwise
const ready = () => (ctx && enabled ? ctx : null);

export const unlock = () => { audio(); };

export function setEnabled(on) {
  enabled = on;
  if (!ctx) return;
  master.gain.value = on ? VOLUME : 0;
  if (on) { resume(); if (mus) mus.next = ctx.currentTime + 0.1; } // pick the song up again from now
}

// ---------- building blocks ----------

const mtof = (m) => 440 * 2 ** ((m - 69) / 12);
const rand = (a, b) => a + Math.random() * (b - a);

function env(g, t, vol, attack, length) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(length, attack + 0.01));
}

function panned(out, pan) {
  if (!pan || !ctx.createStereoPanner) return out;
  const p = ctx.createStereoPanner();
  p.pan.value = pan;
  p.connect(out);
  return p;
}

// One note. o: { attack, glide (end freq), glideTime, detune, filter (lowpass Hz), pan }
function tone(type, freq, t, length, vol, out, o = {}) {
  const osc = ctx.createOscillator(), g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (o.glide) osc.frequency.exponentialRampToValueAtTime(o.glide, t + (o.glideTime ?? length * 0.8));
  if (o.detune) osc.detune.value = o.detune;
  env(g, t, vol, o.attack ?? 0.005, length);
  let node = osc;
  if (o.filter) {
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = o.filter;
    node = node.connect(f);
  }
  node.connect(g).connect(panned(out, o.pan));
  osc.start(t);
  osc.stop(t + length + 0.05);
}

// A burst of filtered hiss. o: { type, freq, q, sweep (end freq), attack, pan }
function hiss(t, length, vol, out, o = {}) {
  const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  src.buffer = noiseBuf;
  f.type = o.type ?? 'bandpass';
  f.frequency.setValueAtTime(o.freq ?? 1000, t);
  if (o.sweep) f.frequency.exponentialRampToValueAtTime(o.sweep, t + length);
  f.Q.value = o.q ?? 1;
  env(g, t, vol, o.attack ?? 0.003, length);
  src.connect(f).connect(g).connect(panned(out, o.pan));
  src.start(t, Math.random() * 2);
  src.stop(t + length + 0.05);
}

// a bell: a pure tone plus a quieter clangy overtone that dies away first
function bell(freq, t, length, vol, out, pan) {
  tone('sine', freq, t, length, vol, out, { pan });
  tone('sine', freq * 2.76, t, length * 0.4, vol * 0.3, out, { pan });
}

// a brassy fanfare note: two slightly detuned saws through a filter that opens as it's blown
function brass(freq, t, length, vol, out) {
  const g = ctx.createGain(), f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.Q.value = 2;
  f.frequency.setValueAtTime(500, t);
  f.frequency.linearRampToValueAtTime(3200, t + 0.06);
  f.frequency.exponentialRampToValueAtTime(1300, t + length);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.03);
  g.gain.setTargetAtTime(vol * 0.7, t + 0.05, 0.1);
  g.gain.setTargetAtTime(0.0001, t + length - 0.05, 0.08);
  f.connect(g).connect(out);
  for (const det of [-7, 7]) {
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = freq;
    o.detune.value = det;
    o.connect(f);
    o.start(t);
    o.stop(t + length + 0.4);
  }
}

function kick(t, vol, out) {
  tone('sine', 150, t, 0.28, vol, out, { glide: 42, glideTime: 0.12, attack: 0.002 });
}
function snare(t, vol, out) {
  hiss(t, 0.16, vol, out, { freq: 1900, q: 0.8 });
  tone('triangle', 200, t, 0.08, vol * 0.6, out, { glide: 150 });
}
function hat(t, vol, out, open) {
  hiss(t, open ? 0.28 : 0.045, vol, out, { type: 'highpass', freq: 7500, q: 0.7 });
}
function crash(t, vol, out) {
  hiss(t, 1.4, vol, out, { type: 'highpass', freq: 4500, q: 0.5 });
}

// Briefly push the music down under a big sound. depth: how loud the music stays (0..1).
function duckMusic(depth, hold) {
  const t = ctx.currentTime;
  duck.gain.cancelScheduledValues(t);
  duck.gain.setTargetAtTime(depth, t, 0.03);
  duck.gain.setTargetAtTime(1, t + hold, 0.35);
}

// ---------- quick sounds ----------

export function tap() {
  const a = ready(); if (!a) return;
  tone('triangle', 620, a.currentTime, 0.07, 0.12, sfxBus, { glide: 940, glideTime: 0.04 });
}

// Start lights: a short beep for 3-2-1, then a long high one for GO.
export function lightsBeep(final) {
  const a = ready(); if (!a) return;
  const t = a.currentTime, f = final ? 1046.5 : 523.25, len = final ? 0.75 : 0.24;
  tone('square', f, t, len, 0.09, sfxBus, { filter: 2600 });
  tone('sine', f / 2, t, len, 0.12, sfxBus);
  if (final) {
    tone('square', f * 1.5, t, len * 0.8, 0.03, sfxBus, { filter: 3000 });
    if (engine) music('race', 0.02); // GO in a race kicks off the race music
  }
}
export const countdown = () => lightsBeep(false);
export const go = () => lightsBeep(true);

export function boost() {
  const a = ready(); if (!a) return;
  const t = a.currentTime;
  hiss(t, 0.6, 0.35, sfxBus, { freq: 300, sweep: 3800, q: 1.5, attack: 0.02 });
  tone('sawtooth', 160, t, 0.45, 0.09, sfxBus, { glide: 700, filter: 2200 });
  kick(t, 0.35, sfxBus);
  duckMusic(0.65, 0.4);
}

// A coin-style "bling".
export function pickup() {
  const a = ready(); if (!a) return;
  const t = a.currentTime;
  tone('square', 988, t, 0.07, 0.07, sfxBus, { filter: 4000 });
  tone('square', 1319, t + 0.07, 0.3, 0.07, sfxBus, { filter: 4000 });
  bell(2637, t + 0.07, 0.35, 0.03, sfxBus);
}

export function lap() {
  const a = ready(); if (!a) return;
  const t = a.currentTime;
  bell(1319, t, 0.5, 0.12, sfxBus);
  bell(1760, t + 0.12, 0.8, 0.12, sfxBus);
}

// Last lap: a little fanfare, and the music speeds up and goes up a key.
export function finalLap() {
  if (mus) mus.intense = true;
  const a = ready(); if (!a) return;
  const t = a.currentTime;
  [72, 76, 79].forEach((m, i) => brass(mtof(m), t + i * 0.1, 0.16, 0.06, sfxBus));
  brass(mtof(84), t + 0.3, 0.7, 0.07, sfxBus);
  brass(mtof(79), t + 0.3, 0.7, 0.04, sfxBus);
  bell(2093, t + 0.3, 1.2, 0.07, sfxBus);
  crash(t + 0.3, 0.07, sfxBus);
  duckMusic(0.35, 1.0);
}

// Passing someone: a whoosh going by plus a happy chirp.
export function overtake() {
  const a = ready(); if (!a) return;
  const t = a.currentTime;
  whoosh(0, 0.8);
  tone('triangle', 880, t + 0.08, 0.16, 0.08, sfxBus, { glide: 1760, glideTime: 0.1 });
  bell(1760, t + 0.18, 0.4, 0.05, sfxBus);
}

// Something rushing past. side: -1 left .. 1 right.
export function whoosh(side = 0, strength = 1) {
  const a = ready(); if (!a) return;
  const t = a.currentTime;
  const s = Math.max(0.1, Math.min(1, strength));
  hiss(t, 0.45, 0.25 * s, sfxBus, { freq: 500, sweep: 2200, q: 1.2, attack: 0.15, pan: side });
}

// Metal scraping: a fizz of high hiss with a few crackles. strength 0..1
export function spark(strength = 0.5) {
  const a = ready(); if (!a) return;
  const t = a.currentTime, s = Math.max(0, Math.min(1, strength));
  hiss(t, 0.08 + 0.18 * s, 0.07 + 0.18 * s, sfxBus, { type: 'highpass', freq: 3200, q: 0.9 });
  for (let i = 0; i < 2 + s * 4; i++) hiss(t + rand(0, 0.15), 0.02, 0.08 + 0.12 * s, sfxBus, { type: 'highpass', freq: 5000 });
}

// A crowd cheering: several bands of hiss swelling up and dying away, with claps and whistles.
// size: 0.6 for a quick "yay" (a big jump), 1 for the full roar at the finish.
export function cheer(size = 0.6) {
  const a = ready(); if (!a) return;
  const t = a.currentTime, end = 1.4 + 2 * size;
  for (const [f, v0] of [[450, 0.16], [900, 0.2], [1600, 0.15], [2800, 0.08]]) {
    const v = v0 * (0.4 + 0.6 * size);
    const src = a.createBufferSource(), filt = a.createBiquadFilter(), g = a.createGain();
    src.buffer = noiseBuf;
    src.loop = true;
    filt.type = 'bandpass';
    filt.frequency.value = f;
    filt.Q.value = 1.4;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(v, t + 0.35);
    // a few random wobbles so it sounds like lots of people, not a radio between stations
    for (let k = 1; k < end / 0.3 - 2; k++) g.gain.linearRampToValueAtTime(v * rand(0.6, 1), t + 0.35 + k * 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, t + end);
    src.connect(filt).connect(g).connect(sfxBus);
    src.start(t, Math.random() * 2);
    src.stop(t + end + 0.1);
  }
  for (let i = 0; i < 26 * size; i++) hiss(t + rand(0.1, end - 1), 0.03, rand(0.04, 0.09), sfxBus, { freq: 1500, q: 1.5, pan: rand(-0.7, 0.7) });
  tone('sine', 1900, t + 0.3, 0.45, 0.04, sfxBus, { glide: 2600, attack: 0.05, pan: -0.4 });
  if (size > 0.8) tone('sine', 2200, t + 0.9, 0.35, 0.035, sfxBus, { glide: 1700, attack: 0.04, pan: 0.5 });
  duckMusic(0.75 - 0.3 * size, end - 1.2);
}

// The player crossed the finish line: the crowd roars and the race music bows out.
export function crossLine(place = 1) {
  const a = ready(); if (!a) return;
  cheer(place === 1 ? 1 : 0.75);
  music(null);
}

// Winning fanfare: "da-da-da DAAA, da-da DAAAA!" with drums, then sparkles. Also cheers.
export function win() {
  const a = ready(); if (!a) return;
  const t = a.currentTime;
  holdMusic(4.2);
  const T = 0.11;
  [67, 67, 67].forEach((m, i) => { brass(mtof(m), t + i * T, T * 0.9, 0.07, sfxBus); snare(t + i * T, 0.08, sfxBus); });
  brass(mtof(72), t + 3 * T, 0.5, 0.08, sfxBus); brass(mtof(64), t + 3 * T, 0.5, 0.05, sfxBus);
  kick(t + 3 * T, 0.4, sfxBus); crash(t + 3 * T, 0.08, sfxBus);
  brass(mtof(69), t + 0.85, 0.18, 0.07, sfxBus);
  brass(mtof(71), t + 1.05, 0.18, 0.07, sfxBus);
  const big = t + 1.25;
  for (const m of [60, 64, 67, 72]) brass(mtof(m), big, 1.5, 0.05, sfxBus);
  kick(big, 0.5, sfxBus); crash(big, 0.12, sfxBus);
  [84, 88, 91, 96].forEach((m, i) => bell(mtof(m), big + 0.25 + i * 0.08, 0.9, 0.05, sfxBus, (i - 1.5) * 0.3));
  cheer(1);
}

// Finished, but not first: a friendly, proud little tune.
export function finish() {
  const a = ready(); if (!a) return;
  const t = a.currentTime;
  holdMusic(2.4);
  [67, 71, 74].forEach((m, i) => tone('triangle', mtof(m), t + i * 0.15, 0.3, 0.13, sfxBus));
  for (const m of [67, 71, 74, 79]) tone('triangle', mtof(m), t + 0.45, 1.1, 0.07, sfxBus, { attack: 0.02 });
  bell(mtof(91), t + 0.45, 1.0, 0.05, sfxBus);
}

export function prize() {
  const a = ready(); if (!a) return;
  const t = a.currentTime;
  [784, 988, 1175, 1568, 1976].forEach((f, i) => bell(f, t + i * 0.08, 0.6, 0.07, sfxBus, (i - 2) * 0.25));
  hiss(t, 0.8, 0.04, sfxBus, { type: 'highpass', freq: 6000, attack: 0.1 });
}

// Car-on-car bump: a burst of muffled noise plus a low thud. strength: 0 (tap) .. 1 (crash).
export function hit(strength) {
  const a = ready(); if (!a) return;
  const t = a.currentTime, vol = 0.15 + 0.45 * strength;
  hiss(t, 0.12 + 0.1 * strength, vol, sfxBus, { type: 'lowpass', freq: 500 + 1800 * strength, attack: 0.002 }); // harder hits sound sharper
  tone('sine', 110, t, 0.18, vol, sfxBus, { glide: 45, glideTime: 0.15, attack: 0.002 });
}

// ---------- engines ----------

// Gear change points as a share of top speed. The revs climb through each gear then drop at the next.
const GEARS = [0, 0.14, 0.31, 0.51, 0.74, 9];

// An engine: a buzzy saw plus a sub-octave, "putted" by a wobble at the firing rate, roughed up by soft clipping,
// then a filter that opens as it revs. The player's (rich) one also has a high layer, intake hiss and a turbo whistle.
// tune shifts the pitch a little so the rivals' engines do not all sound like the player's.
function makeEngine(tune = 1, rich = false) {
  const a = audio();
  if (!a) return null;
  const osc = (type, gainVal, into) => {
    const o = a.createOscillator(), g = a.createGain();
    o.type = type;
    g.gain.value = gainVal;
    o.connect(g).connect(into);
    o.start();
    return o;
  };
  const am = a.createGain(), shaper = a.createWaveShaper(), filter = a.createBiquadFilter(), gain = a.createGain();
  const pan = a.createStereoPanner ? a.createStereoPanner() : null;
  am.gain.value = 0.75;
  shaper.curve = shaperCurve;
  filter.type = 'lowpass';
  filter.Q.value = 1.5;
  gain.gain.value = 0;
  am.connect(shaper).connect(filter).connect(gain);
  if (pan) gain.connect(pan).connect(engineBus); else gain.connect(engineBus);
  const e = { tune, rich, am, filter, gain, pan, gear: 0, shiftAt: -9, nodes: [] };
  e.main = osc('sawtooth', 0.5, am);
  e.sub = osc('square', 0.3, am);
  // the putt-putt: wobbles the volume at half the engine note
  const depth = a.createGain();
  depth.gain.value = 0.25;
  e.lfo = a.createOscillator();
  e.lfo.connect(depth).connect(am.gain);
  e.lfo.start();
  e.nodes.push(e.main, e.sub, e.lfo);
  if (rich) {
    e.top = osc('sawtooth', 0.12, am);
    e.top.detune.value = 8;
    // intake hiss, tuned to follow the revs
    const src = a.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    e.rasp = a.createBiquadFilter();
    e.rasp.type = 'bandpass';
    e.rasp.Q.value = 2;
    const rg = a.createGain();
    rg.gain.value = 0.45;
    src.connect(e.rasp).connect(rg).connect(am);
    src.start();
    // turbo: a rushing hiss plus a high whistle, only while boosting
    const tsrc = a.createBufferSource();
    tsrc.buffer = noiseBuf;
    tsrc.loop = true;
    const tf = a.createBiquadFilter();
    tf.type = 'bandpass';
    tf.frequency.value = 2400;
    tf.Q.value = 1.2;
    e.boostGain = a.createGain();
    e.boostGain.gain.value = 0;
    tsrc.connect(tf).connect(e.boostGain).connect(engineBus);
    tsrc.start(0, 1);
    e.whistle = osc('sine', 0.25, e.boostGain);
    e.nodes.push(e.top, src, tsrc, e.whistle);
  }
  return e;
}

// speed: 0..1.25 share of top speed. gas: on the throttle. volume: how loud. side: pan. boost: turbo on.
function tuneEngine(e, speed, gas, volume, side = 0, boost = false) {
  const t = ctx.currentTime, s = Math.max(0, Math.min(1.25, speed));
  let g = 0;
  while (g < 4 && s > GEARS[g + 1]) g++;
  if (g > e.gear && gas && s > 0.05) {
    e.shiftAt = t; // just changed up a gear
    if (e.rich && enabled) hiss(t, 0.07, 0.12, engineBus, { type: 'lowpass', freq: 900 }); // a little "pff" from the exhaust
  }
  e.gear = g;
  const shifting = t - e.shiftAt < 0.13;
  const r = (s - GEARS[g]) / ((g < 4 ? GEARS[g + 1] : 1) - GEARS[g]);
  let rpm = s < 0.02 ? 0 : g === 0 ? 0.2 + 0.8 * r : 0.45 + 0.55 * Math.min(1.3, r);
  if (gas) rpm += 0.05;
  if (shifting) rpm *= 0.8;
  // at idle the note wanders a tiny bit, so it sounds like it's ticking over
  const f = (44 + 108 * rpm) * e.tune * (s < 0.02 ? 1 + 0.03 * Math.sin(t * 8.5) : 1);
  const tc = shifting ? 0.03 : 0.06;
  e.main.frequency.setTargetAtTime(f, t, tc);
  e.sub.frequency.setTargetAtTime(f * 0.5, t, tc);
  e.lfo.frequency.setTargetAtTime(f * 0.5, t, tc);
  e.filter.frequency.setTargetAtTime((350 + 1900 * rpm * (gas ? 1 : 0.55) + (boost ? 900 : 0)) * (shifting ? 0.6 : 1), t, 0.06);
  e.gain.gain.setTargetAtTime(volume * (gas ? 1 : 0.65) * (shifting ? 0.55 : 1), t, 0.06);
  e.pan?.pan.setTargetAtTime(side, t, 0.1);
  if (e.rich) {
    e.top.frequency.setTargetAtTime(f * 2, t, tc);
    e.rasp.frequency.setTargetAtTime(f * 6, t, 0.08);
    e.boostGain.gain.setTargetAtTime(boost ? 0.09 : 0, t, boost ? 0.05 : 0.25);
    e.whistle.frequency.setTargetAtTime(1700 + 1100 * s, t, 0.1);
  }
}

function stopEngine(e) {
  const t = ctx.currentTime;
  e.gain.gain.setTargetAtTime(0, t, 0.05);
  e.boostGain?.gain.setTargetAtTime(0, t, 0.05);
  for (const n of e.nodes) n.stop(t + 0.3);
}

// Tyre squeal: hiss squeezed through two narrow, slightly different filters, so it whistles.
let squeal = null;
function makeSqueal() {
  const a = audio();
  if (!a) return null;
  const src = a.createBufferSource(), gain = a.createGain();
  src.buffer = noiseBuf;
  src.loop = true;
  gain.gain.value = 0;
  const bands = [1, 1.52].map((ratio) => {
    const f = a.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 14;
    src.connect(f).connect(gain);
    return { f, ratio };
  });
  gain.connect(sfxBus);
  src.start();
  return { src, gain, bands };
}

// amount: 0 (gripping) .. 1 (sliding hard). Call every frame.
export function screechSet(amount) {
  if (!squeal) return;
  const t = ctx.currentTime, v = Math.max(0, Math.min(1, amount));
  squeal.gain.gain.setTargetAtTime(v * 0.5, t, v > 0 ? 0.04 : 0.09); // comes in quickly, lets go a little slower
  for (const { f, ratio } of squeal.bands) f.frequency.setTargetAtTime((950 + 350 * v) * ratio, t, 0.1); // rises as it slides harder
}

// The player's engine, plus one for each rival. trackId also starts that track's background sounds.
let rivals = [];
export function engineStart(rivalCount = 0, trackId) {
  if (engine) return;
  engine = makeEngine(1, true);
  if (!engine) return;
  rivals = Array.from({ length: rivalCount }, (_, k) => makeEngine([0.84, 1.19, 0.93][k % 3]));
  squeal = makeSqueal();
  engineSet(0, false);
  music(null); // quiet for the countdown; GO starts the race music
  ambience(trackId);
}

// speed: 0..1 share of top speed. gas: is the driver on the throttle. boost: is the turbo on.
export function engineSet(speed, gas, boost = false) {
  if (engine) tuneEngine(engine, speed, gas, 0.1, 0, boost);
}

// A rival's engine as heard from the player's car: loud when close, fading to nothing by about 60 m.
// side: -1 (fully to the left) .. 1 (to the right).
export function rivalSet(k, speed, distance, side) {
  const e = engine && rivals[k];
  if (!e) return;
  const near = Math.max(0, 1 - distance / 60);
  tuneEngine(e, speed, true, 0.11 * near * near, side);
  // a whoosh as a rival zips past close by (once per pass; it re-arms when it's out of the way again)
  if (e.prevDist < 4.5 && distance > e.prevDist && !e.whooshed && speed > 0.4) { whoosh(side, 0.7); e.whooshed = true; }
  else if (distance > 9) e.whooshed = false;
  e.prevDist = distance;
}

export function engineStop() {
  if (!engine) return;
  for (const e of [engine, ...rivals]) stopEngine(e);
  engine = null;
  rivals = [];
  if (squeal) {
    squeal.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
    squeal.src.stop(ctx.currentTime + 0.3);
    squeal = null;
  }
  ambience(null);
  music(null);
}

// ---------- music ----------
// Songs are written on a grid of 16th notes. Melodies are strings of 8th notes: a note name, '-' to hold, '.' for a rest.

function melody(str) {
  const out = {};
  const tokens = str.trim().split(/\s+/);
  tokens.forEach((tok, i) => {
    const m = /^([A-G])(#?)(\d)$/.exec(tok);
    if (!m) return;
    let len = 1;
    while (tokens[i + len] === '-') len++;
    out[i * 2] = { midi: 12 * (+m[3] + 1) + 'C D EF G A B'.indexOf(m[1]) + (m[2] ? 1 : 0), len: len * 2 };
  });
  return out;
}

const C = [60, 64, 67], Am = [57, 60, 64], F = [57, 60, 65], G = [55, 59, 62], Dm = [57, 62, 65], Bb = [58, 62, 65], C2 = [55, 60, 64];

// Race song: bouncy synth-pop in C, four-on-the-floor. Every other time round the tune drops out for a sparkly arpeggio.
// On the last lap it goes up a key, speeds up and plays everything at once.
const RACE = {
  bpm: 140, lift: 12, steps: 128,
  chords: [C, Am, F, G, C, Am, F, G],
  bass: [36, 33, 41, 43, 36, 33, 41, 43],
  lead: melody(`E5 G5 C6 G5 A5 G5 E5 -   C5 E5 A5 G5 E5 - D5 -   F5 A5 C6 A5 G5 A5 F5 -   G5 - B5 - D6 - . .
                E5 G5 C6 G5 A5 G5 E5 G5  A5 - C6 - B5 A5 G5 -   F5 G5 A5 C6 D6 C6 A5 G5  B5 - D6 - C6 - - .`),
  play(step, t, s16, loop, intense) {
    const bar = step >> 4, b = step & 15, tr = intense ? 2 : 0, out = musicBus;
    const chord = this.chords[bar];
    if (b === 0 && bar === 0 && (loop === 0 || intense)) crash(t, 0.12, out);
    if ((b & 3) === 0) kick(t, 0.55, out);
    if (b === 4 || b === 12) snare(t, 0.22, out);
    if (bar === 7 && b >= 13) snare(t, 0.1 + 0.04 * (b - 12), out); // little fill into the top
    if ((b & 3) === 2) hat(t, 0.1, out, intense && b === 14);
    else if (intense && (b & 1)) hat(t, 0.04, out);
    if ((b & 1) === 0) {
      const root = this.bass[bar] + tr + [0, 0, 12, 0, 7, 0, 12, 7][b >> 1];
      tone('sawtooth', mtof(root), t, s16 * 1.7, 0.2, out, { filter: 650 });
    }
    if ((b & 3) === 2) for (const m of chord) tone('square', mtof(m + tr), t, s16 * 1.4, 0.03, out, { filter: 1600 });
    const n = this.lead[step];
    if (n && (loop % 2 === 0 || intense)) {
      const f = mtof(n.midi + tr), len = n.len * s16 * 0.92;
      tone('square', f, t, len, 0.05, out, { filter: 3500, attack: 0.01 });
      tone('triangle', f, t, len, 0.05, out, { detune: 9, attack: 0.01 });
    }
    if (loop % 2 === 1 || intense) tone('triangle', mtof(chord[[0, 1, 2, 1][b & 3]] + 12 + tr + (b >= 8 ? 12 : 0)), t, 0.1, intense ? 0.03 : 0.05, out);
  },
};

// Home/garage song: slow, soft and music-boxy.
const MENU = {
  bpm: 92, steps: 64,
  chords: [F, Dm, Bb, C2],
  bass: [41, 38, 46, 36],
  lead: melody('A5 . C6 . A5 G5 F5 .   D5 . F5 . A5 . G5 .   F5 . D5 . F5 G5 A5 .   G5 . E5 . C5 . . .'),
  play(step, t) {
    const s16 = 60 / this.bpm / 4, bar = step >> 4, b = step & 15, out = musicBus;
    if (b === 0) for (const m of this.chords[bar]) tone('triangle', mtof(m), t, s16 * 16, 0.065, out, { attack: 0.3 });
    if (b === 0 || b === 8) tone('sine', mtof(this.bass[bar]), t, s16 * 7, 0.32, out, { attack: 0.02 });
    if (b === 0) kick(t, 0.3, out);
    if ((b & 1) === 0) hat(t, (b & 3) === 2 ? 0.05 : 0.025, out);
    const n = this.lead[step];
    if (n) bell(mtof(n.midi), t, 0.7, 0.12, out);
  },
};
const SONGS = { race: RACE, menu: MENU };

let mus = null; // the song playing: { name, song, step, loop, next (when the next 16th starts), intense }
let wantMusic = null; // asked for before sound was unlocked
let holdUntil = 0; // a fanfare is playing; songs wait for it

// Switch songs: 'race', 'menu' or null for silence. soon: seconds until it starts.
export function music(name, soon = 0.5) {
  if (!ctx) { wantMusic = name; return; }
  if ((mus?.name ?? null) === name) return;
  const t = ctx.currentTime;
  musicFade.gain.cancelScheduledValues(t);
  musicFade.gain.setTargetAtTime(0, t, 0.12);
  mus = null;
  if (!name) return;
  const start = Math.max(t + soon, holdUntil);
  musicFade.gain.setTargetAtTime(1, Math.max(t, start - 0.05), 0.02);
  mus = { name, song: SONGS[name], step: 0, loop: 0, next: start, intense: false };
}

// a fanfare needs the stage: push the song back until it's done
function holdMusic(seconds) {
  const t = ctx.currentTime;
  holdUntil = t + seconds;
  musicFade.gain.cancelScheduledValues(t);
  musicFade.gain.setTargetAtTime(0, t, 0.05);
  musicFade.gain.setTargetAtTime(1, holdUntil - 0.05, 0.3);
  if (mus) { mus.next = holdUntil; mus.step = 0; mus.loop = 0; }
}

function tick() {
  if (!enabled || ctx.state !== 'running') return;
  try {
    const now = ctx.currentTime;
    if (mus) {
      if (mus.next < now - 0.2) mus.next = now + 0.05; // fell behind (a long stall): skip ahead rather than rattle off missed notes
      while (mus.next < now + 0.15) {
        const s16 = 60 / (mus.song.bpm + (mus.intense ? mus.song.lift ?? 0 : 0)) / 4;
        mus.song.play(mus.step, mus.next, s16, mus.loop, mus.intense);
        mus.next += s16;
        if (++mus.step >= mus.song.steps) { mus.step = 0; mus.loop++; }
      }
    }
    if (amb) ambTick(now);
  } catch (e) {
    if (!warned) { warned = true; console.error('sound', e); }
  }
}

// ---------- ambience ----------
// A steady bed of filtered hiss that slowly swells (crowd, wind, water, rumble), plus little events: birds, reversing trucks.

const AMBIENCE = {
  oval: { bed: ['bandpass', 650, 0.7, 0.1, 0.35, 0.13] }, // crowd murmur
  twisty: { bed: ['bandpass', 2600, 0.4, 0.03, 0.6, 0.09], birds: 1 }, // leaves rustling
  construction: { bed: ['lowpass', 160, 0.7, 0.14, 0.3, 0.2], beeps: 1 }, // machines rumbling
  lake: { bed: ['lowpass', 450, 0.5, 0.06, 0.7, 0.25], birds: 0.6 }, // lapping water
  roadtrip: { bed: ['lowpass', 700, 0.4, 0.06, 0.7, 0.07], birds: 0.4 }, // wind
};

let amb = null;
function ambience(trackId) {
  if (amb) {
    const t = ctx.currentTime;
    amb.gain.gain.setTargetAtTime(0, t, 0.2);
    for (const n of amb.nodes) n.stop(t + 1);
    amb = null;
  }
  if (!trackId || !ctx) return;
  const def = AMBIENCE[trackId] ?? AMBIENCE.roadtrip;
  const [type, freq, q, vol, wobble, rate] = def.bed;
  const src = ctx.createBufferSource(), filt = ctx.createBiquadFilter(), gain = ctx.createGain(), lfo = ctx.createOscillator(), depth = ctx.createGain();
  src.buffer = noiseBuf;
  src.loop = true;
  filt.type = type;
  filt.frequency.value = freq;
  filt.Q.value = q;
  gain.gain.value = 0;
  gain.gain.setTargetAtTime(vol, ctx.currentTime, 1);
  lfo.frequency.value = rate;
  depth.gain.value = vol * wobble;
  lfo.connect(depth).connect(gain.gain);
  src.connect(filt).connect(gain).connect(ambBus);
  src.start();
  lfo.start();
  const now = ctx.currentTime;
  amb = { def, gain, nodes: [src, lfo], nextBird: now + 2, nextBeep: now + 6 };
}

function ambTick(now) {
  const { def } = amb;
  if (def.birds && now > amb.nextBird) {
    // a little bird: a few quick rising chirps, somewhere off to one side
    const f = rand(2400, 3800), pan = rand(-0.8, 0.8), count = 2 + Math.floor(Math.random() * 4);
    for (let i = 0; i < count; i++) tone('sine', f, now + 0.1 + i * 0.11, 0.07, 0.035, ambBus, { glide: f * 1.35, glideTime: 0.05, pan });
    amb.nextBird = now + rand(1.5, 5) / def.birds;
  }
  if (def.beeps && now > amb.nextBeep) {
    const pan = rand(-0.9, 0.9);
    for (let i = 0; i < 3; i++) tone('square', 1100, now + 0.1 + i * 0.5, 0.25, 0.012, ambBus, { filter: 2000, pan });
    amb.nextBeep = now + rand(8, 15);
  }
}
