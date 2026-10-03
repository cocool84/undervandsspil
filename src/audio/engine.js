// Web Audio engine. Stage 1: context creation and the iOS unlock dance.
// Output chain: buses → master → soft low-pass → gentle limiter → speakers.

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.sfx = null;
    this.ambience = null;
    this.volume = 0.7;
    this.muted = false;
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
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : this.volume;
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
    this.master.connect(soften);
    soften.connect(limiter);
    limiter.connect(ctx.destination);
    this.sfx = ctx.createGain();
    this.sfx.gain.value = 1;
    this.sfx.connect(this.master);
    this.ambience = ctx.createGain();
    this.ambience.gain.value = 0.125; // ≈ −18 dB under the effects
    this.ambience.connect(this.master);
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

  // iOS can suspend/interrupt the context at any time; any later gesture revives it.
  installUnlockListeners() {
    const handler = () => {
      if (!this.ctx || this.ctx.state !== 'running') this.unlock();
    };
    for (const type of ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown']) {
      window.addEventListener(type, handler, { capture: true, passive: true });
    }
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx || !this.master) return;
      const now = this.ctx.currentTime;
      const target = document.hidden || this.muted ? 0 : this.volume;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setTargetAtTime(target, now, 0.15);
    });
  }
}

export const audio = new AudioEngine();
