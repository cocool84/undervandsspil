// The open sea — the second aquarium. Deep, clear blue water over a pale sandy shelf that
// falls away into the deep, a sunken ship with treasure in the hold, a golden kelp forest,
// grey rocks and a swirling school of silver fish. Here live the big animals: a dolphin, a
// shark, an orca and a whale (one of each to begin with).
// It offers the same things to tap and the same parts as the reef (see World), so the
// touch handling, the buttons and the fish factory work in both.

import * as THREE from 'three';
import { WORLD, flags } from '../config.js';
import { mulberry32 } from '../util/rng.js';
import { U } from '../core/uniforms.js';
import { createBackground } from './background.js';
import { createSand, sandHeight, setTerrain } from './sand.js';
import { createGodRays } from './godrays.js';
import { createSurface } from './surface.js';
import { createRocks } from './rocks.js';
import { createSeaweed } from './seaweed.js';
import { createSeabed } from './corals.js';
import { Ship } from './ship.js';
import { Starfish } from './starfish.js';
import { BigBubbles } from './bigbubbles.js';
import { Plankton } from '../particles/plankton.js';
import { Bubbles } from '../particles/bubbles.js';
import { Shadows } from '../particles/shadows.js';
import { Fx } from '../particles/fx.js';
import { Food } from '../particles/food.js';
import { Treasure } from '../particles/treasure.js';
import { Sardines } from '../particles/sardines.js';
import { School } from '../fish/school.js';

const _v = new THREE.Vector3();

// kelp forest: x, z, count, radius, minH, maxH, palette
const KELP = [
  [-12.4, -5.0, 6, 1.5, 7, 12, 0],
  [-13.5, -10.5, 7, 2.0, 9, 14, 1],
  [-9.6, -14.0, 5, 1.6, 8, 12, 2],
  [12.0, -3.8, 6, 1.5, 7, 12, 1],
  [13.0, -10.0, 7, 2.0, 9, 14, 0],
  [8.4, -12.0, 5, 1.4, 7, 11, 2],
  [-1.5, -15.5, 4, 1.6, 7, 11, 0],
  [6.0, -16.5, 4, 1.6, 8, 12, 1],
  // foreground fronds framing the view (soft, out of focus)
  [-7.2, 10.2, 2, 0.5, 5, 7, 1],
  [7.4, 10.8, 2, 0.5, 5, 7, 0],
];
const KELP_COLORS = [
  ['#7a5a1c', '#e2bb52'], // golden giant kelp
  ['#4d6a24', '#bcd65e'], // olive
  ['#8a4f1e', '#f0a95a'], // amber
];
// sea grass: x, z, count, radius
const GRASS = [[-3.6, 1.6, 12, 1.6], [2.6, 3.0, 10, 1.4], [6.4, 0.6, 10, 1.4], [-8.4, 3.2, 10, 1.6], [0.0, -2.8, 8, 1.4], [-6.0, -5.2, 8, 1.4]];

// rocks: x, z, sx, sy, sz, detail
const ROCKS = [
  [-10.6, -2.0, 2.6, 2.0, 2.3, 4],
  [10.4, -6.4, 3.0, 2.5, 2.6, 4],
  [6.4, -1.0, 1.2, 0.9, 1.1, 3],
  [-7.4, 0.4, 0.9, 0.7, 0.8, 3],
  [2.0, -10.4, 1.6, 1.2, 1.4, 3],
  [4.2, 2.0, 0.6, 0.45, 0.55, 3],
  [-15, -16, 5.5, 5.0, 4.5, 3],
  [16, -18, 6.0, 5.5, 5.0, 3],
  [-20, -24, 7.0, 8.0, 6.0, 3],
  [22, -26, 8.0, 9.0, 7.0, 3],
];
const ROCK_COLORS = ['#8d98a8', '#a69c8c', '#4c5566', '#7b9a4c', '#a9b862'];

const SHIP = { x: -4.6, z: -9.8, turn: -0.35 };

