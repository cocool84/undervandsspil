// The fish factory's buttons (DOM over the 3D stage): five step bubbles at the top, big
// back/next arrows, the choices for the current step at the bottom, a magic wand and a
// home button. Icons only. Everything reacts on pointerdown with a squishy press.

import { ICONS, shapeIcon, patternIcon, eyeIcon, blobIcon } from './icons.js';
import { SHAPES, PATTERNS, EYES, PAINT_COLORS } from '../fish/dna.js';

const STEP_ICONS = [ICONS.stepShape, ICONS.stepPaint, ICONS.stepPattern, ICONS.stepEyes, ICONS.stepRelease];

function make(tag, cls, parent, html = '') {
  const e = document.createElement(tag);
  e.className = cls;
  if (html) e.innerHTML = html;
  parent?.appendChild(e);
  return e;
}

export class FactoryUI {
  constructor(handlers) {
    this.h = handlers;
    const root = make('div', 'factory', document.body);
    root.id = 'factory';
    this.el = root;

    this.stepBar = make('div', 'fac-steps', root);
    this.stepBtns = STEP_ICONS.map((icon, i) => this.button('fac-step', this.stepBar, icon, () => this.h.onStep(i)));
    this.home = this.button('fac-home fac-glass', root, ICONS.home, () => this.h.onHome());
    this.prev = this.button('fac-arrow fac-prev', root, ICONS.prev, () => this.h.onPrev());
    this.next = this.button('fac-arrow fac-next', root, ICONS.next, () => this.h.onNext());
    this.wand = this.button('fac-wand fac-glass', root, ICONS.wand, () => this.h.onWand());

    this.panel = make('div', 'fac-panel', root);
    this.groups = [
      SHAPES.map((name, i) => [shapeIcon(name), () => this.h.onOption('shape', i)]),
      PAINT_COLORS.map((c, i) => [blobIcon(c), () => this.h.onOption('color', i)]),
      PATTERNS.map((name, i) => [patternIcon(name), () => this.h.onOption('pattern', i)]),
      EYES.map((name, i) => [eyeIcon(name), () => this.h.onOption('eyes', i)]),
    ].map((items, step) => {
      const g = make('div', `fac-options fac-options-${step}`, this.panel);
      g.dataset.step = step;
      const btns = items.map(([icon, fn]) => this.button(step === 1 ? 'fac-blob' : 'fac-opt fac-glass', g, icon, fn));
      return { el: g, btns };
    });
    const rel = make('div', 'fac-options fac-options-4', this.panel);
    rel.dataset.step = 4;
    this.release = this.button('fac-release', rel, ICONS.release, () => this.h.onRelease());
    this.groups.push({ el: rel, btns: [this.release] });
    this.step = -1;
  }

  button(cls, parent, icon, fn) {
    const b = make('button', cls, parent, icon);
    b.type = 'button';
    const release = () => b.classList.remove('pressed');
    b.addEventListener(
      'pointerdown',
      (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (this.locked) return;
        b.classList.add('pressed');
        setTimeout(release, 240);
        fn();
      },
      { passive: false },
    );
    b.addEventListener('pointerup', release);
    b.addEventListener('pointercancel', release);
    b.addEventListener('pointerleave', release);
    return b;
  }

  show(on) {
    this.el.classList.toggle('show', on);
  }

  setLocked(on) {
    this.locked = on;
    this.el.classList.toggle('locked', on);
  }

  setStep(i) {
    this.step = i;
    this.stepBtns.forEach((b, k) => {
      b.classList.toggle('current', k === i);
    });
    this.groups.forEach((g, k) => g.el.classList.toggle('active', k === i));
    this.prev.classList.toggle('hidden', i === 0);
    this.next.classList.toggle('hidden', i === 4);
    this.el.dataset.step = i;
    this.nudge(false);
  }

  // Which choice is on (and the fish's colour for all the little preview fish).
  setSelection({ shape, colorIndex, pattern, eyes, color }) {
    this.el.style.setProperty('--fish', color);
    const sel = [shape, colorIndex, pattern, eyes];
    sel.forEach((s, step) => this.groups[step].btns.forEach((b, k) => b.classList.toggle('sel', k === s)));
  }

  // Make the "next" arrow bounce: a gentle hint that there is more to do.
  nudge(on = true) {
    this.next.classList.toggle('nudge', on);
  }

  // The rectangle (CSS px) left free for the fish between the buttons.
  freeArea() {
    const W = window.innerWidth;
    const H = window.innerHeight;
    const top = this.stepBar.getBoundingClientRect().bottom + 8;
    const g = this.groups[Math.max(this.step, 0)].el.getBoundingClientRect();
    const bottom = g.height > 0 ? g.top - 8 : H - 150;
    const pr = this.prev.getBoundingClientRect();
    const nx = this.next.getBoundingClientRect();
    const left = pr.width > 0 ? pr.right + 6 : 120;
    const right = nx.width > 0 ? nx.left - 6 : W - 120;
    return { left, right, top, bottom };
  }
}
