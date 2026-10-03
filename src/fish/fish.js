// One fish: steering is computed by the School (it needs the neighbours); here we integrate
// motion, turn the body, animate tail/fins/eyes and feed the shader.

import * as THREE from 'three';
import { buildFishGeometry } from './geometry.js';
import { buildAnimalGeometry, FIRST_ANIMAL } from './animals.js';
import { createFishMaterial } from './material.js';
import { createPaint } from './paint.js';
import { personality, patternColor } from './dna.js';
import { clamp, damp, Spring, easeInOutCubic } from '../util/math.js';

const geometryCache = new Map();
export function fishGeometry(shape) {
  if (!geometryCache.has(shape)) geometryCache.set(shape, shape < FIRST_ANIMAL ? buildFishGeometry(shape) : buildAnimalGeometry(shape));
  return geometryCache.get(shape);
}

// Per shape: the four fish, then dolphin, shark, orca and whale.
const TEMPO = [1.0, 1.15, 0.8, 1.5, 0.85, 0.8, 0.62, 0.4]; // tail-beat tempo
const FIN_TEMPO = [1, 1, 1, 1, 0.55, 0.45, 0.45, 0.28]; // flipper flaps: slow and grand for the big ones
const VOICE = [6, 7, 6, 5, 8, 4, 3, 1]; // singing voice: bigger animals sing lower
const SLOW = [1, 1, 1, 1, 1, 1.1, 1.3, 1.9]; // how long a trick takes
const FISH_TRICKS = ['flip', 'roll', 'spin', 'jump'];
const TRICKS = { 4: ['flip', 'jump', 'spin', 'roll'], 5: ['roll', 'chomp', 'spin', 'chomp'], 6: ['roll', 'jump', 'spin', 'flip'], 7: ['spout', 'roll'] };
const AXIS = { flip: new THREE.Vector3(0, 0, 1), roll: new THREE.Vector3(1, 0, 0), spin: new THREE.Vector3(0, 1, 0) };
const _e = new THREE.Euler(0, 0, 0, 'YZX');
const _q = new THREE.Quaternion();
const _qt = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _w = new THREE.Vector3();

