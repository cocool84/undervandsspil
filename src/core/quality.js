// QualityManager: picks a start tier from a pixel budget and steps down/up based on
// the measured frame interval. iPads never go above tier 1 (heat and battery).

import { TIERS } from '../config.js';

export class Quality {
  constructor({ device, flags, onChange }) {
    this.device = device;
    this.onChange = onChange;
    this.best = device.isIPad ? 1 : 0;
    this.locked = flags.quality != null;
    this.tier = this.locked ? Math.min(Math.max(flags.quality, 0), TIERS.length - 1) : this.pickStart();
    this.startTier = this.tier;
    this.ema = 16.7;
    this.overTime = 0;
    this.underTime = 0;
    this.settle = 1.5;
    this.cooldown = 0;
    this.longFrames = 0;
    this.failedUps = 0;
    this.lastUpAt = -1e9;
    this.halfRate = false;
    this.fastFrames = 0;
    this.history = [{ at: 0, tier: this.tier, reason: 'start' }];
  }

  get config() {
    return TIERS[this.tier];
  }

  dprFor(tier) {
    return Math.min(window.devicePixelRatio || 1, TIERS[tier].dpr);
  }

  pickStart() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const budget = this.device.isMobile ? 2.25e6 : 4.2e6;
    for (let i = this.best; i < TIERS.length; i++) {
      const d = this.dprFor(i);
      if (w * d * h * d <= budget) return i;
    }
    return TIERS.length - 1;
  }

  settleFor(seconds) {
    this.settle = Math.max(this.settle, seconds);
  }

  // dtMs: interval since the last rendered frame.
  frame(dtMs, dtSec, now) {
    if (dtMs > 250) {
      // One long frame is a hitch (tab switch, shader compile). Several in a row means
      // the device is drowning: drop two tiers at once.
      this.longFrames++;
      this.cooldown -= dtMs / 1000;
      if (this.longFrames >= 3 && !this.locked && this.cooldown <= 0 && this.tier < TIERS.length - 1) {
        this.longFrames = 0;
        this.set(Math.min(this.tier + 2, TIERS.length - 1), 'down', now);
      } else {
        this.settleFor(1);
      }
      return;
    }
    this.longFrames = 0;
    // 120 Hz screens: render every other frame (battery/heat); simulation is dt-based.
    if (!this.halfRate) {
      this.fastFrames = dtMs < 11 ? this.fastFrames + 1 : 0;
      if (this.fastFrames > 90) this.halfRate = true;
    }
    if (this.settle > 0) {
      this.settle -= dtSec;
      this.overTime = 0;
      this.underTime = 0;
      this.ema = 16.7;
      return;
    }
    this.ema += (dtMs - this.ema) * 0.06;
    if (this.locked) return;
    if (this.cooldown > 0) {
      this.cooldown -= dtSec;
      return;
    }
    if (this.ema > 1000 / 55) {
      this.overTime += dtSec;
      this.underTime = 0;
    } else if (this.ema < 1000 / 58) {
      this.underTime += dtSec;
      this.overTime = 0;
    } else {
      this.overTime = 0;
      this.underTime = 0;
    }
    if (this.overTime > 1.5 && this.tier < TIERS.length - 1) {
      // A step down shortly after a step up means that upgrade failed.
      if (now - this.lastUpAt < 15000) this.failedUps++;
      this.set(this.tier + 1, 'down', now);
    } else if (this.underTime > 8 && this.tier > this.best && this.failedUps < 2) {
      this.lastUpAt = now;
      this.set(this.tier - 1, 'up', now);
    }
  }

  set(tier, reason, now = 0) {
    this.tier = tier;
    this.cooldown = 3;
    this.settle = 1;
    this.overTime = 0;
    this.underTime = 0;
    this.history.push({ at: Math.round(now), tier, reason });
    this.onChange(tier);
  }
}
