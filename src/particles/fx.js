// Effect sprites — hearts, stars, sparkles, glow dots, rings, confetti and sand puffs —
// as GPU particles: spawn data in instance attributes, motion and shapes in the shaders
// (pop-in with overshoot, drag, gravity, spin, fade). A depth-only twin writes the solid
// cores so depth of field treats them like real objects.

import * as THREE from 'three';
import { PRELUDE, GLSL_BILLBOARD } from '../glsl/common.js';
import { withShared, U } from '../core/uniforms.js';

const MAX = 768;
export const SHAPE = { HEART: 0, STAR: 1, SPARKLE: 2, DOT: 3, RING: 4, CONFETTI: 5, DUST: 6 };

const VERT = /* glsl */ `
${PRELUDE}
${GLSL_BILLBOARD}
attribute vec4 aStart;  // x, y, z, birth
attribute vec4 aVel;    // vx, vy, vz, life
attribute vec4 aParams; // size, spin, gravity, shape
attribute vec4 aColor;  // r, g, b, drag
varying vec2 vUv;
varying float vFade;
varying float vShape;
varying vec3 vColor;
varying vec3 vWpos;
varying float vAge;
void main() {
  float age = uTime - aStart.w;
  float life = aVel.w;
  float alive = step(0.0, age) * step(age, life);
  float drag = max(aColor.a, 0.001);
  vec3 p = aStart.xyz + aVel.xyz * (1.0 - exp(-drag * age)) / drag;
  p.y += 0.5 * aParams.z * age * age;
  float shape = aParams.w;
  float k = clamp(age / 0.22, 0.0, 1.0) - 1.0;
  float pop = 1.0 + 2.70158 * k * k * k + 1.70158 * k * k;     // easeOutBack
  float fade = 1.0 - smoothstep(life * 0.62, life, age);
  float size = aParams.x * pop * alive;
  if (shape > 3.5 && shape < 4.5) size = aParams.x * (0.3 + age * 3.2) * alive;   // rings grow
  if (shape > 5.5) size *= 1.0 + age * 1.1;                                       // dust spreads
  if (shape > 1.5 && shape < 2.5) size *= 0.8 + 0.35 * sin(age * 14.0 + aStart.x * 9.0); // twinkle
  float a = aParams.y * age;
  float c = cos(a);
  float s = sin(a);
  vec2 q = vec2(c * position.x - s * position.y, s * position.x + c * position.y);
  vec3 wp = p + (camRight() * q.x + camUp() * q.y) * size;
  vUv = uv;
  vFade = fade * alive;
  vShape = shape;
  vColor = aColor.rgb;
  vWpos = wp;
  vAge = age;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}
`;

