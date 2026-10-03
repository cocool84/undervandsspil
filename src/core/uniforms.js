// Shared uniforms (one object, referenced by every material) and the day/night palette.

import * as THREE from 'three';
import { WORLD } from '../config.js';
import { clamp, smoothstep } from '../util/math.js';

const col = (hex, k = 1) => new THREE.Color(hex).multiplyScalar(k);

export const U = {
  uTime: { value: 0 },
  uNight: { value: 0 },
  uSunDir: { value: new THREE.Vector3(-0.32, 1, 0.22).normalize() },
  uKeyColor: { value: new THREE.Color() },
  uSkyAmb: { value: new THREE.Color() },
  uGroundAmb: { value: new THREE.Color() },
  uRimColor: { value: new THREE.Color() },
  uWaterTop: { value: new THREE.Color() },
  uWaterMid: { value: new THREE.Color() },
  uWaterDeep: { value: new THREE.Color() },
  uSunGlow: { value: new THREE.Color() },
  uFogDensity: { value: 0.024 },
  uSurfaceY: { value: WORLD.surfaceY },
  uCaustics: { value: null },
  uCausticsStrength: { value: 1 },
  uTouches: {
    value: [
      new THREE.Vector4(0, -100, 0, -100),
      new THREE.Vector4(0, -100, 0, -100),
      new THREE.Vector4(0, -100, 0, -100),
      new THREE.Vector4(0, -100, 0, -100),
    ],
  },
};

// Colours are given in sRGB and converted to the linear working space by THREE.Color.
const DAY = {
  key: col('#fff2d6', 1.12),
  sky: col('#bfeeff', 0.58),
  ground: col('#3b72a6', 0.4),
  rim: col('#b5f6ff', 0.32),
  top: col('#a9f3ff'),
  mid: col('#2aa6c8'),
  deep: col('#0c3d79'),
  glow: col('#fff3cc', 0.85),
  caustics: 1.0,
  fog: 0.03,
  sun: new THREE.Vector3(-0.32, 1, 0.22).normalize(),
};

const NIGHT = {
  key: col('#9db8ff', 0.36),
  sky: col('#3d5cae', 0.34),
  ground: col('#0d1b44', 0.32),
  rim: col('#79c2ff', 0.26),
  top: col('#2b4c92'),
  mid: col('#0f2a5d'),
  deep: col('#050c27'),
  glow: col('#d6e4ff', 0.6),
  caustics: 0.32,
  fog: 0.034,
  sun: new THREE.Vector3(0.38, 1, 0.12).normalize(),
};

const env = {
  nightLinear: 0,
  nightTarget: 0,
};

export function setNight(on, instant = false) {
  env.nightTarget = on ? 1 : 0;
  if (instant) env.nightLinear = env.nightTarget;
}

export function isNight() {
  return env.nightTarget > 0.5;
}

function mixColor(target, a, b, t) {
  target.r = a.r + (b.r - a.r) * t;
  target.g = a.g + (b.g - a.g) * t;
  target.b = a.b + (b.b - a.b) * t;
}

// Called once per frame. The day/night blend takes ~2.5 s.
export function updateEnvironment(t, dt) {
  U.uTime.value = t;
  const step = dt / 2.5;
  env.nightLinear = clamp(env.nightLinear + Math.sign(env.nightTarget - env.nightLinear) * step, 0, 1);
  if (Math.abs(env.nightLinear - env.nightTarget) < step) env.nightLinear = env.nightTarget;
  const n = smoothstep(0, 1, env.nightLinear);
  U.uNight.value = n;
  mixColor(U.uKeyColor.value, DAY.key, NIGHT.key, n);
  mixColor(U.uSkyAmb.value, DAY.sky, NIGHT.sky, n);
  mixColor(U.uGroundAmb.value, DAY.ground, NIGHT.ground, n);
  mixColor(U.uRimColor.value, DAY.rim, NIGHT.rim, n);
  mixColor(U.uWaterTop.value, DAY.top, NIGHT.top, n);
  mixColor(U.uWaterMid.value, DAY.mid, NIGHT.mid, n);
  mixColor(U.uWaterDeep.value, DAY.deep, NIGHT.deep, n);
  mixColor(U.uSunGlow.value, DAY.glow, NIGHT.glow, n);
  U.uCausticsStrength.value = DAY.caustics + (NIGHT.caustics - DAY.caustics) * n;
  U.uFogDensity.value = DAY.fog + (NIGHT.fog - DAY.fog) * n;
  U.uSunDir.value.lerpVectors(DAY.sun, NIGHT.sun, n).normalize();
}

// Build a uniforms object for a material: shared references plus its own entries.
export function withShared(own = {}) {
  return Object.assign({}, U, own);
}
