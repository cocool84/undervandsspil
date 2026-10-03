// Jellyfish drifting in the background: pulsing translucent bells with glowing "organs"
// and waving tentacles. At night they glow in pastel neon.

import * as THREE from 'three';
import { PRELUDE, GLSL_BILLBOARD } from '../glsl/common.js';
import { withShared } from '../core/uniforms.js';
import { Spring } from '../util/math.js';

export const JELLY_COUNT = 4;
const TENTACLES_PER = 11; // 7 thin tentacles + 4 frilly arms

const BELL_VERT = /* glsl */ `
${PRELUDE}
attribute vec4 aJelly;   // phase, size, glow hue, index
attribute vec3 aColor;
uniform vec4 uJellyPulse[${JELLY_COUNT}]; // pulse value, squish, flash, -
varying vec3 vWpos;
varying vec3 vNormal;
varying vec3 vLocal;
varying vec3 vColor;
varying float vGlowHue;
varying float vFlash;
void main() {
  vec4 pu = uJellyPulse[int(aJelly.w + 0.5)];
  float pulse = pu.x;
  float rimness = smoothstep(0.15, 1.0, 1.0 - position.y / 0.85);
  vec3 p = position;
  float radial = 1.0 - 0.16 * pulse * rimness + pu.y * 0.2;
  p.xz *= radial;
  p.y *= 1.0 + 0.1 * pulse - pu.y * 0.25;
  p.y -= rimness * rimness * 0.06 * pulse;
  vec4 wp = instanceMatrix * vec4(p, 1.0);
  vWpos = wp.xyz;
  vNormal = normalize(mat3(instanceMatrix) * normal);
  vLocal = position;
  vColor = aColor;
  vGlowHue = aJelly.z;
  vFlash = pu.z;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const BELL_FRAG = /* glsl */ `
${PRELUDE}
varying vec3 vWpos;
varying vec3 vNormal;
varying vec3 vLocal;
varying vec3 vColor;
varying float vGlowHue;
varying float vFlash;
void main() {
  vec3 N = normalize(vNormal);
  if (!gl_FrontFacing) N = -N;
  vec3 V = normalize(cameraPosition - vWpos);
  float fr = pow(1.0 - abs(dot(N, V)), 2.2);
  float ang = atan(vLocal.z, vLocal.x);
  float rr = length(vLocal.xz);
  float lobes = smoothstep(0.5, 0.9, cos(ang * 4.0 + 0.6)) * smoothstep(0.78, 0.3, rr) * smoothstep(0.08, 0.3, rr);
  float canals = smoothstep(0.93, 1.0, cos(ang * 8.0)) * smoothstep(0.2, 0.9, rr) * 0.5;
  float rim = smoothstep(0.82, 1.0, rr);
  vec3 base = vColor;
  vec3 col = base * (0.35 + 0.75 * fr) + base * lobes * 0.75 + vec3(1.0) * canals * 0.18 + vec3(1.0, 0.9, 1.0) * rim * 0.18;
  col *= uSkyAmb * 0.9 + uKeyColor * 0.55;
  vec3 glowCol = mix(vec3(0.35, 1.6, 2.0), vec3(2.0, 0.55, 1.7), vGlowHue);
  float pulse = 0.7 + 0.3 * sin(uTime * 1.8 + vGlowHue * 9.0);
  col += glowCol * (uNight * (0.25 + fr * 0.9 + lobes * 1.1) * pulse + vFlash * (0.6 + lobes));
  float a = clamp(0.2 + 0.55 * fr + 0.4 * lobes + canals * 0.2 + rim * 0.15, 0.0, 0.92);
  float f = fogFactor(length(vWpos - cameraPosition));
  col = mix(col, waterColor(normalize(vWpos - cameraPosition)), f * 0.85);
  a *= 1.0 - f * 0.55;
  gl_FragColor = vec4(col * a, a);
}
`;

const TENT_VERT = /* glsl */ `
${PRELUDE}
${GLSL_BILLBOARD}
attribute vec4 aTent;   // jelly index, angle, length, kind (0 thin, 1 frilly arm)
attribute vec3 aColor;
uniform vec4 uJellyPos[${JELLY_COUNT}];   // xyz, size
uniform vec4 uJellyPulse[${JELLY_COUNT}];
uniform vec4 uJellyVel[${JELLY_COUNT}];
varying vec2 vUv;
varying vec3 vWpos;
varying vec3 vColor;
varying float vKind;
varying float vFlash;
void main() {
  int j = int(aTent.x + 0.5);
  vec4 jp = uJellyPos[j];
  vec4 pu = uJellyPulse[j];
  float size = jp.w;
  float kind = aTent.w;
  float along = -position.y;            // 0 at the bell … 1 at the tip
  float rr = (kind > 0.5 ? 0.28 : 0.86) * size * (1.0 - 0.14 * pu.x);
  vec3 anchor = jp.xyz + vec3(cos(aTent.y) * rr, -0.02 * size, sin(aTent.y) * rr);
  float len = aTent.z * size;
  float t = uTime;
  vec3 c = anchor + vec3(0.0, -along * len, 0.0);
  float wave = sin(along * 6.0 - t * 2.2 + aTent.y * 3.0) * 0.16 * along;
  c.x += wave * size + sin(t * 0.7 + aTent.y) * 0.08 * along * size;
  c.z += cos(along * 5.0 - t * 1.8 + aTent.y * 2.0) * 0.12 * along * size;
  // trail behind the movement
  c -= uJellyVel[j].xyz * along * along * 1.2;
  vec3 side = normalize(cross(vec3(0.0, 1.0, 0.0), normalize(cameraPosition - c)));
  float w = (kind > 0.5 ? 0.16 * (1.0 - along * 0.6) * (0.75 + 0.25 * sin(along * 30.0 - t * 3.0)) : 0.035 * (1.0 - along * 0.8)) * size;
  vec3 wp = c + side * position.x * w * 2.0;
  vUv = vec2(position.x + 0.5, along);
  vWpos = wp;
  vColor = aColor;
  vKind = kind;
  vFlash = pu.z;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}
