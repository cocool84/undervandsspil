// Input plumbing. Stage 1: keep the browser from zooming, scrolling, selecting or showing
// long-press menus — the page should behave like an app.

export function blockBrowserGestures() {
  const prevent = (e) => {
    if (e.cancelable) e.preventDefault();
  };
  const opts = { passive: false };
  document.addEventListener('gesturestart', prevent, opts);
  document.addEventListener('gesturechange', prevent, opts);
  document.addEventListener('gestureend', prevent, opts);
  document.addEventListener('touchmove', prevent, opts);
  document.addEventListener('dblclick', prevent, opts);
  document.addEventListener('contextmenu', prevent, opts);
  document.addEventListener('selectstart', prevent, opts);
  document.addEventListener('dragstart', prevent, opts);
  // two-finger touches must never turn into a pinch zoom
  document.addEventListener(
    'touchstart',
    (e) => {
      if (e.touches.length > 1) prevent(e);
    },
    opts,
  );
}
