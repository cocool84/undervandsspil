// Procedural fish geometry for the four body shapes. Every part (body, tail, fins, eyes,
// puffer spikes) is merged into one BufferGeometry so a fish is a single draw call.
//
// Local frame: the fish swims along +x (nose at +len/2), y is up, z is its left side.
// Paint UVs: u runs nose → tail tip (body 0..0.8, tail 0.8..1), v runs top → bottom and is
// mirrored, so a painting on one side shows on both. Fins borrow the colour of the body
// edge they grow from.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { smoothstep } from '../util/math.js';

export const PART = { BODY: 0, TAIL: 1, FIN: 2, PECTORAL: 3, EYE: 4, SPIKE: 5 };
export const BODY_U = 0.8;

export const SHAPE_DEFS = [
  {
    name: 'round',
    len: 1.5, H: 0.62, W: 0.34, p: 0.62, q: 0.85, ped: 0.2, belly: 1.08, arch: 0.05,
    tail: { len: 0.78, spread: 0.66, fork: 0.42, round: 0 },
    dorsal: { from: 0.16, to: 0.74, height: 0.34, sweep: 0.35, exp: 0.6 },
    anal: { from: 0.56, to: 0.86, height: 0.22, sweep: 0.3, exp: 0.7 },
    pectoral: { at: 0.34, len: 0.34, width: 0.2 },
    eye: { at: 0.2, up: 0.3, r: 0.215 },
    mouthY: 0.16, waveK: 3.2, swimAmp: 0.15,
  },
  {
    name: 'long',
    len: 2.25, H: 0.3, W: 0.24, p: 0.55, q: 0.45, ped: 0.5, belly: 1.0, arch: 0.02,
    tail: { len: 0.5, spread: 0.36, fork: 0, round: 0.5 },
    dorsal: { from: 0.22, to: 0.98, height: 0.2, sweep: 0.05, exp: 0.2 },
    anal: { from: 0.55, to: 0.98, height: 0.13, sweep: 0.05, exp: 0.25 },
    pectoral: { at: 0.2, len: 0.26, width: 0.14 },
    eye: { at: 0.12, up: 0.32, r: 0.175 },
    mouthY: 0.22, waveK: 6.0, swimAmp: 0.17,
  },
  {
    name: 'triangle',
    len: 1.2, H: 0.66, W: 0.17, p: 0.7, q: 0.8, ped: 0.24, belly: 1.0, arch: 0.04,
    tail: { len: 0.42, spread: 0.44, fork: 0.18, round: 0 },
    dorsal: { from: 0.22, to: 0.82, height: 1.0, sweep: 0.8, exp: 0.55 },
    anal: { from: 0.36, to: 0.86, height: 0.92, sweep: 0.72, exp: 0.55 },
    pectoral: { at: 0.36, len: 0.26, width: 0.15 },
    eye: { at: 0.22, up: 0.3, r: 0.205 },
    mouthY: 0.12, waveK: 2.6, swimAmp: 0.1,
  },
  {
    name: 'puffer',
    len: 1.12, H: 0.54, W: 0.52, p: 0.95, q: 0.72, ped: 0.24, belly: 1.06, arch: 0.03,
    tail: { len: 0.32, spread: 0.3, fork: 0, round: 0.6 },
    dorsal: { from: 0.66, to: 0.84, height: 0.17, sweep: 0.3, exp: 0.6 },
    anal: { from: 0.66, to: 0.84, height: 0.14, sweep: 0.3, exp: 0.6 },
    pectoral: { at: 0.42, len: 0.22, width: 0.17 },
    eye: { at: 0.26, up: 0.36, r: 0.22 },
    mouthY: 0.18, waveK: 2.0, swimAmp: 0.05, spikes: 64,
  },
];

// ---------------------------------------------------------------- helpers

