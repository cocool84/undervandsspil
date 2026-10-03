// The fish factory: make your own fish in five steps — shape, paint, pattern, eyes, and let
// it go! The fish turns slowly on its shell, holds still while it is being painted, looks at
// the painting finger and hops happily at every change. The magic wand makes a surprise fish
// in one tap. The unfinished fish (the draft) is remembered.

import * as THREE from 'three';
import { Fish, fishGeometry } from '../fish/fish.js';
import { makeDNA, PAINT_COLORS, SHAPES, PATTERNS, EYES, patternColor } from '../fish/dna.js';
import { Painter } from './painter.js';
import { Studio, STAGE } from './studio.js';
import { FactoryUI } from '../ui/factory-ui.js';
import { saveDraft } from '../storage.js';
import { damp, easeInCubic, Spring } from '../util/math.js';
import { inStudio } from '../core/uniforms.js';
import { SHAPE } from '../particles/fx.js';

const BRUSH_PX = 22; // finger brush radius on screen
const TAU = Math.PI * 2;
// how the fish turns to the child in each step (a three-quarter side view; for the eyes
// nearly face on, for painting almost side on)
const STEP_YAW = [-0.38, -0.3, -0.45, -0.95, -0.55];
const FISH_SIZE = 3.1; // every shape is shown about this big
const _v = new THREE.Vector3();
const _off = new THREE.Vector3();
const _look = new THREE.Vector3();

function freshDraft() {
  return { shape: 0, color: PAINT_COLORS[0], colorIndex: 0, brush: PAINT_COLORS[1], filled: false, pattern: 0, eyes: 0, seed: Math.floor(Math.random() * 1e9), kind: 'design', strokes: null, step: 0 };
}

export class Factory {
  constructor(app, { draft = null } = {}) {
    this.app = app;
    this.studio = new Studio();
    this.painter = new Painter();
    this.ui = new FactoryUI({
      onStep: (i) => this.setStep(i),
      onPrev: () => this.setStep(this.step - 1),
      onNext: () => this.setStep(this.step + 1),
      onHome: () => this.goHome(),
      onWand: () => this.wand(),
      onRelease: () => this.release(),
      onOption: (kind, i) => this.choose(kind, i),
    });
    this.draft = { ...freshDraft(), ...(draft || {}) };
    this.step = this.draft.step ?? 0;
    this.fish = null;
    this.extraYaw = 0;
    this.yawGoal = 0; // where the turning comes to rest: a whole number of turns
    this.spinVel = 0;
    this.baseYaw = STEP_YAW[0];
    this.jump = new Spring(0, 90, 9);
    this.pointers = new Map();
    this.isOpen = false;
    this.leaving = null;
    this.magic = null;
    this.brushT = 0;
    this.fingerAt = null;
    this.painter.setBase(this.draft.color);
    this.painter.loadStrokes(this.draft.strokes);
    this.buildFish();
    this.ui.setStep(this.step);
    this.syncUI();

    const canvas = app.core.renderer.domElement;
    canvas.addEventListener('pointerdown', (e) => this.down(e), { passive: false });
    window.addEventListener('pointermove', (e) => this.move(e), { passive: false });
    window.addEventListener('pointerup', (e) => this.up(e));
    window.addEventListener('pointercancel', (e) => this.up(e));
  }

  get scene() {
    return this.studio.scene;
  }

  get camera() {
    return this.studio.camera;
  }

  // ---------------------------------------------------------------- the fish on display

  dna() {
    const d = this.draft;
    return makeDNA({ kind: d.kind, shape: d.shape, color: d.color, pattern: d.pattern, eyes: d.eyes, glow: true, seed: d.seed });
  }

  buildFish() {
    if (this.fish) {
      this.studio.scene.remove(this.fish.mesh);
      this.fish.dispose();
    }
    const fish = new Fish(this.dna(), { paint: this.painter.paint });
    inStudio(fish.material);
    const geo = fishGeometry(this.draft.shape).geometry;
    if (!geo.boundingBox) geo.computeBoundingBox();
    const box = geo.boundingBox;
    const w = box.max.x - box.min.x;
    const h = box.max.y - box.min.y;
    const scale = FISH_SIZE / Math.max(w, h * 1.25);
    fish.mesh.scale.setScalar(scale);
    this.centre = box.getCenter(new THREE.Vector3()).multiplyScalar(scale);
    this.size = { w: w * scale, h: h * scale * 1.15 };
    this.fish = fish;
    this.studio.scene.add(fish.mesh);
    if (this.isOpen) this.frame();
  }

  frame() {
    this.studio.frame(this.size, this.ui.freeArea());
  }

  hop(strength = 1) {
    this.fish.hop(strength, 0.45);
    this.jump.kick(2.4 * strength);
  }

