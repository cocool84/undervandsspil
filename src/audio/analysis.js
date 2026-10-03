// Offline sound analysis for the tests: renders every recipe and the ambience through the real
// output chain and measures peak, treble and a rough loudness as heard on a tablet speaker
// (A-weighting plus the speaker's bass roll-off). Loaded on demand, never during play.

import { RECIPES } from './synth.js';
import { buildChain, AMBIENCE_LEVEL } from './engine.js';
import { Ambience } from './ambience.js';

const RATE = 44100;
const N = 4096; // ≈ 93 ms frames: "momentary" loudness
const HOP = 1024;

const OAC = () => window.OfflineAudioContext || window.webkitOfflineAudioContext;

export async function renderOffline(seconds, build, output) {
  const Ctx = OAC();
  const ctx = new Ctx(1, Math.floor(RATE * seconds), RATE);
  build(ctx, output ? output(ctx) : ctx.destination);
  const buf = await ctx.startRendering();
  return buf.getChannelData(0);
}

function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    const h = len / 2;
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < h; k++) {
        const a = i + k;
        const c = a + h;
        const vr = re[c] * cr - im[c] * ci;
        const vi = re[c] * ci + im[c] * cr;
        re[c] = re[a] - vr;
        im[c] = im[a] - vi;
        re[a] += vr;
        im[a] += vi;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
}

let weights = null;
function speakerWeights() {
  if (weights) return weights;
  weights = new Float32Array(N / 2);
  for (let k = 0; k < N / 2; k++) {
    const f2 = Math.max((k * RATE) / N, 1) ** 2;
    const ra = (12194 ** 2 * f2 * f2) / ((f2 + 20.6 ** 2) * Math.sqrt((f2 + 107.7 ** 2) * (f2 + 737.9 ** 2)) * (f2 + 12194 ** 2));
    const a = ra * 1.2589; // A-weighting (+2 dB at 1 kHz → 0 dB)
    const speaker = (f2 * f2) / (f2 * f2 + 220 ** 4); // small speaker: 12 dB/oct below ~220 Hz
    weights[k] = a * a * speaker;
  }
  return weights;
}

const toDb = (power) => Math.round(10 * Math.log10(power + 1e-12) * 10) / 10;

// Loudness in dB on a tablet speaker: average and loudest ~93 ms frame, plus the sample peak.
export function speakerLoudness(data) {
  const W = speakerWeights();
  const win = new Float32Array(N);
  let wMean = 0;
  for (let i = 0; i < N; i++) {
    win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N);
    wMean += win[i] * win[i];
  }
  wMean /= N;
  const re = new Float32Array(N);
  const im = new Float32Array(N);
  let sum = 0;
  let max = 0;
  let count = 0;
  for (let s = 0; s + N <= data.length; s += HOP) {
    for (let i = 0; i < N; i++) {
      re[i] = data[s + i] * win[i];
      im[i] = 0;
    }
    fft(re, im);
    let p = 0;
    for (let k = 1; k < N / 2; k++) p += (re[k] * re[k] + im[k] * im[k]) * W[k];
    p = (2 * p) / (N * N) / wMean;
    sum += p;
    max = Math.max(max, p);
    count++;
  }
  let peak = 0;
  for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i]));
  return { avg: toDb(sum / Math.max(count, 1)), max: toDb(max), peakDb: toDb(peak * peak) };
}

function highpass5k(ctx) {
  // what is left above 5 kHz after the whole output chain (36 dB/oct)
  let next = ctx.destination;
  for (let k = 0; k < 3; k++) {
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 5000;
    hp.connect(next);
    next = hp;
  }
  return next;
}

function rms(d) {
  let s = 0;
  for (let i = 0; i < d.length; i++) s += d[i] * d[i];
  return Math.sqrt(s / d.length);
}

// Every recipe with its default options: peak (dBFS), treble ratio and speaker loudness.
export async function analyzeRecipes(volume = 0.7, recipes = RECIPES) {
  const results = {};
  for (const name of Object.keys(recipes)) {
    const play = (ctx, out) => recipes[name](ctx, buildChain(ctx, volume, out), 0.05, {});
    const full = await renderOffline(2.4, play);
    const high = await renderOffline(2.4, play, highpass5k);
    const loud = speakerLoudness(full);
    results[name] = {
      peakDb: loud.peakDb,
      trebleRatio: Math.round((rms(high) / (rms(full) + 1e-9)) * 1000) / 1000,
      loudness: loud.max,
    };
  }
  return results;
}

// The ambience alone (after its fade-in), rendered with deterministic bubbles.
export async function analyzeAmbience(volume = 0.7, { seconds = 16, parts, level = AMBIENCE_LEVEL, night = false } = {}) {
  const data = await renderOffline(seconds, (ctx, out) => {
    const bus = ctx.createGain();
    bus.gain.value = level;
    bus.connect(buildChain(ctx, volume, out));
    const amb = new Ambience(ctx, bus);
    amb.start({ live: false, parts });
    if (night) amb.setNight(true);
    let seed = 12345;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    amb.scheduleBubbles(seconds, rnd);
    amb.scheduleMusic(seconds, rnd);
  });
  const settled = data.subarray(Math.floor(RATE * 3.5));
  const loud = speakerLoudness(settled);
  let peak = 0;
  for (let i = 0; i < settled.length; i++) peak = Math.max(peak, Math.abs(settled[i]));
  return { loudness: loud.avg, loudest: loud.max, peakDb: toDb(peak * peak) };
}
