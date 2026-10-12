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

// Engine: two buzzy oscillators through a filter; pitch and brightness follow the speed.
export function engineStart() {
  const a = audio();
  if (!a || engine) return;
  const low = a.createOscillator(), high = a.createOscillator();
  const filter = a.createBiquadFilter(), gain = a.createGain();
  low.type = 'sawtooth';
  high.type = 'square';
  filter.type = 'lowpass';
  gain.gain.value = 0;
  low.connect(filter);
  high.connect(filter);
  filter.connect(gain).connect(master);
  low.start();
  high.start();
  engine = { low, high, filter, gain };
  engineSet(0, false);
}

// speed: 0..1 share of top speed. gas: is the driver on the throttle.
export function engineSet(speed, gas) {
  if (!engine) return;
  const t = ctx.currentTime, s = Math.max(0, Math.min(1.2, speed));
  const f = 48 + 105 * s;
  engine.low.frequency.setTargetAtTime(f, t, 0.08);
  engine.high.frequency.setTargetAtTime(f * 1.5, t, 0.08);
  engine.filter.frequency.setTargetAtTime(350 + 1500 * s + (gas ? 400 : 0), t, 0.1);
  engine.gain.gain.setTargetAtTime(gas ? 0.11 : 0.06, t, 0.1);
}

export function engineStop() {
  if (!engine) return;
  const { low, high, gain } = engine;
  engine = null;
  gain.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
  low.stop(ctx.currentTime + 0.3);
  high.stop(ctx.currentTime + 0.3);
}