const SHAPES = /* glsl */ `
${PRELUDE}
varying vec2 vUv;
varying float vFade;
varying float vShape;
varying vec3 vColor;
varying vec3 vWpos;
varying float vAge;

float dot2(vec2 v) { return dot(v, v); }
float sdHeart(vec2 p) {
  p.x = abs(p.x);
  if (p.y + p.x > 1.0) return sqrt(dot2(p - vec2(0.25, 0.75))) - sqrt(2.0) / 4.0;
  return sqrt(min(dot2(p - vec2(0.0, 1.0)), dot2(p - 0.5 * max(p.x + p.y, 0.0)))) * sign(p.x - p.y);
}
float sdStar5(vec2 p, float r, float rf) {
  const vec2 k1 = vec2(0.809016994375, -0.587785252292);
  const vec2 k2 = vec2(-k1.x, k1.y);
  p.x = abs(p.x);
  p -= 2.0 * max(dot(k1, p), 0.0) * k1;
  p -= 2.0 * max(dot(k2, p), 0.0) * k2;
  p.x = abs(p.x);
  p.y -= r;
  vec2 ba = rf * vec2(-k1.y, k1.x) - vec2(0.0, 1.0);
  float h = clamp(dot(p, ba) / dot(ba, ba), 0.0, r);
  return length(p - ba * h) * sign(p.y * ba.x - p.x * ba.y);
}

// Returns premultiplied colour + alpha for the current shape.
vec4 shapeColor() {
  vec2 p = vUv * 2.0 - 1.0;
  float aa = 0.04;
  vec3 col = vColor;
  float a = 0.0;
  if (vShape < 0.5) {                                   // heart sticker
    float d = sdHeart(p * 0.66 + vec2(0.0, 0.55)) / 0.66;  // heart fills the quad
    a = smoothstep(aa, -aa, d - 0.04);
    float rim = smoothstep(-0.02, -0.08, d);
    col = mix(vec3(1.2), col * (1.05 + 0.25 * p.y), rim);
    col += vec3(1.0) * smoothstep(0.12, 0.0, length(p - vec2(-0.32, 0.25))) * 0.7;
  } else if (vShape < 1.5) {                            // star sticker
    float d = sdStar5(p * 1.15, 0.78, 0.48);
    a = smoothstep(aa, -aa, d - 0.05);
    float rim = smoothstep(-0.02, -0.08, d);
    col = mix(vec3(1.25), col * (1.1 + 0.2 * p.y), rim);
  } else if (vShape < 2.5) {                            // twinkly sparkle (bright → bloom)
    vec2 q = abs(p);
    float s = max(1.0 - (q.x * 7.0 + q.y), 0.0) + max(1.0 - (q.y * 7.0 + q.x), 0.0);
    float glow = exp(-dot(p, p) * 9.0);
    a = clamp(s * s + glow * 0.7, 0.0, 1.0);
    col = mix(col, vec3(1.0), 0.5) * 2.2;
  } else if (vShape < 3.5) {                            // soft glow dot
    float g = exp(-dot(p, p) * 5.0);
    a = g;
    col *= 1.8;
  } else if (vShape < 4.5) {                            // ring
    float d = abs(length(p) - 0.8);
    a = smoothstep(0.12, 0.02, d) * 0.85;
    col *= 1.3;
  } else if (vShape < 5.5) {                            // confetti
    vec2 q = abs(p * vec2(1.0, 1.8));
    float d = max(q.x, q.y) - 0.7;
    a = smoothstep(aa, -aa, d);
    col *= 1.1 + 0.2 * sin(vAge * 12.0);
  } else {                                              // sand dust
    float g = exp(-dot(p, p) * 2.6) * (0.75 + 0.25 * sin(p.x * 7.0 + vAge * 3.0) * sin(p.y * 6.0));
    a = g * 0.6;
    col *= uKeyColor * 0.9 + uSkyAmb * 0.3;
  }
  a *= vFade;
  float f = fogFactor(length(vWpos - cameraPosition));
  a *= 1.0 - f * 0.8;
  return vec4(col * a, a);
}
`;

const FRAG = /* glsl */ `
${SHAPES}
void main() {
  vec4 c = shapeColor();
  if (c.a < 0.003) discard;
  gl_FragColor = c;
}
`;

const DEPTH_FRAG = /* glsl */ `
${SHAPES}
void main() {
  vec4 c = shapeColor();
  if (c.a < 0.55 || vShape > 1.5) discard;   // only solid hearts and stars write depth
  gl_FragColor = vec4(0.0);
}
`;

const _c = new THREE.Color();

export class Fx {
  constructor() {
    const quad = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = quad.index;
    geo.setAttribute('position', quad.attributes.position);
    geo.setAttribute('uv', quad.attributes.uv);
    const mk = (n) => {
      const a = new THREE.InstancedBufferAttribute(new Float32Array(MAX * n), n);
      a.setUsage(THREE.DynamicDrawUsage);
      return a;
    };
    this.aStart = mk(4);
    this.aVel = mk(4);
    this.aParams = mk(4);
    this.aColor = mk(4);
    for (let i = 0; i < MAX; i++) this.aStart.setW(i, -1000);
    geo.setAttribute('aStart', this.aStart);
    geo.setAttribute('aVel', this.aVel);
    geo.setAttribute('aParams', this.aParams);
    geo.setAttribute('aColor', this.aColor);
    geo.instanceCount = MAX;
    const blend = {
      transparent: true,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
    };
    this.mesh = new THREE.Mesh(geo, new THREE.ShaderMaterial({ name: 'Fx', uniforms: withShared(), vertexShader: VERT, fragmentShader: FRAG, ...blend }));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 8;
    this.depthMesh = new THREE.Mesh(geo, new THREE.ShaderMaterial({ name: 'FxDepth', uniforms: withShared(), vertexShader: VERT, fragmentShader: DEPTH_FRAG, transparent: true, colorWrite: false, depthWrite: true }));
    this.depthMesh.frustumCulled = false;
    this.depthMesh.renderOrder = -4;
    this.cursor = 0;
    this.dirty = false;
    this.spawned = 0;
  }

