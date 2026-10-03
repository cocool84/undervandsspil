// Every sound in the aquarium, synthesised with Web Audio. Each recipe is a pure function
// (ctx, destination, startTime, options) → duration, so the same code plays live and renders
// in an OfflineAudioContext for the automatic "is it soft?" test. All pitches come from one
// pentatonic scale, so anything the children tap together sounds nice.

const SCALE = [0, 2, 4, 7, 9]; // C major pentatonic
export const C4 = 261.63;

export function noteFreq(step, base = C4) {
  const oct = Math.floor(step / 5);
  const deg = ((step % 5) + 5) % 5;
  return base * Math.pow(2, oct + SCALE[deg] / 12);
}

const noiseCache = new WeakMap();
function noiseBuffer(ctx) {
  let b = noiseCache.get(ctx);
  if (!b) {
    b = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    noiseCache.set(ctx, b);
  }
  return b;
}

// Exponential attack/decay envelope on a gain node.
function env(g, t, peak, attack, decay) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
}

function osc(ctx, type, freq, t, dur) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  o.start(t);
  o.stop(t + dur);
  return o;
}

// A gentle low-pass in front of the destination: keeps bells round and noise soft.
function soft(ctx, dest, freq = 3000) {
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = freq;
  lp.Q.value = 0.4;
  lp.connect(dest);
  return lp;
}

function noise(ctx, t, dur) {
  const s = ctx.createBufferSource();
  s.buffer = noiseBuffer(ctx);
  s.loop = true;
  s.start(t, Math.random() * 0.5);
  s.stop(t + dur);
  return s;
}

// ---------------------------------------------------------------- recipes

// A round underwater "bloop" (water taps, bubbles).
export function bloop(ctx, dest, t, { note = 7, gain = 0.2, short = false } = {}) {
  const f = noteFreq(note);
  const len = short ? 0.18 : 0.32;
  const o = osc(ctx, 'sine', f * 0.62, t, len + 0.05);
  o.frequency.exponentialRampToValueAtTime(f * 1.22, t + 0.08);
  o.frequency.exponentialRampToValueAtTime(f * 1.1, t + len);
  const g = ctx.createGain();
  env(g, t, gain, 0.012, len);
  o.connect(g).connect(dest);
  const o2 = osc(ctx, 'sine', f * 2, t + 0.02, 0.25);
  const g2 = ctx.createGain();
  env(g2, t + 0.02, gain * 0.15, 0.01, 0.18);
  o2.connect(g2).connect(dest);
  return len + 0.05;
}

// Soft bell (FM with a harmonic ratio, so it stays round).
export function pling(ctx, dest, t, { note = 10, gain = 0.11, decay = 1.1, ratio = 2 } = {}) {
  const f = noteFreq(note);
  const car = osc(ctx, 'sine', f, t, decay + 0.05);
  const mod = osc(ctx, 'sine', f * ratio, t, decay + 0.05);
  const mg = ctx.createGain();
  mg.gain.setValueAtTime(f * 0.7, t);
  mg.gain.exponentialRampToValueAtTime(f * 0.02, t + 0.35);
  mod.connect(mg).connect(car.frequency);
  const g = ctx.createGain();
  env(g, t, gain, 0.006, decay);
  car.connect(g).connect(soft(ctx, dest, 2600));
  return decay + 0.05;
}

// Little glassy sparkle run (stars, treasure, magic).
export function sparkle(ctx, dest, t, { from = 9, count = 7, gain = 0.05, step = 0.045 } = {}) {
  for (let i = 0; i < count; i++) pling(ctx, dest, t + i * step, { note: from + i, gain: gain * (1 - i * 0.06), decay: 0.5, ratio: 2 });
  return count * step + 0.55;
}

// A fish giggling: "hi-hi-hi-hi" through soft vowel formants, with vibrato.
export function giggle(ctx, dest, t, { pitch = 560, gain = 0.15, syllables = 0 } = {}) {
  const n = syllables || 4 + Math.floor(Math.random() * 2);
  const out = ctx.createGain();
  out.gain.value = gain;
  out.connect(dest);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 3200;
  lp.connect(out);
  const f1 = ctx.createBiquadFilter();
  f1.type = 'bandpass';
  f1.frequency.value = 700;
  f1.Q.value = 2.5;
  const f2 = ctx.createBiquadFilter();
  f2.type = 'bandpass';
  f2.frequency.value = 2300;
  f2.Q.value = 5;
  const dry = ctx.createGain();
  dry.gain.value = 0.45;
  const f2g = ctx.createGain();
  f2g.gain.value = 0.6;
  f1.connect(lp);
  f2.connect(f2g).connect(lp);
  dry.connect(lp);
  let tt = t;
  for (let i = 0; i < n; i++) {
    const p = pitch * (1.24 - i * 0.05) * (1 + (Math.random() - 0.5) * 0.05);
    const o = osc(ctx, 'triangle', p * 1.06, tt, 0.12);
    o.frequency.exponentialRampToValueAtTime(p * 0.9, tt + 0.08);
    const vib = osc(ctx, 'sine', 15, tt, 0.12);
    const vg = ctx.createGain();
    vg.gain.value = p * 0.03;
    vib.connect(vg).connect(o.frequency);
    const g = ctx.createGain();
    env(g, tt, 1, 0.014, 0.08);
    o.connect(g);
    g.connect(f1);
    g.connect(f2);
    g.connect(dry);
    tt += 0.1 + Math.random() * 0.025;
  }
  return tt - t + 0.12;
}