export function makeGeometry(positions, uvs, indices, attrs) {
  const g = new THREE.BufferGeometry();
  const n = positions.length / 3;
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(indices);
  g.setAttribute('aPart', new THREE.Float32BufferAttribute(attrs.part ?? new Array(n).fill(0), 1));
  g.setAttribute('aU', new THREE.Float32BufferAttribute(attrs.u, 1));
  g.setAttribute('aFin', new THREE.Float32BufferAttribute(attrs.fin ?? new Array(n).fill(0), 1));
  g.setAttribute('aEye', new THREE.Float32BufferAttribute(attrs.eye ?? new Array(n * 4).fill(0), 4));
  g.setAttribute('aEyeC', new THREE.Float32BufferAttribute(attrs.eyeC ?? new Array(n * 3).fill(0), 3));
  g.computeVertexNormals();
  // Collapsed fin corners only touch zero-area triangles; a zero normal would become NaN in
  // the shader, and bloom would smear that NaN across the whole screen.
  const nrm = g.attributes.normal;
  for (let i = 0; i < n; i++) {
    if (Math.hypot(nrm.getX(i), nrm.getY(i), nrm.getZ(i)) < 1e-6) nrm.setXYZ(i, 0, 0, 1);
  }
  return g;
}

// A (nu+1)×(nv+1) grid. fn(a, b) → { p:[x,y,z], uv:[u,v], u, fin }
export function grid(nu, nv, part, fn) {
  const pos = [];
  const uvs = [];
  const u = [];
  const fin = [];
  const parts = [];
  const idx = [];
  for (let i = 0; i <= nu; i++) {
    for (let j = 0; j <= nv; j++) {
      const v = fn(i / nu, j / nv);
      pos.push(...v.p);
      uvs.push(...v.uv);
      u.push(v.u);
      fin.push(v.fin ?? 0);
      parts.push(part);
    }
  }
  const row = nv + 1;
  for (let i = 0; i < nu; i++) {
    for (let j = 0; j < nv; j++) {
      const a = i * row + j;
      const b = (i + 1) * row + j;
      const c = i * row + j + 1;
      const d = (i + 1) * row + j + 1;
      idx.push(a, b, c, b, d, c);
    }
  }
  return makeGeometry(pos, uvs, idx, { part: parts, u, fin });
}

// ---------------------------------------------------------------- the builder

