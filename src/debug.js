// Test hooks (window.__aq) and the ?debug overlay (fps, tier, draw calls).

import { flags } from './config.js';

export function installDebug(app) {
  const { core, quality } = app;
  const fps = { frames: 0, acc: 0, value: 0 };

  const api = {
    ready: false,
    state: app.state,
    perf() {
      return {
        fps: Math.round(fps.value),
        frameMs: Math.round(quality.ema * 10) / 10,
        tier: quality.tier,
        startTier: quality.startTier,
        dpr: core.size.dpr,
        sceneCalls: core.stats.sceneCalls,
        sceneTriangles: core.stats.sceneTriangles,
        totalCalls: core.renderer.info.render.calls,
        halfRate: quality.halfRate,
        history: quality.history,
      };
    },
    audioState: () => app.audio.state,
    start: () => app.start(),
    // Grab the next rendered frame and return simple luminance stats (blank-frame check).
    snapshotStats() {
      return new Promise((resolve) => {
        app.afterRender = () => {
          const src = core.renderer.domElement;
          const c = document.createElement('canvas');
          c.width = 96;
          c.height = 64;
          const g = c.getContext('2d', { willReadFrequently: true });
          g.drawImage(src, 0, 0, c.width, c.height);
          const d = g.getImageData(0, 0, c.width, c.height).data;
          let sum = 0;
          let sum2 = 0;
          const n = d.length / 4;
          for (let i = 0; i < d.length; i += 4) {
            const l = (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
            sum += l;
            sum2 += l * l;
          }
          const mean = sum / n;
          resolve({ mean, std: Math.sqrt(Math.max(sum2 / n - mean * mean, 0)) });
        };
      });
    },
  };
  window.__aq = api;

  let overlay = null;
  if (flags.debug) {
    overlay = document.createElement('div');
    overlay.className = 'aq-debug';
    document.body.appendChild(overlay);
  }

  return {
    frame(dtMs) {
      fps.frames++;
      fps.acc += dtMs;
      if (fps.acc >= 500) {
        fps.value = (fps.frames * 1000) / fps.acc;
        fps.frames = 0;
        fps.acc = 0;
        if (overlay) {
          const p = api.perf();
          overlay.textContent = `${p.fps} fps  ${p.frameMs} ms  tier ${p.tier}  dpr ${p.dpr.toFixed(2)}\n${p.sceneCalls} calls  ${(p.sceneTriangles / 1000).toFixed(0)}k tris  total ${p.totalCalls}${p.halfRate ? '  ½rate' : ''}`;
        }
      }
    },
  };
}
