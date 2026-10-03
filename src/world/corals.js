// Corals, anemones, sponges, fans, starfish and shells — generated procedurally at start
// and merged into one mesh. Attributes drive sway, night glow, patterns and the anemones'
// touch reaction.

import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { PRELUDE } from '../glsl/common.js';
import { withShared } from '../core/uniforms.js';
import { rand } from '../util/rng.js';
import { TAU } from '../util/math.js';
import { noise3 } from '../util/noise.js';
import { sandHeight } from './sand.js';

export const MAX_ANEMONES = 4;

// aKind: 0 smooth, 1 brain, 2 fan lattice, 3 sponge pores, 4 starfish dots, 5 shell ridges
const VERT = /* glsl */ `
${PRELUDE}
attribute float aSway;
attribute float aGlow;
attribute float aKind;
attribute float aAnem;
attribute vec2 aLocal;
uniform vec4 uAnemones[${MAX_ANEMONES}]; // centre xyz, last touch time
varying vec3 vWpos;
varying vec3 vNormal;
varying vec3 vColor;
varying float vGlow;
varying float vKind;
varying vec2 vLocal;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  float sw = aSway;
  float t = uTime;
  wp.x += sin(t * 1.1 + wp.x * 0.7 + wp.z * 0.4 + wp.y * 0.9) * 0.07 * sw;
  wp.z += cos(t * 0.9 + wp.x * 0.5 + wp.y * 0.7) * 0.05 * sw;
  if (aAnem > 0.5) {
    vec4 an = uAnemones[int(aAnem + 0.5) - 1];
    float age = t - an.w;
    float k = age >= 0.0 && age < 3.5 ? smoothstep(0.0, 0.12, age) * (1.0 - smoothstep(0.9, 3.4, age)) : 0.0;
    vec3 c = an.xyz + vec3(0.0, 0.18, 0.0);
    wp.xyz = mix(wp.xyz, c, k * clamp(sw, 0.0, 1.0) * 0.82);
    // idle tentacle dance
    wp.x += sin(t * 1.7 + wp.y * 4.0 + aLocal.x * 6.28) * 0.05 * sw * (1.0 - k);
  }
  vWpos = wp.xyz;
  vNormal = normalize(mat3(modelMatrix) * normal);
  vColor = color;
  vGlow = aGlow;
  vKind = aKind;
  vLocal = aLocal;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const FRAG = /* glsl */ `
${PRELUDE}
varying vec3 vWpos;
varying vec3 vNormal;
varying vec3 vColor;
varying float vGlow;
varying float vKind;
varying vec2 vLocal;

vec2 voronoi(vec2 p) {
  vec2 ip = floor(p);
  vec2 fp = fract(p);
  float f1 = 8.0;
  float f2 = 8.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j));
      vec2 r = g + hash22(ip + g) - fp;
      float d = dot(r, r);
      if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) { f2 = d; }
    }
  }
  return vec2(sqrt(f1), sqrt(f2));
}