export function buildFishGeometry(shapeIndex) {
  const d = SHAPE_DEFS[shapeIndex];
  const total = d.len + d.tail.len;
  const profile = (t) => {
    const s = Math.pow(Math.max(Math.sin(Math.PI * Math.pow(t, d.p)), 0), d.q);
    const k = smoothstep(0.68, 1.0, t);
    return s * (1 - k) + d.ped * k;
  };
  const h = (t) => d.H * profile(t);
  const w = (t) => d.W * Math.pow(profile(t), 0.92);
  const yc = (t) => d.arch * d.H * Math.sin(Math.PI * t);
  const xAt = (t) => d.len / 2 - t * d.len;
  const uAt = (x) => (d.len / 2 - x) / total;
  const bodyPoint = (t, th) => {
    const c = Math.cos(th);
    const s = Math.sin(th);
    return [xAt(t), yc(t) + h(t) * c * (c < 0 ? d.belly : 1), w(t) * s];
  };
  const parts = [];

  // ---- body: rings from just behind the nose to the tail root, plus caps
  {
    const NT = 30;
    const NTH = 28;
    const pos = [];
    const uvs = [];
    const u = [];
    const idx = [];
    const row = NTH + 1;
    for (let i = 0; i <= NT; i++) {
      const t = 0.0025 + (1 - 0.0025) * Math.pow(i / NT, 1.35);
      for (let j = 0; j <= NTH; j++) {
        const th = (j / NTH) * Math.PI * 2;
        const p = bodyPoint(t, th);
        pos.push(...p);
        const v = th <= Math.PI ? th / Math.PI : (2 * Math.PI - th) / Math.PI;
        uvs.push(t * BODY_U, v);
        u.push(uAt(p[0]));
      }
    }
    for (let i = 0; i < NT; i++) {
      for (let j = 0; j < NTH; j++) {
        const a = i * row + j;
        const b = (i + 1) * row + j;
        const c = i * row + j + 1;
        const e = (i + 1) * row + j + 1;
        idx.push(a, b, c, b, e, c);
      }
    }
    // nose tip
    const tip = pos.length / 3;
    pos.push(d.len / 2 + 0.004, yc(0), 0);
    uvs.push(0, 0.5);
    u.push(0);
    for (let j = 0; j < NTH; j++) idx.push(tip, j, j + 1);
    // tail-root cap
    const cap = pos.length / 3;
    pos.push(xAt(1) - 0.01, yc(1), 0);
    uvs.push(BODY_U, 0.5);
    u.push(uAt(xAt(1)));
    const last = NT * row;
    for (let j = 0; j < NTH; j++) idx.push(cap, last + j + 1, last + j);
    parts.push(makeGeometry(pos, uvs, idx, { u }));
  }

  // ---- tail fan
  {
    const tl = d.tail;
    const hb = h(1) * 0.95;
    const xPed = xAt(1) + 0.02;
    parts.push(grid(10, 12, PART.TAIL, (a, b) => {
      const s = 1 - 2 * b; // +1 top … −1 bottom
      const L = tl.len * (1 - tl.fork * Math.pow(1 - Math.abs(s), 1.6)) * (1 - tl.round * s * s * 0.45);
      const x = xPed - a * L;
      const y = yc(1) + s * (hb + (tl.spread - hb) * Math.pow(a, 0.85));
      return { p: [x, y, 0], uv: [BODY_U + (1 - BODY_U) * a, (1 - s) / 2], u: uAt(x), fin: a };
    }));
  }

  // ---- dorsal and anal fins
  for (const [fin, top] of [[d.dorsal, true], [d.anal, false]]) {
    parts.push(grid(12, 4, PART.FIN, (a, b) => {
      const t = fin.from + a * (fin.to - fin.from);
      const prof = Math.pow(Math.max(Math.sin(Math.PI * a), 0), fin.exp);
      const fh = fin.height * prof;
      const base = top ? yc(t) + h(t) * 0.94 : yc(t) - h(t) * d.belly * 0.94;
      const x = xAt(t) - fin.sweep * b * fh;
      const y = base + (top ? 1 : -1) * b * fh;
      return { p: [x, y, 0], uv: [t * BODY_U, top ? 0.015 : 0.985], u: uAt(x), fin: b };
    }));
  }

  // ---- pectoral fins (one each side)
  for (const side of [1, -1]) {
    const pc = d.pectoral;
    const t = pc.at;
    const base = new THREE.Vector3(xAt(t), yc(t) - h(t) * 0.22, side * w(t) * 1.0);
    const dir = new THREE.Vector3(-1, -0.3, side * 0.8).normalize();
    const across = new THREE.Vector3(0.15, 1, side * 0.1).normalize();
    parts.push(grid(5, 4, PART.PECTORAL, (a, b) => {
      const hw = pc.width * 1.3 * Math.pow(Math.sin(Math.PI * (0.12 + 0.86 * a)), 0.6);
      const p = base.clone().addScaledVector(dir, a * pc.len).addScaledVector(across, (b - 0.5) * hw);
      return { p: [p.x, p.y, p.z], uv: [t * BODY_U, 0.55], u: uAt(p.x), fin: a };
    }));
  }

  // ---- eyes
  const te = d.eye.at;
  const eyes = eyeDomes({ x: xAt(te), y: yc(te) + h(te) * d.eye.up, z: w(te) * Math.sqrt(Math.max(1 - d.eye.up * d.eye.up, 0.1)), r: d.eye.r, t: te, uAt });
  parts.push(...eyes.parts);
  const eyeCentres = eyes.centres;

  // ---- puffer spikes: soft little cones all over that grow when it puffs up
  if (d.spikes) {
    const golden = Math.PI * (3 - Math.sqrt(5));
    for (let k = 0; k < d.spikes; k++) {
      const yN = 1 - (k / (d.spikes - 1)) * 2;
      const rr = Math.sqrt(1 - yN * yN);
      const phi = k * golden;
      const t = 0.18 + 0.64 * (0.5 + 0.5 * Math.cos(phi) * rr);
      const th = Math.acos(Math.max(-1, Math.min(1, yN)));
      const thFull = Math.sin(phi) >= 0 ? th : Math.PI * 2 - th;
      const p = new THREE.Vector3(...bodyPoint(t, thFull));
      if (eyeCentres.some((c) => c.distanceTo(p) < d.eye.r * 1.6)) continue;
      const nrm = new THREE.Vector3(0, p.y - yc(t), p.z).normalize();
      const cone = new THREE.ConeGeometry(0.034, 0.12, 5, 1);
      cone.translate(0, 0.06, 0);
      cone.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), nrm));
      const basePt = p.clone().addScaledVector(nrm, -0.015);
      cone.translate(basePt.x, basePt.y, basePt.z);
      const cp = cone.attributes.position;
      const n = cp.count;
      const pos = [];
      const uvs = [];
      const u = [];
      const fin = [];
      const eyeC = [];
      const partA = [];
      const v = th <= Math.PI ? thFull / Math.PI : (2 * Math.PI - thFull) / Math.PI;
      for (let i = 0; i < n; i++) {
        pos.push(cp.getX(i), cp.getY(i), cp.getZ(i));
        uvs.push(t * BODY_U, Math.min(Math.max(v, 0), 1));
        u.push(uAt(cp.getX(i)));
        fin.push(Math.min(1, new THREE.Vector3(cp.getX(i), cp.getY(i), cp.getZ(i)).distanceTo(basePt) / 0.12));
        eyeC.push(basePt.x, basePt.y, basePt.z);
        partA.push(PART.SPIKE);
      }
      parts.push(makeGeometry(pos, uvs, Array.from(cone.index.array), { part: partA, u, fin, eyeC }));
      cone.dispose();
    }
  }

  const geometry = mergeGeometries(parts, false);
  parts.forEach((g) => g.dispose());
  geometry.computeBoundingSphere();
  geometry.boundingSphere.radius *= 1.35;

  const eyeY = yc(te) + h(te) * d.eye.up;
  const meta = {
    def: d,
    len: d.len,
    total,
    radius: Math.max(total * 0.5, d.H + 0.1),
    // nose x, mouth y, mouth length, blush radius
    face: new THREE.Vector4(d.len / 2 + 0.004, yc(0.04) - d.H * d.mouthY, 0.12 + d.len * 0.025, d.eye.r * 0.55),
    // blush centre x, y, min |z| (sides only), base strength
    blush: new THREE.Vector4(xAt(te) - d.eye.r * 0.15, eyeY - d.eye.r * 1.35, w(te) * 0.45, 0.42),
    eyeCentres,
  };
  return { geometry, meta };
}

