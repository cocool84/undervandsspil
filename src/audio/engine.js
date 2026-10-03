// Web Audio engine: iOS unlock dance, the soft output chain, voice limiting, ambience,
// mute/volume — and an offline "softness" analysis used by the tests.
// Output chain: sfx + ambience buses → master (volume) → low-pass 7 kHz → gentle limiter.

import { RECIPES } from './synth.js';
import { Ambience } from './ambience.js';

const MAX_VOICES = 16;
export const AMBIENCE_LEVEL = 0.125; // ambience bus gain, well under the effects
// minimum seconds between two sounds of the same kind (many little fingers…)
const MIN_GAP = { bloop: 0.05, fishTune: 0.07, puffup: 0.3, nom: 0.08, pop: 0.05, puff: 0.08, clickclack: 0.12, boing: 0.12, tock: 0.04, sparkle: 0.1, pling: 0.03, splash: 0.2, whoosh: 0.3, chime: 0.3, treasure: 0.4 };

export function buildChain(ctx, volume, output = ctx.destination) {
  const master = ctx.createGain();
  master.gain.value = volume;
  const soften = ctx.createBiquadFilter();
  soften.type = 'lowpass';
  soften.frequency.value = 7000;
  soften.Q.value = 0.5;
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -18;
  limiter.knee.value = 12;
  limiter.ratio.value = 6;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.25;
  master.connect(soften);
  soften.connect(limiter);
  limiter.connect(output);
  return master;
}

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.sfx = null;
    this.ambienceBus = null;
    this.ambience = null;
    this.volume = 0.7;
    this.muted = false;
    this.voices = 0;
    this.last = {};
    this.played = {}; // how often each sound really played (for the tests)
    this.night = false;
    try {
      // Play even when the device is switched to silent; the in-app button mutes.
      if (navigator.audioSession) navigator.audioSession.type = 'playback';
    } catch {
      /* not supported */
    }
  }

  get state() {
    return this.ctx ? this.ctx.state : 'none';
  }

  ensureContext() {
    if (this.ctx) return this.ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    const ctx = new AC({ latencyHint: 'interactive' });
    this.ctx = ctx;
    this.master = buildChain(ctx, this.muted ? 0 : this.volume);
    this.sfx = ctx.createGain();
    this.sfx.connect(this.master);
    this.ambienceBus = ctx.createGain();
    this.ambienceBus.gain.value = AMBIENCE_LEVEL;
    this.ambienceBus.connect(this.master);
    this.ambience = new Ambience(ctx, this.ambienceBus);
    return ctx;
  }

  // Must run inside a user gesture on iOS.
  unlock() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    if (ctx.state !== 'running') ctx.resume().catch(() => {});
    if (!this._primed) {
      this._primed = true;
      const buffer = ctx.createBuffer(1, 1, 22050);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(ctx.destination);
      src.start(0);
    }
  }

  startAmbience() {
    if (!this.ambience) return;
    this.ambience.start();
    this.ambience.setNight(this.night);
  }

  setNight(on) {
    this.night = on;
    this.ambience?.setNight(on);
  }

  setMuted(m) {
    this.muted = m;
    this.applyGain();
  }

  setVolume(v) {
    this.volume = v;
    this.applyGain();
  }

  applyGain() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const target = document.hidden || this.muted ? 0 : this.volume;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setTargetAtTime(target, t, 0.12);
  }

  // Play a sound by name; quietly does nothing when locked, muted, too busy or too soon.
  play(name, opts = {}, delay = 0) {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running' || this.muted) return;
    const recipe = RECIPES[name];
    if (!recipe) return;
    const now = ctx.currentTime;
    if (now - (this.last[name] ?? -1) < (MIN_GAP[name] ?? 0.03) && delay === 0) return;
    if (this.voices >= MAX_VOICES) return;
    this.last[name] = now;
    const dur = recipe(ctx, this.sfx, now + 0.005 + delay, opts);
    this.played[name] = (this.played[name] ?? 0) + 1;
    this.voices++;
    setTimeout(() => {
      this.voices--;
    }, (dur + delay) * 1000 + 50);
  }

  // iOS can suspend/interrupt the context at any time; any later gesture revives it.
  installUnlockListeners() {
    const handler = () => {
      if (!this.ctx || this.ctx.state !== 'running') this.unlock();
    };
    for (const type of ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown']) {
      window.addEventListener(type, handler, { capture: true, passive: true });
    }
    document.addEventListener('visibilitychange', () => this.applyGain());
  }

  // Offline analysis for the tests: every recipe (peak, treble, loudness) and the ambience.
  async analyze() {
    const { analyzeRecipes, analyzeAmbience } = await import('./analysis.js');
    return { recipes: await analyzeRecipes(this.volume), ambience: await analyzeAmbience(this.volume) };
  }
}

export const audio = new AudioEngine();