export function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export class Fish {
  // `paint` (fish factory): an existing paint canvas/texture to wear instead of its own.
  constructor(dna, { paint = null } = {}) {
    this.dna = dna;
    this.persona = personality(dna);
    const { geometry, meta } = fishGeometry(dna.shape);
    this.meta = meta;
    this.ownsPaint = !paint;
    this.paint = paint ?? createPaint(dna);
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
    // singing voice (a step of the pentatonic scale): bigger fish sing lower, each a bit its own
    this.animal = dna.shape >= FIRST_ANIMAL;
    this.voice = clamp(VOICE[dna.shape] - Math.round((this.size - 1) * 6) + ((dna.seed >>> 4) % 3) - 1, this.animal ? 0 : 4, this.animal ? 9 : 7);
    this.tunedAt = -1e9;
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
    this.bounce = new Spring(1, 170, 9); // vertical squash & stretch of a hop
    this.still = false; // hold the body still (finger painting)
    this.splashing = false; // diving in from the surface (a newly released fish)
    this.lookOverride = null;
    this.flash = 0;
    this.mouth = 0;
    this.prevSpeed = 0;
    this.onGone = null;
    this.target = new THREE.Vector3();
    this.tricks = TRICKS[dna.shape] ?? FISH_TRICKS;
    this.trickIndex = Math.floor(Math.random() * this.tricks.length);
    this.giggleT = 0;
    this.chompT = 0;
    this.fed = 0;
    this.fullFor = 0;
    this.bellyFor = 0;
  }

  // ---------------------------------------------------------------- interactions

  get busy() {
    return this.state === 'trick' || this.state === 'leave' || this.state === 'enter';
  }

  // A happy little hop (fish factory): squash, stretch, eyes pop, a big smile.
  hop(strength = 1, happy = 0.85) {
    this.bounce.kick(-3.4 * strength);
    this.eyePop.kick(2.4 * strength);
    this.happy.kick(4 * happy);
    this.happy.target = happy;
    this.flash = 0.45 * strength;
    this.giggleT = 0.45;
  }

  // Time to go: a little goodbye wiggle towards the child, then away to the nearest side.
  leave(dir) {
    if (this.state === 'leave') return;
    this.setState('leave', { leaveDir: dir, gazeYaw: dir > 0 ? -Math.PI / 2 + 0.5 : -Math.PI / 2 - 0.5 });
  }

  // Tapped! A happy trick — a different one each time. (The shark chomps the water — nom nom —
  // and the whale blows a fountain of bubbles; see Ocean.)
  trick() {
    const trick = this.tricks[this.trickIndex++ % this.tricks.length];
    const dur = (trick === 'jump' ? 1.0 : trick === 'spout' ? 0.85 : 0.9) * SLOW[this.dna.shape];
    this.setState('trick', { trickName: trick, trickDur: dur, trickDir: Math.random() < 0.5 ? 1 : -1 });
    if (trick === 'jump') this.vel.y = this.animal ? 4.2 : 3.4;
    if (trick === 'chomp') this.chompT = 0.75;
    if (trick === 'spout') {
      this.stretch.kick(-1.2);
      this.bounce.kick(-1.6);
    }
    this.happy.target = 1;
    this.eyePop.kick(3);
    this.flash = 0.8;
    this.giggleT = trick === 'chomp' ? 0 : 0.9;
    if (this.dna.shape === 3) this.puffFor = 1.6;
    return trick;
  }

  // Where the blowhole is right now (world space), for the whale's fountain.
  blowhole(out) {
    const b = this.meta.blowhole;
    if (!b) return out.copy(this.pos);
    return out.copy(b).multiplyScalar(this.size).applyQuaternion(this.mesh.quaternion).add(this.pos);
  }

  curious(point) {
    if (this.busy || this.state === 'food') return;
    this.target.copy(point);
    this.setState('curious', { until: 4.5 });
  }

  follow(point) {
    if (this.busy || this.state === 'food') return;
    this.target.copy(point);
    if (this.state !== 'follow') this.setState('follow');
    this.followSeen = 0;
  }

  seekFood(flake) {
    if (this.busy) return;
    this.flake = flake;
    this.setState('food');
  }

  // Got a flake! Nom, a round happy belly, and after a few: a celebration.
  chomp() {
    this.chompT = 0.32;
    this.fed++;
    this.bellyFor = 1.4;
    this.happy.kick(5);
    this.happy.target = 0.6;
    this.setState('wander');
    if (this.fed >= 3) {
      this.fed = 0;
      this.fullFor = 18;
      return true; // full and happy
    }
    return false;
  }

  // Nose position in world space (where flakes get eaten).
  nose(out) {
    return out.set(this.meta.len * 0.5 * this.size, 0, 0).applyQuaternion(this.mesh.quaternion).add(this.pos);
  }

  // `data` becomes plain properties on the fish — never use a method name as a key.
  setState(state, data = {}) {
    this.state = state;
    this.stateT = 0;
    Object.assign(this, data);
  }

  dispose() {
    this.material.dispose();
    if (this.ownsPaint) this.paint.texture.dispose();
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

    if (this.state === 'curious') {
      this.until -= dt;
      if (this.until <= 0 || (this.stateT > 1 && this.pos.distanceTo(this.target) < 1.1 && this.stateT > 2.2)) this.setState('wander');
    } else if (this.state === 'follow') {
      this.followSeen += dt;
      if (this.followSeen > 0.7) this.setState('wander');
    } else if (this.state === 'food') {
      if (!this.flake || this.flake.dead || this.flake.landed || this.stateT > 8) this.setState('wander');
    } else if (this.state === 'trick') {
      v.multiplyScalar(Math.exp(-dt * 1.2));
      if (this.stateT > this.trickDur) {
        this.setState('wander');
        this.happy.target = 0;
      }
    } else if (this.state === 'leave' && this.stateT < 0.9) {
      v.multiplyScalar(Math.exp(-dt * 3)); // stop to wave goodbye
      this.happy.target = 1;
    }
    this.fullFor = Math.max(0, this.fullFor - dt);

    v.addScaledVector(this.acc, dt);
    const maxSpeed = this.cruise * (this.state === 'food' || this.state === 'follow' ? 3 : 2.4);
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
    const waving = this.state === 'leave' && this.stateT < 0.9;
    if (this.state === 'gaze' || waving) targetYaw = this.gazeYaw;
    let diff = wrapAngle(targetYaw - this.yaw);
    if (Math.abs(diff) > 2.6) diff = (Math.cos(this.yaw) > 0 ? -1 : 1) * Math.abs(diff);
    const dyaw = diff * Math.min(1, dt * 2.6);
    this.yaw = wrapAngle(this.yaw + dyaw);
    this.yawRate = damp(this.yawRate, dyaw / Math.max(dt, 1e-3), 8, dt);
    let targetPitch = this.state === 'gaze' ? 0.08 : clamp(Math.atan2(v.y, flat + 0.4) * 0.7, -0.32, 0.32);
    if (this.splashing) targetPitch = clamp(Math.atan2(v.y, flat + 0.3), -1.25, 0.6); // nose-first dive
    this.pitch = damp(this.pitch, targetPitch, this.splashing ? 8 : 4, dt);
    this.roll = damp(this.roll, clamp(-this.yawRate * 0.2, -0.45, 0.45), 5, dt);
    if (waving) this.roll = Math.sin(this.stateT * 15) * 0.32 * Math.sin(Math.PI * this.stateT / 0.9);
    _e.set(this.roll, this.yaw, this.pitch, 'YZX');
    this.mesh.quaternion.setFromEuler(_e);
    if (this.state === 'trick' && AXIS[this.trickName]) {
      const k = easeInOutCubic(clamp(this.stateT / this.trickDur, 0, 1));
      _qt.setFromAxisAngle(AXIS[this.trickName], k * Math.PI * 2 * this.trickDir);
      this.mesh.quaternion.multiply(_qt);
    }

    this.animate(t, dt, camera, night, clamp(speed / this.cruise, 0, 2.2), fwdAcc);
  }

  // On display in the fish factory: no physics. The factory sets the position and the turn;
  // the fish keeps breathing, blinking, looking about and hopping.
  display(t, dt, camera, { yaw = 0, pitch = 0, roll = 0, look = null, spin = null } = {}) {
    this.stateT += dt;
    this.yaw = yaw;
    _e.set(roll, yaw, pitch, 'YZX');
    this.mesh.quaternion.setFromEuler(_e);
    if (spin) {
      _qt.setFromAxisAngle(spin.axis, spin.angle);
      this.mesh.quaternion.multiply(_qt);
    }
    this.lookOverride = look;
    this.animate(t, dt, camera, false, this.still ? 0 : 0.45, 0);
  }

  // Tail and fins, blinking, eyes, puffing, mouth — and everything the shader needs.
  animate(t, dt, camera, night, frac, fwdAcc) {
    const v = this.vel;
    const P = this.persona;
    // ---- swimming animation
    const def = this.meta.def;
    const gazing = this.state === 'gaze' ? 1 : 0;
    this.swimPhase += dt * (3.2 + frac * 5.5 + gazing * 4) * P.wiggle * TEMPO[this.dna.shape];
    const ampTarget = this.still ? 0 : def.swimAmp * (0.5 + 0.5 * frac + this.spurt * 0.6) * (night ? 0.75 : 1);
    this.swimAmp = damp(this.swimAmp, ampTarget, this.still ? 12 : 3, dt);
    this.finPhase += dt * (7 + (1 - Math.min(frac, 1)) * 6) * FIN_TEMPO[this.dna.shape];
    this.bend = damp(this.bend, this.still ? 0 : clamp(-this.yawRate * 0.22, -0.42, 0.42), 6, dt);
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
    if (this.lookOverride) {
      this.lookTarget.copy(this.lookOverride);
    } else if (this.state === 'gaze' || this.state === 'trick' || (this.state === 'leave' && this.stateT < 0.9)) {
      this.lookTarget.copy(camera.position);
    } else if (this.state === 'curious' || this.state === 'follow') {
      this.lookTarget.copy(this.target);
    } else if (this.state === 'food' && this.flake) {
      this.lookTarget.copy(this.flake.pos);
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
      // googly eyes: each pupil rolls about on its own, so they look in different directions
      const s = this.dna.seed;
      lx = 0.55 * Math.sin(t * 1.7 + s);
      ly = 0.5 * Math.cos(t * 1.3 + s * 0.7);
      rx = 0.55 * Math.sin(t * 1.1 + 2 + s);
      ry = -0.5 * Math.cos(t * 1.9 + s * 1.3);
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
    this.bellyFor = Math.max(0, this.bellyFor - dt);
    if (this.dna.shape !== 3) this.puff.target = this.bellyFor > 0 ? (this.animal ? 0.12 : 0.28) : 0;   // a round full belly
    const puff = Math.max(0, this.puff.update(dt));
    const happy = clamp(this.happy.update(dt), 0, 1);
    if (this.state !== 'trick') this.happy.target = Math.max(gazing * 0.3, this.happy.target * Math.exp(-dt * 1.5));
    // mouth: giggling during tricks, open wide near food, a quick chomp
    this.giggleT = Math.max(0, this.giggleT - dt);
    this.chompT = Math.max(0, this.chompT - dt);
    let mouth = 0;
    if (this.giggleT > 0) mouth = 0.3 + 0.35 * Math.abs(Math.sin(t * 19));
    if (this.state === 'food' && this.flake) mouth = clamp(1.3 - this.pos.distanceTo(this.flake.pos) / 3, 0, 0.85);
    if (this.chompT > 0) mouth = Math.abs(Math.sin(this.chompT * 20)) * 0.8;
    this.mouth = damp(this.mouth, mouth, 18, dt);
    const eyePop = this.eyePop.update(dt);
    this.flash *= Math.exp(-dt * 5);
    this.spurt *= Math.exp(-dt * 2.4);

    const u = this.material.uniforms;
    u.uSwimPhase.value = this.swimPhase;
    u.uSwimAmp.value = this.swimAmp;
    u.uBend.value = this.bend;
    u.uFinPhase.value = this.finPhase;
    u.uPuff.value = puff;
    const by = clamp(this.bounce.update(dt), 0.6, 1.45);
    u.uSquash.value.set(s / Math.sqrt(by), by / Math.sqrt(s), 1 / Math.sqrt(s * by));
    const eb = this.dna.eyes === 0 ? 1.1 : this.dna.eyes === 3 ? 1.06 : 1.0;
    u.uEyeScale.value.set(eb * eyePop, eb * eyePop);
    u.uBlink.value = blink;
    u.uDrowsy.value = night ? 0.25 : 0;
    u.uLook.value.copy(this.look);
    u.uMouth.value = this.mouth;
    u.uHappy.value = happy;
    u.uFlash.value = this.flash;
  }
}
