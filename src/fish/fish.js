// One fish: steering is computed by the School (it needs the neighbours); here we integrate
// motion, turn the body, animate tail/fins/eyes and feed the shader.

import * as THREE from 'three';
import { buildFishGeometry } from './geometry.js';
import { createFishMaterial } from './material.js';
import { createPaint } from './paint.js';
import { personality, patternColor } from './dna.js';
import { clamp, damp, Spring } from '../util/math.js';

const geometryCache = new Map();
export function fishGeometry(shape) {
  if (!geometryCache.has(shape)) geometryCache.set(shape, buildFishGeometry(shape));
  return geometryCache.get(shape);
}

const TEMPO = [1.0, 1.15, 0.8, 1.5]; // tail-beat tempo per shape
const _e = new THREE.Euler(0, 0, 0, 'YZX');
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _w = new THREE.Vector3();

export function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export class Fish {
  constructor(dna) {
    this.dna = dna;
    this.persona = personality(dna);
    const { geometry, meta } = fishGeometry(dna.shape);
    this.meta = meta;
    this.paint = createPaint(dna);
    this.material = createFishMaterial({
      texture: this.paint.texture,
      meta,
      dna,
      persona: this.persona,
      patternColor: patternColor(dna.color),
    });
    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.userData.fish = this;
    this.size = this.persona.size;
    this.mesh.scale.setScalar(this.size);
    this.radius = meta.radius * this.size;
    this.pos = this.mesh.position;
    this.vel = new THREE.Vector3(1, 0, 0);
    this.acc = new THREE.Vector3();
    this.cruise = 1.1 * this.persona.speed;
    this.speed = 0;

    this.yaw = 0;
    this.pitch = 0;
    this.roll = 0;
    this.yawRate = 0;
    this.bend = 0;
    this.swimPhase = Math.random() * 10;
    this.finPhase = Math.random() * 10;
    this.swimAmp = meta.def.swimAmp;

    this.state = 'wander';
    this.stateT = 0;
    this.gazeYaw = 0;
    this.gazeFor = 0;
    this.heading = Math.random() * Math.PI * 2;
    this.wanderPhase = Math.random() * 100;
    this.spurt = 0;
    this.nextSpurt = (2 + Math.random() * 6) / this.persona.playful;
    this.nextGaze = (4 + Math.random() * 10) / this.persona.curiosity;
    this.nextPuff = 12 + Math.random() * 20;
    this.puffFor = 0;

    this.blinkT = -1;
    this.nextBlink = 1 + Math.random() * 4;
    this.look = new THREE.Vector4();
    this.lookTarget = new THREE.Vector3();
    this.happy = new Spring(0, 40, 8);
    this.puff = new Spring(0, 30, 6);
    this.stretch = new Spring(1, 200, 12);
    this.eyePop = new Spring(1, 160, 9);
    this.flash = 0;
    this.mouth = 0;
    this.prevSpeed = 0;
    this.onGone = null;
  }

  setState(state, data = {}) {
    this.state = state;
    this.stateT = 0;
    Object.assign(this, data);
  }

  dispose() {
    this.material.dispose();
    this.paint.texture.dispose();
  }

  // Called by the School after it has filled this.acc.
  integrate(t, dt, camera, night) {
    const v = this.vel;
    const P = this.persona;
    this.stateT += dt;
    if (this.state === 'gaze') {
      // hover, turn the face three-quarters towards the child and look at them
      v.multiplyScalar(Math.exp(-dt * 2.2));
      if (this.stateT > this.gazeFor) {
        this.setState('wander');
        this.nextGaze = (9 + Math.random() * 14) / P.curiosity;
      }
    }

    v.addScaledVector(this.acc, dt);
    const maxSpeed = this.cruise * 2.4;
    let speed = v.length();
    if (speed > maxSpeed) {
      v.multiplyScalar(maxSpeed / speed);
      speed = maxSpeed;
    }
    this.pos.addScaledVector(v, dt);
    const fwdAcc = (speed - this.prevSpeed) / Math.max(dt, 1e-3);
    this.prevSpeed = speed;
    this.speed = speed;

    // ---- orientation: yaw follows the velocity; U-turns go via facing the viewer
    const flat = Math.hypot(v.x, v.z);
    let targetYaw = flat > 0.05 ? Math.atan2(-v.z, v.x) : this.yaw;
    if (this.state === 'gaze') targetYaw = this.gazeYaw;
    let diff = wrapAngle(targetYaw - this.yaw);
    if (Math.abs(diff) > 2.6) diff = (Math.cos(this.yaw) > 0 ? -1 : 1) * Math.abs(diff);
    const dyaw = diff * Math.min(1, dt * 2.6);
    this.yaw = wrapAngle(this.yaw + dyaw);
    this.yawRate = damp(this.yawRate, dyaw / Math.max(dt, 1e-3), 8, dt);
    const targetPitch = this.state === 'gaze' ? 0.08 : clamp(Math.atan2(v.y, flat + 0.4) * 0.7, -0.32, 0.32);
    this.pitch = damp(this.pitch, targetPitch, 4, dt);
    this.roll = damp(this.roll, clamp(-this.yawRate * 0.2, -0.45, 0.45), 5, dt);
    _e.set(this.roll, this.yaw, this.pitch, 'YZX');
    this.mesh.quaternion.setFromEuler(_e);

    // ---- swimming animation
    const def = this.meta.def;
    const frac = clamp(speed / this.cruise, 0, 2.2);
    const gazing = this.state === 'gaze' ? 1 : 0;
    this.swimPhase += dt * (3.2 + frac * 5.5 + gazing * 4) * P.wiggle * TEMPO[this.dna.shape];
    const ampTarget = def.swimAmp * (0.5 + 0.5 * frac + this.spurt * 0.6) * (night ? 0.75 : 1);
    this.swimAmp = damp(this.swimAmp, ampTarget, 3, dt);
    this.finPhase += dt * (7 + (1 - Math.min(frac, 1)) * 6);
    this.bend = damp(this.bend, clamp(-this.yawRate * 0.22, -0.42, 0.42), 6, dt);
    this.stretch.target = 1 + clamp(fwdAcc * 0.025, -0.06, 0.1);
    const s = this.stretch.update(dt);

    // ---- blinking (sleepy eyes blink slowly; night makes everyone a little drowsy)
    this.nextBlink -= dt;
    if (this.nextBlink <= 0) {
      this.blinkT = 0;
      this.nextBlink = Math.random() < 0.22 ? 0.18 : (2 + Math.random() * 4.5) / P.blinkRate;
    }
    let blink = 0;
    if (this.blinkT >= 0) {
      const dur = this.dna.eyes === 1 ? 0.34 : 0.17;
      this.blinkT += dt;
      blink = Math.sin(clamp(this.blinkT / dur, 0, 1) * Math.PI);
      if (this.blinkT > dur) this.blinkT = -1;
    }

    // ---- where the eyes look
    if (this.state === 'gaze') {
      this.lookTarget.copy(camera.position);
    } else {
      _v.copy(v).normalize().multiplyScalar(4).add(this.pos);
      _w.copy(camera.position).sub(this.pos).multiplyScalar(0.12);
      this.lookTarget.copy(_v).add(_w);
    }
    _q.copy(this.mesh.quaternion).invert();
    _v.copy(this.lookTarget).sub(this.pos).applyQuaternion(_q).normalize();
    let lx = clamp(_v.x, -0.9, 0.9);
    let ly = clamp(_v.y * 1.2, -0.85, 0.85);
    let rx = lx;
    let ry = ly;
    if (this.dna.eyes === 3) {
      // wonky eyes wander about on their own
      lx += 0.32 + Math.sin(t * 0.9 + this.dna.seed) * 0.25;
      ly += 0.18;
      rx -= 0.3 + Math.sin(t * 1.3 + 2 + this.dna.seed) * 0.2;
      ry -= 0.25 + Math.cos(t * 0.7) * 0.15;
    }
    const k = 1 - Math.exp(-dt * 9);
    this.look.x += (lx - this.look.x) * k;
    this.look.y += (ly - this.look.y) * k;
    this.look.z += (rx - this.look.z) * k;
    this.look.w += (ry - this.look.w) * k;

    // ---- puffer fish puff up now and then (and when startled — see School)
    if (this.dna.shape === 3) {
      this.nextPuff -= dt;
      if (this.nextPuff <= 0) {
        this.puffFor = 2.2;
        this.nextPuff = 18 + Math.random() * 25;
      }
      this.puffFor -= dt;
      this.puff.target = this.puffFor > 0 ? 1 : 0;
    }
    const puff = Math.max(0, this.puff.update(dt));
    const happy = clamp(this.happy.update(dt), 0, 1);
    this.happy.target = gazing * 0.3;
    const eyePop = this.eyePop.update(dt);
    this.flash *= Math.exp(-dt * 5);
    this.spurt *= Math.exp(-dt * 2.4);

    const u = this.material.uniforms;
    u.uSwimPhase.value = this.swimPhase;
    u.uSwimAmp.value = this.swimAmp;
    u.uBend.value = this.bend;
    u.uFinPhase.value = this.finPhase;
    u.uPuff.value = puff;
    u.uSquash.value.set(s, 1 / Math.sqrt(s), 1 / Math.sqrt(s));
    const eb = this.dna.eyes === 0 ? 1.14 : 1.0;
    if (this.dna.eyes === 3) u.uEyeScale.value.set(1.22 * eyePop, 0.86 * eyePop);
    else u.uEyeScale.value.set(eb * eyePop, eb * eyePop);
    u.uBlink.value = blink;
    u.uDrowsy.value = night ? 0.35 : 0;
    u.uLook.value.copy(this.look);
    u.uMouth.value = this.mouth;
    u.uHappy.value = happy;
    u.uFlash.value = this.flash;
  }
}
