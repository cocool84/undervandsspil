// Rocks, an arch and pebbles: noise-displaced icospheres with mossy tops, merged into
// a single draw call.

import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { fbm3, noise3 } from '../util/noise.js';
import { rand } from '../util/rng.js';
import { TAU } from '../util/math.js';
import { PRELUDE } from '../glsl/common.js';
import { withShared } from '../core/uniforms.js';
import { sandHeight } from './sand.js';

const VERT = /* glsl */ `
varying vec3 vWpos;
varying vec3 vNormal;
varying vec3 vColor;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWpos = wp.xyz;
  vNormal = normalize(mat3(modelMatrix) * normal);
  vColor = color;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const FRAG = /* glsl */ `
${PRELUDE}
varying vec3 vWpos;
varying vec3 vNormal;
varying vec3 vColor;
void main() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(cameraPosition - vWpos);
  float mottle = sin(vWpos.x * 4.1 + sin(vWpos.y * 3.3)) * sin(vWpos.z * 3.7 + sin(vWpos.x * 2.9));
  vec3 alb = vColor * (0.94 + 0.08 * mottle);
  vec3 col = softShade(alb, N, V, vWpos, 0.55, 0.06, 12.0, 0.22, 1.0);
  col = applyFog(col, vWpos);
  gl_FragColor = vec4(col, 1.0);
}
`;

// rock, rock, dark underside, moss, moss
const REEF_COLORS = ['#9d8fb4', '#b29a8c', '#5e5878', '#6fbf86', '#9ccf6a'];

const _v = new THREE.Vector3();
const _n = new THREE.Vector3();
const _c = new THREE.Color();

function colorize(geo, seed, mossAmount, palette) {
  const [stoneA, stoneB, stoneDark, mossA, mossB] = palette;
  const pos = geo.attributes.position;
  const nrm = geo.attributes.normal;
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    _v.fromBufferAttribute(pos, i);
    _n.fromBufferAttribute(nrm, i);
    const base = noise3(_v.x * 0.8 + seed, _v.y * 0.8, _v.z * 0.8) * 0.5 + 0.5;
    _c.copy(stoneA).lerp(stoneB, base);
    const low = THREE.MathUtils.smoothstep(_v.y, -0.6, 0.1);
    _c.lerp(stoneDark, (1 - low) * 0.45);
    const mossNoise = noise3(_v.x * 2.2 - seed, _v.y * 2.2, _v.z * 2.2 + seed) * 0.25;
    const moss = THREE.MathUtils.smoothstep(_n.y + mossNoise, 0.45, 0.75) * mossAmount;
    _c.lerp(base > 0.5 ? mossA : mossB, moss * 0.85);
    colors[i * 3] = _c.r;
    colors[i * 3 + 1] = _c.g;
    colors[i * 3 + 2] = _c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

function rockGeometry(detail, seed, mossAmount, palette) {
  let g = new THREE.IcosahedronGeometry(1, detail);
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  g = mergeVertices(g);
  const pos = g.attributes.position;
  const s = seed * 17.31;
  for (let i = 0; i < pos.count; i++) {
    _v.fromBufferAttribute(pos, i);
    const n = fbm3(_v.x * 1.1 + s, _v.y * 1.1, _v.z * 1.1 - s, 4);
    const n2 = noise3(_v.x * 3.3 - s, _v.y * 3.3, _v.z * 3.3 + s);
    _v.multiplyScalar(1 + 0.34 * n + 0.07 * n2);
    if (_v.y < -0.35) _v.y = -0.35 + (_v.y + 0.35) * 0.25; // flat-ish bottom
    pos.setXYZ(i, _v.x, _v.y, _v.z);
  }
  g.computeVertexNormals();
  colorize(g, s, mossAmount, palette);
  return g;
}

function archGeometry(seed, palette) {
  let g = new THREE.TorusGeometry(3.0, 0.95, 12, 36, Math.PI);
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  g = mergeVertices(g);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    _v.fromBufferAttribute(pos, i);
    const n = fbm3(_v.x * 0.55 + seed, _v.y * 0.55, _v.z * 0.55 - seed, 4);
    const r = 1 + 0.18 * n;
    // displace mostly away from the ring centre line
    _v.multiplyScalar(r);
    _v.z *= 1.15;
    pos.setXYZ(i, _v.x, _v.y, _v.z);
  }
  g.computeVertexNormals();
  colorize(g, seed, 1, palette);
  return g;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _e = new THREE.Euler();

function place(g, x, z, sx, sy, sz, rotY, sink = 0.18) {
  _p.set(x, sandHeight(x, z) - sy * sink, z);
  _q.setFromEuler(_e.set(0, rotY, 0));
  _s.set(sx, sy, sz);
  g.applyMatrix4(_m.compose(_p, _q, _s));
  return g;
}

// The reef's rocks: x, z, sx, sy, sz, detail
const REEF_ROCKS = [
    [-8.6, -3.6, 3.1, 2.4, 2.7, 4],
    [-6.1, -0.6, 1.25, 0.95, 1.1, 3],
    [8.9, -6.2, 3.5, 2.9, 3.0, 4],
    [6.4, -2.4, 1.55, 1.2, 1.4, 3],
    [-2.6, -10.2, 2.4, 1.7, 2.2, 3],
    [3.95, 0.7, 0.72, 0.52, 0.62, 3],
    [-4.6, 5.3, 0.5, 0.36, 0.45, 2],
    [6.2, 3.1, 0.82, 0.6, 0.7, 3],
    [-14.5, -18, 5.0, 4.2, 4.0, 3],
    [13.5, -22, 6.0, 5.2, 5.0, 3],
    [0.5, -34, 8.0, 6.0, 6.0, 3],
    [-22, -30, 7.0, 7.5, 6.0, 3],
    [24, -34, 8.0, 8.0, 7.0, 3],
];

// `layout` (the open sea has its own): big rocks, the arch ([x, z, turn] or null), pebbles
// ({count, x: [min, max], z: [min, max], clear: [[x, z, half width, half depth]]}) and colours.
export function createRocks(r, { big = REEF_ROCKS, arch: archAt = [-4.5, -15, 0.35], pebbles = { count: 70, x: [-11, 11], z: [-3, 9], clear: [[2.0, 0.9, 1.8, 1.4]] }, colors = REEF_COLORS } = {}) {
  const geos = [];
  const occluders = [];
  const spheres = [];
  const palette = colors.map((c) => new THREE.Color(c));
  big.forEach(([x, z, sx, sy, sz, detail], i) => {
    const g = rockGeometry(detail, i + 1, z > -15 ? 1 : 0.6, palette);
    place(g, x, z, sx, sy, sz, rand(r, 0, TAU));
    geos.push(g);
    if (z > -16) occluders.push([x, z, Math.max(sx, sz) * 1.15]);
    if (z > -12) spheres.push({ x, y: sandHeight(x, z) + sy * 0.3, z, r: Math.max(sx, sy, sz) * 0.85 });
  });

  if (archAt) {
    const [ax, az, turn] = archAt;
    const arch = archGeometry(9.1, palette);
    _p.set(ax, sandHeight(ax, az) - 0.7, az);
    _q.setFromEuler(_e.set(0, turn, 0));
    arch.applyMatrix4(_m.compose(_p, _q, _s.set(1, 1.05, 1)));
    geos.push(arch);
  }

  // pebbles scattered in front
  for (let i = 0; i < pebbles.count; i++) {
    const x = rand(r, pebbles.x[0], pebbles.x[1]);
    const z = rand(r, pebbles.z[0], pebbles.z[1]);
    if (pebbles.clear.some(([cx, cz, w, d]) => Math.abs(x - cx) < w && Math.abs(z - cz) < d)) continue; // keep the chest spot clear
    const sc = rand(r, 0.08, 0.22);
    const g = rockGeometry(1, 100 + i, 0.3, palette);
    place(g, x, z, sc * rand(r, 0.9, 1.4), sc * rand(r, 0.6, 0.9), sc, rand(r, 0, TAU), 0.25);
    geos.push(g);
  }

  const merged = mergeGeometries(geos);
  merged.computeBoundingSphere();
  geos.forEach((g) => g.dispose());

  const mat = new THREE.ShaderMaterial({
    name: 'Rocks',
    uniforms: withShared(),
    vertexShader: VERT,
    fragmentShader: FRAG,
    vertexColors: true,
  });
  const mesh = new THREE.Mesh(merged, mat);
  return { mesh, occluders, spheres };
}
