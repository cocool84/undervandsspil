// Touch interaction: multitouch pointers, forgiving picking (fish in screen space, then the
// nearest object along the ray, then sand, then water) and a joyful reaction for every tap.

import * as THREE from 'three';
import { U, setNight, isNight } from './core/uniforms.js';
import { sandHeight } from './world/sand.js';
import { saveSettings } from './storage.js';
import { SHAPE } from './particles/fx.js';
import { WORLD } from './config.js';

const _o = new THREE.Vector3();
const _d = new THREE.Vector3();
const _p = new THREE.Vector3();
const _c = new THREE.Vector3();
const _hit = new THREE.Vector3();

export class Interaction {
  constructor(app) {
    this.app = app;
    this.pointers = new Map();
    this.touchCursor = 0;
    this.taps = 0;
    this.last = null; // what the last tap hit (for tests)
    const canvas = app.core.renderer.domElement;
    canvas.addEventListener('pointerdown', (e) => this.down(e), { passive: false });
    window.addEventListener('pointermove', (e) => this.move(e), { passive: false });
    window.addEventListener('pointerup', (e) => this.up(e));
    window.addEventListener('pointercancel', (e) => this.up(e));
  }

  get enabled() {
    return this.app.state.started && this.app.view === 'aquarium' && !this.app.busy;
  }

