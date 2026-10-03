// Finger painting on the fish. Two layers: the base colour (a colour blob fills the whole
// fish) and the strokes on top (so a new blob never wipes a child's painting). Their
// composite is the fish's texture, 512×256, in the shared UV layout of all four shapes —
// a painting survives a change of shape, and both sides of the fish show it (mirrored v).
//
// A stroke is a row of soft dabs. The dab is an ellipse in texture space sized from the
// hit triangle, so on screen the brush stays round whatever the UV stretch.

import * as THREE from 'three';
import { PAINT_W, PAINT_H } from '../fish/paint.js';
import { PART } from '../fish/geometry.js';

const _ray = new THREE.Raycaster();
const _ndc = new THREE.Vector2();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();

export class Painter {
  constructor() {
    this.base = '#ff8a3d';
    this.strokes = document.createElement('canvas');
    this.strokes.width = PAINT_W;
    this.strokes.height = PAINT_H;
    this.sctx = this.strokes.getContext('2d');
    this.canvas = document.createElement('canvas');
    this.canvas.width = PAINT_W;
    this.canvas.height = PAINT_H;
    this.ctx = this.canvas.getContext('2d');
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4;
    this.hasStrokes = false;
    this.dirty = true;
    this.lines = new Map(); // pointerId → last dab {x, y}
    this.compose();
  }

  // What a Fish wears (see Fish constructor `paint`).
  get paint() {
    return { canvas: this.canvas, ctx: this.ctx, texture: this.texture };
  }

  setBase(hex) {
    this.base = hex;
    this.dirty = true;
  }

  clear() {
    this.sctx.clearRect(0, 0, PAINT_W, PAINT_H);
    this.hasStrokes = false;
    this.dirty = true;
  }

  compose() {
    if (!this.dirty) return;
    this.dirty = false;
    this.ctx.fillStyle = this.base;
    this.ctx.fillRect(0, 0, PAINT_W, PAINT_H);
    this.ctx.drawImage(this.strokes, 0, 0);
    this.texture.needsUpdate = true;
  }

  // Where does a screen point touch the fish? → texture position and brush size, or null.
  hit(mesh, camera, clientX, clientY, brushPx) {
    const w = window.innerWidth;
    const h = window.innerHeight;
    _ndc.set((clientX / w) * 2 - 1, -(clientY / h) * 2 + 1);
    _ray.setFromCamera(_ndc, camera);
    const hits = _ray.intersectObject(mesh, false);
    const part = mesh.geometry.attributes.aPart;
    const uv = mesh.geometry.attributes.uv;
    for (const it of hits) {
      if (!it.face || !it.uv || part.getX(it.face.a) === PART.EYE) continue;
      // the brush: a screen-space circle mapped into texture space by the hit triangle
      const { a, b, c } = it.face;
      const pa = toScreen(_a.fromBufferAttribute(mesh.geometry.attributes.position, a), mesh, camera, w, h);
      const pb = toScreen(_b.fromBufferAttribute(mesh.geometry.attributes.position, b), mesh, camera, w, h);
      const pc = toScreen(_c.fromBufferAttribute(mesh.geometry.attributes.position, c), mesh, camera, w, h);
      const s1x = pb.x - pa.x, s1y = pb.y - pa.y, s2x = pc.x - pa.x, s2y = pc.y - pa.y;
      const det = s1x * s2y - s2x * s1y;
      let rx = 14;
      let ry = 14;
      if (Math.abs(det) > 1e-3) {
        const u1 = uv.getX(b) - uv.getX(a), u2 = uv.getX(c) - uv.getX(a);
        const v1 = uv.getY(b) - uv.getY(a), v2 = uv.getY(c) - uv.getY(a);
        // d(uv)/d(screen) = UV · S⁻¹
        const m00 = (u1 * s2y - u2 * s1y) / det, m01 = (u2 * s1x - u1 * s2x) / det;
        const m10 = (v1 * s2y - v2 * s1y) / det, m11 = (v2 * s1x - v1 * s2x) / det;
        rx = brushPx * Math.hypot(m00, m01) * PAINT_W;
        ry = brushPx * Math.hypot(m10, m11) * PAINT_H;
      }
      return {
        x: it.uv.x * PAINT_W,
        y: (1 - it.uv.y) * PAINT_H, // CanvasTexture is flipped
        rx: Math.min(Math.max(rx, 3), 70),
        ry: Math.min(Math.max(ry, 3), 70),
        point: it.point,
      };
    }
    return null;
  }

