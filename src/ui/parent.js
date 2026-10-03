// The parents' corner: a faint gear that opens only after a 3-second press (a ring fills up
// meanwhile), with a volume slider, a sea-sound slider and "delete our own fish" (✓ / ✗).

import { ICONS } from './icons.js';

const HOLD = 3000;

function make(tag, cls, parent, html = '') {
  const e = document.createElement(tag);
  e.className = cls;
  if (html) e.innerHTML = html;
  parent?.appendChild(e);
  return e;
}

export class ParentCorner {
  constructor({ volume, ambience, onVolume, onAmbience, onDelete, onOpen }) {
    this.handlers = { onVolume, onAmbience, onDelete, onOpen };

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

    const row = (lo, hi, value, fn) => {
      const r = make('div', 'p-row', card);
      make('span', 'p-icon', r, lo);
      const input = make('input', 'p-range', r);
      input.type = 'range';
      input.min = '0';
      input.max = '1';
      input.step = '0.01';
      input.value = String(value);
      input.addEventListener('input', () => fn(parseFloat(input.value)));
      make('span', 'p-icon', r, hi);
      return input;
    };
    this.volume = row(ICONS.speakerLow, ICONS.speakerHigh, volume, (v) => this.handlers.onVolume(v));
    this.ambience = row(ICONS.seaLow, ICONS.seaHigh, ambience, (v) => this.handlers.onAmbience(v));

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
