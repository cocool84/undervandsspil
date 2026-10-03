// Builds the aquarium environment and runs its per-frame updates.

import * as THREE from 'three';
import { WORLD } from '../config.js';
import { mulberry32 } from '../util/rng.js';
import { U } from '../core/uniforms.js';
import { createBackground } from './background.js';
import { Caustics } from './caustics.js';
import { createSand, sandHeight } from './sand.js';
import { createGodRays } from './godrays.js';
import { createSurface } from './surface.js';
import { createRocks } from './rocks.js';
import { createSeaweed } from './seaweed.js';
import { createCorals } from './corals.js';
import { Chest } from './chest.js';
import { Crab } from './crab.js';
import { Jellyfish } from './jellyfish.js';
import { Plankton } from '../particles/plankton.js';
import { Bubbles } from '../particles/bubbles.js';

const _v = new THREE.Vector3();

export class World {
  constructor(core) {
    this.core = core;
    const scene = core.scene;
    const r = mulberry32(WORLD.layoutSeed);

    this.caustics = new Caustics(256);
    U.uCaustics.value = this.caustics.texture;

    this.background = createBackground();
    this.sand = createSand();
    this.surface = createSurface(WORLD.surfaceY);
    this.rays = createGodRays(WORLD.surfaceY);
    this.rocks = createRocks(r);
    this.seaweed = createSeaweed(r);
    this.corals = createCorals(r);
    this.chest = new Chest(2.0, 0.9, -0.38);
    this.crab = new Crab(3.4);
    this.jellies = new Jellyfish();
    this.plankton = new Plankton(900);
    this.bubbles = new Bubbles();

    scene.add(this.background.mesh, this.sand.mesh, this.surface.mesh, this.rocks.mesh, this.corals.mesh);
    scene.add(...this.seaweed.meshes);
    scene.add(this.chest.group, this.crab.mesh);
    scene.add(this.rays.mesh, ...this.jellies.objects, this.plankton.points, ...this.bubbles.objects);

    this.sand.setOccluders([
      ...this.rocks.occluders,
      ...this.corals.occluders,
      [2.0, 0.9, 1.7], // chest
    ]);

    this.chest.onBubbles = (p) => this.bubbles.spawn(p.x, p.y, p.z, 0.05 + Math.random() * 0.1, 1.1 + Math.random() * 0.6, 0.05);

    // bubble vents at the foot of the rocks
    this.vents = [
      { x: -7.0, z: -1.9, timer: 0, rate: 0.35 },
      { x: 6.1, z: -5.0, timer: 0, rate: 0.5 },
      { x: -1.6, z: -9.0, timer: 0, rate: 0.6 },
      { x: 9.2, z: 1.8, timer: 0, rate: 0.8 },
    ].map((v) => ({ ...v, y: sandHeight(v.x, v.z) + 0.1 }));
  }

  applyTier(tier) {
    this.rays.setCount(tier.rays);
    this.plankton.setFraction(tier.plankton);
    this.caustics.setSize(tier.caustics);
  }

  update(t, dt, camera) {
    this.caustics.render(this.core.renderer, t);
    this.background.update(camera);

    for (const v of this.vents) {
      v.timer -= dt;
      if (v.timer <= 0) {
        v.timer = v.rate * (0.4 + Math.random() * 1.2);
        if (Math.random() < 0.12) this.bubbles.burst(v.x, v.y, v.z, 6, 0.12, 0.05, 0.14);
        else this.bubbles.spawn(v.x + (Math.random() - 0.5) * 0.15, v.y, v.z, 0.05 + Math.random() * 0.09, 1.2 + Math.random() * 0.5, 0.05);
      }
    }
    // the odd lonely bubble rising from the sand
    if (Math.random() < dt * 1.2) {
      const x = (Math.random() - 0.5) * 18;
      const z = -6 + Math.random() * 10;
      this.bubbles.spawn(x, sandHeight(x, z) + 0.05, z, 0.04 + Math.random() * 0.06, 1.0 + Math.random() * 0.5, 0.06);
    }

    this.chest.update(t, dt);
    this.crab.update(t, dt, camera);
    this.jellies.update(t, dt);
    this.bubbles.update();
    const bh = this.core.renderer.getDrawingBufferSize(_v).y;
    this.plankton.update(camera, bh);
  }
}
