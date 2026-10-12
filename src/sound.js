// All sounds are made on the spot with the Web Audio API, so there are no sound files to load.
// Browsers only allow sound after a tap or key press; unlock() is called from the first one.

let ctx = null;
let master = null;
let enabled = true;
let engine = null;

const VOLUME = 0.5;

function audio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = enabled ? VOLUME : 0;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

export const unlock = () => { audio(); };

export function setEnabled(on) {
  enabled = on;
  if (master) master.gain.value = on ? VOLUME : 0;
}

// One short note. when = seconds from now.
function note(freq, when, length, type = 'square', volume = 0.2) {
  const a = audio();
  if (!a) return;
  const t = a.currentTime + when;
  const osc = a.createOscillator(), gain = a.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(volume, t + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.001, t + length);
  osc.connect(gain).connect(master);
  osc.start(t);
  osc.stop(t + length + 0.05);
}

const tune = (notes, step, length, type, volume) => notes.forEach((f, i) => note(f, i * step, length, type, volume));

export const tap = () => note(660, 0, 0.06, 'triangle', 0.12);
export const countdown = () => note(440, 0, 0.18, 'square', 0.16);
export const go = () => note(880, 0, 0.5, 'square', 0.18);
export const win = () => tune([523, 659, 784, 1047, 784, 1047], 0.13, 0.3, 'square', 0.16);
export const finish = () => tune([392, 494, 587], 0.16, 0.3, 'triangle', 0.2);
export const prize = () => tune([784, 988, 1175, 1568], 0.09, 0.35, 'triangle', 0.18);

// Car-on-car bump: a burst of muffled noise plus a low thud. strength: 0 (tap) .. 1 (crash).
let noise = null;
export function hit(strength) {
  const a = audio();
  if (!a) return;
  if (!noise) {
    noise = a.createBuffer(1, a.sampleRate * 0.25, a.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const t = a.currentTime, vol = 0.15 + 0.45 * strength;
  const src = a.createBufferSource(), filter = a.createBiquadFilter(), gain = a.createGain();
  src.buffer = noise;
  filter.type = 'lowpass';
  filter.frequency.value = 500 + 1800 * strength; // harder hits sound sharper
  gain.gain.setValueAtTime(vol, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12 + 0.1 * strength);
  src.connect(filter).connect(gain).connect(master);
  src.start(t);

  const thud = a.createOscillator(), thudGain = a.createGain();
  thud.frequency.setValueAtTime(110, t);
  thud.frequency.exponentialRampToValueAtTime(45, t + 0.15);
  thudGain.gain.setValueAtTime(vol, t);
  thudGain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
  thud.connect(thudGain).connect(master);
  thud.start(t);
  thud.stop(t + 0.2);
}

// An engine: two buzzy oscillators through a filter; pitch and brightness follow the speed.
// tune shifts the pitch a little so the rivals' engines do not all sound like the player's.
function makeEngine(tune = 1) {
  const a = audio();
  if (!a) return null;
  const low = a.createOscillator(), high = a.createOscillator();
  const filter = a.createBiquadFilter(), gain = a.createGain();
  const pan = a.createStereoPanner ? a.createStereoPanner() : null;
  low.type = 'sawtooth';
  high.type = 'square';
  filter.type = 'lowpass';
  gain.gain.value = 0;
  low.connect(filter);
  high.connect(filter);
  filter.connect(gain);
  if (pan) gain.connect(pan).connect(master); else gain.connect(master);
  low.start();
  high.start();
  return { low, high, filter, gain, pan, tune };
}

// speed: 0..1.2 share of top speed. bright: extra sparkle (on the gas). volume: how loud.
function tuneEngine(e, speed, bright, volume, side = 0) {
  const t = ctx.currentTime, s = Math.max(0, Math.min(1.2, speed));
  const f = (48 + 105 * s) * e.tune;
  e.low.frequency.setTargetAtTime(f, t, 0.08);
  e.high.frequency.setTargetAtTime(f * 1.5, t, 0.08);
  e.filter.frequency.setTargetAtTime(350 + 1500 * s + bright, t, 0.1);
  e.gain.gain.setTargetAtTime(volume, t, 0.1);
  e.pan?.pan.setTargetAtTime(side, t, 0.1);
}

function stopEngine(e) {
  e.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
  e.low.stop(ctx.currentTime + 0.3);
  e.high.stop(ctx.currentTime + 0.3);
}

// The player's engine, plus one for each rival.
let rivals = [];
export function engineStart(rivalCount = 0) {
  if (engine) return;
  engine = makeEngine();
  if (!engine) return;
  rivals = Array.from({ length: rivalCount }, (_, k) => makeEngine([0.84, 1.19, 0.93][k % 3]));
  engineSet(0, false);
}

// speed: 0..1 share of top speed. gas: is the driver on the throttle.
export function engineSet(speed, gas) {
  if (engine) tuneEngine(engine, speed, gas ? 400 : 0, gas ? 0.11 : 0.06);
}

// A rival's engine as heard from the player's car: loud when close, fading to nothing by about 60 m.
// side: -1 (fully to the left) .. 1 (to the right).
export function rivalSet(k, speed, distance, side) {
  const e = engine && rivals[k];
  if (!e) return;
  const near = Math.max(0, 1 - distance / 60);
  tuneEngine(e, speed, 200, 0.13 * near * near, side);
}

export function engineStop() {
  if (!engine) return;
  for (const e of [engine, ...rivals]) stopEngine(e);
  engine = null;
  rivals = [];
}