  // The DNA bits that only need new uniforms (no new geometry).
  refreshLooks() {
    const u = this.fish.material.uniforms;
    const d = this.draft;
    this.fish.dna.color = d.color;
    this.fish.dna.pattern = d.pattern;
    this.fish.dna.eyes = d.eyes;
    u.uBaseColor.value.set(d.color);
    u.uPatternColor.value.copy(patternColor(d.color));
    u.uPattern.value = d.pattern;
    u.uEyeType.value = d.eyes;
  }

  syncUI() {
    const d = this.draft;
    this.ui.setSelection({ shape: d.shape, colorIndex: PAINT_COLORS.indexOf(d.brush), pattern: d.pattern, eyes: d.eyes, color: d.color });
  }

  // ---------------------------------------------------------------- open / close

  show() {
    this.isOpen = true;
    this.leaving = null;
    this.ui.setLocked(false);
    this.ui.show(true);
    this.ui.setStep(this.step);
    this.frame();
    this.hop(0.8);
  }

  hide() {
    this.isOpen = false;
    this.ui.show(false);
    this.pointers.clear();
    this.saveSoon(0);
  }

  // After a release: a brand-new blank fish waits for next time.
  reset() {
    this.draft = freshDraft();
    this.step = 0;
    this.painter.clear();
    this.painter.setBase(this.draft.color);
    this.buildFish();
    this.ui.setStep(0);
    this.syncUI();
    this.saveSoon(0);
  }

  onResize() {
    if (this.isOpen) this.frame();
  }

