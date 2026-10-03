// Akvariet — entry point: wires renderer, world, the fish factory, quality manager, start
// screen, parents' corner and the loop.

import * as THREE from 'three';
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
import { loadState, saveSettings, requestPersistence } from './storage.js';
import { backupFile, offerFile, readBackup } from './backup.js';
import { Population } from './fish/population.js';
import { testFish } from './fish/testfish.js';
import { Factory } from './factory/factory.js';
import { BubbleWipe } from './ui/transition.js';
import { ParentCorner } from './ui/parent.js';

blockBrowserGestures();
audio.installUnlockListeners();
requestPersistence();

const canvas = document.getElementById('scene');
const core = createCore(canvas);
const rig = new CameraRig(core.camera);
const state = { started: false, updateReady: false };
// view: what is on screen ('aquarium' | 'factory'); busy: a bubble transition is running
const app = { core, rig, state, audio, afterRender: null, view: 'aquarium', busy: false };

const world = new World(core, rig);
app.world = world;
const population = new Population(world.school);
app.population = population;

// ---------------------------------------------------------------- settings, fish, buttons

const saved = loadState();
audio.setVolume(saved.settings.volume);
audio.setAmbience(saved.settings.ambience);
audio.setMuted(saved.settings.muted);
if (saved.settings.night) {
  setNight(true, true);
  audio.setNight(true);
}
if (flags.fill !== null) {
  population.ephemeral = true; // ?fill: painted test fish instead of ours, never saved
  population.init(testFish(flags.fill));
} else if (!world.school.grid) {
  population.init(saved.fish);
}

const interaction = new Interaction(app);
app.interaction = interaction;
const hud = new Hud({
  onFeed: () => interaction.feed(),
  onNight: () => hud.setNight(interaction.toggleNight()),
  onSound: () => hud.setMuted(interaction.toggleSound()),
  onFactory: () => app.openFactory(),
});
hud.setNight(saved.settings.night);
hud.setMuted(saved.settings.muted);
app.hud = hud;

const factory = new Factory(app, { draft: saved.draft });
app.factory = factory;
const wipe = new BubbleWipe();

const parent = new ParentCorner({
  volume: saved.settings.volume,
  ambience: saved.settings.ambience,
  onVolume: (v) => {
    audio.setVolume(v);
    saveSettings({ volume: v });
    audio.play('tock', { note: 9 });
  },
  onAmbience: (v) => {
    audio.setAmbience(v);
    saveSettings({ ambience: v });
  },
  onDelete: () => {
    population.clearOwn();
    audio.play('chime', { up: false, gain: 0.07 });
  },
  // a copy of our own fish as a file (with ?fill the saved ones, not the test fish)
  onSaveCopy: () => {
    const fish = population.ephemeral ? loadState().fish : population.own;
    offerFile(backupFile(fish)).then((how) => {
      if (how !== 'cancelled') parent.feedback(parent.save, true);
    });
  },
  // …and back again: the fish we do not have yet swim home
  onLoadCopy: async (file) => {
    const fish = file.size < 20_000_000 && !population.ephemeral ? readBackup(await file.text()) : null;
    if (!fish || !fish.length) {
      parent.feedback(parent.load, false);
      audio.play('pling', { note: 4, gain: 0.06, decay: 0.4 });
      return;
    }
    population.adopt(fish);
    parent.feedback(parent.load, true);
    audio.play('chime', { up: true, gain: 0.07 });
  },
});
app.parent = parent;

// ---------------------------------------------------------------- happy little sounds

world.school.onEat = (fish, full) => {
  audio.play('nom');
  world.fx.love(fish.pos, full ? 6 : 2);
  if (full) audio.play('fishTune', { trick: fish.trick(), base: fish.voice }, 0.25);
};
world.onCrabEat = (p) => {
  audio.play('nom', { gain: 0.12 });
  world.fx.sparkles(p, 5, 0.6);
};
world.treasure.onBounce = (item) => audio.play('pling', { note: 7 + item.kind * 2 + Math.floor(Math.random() * 3), gain: 0.05, decay: 0.5 });

// A new fish from the factory breaks into the picture: splash, bubbles, confetti…
const _p = new THREE.Vector3();
world.school.onSplash = (fish) => {
  const p = fish.pos;
  _p.copy(p).project(core.camera);
  core.finalPass.addRipple(_p.x * 0.5 + 0.5, Math.min(_p.y * 0.5 + 0.5, 0.97), time, 1.3);
  world.bubbles.burst(p.x, p.y, p.z, 28, 0.7, 0.06, 0.24);
  world.fx.confetti(p, 34);
  rig.kick.set(0, -0.14, -0.22);
  audio.play('splash', { gain: 0.2, bubbles: 4 });
  audio.play('fanfare', {}, 0.12);
};
// …and once it has arrived the others come to say hello and the crab dances.
world.school.onArrive = (fish) => {
  world.fx.love(fish.pos, 8);
  world.school.curious(fish.pos.clone(), 4, fish);
  world.crab.celebrate();
  audio.play('fishTune', { trick: 'jump', base: fish.voice }); // "hello!"
  setTimeout(() => {
    const near = world.school.fish.filter((f) => f !== fish && f.state !== 'leave').sort((a, b) => a.pos.distanceTo(fish.pos) - b.pos.distanceTo(fish.pos));
    near.slice(0, 3).forEach((f, i) => {
      world.fx.love(f.pos, 3);
      audio.play('fishTune', { base: f.voice, short: true }, 0.01 + i * 0.18);
    });
  }, 1300);
};