void main() {
  vec3 N = normalize(vNormal);
  if (!gl_FrontFacing) N = -N;
  vec3 V = normalize(cameraPosition - vWpos);
  vec3 alb = vColor;
  float k = vKind;
  if (k > 0.5 && k < 1.5) {          // brain coral maze: soft ridges
    float m = 1.0 - abs(snoise(vWpos * 2.6));
    alb *= 0.78 + 0.32 * smoothstep(0.72, 0.95, m);
  } else if (k > 1.5 && k < 2.5) {   // sea fan: organic lace
    vec2 v = voronoi(vLocal * 8.0 + snoise(vLocal * 2.5) * 0.35);
    float lace = smoothstep(0.1, 0.025, v.y - v.x);
    alb = mix(alb * 0.82, alb * 1.25 + 0.05, lace);
    alb += smoothstep(0.82, 1.0, length(vLocal)) * 0.12;
  } else if (k > 2.5 && k < 3.5) {   // sponge pores
    vec2 cell = fract(vWpos.xz * 6.0 + vWpos.y * 4.0) - 0.5;
    alb *= 0.78 + 0.22 * smoothstep(0.12, 0.3, length(cell));
  } else if (k > 3.5 && k < 4.5) {   // starfish dots
    vec2 cell = fract(vLocal * 9.0) - 0.5;
    alb = mix(alb, vec3(1.0, 0.92, 0.75), smoothstep(0.2, 0.12, length(cell)) * 0.7);
  } else if (k > 4.5) {              // shell ridges
    float rid = sin(atan(vLocal.y, vLocal.x) * 22.0);
    alb *= 0.82 + 0.18 * rid;
  }
  vec3 col = softShade(alb, N, V, vWpos, 0.7, 0.18, 22.0, 0.3, 0.85);
  float pulse = 0.65 + 0.35 * sin(uTime * 1.6 + vWpos.x * 1.3 + vWpos.z);
  col += mix(alb, vec3(0.3, 1.0, 1.0), 0.45) * vGlow * uNight * pulse * 2.4;
  col = applyFog(col, vWpos);
  gl_FragColor = vec4(col, 1.0);
}
`;

// ---------------------------------------------------------------- geometry helpers

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _c = new THREE.Color();

// Give a geometry the shared attribute layout (and drop uv) so everything can be merged.
function prep(geo, { color, color2 = null, sway = 0, swayByY = 0, glow = 0, glowByY = 0, kind = 0, anem = 0, local = null }) {
  if (!geo.index) geo = mergeVertices(geo);
  geo.deleteAttribute('uv');
  if (!geo.attributes.normal) geo.computeVertexNormals();
  const n = geo.attributes.position.count;
  const pos = geo.attributes.position;
  geo.computeBoundingBox();
  const y0 = geo.boundingBox.min.y;
  const y1 = geo.boundingBox.max.y;
  const colors = new Float32Array(n * 3);
  const swayA = new Float32Array(n);
  const glowA = new Float32Array(n);
  const kindA = new Float32Array(n).fill(kind);
  const anemA = new Float32Array(n).fill(anem);
  const localA = new Float32Array(n * 2);
  const ca = new THREE.Color(color);
  const cb = new THREE.Color(color2 ?? color);
  for (let i = 0; i < n; i++) {
    const yN = y1 > y0 ? (pos.getY(i) - y0) / (y1 - y0) : 0;
    _c.copy(ca).lerp(cb, yN);
    colors.set([_c.r, _c.g, _c.b], i * 3);
    swayA[i] = sway + swayByY * yN;
    glowA[i] = glow + glowByY * yN * yN;
    if (local) {
      const l = local(pos.getX(i), pos.getY(i), pos.getZ(i));
      localA[i * 2] = l[0];
      localA[i * 2 + 1] = l[1];
    }
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setAttribute('aSway', new THREE.BufferAttribute(swayA, 1));
  geo.setAttribute('aGlow', new THREE.BufferAttribute(glowA, 1));
  geo.setAttribute('aKind', new THREE.BufferAttribute(kindA, 1));
  geo.setAttribute('aAnem', new THREE.BufferAttribute(anemA, 1));
  geo.setAttribute('aLocal', new THREE.BufferAttribute(localA, 2));
  return geo;
}

function moveTo(geo, x, y, z, rotY = 0, scale = 1) {
  _q.setFromAxisAngle(_up, rotY);
  _m.compose(_v.set(x, y, z), _q, new THREE.Vector3(scale, scale, scale));
  geo.applyMatrix4(_m);
  return geo;
}

// A tapered tube from a to b.
function segment(a, b, r0, r1, radial = 7) {
  const len = a.distanceTo(b);
  const g = new THREE.CylinderGeometry(r1, r0, len, radial, 1, true);
  g.translate(0, len / 2, 0);
  const dir = _v.copy(b).sub(a).normalize();
  _q.setFromUnitVectors(_up, dir);
  _m.compose(a, _q, new THREE.Vector3(1, 1, 1));
  g.applyMatrix4(_m);
  return g;
}

function branchingCoral(r, x, z, size, colA, colB) {
  const parts = [];
  const base = new THREE.Vector3(x, sandHeight(x, z) - 0.05, z);
  const maxDepth = 3;
  const grow = (start, dir, len, rad, depth) => {
    const end = start.clone().addScaledVector(dir, len);
    const t0 = depth / (maxDepth + 1);
    const t1 = (depth + 1) / (maxDepth + 1);
    parts.push(prep(segment(start, end, rad, rad * 0.72), {
      color: _c.set(colA).lerp(new THREE.Color(colB), t0).getHex(),
      color2: new THREE.Color(colA).lerp(new THREE.Color(colB), t1).getHex(),
      sway: depth * 0.12,
      swayByY: 0.12,
    }));
    const knob = new THREE.SphereGeometry(rad * 0.75, 8, 6);
    knob.translate(end.x, end.y, end.z);
    parts.push(prep(knob, { color: new THREE.Color(colA).lerp(new THREE.Color(colB), t1).getHex(), sway: (depth + 1) * 0.12 }));
    if (depth >= maxDepth) {
      const tip = new THREE.SphereGeometry(rad * 1.25, 10, 8);
      tip.translate(end.x, end.y, end.z);
      parts.push(prep(tip, { color: colB, sway: (depth + 1) * 0.13, glow: 1 }));
      return;
    }
    const n = r() < 0.35 ? 3 : 2;
    for (let i = 0; i < n; i++) {
      const nd = dir.clone();
      const axis = new THREE.Vector3(rand(r, -1, 1), rand(r, -0.2, 0.2), rand(r, -1, 1)).normalize();
      nd.applyAxisAngle(axis, rand(r, 0.35, 0.75));
      nd.y = Math.max(nd.y, 0.25);
      nd.normalize();
      grow(end, nd, len * rand(r, 0.68, 0.82), rad * 0.72, depth + 1);
    }
  };
  grow(base, new THREE.Vector3(rand(r, -0.15, 0.15), 1, rand(r, -0.15, 0.15)).normalize(), size * 0.5, size * 0.17, 0);
  return parts;
}

function brainCoral(x, z, radius, colA, colB) {
  const g = new THREE.SphereGeometry(1, 30, 18, 0, TAU, 0, Math.PI * 0.55);
  g.scale(radius * 1.1, radius * 0.72, radius);
  return [prep(moveTo(g, x, sandHeight(x, z) - radius * 0.12, z), { color: colB, color2: colA, kind: 1 })];
}

function fanCoral(x, z, size, rotY, colA, colB) {
  const g = new THREE.CircleGeometry(size, 28, 0, Math.PI);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const px = pos.getX(i);
    const py = pos.getY(i);
    pos.setZ(i, Math.sin(px * 1.3) * 0.12 + noise3(px, py, 1.7) * 0.08);
  }
  g.computeVertexNormals();
  const stem = new THREE.CylinderGeometry(size * 0.04, size * 0.07, size * 0.35, 6);
  stem.translate(0, -size * 0.12, 0);
  const local = (px, py) => [px / size, py / size];
  const fan = prep(g, { color: colA, color2: colB, kind: 2, sway: 0.15, swayByY: 0.6, glowByY: 0.35, local });
  const st = prep(stem, { color: colA });
  const y = sandHeight(x, z) + size * 0.08;
  return [moveTo(fan, x, y, z, rotY), moveTo(st, x, y, z, rotY)];
}

function tubeSponges(r, x, z, count, colA, colB) {
  const parts = [];
  for (let i = 0; i < count; i++) {
    const a = rand(r, 0, TAU);
    const d = rand(r, 0, 0.45);
    const h = rand(r, 0.6, 1.5);
    const rad = rand(r, 0.13, 0.22);
    const px = x + Math.cos(a) * d;
    const pz = z + Math.sin(a) * d;
    const tube = new THREE.CylinderGeometry(rad, rad * 1.15, h, 12, 1, true);
    tube.translate(0, h / 2, 0);
    parts.push(moveTo(prep(tube, { color: colA, color2: colB, kind: 3, sway: 0.05, swayByY: 0.2 }), px, sandHeight(px, pz) - 0.05, pz));
    const lip = new THREE.TorusGeometry(rad * 1.02, rad * 0.22, 6, 14);
    lip.rotateX(Math.PI / 2);
    lip.translate(0, h, 0);
    parts.push(moveTo(prep(lip, { color: colB, sway: 0.25, glow: 0.7 }), px, sandHeight(px, pz) - 0.05, pz));
    const hole = new THREE.CircleGeometry(rad * 0.98, 14);
    hole.rotateX(-Math.PI / 2);
    hole.translate(0, h - 0.06, 0);
    parts.push(moveTo(prep(hole, { color: '#2a1440', sway: 0.25 }), px, sandHeight(px, pz) - 0.05, pz));
  }
  return parts;
}

function mushrooms(r, x, z, count, cap, stemCol) {
  const parts = [];
  for (let i = 0; i < count; i++) {
    const a = rand(r, 0, TAU);
    const d = rand(r, 0.1, 0.7);
    const px = x + Math.cos(a) * d;
    const pz = z + Math.sin(a) * d;
    const h = rand(r, 0.35, 0.8);
    const s = rand(r, 0.25, 0.45);
    const stem = new THREE.CylinderGeometry(s * 0.25, s * 0.35, h, 8, 1, true);
    stem.translate(0, h / 2, 0);
    const top = new THREE.SphereGeometry(s, 16, 8, 0, TAU, 0, Math.PI * 0.5);
    top.scale(1, 0.55, 1);
    top.translate(0, h, 0);
    const y = sandHeight(px, pz) - 0.05;
    parts.push(moveTo(prep(stem, { color: stemCol, sway: 0.1, swayByY: 0.2 }), px, y, pz));
    parts.push(moveTo(prep(top, { color: cap, sway: 0.3, glow: 1 }), px, y, pz));
  }
  return parts;
}

function anemone(r, x, z, id, baseCol, tipCol, size = 1) {
  const parts = [];
  const y = sandHeight(x, z) - 0.05;
  const body = new THREE.CylinderGeometry(0.42 * size, 0.55 * size, 0.45 * size, 16, 1, false);
  body.translate(0, 0.22 * size, 0);
  parts.push(moveTo(prep(body, { color: baseCol, anem: id }), x, y, z));
  const count = 30;
  for (let i = 0; i < count; i++) {
    const ring = i < 18 ? 0.34 : 0.17;
    const a = (i / (i < 18 ? 18 : 12)) * TAU + (i < 18 ? 0 : 0.3);
    const len = (i < 18 ? rand(r, 0.55, 0.8) : rand(r, 0.6, 0.9)) * size;
    const lean = i < 18 ? 0.55 : 0.25;
    const g = new THREE.CylinderGeometry(0.018 * size, 0.06 * size, len, 6, 4, false);
    g.translate(0, len / 2, 0);
    // bend outward
    const pos = g.attributes.position;
    for (let k = 0; k < pos.count; k++) {
      const py = pos.getY(k) / len;
      pos.setX(k, pos.getX(k) + py * py * lean * len);
    }
    g.computeVertexNormals();
    g.rotateY(-a);
    g.translate(Math.cos(a) * ring * size, 0.44 * size, Math.sin(a) * ring * size);
    const local = (px) => [(i % 7) / 7, px];
    parts.push(moveTo(prep(g, { color: baseCol, color2: tipCol, sway: 0.15, swayByY: 1.0, glowByY: 1.0, anem: id, local }), x, y, z));
  }
  return parts;
}

function starfish(x, z, size, rotY, col) {
  const shape = new THREE.Shape();
  const arms = 5;
  for (let i = 0; i <= arms * 2; i++) {
    const a = (i / (arms * 2)) * TAU + Math.PI / 2;
    const rr = i % 2 === 0 ? size : size * 0.42;
    const px = Math.cos(a) * rr;
    const py = Math.sin(a) * rr;
    if (i === 0) shape.moveTo(px, py);
    else {
      const pa = ((i - 0.5) / (arms * 2)) * TAU + Math.PI / 2;
      const pr = i % 2 === 0 ? size * 0.62 : size * 0.78;
      shape.quadraticCurveTo(Math.cos(pa) * pr, Math.sin(pa) * pr, px, py);
    }
  }
  const g = new THREE.ExtrudeGeometry(shape, { depth: size * 0.12, bevelEnabled: true, bevelThickness: size * 0.12, bevelSize: size * 0.1, bevelSegments: 3, curveSegments: 6 });
  g.rotateX(-Math.PI / 2);
  const local = (px, py, pz) => [px / size, pz / size];
  const prepared = prep(g, { color: col, kind: 4, local });
  return [moveTo(prepared, x, sandHeight(x, z) + size * 0.05, z, rotY)];
}

function shell(x, z, size, rotY, col) {
  const g = new THREE.CircleGeometry(size, 22, 0.15, Math.PI - 0.3);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const px = pos.getX(i);
    const py = pos.getY(i);
    const rr = Math.hypot(px, py) / size;
    pos.setZ(i, rr * rr * size * 0.35 - size * 0.05 * Math.cos(Math.atan2(py, px) * 22));
  }
  g.computeVertexNormals();
  g.rotateX(-Math.PI / 2 + 0.25);
  const local = (px, py, pz) => [px / size, -pz / size];
  return [moveTo(prep(g, { color: col, kind: 5, local }), x, sandHeight(x, z) + 0.03, z, rotY)];
}

export function createCorals(r) {
  const parts = [];
  const occluders = [];
  const anemones = [];
  const add = (arr, occ) => {
    parts.push(...arr);
    if (occ) occluders.push(occ);
  };

  add(branchingCoral(r, -4.6, 2.2, 1.6, '#ff6f9f', '#ffc2dc'), [-4.6, 2.2, 1.0]);
  add(branchingCoral(r, 5.4, -1.2, 1.8, '#ff8a3d', '#ffd18a'), [5.4, -1.2, 1.1]);
  add(branchingCoral(r, -6.4, -5.5, 2.2, '#9a6bff', '#e2c9ff'), [-6.4, -5.5, 1.3]);
  add(branchingCoral(r, 7.7, 2.6, 1.1, '#ffd34f', '#fff2b5'), [7.7, 2.6, 0.7]);
  add(branchingCoral(r, -0.5, -12.5, 2.6, '#ff7a7a', '#ffc6b0'));
  add(branchingCoral(r, 9.5, -10.5, 2.8, '#5fd6c8', '#d4fff4'));
  add(brainCoral(-3.2, -0.4, 0.8, '#f2a35f', '#ffd9a8'), [-3.2, -0.4, 1.0]);
  add(brainCoral(8.3, -3.0, 1.1, '#e86f8f', '#ffc0d0'), [8.3, -3.0, 1.2]);
  add(fanCoral(-5.6, -1.6, 1.35, 0.3, '#b05cff', '#f6c2ff'), [-5.6, -1.6, 0.7]);
  add(fanCoral(6.9, -6.9, 1.9, -0.35, '#ff6a4a', '#ffd8a8'));
  add(fanCoral(-9.6, -8.6, 1.8, 0.5, '#ff7ac8', '#ffe0f2'));
  add(tubeSponges(r, 0.7, -5.8, 5, '#ffb347', '#ffe08a'), [0.7, -5.8, 1.0]);
  add(tubeSponges(r, -9.2, -6.4, 4, '#3fc7c0', '#a8fff0'));
  add(mushrooms(r, 3.3, -3.9, 5, '#7cf0ff', '#d8f8ff'), [3.3, -3.9, 0.8]);
  add(mushrooms(r, -2.2, -5.0, 3, '#ff9ae6', '#ffe2f6'));

  add(anemone(r, 5.6, 2.3, 1, '#a24bd6', '#ffc2f4', 0.9), [5.6, 2.3, 0.7]);
  anemones.push(new THREE.Vector4(5.6, sandHeight(5.6, 2.3) + 0.4, 2.3, -100));
  add(anemone(r, -5.5, 3.5, 2, '#ff7b39', '#fff1d6', 0.8), [-5.5, 3.5, 0.6]);
  anemones.push(new THREE.Vector4(-5.5, sandHeight(-5.5, 3.5) + 0.35, 3.5, -100));
  add(anemone(r, -7.6, 1.4, 3, '#2fbf9f', '#d4fff0', 0.85), [-7.6, 1.4, 0.6]);
  anemones.push(new THREE.Vector4(-7.6, sandHeight(-7.6, 1.4) + 0.38, 1.4, -100));
  while (anemones.length < MAX_ANEMONES) anemones.push(new THREE.Vector4(0, -100, 0, -100));

  add(starfish(-1.2, 5.3, 0.36, 0.4, '#ff8a5c'));
  add(starfish(6.1, 4.7, 0.3, 1.2, '#ff6fa8'));
  add(starfish(-6.4, 4.4, 0.28, 2.0, '#ffb13d'));
  add(shell(0.3, 4.9, 0.24, 0.6, '#ffe2cf'));
  add(shell(-5.3, 5.6, 0.2, -0.8, '#ffd1e0'));
  add(shell(3.4, 6.1, 0.18, 2.4, '#fff0c8'));

  const geo = mergeGeometries(parts);
  parts.forEach((g) => g.dispose());
  geo.computeBoundingSphere();

  const uAnemones = { value: anemones };
  const material = new THREE.ShaderMaterial({
    name: 'Corals',
    uniforms: withShared({ uAnemones }),
    vertexShader: VERT,
    fragmentShader: FRAG,
    vertexColors: true,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, material);
  mesh.frustumCulled = false;
  return { mesh, occluders, anemones };
}
