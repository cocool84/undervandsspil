// A curtain of bubbles rushing up the screen. It hides the switch between the aquarium and
// the fish factory: `play(onCover)` calls onCover when the screen is fully covered.

export class BubbleWipe {
  constructor() {
    this.el = document.createElement('div');
    this.el.className = 'wipe';
    this.el.setAttribute('aria-hidden', 'true');
    const n = 30;
    for (let i = 0; i < n; i++) {
      const b = document.createElement('i');
      const size = 14 + Math.random() * 26;
      b.style.setProperty('--s', `${size}vmax`);
      b.style.setProperty('--x', `${(i / n) * 108 - 12 + Math.random() * 6}%`);
      b.style.setProperty('--delay', `${Math.random() * 0.22}s`);
      b.style.setProperty('--dur', `${0.85 + Math.random() * 0.35}s`);
      this.el.appendChild(b);
    }
    document.body.appendChild(this.el);
    this.busy = false;
  }

  play(onCover) {
    if (this.busy) return Promise.resolve(false);
    this.busy = true;
    this.el.classList.remove('run');
    void this.el.offsetWidth; // restart the CSS animations
    this.el.classList.add('run');
    return new Promise((resolve) => {
      setTimeout(() => onCover?.(), 520);
      setTimeout(() => {
        this.el.classList.remove('run');
        this.busy = false;
        resolve(true);
      }, 1350);
    });
  }
}
