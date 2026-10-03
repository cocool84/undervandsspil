// Registers the service worker. A new version that arrives while the start screen is
// still showing is applied at once (reload); during play it waits for the next launch.

import { flags } from './config.js';

export function registerServiceWorker(app) {
  if (!('serviceWorker' in navigator) || flags.nosw) return;
  let hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) {
      hadController = true; // first install: nothing to refresh
      return;
    }
    if (!app.state.started) location.reload();
    else app.state.updateReady = true;
  });
  navigator.serviceWorker
    .register('./sw.js')
    .then((reg) => {
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) reg.update().catch(() => {});
      });
    })
    .catch(() => {});
}
