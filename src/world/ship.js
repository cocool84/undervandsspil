// The sunken ship: a friendly little sailing ship resting tilted on the sand — round
// portholes (warm lights at night), a cabin at the stern, a mast with a patched sail and a
// little flag, and treasure in the hold. Tap it: it rocks, the portholes flash, and bubbles
// and treasure tumble out of the hole in its side. Nearby lie its anchor and two barrels.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { PRELUDE } from '../glsl/common.js';
import { withShared } from '../core/uniforms.js';
import { Spring } from '../util/math.js';
import { sandHeight } from './sand.js';

// aMat: 0 hull planks, 1 deck, 2 dark wood and iron, 3 glass, 4 sail, 5 flag, 6 brass
const VERT = /* glsl */ `
${PRELUDE}
attribute float aMat;
uniform float uFlagX;
varying vec3 vLocal;
varying vec3 vWpos;
varying vec3 vNormal;
varying vec3 vColor;
varying float vMat;
void main() {
  vec3 p = position;
  if (aMat > 3.5 && aMat < 4.5) {
    // the sail billows in the current, most at its loose bottom edge
    float k = smoothstep(3.6, 1.3, p.y);
    p.x += (sin(uTime * 0.8 + p.z * 1.2) * 0.1 + 0.12) * k;
  } else if (aMat > 4.5 && aMat < 5.5) {
    float along = max(uFlagX - p.x, 0.0);
    p.z += sin(uTime * 2.6 - along * 5.0) * 0.14 * along;
    p.y += sin(uTime * 1.9 - along * 3.0) * 0.04 * along;
  }
  vec4 wp = modelMatrix * vec4(p, 1.0);
  vLocal = position;
  vWpos = wp.xyz;
  vNormal = normalize(mat3(modelMatrix) * normal);
  vColor = color;
  vMat = aMat;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const FRAG = /* glsl */ `
