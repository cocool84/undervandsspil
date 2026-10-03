// Big bubbles to pop: every few seconds one wobbles up from the sand near the front. They
// are drawn by the ordinary bubble system; here we only follow where they are (the same
// motion as the bubble shader) so a small finger can find them.

import * as THREE from 'three';
import { U } from '../core/uniforms.js';
import { WORLD } from '../config.js';
import { sandHeight } from './sand.js';
import { smoothstep } from '../util/math.js';

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _right = new THREE.Vector3();

export class BigBubbles {
  constructor(bubbles, spots) {
    this.bubbles = bubbles;
    this.spots = spots.map(([x, z]) => new THREE.Vector3(x, sandHeight(x, z) + 0.25, z));
    this.list = [];
    this.next = 4;
    this.popped = 0;
  }

  spawn(at) {
    const size = 1.0 + Math.random() * 0.45;
    const speed = 0.7 + Math.random() * 0.3;
    const wob = 0.16 + Math.random() * 0.1;
    const seed = Math.random();
    const { index, birth } = this.bubbles.spawn(at.x, at.y, at.z, size, speed, wob, seed);
    this.list.push({ index, birth, x: at.x, y: at.y, z: at.z, size, speed, wob, seed });
  }

  // Where a bubble is now (same formula as the shader) → its radius.
  position(b, out) {
    const age = U.uTime.value - b.birth;
    const sway = Math.min(age * 1.5, 1);
    out.set(
      b.x + Math.sin(age * (2.2 + b.seed * 2) + b.seed * 6.28) * b.wob * sway,
      b.y + b.speed * age + 0.1 * age * age,
      b.z + Math.cos(age * (1.7 + b.seed) + b.seed * 3) * b.wob * 0.6 * sway,
    );
    const grow = smoothstep(0, 0.22, age);
    return 0.5 * b.size * (0.8 + 0.2 * grow + (0.15 * Math.min(age, 3)) / 3) * grow;
  }

  update(dt) {
    this.next -= dt;
    if (this.next <= 0) {
      this.next = 4.5 + Math.random() * 5;
      if (this.list.length < 3) this.spawn(this.spots[Math.floor(Math.random() * this.spots.length)]);
    }
    // forget the ones that reached the surface (or whose slot a newer bubble took)
    this.list = this.list.filter((b) => this.bubbles.isAlive(b.index, b.birth) && this.position(b, _v) >= 0 && _v.y < WORLD.surfaceY - 0.8);
  }

  // The bubble under a screen point — generous for small fingers — or null.
  pick(cx, cy, camera, w, h) {
    _right.setFromMatrixColumn(camera.matrixWorld, 0);
    let best = null;
    let bestScore = Infinity;
    for (const b of this.list) {
      const r = this.position(b, _w);
      if (r < 0.1) continue;
      _v.copy(_w).project(camera);
      if (_v.z > 1) continue;
      const sx = (_v.x * 0.5 + 0.5) * w;
      const sy = (-_v.y * 0.5 + 0.5) * h;
      const edge = _w.clone().addScaledVector(_right, r).project(camera);
      const rpx = Math.abs(edge.x - _v.x) * 0.5 * w;
      const hitR = Math.max(rpx * 1.35, 44);
      const d = Math.hypot(cx - sx, cy - sy);
      if (d < hitR && d / hitR < bestScore) {
        bestScore = d / hitR;
        best = b;
        b.at = _w.clone();
        b.radius = r;
      }
    }
    return best;
  }

  pop(b) {
    this.bubbles.kill(b.index);
    const i = this.list.indexOf(b);
    if (i >= 0) this.list.splice(i, 1);
    this.popped++;
  }

  // Screen positions for the tests.
  screenInfo(camera, w, h) {
    return this.list.map((b) => {
      this.position(b, _w);
      _v.copy(_w).project(camera);
      return { x: (_v.x * 0.5 + 0.5) * w, y: (-_v.y * 0.5 + 0.5) * h };
    });
  }
}