`;

const TENT_FRAG = /* glsl */ `
${PRELUDE}
varying vec2 vUv;
varying vec3 vWpos;
varying vec3 vColor;
varying float vKind;
varying float vFlash;
void main() {
  float edge = 1.0 - abs(vUv.x * 2.0 - 1.0);
  float a = smoothstep(0.0, 0.6, edge) * (1.0 - smoothstep(0.7, 1.0, vUv.y)) * (vKind > 0.5 ? 0.55 : 0.75);
  vec3 col = vColor * (uSkyAmb * 0.9 + uKeyColor * 0.5) * 1.1;
  col += mix(vec3(0.35, 1.5, 1.9), vec3(1.9, 0.6, 1.6), vKind) * (uNight * 0.7 + vFlash) * (1.0 - vUv.y * 0.6);
  float f = fogFactor(length(vWpos - cameraPosition));
  col = mix(col, waterColor(normalize(vWpos - cameraPosition)), f * 0.85);
  a *= 1.0 - f * 0.55;
  gl_FragColor = vec4(col * a, a);
}
`;

function bellGeometry() {
  const pts = [];
  const N = 16;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const a = t * Math.PI * 0.5;
    let r = Math.sin(a);
    let y = Math.cos(a) * 0.85;
    if (t > 0.82) {
      r += (t - 0.82) * 0.3;
      y -= (t - 0.82) * 0.5;
    }
    pts.push(new THREE.Vector2(Math.max(r, 0.0001), y));
  }
  const g = new THREE.LatheGeometry(pts, 30);
  g.deleteAttribute('uv');
  return g;
}

const COLORS = ['#ffb3ee', '#ffc8a8', '#cdb8ff', '#a8f0ff'];

const premultiplied = {
  transparent: true,
  depthWrite: true,
  blending: THREE.CustomBlending,
  blendEquation: THREE.AddEquation,
  blendSrc: THREE.OneFactor,
  blendDst: THREE.OneMinusSrcAlphaFactor,
};

export class Jellyfish {
  constructor() {
    this.jellies = [];
    const homes = [
      [-6.0, 9.5, -9, 1.0],
      [6.5, 11.0, -13, 1.25],
      [0.8, 12.5, -18, 1.5],
      [-11, 8.0, -15, 1.2],
    ];
    for (let i = 0; i < JELLY_COUNT; i++) {
      const [x, y, z, size] = homes[i];
      this.jellies.push({
        home: new THREE.Vector3(x, y, z),
        pos: new THREE.Vector3(x, y, z),
        vel: new THREE.Vector3(),
        size,
        phase: Math.random() * Math.PI * 2,
        freq: 0.55 + Math.random() * 0.2,
        squish: new Spring(0, 140, 8),
        flash: 0,
        wander: Math.random() * 100,
      });
    }

    this.pulseU = Array.from({ length: JELLY_COUNT }, () => new THREE.Vector4());
    this.posU = Array.from({ length: JELLY_COUNT }, () => new THREE.Vector4());
    this.velU = Array.from({ length: JELLY_COUNT }, () => new THREE.Vector4());

    // bells
    const bell = bellGeometry();
    const jattr = new Float32Array(JELLY_COUNT * 4);
    const cattr = new Float32Array(JELLY_COUNT * 3);
    const c = new THREE.Color();
    for (let i = 0; i < JELLY_COUNT; i++) {
      jattr.set([this.jellies[i].phase, this.jellies[i].size, i % 2, i], i * 4);
      c.set(COLORS[i % COLORS.length]);
      cattr.set([c.r, c.g, c.b], i * 3);
    }
    bell.setAttribute('aJelly', new THREE.InstancedBufferAttribute(jattr, 4));
    bell.setAttribute('aColor', new THREE.InstancedBufferAttribute(cattr, 3));
    this.bellMat = new THREE.ShaderMaterial({
      name: 'JellyBell',
      uniforms: withShared({ uJellyPulse: { value: this.pulseU } }),
      vertexShader: BELL_VERT,
      fragmentShader: BELL_FRAG,
      side: THREE.DoubleSide,
      ...premultiplied,
    });
    this.bells = new THREE.InstancedMesh(bell, this.bellMat, JELLY_COUNT);
    this.bells.frustumCulled = false;
    this.bells.renderOrder = 3;

    // tentacles
    const strip = new THREE.PlaneGeometry(1, 1, 1, 14);
    strip.translate(0, -0.5, 0);
    const count = JELLY_COUNT * TENTACLES_PER;
    const tattr = new Float32Array(count * 4);
    const tcol = new Float32Array(count * 3);
    let k = 0;
    for (let i = 0; i < JELLY_COUNT; i++) {
      c.set(COLORS[i % COLORS.length]);
      for (let j = 0; j < TENTACLES_PER; j++) {
        const frilly = j >= 7;
        const angle = frilly ? (j - 7) * (Math.PI / 2) + 0.4 : (j / 7) * Math.PI * 2;
        const len = frilly ? 1.3 + Math.random() * 0.5 : 2.0 + Math.random() * 1.6;
        tattr.set([i, angle, len, frilly ? 1 : 0], k * 4);
        tcol.set([c.r, c.g, c.b], k * 3);
        k++;
      }
    }
    const tgeo = new THREE.InstancedBufferGeometry();
    tgeo.index = strip.index;
    tgeo.setAttribute('position', strip.attributes.position);
    tgeo.setAttribute('uv', strip.attributes.uv);
    tgeo.setAttribute('aTent', new THREE.InstancedBufferAttribute(tattr, 4));
    tgeo.setAttribute('aColor', new THREE.InstancedBufferAttribute(tcol, 3));
    tgeo.instanceCount = count;
    this.tentMat = new THREE.ShaderMaterial({
      name: 'JellyTentacles',
      uniforms: withShared({ uJellyPos: { value: this.posU }, uJellyPulse: { value: this.pulseU }, uJellyVel: { value: this.velU } }),
      vertexShader: TENT_VERT,
      fragmentShader: TENT_FRAG,
      side: THREE.DoubleSide,
      ...premultiplied,
    });
    this.tentacles = new THREE.Mesh(tgeo, this.tentMat);
    this.tentacles.frustumCulled = false;
    this.tentacles.renderOrder = 2;

    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._s = new THREE.Vector3();
  }

  get objects() {
    return [this.tentacles, this.bells];
  }

  poke(i) {
    const j = this.jellies[i];
    j.squish.kick(-4);
    j.vel.y += 1.6;
    j.flash = 1;
  }

  update(t, dt) {
    for (let i = 0; i < JELLY_COUNT; i++) {
      const j = this.jellies[i];
      const ph = t * j.freq * Math.PI * 2 + j.phase;
      const pulse = Math.max(0, Math.sin(ph)) ** 2;
      // thrust while contracting, otherwise sink slowly
      j.vel.y += (pulse * 0.55 - 0.16) * dt;
      j.vel.y += (j.home.y - j.pos.y) * 0.05 * dt;
      j.wander += dt * 0.07;
      j.vel.x += (Math.sin(j.wander * 2.1 + i) * 0.04 + (j.home.x - j.pos.x) * 0.02) * dt;
      j.vel.z += (Math.cos(j.wander * 1.7 + i * 2) * 0.03 + (j.home.z - j.pos.z) * 0.02) * dt;
      j.vel.multiplyScalar(Math.exp(-dt * 0.8));
      j.pos.addScaledVector(j.vel, dt);
      const squish = j.squish.update(dt);
      j.flash *= Math.exp(-dt * 2.2);
      this.pulseU[i].set(pulse, squish, j.flash, 0);
      this.posU[i].set(j.pos.x, j.pos.y, j.pos.z, j.size);
      this.velU[i].set(j.vel.x, j.vel.y, j.vel.z, 0);
      const tilt = Math.sin(t * 0.3 + i) * 0.12;
      this._q.setFromAxisAngle(this._s.set(Math.cos(i), 0, Math.sin(i)).normalize(), tilt);
      this._m.compose(j.pos, this._q, this._s.setScalar(j.size));
      this.bells.setMatrixAt(i, this._m);
    }
    this.bells.instanceMatrix.needsUpdate = true;
  }
}
