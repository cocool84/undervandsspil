// The parents' corner: a faint gear that opens only after a 3-second press (a ring fills up
// meanwhile), with a volume slider, a sea-sound slider, "save a copy" / "load a copy" of our
// own fish (a file for Files on the iPad) and "delete our own fish" (✓ / ✗).

import { ICONS } from './icons.js';

const HOLD = 3000;

function make(tag, cls, parent, html = '') {
  const e = document.createElement(tag);
  e.className = cls;
  if (html) e.innerHTML = html;
  parent?.appendChild(e);
  return e;
}

// A big slider that follows a dragging finger. (The page blocks touchmove so it never
// scrolls or zooms — which also stops the iPad's own range inputs from being dragged.)
// onInput fires while dragging, onChange when the finger lets go.
class Slider {
  constructor(parent, value, onInput, onChange) {
    this.el = make('div', 'p-slider', parent, '<div class="p-rail"><div class="p-track"><div class="p-fill"></div></div><div class="p-thumb"></div></div>');
    this.el.setAttribute('role', 'slider');
    this.el.setAttribute('aria-valuemin', '0');
    this.el.setAttribute('aria-valuemax', '1');
    this.rail = this.el.querySelector('.p-rail');
    this.fill = this.el.querySelector('.p-fill');
    this.thumb = this.el.querySelector('.p-thumb');
    this.set(value);
    this.el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.el.setPointerCapture?.(e.pointerId);
      this.dragging = true;
      this.el.classList.add('dragging');
      this.follow(e, onInput);
    });
    this.el.addEventListener('pointermove', (e) => {
      if (this.dragging) this.follow(e, onInput);
    });
    const end = () => {
      if (!this.dragging) return;
      this.dragging = false;
      this.el.classList.remove('dragging');
      onChange(this.value);
    };
    this.el.addEventListener('pointerup', end);
    this.el.addEventListener('pointercancel', end);
    this.el.addEventListener('lostpointercapture', end);
  }

  follow(e, onInput) {
    const r = this.rail.getBoundingClientRect();
    const v = Math.round(Math.min(Math.max((e.clientX - r.left) / r.width, 0), 1) * 100) / 100;
    if (v === this.value) return;
    this.set(v);
    onInput(v);
  }

  set(v) {
    this.value = v;
    this.fill.style.width = `${v * 100}%`;
    this.thumb.style.left = `${v * 100}%`;
    this.el.setAttribute('aria-valuenow', String(v));
  }
}

export class ParentCorner {
  constructor({ volume, ambience, onVolume, onVolumeDone, onAmbience, onAmbienceDone, onDelete, onOpen, onSaveCopy, onLoadCopy }) {
    this.handlers = { onVolume, onVolumeDone, onAmbience, onAmbienceDone, onDelete, onOpen, onSaveCopy, onLoadCopy };

    // the gear, with a progress ring
    this.gear = make('button', 'gear', document.body, `${ICONS.gear}<svg class="gear-ring" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="46"/></svg>`);
    this.gear.type = 'button';
    this.gear.setAttribute('aria-label', 'Forældre');
    this.gear.addEventListener('pointerdown', (e) => this.holdStart(e), { passive: false });
    for (const t of ['pointerup', 'pointercancel', 'pointerleave']) this.gear.addEventListener(t, () => this.holdEnd());

    // the panel
    this.el = make('div', 'parent', document.body);
    const card = make('div', 'parent-card', this.el);
    this.close = make('button', 'p-close', card, ICONS.close);
    this.close.type = 'button';
    this.close.addEventListener('click', () => this.hide());

    const row = (lo, hi, value, onInput, onChange) => {
      const r = make('div', 'p-row', card);
      make('span', 'p-icon', r, lo);
      const slider = new Slider(r, value, onInput, onChange);
      make('span', 'p-icon', r, hi);
      return slider;
    };
    const h = this.handlers;
    this.volume = row(ICONS.speakerLow, ICONS.speakerHigh, volume, (v) => h.onVolume(v), (v) => h.onVolumeDone?.(v));
    this.ambience = row(ICONS.seaLow, ICONS.seaHigh, ambience, (v) => h.onAmbience(v), (v) => h.onAmbienceDone?.(v));

    const files = make('div', 'p-row p-files-row', card);
    this.save = make('button', 'p-save', files, ICONS.saveCopy);
    this.load = make('button', 'p-load', files, ICONS.loadCopy);
    this.save.type = 'button';
    this.load.type = 'button';
    this.file = make('input', 'p-file', files);
    this.file.type = 'file';
    this.file.accept = 'application/json,.json';
    // straight from the tap: the share sheet and the file picker both need the gesture
    this.save.addEventListener('click', () => this.handlers.onSaveCopy?.());
    this.load.addEventListener('click', () => this.file.click());
    this.file.addEventListener('change', () => {
      const f = this.file.files?.[0];
      this.file.value = '';
      if (f) this.handlers.onLoadCopy?.(f);
    });

    const del = make('div', 'p-row p-delete-row', card);
    this.del = make('button', 'p-delete', del, ICONS.deleteFish);
    this.del.type = 'button';
    this.confirm = make('div', 'p-confirm', del);
    this.yes = make('button', 'p-yes', this.confirm, ICONS.check);
    this.no = make('button', 'p-no', this.confirm, ICONS.cross);
    this.yes.type = 'button';
    this.no.type = 'button';
    this.del.addEventListener('click', () => this.el.classList.add('confirming'));
    this.no.addEventListener('click', () => this.el.classList.remove('confirming'));
    this.yes.addEventListener('click', () => {
      this.el.classList.remove('confirming');
      this.handlers.onDelete();
      this.hide();
    });
    // taps on the panel never reach the aquarium below
    this.el.addEventListener('pointerdown', (e) => e.stopPropagation());
  }

  holdStart(e) {
    e.preventDefault();
    e.stopPropagation();
    clearTimeout(this.timer);
    this.gear.classList.add('holding');
    this.timer = setTimeout(() => {
      this.gear.classList.remove('holding');
      this.open();
    }, HOLD);
  }

  holdEnd() {
    clearTimeout(this.timer);
    this.gear.classList.remove('holding');
  }

  // A little thumbs-up (green glow) or a "no" shake on a button.
  feedback(btn, ok) {
    btn.classList.remove('p-ok', 'p-nope');
    void btn.offsetWidth;
    btn.classList.add(ok ? 'p-ok' : 'p-nope');
    clearTimeout(btn.feedbackTimer);
    btn.feedbackTimer = setTimeout(() => btn.classList.remove('p-ok', 'p-nope'), 1600);
  }

  setVisible(on) {
    this.gear.classList.toggle('show', on);
  }

  open() {
    this.el.classList.add('open');
    this.handlers.onOpen?.();
  }

  hide() {
    this.el.classList.remove('open', 'confirming');
  }

  get isOpen() {
    return this.el.classList.contains('open');
  }
}
