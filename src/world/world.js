// The coral reef — the first aquarium: builds its environment and runs its per-frame
// updates. (The open sea is in ocean.js; both offer the same parts to the rest of the app.)

import * as THREE from 'three';
import { WORLD } from '../config.js';
import { mulberry32 } from '../util/rng.js';
import { U } from '../core/uniforms.js';
import { createBackground } from './background.js';
import { createSand, sandHeight, setTerrain } from './sand.js';
import { createGodRays } from './godrays.js';
import { createSurface } from './surface.js';
import { createRocks } from './rocks.js';
import { createSeaweed } from './seaweed.js';
import { createCorals } from './corals.js';
import { Chest } from './chest.js';
import { Crab } from './crab.js';
import { Jellyfish } from './jellyfish.js';
import { Starfish } from './starfish.js';
import { BigBubbles } from './bigbubbles.js';
import { Plankton } from '../particles/plankton.js';
import { Bubbles } from '../particles/bubbles.js';
import { Shadows } from '../particles/shadows.js';
import { Fx } from '../particles/fx.js';
import { Food } from '../particles/food.js';
import { Treasure } from '../particles/treasure.js';
import { School } from '../fish/school.js';

const _v = new THREE.Vector3();
const _crab = new THREE.Vector3();
const _up = new THREE.Vector3(0, 0.45, 0);

export class World {
  constructor(core, rig, { scene, caustics }) {
    this.kind = 'reef';
    this.core = core;
    this.scene = scene;
    this.caustics = caustics; // shared light net
    setTerrain('reef');
    const r = mulberry32(WORLD.layoutSeed);

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

    this.shadows = new Shadows(U.uNight);
    scene.add(this.shadows.mesh);
    const obstacles = [
      ...this.rocks.spheres,
      ...this.corals.occluders.map(([x, z, r]) => ({ x, y: sandHeight(x, z) + r * 0.7, z, r: r * 0.85 })),
      { x: 2.0, y: sandHeight(2.0, 0.9) + 0.8, z: 0.9, r: 1.45 }, // chest
    ];
    this.school = new School({ scene, rig, shadows: this.shadows, pushers: this.seaweed.pushers, obstacles });

    // effects, food and treasure
    this.fx = new Fx();
    this.food = new Food();
    this.treasure = new Treasure(this.fx);
    scene.add(...this.fx.objects, this.food.mesh, ...this.treasure.objects);
    this.starfish = new Starfish();
    scene.add(this.starfish.mesh);
    // big bubbles to pop rise from the sand near the front
    this.bigBubbles = new BigBubbles(this.bubbles, [[-6.2, 1.6], [-3.4, 2.8], [0.2, 3.0], [4.4, 2.4], [7.0, 1.2], [2.0, 0.9]]);
    this.school.food = this.food;
    this.chest.onTreasure = (p) => {
      this.treasure.burst(p, 22);
      this.fx.sparkles(p, 14, 1.4, '#ffe9a0');
      this.bubbles.burst(p.x, p.y, p.z, 14, 0.4, 0.06, 0.18);
    };
    this.food.onLanded = (flake) => {
      if (Math.abs(flake.pos.z - this.crab.z) < 2.2 && flake.pos.x > -4.6 && flake.pos.x < 5) this.crab.goEat(flake);
    };
    this.crab.onEat = (flake) => {
      if (this.food.eat(flake)) this.onCrabEat?.(this.crab.worldCenter);
    };

    // things you can tap (besides fish, sand and water), as world-space spheres
    const anemoneIds = [0, 1, 2];
    const world = this;
    this.pickables = [
      { type: 'chest', center: new THREE.Vector3(2.0, sandHeight(2.0, 0.9) + 0.9, 0.9), radius: 1.5 },
      { type: 'crab', get center() { return _crab.copy(world.crab.root.position).add(_up); }, radius: 1.0 },
      ...this.jellies.jellies.map((j, i) => ({ type: 'jelly', index: i, get center() { return j.pos; }, radius: j.size * 1.15 })),
      ...anemoneIds.map((i) => ({ type: 'anemone', index: i, center: new THREE.Vector3(this.corals.anemones[i].x, this.corals.anemones[i].y, this.corals.anemones[i].z), radius: 0.85 })),
      ...this.corals.occluders.map(([x, z, r]) => ({ type: 'coral', center: new THREE.Vector3(x, sandHeight(x, z) + r * 0.6, z), radius: r * 0.8 })),
      ...this.rocks.spheres.map((s) => ({ type: 'rock', center: new THREE.Vector3(s.x, s.y, s.z), radius: s.r * 0.9 })),
    ];

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
    this.food.update(t, dt);
    this.treasure.update(dt);
    this.fx.update();
    this.school.update(t, dt, camera, U.uNight.value > 0.5);
    // a fish diving in from the surface pulls a stream of bubbles behind it
    for (const f of this.school.fish) {
      if (f.splashing && f.splashed && Math.random() < 0.8) this.bubbles.spawn(f.pos.x + (Math.random() - 0.5) * 0.6, f.pos.y + 0.5, f.pos.z, 0.05 + Math.random() * 0.12, 0.9, 0.08);
    }
    this.shadows.begin();
    this.school.castShadows();
    const c = this.crab.worldCenter;
    this.shadows.add(c.x, c.y + 0.3, c.z, 1.5, 1.1, 0, 0.45);
    this.shadows.end();
    this.jellies.update(t, dt);
    this.starfish.update(dt);
    this.bigBubbles.update(dt);
    this.bubbles.update();
    const bh = this.core.renderer.getDrawingBufferSize(_v).y;
    this.plankton.update(camera, bh, this.core.renderer.getPixelRatio());
  }
}
