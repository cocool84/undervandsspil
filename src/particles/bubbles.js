// GPU bubbles. Spawn data lives in instance attributes; the shader computes the rise,
// wobble, squash and the pop at the surface. The CPU only writes when bubbles are born.
// A depth-only twin writes the solid core so depth of field treats bubbles correctly.

import * as THREE from 'three';
import { PRELUDE, GLSL_BILLBOARD } from '../glsl/common.js';
import { withShared, U } from '../core/uniforms.js';

const MAX = 512;

const VERT = /* glsl */ `
${PRELUDE}
${GLSL_BILLBOARD}
attribute vec4 aStart;   // x, y, z, birth time
attribute vec4 aParams;  // size, rise speed, wobble, seed
varying vec2 vUv;
varying float vFade;
varying vec3 vWpos;
varying float vSeed;
void main() {
  float age = uTime - aStart.w;
  float size = aParams.x;
  float speed = aParams.y;
  float wob = aParams.z;
  float seed = aParams.w;
  float y = aStart.y + speed * age + 0.1 * age * age;
  float sway = min(age * 1.5, 1.0);
  vec3 c = vec3(
    aStart.x + sin(age * (2.2 + seed * 2.0) + seed * 6.28) * wob * sway,
    y,
    aStart.z + cos(age * (1.7 + seed) + seed * 3.0) * wob * 0.6 * sway
  );
  float grow = smoothstep(0.0, 0.22, age);
  float top = 1.0 - smoothstep(uSurfaceY - 0.7, uSurfaceY - 0.1, y);
  float alive = step(0.0, age) * step(age, 25.0);
  float s = size * (0.8 + 0.2 * grow + 0.15 * min(age, 3.0) / 3.0) * grow * top * alive;
  float sq = 1.0 + 0.09 * sin(age * 11.0 + seed * 20.0);
  vec3 wp = c + (camRight() * position.x * sq + camUp() * position.y / sq) * s;
  vUv = uv;
  vWpos = wp;
  vFade = alive * top;
  vSeed = seed;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}
`;

const SHADE = /* glsl */ `
${PRELUDE}
varying vec2 vUv;
varying float vFade;
varying vec3 vWpos;
varying float vSeed;
float bubbleAlpha(vec2 p, float r, out vec3 col) {
  float rim = smoothstep(0.6, 0.96, r) * (1.0 - smoothstep(0.96, 1.0, r));
  vec3 irid = 0.55 + 0.45 * cos(6.2831 * (vec3(0.0, 0.33, 0.67) + r * 1.3 + p.x * 0.4 + vSeed + uTime * 0.15));
  float hl = smoothstep(0.3, 0.1, length(p - vec2(-0.38, 0.42)));
  float hl2 = smoothstep(0.14, 0.04, length(p - vec2(0.4, -0.36)));
  vec3 tint = mix(vec3(0.78, 0.96, 1.0), irid, 0.45);
  col = tint * (rim * 1.15 + 0.05) + vec3(1.25) * hl + vec3(0.9) * hl2;
  col *= 0.55 + 0.6 * (uKeyColor + uSkyAmb * 0.5);
  col += vec3(0.25, 0.95, 1.15) * uNight * rim * 0.7;
  float a = clamp(rim * 0.85 + 0.05 + hl + hl2 * 0.8, 0.0, 1.0) * vFade;
  return a;
}
`;

const FRAG = /* glsl */ `
${SHADE}
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  if (r > 1.0) discard;
  vec3 col;
  float a = bubbleAlpha(p, r, col);
  float f = fogFactor(length(vWpos - cameraPosition));
  a *= 1.0 - f * 0.85;
  gl_FragColor = vec4(col * a, a);
}
`;

const DEPTH_FRAG = /* glsl */ `
${SHADE}
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  if (r > 1.0) discard;
  vec3 col;
  float a = bubbleAlpha(p, r, col);
  if (a < 0.5) discard;
  gl_FragColor = vec4(0.0);
}
`;

export class Bubbles {
  constructor() {
    const quad = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = quad.index;
    geo.setAttribute('position', quad.attributes.position);
    geo.setAttribute('uv', quad.attributes.uv);
    const start = new Float32Array(MAX * 4);
    for (let i = 0; i < MAX; i++) start[i * 4 + 3] = -1000;
    this.aStart = new THREE.InstancedBufferAttribute(start, 4);
    this.aParams = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 4), 4);
    this.aStart.setUsage(THREE.DynamicDrawUsage);
    this.aParams.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aStart', this.aStart);
    geo.setAttribute('aParams', this.aParams);
    geo.instanceCount = MAX;

    this.material = new THREE.ShaderMaterial({
      name: 'Bubbles',
      uniforms: withShared(),
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
    });
    this.depthMaterial = new THREE.ShaderMaterial({
      name: 'BubblesDepth',
      uniforms: withShared(),
      vertexShader: VERT,
      fragmentShader: DEPTH_FRAG,
      transparent: true,
      colorWrite: false,
      depthWrite: true,
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    this.depthMesh = new THREE.Mesh(geo, this.depthMaterial);
    this.depthMesh.frustumCulled = false;
    this.depthMesh.renderOrder = -5;
    this.cursor = 0;
    this.dirty = false;
  }

  get objects() {
    return [this.depthMesh, this.mesh];
  }

  spawn(x, y, z, size = 0.12, speed = 1.3, wobble = 0.08, seed = Math.random()) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % MAX;
    this.aStart.setXYZW(i, x, y, z, U.uTime.value);
    this.aParams.setXYZW(i, size, speed, wobble, seed);
    this.dirty = true;
    return { index: i, birth: this.aStart.getW(i) }; // as stored (float32), so isAlive can compare
  }

  // Pop a bubble before it reaches the surface.
  kill(i) {
    this.aStart.setW(i, -1000);
    this.dirty = true;
  }

  isAlive(i, birth) {
    return this.aStart.getW(i) === birth;
  }

  burst(x, y, z, count, spread = 0.3, sizeMin = 0.06, sizeMax = 0.2) {
    for (let i = 0; i < count; i++) {
      const s = sizeMin + Math.random() * (sizeMax - sizeMin);
      this.spawn(
        x + (Math.random() - 0.5) * spread * 2,
        y + (Math.random() - 0.5) * spread,
        z + (Math.random() - 0.5) * spread * 2,
        s,
        0.9 + Math.random() * 0.9 + s * 2,
        0.04 + Math.random() * 0.12,
      );
    }
  }

  update() {
    if (!this.dirty) return;
    this.aStart.needsUpdate = true;
    this.aParams.needsUpdate = true;
    this.dirty = false;
  }
}
