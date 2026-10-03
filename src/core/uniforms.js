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

// The open sea: deeper and clearer blue, less turquoise than the reef.
const OCEAN_DAY = {
  key: col('#fff5e2', 1.1),
  sky: col('#b6e4ff', 0.56),
  ground: col('#2c5c9c', 0.4),
  rim: col('#a8e6ff', 0.3),
  top: col('#86d9ff'),
  mid: col('#1d82cf'),
  deep: col('#062c6c'),
  glow: col('#fff3d0', 0.9),
  caustics: 1.0,
  fog: 0.024,
  sun: DAY.sun,
};

const OCEAN_NIGHT = {
  key: col('#93b2ff', 0.34),
  sky: col('#30509e', 0.33),
  ground: col('#0a173c', 0.3),
  rim: col('#72b8ff', 0.26),
  top: col('#244684'),
  mid: col('#0b2353'),
  deep: col('#030a22'),
  glow: col('#d6e4ff', 0.6),
  caustics: 0.3,
  fog: 0.032,
  sun: NIGHT.sun,
};

const PALETTES = { reef: [DAY, NIGHT], ocean: [OCEAN_DAY, OCEAN_NIGHT] };

const env = {
  nightLinear: 0,
  nightTarget: 0,
  day: DAY,
  night: NIGHT,
};

// The water's colours and light for the world on screen ('reef' | 'ocean').
export function setPalette(kind) {
  [env.day, env.night] = PALETTES[kind] ?? PALETTES.reef;
}

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
  const day = env.day;
  const night = env.night;
  U.uNight.value = n;
  mixColor(U.uKeyColor.value, day.key, night.key, n);
  mixColor(U.uSkyAmb.value, day.sky, night.sky, n);
  mixColor(U.uGroundAmb.value, day.ground, night.ground, n);
  mixColor(U.uRimColor.value, day.rim, night.rim, n);
  mixColor(U.uWaterTop.value, day.top, night.top, n);
  mixColor(U.uWaterMid.value, day.mid, night.mid, n);
  mixColor(U.uWaterDeep.value, day.deep, night.deep, n);
  mixColor(U.uSunGlow.value, day.glow, night.glow, n);
  U.uCausticsStrength.value = day.caustics + (night.caustics - day.caustics) * n;
  U.uFogDensity.value = day.fog + (night.fog - day.fog) * n;
  U.uSunDir.value.lerpVectors(day.sun, night.sun, n).normalize();
}

// Build a uniforms object for a material: shared references plus its own entries.
export function withShared(own = {}) {
  return Object.assign({}, U, own);
}

// The fish factory is always lit like a bright, sunny day — whatever time it is in the
// aquarium — and has no fog: materials in its scene swap the shared light for these.
const STUDIO = {
  uNight: { value: 0 },
  uKeyColor: { value: col('#fff4de', 0.98) },
  uSkyAmb: { value: col('#c9f2ff', 0.5) },
  uGroundAmb: { value: col('#5d8fc0', 0.36) },
  uRimColor: { value: col('#c8fbff', 0.3) },
  uWaterTop: { value: DAY.top.clone() },
  uWaterMid: { value: DAY.mid.clone() },
  uWaterDeep: { value: DAY.deep.clone() },
  uSunGlow: { value: DAY.glow.clone() },
  uFogDensity: { value: 0 },
  uSunDir: { value: new THREE.Vector3(-0.4, 1, 0.75).normalize() },
  uCausticsStrength: { value: 0.55 },
};

export function inStudio(material) {
  Object.assign(material.uniforms, STUDIO);
  // big on screen, the eyes' sparkle would bloom over the pupils
  if (material.uniforms.uGlint) material.uniforms.uGlint = { value: 1.0 };
  return material;
}