export class Ocean {
  constructor(core, rig, { scene, caustics }) {
    this.kind = 'ocean';
    this.core = core;
    this.scene = scene;
    this.caustics = caustics; // shared light net
    setTerrain('ocean');
    const r = mulberry32(WORLD.layoutSeed + 7);

    this.background = createBackground();
    this.sand = createSand({ light: '#f4f0e2', dark: '#d2c8ae' });
    this.surface = createSurface(WORLD.surfaceY);
    this.rays = createGodRays(WORLD.surfaceY);
    this.rocks = createRocks(r, { big: ROCKS, arch: [12.5, -13.5, -0.5], pebbles: { count: 60, x: [-11, 11], z: [-2, 9], clear: [] }, colors: ROCK_COLORS });
    this.seaweed = createSeaweed(r, { kelp: KELP, grass: GRASS, palettes: KELP_COLORS, clear: [[SHIP.x, SHIP.z, 4.2, 2.4]] });
    this.seabed = createSeabed(r);
    this.ship = new Ship(SHIP.x, SHIP.z, SHIP.turn, { anchor: [-0.8, -6.4, 0.8], barrels: [[-8.8, -6.0, 0.4], [-7.8, -6.8, 1.6]] });
    this.sardines = new Sardines(new THREE.Vector3(3.6, 6.8, -8.6), new THREE.Vector3(3.4, 1.4, 1.0));
    this.plankton = new Plankton(900);
    this.bubbles = new Bubbles();

    scene.add(this.background.mesh, this.sand.mesh, this.surface.mesh, this.rocks.mesh, this.seabed.mesh);
    scene.add(...this.seaweed.meshes, ...this.ship.objects, this.sardines.mesh);
    scene.add(this.rays.mesh, this.plankton.points, ...this.bubbles.objects);

    const hull = this.ship.spheres();
    this.sand.setOccluders([...this.rocks.occluders, ...this.seabed.occluders, ...hull.slice(0, 3).map((s) => [s.at.x, s.at.z, s.r * 1.2])]);

    this.shadows = new Shadows(U.uNight);
    scene.add(this.shadows.mesh);
    const obstacles = [
      ...this.rocks.spheres,
      ...this.seabed.occluders.map(([x, z, rr]) => ({ x, y: sandHeight(x, z) + rr * 0.6, z, r: rr * 0.8 })),
      ...hull.map((s) => ({ x: s.at.x, y: s.at.y, z: s.at.z, r: s.r })),
    ];
    const asked = new URLSearchParams(location.search).get('fishgrid') || '';
    const grid = flags.fishgrid ? (asked.startsWith('animals') ? asked : 'animals') : null;
    this.school = new School({ scene, rig, shadows: this.shadows, pushers: this.seaweed.pushers, obstacles, zMin: -7, zMax: 3.5, grid });

    this.fx = new Fx();
    this.food = new Food();
    this.treasure = new Treasure(this.fx);
    scene.add(...this.fx.objects, this.food.mesh, ...this.treasure.objects);
    this.starfish = new Starfish();
    scene.add(this.starfish.mesh);
    this.bigBubbles = new BigBubbles(this.bubbles, [[-6.0, 2.2], [-2.8, 3.2], [1.4, 3.0], [4.8, 2.4], [7.6, 1.2], [-0.4, 0.6]]);
    this.school.food = this.food;
    this.ship.onBubble = (p) => this.bubbles.spawn(p.x, p.y, p.z, 0.05 + Math.random() * 0.1, 1.1 + Math.random() * 0.5, 0.05);

    // things you can tap (besides the animals, sand and water), as world-space spheres
    const world = this;
    this.pickables = [
      ...hull.map((s) => ({ type: 'ship', center: s.at, radius: s.r })),
      { type: 'sardines', get center() { return world.sardines.center; }, radius: 2.6 },
      ...this.seabed.occluders.map(([x, z, rr]) => ({ type: 'coral', center: new THREE.Vector3(x, sandHeight(x, z) + rr * 0.6, z), radius: rr * 0.8 })),
      ...this.rocks.spheres.map((s) => ({ type: 'rock', center: new THREE.Vector3(s.x, s.y, s.z), radius: s.r * 0.9 })),
    ];

    // bubble vents at the foot of the rocks
    this.vents = [
      { x: -10.0, z: -0.4, timer: 0, rate: 0.45 },
      { x: 9.0, z: -4.6, timer: 0, rate: 0.6 },
      { x: 2.8, z: -9.0, timer: 0, rate: 0.7 },
    ].map((v) => ({ ...v, y: sandHeight(v.x, v.z) + 0.1 }));
    this.spouts = []; // the whale's bubble fountains
    this.chaseT = 12;
  }

