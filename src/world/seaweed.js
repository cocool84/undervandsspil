// Kelp ribbons and sea grass: instanced strips bent in the vertex shader. They sway with
// the current, twist, and lean away from touches and passing fish.

import * as THREE from 'three';
import { PRELUDE } from '../glsl/common.js';
import { withShared } from '../core/uniforms.js';
import { rand, pick } from '../util/rng.js';
import { TAU } from '../util/math.js';
import { sandHeight } from './sand.js';

export const MAX_PUSHERS = 8;

const VERT = /* glsl */ `
${PRELUDE}
attribute vec4 aParams;   // height, width, phase, stiffness
attribute vec3 aBase;
attribute vec3 aTip;
uniform vec4 uPushers[${MAX_PUSHERS}]; // xyz + radius: moving things that part the weed
varying vec2 vUv;
varying vec3 vWpos;
varying vec3 vN;
varying vec3 vColor;
varying float vY;
void main() {
  float y = position.y;
  float h = aParams.x;
  float ruffle = 0.72 + 0.28 * sin(y * 17.0 + aParams.z * 7.0);
  float leaf = mix(0.38, 1.0, sin(pow(y, 0.75) * 3.14159)) * (1.0 - smoothstep(0.82, 1.0, y) * 0.55);
  float w = aParams.y * leaf * ruffle;
  vec3 p = vec3(position.x * w, y * h, 0.0);
  float tw = y * 1.1 + aParams.z * 1.5;
  float c = cos(tw);
  float s = sin(tw);
  p.xz = vec2(c * p.x + s * p.z, -s * p.x + c * p.z);

  vec3 base = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  vec3 wp = (instanceMatrix * vec4(p, 1.0)).xyz;
  float t = uTime;
  float yy = y * y;
  float bendScale = (0.35 + h * 0.11) / aParams.w;
  vec2 sway = vec2(
    sin(t * 0.85 + aParams.z * 6.0 + y * 2.3 + base.x * 0.21),
    cos(t * 0.66 + aParams.z * 4.0 + y * 1.9)
  ) * vec2(0.5, 0.3) * yy * bendScale;
  sway.x += sin(t * 0.23 + base.z * 0.1) * 0.22 * yy * h * 0.15;

  // touches push the weed away with a springy wobble
  for (int i = 0; i < 4; i++) {
    vec4 tp = uTouches[i];
    float age = t - tp.w;
    if (age < 0.0 || age > 3.0) continue;
    vec2 d = base.xz - tp.xz;
    float dist2 = dot(d, d);
    float k = exp(-dist2 * 0.12) * exp(-age * 1.3) * (0.6 + 0.6 * sin(age * 7.0 + 1.2));
    sway += normalize(d + vec2(0.0001)) * k * yy * 1.4;
  }
  // fish and other movers part the weed
  for (int i = 0; i < ${MAX_PUSHERS}; i++) {
    vec4 pu = uPushers[i];
    if (pu.w <= 0.0) continue;
    vec3 d = wp - pu.xyz;
    float k = exp(-dot(d, d) / (pu.w * pu.w));
    sway += normalize(d.xz + vec2(0.0001)) * k * y * 0.8;
  }

  wp.xz += sway;
  wp.y -= dot(sway, sway) * 0.18;
  vWpos = wp;
  vY = y;
  vUv = uv;
  vN = normalize(mat3(instanceMatrix) * vec3(s, 0.0, c));
  vColor = mix(aBase, aTip, smoothstep(0.0, 1.0, y));
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}
`;

const FRAG = /* glsl */ `
${PRELUDE}
varying vec2 vUv;
varying vec3 vWpos;
varying vec3 vN;
varying vec3 vColor;
varying float vY;
void main() {
  vec3 N = normalize(vN);
  if (!gl_FrontFacing) N = -N;
  vec3 V = normalize(cameraPosition - vWpos);
  float vein = 1.0 - 0.22 * smoothstep(0.07, 0.0, abs(vUv.x - 0.5));
  vec3 alb = vColor * vein;
  vec3 col = softShade(alb, N, V, vWpos, 0.85, 0.08, 14.0, 0.2, 0.45);
  float trans = pow(max(dot(-N, uSunDir), 0.0), 1.5) * 0.35 + 0.16 * vY;
  col += alb * uKeyColor * trans * depthLight(vWpos);
  col = applyFog(col, vWpos);
  gl_FragColor = vec4(col, 1.0);
}
`;

const PALETTES = [
  ['#3c9a4f', '#c8f56a'], // kelp green
  ['#25917f', '#94f0cf'], // teal
  ['#9a7a2a', '#f7d66a'], // golden
  ['#c2405e', '#ffa7a0'], // red algae
];
const GRASS = ['#46a055', '#c8f77c'];

function stripGeometry(segments) {
  const g = new THREE.PlaneGeometry(1, 1, 1, segments);
  g.translate(0, 0.5, 0); // y from 0 to 1
  return g;
}

