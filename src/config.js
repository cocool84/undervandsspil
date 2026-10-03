// Global configuration: URL flags, device detection, quality tiers and world constants.

export const params = new URLSearchParams(location.search);

function num(name, fallback) {
  if (!params.has(name)) return fallback;
  const v = parseFloat(params.get(name));
  return Number.isFinite(v) ? v : fallback;
}

export const flags = {
  debug: params.has('debug'),
  debugView: params.get('debug') || '', // '' | 'depth'
  quality: params.has('quality') ? Math.round(num('quality', 2)) : null,
  seed: params.has('seed') ? Math.round(num('seed', 1)) : null,
  simslow: params.has('simslow') ? num('simslow', 8) || 8 : 0,
  fishgrid: params.has('fishgrid'),
  nosw: params.has('nosw'),
  autostart: params.has('autostart'),
  night: params.has('night'),
  nantest: params.has('nantest'),
  // ?fill=N: N painted test fish instead of our own (never saved) — for measuring performance
  fill: params.has('fill') ? Math.min(Math.max(Math.round(num('fill', 25)), 0), 25) : null,
};

export const device = (() => {
  const ua = navigator.userAgent;
  const touchPoints = navigator.maxTouchPoints || 0;
  // iPadOS Safari reports itself as a Mac by default; touch support gives it away.
  const isIPad = /iPad/.test(ua) || (/Macintosh/.test(ua) && touchPoints > 1);
  const isIPhone = /iPhone|iPod/.test(ua);
  const isAndroid = /Android/.test(ua);
  return {
    isIPad,
    isIPhone,
    isMobile: isIPad || isIPhone || isAndroid,
    isTouch: touchPoints > 0 || 'ontouchstart' in window,
  };
})();

// Ordered from best to cheapest. `bloom` is the bloom resolution relative to the
// render resolution (0 = off). `plankton` is the fraction of particles drawn.
export const TIERS = [
  { dpr: 2.0, dof: true, taps: 12, bloom: 0.5, plankton: 1.0, rays: 9, caustics: 512 },
  { dpr: 1.75, dof: true, taps: 10, bloom: 0.5, plankton: 1.0, rays: 8, caustics: 512 },
  { dpr: 1.5, dof: true, taps: 8, bloom: 0.5, plankton: 0.8, rays: 6, caustics: 256 },
  { dpr: 1.25, dof: false, taps: 0, bloom: 0.25, plankton: 0.6, rays: 5, caustics: 256 },
  { dpr: 1.0, dof: false, taps: 0, bloom: 0.25, plankton: 0.5, rays: 4, caustics: 256 },
  { dpr: 0.85, dof: false, taps: 0, bloom: 0, plankton: 0.4, rays: 4, caustics: 128 },
];

export const WORLD = {
  surfaceY: 16,
  camDist: 24, // camera distance to the focal plane z = 0
  layoutSeed: flags.seed ?? 20261003,
};
