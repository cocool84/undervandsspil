// The big animals of the open sea: dolphin, shark, orca and whale (shapes 4–7). Built like
// the fish (see geometry.js): one merged geometry each, the same local frame (swimming along
// +x, nose at +len/2, y up) and the same paint layout, so the fish shader, finger painting
// and the factory work for them as well. At this size a paper-thin fin would show, so fins,
// flippers and flukes have a little thickness. Dolphins, orcas and whales beat their flukes
// up and down; the shark swings its tail from side to side.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PART, BODY_U, makeGeometry, eyeDomes } from './geometry.js';

export const FIRST_ANIMAL = 4;

// Body profiles are [t, value] points along the body (t: 0 nose … 1 tail root): half-height
// above (top) and below (bot) the centre line, half-width (wid) and the centre line (yc).
const DEFS = {
  4: {
    name: 'dolphin', species: 1, vertical: 1, len: 2.7,
    top: [[0, 0.035], [0.05, 0.05], [0.09, 0.08], [0.14, 0.21], [0.21, 0.31], [0.33, 0.38], [0.46, 0.39], [0.62, 0.33], [0.78, 0.22], [0.9, 0.14], [1, 0.09]],
    bot: [[0, 0.03], [0.05, 0.045], [0.09, 0.07], [0.15, 0.17], [0.25, 0.29], [0.4, 0.34], [0.55, 0.3], [0.72, 0.2], [0.88, 0.11], [1, 0.07]],
    wid: [[0, 0.035], [0.05, 0.05], [0.09, 0.08], [0.15, 0.18], [0.26, 0.28], [0.42, 0.3], [0.58, 0.25], [0.76, 0.14], [0.9, 0.07], [1, 0.05]],
    yc: [[0, -0.075], [0.08, -0.065], [0.16, -0.02], [0.3, 0], [1, 0.03]],
    eye: { at: 0.18, up: 0.3, r: 0.12 },
    mouth: { y: -0.08, len: 0.14, k: 0.32, w: 0.013 },
    blow: 0.2,
    dorsal: [{ from: 0.4, to: 0.6, height: 0.42, sweep: 0.8, lead: 0.12, hook: 0.25, thick: 0.035 }],
    flipper: { at: 0.25, len: 0.5, width: 0.17, down: 0.75, back: 0.8, out: 0.55, shape: 'pointed', sweepTip: 0.12, thick: 0.03 },
    flukes: { span: 0.55, chord: 0.34, sweep: 0.2, notch: 0.06, lift: 0.16, thick: 0.03 },
    swimAmp: 0.13, waveK: 1.6, finAmp: 1.2,
  },
  5: {
    name: 'shark', species: 2, vertical: 0, len: 3.1,
    top: [[0, 0.06], [0.05, 0.13], [0.12, 0.25], [0.22, 0.37], [0.36, 0.44], [0.5, 0.42], [0.66, 0.3], [0.8, 0.19], [0.92, 0.12], [1, 0.09]],
    bot: [[0, 0.055], [0.05, 0.11], [0.12, 0.21], [0.22, 0.31], [0.36, 0.36], [0.5, 0.32], [0.66, 0.21], [0.8, 0.12], [0.92, 0.08], [1, 0.06]],
    wid: [[0, 0.06], [0.05, 0.13], [0.12, 0.23], [0.22, 0.32], [0.36, 0.36], [0.5, 0.32], [0.66, 0.21], [0.8, 0.13], [0.92, 0.09], [1, 0.07]],
    yc: [[0, 0.06], [0.1, 0.03], [0.3, 0], [1, 0.03]],
    eye: { at: 0.14, up: 0.42, r: 0.13 },
    mouth: { y: 0.0, len: 0.13, k: 0.35, w: 0.016 },
    blow: null,
    dorsal: [
      { from: 0.34, to: 0.5, height: 0.55, sweep: 0.75, lead: 0.06, hook: 0.2, thick: 0.04 },
      { from: 0.78, to: 0.85, height: 0.14, sweep: 0.6, lead: 0, hook: 0.2, thick: 0.02 },
      { from: 0.79, to: 0.85, height: 0.11, sweep: 0.6, lead: 0, hook: 0.2, thick: 0.02, below: true },
    ],
    flipper: { at: 0.27, len: 0.7, width: 0.3, down: 0.85, back: 0.9, out: 0.5, shape: 'pointed', sweepTip: 0.22, thick: 0.035 },
    caudal: { up: 0.8, down: 0.45, sweepUp: 0.6, sweepDown: 0.25, chord: 0.34, thick: 0.035 },
    swimAmp: 0.15, waveK: 3.0, finAmp: 0.5,
  },
  6: {
    name: 'orca', species: 3, vertical: 1, len: 3.8,
    top: [[0, 0.24], [0.05, 0.36], [0.12, 0.46], [0.22, 0.54], [0.36, 0.58], [0.5, 0.55], [0.66, 0.43], [0.8, 0.3], [0.92, 0.19], [1, 0.13]],
    bot: [[0, 0.22], [0.05, 0.34], [0.12, 0.44], [0.22, 0.5], [0.36, 0.52], [0.5, 0.47], [0.66, 0.34], [0.8, 0.21], [0.92, 0.13], [1, 0.09]],
    wid: [[0, 0.24], [0.05, 0.35], [0.12, 0.43], [0.22, 0.48], [0.36, 0.5], [0.5, 0.45], [0.66, 0.32], [0.8, 0.18], [0.92, 0.1], [1, 0.07]],
    yc: [[0, -0.08], [0.12, -0.03], [0.3, 0], [1, 0.04]],
    eye: { at: 0.15, up: 0.1, r: 0.14 },
    mouth: { y: -0.14, len: 0.11, k: 0.35, w: 0.016 },
    blow: 0.17,
    dorsal: [{ from: 0.38, to: 0.53, height: 0.95, sweep: 0.3, lead: 0.05, hook: 0.08, thick: 0.05 }],
    flipper: { at: 0.24, len: 0.62, width: 0.34, down: 0.8, back: 0.55, out: 0.6, shape: 'paddle', sweepTip: 0.08, thick: 0.045 },
    flukes: { span: 0.8, chord: 0.46, sweep: 0.3, notch: 0.08, lift: 0.15, thick: 0.045 },
    swimAmp: 0.15, waveK: 1.5, finAmp: 1.4,
  },
  7: {
    name: 'whale', species: 4, vertical: 1, len: 4.9,
    top: [[0, 0.3], [0.04, 0.5], [0.1, 0.66], [0.2, 0.78], [0.32, 0.8], [0.46, 0.73], [0.62, 0.56], [0.78, 0.36], [0.9, 0.23], [1, 0.16]],
    bot: [[0, 0.32], [0.04, 0.56], [0.1, 0.78], [0.2, 0.9], [0.32, 0.86], [0.46, 0.72], [0.62, 0.5], [0.78, 0.29], [0.9, 0.17], [1, 0.11]],
    wid: [[0, 0.32], [0.04, 0.52], [0.1, 0.68], [0.2, 0.78], [0.32, 0.78], [0.46, 0.7], [0.62, 0.52], [0.78, 0.3], [0.9, 0.16], [1, 0.11]],
    yc: [[0, -0.12], [0.15, -0.06], [0.3, 0], [1, 0.08]],
    eye: { at: 0.23, up: 0.15, r: 0.17 },
    mouth: { y: -0.16, len: 0.21, k: 0.15, w: 0.022 },
    blow: 0.12,
    dorsal: [{ from: 0.6, to: 0.7, height: 0.2, sweep: 0.9, lead: 0.05, hook: 0.1, thick: 0.05 }],
    flipper: { at: 0.27, len: 1.25, width: 0.36, down: 0.45, back: 0.9, out: 0.75, shape: 'long', sweepTip: 0.35, thick: 0.05 },
    flukes: { span: 1.1, chord: 0.6, sweep: 0.38, notch: 0.1, lift: 0.2, thick: 0.05, scallop: true },
    swimAmp: 0.16, waveK: 1.2, finAmp: 2.2,
  },
};