  ndc(x, y) {
    return [(x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1];
  }

  down(e) {
    if (e.cancelable) e.preventDefault();
    if (!this.enabled) return;
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, trail: 0, ripple: 0, touch: 0 });
    this.tap(e.clientX, e.clientY);
  }

  move(e) {
    const p = this.pointers.get(e.pointerId);
    if (!p || !this.enabled) return;
    if (e.cancelable) e.preventDefault();
    if (Math.hypot(e.clientX - p.x, e.clientY - p.y) < 12) return;
    p.x = e.clientX;
    p.y = e.clientY;
    const now = performance.now();
    if (now - p.trail < 45) return;
    p.trail = now;
    this.drag(e.clientX, e.clientY, p, now);
  }

  up(e) {
    this.pointers.delete(e.pointerId);
  }

  // ---------------------------------------------------------------- picking

  pushTouch(point) {
    U.uTouches.value[this.touchCursor].set(point.x, point.y, point.z, U.uTime.value);
    this.touchCursor = (this.touchCursor + 1) % U.uTouches.value.length;
  }

  // First crossing of the ray with the sand (ray march + bisection), or −1.
  sandHit(origin, dir) {
    let prev = 2;
    for (let t = 2; t < 95; t += 0.5) {
      const x = origin.x + dir.x * t;
      const y = origin.y + dir.y * t;
      const z = origin.z + dir.z * t;
      if (y < sandHeight(x, z)) {
        let a = prev;
        let b = t;
        for (let i = 0; i < 8; i++) {
          const m = (a + b) / 2;
          if (origin.y + dir.y * m < sandHeight(origin.x + dir.x * m, origin.z + dir.z * m)) b = m;
          else a = m;
        }
        return b;
      }
      prev = t;
    }
    return -1;
  }

  // Nearest tappable object (spheres, plus kelp clusters as cylinders) along the ray.
  pickObject(origin, dir) {
    const world = this.app.world;
    let best = null;
    let bestT = Infinity;
    for (const p of world.pickables) {
      const c = p.center;
      _c.copy(origin).sub(c);
      const b = _c.dot(dir);
      const h = b * b - (_c.lengthSq() - p.radius * p.radius);
      if (h < 0) continue;
      const t = -b - Math.sqrt(h);
      if (t > 0 && t < bestT) {
        bestT = t;
        best = p;
      }
    }
    for (const k of world.seaweed.clusters) {
      const dx = dir.x;
      const dz = dir.z;
      const den = dx * dx + dz * dz;
      if (den < 1e-6) continue;
      const t = -((origin.x - k.x) * dx + (origin.z - k.z) * dz) / den;
      if (t <= 0 || t >= bestT) continue;
      const px = origin.x + dx * t - k.x;
      const pz = origin.z + dz * t - k.z;
      if (px * px + pz * pz > k.r * k.r) continue;
      const y = origin.y + dir.y * t;
      const ground = sandHeight(k.x, k.z);
      if (y < ground || y > ground + k.h) continue;
      bestT = t;
      best = { type: 'kelp', kelp: k };
    }
    return best ? { obj: best, t: bestT } : null;
  }

  // ---------------------------------------------------------------- reactions

  // What would a tap here touch? (No side effects; also used by the tests.)
  classify(cx, cy) {
    const { rig, world, core } = this.app;
    const [nx, ny] = this.ndc(cx, cy);
    rig.screenRay(nx, ny, _o, _d);
    const fish = world.school.pick(cx, cy, core.camera, window.innerWidth, window.innerHeight);
    if (fish) return { type: 'fish', fish };
    const hit = this.pickObject(_o, _d);
    const sandT = this.sandHit(_o, _d);
    if (hit && (sandT < 0 || hit.t < sandT + 0.4)) return { type: hit.obj.type, obj: hit.obj, t: hit.t };
    if (sandT > 0 && _o.z + _d.z * sandT > -14) return { type: 'sand', t: sandT };
    return { type: 'water' };
  }

  tap(cx, cy) {
    const { rig, world, core, audio } = this.app;
    const [nx, ny] = this.ndc(cx, cy);
    const time = U.uTime.value;
    const u = cx / window.innerWidth;
    const v = 1 - cy / window.innerHeight;
    this.taps++;
    const what = this.classify(cx, cy);
    rig.screenRay(nx, ny, _o, _d);

    const fish = what.fish;
    if (fish) {
      core.finalPass.addRipple(u, v, time, 0.55);
      const trick = fish.trick();
      world.fx.love(fish.pos, 5);
      // each fish sings its own little tune; quick repeat taps get a single soft note
      const now = performance.now();
      const short = now - fish.tunedAt < 650;
      fish.tunedAt = now;
      if (fish.dna.shape === 3 && !short) {
        audio.play('puffup');
        audio.play('fishTune', { trick, base: fish.voice, gain: 0.09 }, 0.22);
      } else {
        audio.play('fishTune', { trick, base: fish.voice, short });
      }
      this.pushTouch(fish.pos);
      this.last = { type: 'fish', id: fish.dna.id, trick };
      return;
    }

    if (what.obj) {
      _hit.copy(_o).addScaledVector(_d, what.t);
      core.finalPass.addRipple(u, v, time, 0.5);
      this.react(what.obj, _hit);
      this.last = { type: what.obj.type };
      return;
    }
    if (what.type === 'sand') {
      _hit.copy(_o).addScaledVector(_d, what.t);
      core.finalPass.addRipple(u, v, time, 0.45);
      world.fx.dust(_hit, 7);
      world.bubbles.burst(_hit.x, _hit.y + 0.2, _hit.z, 4, 0.3, 0.04, 0.1);
      audio.play('puff');
      this.pushTouch(_hit);
      this.last = { type: 'sand' };
      return;
    }

    // open water
    rig.screenToPlaneZ(nx, ny, 0.8, _p);
    core.finalPass.addRipple(u, v, time, 1);
    world.fx.ring(_p, '#d8fbff', 0.55);
    world.bubbles.burst(_p.x, _p.y, _p.z, 8, 0.25, 0.05, 0.16);
    audio.play('bloop', { note: 5 + Math.round((ny * 0.5 + 0.5) * 9) });
    world.school.curious(_p.clone());
    if (U.uNight.value > 0.5) world.fx.glowDots(_p, 14);
    this.pushTouch(_p);
    this.last = { type: 'water' };
  }

  react(obj, point) {
    const { world, audio, core } = this.app;
    switch (obj.type) {
      case 'chest': {
        if (world.chest.open()) {
          audio.play('treasure');
          audio.play('whoosh', { up: true, gain: 0.06, dur: 0.7 });
          this.app.rig.kick.set(0, -0.12, -0.25);
        } else {
          audio.play('bloop', { note: 2 });
          world.bubbles.burst(point.x, point.y, point.z, 6, 0.3, 0.05, 0.14);
        }
        break;
      }
      case 'crab': {
        world.crab.celebrate();
        world.crab.lookAt(core.camera.position);
        audio.play('clickclack');
        world.fx.love(world.crab.worldCenter.clone().add(_c.set(0, 0.6, 0)), 3);
        break;
      }
      case 'jelly': {
        world.jellies.poke(obj.index);
        audio.play('boing');
        world.fx.sparkles(world.jellies.jellies[obj.index].pos, 8, 1.2, '#ffd0ff');
        break;
      }
      case 'anemone': {
        world.corals.anemones[obj.index].w = U.uTime.value;
        audio.play('pling', { note: 4 + obj.index * 2 });
        world.bubbles.burst(obj.center.x, obj.center.y + 0.3, obj.center.z, 7, 0.3, 0.04, 0.12);
        break;
      }
      case 'coral': {
        world.fx.sparkles(point, 8, 0.9);
        world.bubbles.burst(point.x, point.y, point.z, 5, 0.3, 0.04, 0.12);
        audio.play('pling', { note: 10 + Math.floor(Math.random() * 5) });
        break;
      }
      case 'rock': {
        world.bubbles.burst(point.x, point.y + 0.2, point.z, 10, 0.4, 0.05, 0.16);
        audio.play('bloop', { note: 1 });
        break;
      }
      case 'kelp': {
        const k = obj.kelp;
        _c.set(k.x, Math.max(point.y, sandHeight(k.x, k.z) + 0.5), k.z);
        this.pushTouch(_c);
        world.bubbles.burst(point.x, point.y, point.z, 6, 0.4, 0.04, 0.12);
        audio.play('puff', { freq: 1200, gain: 0.14, dur: 0.45 });
        break;
      }
      default:
        break;
    }
    this.pushTouch(point);
  }

  // A finger gliding through the water leaves a glittering trail and fish follow it.
  drag(cx, cy, p, now) {
    const { rig, world, core, audio } = this.app;
    const [nx, ny] = this.ndc(cx, cy);
    rig.screenToPlaneZ(nx, ny, 1.5, _p);
    world.fx.spawn(SHAPE.SPARKLE, _p.x, _p.y, _p.z, { vy: 0.4, life: 0.8, size: 0.26, color: '#fff2b0' });
    world.bubbles.spawn(_p.x, _p.y, _p.z, 0.05 + Math.random() * 0.06, 1.2, 0.06);
    world.school.follow(_p.clone());
    if (U.uNight.value > 0.5) world.fx.glowDots(_p, 2);
    if (now - p.ripple > 160) {
      p.ripple = now;
      core.finalPass.addRipple(cx / window.innerWidth, 1 - cy / window.innerHeight, U.uTime.value, 0.35);
      audio.play('bloop', { note: 14 + Math.floor(Math.random() * 4), gain: 0.05, short: true });
    }
    if (now - p.touch > 200) {
      p.touch = now;
      this.pushTouch(_p);
    }
  }

  // ---------------------------------------------------------------- buttons

  feed() {
    const { world, audio, core } = this.app;
    const b = world.school.boundsAt(0.5);
    const cx = THREE.MathUtils.lerp(b.xMin + 3, b.xMax - 3, Math.random());
    const top = Math.min(WORLD.surfaceY - 0.4, b.yMax + 0.4);
    world.food.sprinkle(cx, top, 20);
    world.bubbles.burst(cx, top - 0.5, 0.5, 10, 1.5, 0.05, 0.14);
    _p.set(cx, top - 1, 0.5).project(core.camera);
    core.finalPass.addRipple(_p.x * 0.5 + 0.5, Math.min(_p.y * 0.5 + 0.5, 0.97), U.uTime.value, 0.8);
    audio.play('splash', { gain: 0.15, bubbles: 2 });
    audio.play('sparkle', { from: 9, count: 5, gain: 0.04 }, 0.12);
  }

  toggleNight() {
    const { audio } = this.app;
    const on = !isNight();
    setNight(on);
    audio.setNight(on);
    audio.play('chime', { up: !on });
    audio.play('whoosh', { up: !on, gain: 0.07 });
    saveSettings({ night: on });
    return on;
  }

  toggleSound() {
    const { audio } = this.app;
    const muted = !audio.muted;
    audio.setMuted(muted);
    saveSettings({ muted });
    if (!muted) audio.play('tock', { note: 12 });
    return muted;
  }
}
