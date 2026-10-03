// The School: the population of fish and their flocking (boids) — separation, gentle
// alignment and cohesion by personality, wandering, favourite depth, soft walls taken from
// the camera frustum, obstacle avoidance — plus shadows and parting the seaweed.

import * as THREE from 'three';
import { Fish, wrapAngle } from './fish.js';
import { makeDNA } from './dna.js';
import { sandHeight } from '../world/sand.js';
import { WORLD, flags } from '../config.js';
import { clamp } from '../util/math.js';

export const MAX_FISH = 25;
export const MIN_FISH = 8;
const Z_MIN = -6;
const Z_MAX = 4;

const _ndc = new THREE.Vector3();
const _tmp = new THREE.Vector3();
const _nose = new THREE.Vector3();
const _right = new THREE.Vector3();
const _b = { xMin: 0, xMax: 0, yMin: 0, yMax: 0 };

export class School {
  constructor({ scene, rig, shadows, pushers, obstacles }) {
    this.scene = scene;
    this.rig = rig;
    this.shadows = shadows;
    this.pushers = pushers;
    this.obstacles = obstacles; // [{x, y, z, r}]
    this.fish = [];
    this.night = false;
    this.food = null; // set by World: flakes to chase
    this.onEat = null; // (fish, full) => void
    this.onSplash = null; // (fish) => void — a released fish breaks into view
    this.onArrive = null; // (fish) => void — …and has arrived
    this.onGone = null; // (fish) => void — a fish has swum out of the aquarium
    this.foodScan = 0;
    this.grid = flags.fishgrid ? (new URLSearchParams(location.search).get('fishgrid') || 'patterns') : null;
    if (this.grid) this.buildGrid(this.grid);
  }

  // Interpolated visible bounds at depth z (from the camera's resting pose).
  boundsAt(z, out = _b) {
    const [near, far] = this.rig.bounds;
    const k = clamp((z - far.z) / (near.z - far.z), 0, 1);
    out.xMin = far.xMin + (near.xMin - far.xMin) * k;
    out.xMax = far.xMax + (near.xMax - far.xMax) * k;
    out.yMin = far.yMin + (near.yMin - far.yMin) * k;
    out.yMax = Math.min(far.yMax + (near.yMax - far.yMax) * k, WORLD.surfaceY - 1.6);
    return out;
  }

  randomSpot(out) {
    const z = Z_MIN + 1 + Math.random() * (Z_MAX - Z_MIN - 2);
    const b = this.boundsAt(z);
    const floor = Math.max(b.yMin, 1.5);
    out.set(b.xMin + 2 + Math.random() * (b.xMax - b.xMin - 4), floor + 1 + Math.random() * Math.max(b.yMax - floor - 2, 0.5), z);
    return out;
  }

  // spawn: 'random' (somewhere inside), 'side' (swims in from the left or right edge),
  // 'splash' (dives in from the surface: a fish fresh from the factory) or 'none'.
  add(dna, { spawn = 'random', delay = 0 } = {}) {
    const f = new Fish(dna);
    if (spawn === 'random') {
      this.randomSpot(f.pos);
      const dir = Math.random() < 0.5 ? 1 : -1;
      f.vel.set(dir * f.cruise, 0, 0);
      f.yaw = dir > 0 ? 0 : Math.PI;
    } else if (spawn === 'side') {
      const side = Math.random() < 0.5 ? 1 : -1;
      this.randomSpot(f.target);
      const b = this.boundsAt(f.target.z);
      f.pos.set(side > 0 ? b.xMax + 2.6 : b.xMin - 2.6, f.target.y, f.target.z);
      f.vel.set(-side * f.cruise, 0, 0);
      f.yaw = side > 0 ? Math.PI : 0;
      f.setState('enter', { entry: 'side' });
    } else if (spawn === 'splash') {
      const z = 1.6;
      const b = this.boundsAt(z);
      // just above the top of the picture — or through the surface, where it can be seen
      const top = this.rig.screenToPlaneZ(0, 1, z, _tmp).y;
      f.pos.set(b.xMin + 3 + Math.random() * Math.max(b.xMax - b.xMin - 6, 0.1), top > WORLD.surfaceY ? WORLD.surfaceY + 0.8 : top + 1.4, z);
      f.vel.set(0, 0, 0);
      f.enterDelay = delay;
      f.yaw = Math.random() < 0.5 ? -0.5 : Math.PI + 0.5;
      f.pitch = -1.2;
      f.splashing = true;
      f.splashTop = Math.min(top, WORLD.surfaceY);
      f.setState('enter', { entry: 'splash' });
    }
    this.fish.push(f);
    this.scene.add(f.mesh);
    return f;
  }