// Eyes: domes sunk into the head, with an eye-local frame for drawing in the shader.
// (x, y, z) is where the left eye (z > 0) sits on the skin, `t` its place along the body,
// `sink` how deep (in eye radii) the dome sits in the head.
export function eyeDomes({ x, y, z, r, t, uAt, sink = 0.3 }) {
  const parts = [];
  const centres = [];
  for (const side of [1, -1]) {
    const Z = new THREE.Vector3(0.28, 0.14, side).normalize();
    const X = new THREE.Vector3(1, 0, 0).addScaledVector(Z, -Z.x).normalize();
    const Y = side > 0 ? new THREE.Vector3().crossVectors(Z, X) : new THREE.Vector3().crossVectors(X, Z);
    const centre = new THREE.Vector3(x, y, side * z).addScaledVector(Z, -r * sink);
    const FLAT = 0.6; // dome height relative to its radius
    centres.push(centre);
    const dome = new THREE.SphereGeometry(1, 22, 14, 0, Math.PI * 2, 0, Math.PI / 2);
    dome.rotateX(Math.PI / 2); // pole → +z (outward)
    const src = dome.attributes.position;
    const nrm = dome.attributes.normal;
    const n = src.count;
    const pos = [];
    const uvs = [];
    const u = [];
    const eye = [];
    const eyeC = [];
    const partA = [];
    const tmp = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      const lx = src.getX(i);
      const ly = src.getY(i);
      const lz = src.getZ(i);
      tmp.copy(centre).addScaledVector(X, lx * r).addScaledVector(Y, ly * r).addScaledVector(Z, lz * r * FLAT);
      pos.push(tmp.x, tmp.y, tmp.z);
      uvs.push(t * BODY_U, 0.4);
      u.push(uAt(tmp.x));
      eye.push(lx, ly, lz, side);
      eyeC.push(centre.x, centre.y, centre.z);
      partA.push(PART.EYE);
    }
    const g = makeGeometry(pos, uvs, Array.from(dome.index.array), { part: partA, u, eye, eyeC });
    // exact sphere normals in the fish frame
    const gn = g.attributes.normal;
    for (let i = 0; i < n; i++) {
      tmp.set(0, 0, 0).addScaledVector(X, nrm.getX(i)).addScaledVector(Y, nrm.getY(i)).addScaledVector(Z, nrm.getZ(i) / FLAT).normalize();
      gn.setXYZ(i, tmp.x, tmp.y, tmp.z);
    }
    dome.dispose();
    parts.push(g);
  }
  return { parts, centres };
}
