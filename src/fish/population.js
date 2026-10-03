// Who lives in the aquarium: the children's own fish (saved) plus starter fish that fill it
// up, at most 25 fish in all. With 0–17 own fish all 8 starters are there. When a new fish
// needs room, a starter swims out first, then the oldest wand fish, then the oldest
// designed fish (and that one is gone for good).

import { STARTERS } from './dna.js';
import { MAX_FISH } from './school.js';
import { saveFish } from '../storage.js';

export class Population {
  constructor(school) {
    this.school = school;
    this.own = [];
    this.ephemeral = false; // test fish (?fill): never saved
  }

  save() {
    this.saving = this.ephemeral ? Promise.resolve(true) : saveFish(this.own);
    return this.saving;
  }

  get starterCount() {
    return Math.max(0, Math.min(STARTERS.length, MAX_FISH - this.own.length));
  }

  // At start-up: everybody is already swimming about.
  init(list) {
    this.own = list.slice(-MAX_FISH);
    STARTERS.slice(0, this.starterCount).forEach((dna, i) => this.placeStarter(this.school.add(dna), i));
    for (const dna of this.own) this.school.add(dna);
  }

  // Spread the starters over the aquarium: depth, left/right and near/far.
  placeStarter(f, i) {
    const depths = [0.12, 0.88, 0.5, 0.3, 0.7, 0.2, 0.6, 0.8];
    const homes = [0.1, 0.9, 0.35, 0.65, 0.2, 0.8, 0.5, 0.45];
    f.persona.depth = depths[i % depths.length];
    f.persona.home = homes[i % homes.length];
    f.persona.homeZ = -4.5 + ((i * 3) % 8) * 1.0;
  }

  // A brand-new fish from the factory dives in (after `delay` s). Saved straight away.
  release(dna, delay = 0) {
    this.own.push(dna);
    while (this.own.length > MAX_FISH) {
      const victim = this.oldest('wand') ?? this.oldest('design') ?? this.own[0];
      this.own.splice(this.own.indexOf(victim), 1);
      this.sendAway((f) => f.dna.id === victim.id);
    }
    this.syncStarters();
    this.save();
    return this.school.add(dna, { spawn: 'splash', delay });
  }

  // Parents' corner: all own fish swim away kindly and the starters come back.
  clearOwn() {
    const ids = new Set(this.own.map((d) => d.id));
    this.own = [];
    this.sendAway((f) => ids.has(f.dna.id));
    this.syncStarters();
    this.save();
  }

  // Fish from a saved copy come (back) home: the ones we do not have yet swim in. Returns
  // how many were new.
  adopt(list) {
    const have = new Set(this.own.map((d) => d.id));
    const fresh = list.filter((d) => !have.has(d.id));
    if (!fresh.length) return 0;
    this.own.push(...fresh);
    this.own.sort((a, b) => a.born - b.born);
    const out = new Set();
    while (this.own.length > MAX_FISH) {
      const victim = this.oldest('wand') ?? this.oldest('design') ?? this.own[0];
      this.own.splice(this.own.indexOf(victim), 1);
      out.add(victim.id);
    }
    this.sendAway((f) => out.has(f.dna.id));
    this.syncStarters();
    for (const d of fresh) if (!out.has(d.id)) this.school.add(d, { spawn: 'side' });
    this.save();
    return fresh.length;
  }

  oldest(kind) {
    let best = null;
    for (const d of this.own) if (d.kind === kind && (!best || d.born < best.born)) best = d;
    return best;
  }

  sendAway(match) {
    for (const f of this.school.fish) if (match(f) && f.state !== 'leave') this.school.sendAway(f);
  }

  // Exactly the right number of starters: extra ones swim out, missing ones swim in.
  syncStarters() {
    const want = this.starterCount;
    const present = this.school.fish.filter((f) => f.dna.kind === 'starter' && f.state !== 'leave');
    for (let i = present.length - 1; i >= want; i--) {
      // the starter that came last leaves first
      const f = present.reduce((a, b) => (STARTERS.indexOf(b.dna) > STARTERS.indexOf(a.dna) ? b : a));
      present.splice(present.indexOf(f), 1);
      this.school.sendAway(f);
    }
    if (present.length < want) {
      const here = new Set(present.map((f) => f.dna.id));
      STARTERS.forEach((dna, i) => {
        if (i >= want || here.has(dna.id)) return;
        // one that is still on its way out simply turns round
        const leaving = this.school.fish.find((f) => f.dna.id === dna.id && f.state === 'leave');
        if (leaving) leaving.setState('wander');
        else this.placeStarter(this.school.add(dna, { spawn: 'side' }), i);
      });
    }
  }
}