  remove(f) {
    const i = this.fish.indexOf(f);
    if (i >= 0) this.fish.splice(i, 1);
    this.scene.remove(f.mesh);
    f.dispose();
  }

  // ---------------------------------------------------------------- QA grid (?fishgrid)

  buildGrid(mode) {
    const colors = ['#ff8a3d', '#3fa9ff', '#ffd23f', '#ff5d8f'];
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 4; col++) {
        const dna = makeDNA({
          kind: 'starter',
          shape: row,
          color: colors[(row + col) % 4],
          pattern: mode === 'eyes' ? (row % 2) * 2 : col,
          eyes: mode === 'eyes' ? col : (row + col) % 4,
          seed: 1000 + row * 10 + col,
        });
        const f = this.add(dna, { spawn: 'none' });
        f.gridSpot = new THREE.Vector3((col - 1.5) * 3.1, 8.6 - row * 2.05, 8);
        f.pos.copy(f.gridSpot);
        f.vel.set(0.001, 0, 0);
        f.yaw = -0.5;
      }
    }
  }

  // ---------------------------------------------------------------- steering

  steer(f, t, dt, camera) {
    const all = this.fish;
    const p = f.pos;
    const v = f.vel;
    const P = f.persona;
    const acc = f.acc.set(0, 0, 0);

    if (f.state === 'leave') {
      // wave goodbye first, then off to the side — no walls, no obstacles
      if (f.stateT > 0.9) {
        acc.x += (f.leaveDir * f.cruise * 2.2 - v.x) * 1.6;
        acc.y += (0.25 - v.y) * 0.6;
        acc.z += -v.z * 0.8;
      }
      return;
    }
    if (f.state === 'enter' && f.entry === 'splash') {
      // wait above the water until the bubble curtain has cleared, then dive in
      if (f.stateT < f.enterDelay) {
        v.set(0, 0, 0);
        return;
      }
      if (!f.dived) {
        f.dived = true;
        v.set((Math.random() - 0.5) * 1.5, -11, 0);
      }
      // water brakes the dive; a little float back up at the end
      acc.y += -v.y * 2.4 + 0.6;
      acc.x += -v.x * 1.2;
      acc.z += -v.z * 1.2;
      return;
    }

    let sx = 0, sy = 0, sz = 0;
    let ax = 0, ay = 0, az = 0, na = 0;
    let cx = 0, cy = 0, cz = 0, nc = 0;
    let closest = Infinity;
    for (const o of all) {
      if (o === f || o.state === 'leave') continue;
      const dx = o.pos.x - p.x;
      const dy = o.pos.y - p.y;
      const dz = o.pos.z - p.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      const sepR = (f.radius + o.radius) * 1.0 + 0.6;
      if (d2 < sepR * sepR) {
        const d = Math.sqrt(d2) + 1e-4;
        const k = (sepR - d) / sepR;
        sx -= (dx / d) * k;
        sy -= (dy / d) * k;
        sz -= (dz / d) * k;
        closest = Math.min(closest, d / sepR);
      }
      if (d2 < 16) {
        ax += o.vel.x;
        ay += o.vel.y;
        az += o.vel.z;
        na++;
      }
      if (d2 < 30) {
        cx += o.pos.x;
        cy += o.pos.y;
        cz += o.pos.z;
        nc++;
      }
    }
    acc.x += sx * 3.4;
    acc.y += sy * 3.4;
    acc.z += sz * 3.4;
    // only a hint of schooling: every fish should stay easy to see and to tap
    if (na) {
      acc.x += (ax / na - v.x) * 0.12 * P.social;
      acc.y += (ay / na - v.y) * 0.12 * P.social;
      acc.z += (az / na - v.z) * 0.12 * P.social;
    }
    if (nc) {
      acc.x += (cx / nc - p.x) * 0.012 * P.social;
      acc.y += (cy / nc - p.y) * 0.012 * P.social;
      acc.z += (cz / nc - p.z) * 0.012 * P.social;
    }
    // a puffer that gets bumped puffs up
    if (f.dna.shape === 3 && closest < 0.55 && f.puffFor <= 0) f.puffFor = 1.8;

    // wander: keep roughly the current heading, drifting with smooth noise
    f.wanderPhase += dt * (0.3 + 0.25 * P.playful);
    const flat = Math.hypot(v.x, v.z);
    const heading = flat > 0.05 ? Math.atan2(-v.z, v.x) : f.heading;
    f.heading = heading + (Math.sin(f.wanderPhase * 0.9 + f.dna.seed) + 0.5 * Math.sin(f.wanderPhase * 2.3 + f.dna.seed * 0.7)) * 0.55;
    if (f.state === 'enter') {
      // swimming in from the side towards a free spot
      const dx = f.target.x - p.x;
      const dy = f.target.y - p.y;
      const dz = f.target.z - p.z;
      const dist = Math.hypot(dx, dy, dz) + 1e-4;
      acc.x += ((dx / dist) * f.cruise * 1.5 - v.x) * 2;
      acc.y += ((dy / dist) * f.cruise * 1.5 - v.y) * 2;
      acc.z += ((dz / dist) * f.cruise * 1.5 - v.z) * 2;
    } else if (f.state === 'curious' || f.state === 'follow' || (f.state === 'food' && f.flake)) {
      // swim to the point of interest, slowing down on arrival
      const target = f.state === 'food' ? f.flake.pos : f.target;
      const tb = this.boundsAt(target.z);
      const dx = target.x - p.x;
      const dy = Math.min(target.y, tb.yMax - 0.4) - p.y;
      const dz = target.z - p.z;
      const dist = Math.hypot(dx, dy, dz) + 1e-4;
      const speed = f.cruise * (f.state === 'food' ? 2.0 : f.state === 'follow' ? 1.9 : 1.3);
      const arrive = Math.min(dist / (f.state === 'food' ? 0.6 : 1.6), 1);
      acc.x += ((dx / dist) * speed * arrive - v.x) * 2.6;
      acc.y += ((dy / dist) * speed * arrive - v.y) * 2.6;
      acc.z += ((dz / dist) * speed * arrive - v.z) * 2.6;
    } else if (f.state === 'wander') {
      const cruise = f.cruise * (this.night ? 0.65 : 1) * (1 + f.spurt * 1.4);
      const dvy = Math.sin(f.wanderPhase * 0.7 + f.dna.seed * 1.3) * 0.22 * cruise;
      // mostly sideways swimming: a fish seen from the side is the cutest fish
      const hx = Math.cos(f.heading);
      const hz = -Math.sin(f.heading) * 0.3;
      const hl = Math.hypot(hx, hz) || 1;
      acc.x += ((hx / hl) * cruise - v.x) * 0.7;
      acc.z += ((hz / hl) * cruise - v.z) * 0.7;
      acc.y += (dvy - v.y) * 0.5;
    }

    // favourite depth and soft walls taken from what the camera sees
    const b = this.boundsAt(p.z);
    const floor = Math.max(b.yMin, sandHeight(p.x, p.z) + 0.9 + f.radius * 0.45);
    if (f.state === 'wander' || f.state === 'gaze') {
      const prefY = floor + 0.6 + (b.yMax - floor - 1.2) * P.depth;
      acc.y += (prefY - p.y) * 0.25;
      // each fish has a favourite stretch of the aquarium, so they spread out
      const homeX = b.xMin + 2 + (b.xMax - b.xMin - 4) * P.home;
      acc.x += (homeX - p.x) * 0.035;
      acc.z += (P.homeZ - p.z) * 0.08;
    }
    const m = f.state === 'enter' ? -4 : 0.7 + f.radius * 0.6;
    if (p.x > b.xMax - m) acc.x -= (p.x - (b.xMax - m)) * 3.2;
    if (p.x < b.xMin + m) acc.x += (b.xMin + m - p.x) * 3.2;
    if (p.y < floor + 0.5) acc.y += (floor + 0.5 - p.y) * 4;
    if (p.y > b.yMax - 0.5) acc.y -= (p.y - (b.yMax - 0.5)) * 4;
    if (p.z > Z_MAX - 1) acc.z -= (p.z - (Z_MAX - 1)) * 3;
    if (p.z < Z_MIN + 1) acc.z += (Z_MIN + 1 - p.z) * 3;

    // rocks, chest and coral clumps
    for (const o of this.obstacles) {
      const dx = p.x - o.x;
      const dy = p.y - o.y;
      const dz = p.z - o.z;
      const reach = o.r + f.radius + 0.4;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < reach * reach) {
        const d = Math.sqrt(d2) + 1e-4;
        const k = (reach - d) * 4;
        acc.x += (dx / d) * k;
        acc.y += (dy / d) * k;
        acc.z += (dz / d) * k;
      }
    }

    // keep cruising speed, with the odd playful spurt
    f.nextSpurt -= dt;
    if (f.nextSpurt <= 0) {
      f.spurt = 1;
      f.nextSpurt = (4 + Math.random() * 8) / P.playful;
    }

    // a curious fish now and then stops to look at the child
    f.nextGaze -= dt;
    if (f.state === 'wander' && f.nextGaze <= 0) {
      _ndc.copy(p).project(camera);
      if (Math.abs(_ndc.x) < 0.65 && Math.abs(_ndc.y) < 0.6 && p.z > -3.5) {
        const facingRight = Math.cos(f.yaw) > 0;
        f.setState('gaze', { gazeYaw: facingRight ? -Math.PI / 2 + 0.62 : -Math.PI / 2 - 0.62, gazeFor: 2 + Math.random() * 1.6 });
      } else {
        f.nextGaze = 2;
      }
    }
  }

  // ---------------------------------------------------------------- frame

  update(t, dt, camera, night) {
    this.night = night;
    const fish = this.fish;
    if (this.grid) {
      for (const f of fish) {
        f.acc.set(0, 0, 0);
        f.vel.set(0.0001, 0, 0);
        f.pos.copy(f.gridSpot);
        f.integrate(t, dt, camera, night);
        f.yaw = -0.5;
        f.mesh.rotation.set(0, -0.5, 0);
        f.swimAmp = f.meta.def.swimAmp * 0.8;
      }
      return;
    }
    this.updateFood(dt);
    for (const f of fish) this.steer(f, t, dt, camera);
    for (const f of fish) f.integrate(t, dt, camera, night);
    this.updateComings(camera);

    // safety net: never lose a fish far outside the view (e.g. after rotating the iPad)
    for (const f of fish) {
      if (f.state === 'leave' || f.state === 'enter') continue;
      const b = this.boundsAt(f.pos.z);
      f.pos.x = clamp(f.pos.x, b.xMin - 3, b.xMax + 3);
      f.pos.y = clamp(f.pos.y, sandHeight(f.pos.x, f.pos.z) + 0.6, WORLD.surfaceY - 0.8);
      f.pos.z = clamp(f.pos.z, Z_MIN - 1, Z_MAX + 1);
    }

    // shadows and seaweed parting
    for (let i = 0; i < this.pushers.length; i++) {
      const f = fish[i];
      if (f) this.pushers[i].set(f.pos.x, f.pos.y, f.pos.z, f.radius * 1.3);
      else this.pushers[i].set(0, -100, 0, 0);
    }
  }

  // Fish swimming in (from the side, or diving in fresh from the factory) and fish leaving.
  updateComings(camera) {
    let gone = null;
    for (const f of this.fish) {
      if (f.state === 'enter') {
        if (f.entry === 'splash') {
          if (!f.splashed && f.pos.y < f.splashTop) {
            f.splashed = true;
            this.onSplash?.(f);
          }
          if (f.dived && f.vel.y > -0.9 && f.stateT > f.enterDelay + 0.6) {
            f.splashing = false;
            const facingRight = Math.cos(f.yaw) > 0;
            f.setState('gaze', { gazeYaw: facingRight ? -Math.PI / 2 + 0.62 : -Math.PI / 2 - 0.62, gazeFor: 2.2 });
            f.happy.target = 1;
            this.onArrive?.(f);
          }
        } else {
          const b = this.boundsAt(f.pos.z);
          if ((f.pos.x > b.xMin + 1.5 && f.pos.x < b.xMax - 1.5) || f.stateT > 12) f.setState('wander');
        }
      } else if (f.state === 'leave' && f.stateT > 1) {
        const b = this.boundsAt(f.pos.z);
        if (f.pos.x > b.xMax + 3 || f.pos.x < b.xMin - 3 || f.stateT > 14) (gone ??= []).push(f);
      }
    }
    if (gone) {
      for (const f of gone) {
        this.remove(f);
        this.onGone?.(f);
      }
    }
  }

  // Send a fish out of the aquarium: towards the nearer side.
  sendAway(f) {
    const b = this.boundsAt(f.pos.z);
    f.leave(f.pos.x > (b.xMin + b.xMax) / 2 ? 1 : -1);
  }

  // Hungry fish go for the nearest falling flake; eating happens at the nose.
  updateFood(dt) {
    const food = this.food;
    if (!food) return;
    const falling = food.falling;
    if (!falling.length) return;
    this.foodScan -= dt;
    if (this.foodScan <= 0) {
      this.foodScan = 0.25;
      const claims = new Map();
      for (const f of this.fish) if (f.state === 'food' && f.flake) claims.set(f.flake, (claims.get(f.flake) || 0) + 1);
      for (const f of this.fish) {
        if (f.busy || f.state === 'food' || f.fullFor > 0) continue;
        let best = null;
        let bestD = 16;
        for (const fl of falling) {
          const d = f.pos.distanceTo(fl.pos) + (claims.get(fl) || 0) * 3;
          if (d < bestD) {
            bestD = d;
            best = fl;
          }
        }
        if (best) {
          f.seekFood(best);
          claims.set(best, (claims.get(best) || 0) + 1);
        }
      }
    }
    for (const f of this.fish) {
      if (f.state !== 'food' || !f.flake || f.flake.dead) continue;
      f.nose(_nose);
      if (_nose.distanceTo(f.flake.pos) < 0.5 * f.size + 0.15 && food.eat(f.flake)) {
        const full = f.chomp();
        this.onEat?.(f, full);
      }
    }
  }

  // A water tap: the nearest one or two fish come to have a look.
  curious(point, count = 2, exclude = null) {
    const free = this.fish.filter((f) => !f.busy && f.state !== 'food' && f !== exclude);
    free.sort((a, b) => a.pos.distanceTo(point) / a.persona.curiosity - b.pos.distanceTo(point) / b.persona.curiosity);
    free.slice(0, count).forEach((f) => {
      if (f.pos.distanceTo(point) < 14) f.curious(point);
    });
  }

  // A finger dragging through the water: the nearest fish follow it.
  follow(point, count = 2) {
    const free = this.fish.filter((f) => !f.busy && f.state !== 'food');
    free.sort((a, b) => a.pos.distanceTo(point) - b.pos.distanceTo(point));
    free.slice(0, count).forEach((f) => f.follow(point));
  }

  // Generous screen-space picking: small fingers, moving targets.
  pick(clientX, clientY, camera, width, height) {
    _right.setFromMatrixColumn(camera.matrixWorld, 0);
    let best = null;
    let bestScore = Infinity;
    for (const f of this.fish) {
      if (f.state === 'leave' || f.state === 'enter') continue;
      _ndc.copy(f.pos).project(camera);
      if (_ndc.z > 1) continue;
      const sx = (_ndc.x * 0.5 + 0.5) * width;
      const sy = (-_ndc.y * 0.5 + 0.5) * height;
      _tmp.copy(_right).multiplyScalar(f.radius * 0.85).add(f.pos).project(camera);
      const rpx = Math.abs(_tmp.x - _ndc.x) * 0.5 * width;
      const hitR = Math.max(rpx * 1.15, 52);
      const d = Math.hypot(clientX - sx, clientY - sy);
      if (d < hitR) {
        const score = d / hitR + _ndc.z * 0.05;
        if (score < bestScore) {
          bestScore = score;
          best = f;
        }
      }
    }
    return best;
  }

  castShadows() {
    for (const f of this.fish) {
      this.shadows.add(f.pos.x, f.pos.y, f.pos.z, f.meta.total * f.size * 1.1, f.meta.def.W * f.size * 2.6 + 0.3, f.yaw);
    }
  }

  // Screen-space info for tests and (later) touch picking.
  screenInfo(camera, width, height) {
    return this.fish.map((f) => {
      _ndc.copy(f.pos).project(camera);
      return {
        id: f.dna.id,
        kind: f.dna.kind,
        shape: f.dna.shape,
        state: f.state,
        x: (_ndc.x * 0.5 + 0.5) * width,
        y: (-_ndc.y * 0.5 + 0.5) * height,
        z: f.pos.z,
        visible: Math.abs(_ndc.x) < 1 && Math.abs(_ndc.y) < 1,
      };
    });
  }
}

export { wrapAngle };