// ---------------------------------------------------------------- helpers

// A smooth curve through [t, value] points (monotone cubic: it never overshoots them).
function curve(points) {
  const n = points.length;
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const d = [];
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
  const m = [d[0]];
  for (let i = 1; i < n - 1; i++) m.push(d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2);
  m.push(d[n - 2]);
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = m[i] / d[i];
    const b = m[i + 1] / d[i];
    const s = a * a + b * b;
    if (s > 9) {
      const k = 3 / Math.sqrt(s);
      m[i] = k * a * d[i];
      m[i + 1] = k * b * d[i];
    }
  }
  return (t) => {
    if (t <= xs[0]) return ys[0];
    if (t >= xs[n - 1]) return ys[n - 1];
    let i = 0;
    while (t > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i];
    const s = (t - xs[i]) / h;
    const s2 = s * s;
    const s3 = s2 * s;
    return (2 * s3 - 3 * s2 + 1) * ys[i] + (s3 - 2 * s2 + s) * h * m[i] + (-2 * s3 + 3 * s2) * ys[i + 1] + (s3 - s2) * h * m[i + 1];
  };
}

// Two skins either side of a mid-surface, meeting where the thickness runs out at the edges.
// fn(a, b) → { p: [x, y, z], n: [x, y, z] (unit), t: half thickness, uv, fin }.
function thickSurface(nu, nv, part, uAt, fn) {
  const skins = [];
  for (const side of [1, -1]) {
    const pos = [];
    const uvs = [];
    const u = [];
    const fin = [];
    const parts = [];
    const idx = [];
    for (let i = 0; i <= nu; i++) {
      for (let j = 0; j <= nv; j++) {
        const v = fn(i / nu, j / nv);
        const x = v.p[0] + v.n[0] * v.t * side;
        pos.push(x, v.p[1] + v.n[1] * v.t * side, v.p[2] + v.n[2] * v.t * side);
        uvs.push(v.uv[0], v.uv[1]);
        u.push(uAt(x));
        fin.push(v.fin);
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
        if (side > 0) idx.push(a, b, c, b, d, c);
        else idx.push(a, c, b, b, c, d);
      }
    }
    skins.push(makeGeometry(pos, uvs, idx, { part: parts, u, fin }));
  }
  return skins;
}

