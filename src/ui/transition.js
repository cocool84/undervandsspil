// A curtain of bubbles rushing up the screen. It hides the switch between the aquarium and
// the fish factory (and between the two aquariums): `play(onCover)` calls onCover when the
// screen is fully covered. If onCover returns a promise (a new aquarium still being built),
// the bubbles hold still until it is ready.

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
      setTimeout(async () => {
        const wait = onCover?.();
        if (wait?.then) {
          this.el.classList.add('hold');
          await wait.catch(() => {});
          this.el.classList.remove('hold');
        }
        setTimeout(() => {
          this.el.classList.remove('run');
          this.busy = false;
          resolve(true);
        }, 830);
      }, 520);
    });
  }
}