${PRELUDE}
uniform float uFlash;
varying vec3 vLocal;
varying vec3 vWpos;
varying vec3 vNormal;
varying vec3 vColor;
varying float vMat;
void main() {
  vec3 N = normalize(vNormal);
  if (!gl_FrontFacing) N = -N;
  vec3 V = normalize(cameraPosition - vWpos);
  vec3 col;
  float m = vMat;
  if (m < 1.5) {
    // planks: along the hull, across the deck; a little green weed where the sun falls
    float lines = m < 0.5 ? vLocal.y * 3.4 : vLocal.z * 3.0;
    float grain = snoise(vec2(vLocal.x * 1.1, lines * 4.0)) * 0.5 + 0.5;
    float seam = smoothstep(0.42, 0.5, abs(fract(lines) - 0.5));
    vec3 alb = vColor * (0.86 + 0.2 * grain) * (1.0 - 0.38 * seam);
    float weed = smoothstep(0.5, 0.95, N.y) * smoothstep(0.35, 0.75, snoise(vLocal.xz * 0.7) * 0.5 + 0.5);
    alb = mix(alb, vec3(0.36, 0.52, 0.26), weed * 0.3);
    col = softShade(alb, N, V, vWpos, 0.55, 0.12, 18.0, 0.22, 0.8);
  } else if (m < 2.5) {
    col = softShade(vColor * (0.9 + 0.15 * snoise(vLocal.xy * 3.0)), N, V, vWpos, 0.5, 0.1, 16.0, 0.2, 0.6);
  } else if (m < 3.5) {
    // glass: deep blue by day with a glint; a warm cosy light at night
    float glint = pow(max(dot(reflect(-V, N), uSunDir), 0.0), 18.0);
    col = vec3(0.04, 0.12, 0.24) + uKeyColor * glint * 0.8;
    col += vec3(2.2, 1.5, 0.6) * (uNight * (0.82 + 0.18 * sin(uTime * 1.7 + vLocal.x * 3.0)) + uFlash);
  } else if (m < 4.5) {
    // the sail lets the sunlight through
    float weave = 0.95 + 0.05 * sin(vLocal.y * 60.0) * sin(vLocal.z * 60.0);
    vec3 alb = vColor * weave;
    col = softShade(alb, N, V, vWpos, 0.85, 0.05, 10.0, 0.25, 0.5);
    col += alb * uKeyColor * 0.3 * depthLight(vWpos);
  } else if (m < 5.5) {
    col = softShade(vColor, N, V, vWpos, 0.8, 0.1, 12.0, 0.3, 0.4) + vColor * 0.15;
  } else {
    vec3 R = reflect(-V, N);
    vec3 env = mix(vec3(0.3, 0.16, 0.04), vec3(1.3, 1.0, 0.5), smoothstep(-0.35, 0.75, R.y));
    col = vColor * env * (0.55 + 0.45 * clamp(dot(N, uSunDir) * 0.5 + 0.5, 0.0, 1.0)) * depthLight(vWpos);
    col += uKeyColor * pow(max(dot(N, normalize(uSunDir + V)), 0.0), 50.0) * 1.4;
  }
  col = applyFog(col, vWpos);
  gl_FragColor = vec4(col, 1.0);
}
`;

const WOOD = '#c98a4e';
const BAND = '#ffe6a6'; // the painted band along the top of the hull
const DECK = '#e3b77a';
const DARK = '#6b4428';
const IRON = '#4a5260';
const GLASS = '#1a2a40';
const SAIL = '#f4ead2';
const PATCH = '#e6c79a';
const BRASS = '#ffc94a';

const L = 7.0; // length
const B = 1.25; // half beam
const D = 1.45; // depth of the hull under the deck edge

const halfBeam = (x) => {
  const k = x / (L / 2);
  return k > 0 ? B * Math.pow(Math.max(1 - Math.pow(k, 2.2), 0), 0.55) : B * (1 - 0.18 * Math.pow(-k, 4));
};
const depth = (x) => D * (1 - 0.3 * Math.pow(x / (L / 2), 2));
// the deck curves up like a smile: high at the bow, a little less at the stern
const deckY = (x) => {
  const k = x / (L / 2);
  return 0.3 * k * k + (k > 0 ? 0.55 * Math.pow(k, 3) : 0.2 * Math.pow(-k, 3));
};

// `color` is a colour, or a function (x, y, z) → colour.
function tag(geo, color, mat) {
  if (geo.index) geo = geo.toNonIndexed();
  geo.deleteAttribute('uv');
  if (!geo.attributes.normal) geo.computeVertexNormals();
  const n = geo.attributes.position.count;
  const p = geo.attributes.position;
  const c = new THREE.Color();
  const colors = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    c.set(typeof color === 'function' ? color(p.getX(i), p.getY(i), p.getZ(i)) : color);
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setAttribute('aMat', new THREE.BufferAttribute(new Float32Array(n).fill(mat), 1));
  return geo;
}

// A (nu+1)×(nv+1) grid of points fn(a, b) → [x, y, z].
function sheet(nu, nv, fn) {
  const pos = [];
  const idx = [];
  for (let i = 0; i <= nu; i++) for (let j = 0; j <= nv; j++) pos.push(...fn(i / nu, j / nv));
  const row = nv + 1;
  for (let i = 0; i < nu; i++) {
    for (let j = 0; j < nv; j++) {
      const a = i * row + j;
      const b = (i + 1) * row + j;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function cylinder(r0, r1, len, from, dir, color, mat, seg = 10) {
  const g = new THREE.CylinderGeometry(r1, r0, len, seg);
  g.translate(0, len / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize()));
  g.translate(from.x, from.y, from.z);
  return tag(g, color, mat);
}

// Round things on the hull's side (portholes, the hole): their place and outward direction.
function onHull(x, below, side) {
  const y = deckY(x) - below;
  const s = Math.max(Math.min(below / depth(x), 1), 0);
  const phi = Math.asin(Math.pow(s, 1 / 0.7)); // where on the U-shaped section
  const z = halfBeam(x) * Math.cos(phi) * side;
  const normal = new THREE.Vector3(0, -Math.sin(phi) * 0.5, Math.cos(phi) * side).normalize();
  return { at: new THREE.Vector3(x, y, z), normal };
}

function disc(radius, place, lift, color, mat, ragged = 0) {
  const g = new THREE.CircleGeometry(radius, 18);
  if (ragged) {
    const p = g.attributes.position;
    for (let i = 1; i < p.count; i++) {
      const a = Math.atan2(p.getY(i), p.getX(i));
      const k = 1 + ragged * (Math.sin(a * 5) * 0.5 + Math.sin(a * 9 + 1.3) * 0.35);
      p.setXY(i, p.getX(i) * k, p.getY(i) * k * 0.8);
    }
  }
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), place.normal));
  g.translate(place.at.x + place.normal.x * lift, place.at.y + place.normal.y * lift, place.at.z + place.normal.z * lift);
  return tag(g, color, mat);
}

function ring(radius, tube, place, lift, color, mat) {
  const g = new THREE.TorusGeometry(radius, tube, 6, 18);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), place.normal));
  g.translate(place.at.x + place.normal.x * lift, place.at.y + place.normal.y * lift, place.at.z + place.normal.z * lift);
  return tag(g, color, mat);
}

function shipGeometry() {
  const parts = [];
  // hull: U-shaped sections from the stern to the sharp bow, with a painted band on top
  parts.push(tag(sheet(56, 18, (a, b) => {
    const x = -L / 2 + a * L;
    const phi = b * Math.PI;
    return [x, deckY(x) - depth(x) * Math.pow(Math.sin(phi), 0.7), halfBeam(x) * Math.cos(phi)];
  }), (x, y) => (deckY(x) - y < 0.26 ? BAND : WOOD), 0));
  // the flat stern
  {
    const x = -L / 2;
    const pos = [x, deckY(x) - depth(x) * 0.45, 0];
    const idx = [];
    for (let j = 0; j <= 14; j++) {
      const phi = (j / 14) * Math.PI;
      pos.push(x, deckY(x) - depth(x) * Math.pow(Math.sin(phi), 0.7), halfBeam(x) * Math.cos(phi));
      if (j > 0) idx.push(0, j, j + 1);
    }
    idx.push(0, 15, 1);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    parts.push(tag(g, DARK, 2));
  }
  // deck and the low walls along its edges
  parts.push(tag(sheet(40, 6, (a, b) => {
    const x = -L / 2 + a * L * 0.995;
    return [x, deckY(x) - 0.04, (b * 2 - 1) * halfBeam(x) * 0.99];
  }), DECK, 1));
  for (const side of [1, -1]) {
    parts.push(tag(sheet(40, 2, (a, b) => {
      const x = -L / 2 + a * L * 0.995;
      return [x, deckY(x) + b * 0.34, side * halfBeam(x)];
    }), BAND, 0));
  }
  // the cabin at the stern, with windows
  const cabX = -L / 2 + 0.95;
  const cabW = halfBeam(cabX) * 1.7;
  const cab = new RoundedBoxGeometry(1.75, 1.0, cabW, 2, 0.06);
  cab.translate(cabX, deckY(cabX) + 0.5, 0);
  parts.push(tag(cab, DARK, 2));
  const roof = new RoundedBoxGeometry(1.95, 0.14, cabW + 0.2, 2, 0.05);
  roof.translate(cabX, deckY(cabX) + 1.05, 0);
  parts.push(tag(roof, WOOD, 0));
  for (const side of [1, -1]) {
    for (const dx of [-0.42, 0.42]) {
      const w = new THREE.PlaneGeometry(0.42, 0.36);
      if (side < 0) w.rotateY(Math.PI);
      w.translate(cabX + dx, deckY(cabX) + 0.58, side * (cabW / 2 + 0.012));
      parts.push(tag(w, GLASS, 3));
    }
  }
  for (const dz of [-0.45, 0.45]) {
    const w = new THREE.PlaneGeometry(0.36, 0.34);
    w.rotateY(-Math.PI / 2);
    w.translate(cabX - 0.888, deckY(cabX) + 0.58, dz);
    parts.push(tag(w, GLASS, 3));
  }
  // portholes with brass rims, and the hole the treasure comes out of
  for (const side of [1, -1]) {
    for (const x of [-1.3, -0.35, 0.6, 1.55]) {
      if (side > 0 && x === 0.6) continue;
      const place = onHull(x, 0.5, side);
      parts.push(disc(0.21, place, 0.02, GLASS, 3));
      parts.push(ring(0.22, 0.06, place, 0.03, BRASS, 6));
    }
  }
  parts.push(disc(0.36, onHull(0.75, 0.82, 1), 0.015, '#160c06', 2, 0.18));
  // mast, yard, crow's nest, sail and flag
  const mastX = 0.35;
  const mastFoot = new THREE.Vector3(mastX, deckY(mastX), 0);
  parts.push(cylinder(0.14, 0.1, 5.3, mastFoot, new THREE.Vector3(0, 1, 0), DARK, 2));
  parts.push(cylinder(0.07, 0.07, 3.0, new THREE.Vector3(mastX + 0.12, 3.55, -1.5), new THREE.Vector3(0, 0, 1), DARK, 2, 8));
  const nest = new THREE.CylinderGeometry(0.36, 0.3, 0.3, 14, 1, true);
  nest.translate(mastX, 4.45, 0);
  parts.push(tag(nest, WOOD, 0));
  const nestFloor = new THREE.CircleGeometry(0.31, 14);
  nestFloor.rotateX(-Math.PI / 2);
  nestFloor.translate(mastX, 4.31, 0);
  parts.push(tag(nestFloor, DARK, 2));
  // a full, billowing sail with a red stripe (and a patch where it once tore)
  const sail = sheet(12, 14, (a, b) => {
    const z = -1.4 + a * 2.8;
    let y = 3.5 - b * 2.3;
    if (b === 1) y += 0.12 + 0.12 * Math.sin(a * 17.0) * Math.sin(a * 5.0 + 1.0); // a ragged lower edge
    return [mastX + 0.2 + Math.sin(Math.PI * a) * (0.18 + 0.32 * Math.sin(Math.PI * b * 0.85)), y, z];
  });
  parts.push(tag(sail, (x, y) => (Math.abs(y - 2.45) < 0.22 ? '#ff6b5e' : SAIL), 4));
  const patch = new THREE.PlaneGeometry(0.42, 0.36);
  patch.rotateY(Math.PI / 2);
  patch.translate(mastX + 0.62, 1.75, -0.5);
  parts.push(tag(patch, PATCH, 4));
  // a cheerful pennant: red with a yellow stripe
  const flag = sheet(8, 3, (a, b) => [mastX - 0.06 - a * 1.5, 5.3 - b * 0.8 + a * b * 0.4, 0.0]);
  parts.push(tag(flag, (x, y) => (Math.abs(y - (4.9 + (mastX - 0.06 - x) * 0.13)) < 0.12 ? '#ffd23f' : '#ff5d5d'), 5));
  // the bowsprit
  parts.push(cylinder(0.08, 0.05, 1.8, new THREE.Vector3(L / 2 - 0.2, deckY(L / 2) + 0.1, 0), new THREE.Vector3(1, 0.42, 0), DARK, 2, 8));

  const geo = mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)));
  parts.forEach((g) => g.dispose());
  geo.computeBoundingSphere();
  return { geometry: geo, mastX };
}

// The anchor and two barrels on the sand, in world space.
function propsGeometry(anchorAt, barrels) {
  const parts = [];
  const [ax, az, turn] = anchorAt;
  const ay = sandHeight(ax, az);
  const anchor = [];
  anchor.push(cylinder(0.07, 0.07, 1.3, new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0), IRON, 2, 8));
  anchor.push(cylinder(0.05, 0.05, 0.9, new THREE.Vector3(0, 1.1, -0.45), new THREE.Vector3(0, 0, 1), IRON, 2, 8));
  const arms = new THREE.TorusGeometry(0.42, 0.065, 6, 16, Math.PI);
  arms.rotateZ(Math.PI);
  arms.translate(0, 0.42, 0);
  anchor.push(tag(arms, IRON, 2));
  for (const sx of [-1, 1]) {
    const tip = new THREE.ConeGeometry(0.11, 0.24, 6);
    tip.rotateZ(sx > 0 ? -0.5 : 0.5);
    tip.translate(sx * 0.42, 0.5, 0);
    anchor.push(tag(tip, IRON, 2));
  }
  const loop = new THREE.TorusGeometry(0.14, 0.035, 6, 14);
  loop.translate(0, 1.42, 0);
  anchor.push(tag(loop, IRON, 2));
  const a = mergeGeometries(anchor.map((g) => (g.index ? g.toNonIndexed() : g)));
  a.rotateZ(1.25); // lying on its side
  a.rotateY(turn);
  a.translate(ax, ay + 0.12, az);
  parts.push(a);
  for (const [bx, bz, bt] of barrels) {
    const by = sandHeight(bx, bz);
    const b = new THREE.CylinderGeometry(0.34, 0.34, 0.9, 14, 4);
    const p = b.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const k = 1 + 0.16 * Math.cos((p.getY(i) / 0.45) * Math.PI * 0.5);
      p.setX(i, p.getX(i) * k);
      p.setZ(i, p.getZ(i) * k);
    }
    b.computeVertexNormals();
    const barrel = [tag(b, WOOD, 0)];
    for (const y of [-0.28, 0.28]) {
      const band = new THREE.TorusGeometry(0.37, 0.025, 5, 18);
      band.rotateX(Math.PI / 2);
      band.translate(0, y, 0);
      barrel.push(tag(band, IRON, 2));
    }
    const g = mergeGeometries(barrel.map((x) => (x.index ? x.toNonIndexed() : x)));
    g.rotateZ(Math.PI / 2);
    g.rotateY(bt);
    g.translate(bx, by + 0.3, bz);
    parts.push(g);
  }
  const geo = mergeGeometries(parts);
  parts.forEach((g) => g.dispose());
  return geo;
}

const _v = new THREE.Vector3();

export class Ship {
  constructor(x, z, rotY, { anchor, barrels }) {
    const { geometry, mastX } = shipGeometry();
    this.material = new THREE.ShaderMaterial({
      name: 'Ship',
      uniforms: withShared({ uFlash: { value: 0 }, uFlagX: { value: mastX - 0.06 } }),
      vertexShader: VERT,
      fragmentShader: FRAG,
      vertexColors: true,
      side: THREE.DoubleSide,
    });
    this.group = new THREE.Group();
    this.mesh = new THREE.Mesh(geometry, this.material);
    this.group.add(this.mesh);
    this.group.position.set(x, sandHeight(x, z) + 0.95, z);
    this.group.scale.setScalar(1.15);
    this.baseRoll = -0.12; // leaning a little away, so its side with the portholes shows
    this.group.rotation.set(this.baseRoll, rotY, 0.05, 'YXZ');
    this.props = new THREE.Mesh(propsGeometry(anchor, barrels), this.material);
    this.rock = new Spring(0, 40, 3.2);
    this.flash = 0;
    this.bubbleT = 0;
    this.lastTreasure = -1e9;
    this.onBubble = null; // (point, big) => void
    this.group.updateMatrixWorld(true);
  }

  get objects() {
    return [this.group, this.props];
  }

  // Points on the ship in world space: the hole in its side, the portholes, the mast top.
  hole(out) {
    return out.copy(onHull(0.75, 0.82, 1).at).add(_v.set(0, 0, 0.2)).applyMatrix4(this.mesh.matrixWorld);
  }

  porthole(i, out) {
    const xs = [-1.3, -0.35, 1.55];
    return out.copy(onHull(xs[i % 3], 0.48, 1).at).applyMatrix4(this.mesh.matrixWorld);
  }

  // Spheres covering the hull and the sail (for tapping and for keeping fish clear).
  spheres() {
    this.group.updateMatrixWorld(true);
    const m = this.mesh.matrixWorld;
    return [
      { at: new THREE.Vector3(-2.1, 0.0, 0).applyMatrix4(m), r: 1.7 },
      { at: new THREE.Vector3(0.0, -0.2, 0).applyMatrix4(m), r: 1.7 },
      { at: new THREE.Vector3(2.1, -0.2, 0).applyMatrix4(m), r: 1.5 },
      { at: new THREE.Vector3(0.5, 2.6, 0).applyMatrix4(m), r: 1.4 },
    ];
  }

  // Tapped: it rocks and its windows flash. Returns true when treasure may come out (not
  // more often than every few seconds).
  poke(now) {
    this.rock.kick(0.55);
    this.flash = 1;
    if (now - this.lastTreasure < 3.5) return false;
    this.lastTreasure = now;
    return true;
  }

  update(t, dt) {
    const r = this.rock.update(dt);
    this.group.rotation.x = this.baseRoll + r * 0.12;
    this.group.rotation.z = 0.05 + r * 0.05;
    this.flash *= Math.exp(-dt * 2.5);
    this.material.uniforms.uFlash.value = this.flash;
    // now and then a bubble escapes from the hold or a porthole
    this.bubbleT -= dt;
    if (this.bubbleT <= 0) {
      this.bubbleT = 0.5 + Math.random() * 1.1;
      if (Math.random() < 0.6) this.onBubble?.(this.hole(_v), false);
      else this.onBubble?.(this.porthole(Math.floor(Math.random() * 3), _v), false);
    }
  }
}