  // Paint from the pointer's last dab to here, dab by dab.
  strokeTo(id, at, color) {
    const last = this.lines.get(id);
    if (last) {
      const dx = at.x - last.x;
      const dy = at.y - last.y;
      const step = Math.max(Math.min(at.rx, at.ry) * 0.35, 1);
      const n = Math.min(Math.ceil(Math.hypot(dx, dy) / step), 80);
      // a long jump (finger slid across the edge of the fish) starts a new line
      if (Math.hypot(dx, dy) < 90) {
        for (let i = 1; i <= n; i++) {
          const k = i / n;
          this.dab(last.x + dx * k, last.y + dy * k, last.rx + (at.rx - last.rx) * k, last.ry + (at.ry - last.ry) * k, color);
        }
      } else {
        this.dab(at.x, at.y, at.rx, at.ry, color);
      }
    } else {
      this.dab(at.x, at.y, at.rx, at.ry, color);
    }
    this.lines.set(id, { x: at.x, y: at.y, rx: at.rx, ry: at.ry });
  }

  endStroke(id) {
    this.lines.delete(id);
  }

  dab(x, y, rx, ry, color) {
    const g = this.sctx;
    g.save();
    g.translate(x, y);
    g.scale(rx, ry);
    const grad = g.createRadialGradient(0, 0, 0, 0, 0, 1);
    grad.addColorStop(0, color);
    grad.addColorStop(0.6, color);
    grad.addColorStop(1, hexAlpha(color, 0));
    g.fillStyle = grad;
    g.beginPath();
    g.arc(0, 0, 1, 0, Math.PI * 2);
    g.fill();
    g.restore();
    this.hasStrokes = true;
    this.dirty = true;
  }

  // The magic wand's painting: dots, waves, spots, hearts or a two-tone fade.
  wandPaint(rnd, colors) {
    this.clear();
    const g = this.sctx;
    const [c1, c2] = colors;
    const kind = Math.floor(rnd() * 5);
    if (kind === 0) {
      for (let i = 0; i < 46; i++) this.dab(rnd() * PAINT_W * 0.82, rnd() * PAINT_H, 9 + rnd() * 9, 9 + rnd() * 9, i % 3 ? c1 : c2);
    } else if (kind === 1) {
      g.lineWidth = 20;
      g.lineCap = 'round';
      for (let row = 0; row < 4; row++) {
        g.strokeStyle = row % 2 ? c2 : c1;
        g.beginPath();
        for (let x = 0; x <= PAINT_W; x += 8) {
          const y = 34 + row * 62 + Math.sin(x * 0.045 + row) * 14;
          if (x === 0) g.moveTo(x, y);
          else g.lineTo(x, y);
        }
        g.stroke();
      }
    } else if (kind === 2) {
      for (let i = 0; i < 9; i++) this.dab(30 + rnd() * PAINT_W * 0.75, rnd() * PAINT_H, 26 + rnd() * 22, 22 + rnd() * 20, i % 2 ? c1 : c2);
    } else if (kind === 3) {
      for (let i = 0; i < 16; i++) heart(g, 24 + rnd() * PAINT_W * 0.74, 20 + rnd() * (PAINT_H - 40), 13 + rnd() * 9, i % 2 ? c1 : c2);
    } else {
      const grad = g.createLinearGradient(0, 0, PAINT_W, 0);
      grad.addColorStop(0, hexAlpha(c1, 0));
      grad.addColorStop(0.35, hexAlpha(c1, 0));
      grad.addColorStop(0.62, c1);
      grad.addColorStop(1, c2);
      g.fillStyle = grad;
      g.fillRect(0, 0, PAINT_W, PAINT_H);
    }
    this.hasStrokes = true;
    this.dirty = true;
  }

  toJPEG() {
    this.compose();
    return this.canvas.toDataURL('image/jpeg', 0.84);
  }

  strokesPNG() {
    return this.hasStrokes ? this.strokes.toDataURL('image/png') : null;
  }

  loadStrokes(dataUrl) {
    this.clear();
    if (!dataUrl) return Promise.resolve();
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        this.sctx.drawImage(img, 0, 0, PAINT_W, PAINT_H);
        this.hasStrokes = true;
        this.dirty = true;
        resolve();
      };
      img.onerror = () => resolve();
      img.src = dataUrl;
    });
  }

  // How much of the fish has been painted (0..1) — the tests use it.
  coverage() {
    const d = this.sctx.getImageData(0, 0, PAINT_W, PAINT_H).data;
    let n = 0;
    for (let i = 3; i < d.length; i += 16) if (d[i] > 128) n++;
    return n / (d.length / 16);
  }

  dispose() {
    this.texture.dispose();
  }
}

const _p = new THREE.Vector3();
function toScreen(local, mesh, camera, w, h) {
  _p.copy(local).applyMatrix4(mesh.matrixWorld).project(camera);
  local.set((_p.x * 0.5 + 0.5) * w, (-_p.y * 0.5 + 0.5) * h, 0);
  return local;
}

function hexAlpha(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

function heart(g, x, y, r, color) {
  g.save();
  g.translate(x, y);
  g.scale(r / 16, r / 16);
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(0, 6);
  g.bezierCurveTo(-16, -6, -8, -18, 0, -8);
  g.bezierCurveTo(8, -18, 16, -6, 0, 6);
  g.fill();
  g.restore();
}