// "Nom nom".
export function nom(ctx, dest, t, { gain = 0.17 } = {}) {
  for (const [dt, a, b] of [[0, 360, 200], [0.13, 330, 180]]) {
    const o = osc(ctx, 'sine', a, t + dt, 0.13);
    o.frequency.exponentialRampToValueAtTime(b, t + dt + 0.08);
    const g = ctx.createGain();
    env(g, t + dt, gain, 0.008, 0.1);
    o.connect(g).connect(dest);
  }
  return 0.3;
}

// Soft splash: filtered noise sweeping down, then a few bubbles.
export function splash(ctx, dest, t, { gain = 0.16, bubbles = 3 } = {}) {
  const s = noise(ctx, t, 0.6);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = 1.1;
  bp.frequency.setValueAtTime(1000, t);
  bp.frequency.exponentialRampToValueAtTime(320, t + 0.45);
  const g = ctx.createGain();
  env(g, t, gain, 0.02, 0.5);
  s.connect(bp).connect(g).connect(soft(ctx, soft(ctx, dest, 1600), 1600)); // two stages: 24 dB/oct
  for (let i = 0; i < bubbles; i++) bloop(ctx, dest, t + 0.12 + i * 0.09, { note: 7 + Math.floor(Math.random() * 5), gain: 0.06, short: true });
  return 0.7;
}

// Whoosh for day/night: noise through a sweeping band.
export function whoosh(ctx, dest, t, { up = true, gain = 0.1, dur = 0.9 } = {}) {
  const s = noise(ctx, t, dur + 0.05);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = 1.6;
  bp.frequency.setValueAtTime(up ? 260 : 1300, t);
  bp.frequency.exponentialRampToValueAtTime(up ? 1300 : 240, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + dur * 0.45);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(bp).connect(g).connect(soft(ctx, dest, 1600));
  return dur + 0.05;
}

// Gentle chime arpeggio (day: up, night: down).
export function chime(ctx, dest, t, { up = true, gain = 0.09 } = {}) {
  const notes = up ? [5, 7, 9, 12] : [12, 9, 7, 4];
  notes.forEach((n, i) => pling(ctx, dest, t + i * 0.11, { note: n, gain, decay: 1.2 }));
  return 1.6;
}

// Crab claws: two little wood-block clicks.
export function clickclack(ctx, dest, t, { gain = 0.14, count = 3 } = {}) {
  for (let i = 0; i < count; i++) {
    const f = i % 2 ? 760 : 1050;
    const o = osc(ctx, 'sine', f, t + i * 0.09, 0.06);
    const g = ctx.createGain();
    env(g, t + i * 0.09, gain, 0.002, 0.045);
    o.connect(g).connect(dest);
  }
  return count * 0.09 + 0.06;
}

// Jelly "boing": a wobbling pitch dip.
export function boing(ctx, dest, t, { gain = 0.14, base = 196 } = {}) {
  const o = osc(ctx, 'sine', base * 1.4, t, 0.7);
  o.frequency.exponentialRampToValueAtTime(base * 0.8, t + 0.12);
  o.frequency.exponentialRampToValueAtTime(base * 1.6, t + 0.55);
  const lfo = osc(ctx, 'sine', 9, t, 0.7);
  const lg = ctx.createGain();
  lg.gain.setValueAtTime(base * 0.12, t);
  lg.gain.exponentialRampToValueAtTime(1, t + 0.6);
  lfo.connect(lg).connect(o.frequency);
  const g = ctx.createGain();
  env(g, t, gain, 0.01, 0.6);
  o.connect(g).connect(dest);
  return 0.7;
}

// Bubble pop (start bubble).
export function pop(ctx, dest, t, { gain = 0.16 } = {}) {
  const o = osc(ctx, 'sine', 520, t, 0.1);
  o.frequency.exponentialRampToValueAtTime(1150, t + 0.035);
  const g = ctx.createGain();
  env(g, t, gain, 0.003, 0.07);
  o.connect(g).connect(dest);
  const s = noise(ctx, t, 0.06);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 1800;
  bp.Q.value = 1.2;
  const ng = ctx.createGain();
  env(ng, t, gain * 0.5, 0.002, 0.04);
  s.connect(bp).connect(ng).connect(dest);
  return 0.12;
}

// Soft sand "puff" and seaweed "swish".
export function puff(ctx, dest, t, { gain = 0.12, freq = 700, dur = 0.35 } = {}) {
  const s = noise(ctx, t, dur + 0.05);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(freq, t);
  lp.frequency.exponentialRampToValueAtTime(freq * 0.4, t + dur);
  const g = ctx.createGain();
  env(g, t, gain, 0.03, dur);
  s.connect(lp).connect(g).connect(dest);
  return dur + 0.05;
}

// Treasure: a warm soft chord under a sparkle cascade.
export function treasure(ctx, dest, t, { gain = 0.05 } = {}) {
  for (const n of [0, 2, 3]) {
    const o = osc(ctx, 'sine', noteFreq(n + 5), t, 1.6);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.5);
    o.connect(g).connect(dest);
  }
  sparkle(ctx, dest, t + 0.05, { from: 6, count: 9, gain: 0.055, step: 0.06 });
  return 1.7;
}

// UI button tap: a short soft "tock" with a pling.
export function tock(ctx, dest, t, { note = 9, gain = 0.12 } = {}) {
  const o = osc(ctx, 'sine', 480, t, 0.08);
  o.frequency.exponentialRampToValueAtTime(320, t + 0.06);
  const g = ctx.createGain();
  env(g, t, gain, 0.003, 0.06);
  o.connect(g).connect(dest);
  pling(ctx, dest, t + 0.02, { note, gain: gain * 0.6, decay: 0.5 });
  return 0.55;
}

export const RECIPES = { bloop, pling, sparkle, giggle, nom, splash, whoosh, chime, clickclack, boing, pop, puff, treasure, tock };
