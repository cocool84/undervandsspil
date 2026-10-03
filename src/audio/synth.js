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

// One soft "bubble marimba" note — the fish's singing voice: a sine that blips up into pitch
// like a water drop, with a tiny woody overtone at the strike.
function mallet(ctx, dest, t, freq, gain, decay = 0.3) {
  const o = osc(ctx, 'sine', freq * 0.9, t, decay + 0.05);
  o.frequency.exponentialRampToValueAtTime(freq, t + 0.025);
  const g = ctx.createGain();
  env(g, t, gain, 0.006, decay);
  o.connect(g).connect(dest);
  const o2 = osc(ctx, 'sine', freq * 4, t, 0.07);
  const g2 = ctx.createGain();
  env(g2, t, gain * 0.12, 0.002, 0.05);
  o2.connect(g2).connect(dest);
}

// A slide-whistle glide with a vibrato that blooms at the end ("wheee!"); optionally back down.
function glide(ctx, dest, t, f0, f1, dur, gain, f2 = 0) {
  const o = osc(ctx, 'sine', f0, t, dur + 0.1);
  o.frequency.exponentialRampToValueAtTime(f1, t + (f2 ? dur * 0.55 : dur));
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
  const vib = osc(ctx, 'sine', 6.5, t, dur + 0.1);
  const vg = ctx.createGain();
  vg.gain.setValueAtTime(0, t);
  vg.gain.linearRampToValueAtTime(f1 * 0.02, t + dur);
  vib.connect(vg).connect(o.frequency);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.05);
  g.gain.setValueAtTime(gain, t + dur * 0.75);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.08);
  o.connect(g).connect(dest);
}

// A tapped fish sings a tiny tune that matches its trick. `base` is the fish's own voice
// (bigger fish sing lower); `short` is a single note for rapid repeat taps.
export function fishTune(ctx, dest, t, { trick = 'flip', base = 6, gain = 0.11, short = false } = {}) {
  const out = soft(ctx, dest, 2400);
  const f = (step) => noteFreq(base + step);
  const alt = Math.random() < 0.5 ? 0 : 1; // two flavours of every tune
  if (short) {
    mallet(ctx, out, t, f([0, 2, 3, 5][Math.floor(Math.random() * 4)]), gain * 0.8, 0.25);
    return 0.35;
  }
  switch (trick) {
    case 'roll': // a giggly trill: "di-da-di-da-dum"
      [3, 2, 3, 2].forEach((s, i) => mallet(ctx, out, t + i * 0.065, f(s + alt), gain * (1 - i * 0.08), 0.18));
      mallet(ctx, out, t + 0.3, f(0), gain * 0.9, 0.35);
      return 0.7;
    case 'spin': // a swirl: "wheee-ooo"
      mallet(ctx, out, t, f(1), gain * 0.9);
      glide(ctx, out, t + 0.05, f(1), f(4), 0.38, gain * 0.55, f(1));
      mallet(ctx, out, t + 0.45, f(alt ? 3 : 2), gain * 0.7, 0.3);
      return 0.85;
    case 'jump': // "boing — up! — ting"
      mallet(ctx, out, t, f(-2), gain);
      glide(ctx, out, t + 0.04, f(-2), f(5), 0.16, gain * 0.6);
      mallet(ctx, out, t + 0.36, f(5), gain * 0.65, 0.45);
      return 0.85;
    default: // flip: "ba-da-wheee… ting"
      mallet(ctx, out, t, f(0), gain);
      mallet(ctx, out, t + 0.08, f(2), gain);
      glide(ctx, out, t + 0.16, f(2), f(alt ? 5 : 4), 0.24, gain * 0.55);
      mallet(ctx, out, t + 0.44, f(alt ? 5 : 4), gain * 0.7, 0.4);
      return 0.9;
  }
}