function buildMesh(material, segments, items) {
  const geo = stripGeometry(segments);
  const n = items.length;
  const params = new Float32Array(n * 4);
  const base = new Float32Array(n * 3);
  const tip = new Float32Array(n * 3);
  const mesh = new THREE.InstancedMesh(geo, material, n);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const p = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);
  const c = new THREE.Color();
  items.forEach((it, i) => {
    p.set(it.x, sandHeight(it.x, it.z) - 0.05, it.z);
    q.setFromEuler(e.set(0, it.rot, 0));
    mesh.setMatrixAt(i, m.compose(p, q, one));
    params.set([it.h, it.w, it.phase, it.stiff], i * 4);
    c.set(it.colors[0]).offsetHSL(it.hue, 0, it.light);
    base.set([c.r, c.g, c.b], i * 3);
    c.set(it.colors[1]).offsetHSL(it.hue, 0, it.light);
    tip.set([c.r, c.g, c.b], i * 3);
  });
  geo.setAttribute('aParams', new THREE.InstancedBufferAttribute(params, 4));
  geo.setAttribute('aBase', new THREE.InstancedBufferAttribute(base, 3));
  geo.setAttribute('aTip', new THREE.InstancedBufferAttribute(tip, 3));
  mesh.instanceMatrix.needsUpdate = true;
  mesh.frustumCulled = false;
  return mesh;
}

// The reef's kelp clusters: x, z, count, radius, minH, maxH, palette
const REEF_KELP = [
  [-7.8, -2.8, 5, 1.2, 4.5, 8, 0],
  [-10.8, 1.4, 3, 0.9, 3.5, 6, 1],
  [7.6, -4.8, 4, 1.1, 5, 8.5, 0],
  [10.6, 0.4, 3, 0.9, 3.5, 6, 2],
  [-3.4, -11.5, 4, 1.4, 5, 9, 1],
  [5.0, -13, 4, 1.4, 6, 10, 0],
  [-12.5, -10, 4, 1.8, 6, 10, 3],
  [13.5, -14, 4, 1.8, 7, 11, 0],
  [-5.4, -7.0, 2, 0.6, 3.5, 6, 3],
  [11.8, -7.6, 3, 0.9, 4, 7, 2],
  // foreground fronds framing the view (soft, out of focus)
  [-6.4, 10.6, 2, 0.5, 4, 6, 0],
  [6.8, 11.2, 2, 0.5, 4, 6, 1],
];
// …and its sea grass: x, z, count, radius
const REEF_GRASS = [
  [-4.8, 1.0, 14, 1.6], [0.2, 2.6, 10, 1.4], [-1.6, -1.6, 10, 1.4], [5.0, 1.6, 10, 1.2],
  [-8.0, 3.6, 12, 1.6], [8.6, 3.2, 12, 1.6], [3.2, -3.0, 8, 1.2], [-6.8, -6.4, 10, 1.8],
  [-2.4, 6.6, 8, 1.2], [1.8, 7.0, 8, 1.2],
];

// `layout` (the open sea has its own): kelp clusters, grass spots, kelp palettes and
// rectangles to keep clear ([x, z, half width, half depth]).
export function createSeaweed(r, { kelp: clusters = REEF_KELP, grass: grassSpots = REEF_GRASS, palettes = PALETTES, clear = [[2.0, 0.9, 1.6, 1.3]] } = {}) {
  const pushers = Array.from({ length: MAX_PUSHERS }, () => new THREE.Vector4(0, -100, 0, 0));
  const material = new THREE.ShaderMaterial({
    name: 'Seaweed',
    uniforms: withShared({ uPushers: { value: pushers } }),
    vertexShader: VERT,
    fragmentShader: FRAG,
    side: THREE.DoubleSide,
  });

  const kelp = [];
  for (const [cx, cz, count, rad, h0, h1, pal] of clusters) {
    for (let i = 0; i < count; i++) {
      const a = rand(r, 0, TAU);
      const d = Math.sqrt(r()) * rad;
      kelp.push({
        x: cx + Math.cos(a) * d,
        z: cz + Math.sin(a) * d,
        h: rand(r, h0, h1),
        w: rand(r, 0.75, 1.15),
        phase: r(),
        stiff: rand(r, 0.9, 1.3),
        rot: rand(r, -0.55, 0.55), // broad side towards the viewer
        colors: palettes[pal],
        hue: rand(r, -0.03, 0.03),
        light: rand(r, -0.04, 0.04),
      });
    }
  }

  const grass = [];
  for (const [cx, cz, count, rad] of grassSpots) {
    for (let i = 0; i < count; i++) {
      const a = rand(r, 0, TAU);
      const d = Math.sqrt(r()) * rad;
      const x = cx + Math.cos(a) * d;
      const z = cz + Math.sin(a) * d;
      if (clear.some(([cx2, cz2, w, d]) => Math.abs(x - cx2) < w && Math.abs(z - cz2) < d)) continue; // chest, ship
      grass.push({
        x,
        z,
        h: rand(r, 0.5, 1.5),
        w: rand(r, 0.09, 0.16),
        phase: r(),
        stiff: rand(r, 0.7, 1.0),
        rot: rand(r, 0, TAU),
        colors: r() < 0.82 ? GRASS : pick(r, palettes),
        hue: rand(r, -0.04, 0.04),
        light: rand(r, -0.05, 0.05),
      });
    }
  }

  const kelpMesh = buildMesh(material, 16, kelp);
  const grassMesh = buildMesh(material, 4, grass);
  // kelp clusters as vertical cylinders, for tapping
  const tappable = clusters.map(([x, z, , rad, , h1]) => ({ x, z, r: rad + 0.35, h: h1 * 0.9 }));
  return { meshes: [kelpMesh, grassMesh], material, pushers, clusters: tappable };
}
