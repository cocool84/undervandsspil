// Akvariet — entry point: wires renderer, world, quality manager, start screen and loop.

import { flags, device, TIERS } from './config.js';
import { createCore } from './core/renderer.js';
import { CameraRig } from './core/camera.js';
import { Quality } from './core/quality.js';
import { updateEnvironment, setNight } from './core/uniforms.js';
import { World } from './world/world.js';
import { StartScreen, requestFullscreen } from './ui/start.js';
import { audio } from './audio/engine.js';
import { blockBrowserGestures } from './input.js';
import { installDebug } from './debug.js';
import { registerServiceWorker } from './sw-client.js';
import { addNanTest } from './debug.js';
import { Interaction } from './interact.js';
import { Hud } from './ui/hud.js';
import { loadState } from './storage.js';

blockBrowserGestures();
audio.installUnlockListeners();

const canvas = document.getElementById('scene');
const core = createCore(canvas);
const rig = new CameraRig(core.camera);
const state = { started: false, updateReady: false };
const app = { core, rig, state, audio, afterRender: null };

const world = new World(core, rig);
app.world = world;

// ---------------------------------------------------------------- settings, touch, buttons

const saved = loadState();
audio.setVolume(saved.settings.volume);
audio.setMuted(saved.settings.muted);
if (saved.settings.night) {
  setNight(true, true);
  audio.setNight(true);
}

const interaction = new Interaction(app);
app.interaction = interaction;
const hud = new Hud({
  onFeed: () => interaction.feed(),
  onNight: () => hud.setNight(interaction.toggleNight()),
  onSound: () => hud.setMuted(interaction.toggleSound()),
});
hud.setNight(saved.settings.night);
hud.setMuted(saved.settings.muted);
app.hud = hud;

// happy little sounds from the world
world.school.onEat = (fish, full) => {
  audio.play('nom');
  world.fx.love(fish.pos, full ? 6 : 2);
  if (full) {
    fish.trick();
    audio.play('giggle', { pitch: 700 / fish.size }, 0.25);
  }
};
world.onCrabEat = (p) => {
  audio.play('nom', { gain: 0.12 });
  world.fx.sparkles(p, 5, 0.6);
};
world.treasure.onBounce = (item) => audio.play('pling', { note: 7 + item.kind * 2 + Math.floor(Math.random() * 3), gain: 0.05, decay: 0.5 });

const quality = new Quality({ device, flags, onChange: applyTier });
app.quality = quality;

function applyTier(index) {
  const tier = TIERS[index];
  core.setSize(window.innerWidth, window.innerHeight, quality.dprFor(index));
  core.setBloom(tier.bloom);
  core.finalPass.uniforms.uDof.value = tier.dof ? 1 : 0;
  core.finalPass.uniforms.uTaps.value = Math.max(tier.taps, 8);
  world.applyTier(tier);
}

let resizePending = false;
function onResize() {
  if (resizePending) return;
  resizePending = true;
  requestAnimationFrame(() => {
    resizePending = false;
    const w = window.innerWidth;
    const h = window.innerHeight;
    core.setSize(w, h, quality.dprFor(quality.tier));
    rig.frame(w / h);
    quality.settleFor(1);
  });
}
window.addEventListener('resize', onResize);
window.visualViewport?.addEventListener('resize', onResize);
window.addEventListener('orientationchange', onResize);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) quality.settleFor(1.5);
});

// ---------------------------------------------------------------- start

let time = 0;
let fullscreenTries = 0;
let fullscreenAt = -1e9;
const start = new StartScreen({
  // `activation` is true for pointerup/touchend, which iOS accepts for fullscreen. Both fire
  // for one tap, so only one request per tap.
  onGesture(activation) {
    audio.unlock();
    const now = performance.now();
    if (activation && fullscreenTries < 3 && !flags.autostart && now - fullscreenAt > 800) {
      fullscreenAt = now;
      fullscreenTries = requestFullscreen() ? 3 : fullscreenTries + 1;
    }
  },
  onPop() {
    app.start();
  },
});

app.start = () => {
  if (state.started) return;
  state.started = true;
  rig.startDive();
  audio.startAmbience();
  audio.play('pop');
  setTimeout(() => hud.show(), flags.autostart ? 0 : 2300);
};

// ---------------------------------------------------------------- loop

const debug = installDebug(app);
let last = performance.now();
let skip = false;
let blur = 0.9;

function busyWait(ms) {
  const end = performance.now() + ms;
  while (performance.now() < end) {
    /* simulate a slow device */
  }
}

function loop(now) {
  if (quality.halfRate) {
    skip = !skip;
    if (skip) return;
  }
  const dtMs = now - last;
  last = now;
  const dt = Math.min(dtMs / 1000, 1 / 20);
  time += dt;
  if (flags.simslow) busyWait(flags.simslow);
  quality.frame(dtMs, dt, now);
  debug.frame(dtMs);

  updateEnvironment(time, dt);
  rig.update(time, dt);
  world.update(time, dt, core.camera);

  // Behind the start bubble the reef is dreamy and soft; it sharpens during the dive.
  blur += ((state.started ? 0 : 0.9) - blur) * (1 - Math.exp(-dt * 2.2));
  const fp = core.finalPass.uniforms;
  fp.uGlobalBlur.value = blur < 0.003 ? 0 : blur;
  fp.uTime.value = time;

  core.renderer.info.reset();
  core.composer.render(dt);
  if (app.afterRender) {
    const cb = app.afterRender;
    app.afterRender = null;
    cb();
  }
}

async function boot() {
  applyTier(quality.tier);
  rig.frame(window.innerWidth / window.innerHeight);
  if (flags.debugView === 'depth') core.finalPass.uniforms.uDebugDepth.value = 1;
  if (flags.night) {
    setNight(true, true);
    audio.setNight(true);
    hud.setNight(true);
  }
  if (flags.nantest) addNanTest(core.scene);
  try {
    await Promise.race([
      core.renderer.compileAsync(core.scene, core.camera),
      new Promise((resolve) => setTimeout(resolve, 4000)),
    ]);
  } catch {
    /* shaders will compile on first use instead */
  }
  last = performance.now();
  core.renderer.setAnimationLoop(loop);
  window.__aq.ready = true;
  start.sceneReady();
  if (flags.autostart) start.pop(null, false);
  registerServiceWorker(app);
}

boot();