  get objects() {
    return [this.depthMesh, this.mesh];
  }

  spawn(shape, x, y, z, { vx = 0, vy = 0, vz = 0, life = 1.4, size = 0.4, spin = 0, gravity = 0, drag = 1.5, color = '#ffffff', delay = 0 } = {}) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % MAX;
    _c.set(color);
    this.aStart.setXYZW(i, x, y, z, U.uTime.value + delay);
    this.aVel.setXYZW(i, vx, vy, vz, life);
    this.aParams.setXYZW(i, size, spin, gravity, shape);
    this.aColor.setXYZW(i, _c.r, _c.g, _c.b, drag);
    this.dirty = true;
    this.spawned++;
  }

  // Hearts and stars bursting out of a happy fish.
  love(p, count = 5) {
    const colors = ['#ff5d8f', '#ff7aa8', '#ffd23f', '#ff9ecf'];
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + Math.random() * 0.6;
      const star = i % 3 === 2;
      this.spawn(star ? SHAPE.STAR : SHAPE.HEART, p.x, p.y + 0.2, p.z + 0.4, {
        vx: Math.cos(a) * 2.4,
        vy: 2.0 + Math.random() * 1.6,
        vz: Math.sin(a) * 0.7,
        life: 1.7 + Math.random() * 0.5,
        size: 0.62 + Math.random() * 0.26,
        spin: (Math.random() - 0.5) * 2,
        gravity: 0.4,
        drag: 2.2,
        color: star ? '#ffd23f' : colors[i % 2],
        delay: i * 0.03,
      });
    }
    this.sparkles(p, 6, 0.8);
  }

  sparkles(p, count = 8, spread = 1, color = '#fff2b0') {
    for (let i = 0; i < count; i++) {
      this.spawn(SHAPE.SPARKLE, p.x + (Math.random() - 0.5) * spread, p.y + (Math.random() - 0.5) * spread, p.z + (Math.random() - 0.5) * 0.4, {
        vx: (Math.random() - 0.5) * 1.2,
        vy: Math.random() * 1.2,
        life: 0.7 + Math.random() * 0.6,
        size: 0.22 + Math.random() * 0.2,
        drag: 2,
        color,
        delay: Math.random() * 0.15,
      });
    }
  }

  ring(p, color = '#bff6ff', size = 0.5) {
    this.spawn(SHAPE.RING, p.x, p.y, p.z, { life: 0.9, size, drag: 1, color });
  }

  glowDots(p, count = 10, color = '#5ff8ff') {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 0.6 + Math.random() * 1.4;
      this.spawn(SHAPE.DOT, p.x, p.y, p.z, { vx: Math.cos(a) * s, vy: Math.sin(a) * s, vz: (Math.random() - 0.5) * 0.6, life: 1.4 + Math.random(), size: 0.2 + Math.random() * 0.18, drag: 1.8, color });
    }
  }

  dust(p, count = 7) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      this.spawn(SHAPE.DUST, p.x, p.y + 0.1, p.z, { vx: Math.cos(a) * 0.9, vy: 0.4 + Math.random() * 0.5, vz: Math.sin(a) * 0.5, life: 1.6 + Math.random() * 0.6, size: 0.45 + Math.random() * 0.3, drag: 1.6, gravity: -0.15, color: '#f3dcb0' });
    }
  }

  confetti(p, count = 24) {
    const colors = ['#ff5d8f', '#ffd23f', '#3fa9ff', '#35d07f', '#9b6bff', '#ff8a3d'];
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 1.5 + Math.random() * 2.5;
      this.spawn(SHAPE.CONFETTI, p.x, p.y, p.z, { vx: Math.cos(a) * s, vy: Math.sin(a) * s + 1.5, vz: (Math.random() - 0.5) * 1.5, life: 2.2 + Math.random(), size: 0.16 + Math.random() * 0.1, spin: (Math.random() - 0.5) * 10, gravity: -1.2, drag: 1.4, color: colors[i % colors.length] });
    }
  }

  update() {
    if (!this.dirty) return;
    this.aStart.needsUpdate = true;
    this.aVel.needsUpdate = true;
    this.aParams.needsUpdate = true;
    this.aColor.needsUpdate = true;
    this.dirty = false;
  }
}