// The puffer fish blowing itself up: a soft rising "bwoomp" with a little breath.
export function puffup(ctx, dest, t, { gain = 0.09 } = {}) {
  const o = osc(ctx, 'triangle', 250, t, 0.42);
  o.frequency.exponentialRampToValueAtTime(520, t + 0.3);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(700, t);
  lp.frequency.exponentialRampToValueAtTime(1500, t + 0.3);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.22);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
  o.connect(lp).connect(g).connect(dest);
  const s = noise(ctx, t, 0.36);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = 1.2;
  bp.frequency.setValueAtTime(800, t);
  bp.frequency.exponentialRampToValueAtTime(1500, t + 0.3);
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0.0001, t);
  ng.gain.exponentialRampToValueAtTime(gain * 0.35, t + 0.2);
  ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.34);
  s.connect(bp).connect(ng).connect(soft(ctx, dest, 1800));
  return 0.45;
}

// "Nom nom": two little mouth-closing syllables (a soft triangle through a closing filter).
export function nom(ctx, dest, t, { gain = 0.2 } = {}) {
  for (const [dt, a, b] of [[0, 520, 300], [0.14, 470, 270]]) {
    const o = osc(ctx, 'triangle', a, t + dt, 0.14);
    o.frequency.exponentialRampToValueAtTime(b, t + dt + 0.1);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 1.5;
    lp.frequency.setValueAtTime(1800, t + dt);
    lp.frequency.exponentialRampToValueAtTime(350, t + dt + 0.11);
    const g = ctx.createGain();
    env(g, t + dt, gain, 0.008, 0.11);
    o.connect(lp).connect(g).connect(dest);
  }
  return 0.32;
}

