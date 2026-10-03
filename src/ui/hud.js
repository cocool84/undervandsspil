// The on-screen buttons: feed, day/night, the fish factory and a discreet sound toggle.
// They react on pointerdown (toddlers press and hold, slide and tap imprecisely) with a
// squishy press.

import { ICONS } from './icons.js';

export class Hud {
  constructor({ onFeed, onNight, onSound, onFactory }) {
    this.el = document.getElementById('hud');
    this.feed = document.getElementById('btn-feed');
    this.night = document.getElementById('btn-night');
    this.sound = document.getElementById('btn-sound');
    this.factory = document.getElementById('btn-factory');
    this.factory.innerHTML = ICONS.factory;
    this.bind(this.feed, onFeed);
    this.bind(this.night, onNight);
    this.bind(this.sound, onSound);
    this.bind(this.factory, onFactory);
  }

  bind(btn, fn) {
    const release = () => btn.classList.remove('pressed');
    btn.addEventListener(
      'pointerdown',
      (e) => {
        e.preventDefault();
        e.stopPropagation();
        btn.classList.add('pressed');
        setTimeout(release, 260);
        fn();
      },
      { passive: false },
    );
    btn.addEventListener('pointerup', release);
    btn.addEventListener('pointercancel', release);
    btn.addEventListener('pointerleave', release);
  }

  show() {
    this.el.classList.add('show');
  }

  hide() {
    this.el.classList.remove('show');
  }

  setNight(on) {
    this.night.classList.toggle('is-night', on);
  }

  setMuted(muted) {
    this.sound.classList.toggle('is-muted', muted);
  }
}