const bump = (a) => Math.pow(Math.max(Math.sin(Math.PI * a), 0), 0.6); // 0 at both edges

// ---------------------------------------------------------------- the builder

export function buildAnimalGeometry(shape) {
  const d = DEFS[shape];
  const top = curve(d.top);
  const bot = curve(d.bot);
  const wid = curve(d.wid);
  const yc = curve(d.yc);
  const tailLen = d.flukes ? d.flukes.chord + d.flukes.sweep * 0.6 : d.caudal.chord + d.caudal.sweepUp * 0.7;
  const total = d.len + tailLen;
  const xAt = (t) => d.len / 2 - t * d.len;
  const uAt = (x) => Math.min(Math.max((d.len / 2 - x) / total, 0), 1);
  const tAt = (x) => Math.min(Math.max((d.len / 2 - x) / d.len, 0), 1);
  // a round nose: the profiles start as a quarter ellipse over the nose's own radius
  const capR = Math.max(d.top[0][1], d.bot[0][1], d.wid[0][1]);
  const cap = (t) => {
    const k = Math.min(t / (capR / d.len), 1);
    return Math.sqrt(Math.max(1 - (1 - k) * (1 - k), 0));
  };
  const surface = (t, th) => {
    const c = Math.cos(th);
    const s = Math.sin(th);
    const k = cap(t);
    return [xAt(t), yc(t) + (c > 0 ? top(t) : bot(t)) * c * k, wid(t) * s * k];
  };
  const parts = [];

  // ---- body: rings from the nose to the tail root, plus caps
  {
    const NT = 48;
    const NTH = 32;
    const pos = [];
    const uvs = [];
    const u = [];
    const idx = [];
    const row = NTH + 1;
    for (let i = 0; i <= NT; i++) {
      const t = 0.0006 + (1 - 0.0006) * Math.pow(i / NT, 1.7);
      for (let j = 0; j <= NTH; j++) {
        const th = (j / NTH) * Math.PI * 2;
        const p = surface(t, th);
        pos.push(...p);
        uvs.push(t * BODY_U, th <= Math.PI ? th / Math.PI : (2 * Math.PI - th) / Math.PI);
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
    const tip = pos.length / 3;
    pos.push(d.len / 2 + 0.002, yc(0), 0);
    uvs.push(0, 0.5);
    u.push(0);
    for (let j = 0; j < NTH; j++) idx.push(tip, j, j + 1);
    const end = pos.length / 3;
    pos.push(xAt(1) - 0.01, yc(1), 0);
    uvs.push(BODY_U, 0.5);
    u.push(uAt(xAt(1)));
    const last = NT * row;
    for (let j = 0; j < NTH; j++) idx.push(end, last + j + 1, last + j);
    parts.push(makeGeometry(pos, uvs, idx, { u }));
  }

  // ---- dorsal fins (and the shark's little fins underneath): curved triangles on the back
  for (const f of d.dorsal) {
    const sign = f.below ? -1 : 1;
    const rootY = (t) => yc(t) + sign * (f.below ? bot(t) : top(t)) * 0.9;
    const xF = xAt(f.from);
    const xB = xAt(f.to);
    const tipX = xF - f.sweep * f.height;
    const tipY = rootY((f.from + f.to) / 2) + sign * f.height;
    parts.push(...thickSurface(12, 8, PART.FIN, uAt, (a, b) => {
      const rx = xF + (xB - xF) * a;
      const ry = rootY(tAt(rx));
      // a convex leading edge, a hollow (hooked) trailing edge
      const bend = Math.sin(Math.PI * b) * f.height * (f.lead * (1 - a) + f.hook * a);
      const x = rx + (tipX - rx) * b + bend;
      const y = ry + (tipY - ry) * b;
      return { p: [x, y, 0], n: [0, 0, 1], t: f.thick * bump(a) * Math.pow(1 - b, 0.5) + 0.004, uv: [tAt(rx) * BODY_U, f.below ? 0.985 : 0.015], fin: b };
    }));
  }

  // ---- flukes (up-and-down swimmers): a swept crescent with a notch, lying flat
  if (d.flukes) {
    const k = d.flukes;
    const x0 = xAt(1) + 0.08;
    const y0 = yc(1);
    parts.push(...thickSurface(10, 24, PART.TAIL, uAt, (a, b) => {
      const s = b * 2 - 1; // −1 … 1 across the span
      const as = Math.abs(s);
      const xLE = x0 - k.sweep * Math.pow(as, 1.3);
      let chord = k.chord * Math.sqrt(Math.max(1 - Math.pow(as, 3), 0)) + 0.01;
      chord -= k.notch * Math.exp(-(s * s) / 0.012);
      if (k.scallop) chord += 0.025 * Math.sin(as * 26) * as;
      const x = xLE - a * chord;
      // tips lifted a little, so the flukes still read from the side
      return { p: [x, y0 + 0.03 * (1 - as) + k.lift * k.span * Math.pow(as, 1.5), s * k.span], n: [0, 1, 0], t: k.thick * bump(a) * Math.pow(Math.max(1 - as * as, 0), 0.6) + 0.003, uv: [BODY_U + (1 - BODY_U) * a, (1 - s) / 2], fin: as };
    }));
  }

  // ---- the shark's tail: a tall upper lobe and a short lower one, standing upright
  if (d.caudal) {
    const k = d.caudal;
    const x0 = xAt(1) + 0.08;
    const y0 = yc(1);
    parts.push(...thickSurface(10, 24, PART.TAIL, uAt, (a, b) => {
      const s = b * 2 - 1; // −1 bottom … 1 top
      const as = Math.abs(s);
      const up = s > 0;
      const xLE = x0 - (up ? k.sweepUp : k.sweepDown) * Math.pow(as, 1.2);
      const chord = k.chord * Math.pow(1 - as, 0.8) + 0.02;
      const x = xLE - a * chord;
      const y = y0 + s * (up ? k.up : k.down);
      return { p: [x, y, 0], n: [0, 0, 1], t: k.thick * bump(a) * Math.pow(1 - as, 0.6) + 0.003, uv: [BODY_U + (1 - BODY_U) * a, (1 - s) / 2], fin: as };
    }));
  }

  // ---- flippers, one each side
  {
    const fl = d.flipper;
    const t = fl.at;
    for (const side of [1, -1]) {
      const th = side > 0 ? 2.05 : Math.PI * 2 - 2.05; // a little below the middle of the flank
      const base = new THREE.Vector3(...surface(t, th));
      base.z *= 0.92;
      const dir = new THREE.Vector3(-fl.back, -fl.down, side * fl.out).normalize();
      const across = new THREE.Vector3(1, 0, 0).addScaledVector(dir, -dir.x).normalize();
      const nrm = new THREE.Vector3().crossVectors(dir, across).normalize();
      const width = (b) => {
        if (fl.shape === 'paddle') return fl.width * Math.sqrt(Math.max(1 - Math.pow((b - 0.45) / 0.56, 2), 0)) + 0.02;
        if (fl.shape === 'long') return fl.width * (1 - 0.45 * b) * Math.sqrt(Math.max(1 - Math.pow(b, 6), 0)) + 0.02;
        return fl.width * Math.pow(1 - b, 0.85) * (1 + 0.35 * Math.sin(Math.PI * b)) + 0.01;
      };
      parts.push(...thickSurface(6, 14, PART.PECTORAL, uAt, (a, b) => {
        let w = width(b);
        // the humpback's long flippers have a bumpy leading edge
        const knobs = fl.shape === 'long' && a < 0.3 ? 0.03 * Math.max(Math.sin(b * 34), 0) * (1 - a / 0.3) : 0;
        const p = base.clone().addScaledVector(dir, b * fl.len).addScaledVector(across, (0.5 - a) * w + knobs - fl.sweepTip * b * b);
        return { p: [p.x, p.y, p.z], n: [nrm.x, nrm.y, nrm.z], t: fl.thick * bump(a) * Math.pow(1 - b * 0.85, 0.7) + 0.003, uv: [t * BODY_U, 0.62], fin: b };
      }));
    }
  }

  // ---- eyes
  const e = d.eye;
  const ey = yc(e.at) + (e.up >= 0 ? top(e.at) : bot(e.at)) * e.up;
  // (broad heads curve out above the eye: a shallower dome keeps the whole eye showing)
  const eyes = eyeDomes({ x: xAt(e.at), y: ey, z: wid(e.at) * Math.sqrt(Math.max(1 - e.up * e.up, 0.1)), r: e.r, t: e.at, uAt, sink: 0.08 });
  parts.push(...eyes.parts);

  const geometry = mergeGeometries(parts, false);
  parts.forEach((g) => g.dispose());
  geometry.computeBoundingSphere();
  geometry.boundingSphere.radius *= 1.35;

  const H = Math.max(...d.top.map((p) => p[1]));
  const W = Math.max(...d.wid.map((p) => p[1]));
  const def = { ...d, W, H };
  const meta = {
    def,
    len: d.len,
    total,
    radius: Math.max(total * 0.5, H + 0.1),
    species: d.species,
    // species, flukes up and down (1) or a tail from side to side (0), flipper flap, fin ripple
    animal: new THREE.Vector4(d.species, d.vertical, d.finAmp, 0.3),
    // nose x, mouth y, mouth length, blush radius
    face: new THREE.Vector4(d.len / 2 + 0.002, d.mouth.y, d.mouth.len * d.len, e.r * 0.62),
    // blush centre x, y, min |z| (sides only), base strength
    blush: new THREE.Vector4(xAt(e.at) - e.r * 0.3, ey - e.r * 1.45, wid(e.at) * 0.45, 0.38),
    mouthK: new THREE.Vector2(d.mouth.k, d.mouth.w),
    // eye x, y; blowhole x and the height of the back there (no blowhole: far away)
    marks: new THREE.Vector4(xAt(e.at), ey, d.blow ? xAt(d.blow) : -100, d.blow ? yc(d.blow) + top(d.blow) : 0),
    blowhole: d.blow ? new THREE.Vector3(xAt(d.blow), yc(d.blow) + top(d.blow), 0) : null,
    eyeCentres: eyes.centres,
  };
  return { geometry, meta };
}
