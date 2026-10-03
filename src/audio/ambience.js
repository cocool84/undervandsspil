// Calm underwater ambience: a soft detuned drone through slowly moving filters, a deep
// "water wash" and the odd tiny bubble. Night lowers and darkens it. Plays on its own,
// quiet bus well under the effects, so every tap stands out clearly.

import { bloop, noteFreq } from './synth.js';

// Mix inside the ambience (the bus level is set by the engine).
const MIX = { drone: 0.3, wash: 0.55, bubbles: 1 };

function brownNoise(ctx, seconds = 4) {
  const b = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
  const d = b.getChannelData(0);
  let last = 0;
  for (let i = 0; i < d.length; i++) {
    const w = Math.random() * 2 - 1;
    last = (last + 0.02 * w) / 1.02;
    d[i] = last * 3.5;
  }
  return b;
}

export class Ambience {
  constructor(ctx, bus) {
    this.ctx = ctx;
    this.bus = bus;
    this.started = false;
    this.night = 0;
  }

  // `parts` (tests) picks which layers to play: { drone, wash, bubbles }.
  start({ live = true, parts = MIX } = {}) {
    if (this.started) return;
    this.started = true;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    this.out = ctx.createGain();
    this.out.gain.setValueAtTime(0.0001, t);
    this.out.gain.exponentialRampToValueAtTime(1, t + 3);
    this.out.connect(this.bus);
    const layer = (name) => {
      const g = ctx.createGain();
      g.gain.value = (parts[name] ? 1 : 0) * MIX[name];
      g.connect(this.out);
      return g;
    };

    // drone: C2, G2, C3 (night: a tone lower), gently detuned
    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 420;
    this.filter.Q.value = 0.6;
    this.filter.connect(layer('drone'));
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.06;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 140;
    lfo.connect(lfoGain).connect(this.filter.frequency);
    lfo.start();
    this.drone = [
      [noteFreq(-10), 'sine', 0.5, -4],
      [noteFreq(-7), 'sine', 0.32, 3],
      [noteFreq(-5), 'triangle', 0.18, -2],
    ].map(([f, type, g, detune]) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f;
      o.detune.value = detune;
      const gain = ctx.createGain();
      gain.gain.value = g;
      o.connect(gain).connect(this.filter);
      o.start();
      return { o, base: f };
    });

    // water wash
    const wash = ctx.createBufferSource();
    wash.buffer = brownNoise(ctx);
    wash.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 520;
    bp.Q.value = 0.6;
    const wg = ctx.createGain();
    wg.gain.value = 0.55;
    const swell = ctx.createOscillator();
    swell.frequency.value = 0.09;
    const sg = ctx.createGain();
    sg.gain.value = 0.3;
    swell.connect(sg).connect(wg.gain);
    wash.connect(bp).connect(wg).connect(layer('wash'));
    wash.start();
    swell.start();

    // tiny ambient bubbles, scheduled a little ahead
    this.bubbleOut = layer('bubbles');
    this.bubbleT = t + 1;
    if (!live) return;
    this.timer = setInterval(() => {
      const now = this.ctx.currentTime;
      this.bubbleT = Math.max(this.bubbleT, now + 0.05); // never pile up after a long pause
      this.scheduleBubbles(now + 1.2);
    }, 450);
  }

  // Random little groups of bubbles up to time `until` (the tests also render this offline).
  scheduleBubbles(until, rnd = Math.random) {
    while (this.bubbleT < until) {
      if (rnd() < 0.28) {
        const n = 1 + Math.floor(rnd() * 3);
        for (let i = 0; i < n; i++) {
          bloop(this.ctx, this.bubbleOut, this.bubbleT + i * 0.08, { note: 10 + Math.floor(rnd() * 4), gain: 0.08, short: true });
        }
      }
      this.bubbleT += 0.9;
    }
  }

  setNight(on) {
    if (!this.started) return;
    const t = this.ctx.currentTime;
    const k = on ? Math.pow(2, -2 / 12) : 1;
    for (const d of this.drone) d.o.frequency.setTargetAtTime(d.base * k, t, 1.2);
    this.filter.frequency.setTargetAtTime(on ? 300 : 420, t, 1.2);
  }
}