  applyTier(tier) {
    this.rays.setCount(tier.rays);
    this.plankton.setFraction(tier.plankton);
    this.caustics.setSize(tier.caustics);
  }

  // The whale blows a fountain of bubbles out of its blowhole.
  spout(fish) {
    fish.blowhole(_v);
    this.bubbles.burst(_v.x, _v.y + 0.2, _v.z, 16, 0.25, 0.08, 0.22);
    this.fx.sparkles(_v.clone().setY(_v.y + 0.8), 6, 0.9, '#e8fbff');
    this.spouts.push({ fish, t: 0 });
  }

  // Tapped the ship: it rocks, and now and then treasure tumbles out of the hold.
  pokeShip(t) {
    const treasure = this.ship.poke(t);
    const p = this.ship.hole(new THREE.Vector3());
    this.bubbles.burst(p.x, p.y, p.z, 14, 0.4, 0.06, 0.18);
    for (let i = 0; i < 3; i++) {
      this.ship.porthole(i, _v);
      this.bubbles.burst(_v.x, _v.y, _v.z, 3, 0.15, 0.04, 0.1);
    }
    if (treasure) {
      this.treasure.burst(p, 18);
      this.fx.sparkles(p, 12, 1.3, '#ffe9a0');
    }
    return treasure;
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
    if (Math.random() < dt * 1.0) {
      const x = (Math.random() - 0.5) * 18;
      const z = -5 + Math.random() * 9;
      this.bubbles.spawn(x, sandHeight(x, z) + 0.05, z, 0.04 + Math.random() * 0.06, 1.0 + Math.random() * 0.5, 0.06);
    }

    this.ship.update(t, dt);
    this.sardines.update(t);
    // big animals swimming through the little fish scatter them…
    if (t - this.sardines.lastScare > 0.7) {
      for (const f of this.school.fish) {
        if (f.pos.distanceTo(this.sardines.center) < 2.6 + f.radius * 0.6) {
          this.sardines.scare(f.pos);
          break;
        }
      }
    }
    // …and now and then the dolphin or the orca dashes through them on purpose
    this.chaseT -= dt;
    if (this.chaseT <= 0) {
      this.chaseT = 16 + Math.random() * 14;
      const chasers = this.school.fish.filter((f) => f.state === 'wander' && (f.dna.shape === 4 || f.dna.shape === 6));
      if (chasers.length) {
        const f = chasers[Math.floor(Math.random() * chasers.length)];
        f.curious(_v.copy(this.sardines.center).setZ(Math.max(this.sardines.center.z, this.school.zMin + 1.2)));
        f.spurt = 1;
      }
    }
    this.food.update(t, dt);
    this.treasure.update(dt);
    this.fx.update();
    this.school.update(t, dt, camera, U.uNight.value > 0.5);
    for (const f of this.school.fish) {
      if (f.splashing && f.splashed && Math.random() < 0.8) this.bubbles.spawn(f.pos.x + (Math.random() - 0.5) * 0.8, f.pos.y + 0.6, f.pos.z, 0.05 + Math.random() * 0.12, 0.9, 0.08);
    }
    // the whale's fountains keep bubbling for a moment as it swims on
    for (const s of this.spouts) {
      s.t += dt;
      s.fish.blowhole(_v);
      if (Math.random() < 0.75) this.bubbles.spawn(_v.x + (Math.random() - 0.5) * 0.25, _v.y + 0.1, _v.z + (Math.random() - 0.5) * 0.25, 0.06 + Math.random() * 0.12, 2.2 + Math.random() * 1.2, 0.1);
    }
    this.spouts = this.spouts.filter((s) => s.t < 1.3 && this.school.fish.includes(s.fish));
    this.shadows.begin();
    this.school.castShadows();
    this.shadows.end();
    this.starfish.update(dt);
    this.bigBubbles.update(dt);
    this.bubbles.update();
    const bh = this.core.renderer.getDrawingBufferSize(_v).y;
    this.plankton.update(camera, bh, this.core.renderer.getPixelRatio());
  }
}