// Soft splash: filtered noise sweeping down, then a few bubbles.
export function splash(ctx, dest, t, { gain = 0.2, bubbles = 3 } = {}) {
  const s = noise(ctx, t, 0.6);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = 1.1;
  bp.frequency.setValueAtTime(1400, t);
  bp.frequency.exponentialRampToValueAtTime(380, t + 0.45);
  const g = ctx.createGain();
  env(g, t, gain, 0.02, 0.5);
  s.connect(bp).connect(g).connect(soft(ctx, soft(ctx, dest, 2000), 2000)); // two stages: 24 dB/oct
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
export function boing(ctx, dest, t, { gain = 0.15, base = 294 } = {}) {
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
export function pop(ctx, dest, t, { gain = 0.22, pitch = 1 } = {}) {
  const o = osc(ctx, 'sine', 520 * pitch, t, 0.1);
  o.frequency.exponentialRampToValueAtTime(1150 * pitch, t + 0.035);
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

// Soft sand "puff" and seaweed "swish": a breath of noise sinking in pitch.
export function puff(ctx, dest, t, { gain = 0.2, freq = 1100, dur = 0.35 } = {}) {
  const s = noise(ctx, t, dur + 0.05);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = 0.8;
  bp.frequency.setValueAtTime(freq, t);
  bp.frequency.exponentialRampToValueAtTime(freq * 0.45, t + dur);
  const g = ctx.createGain();
  env(g, t, gain, 0.02, dur);
  s.connect(bp).connect(g).connect(soft(ctx, dest, 2200));
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

// ---------------------------------------------------------------- the fish factory

// A factory button: a soft bubble "plop" with a little note on it.
export function plop(ctx, dest, t, { note = 8, gain = 0.15 } = {}) {
  const f = noteFreq(note);
  const o = osc(ctx, 'sine', f * 1.9, t, 0.12);
  o.frequency.exponentialRampToValueAtTime(f * 0.95, t + 0.045);
  const g = ctx.createGain();
  env(g, t, gain, 0.003, 0.09);
  o.connect(g).connect(dest);
  mallet(ctx, dest, t + 0.03, f, gain * 0.55, 0.22);
  return 0.32;
}

// A new body shape: "fwee-oo — ding!"
export function morph(ctx, dest, t, { note = 6, gain = 0.11 } = {}) {
  const out = soft(ctx, dest, 2400);
  const f = noteFreq(note);
  glide(ctx, out, t, f * 0.7, f * 1.5, 0.18, gain * 0.7, f * 1.2);
  const s = noise(ctx, t, 0.16);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = 1.4;
  bp.frequency.setValueAtTime(700, t);
  bp.frequency.exponentialRampToValueAtTime(1500, t + 0.14);
  const ng = ctx.createGain();
  env(ng, t, gain * 0.35, 0.02, 0.13);
  s.connect(bp).connect(ng).connect(out);
  mallet(ctx, out, t + 0.22, noteFreq(note + 3), gain * 0.9, 0.35);
  return 0.65;
}

// Finger painting: now and then a soft, glassy note while the brush moves — together a slow
// little tune (no noise: the old swish was tiring to listen to).
export function paintNote(ctx, dest, t, { note = 7, gain = 0.06 } = {}) {
  const out = soft(ctx, dest, 1800);
  const f = noteFreq(note);
  const o = osc(ctx, 'sine', f, t, 0.8);
  const g = ctx.createGain();
  env(g, t, gain, 0.02, 0.65);
  o.connect(g).connect(out);
  const o2 = osc(ctx, 'sine', f * 2, t, 0.35);
  const g2 = ctx.createGain();
  env(g2, t, gain * 0.12, 0.012, 0.25);
  o2.connect(g2).connect(out);
  return 0.85;
}

// Colour poured over the whole fish: glug-glug-bloop and a little splosh.
export function pour(ctx, dest, t, { note = 8, gain = 0.15 } = {}) {
  [0, 0.075, 0.15].forEach((dt, i) => bloop(ctx, dest, t + dt, { note: note + 2 - i * 2, gain: gain * (1 - i * 0.12), short: true }));
  const s = noise(ctx, t + 0.1, 0.35);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = 1;
  bp.frequency.setValueAtTime(900, t + 0.1);
  bp.frequency.exponentialRampToValueAtTime(380, t + 0.42);
  const g = ctx.createGain();
  env(g, t + 0.1, gain * 0.45, 0.02, 0.3);
  s.connect(bp).connect(g).connect(soft(ctx, dest, 1600));
  return 0.55;
}

// New eyes: blink-blink, "bi-ding".
export function blink(ctx, dest, t, { note = 10, gain = 0.09 } = {}) {
  pling(ctx, dest, t, { note, gain: gain * 0.8, decay: 0.3 });
  pling(ctx, dest, t + 0.09, { note: note + 2, gain, decay: 0.6 });
  return 0.75;
}

// A soft harp run up the scale (rainbows, magic).
export function harp(ctx, dest, t, { from = 5, count = 10, step = 0.036, gain = 0.07 } = {}) {
  const out = soft(ctx, dest, 2600);
  for (let i = 0; i < count; i++) mallet(ctx, out, t + i * step, noteFreq(from + i), gain * (1 - i * 0.04), 0.55);
  return count * step + 0.6;
}

// The magic wand: a harp run that blooms into a shimmering chord.
export function magic(ctx, dest, t, { gain = 0.07 } = {}) {
  harp(ctx, dest, t, { from: 5, count: 11, step: 0.04, gain });
  const out = soft(ctx, dest, 2400);
  const t2 = t + 0.38;
  for (const [n, det] of [[10, -7], [12, 6], [13, -4], [15, 5]]) {
    const o = osc(ctx, 'sine', noteFreq(n), t2, 1.7);
    o.detune.value = det;
    const vib = osc(ctx, 'sine', 5.2, t2, 1.7);
    const vg = ctx.createGain();
    vg.gain.value = 3;
    vib.connect(vg).connect(o.detune);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t2);
    g.gain.exponentialRampToValueAtTime(gain * 0.45, t2 + 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, t2 + 1.6);
    o.connect(g).connect(out);
  }
  return 2.1;
}

// ---------------------------------------------------------------- arrivals and goodbyes

// A new fish has arrived: a soft "ta-ta-DAA!" with a warm chord and a twinkle on top.
export function fanfare(ctx, dest, t, { gain = 0.08 } = {}) {
  const out = soft(ctx, dest, 2600);
  mallet(ctx, out, t, noteFreq(3), gain, 0.22);
  mallet(ctx, out, t + 0.12, noteFreq(3), gain * 0.8, 0.2);
  [5, 7, 8].forEach((n, i) => mallet(ctx, out, t + 0.26 + i * 0.014, noteFreq(n), gain * 0.85, 0.9));
  for (const n of [5, 7, 8]) {
    const o = osc(ctx, 'sine', noteFreq(n), t + 0.26, 1.6);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t + 0.26);
    g.gain.exponentialRampToValueAtTime(gain * 0.3, t + 0.33);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.75);
    o.connect(g).connect(out);
  }
  sparkle(ctx, dest, t + 0.36, { from: 10, count: 5, gain: 0.035, step: 0.05 });
  return 1.9;
}

// A music-box tine for the night-time lullabies: a ringing fundamental with quickly fading
// metallic partials.
export function musicBox(ctx, dest, t, { note = 9, gain = 0.1 } = {}) {
  const out = soft(ctx, dest, 3000);
  const f = noteFreq(note);
  for (const [ratio, level, decay] of [[1, 1, 1.6], [2, 0.16, 0.5], [3.98, 0.07, 0.24], [5.4, 0.035, 0.12]]) {
    const o = osc(ctx, 'sine', f * ratio, t, decay + 0.05);
    const g = ctx.createGain();
    env(g, t, gain * level, 0.004, decay);
    o.connect(g).connect(out);
  }
  return 1.7;
}

// ---------------------------------------------------------------- the theme

// The start of the game: a short, cosy waltz on the bubble marimba with a music-box twinkle
// an octave up and soft chords underneath (C | G | Am | C), ending in a little rush of
// bubbles as the camera dives into the aquarium.
const semi = (s) => 261.63 * Math.pow(2, s / 12); // semitones from C4 (chords need B and F)
export function theme(ctx, dest, t, { gain = 0.1 } = {}) {
  const out = soft(ctx, dest, 2600);
  const b = 0.36; // one beat
  const melody = [
    [0, 3, 1], [1, 5, 1], [2, 7, 1],
    [3, 6, 1.5], [4.5, 7, 0.5], [5, 8, 1],
    [6, 9, 1], [7, 8, 1], [8, 7, 1],
    [9, 6, 0.5], [9.5, 7, 0.5], [10, 5, 2.5],
  ];
  for (const [beat, step, len] of melody) {
    const tt = t + beat * b;
    mallet(ctx, out, tt, noteFreq(step), gain, Math.max(0.3, len * b * 1.1));
    musicBox(ctx, out, tt, { note: step + 5, gain: gain * 0.28 });
  }
  const pad = soft(ctx, dest, 1000);
  [[0, [0, 4, 7]], [3, [-5, -1, 2]], [6, [-3, 0, 4]], [9, [0, 4, 7]]].forEach(([beat, chord], i) => {
    const t0 = t + beat * b;
    const t1 = t0 + (i === 3 ? 4.5 : 3) * b;
    for (const s of chord) {
      const o = osc(ctx, 'triangle', semi(s), t0, t1 - t0 + 0.6);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(gain * 0.22, t0 + 0.12);
      g.gain.setValueAtTime(gain * 0.22, t1 - 0.1);
      g.gain.exponentialRampToValueAtTime(0.0001, t1 + 0.5);
      o.connect(g).connect(pad);
    }
  });
  harp(ctx, dest, t + 10.7 * b, { from: 8, count: 7, step: 0.05, gain: gain * 0.4 });
  for (let i = 0; i < 4; i++) bloop(ctx, dest, t + (11.5 + i * 0.4) * b, { note: 9 + i, gain: gain * 0.5, short: true });
  return 13 * b + 1.3;
}

// A fish swimming out of the aquarium: "bye-bye~" (it waves while it sings).
export function goodbye(ctx, dest, t, { base = 6, gain = 0.09 } = {}) {
  const out = soft(ctx, dest, 2400);
  const f = (s) => noteFreq(base + s);
  mallet(ctx, out, t, f(2), gain, 0.3);
  mallet(ctx, out, t + 0.22, f(0), gain, 0.3);
  glide(ctx, out, t + 0.44, f(1), f(-1), 0.4, gain * 0.5);
  return 1.0;
}

export const RECIPES = { bloop, pling, sparkle, fishTune, puffup, nom, splash, whoosh, chime, clickclack, boing, pop, puff, treasure, tock, plop, morph, paintNote, pour, blink, harp, magic, fanfare, goodbye, musicBox, theme };