  saveSoon(ms = 500) {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => saveDraft({ ...this.draft, step: this.step, strokes: this.painter.strokesPNG() }), ms);
  }

  // ---------------------------------------------------------------- steps and choices

  setStep(i) {
    if (i < 0 || i > 4 || this.leaving) return;
    const changed = i !== this.step;
    this.step = i;
    this.ui.setStep(i);
    this.frame();
    if (changed) {
      this.app.audio.play('plop', { note: 7 + i });
      // a twirl to show off — but straight to work in the painting step
      this.yawGoal = Math.round(this.extraYaw / TAU) * TAU + (i === 1 ? 0 : i % 2 ? TAU : -TAU);
      this.spinVel = 0;
      this.hop(0.5);
      this.saveSoon();
    }
  }

  choose(kind, i) {
    if (this.leaving) return;
    const d = this.draft;
    const { audio } = this.app;
    d.kind = 'design';
    if (kind === 'shape') {
      if (d.shape !== i) {
        d.shape = i;
        this.buildFish();
      }
      audio.play('morph', { note: [6, 7, 6, 5][i] });
      this.hop(1.2);
      this.sparkle(10);
    } else if (kind === 'color') {
      // The first colour pours over the whole fish; after that a blob is the brush colour
      // (so a yellow stripe can go on a blue fish), and tapping the chosen colour again
      // pours it all over once more.
      const c = PAINT_COLORS[i];
      const pour = !d.filled || d.brush === c;
      d.brush = c;
      if (pour) {
        d.color = c;
        d.colorIndex = i;
        d.filled = true;
        this.painter.setBase(c);
        audio.play('pour', { note: 6 + (i % 5) });
        this.hop(1);
        this.splat(c, 14);
      } else {
        audio.play('pling', { note: 5 + i, gain: 0.07, decay: 0.5 });
        this.hop(0.4);
        this.splat(c, 5);
      }
    } else if (kind === 'pattern') {
      d.pattern = i;
      if (i === 3) audio.play('harp', { from: 5, count: 10 });
      else audio.play('sparkle', { from: 7 + i, count: 5, gain: 0.05 });
      this.hop(1);
      this.sparkle(i === 3 ? 18 : 10, i === 3 ? null : '#fff2b0');
    } else if (kind === 'eyes') {
      d.eyes = i;
      audio.play('blink', { note: 8 + i });
      this.hop(0.8);
      this.fish.eyePop.kick(5);
      this.fish.blinkT = 0;
    }
    this.refreshLooks();
    this.syncUI();
    this.ui.nudge(true);
    this.saveSoon();
  }

  goHome() {
    if (this.leaving) return;
    this.app.closeFactory();
  }

  // ---------------------------------------------------------------- magic wand

  wand() {
    if (this.leaving || this.magic) return;
    this.app.audio.play('magic');
    this.magic = { t: 0, applied: false };
    this.spinVel += 22;
  }

  applyMagic() {
    const r = Math.random;
    const d = this.draft;
    const pick = (arr) => arr[Math.floor(r() * arr.length)];
    d.shape = Math.floor(r() * SHAPES.length);
    d.colorIndex = Math.floor(r() * 8);
    d.color = PAINT_COLORS[d.colorIndex];
    d.eyes = Math.floor(r() * EYES.length);
    d.seed = Math.floor(r() * 1e9);
    d.kind = 'wand';
    d.filled = true;
    this.painter.setBase(d.color);
    if (r() < 0.65) {
      const others = PAINT_COLORS.filter((c) => c !== d.color && c !== '#ffffff');
      const c1 = pick(others);
      const c2 = pick(others.filter((c) => c !== c1));
      this.painter.wandPaint(r, [c1, c2]);
      d.pattern = r() < 0.75 ? 0 : 3;
    } else {
      this.painter.clear();
      d.pattern = 1 + Math.floor(r() * (PATTERNS.length - 1));
    }
    d.brush = d.color;
    this.buildFish();
    this.refreshLooks();
    this.syncUI();
    this.hop(1.5);
    this.sparkle(24, null);
    this.saveSoon();
  }

  // ---------------------------------------------------------------- let it go!

  release() {
    if (this.leaving || this.magic) return;
    const d = this.draft;
    const dna = makeDNA({ kind: d.kind, shape: d.shape, color: d.color, pattern: d.pattern, eyes: d.eyes, glow: true, seed: d.seed, paint: this.painter.hasStrokes ? this.painter.toJPEG() : null });
    this.ui.setLocked(true);
    this.leaving = { t: 0 };
    this.hop(1.6);
    this.app.audio.play('whoosh', { up: true, gain: 0.09, dur: 0.8 });
    this.app.audio.play('harp', { from: 7, count: 7, step: 0.05, gain: 0.06 }, 0.08);
    setTimeout(() => this.app.closeFactory({ release: dna }), 620);
    return dna;
  }

  // ---------------------------------------------------------------- touch

  down(e) {
    if (!this.isOpen || this.leaving || this.app.busy) return;
    if (e.cancelable) e.preventDefault();
    const hit = this.painter.hit(this.fish.mesh, this.camera, e.clientX, e.clientY, BRUSH_PX);
    let mode = 'spin';
    if (this.step === 1) {
      // in the painting step every finger is a brush: it paints wherever it is over the fish,
      // also when it started just beside it
      mode = 'paint';
      if (hit) {
        this.painter.strokeTo(e.pointerId, hit, this.draft.brush);
        this.fingerAt = hit.point.clone();
        this.draft.kind = 'design';
        if (Math.random() < 0.35) this.app.audio.play('fishTune', { base: this.fish.voice, short: true, gain: 0.07 });
      }
    } else if (hit) {
      mode = 'tap';
      this.hop(1);
      this.sparkle(6);
      this.app.audio.play('fishTune', { base: this.fish.voice, short: true });
    }
    this.pointers.set(e.pointerId, { mode, x: e.clientX, t: performance.now() });
  }

  move(e) {
    const p = this.pointers.get(e.pointerId);
    if (!p || !this.isOpen) return;
    if (e.cancelable) e.preventDefault();
    if (p.mode === 'paint') {
      const hit = this.painter.hit(this.fish.mesh, this.camera, e.clientX, e.clientY, BRUSH_PX);
      if (hit) {
        this.painter.strokeTo(e.pointerId, hit, this.draft.brush);
        this.fingerAt = hit.point.clone();
        this.draft.kind = 'design';
        // a soft swish while the brush moves (brighter when it moves fast)
        const now = performance.now();
        const speed = Math.min(Math.hypot(e.clientX - (p.px ?? e.clientX), e.clientY - (p.py ?? e.clientY)) / Math.max(now - (p.pt ?? now), 8) / 1.2, 1);
        p.px = e.clientX;
        p.py = e.clientY;
        p.pt = now;
        this.app.audio.play('brush', { speed });
      } else {
        this.painter.endStroke(e.pointerId);
      }
      return;
    }
    // swipe beside (or on) the fish: spin it round
    const now = performance.now();
    const dx = e.clientX - p.x;
    const dt = Math.max((now - p.t) / 1000, 1 / 120);
    this.extraYaw += dx * 0.012;
    this.spinVel = damp(this.spinVel, (dx * 0.012) / dt, 12, dt);
    this.yawGoal = Math.round(this.extraYaw / TAU) * TAU;
    p.x = e.clientX;
    p.t = now;
  }

  up(e) {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    this.pointers.delete(e.pointerId);
    if (p.mode === 'paint') {
      this.painter.endStroke(e.pointerId);
      this.fingerAt = null;
      this.hop(0.5);
      this.ui.nudge(true);
      this.saveSoon(800);
    }
  }

  // ---------------------------------------------------------------- little effects

  sparkle(count = 10, color = '#fff2b0') {
    const p = this.fish.pos;
    const fx = this.studio.fx;
    const colors = ['#ff9ecf', '#ffd23f', '#9dfcff', '#c6a2ff', '#a6ff9a'];
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      fx.spawn(i % 4 === 0 ? SHAPE.STAR : SHAPE.SPARKLE, p.x + Math.cos(a) * 1.4, p.y + Math.sin(a) * 1.0, p.z + 0.8, {
        vx: Math.cos(a) * 1.6,
        vy: Math.sin(a) * 1.6 + 0.4,
        life: 0.8 + Math.random() * 0.5,
        size: 0.22 + Math.random() * 0.2,
        drag: 2.2,
        color: color ?? colors[i % colors.length],
        delay: Math.random() * 0.1,
      });
    }
  }

  splat(color, count = 14) {
    const p = this.fish.pos;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 1.5 + Math.random() * 2;
      this.studio.fx.spawn(SHAPE.DOT, p.x, p.y, p.z + 0.6, { vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.7 + Math.random() * 0.4, size: 0.3 + Math.random() * 0.25, drag: 3, color });
    }
  }

  // ---------------------------------------------------------------- frame

  update(t, dt) {
    const fish = this.fish;
    const painting = [...this.pointers.values()].some((p) => p.mode === 'paint');

    // magic wand: a whirl of sparkles, a spin — and at the peak, a brand-new fish
    if (this.magic) {
      const m = this.magic;
      m.t += dt;
      const p = fish.pos;
      for (let k = 0; k < 2; k++) {
        const a = m.t * 13 + k * Math.PI;
        const r = 2.2 - m.t * 1.2;
        this.studio.fx.spawn(SHAPE.SPARKLE, p.x + Math.cos(a) * r, p.y + Math.sin(a) * r * 0.7, p.z + 0.7, { life: 0.6, size: 0.32, drag: 2, color: ['#ffd23f', '#ff9ecf', '#9dfcff'][k + (Math.floor(m.t * 20) % 2)] });
      }
      if (!m.applied && m.t > 0.42) {
        m.applied = true;
        this.applyMagic();
      }
      if (m.t > 0.9) {
        this.magic = null;
        this.setStep(4);
      }
    }

    // turning: rock gently round the side view; swipes spin it (and it glides on); a step
    // change makes it twirl; painting holds it still
    const swiping = [...this.pointers.values()].some((p) => p.mode !== 'paint');
    if (!swiping) {
      if (Math.abs(this.spinVel) > 0.6) {
        this.spinVel *= Math.exp(-dt * (painting ? 12 : 2.0));
        this.extraYaw += this.spinVel * dt;
        this.yawGoal = Math.round(this.extraYaw / TAU) * TAU;
      } else {
        this.spinVel = 0;
        this.extraYaw = damp(this.extraYaw, this.yawGoal, painting ? 6 : 3.2, dt);
      }
    }
    this.baseYaw = damp(this.baseYaw, STEP_YAW[this.step], 3, dt);
    this.rock = damp(this.rock ?? 1, painting || this.step === 1 ? 0.25 : 1, 3, dt);
    const yaw = this.baseYaw + Math.sin(t * 0.55) * 0.42 * this.rock + this.extraYaw;
    const pitch = Math.sin(t * 0.8) * 0.05 * this.rock;
    const roll = Math.sin(t * 0.67) * 0.05 * this.rock;
    fish.still = painting;

    // where it looks: at the painting finger, else mostly at the child
    if (this.fingerAt) _look.copy(this.fingerAt);
    else _look.copy(this.camera.position).add(_v.set(Math.sin(t * 0.4) * 2, Math.sin(t * 0.31) * 1.2, 0));

    const jy = this.jump.update(dt);
    fish.display(t, dt, this.camera, { yaw, pitch, roll, look: _look });
    // float round the visual centre of the fish, not its nose-to-tail origin
    _off.copy(this.centre).applyQuaternion(fish.mesh.quaternion);
    fish.pos.copy(STAGE).sub(_off);
    fish.pos.y += Math.sin(t * 1.3) * 0.07 + jy;

    // released: up, up and away out of the top of the picture with a glitter trail
    if (this.leaving) {
      const L = this.leaving;
      L.t += dt;
      const k = easeInCubic(Math.min(L.t / 0.7, 1));
      fish.pos.y += k * 9;
      fish.pos.z += k * 2;
      if (Math.random() < 0.9) this.studio.fx.spawn(SHAPE.SPARKLE, fish.pos.x + (Math.random() - 0.5), fish.pos.y - 0.6, fish.pos.z, { vy: -1, life: 0.7, size: 0.3, color: '#fff2b0' });
    }

    this.studio.setShadow(STAGE.x, STAGE.z, jy + (this.leaving ? 9 : 0));
    this.painter.compose();
    this.studio.update(t, dt);
  }
}
