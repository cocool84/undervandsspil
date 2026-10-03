// Start screen: one big pulsing bubble. Any tap pops it, unlocks sound, asks for
// fullscreen and starts the dive into the aquarium.

export class StartScreen {
  constructor({ onPop, onGesture }) {
    this.el = document.getElementById('start');
    this.popped = false;
    this.onPop = onPop;
    this.onGesture = onGesture;
    this.el.addEventListener('pointerdown', (e) => this.pop(e), { passive: false });
    // iOS treats pointerup/touchend as the "real" user activation for audio and fullscreen
    this.el.addEventListener('pointerup', () => this.onGesture?.(true), { passive: true });
    this.el.addEventListener('touchend', () => this.onGesture?.(true), { passive: true });
  }

  pop(e, fromUser = true) {
    if (e && e.cancelable) e.preventDefault();
    if (this.popped) return;
    this.popped = true;
    if (fromUser) this.onGesture?.(false);
    this.el.classList.add('popping');
    this.onPop?.();
    setTimeout(() => this.el.classList.add('gone'), 380);
    setTimeout(() => {
      this.el.style.display = 'none';
    }, 1200);
  }

  sceneReady() {
    this.el.classList.add('scene-ready');
  }
}

// Returns true when fullscreen is (or already was) active or not needed.
export function requestFullscreen() {
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches || window.matchMedia?.('(display-mode: fullscreen)').matches || navigator.standalone;
  if (standalone || document.fullscreenElement || document.webkitFullscreenElement) return true;
  const el = document.documentElement;
  try {
    const p = el.requestFullscreen ? el.requestFullscreen({ navigationUI: 'hide' }) : el.webkitRequestFullscreen?.();
    if (p && p.catch) p.catch(() => {});
  } catch {
    /* not allowed here — fine */
  }
  return false;
}
