// The on-screen buttons: feed, day/night and a discreet sound toggle. They react on
// pointerdown (toddlers press and hold, slide and tap imprecisely) with a squishy press.

export class Hud {
  constructor({ onFeed, onNight, onSound }) {
    this.el = document.getElementById('hud');
    this.feed = document.getElementById('btn-feed');
    this.night = document.getElementById('btn-night');
    this.sound = document.getElementById('btn-sound');
    this.bind(this.feed, onFeed);
    this.bind(this.night, onNight);
    this.bind(this.sound, onSound);
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

  setNight(on) {
    this.night.classList.toggle('is-night', on);
  }

  setMuted(muted) {
    this.sound.classList.toggle('is-muted', muted);
  }
}
