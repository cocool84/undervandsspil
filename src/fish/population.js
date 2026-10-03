// Who lives in an aquarium: the children's own fish (saved) plus starters that fill it up.
// The reef: 8 starter fish, at most 25 fish in all (with 0–17 own fish all 8 starters are
// there). The open sea: the 4 big animals, at most 8. When a new fish needs room, a starter
// swims out first, then the oldest wand fish, then the oldest designed fish (and that one is
// gone for good).

import { STARTERS, SEA_STARTERS } from './dna.js';
import { MAX_FISH } from './school.js';
import { saveFish } from '../storage.js';

// Where each starter likes to swim: height (0 low … 1 high), left/right (0 … 1) and depth.
export const REEF = {
  starters: STARTERS,
  max: MAX_FISH,
  field: 'fish',
  places: STARTERS.map((_, i) => ({ depth: [0.12, 0.88, 0.5, 0.3, 0.7, 0.2, 0.6, 0.8][i], home: [0.1, 0.9, 0.35, 0.65, 0.2, 0.8, 0.5, 0.45][i], homeZ: -4.5 + ((i * 3) % 8) * 1.0 })),
};
// The big animals need more room: the whale keeps to the back, the dolphin to the front.
export const SEA = {
  starters: SEA_STARTERS,
  max: 8,
  field: 'sea',
  places: [
    { depth: 0.72, home: 0.25, homeZ: 0.6 }, // dolphin
    { depth: 0.5, home: 0.78, homeZ: -2.6 }, // shark
    { depth: 0.3, home: 0.35, homeZ: -0.8 }, // orca
    { depth: 0.48, home: 0.6, homeZ: -4.6 }, // whale
  ],
};

export class Population {
  // `own`: the saved fish. The world (its School) comes later: see attach().
  constructor({ starters, max, field, places }, own = []) {
    this.starters = starters;
    this.max = max;
    this.field = field; // where the own fish are saved
    this.places = places;
    this.own = own.slice(-max);
    this.school = null;
    this.ephemeral = false; // test fish (?fill): never saved
  }

  save() {
    this.saving = this.ephemeral ? Promise.resolve(true) : saveFish(this.own, this.field);
    return this.saving;
  }

  get starterCount() {
    return Math.max(0, Math.min(this.starters.length, this.max - this.own.length));
  }

  // The world is built: everybody is already swimming about.
  attach(school) {
    this.school = school;
    this.starters.slice(0, this.starterCount).forEach((dna, i) => this.placeStarter(school.add(dna), i));
    for (const dna of this.own) school.add(dna);
  }

  placeStarter(f, i) {
    Object.assign(f.persona, this.places[i % this.places.length]);
  }

  // Too many? The oldest wand fish makes room, then the oldest designed one. Returns their ids.
  makeRoom() {
    const out = new Set();
    while (this.own.length > this.max) {
      const victim = this.oldest('wand') ?? this.oldest('design') ?? this.own[0];
      this.own.splice(this.own.indexOf(victim), 1);
      out.add(victim.id);
    }
    return out;
  }

  // A brand-new fish from the factory dives in (after `delay` s). Saved straight away.
  release(dna, delay = 0) {
    this.own.push(dna);
    const out = this.makeRoom();
    this.sendAway((f) => out.has(f.dna.id));
    this.syncStarters();
    this.save();
    return this.school?.add(dna, { spawn: 'splash', delay });
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
    const out = this.makeRoom();
    this.sendAway((f) => out.has(f.dna.id));
    this.syncStarters();
    for (const d of fresh) if (!out.has(d.id)) this.school?.add(d, { spawn: 'side' });
    this.save();
    return fresh.length;
  }

  oldest(kind) {
    let best = null;
    for (const d of this.own) if (d.kind === kind && (!best || d.born < best.born)) best = d;
    return best;
  }

  sendAway(match) {
    if (!this.school) return;
    for (const f of this.school.fish) if (match(f) && f.state !== 'leave') this.school.sendAway(f);
  }

  // Exactly the right number of starters: extra ones swim out, missing ones swim in.
  syncStarters() {
    if (!this.school) return;
    const want = this.starterCount;
    const present = this.school.fish.filter((f) => f.dna.kind === 'starter' && f.state !== 'leave');
    for (let i = present.length - 1; i >= want; i--) {
      // the starter that came last leaves first
      const f = present.reduce((a, b) => (this.starters.indexOf(b.dna) > this.starters.indexOf(a.dna) ? b : a));
      present.splice(present.indexOf(f), 1);
      this.school.sendAway(f);
    }
    if (present.length < want) {
      const here = new Set(present.map((f) => f.dna.id));
      this.starters.forEach((dna, i) => {
        if (i >= want || here.has(dna.id)) return;
        // one that is still on its way out simply turns round
        const leaving = this.school.fish.find((f) => f.dna.id === dna.id && f.state === 'leave');
        if (leaving) leaving.setState('wander');
        else this.placeStarter(this.school.add(dna, { spawn: 'side' }), i);
      });
    }
  }
}
