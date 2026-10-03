// A school of little silver fish swirling in a ball in the open sea. One instanced mesh:
// every fish runs its own lap round the school's centre in the vertex shader, so the CPU only
// moves the centre. They flash silver as they turn and scatter when something big swims
// through them or a finger taps them — then swirl back together.

import * as THREE from 'three';
import { PRELUDE } from '../glsl/common.js';
import { withShared, U } from '../core/uniforms.js';
import { mulberry32, rand } from '../util/rng.js';

const COUNT = 140;
const SCATTERS = 4;

const VERT = /* glsl */ `
${PRELUDE}
attribute vec4 aLap;   // radius, height, angular speed, phase
attribute vec4 aTilt;  // tilt of the lap round x, round z, size, seed
uniform vec3 uCenter;
uniform vec4 uScatter[${SCATTERS}]; // xyz + time of a scare
varying vec3 vWpos;
varying vec3 vNormal;
varying float vSide;
vec3 rotX(vec3 p, float a) { float c = cos(a); float s = sin(a); return vec3(p.x, c * p.y - s * p.z, s * p.y + c * p.z); }
vec3 rotZ(vec3 p, float a) { float c = cos(a); float s = sin(a); return vec3(c * p.x - s * p.y, s * p.x + c * p.y, p.z); }
void main() {
  float ang = aLap.w + uTime * aLap.z;
  float r = aLap.x * (1.0 + 0.14 * sin(uTime * 0.6 + aTilt.w * 6.28));
  vec3 lap = vec3(cos(ang) * r, aLap.y + sin(ang * 2.0 + aTilt.w * 9.0) * 0.18, sin(ang) * r);
  vec3 dir = vec3(-sin(ang), cos(ang * 2.0 + aTilt.w * 9.0) * 0.36 / max(r, 0.3), cos(ang)) * sign(aLap.z);
  lap = rotZ(rotX(lap, aTilt.x), aTilt.y);
  dir = normalize(rotZ(rotX(dir, aTilt.x), aTilt.y));
  vec3 c = uCenter + lap;
  // scared: dart away from the fright, then drift back into the swirl
  for (int i = 0; i < ${SCATTERS}; i++) {
    vec4 s = uScatter[i];
    float age = uTime - s.w;
    if (age < 0.0 || age > 5.0) continue;
    vec3 d = c - s.xyz;
    float k = exp(-dot(d, d) / 7.0) * smoothstep(0.0, 0.25, age) * exp(-age * 0.9);
    vec3 away = normalize(d + vec3(0.0, 0.1, 0.0));
    c += away * k * 3.2;
    dir = normalize(mix(dir, away, min(k * 1.6, 0.9)));
  }
  vec3 side = normalize(cross(vec3(0.0, 1.0, 0.0), dir));
  vec3 up = cross(dir, side);
  vec3 p = position * aTilt.z;
  // a quick little tail wiggle
  p.z += sin(uTime * 15.0 + aTilt.w * 40.0) * 0.06 * aTilt.z * smoothstep(0.0, -0.14, position.x);
  vec3 wp = c + dir * p.x + up * p.y + side * p.z;
  vWpos = wp;
  vNormal = normalize(dir * normal.x + up * normal.y + side * normal.z);
  vSide = position.y;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}
`;

const FRAG = /* glsl */ `
${PRELUDE}
varying vec3 vWpos;
varying vec3 vNormal;
varying float vSide;
void main() {
  vec3 N = normalize(vNormal);
  if (!gl_FrontFacing) N = -N;
  vec3 V = normalize(cameraPosition - vWpos);
  // blue-grey back, silver flanks, a white belly
  vec3 alb = mix(vec3(0.62, 0.72, 0.8), vec3(0.2, 0.36, 0.55), smoothstep(0.0, 0.03, vSide));
  alb = mix(alb, vec3(0.92, 0.95, 1.0), smoothstep(0.0, -0.03, vSide));
  vec3 col = softShade(alb, N, V, vWpos, 0.6, 0.2, 20.0, 0.3, 0.6);
  // the flash of a turning school
  float flash = pow(max(dot(reflect(-V, N), uSunDir), 0.0), 10.0);
  col += mix(vec3(1.0, 0.98, 0.9), vec3(0.6, 0.85, 1.0), uNight) * flash * mix(1.3, 0.45, uNight);
  col = applyFog(col, vWpos);
  gl_FragColor = vec4(col, 1.0);
}
`;

// A tiny fish: a lens-shaped body and a forked tail (x forward, y up).
function fishGeometry() {
  const pos = [
    0.16, 0, 0, // 0 nose
    0.02, 0.045, 0, // 1 back
    0.02, -0.04, 0, // 2 belly
    0.02, 0, 0.022, // 3 left
    0.02, 0, -0.022, // 4 right
    -0.11, 0, 0, // 5 tail root
    -0.18, 0.05, 0, // 6 tail top
    -0.18, -0.05, 0, // 7 tail bottom
  ];
  const idx = [0, 1, 3, 0, 3, 2, 0, 4, 1, 0, 2, 4, 5, 3, 1, 5, 2, 3, 5, 1, 4, 5, 4, 2, 5, 6, 7];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

const _home = new THREE.Vector3();

export class Sardines {
  constructor(home, roam) {
    this.home = home.clone(); // where the school likes to be, and how far it roams
    this.roam = roam.clone();
    this.center = home.clone();
    this.scatters = Array.from({ length: SCATTERS }, () => new THREE.Vector4(0, -100, 0, -100));
    this.cursor = 0;
    this.lastScare = -1e9;
    const geo = new THREE.InstancedBufferGeometry().copy(fishGeometry());
    geo.instanceCount = COUNT;
    const lap = new Float32Array(COUNT * 4);
    const tilt = new Float32Array(COUNT * 4);
    const r = mulberry32(5150);
    for (let i = 0; i < COUNT; i++) {
      const radius = 0.5 + Math.sqrt(r()) * 1.9;
      // most of them go round the same way; the speed falls off a little towards the edge
      lap.set([radius, rand(r, -1.0, 1.0), (r() < 0.92 ? 1 : -1) * rand(r, 0.55, 0.85) / Math.sqrt(radius), r() * Math.PI * 2], i * 4);
      tilt.set([rand(r, -0.35, 0.35), rand(r, -0.3, 0.3), rand(r, 1.7, 2.3), r()], i * 4);
    }
    geo.setAttribute('aLap', new THREE.InstancedBufferAttribute(lap, 4));
    geo.setAttribute('aTilt', new THREE.InstancedBufferAttribute(tilt, 4));
    this.material = new THREE.ShaderMaterial({
      name: 'Sardines',
      uniforms: withShared({ uCenter: { value: this.center }, uScatter: { value: this.scatters } }),
      vertexShader: VERT,
      fragmentShader: FRAG,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
  }

  // Something gave them a fright at p (a tap, a dolphin swimming through).
  scare(p) {
    this.scatters[this.cursor].set(p.x, p.y, p.z, U.uTime.value);
    this.cursor = (this.cursor + 1) % SCATTERS;
    this.lastScare = U.uTime.value;
  }

  update(t) {
    // the school drifts slowly round its favourite stretch of water
    _home.set(Math.sin(t * 0.045) * this.roam.x, Math.sin(t * 0.07 + 1.3) * this.roam.y, Math.sin(t * 0.031 + 0.6) * this.roam.z);
    this.center.copy(this.home).add(_home);
  }
}