// A fish that has to make room waves goodbye and sings "bye-bye".
world.school.onLeave = (fish) => {
  world.fx.love(fish.pos, 2);
  audio.play('goodbye', { base: fish.voice });
};

// Nobody has touched the aquarium for a while: a fish swims up to the glass to say hello.
let visit = null;
let lastVisit = -1e9;
function idleVisit(now) {
  if (!state.started || app.view !== 'aquarium' || app.busy) return;
  if (!visit && now - interaction.lastInputAt > 14000 && now - lastVisit > 16000) {
    lastVisit = now;
    const free = world.school.fish.filter((f) => f.state === 'wander');
    if (!free.length) return;
    const f = free[Math.floor(Math.random() * free.length)];
    const b = world.school.boundsAt(2.8);
    f.curious(new THREE.Vector3(b.xMin + 3 + Math.random() * (b.xMax - b.xMin - 6), b.yMin + (b.yMax - b.yMin) * 0.45, 2.8));
    f.until = 8;
    visit = f;
  }
  if (visit) {
    const f = visit;
    if (f.state !== 'curious' || !world.school.fish.includes(f)) {
      visit = null;
    } else if (f.pos.distanceTo(f.target) < 1.3) {
      const facingRight = Math.cos(f.yaw) > 0;
      f.setState('gaze', { gazeYaw: facingRight ? -Math.PI / 2 + 0.5 : -Math.PI / 2 - 0.5, gazeFor: 3 });
      f.happy.target = 0.9;
      world.fx.love(f.pos, 3);
      audio.play('fishTune', { trick: 'roll', base: f.voice, gain: 0.08 });
      visit = null;
    }
  }
}

// ---------------------------------------------------------------- aquarium ⇄ fish factory

app.openFactory = () => {
  if (app.view !== 'aquarium' || app.busy || !state.started) return;
  app.busy = true;
  hud.hide();
  parent.setVisible(false);
  audio.play('whoosh', { up: true, gain: 0.08 });
  audio.play('sparkle', { from: 8, count: 6, gain: 0.04 }, 0.2);
  wipe
    .play(() => {
      app.view = 'factory';
      core.setScene(factory.scene, factory.camera);
      core.finalPass.uniforms.uDof.value = 0;
      core.bloom.strength = 0.18; // the fish is big here: keep it crisp
      factory.show();
    })
    .then(() => {
      app.busy = false;
    });
};

app.closeFactory = ({ release = null } = {}) => {
  if (app.view !== 'factory' || app.busy) return;
  app.busy = true;
  audio.play('whoosh', { up: false, gain: 0.08 });
  wipe
    .play(() => {
      factory.hide();
      app.view = 'aquarium';
      core.setScene(core.scene, core.camera);
      core.bloom.strength = 0.5;
      applyTier(quality.tier);
      if (release) {
        population.release(release, 0.75);
        factory.reset();
      }
    })
    .then(() => {
      app.busy = false;
      hud.show();
      parent.setVisible(true);
    });
};

// ---------------------------------------------------------------- quality

const quality = new Quality({ device, flags, onChange: applyTier });
app.quality = quality;

function applyTier(index) {
  const tier = TIERS[index];
  core.setSize(window.innerWidth, window.innerHeight, quality.dprFor(index));
  core.setBloom(tier.bloom);
  core.finalPass.uniforms.uDof.value = tier.dof && app.view === 'aquarium' ? 1 : 0;
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
    factory.onResize();
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
  setTimeout(
    () => {
      hud.show();
      parent.setVisible(true);
    },
    flags.autostart ? 0 : 2300,
  );
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
  if (app.view === 'factory') {
    world.caustics.render(core.renderer, time); // the light net still plays on the fish
    factory.update(time, dt);
  } else {
    rig.update(time, dt);
    world.update(time, dt, core.camera);
    idleVisit(now);
  }

  // Behind the start bubble the reef is dreamy and soft; it sharpens during the dive.
  blur += ((state.started ? 0 : 0.9) - blur) * (1 - Math.exp(-dt * 2.2));
  const fp = core.finalPass.uniforms;
  fp.uGlobalBlur.value = blur < 0.003 || app.view === 'factory' ? 0 : blur;
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
      Promise.all([core.renderer.compileAsync(core.scene, core.camera), core.renderer.compileAsync(factory.scene, factory.camera)]),
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
