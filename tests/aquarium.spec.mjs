// End-to-end checks in iPad-sized viewports with touch emulation.
// Screenshots land in tests/shots/<project>/ for visual review.

import { test, expect } from '@playwright/test';

const SHOTS = 'tests/shots';

function collectErrors(page) {
  const errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('requestfailed', (r) => errors.push(`requestfailed: ${r.url()} ${r.failure()?.errorText ?? ''}`));
  return errors;
}

async function openApp(page, query = '') {
  const errors = collectErrors(page);
  await page.goto(`/${query}`);
  await page.waitForFunction(() => window.__aq && window.__aq.ready === true, null, { timeout: 60_000 });
  return errors;
}

const shot = (page, info, name) => page.screenshot({ path: `${SHOTS}/${info.project.name}/${name}.png` });

test('start screen, bubble pop and dive into the aquarium', async ({ page }, info) => {
  const errors = await openApp(page);
  await page.waitForTimeout(1500);
  await shot(page, info, '01-start');

  const box = await page.locator('#start-bubble').boundingBox();
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  await expect.poll(() => page.evaluate(() => window.__aq.state.started)).toBe(true);
  await page.waitForTimeout(900);
  await shot(page, info, '02-diving');
  await page.waitForTimeout(3200);
  await shot(page, info, '03-aquarium');

  const stats = await page.evaluate(() => window.__aq.snapshotStats());
  expect(stats.std, 'frame should not be blank').toBeGreaterThan(0.04);
  expect(['running', 'suspended', 'interrupted']).toContain(await page.evaluate(() => window.__aq.audioState()));
  // the little theme waltz plays for the dive (when the browser lets the sound run)
  if ((await page.evaluate(() => window.__aq.audioState())) === 'running') {
    expect(await page.evaluate(() => window.__aq.app.audio.played.theme ?? 0)).toBe(1);
  }
  expect(errors).toEqual([]);
});

test('behaves like an app: no text, no zoom, no scroll', async ({ page }) => {
  const errors = await openApp(page, '?autostart');
  const info = await page.evaluate(() => {
    const cs = getComputedStyle(document.body);
    const se = document.scrollingElement;
    return {
      text: document.body.innerText.trim(),
      viewport: document.querySelector('meta[name=viewport]').content,
      capable: document.querySelector('meta[name=apple-mobile-web-app-capable]')?.content,
      touchAction: cs.touchAction,
      userSelect: cs.webkitUserSelect || cs.userSelect,
      callout: cs.webkitTouchCallout ?? 'none',
      scrollable: se.scrollHeight > innerHeight + 1 || se.scrollWidth > innerWidth + 1,
      manifest: document.querySelector('link[rel=manifest]').href,
      icon: document.querySelector('link[rel=apple-touch-icon]').href,
    };
  });
  expect(info.text).toBe('');
  expect(info.viewport).toContain('user-scalable=no');
  expect(info.viewport).toContain('viewport-fit=cover');
  expect(info.capable).toBe('yes');
  expect(info.touchAction).toBe('none');
  expect(info.userSelect).toBe('none');
  expect(info.scrollable).toBe(false);

  const manifest = await (await page.request.get(info.manifest)).json();
  expect(manifest.icons.length).toBeGreaterThanOrEqual(2);
  const png = await (await page.request.get(info.icon)).body();
  expect(png.readUInt32BE(16)).toBe(180); // PNG width
  expect(png.readUInt32BE(20)).toBe(180); // PNG height
  expect(errors).toEqual([]);
});

test('quality manager starts on tier 2 on an iPad 10 screen', async ({ page }) => {
  await openApp(page, '?autostart');
  const perf = await page.evaluate(() => window.__aq.perf());
  expect(perf.startTier).toBe(2);
  expect(perf.dpr).toBeCloseTo(1.5, 2);
});

test('quality manager steps down on a slow device', async ({ page }) => {
  await openApp(page, '?autostart&simslow=34');
  await expect.poll(() => page.evaluate(() => window.__aq.perf().tier), { timeout: 20_000 }).toBeGreaterThan(2);
});

test('scene stays within the draw-call and triangle budget', async ({ page }, info) => {
  await openApp(page, '?autostart');
  await page.waitForTimeout(4000);
  const perf = await page.evaluate(() => window.__aq.perf());
  console.log(`[${info.project.name}] perf`, JSON.stringify(perf));
  expect(perf.sceneCalls).toBeLessThanOrEqual(90);
  expect(perf.sceneTriangles).toBeLessThanOrEqual(250_000);
});

test('depth buffer survives the bloom pass (debug view)', async ({ page }, info) => {
  const errors = await openApp(page, '?autostart&debug=depth');
  await page.waitForTimeout(3500);
  await shot(page, info, '09-depth');
  const stats = await page.evaluate(() => window.__aq.snapshotStats());
  expect(stats.std).toBeGreaterThan(0.05);
  expect(errors).toEqual([]);
});

test('works offline after the first visit', async ({ page, context, browserName }) => {
  test.skip(browserName === 'webkit', 'Playwright WebKit offline + service worker is unreliable; covered in Chromium');
  await openApp(page);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect.poll(() => page.evaluate(async () => (await caches.keys()).length), { timeout: 20_000 }).toBeGreaterThan(0);
  await expect
    .poll(() => page.evaluate(async () => {
      const keys = await caches.keys();
      const cache = await caches.open(keys[0]);
      return (await cache.keys()).length;
    }), { timeout: 20_000 })
    .toBeGreaterThan(20);
  await context.setOffline(true);
  await page.reload();
  await page.waitForFunction(() => window.__aq && window.__aq.ready === true, null, { timeout: 60_000 });
  await context.setOffline(false);
});

// ---------------------------------------------------------------- stage 2: fish

test('eight starter fish swim inside the view and keep moving', async ({ page }, info) => {
  const errors = await openApp(page, '?autostart');
  await page.waitForTimeout(3000);
  const size = page.viewportSize();
  let outside = 0;
  let samples = 0;
  let moved = 0;
  let prev = null;
  for (let i = 0; i < 16; i++) {
    const fish = await page.evaluate(() => window.__aq.fish());
    expect(fish.length).toBe(8);
    for (const f of fish) {
      samples++;
      if (f.x < -60 || f.x > size.width + 60 || f.y < -60 || f.y > size.height + 60) outside++;
    }
    if (prev) moved += fish.reduce((s, f, k) => s + Math.hypot(f.x - prev[k].x, f.y - prev[k].y), 0) / fish.length;
    prev = fish;
    await page.waitForTimeout(500);
  }
  expect(outside / samples, 'fish should stay on screen').toBeLessThan(0.02);
  expect(moved / 15, 'fish should be swimming').toBeGreaterThan(5);
  await shot(page, info, '10-fish');
  expect(errors).toEqual([]);
});

test('fish QA grid renders every shape, pattern and eye type', async ({ page }, info) => {
  test.skip(!info.project.name.endsWith('landscape'), 'grid is laid out for landscape');
  const errors = await openApp(page, '?autostart&fishgrid');
  await page.waitForTimeout(2500);
  await shot(page, info, '11-fishgrid-patterns');
  expect(await page.evaluate(() => window.__aq.fish().length)).toBe(16);
  await page.goto('/?autostart&fishgrid=eyes');
  await page.waitForFunction(() => window.__aq && window.__aq.ready === true);
  await page.waitForTimeout(2500);
  await shot(page, info, '12-fishgrid-eyes');
  expect(errors).toEqual([]);
});

test('night: glowing fish and jellyfish', async ({ page }, info) => {
  const errors = await openApp(page, '?autostart&night');
  await page.waitForTimeout(4000);
  await shot(page, info, '13-night');
  const stats = await page.evaluate(() => window.__aq.snapshotStats());
  expect(stats.mean, 'night should be darker than day').toBeLessThan(0.35);
  expect(errors).toEqual([]);
});

test('a NaN or Inf pixel never blacks out the screen', async ({ page }, info) => {
  const errors = await openApp(page, '?autostart&nantest');
  await page.waitForTimeout(3000);
  await shot(page, info, '14-nan-guard');
  const stats = await page.evaluate(() => window.__aq.snapshotStats());
  expect(stats.mean, 'screen must not go black').toBeGreaterThan(0.2);
  expect(stats.std).toBeGreaterThan(0.04);
  expect(errors).toEqual([]);
});

// ---------------------------------------------------------------- stage 3: interactions and sound

async function startApp(page, query = '') {
  const errors = await openApp(page, query);
  const box = await page.locator('#start-bubble').boundingBox();
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForFunction(() => window.__aq.state.started);
  await page.waitForTimeout(3600); // the dive and the buttons popping in
  return errors;
}

const visibleFish = (page) => page.evaluate(() => window.__aq.fish().filter((f) => f.visible && f.x > 80 && f.x < innerWidth - 80 && f.y > 80 && f.y < innerHeight - 160));

// A screen point in open water: away from every fish, and nothing else there either.
async function emptyWater(page) {
  return page.evaluate(() => {
    const fish = window.__aq.fish();
    for (let y = 120; y < innerHeight * 0.5; y += 30) {
      for (let x = 160; x < innerWidth - 160; x += 30) {
        if (fish.every((f) => Math.hypot(f.x - x, f.y - y) > 170) && window.__aq.whatIsAt(x, y) === 'water') return { x, y };
      }
    }
    return { x: innerWidth / 2, y: 110 };
  });
}

test('buttons are big, icon-only and react', async ({ page }, info) => {
  const errors = await startApp(page);
  for (const id of ['#btn-feed', '#btn-night']) {
    const b = await page.locator(id).boundingBox();
    expect(b.width).toBeGreaterThanOrEqual(96);
  }
  expect((await page.locator('#btn-sound').boundingBox()).width).toBeGreaterThanOrEqual(56);
  expect(await page.evaluate(() => document.body.innerText.trim())).toBe('');
  const feed = await page.locator('#btn-feed').boundingBox();
  await page.touchscreen.tap(feed.x + feed.width / 2, feed.y + feed.height / 2);
  await expect.poll(() => page.evaluate(() => window.__aq.app.world.food.flakes.length)).toBeGreaterThan(10);
  await expect.poll(() => page.evaluate(() => window.__aq.app.world.food.eaten), { timeout: 15_000 }).toBeGreaterThan(2);
  await shot(page, info, '20-feeding');
  expect(errors).toEqual([]);
});

test('tapping a fish makes it do a happy trick', async ({ page }, info) => {
  const errors = await startApp(page);
  const [f] = await visibleFish(page);
  await page.touchscreen.tap(f.x, f.y);
  expect(await page.evaluate(() => window.__aq.app.interaction.last.type)).toBe('fish');
  await page.waitForTimeout(250);
  await shot(page, info, '21-fish-trick');
  const state = await page.evaluate((id) => window.__aq.fish().find((q) => q.id === id).state, (await page.evaluate(() => window.__aq.app.interaction.last.id)));
  expect(state).toBe('trick');
  // …and sings its little tune (when the browser lets the audio run)
  const audio = await page.evaluate(() => ({ state: window.__aq.app.audio.state, played: window.__aq.app.audio.played }));
  if (audio.state === 'running') expect(audio.played.fishTune ?? 0).toBeGreaterThanOrEqual(1);
  expect(errors).toEqual([]);
});

test('tapping open water: ripple, bubbles and curious fish', async ({ page }, info) => {
  const errors = await startApp(page);
  const spot = await emptyWater(page);
  await page.touchscreen.tap(spot.x, spot.y);
  expect(await page.evaluate(() => window.__aq.app.interaction.last.type)).toBe('water');
  await page.waitForTimeout(300);
  await shot(page, info, '22-water');
  await expect.poll(() => page.evaluate(() => window.__aq.fish().some((f) => f.state === 'curious'))).toBe(true);
  expect(errors).toEqual([]);
});

test('the treasure chest opens and treasure rains down', async ({ page }, info) => {
  const errors = await startApp(page);
  const chest = await page.evaluate(() => {
    const a = window.__aq.app;
    const v = a.world.chest.group.position.clone();
    v.y += 0.9;
    v.project(a.core.camera);
    return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight };
  });
  await page.touchscreen.tap(chest.x, chest.y);
  expect(await page.evaluate(() => window.__aq.app.interaction.last.type)).toBe('chest');
  await page.waitForTimeout(700);
  await shot(page, info, '23-treasure');
  expect(await page.evaluate(() => window.__aq.app.world.treasure.items.length)).toBeGreaterThan(10);
  expect(errors).toEqual([]);
});

test('the crab dances when tapped', async ({ page }) => {
  const errors = await startApp(page);
  const crab = await page.evaluate(() => {
    const a = window.__aq.app;
    const v = a.world.crab.root.position.clone();
    v.y += 0.45;
    v.project(a.core.camera);
    return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight };
  });
  await page.touchscreen.tap(crab.x, crab.y);
  expect(await page.evaluate(() => window.__aq.app.interaction.last.type)).toBe('crab');
  expect(await page.evaluate(() => window.__aq.app.world.crab.state)).toBe('dance');
  expect(errors).toEqual([]);
});

test('night and mute are remembered', async ({ page }, info) => {
  const errors = await startApp(page);
  const night = await page.locator('#btn-night').boundingBox();
  await page.touchscreen.tap(night.x + night.width / 2, night.y + night.height / 2);
  const sound = await page.locator('#btn-sound').boundingBox();
  await page.touchscreen.tap(sound.x + sound.width / 2, sound.y + sound.height / 2);
  await page.waitForTimeout(3000);
  await shot(page, info, '24-night-button');
  await page.reload();
  await page.waitForFunction(() => window.__aq && window.__aq.ready === true);
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => window.__aq.app.audio.muted)).toBe(true);
  expect(await page.locator('#btn-night').getAttribute('class')).toContain('is-night');
  expect(await page.locator('#btn-sound').getAttribute('class')).toContain('is-muted');
  await page.evaluate(() => localStorage.clear());
  expect(errors).toEqual([]);
});

test('two children can tap two fish at the same time', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'real multitouch needs CDP');
  const errors = await startApp(page);
  const fish = await visibleFish(page);
  const a = fish[0];
  const b = fish.find((f) => Math.hypot(f.x - a.x, f.y - a.y) > 180);
  test.skip(!b, 'no two separate fish on screen');
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: a.x, y: a.y, id: 1 }, { x: b.x, y: b.y, id: 2 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(100);
  const states = await page.evaluate(([ia, ib]) => window.__aq.fish().filter((f) => f.id === ia || f.id === ib).map((f) => f.state), [a.id, b.id]);
  expect(states.filter((s) => s === 'trick').length).toBe(2);
  expect(errors).toEqual([]);
});

test('a finger gliding through the water leaves a trail that fish follow', async ({ page, browserName }, info) => {
  test.skip(browserName !== 'chromium', 'touch drags need CDP');
  const errors = await startApp(page);
  const spot = await emptyWater(page);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: spot.x, y: spot.y, id: 1 }] });
  let followed = false;
  for (let i = 1; i <= 30; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: spot.x + Math.sin(i / 4) * 220, y: spot.y + i * 6, id: 1 }] });
    await page.waitForTimeout(60);
    if (!followed) followed = await page.evaluate(() => window.__aq.fish().some((f) => f.state === 'follow'));
  }
  await shot(page, info, '25-trail');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  expect(followed).toBe(true);
  expect(errors).toEqual([]);
});

test('every sound is soft: no loud peaks, little treble, clearly above the ambience', async ({ page }) => {
  await openApp(page, '?autostart');
  const { recipes, ambience, ambienceNight } = await page.evaluate(() => window.__aq.app.audio.analyze());
  console.log('ambience', JSON.stringify(ambience), 'night', JSON.stringify(ambienceNight));
  console.log('sound analysis', JSON.stringify(recipes));
  // the calm bed never pushes the limiter and stays well under every tap; at night the
  // music box lullaby stays gentle too
  expect(ambience.peakDb).toBeLessThanOrEqual(-18);
  expect(ambienceNight.peakDb).toBeLessThanOrEqual(-18);
  expect(ambienceNight.loudest).toBeLessThanOrEqual(ambience.loudest + 4);
  for (const [name, r] of Object.entries(recipes)) {
    expect(r.peakDb, `${name} peak`).toBeLessThanOrEqual(-6);
    expect(r.trebleRatio, `${name} treble`).toBeLessThan(0.12);
    // (the whoosh is only ever an accent under the day/night chime)
    if (name !== 'whoosh') expect(r.loudness - ambience.loudest, `${name} over ambience`).toBeGreaterThanOrEqual(8);
    if (name !== 'whoosh') expect(r.loudness - ambienceNight.loudest, `${name} over night ambience`).toBeGreaterThanOrEqual(5);
  }
});

// ---------------------------------------------------------------- stage 4: fish factory, saving, parents' corner

const KEY = 'undervandsspil.v1';

async function tapEl(page, sel) {
  const bb = await page.locator(sel).first().boundingBox();
  await page.touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2);
}

async function openFactory(page) {
  await tapEl(page, '#btn-factory');
  await page.waitForFunction(() => window.__aq.app.view === 'factory' && !window.__aq.app.busy);
}

const ownFishDNA = (n, kind = 'design', from = 0) =>
  Array.from({ length: n }, (_, i) => ({ id: `test-${kind}-${from + i}`, born: 1000 + from + i, kind, shape: (from + i) % 4, color: '#3fa9ff', pattern: (from + i) % 4, eyes: (from + i) % 4, glow: true, seed: 5000 + from + i, paint: null, color2: null }));

async function seedFish(page, fish) {
  await page.evaluate(([key, list]) => localStorage.setItem(key, JSON.stringify({ v: 1, settings: { volume: 0.7 }, fish: list })), [KEY, fish]);
}

test('fish factory: shape, paint, pattern, eyes, let it go — and it is saved', async ({ page, browserName }, info) => {
  const errors = await startApp(page);
  await openFactory(page);
  expect(await page.evaluate(() => document.body.innerText.trim())).toBe('');
  await shot(page, info, '30-factory-shape');
  await tapEl(page, '.fac-options-0 .fac-opt:nth-child(2)'); // the long fish
  expect(await page.evaluate(() => window.__aq.app.factory.draft.shape)).toBe(1);
  await tapEl(page, '.fac-next');
  await tapEl(page, '.fac-options-1 .fac-blob:nth-child(5)'); // the first colour fills the fish: blue
  expect(await page.evaluate(() => window.__aq.app.factory.draft.color)).toBe('#3fa9ff');
  await tapEl(page, '.fac-options-1 .fac-blob:nth-child(2)'); // then yellow is the brush
  expect(await page.evaluate(() => [window.__aq.app.factory.draft.color, window.__aq.app.factory.draft.brush])).toEqual(['#3fa9ff', '#ffd23f']);
  if (browserName === 'chromium') {
    // finger painting: a real touch drag across the fish (once it has stopped turning)
    await page.waitForFunction(() => Math.abs(window.__aq.app.factory.extraYaw - window.__aq.app.factory.yawGoal) < 0.05);
    const a = await page.evaluate(() => window.__aq.app.factory.ui.freeArea());
    const cx = (a.left + a.right) / 2;
    const cy = (a.top + a.bottom) / 2;
    const cdp = await page.context().newCDPSession(page);
    const strokeStart = Date.now();
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx - 140, y: cy, id: 1 }] });
    for (let i = 0; i <= 28; i++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cx - 140 + i * 10, y: cy + Math.sin(i * 0.6) * 18, id: 1 }] });
      await page.waitForTimeout(16);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    const strokeMs = Date.now() - strokeStart;
    expect(await page.evaluate(() => window.__aq.app.factory.painter.coverage())).toBeGreaterThan(0.01);
    // painting sings a slow little tune: a few soft notes, never a stream (and no swish)
    const played = await page.evaluate(() => window.__aq.app.audio.played);
    expect(played.paintNote ?? 0).toBeGreaterThanOrEqual(1);
    expect(played.paintNote ?? 0).toBeLessThanOrEqual(Math.floor(strokeMs / 300) + 1);
    expect(played.brush).toBeUndefined();
  }
  await shot(page, info, '31-factory-paint');
  await tapEl(page, '.fac-next');
  await tapEl(page, '.fac-options-2 .fac-opt:nth-child(2)'); // stripes
  await tapEl(page, '.fac-next');
  await tapEl(page, '.fac-options-3 .fac-opt:nth-child(4)'); // googly eyes
  await tapEl(page, '.fac-next');
  await page.waitForTimeout(500);
  await shot(page, info, '32-factory-release');
  await tapEl(page, '.fac-release');
  await page.waitForFunction(() => window.__aq.app.view === 'aquarium' && !window.__aq.app.busy, null, { timeout: 10_000 });
  const own = await page.evaluate(() => window.__aq.app.population.own.map((d) => ({ kind: d.kind, shape: d.shape, pattern: d.pattern, eyes: d.eyes, color: d.color, painted: !!d.paint })));
  expect(own).toHaveLength(1);
  expect(own[0]).toMatchObject({ kind: 'design', shape: 1, pattern: 1, eyes: 3, color: '#3fa9ff' });
  if (browserName === 'chromium') expect(own[0].painted).toBe(true);
  // it dives in and says hello
  await expect.poll(() => page.evaluate(() => window.__aq.fish().find((f) => f.kind === 'design')?.state), { timeout: 8000 }).toMatch(/gaze|wander|curious/);
  await page.waitForTimeout(400);
  await shot(page, info, '33-new-fish');
  expect(await page.evaluate(() => window.__aq.fish().length)).toBe(9);
  // saved: still there after a reload, painting and all
  await page.reload();
  await page.waitForFunction(() => window.__aq && window.__aq.ready === true);
  const after = await page.evaluate(() => window.__aq.app.population.own.map((d) => ({ shape: d.shape, painted: !!d.paint })));
  expect(after).toEqual([{ shape: 1, painted: browserName === 'chromium' }]);
  expect(await page.evaluate(() => window.__aq.fish().filter((f) => f.kind === 'design').length)).toBe(1);
  expect(errors).toEqual([]);
});

test('magic wand: a surprise fish in one tap, out with one more', async ({ page }, info) => {
  const errors = await startApp(page);
  await openFactory(page);
  await tapEl(page, '.fac-wand');
  await expect.poll(() => page.evaluate(() => window.__aq.app.factory.step)).toBe(4);
  expect(await page.evaluate(() => window.__aq.app.factory.draft.kind)).toBe('wand');
  await page.waitForTimeout(600);
  await shot(page, info, '34-wand');
  await tapEl(page, '.fac-release');
  await page.waitForFunction(() => window.__aq.app.view === 'aquarium' && !window.__aq.app.busy, null, { timeout: 10_000 });
  expect(await page.evaluate(() => window.__aq.app.population.own.map((d) => d.kind))).toEqual(['wand']);
  // the factory is ready for a new fish
  expect(await page.evaluate(() => window.__aq.app.factory.step)).toBe(0);
  expect(errors).toEqual([]);
});

test('the unfinished fish is remembered', async ({ page }) => {
  const errors = await startApp(page);
  await openFactory(page);
  await tapEl(page, '.fac-options-0 .fac-opt:nth-child(4)'); // puffer
  await tapEl(page, '.fac-next');
  await tapEl(page, '.fac-options-1 .fac-blob:nth-child(3)'); // pink
  await tapEl(page, '.fac-home');
  await page.waitForFunction(() => window.__aq.app.view === 'aquarium' && !window.__aq.app.busy);
  await page.waitForTimeout(700);
  await page.reload();
  await page.waitForFunction(() => window.__aq && window.__aq.ready === true);
  const d = await page.evaluate(() => ({ ...window.__aq.app.factory.draft, step: window.__aq.app.factory.step }));
  expect(d).toMatchObject({ shape: 3, color: '#ff5d8f', step: 1 });
  expect(errors).toEqual([]);
});

test('never more than 25 fish: starters make room first, then the oldest wand fish', async ({ page }) => {
  const errors = await openApp(page, '?autostart');
  await seedFish(page, ownFishDNA(17));
  await page.reload();
  await page.waitForFunction(() => window.__aq && window.__aq.ready === true);
  expect(await page.evaluate(() => window.__aq.fish().length)).toBe(25);
  // one more: a starter swims out
  await page.evaluate(() => window.__aq.app.population.release({ id: 'new-1', born: Date.now(), kind: 'design', shape: 0, color: '#ff5d8f', pattern: 0, eyes: 0, glow: true, seed: 9, paint: null }));
  const leaving = await page.evaluate(() => window.__aq.fish().filter((f) => f.state === 'leave').map((f) => f.kind));
  expect(leaving).toEqual(['starter']);
  await expect.poll(() => page.evaluate(() => window.__aq.fish().length), { timeout: 20_000 }).toBe(25);

  // full of own fish: the oldest wand fish makes room (and is gone for good)
  await seedFish(page, [...ownFishDNA(2, 'wand', 0), ...ownFishDNA(23, 'design', 2)]);
  await page.reload();
  await page.waitForFunction(() => window.__aq && window.__aq.ready === true);
  expect(await page.evaluate(() => window.__aq.fish().filter((f) => f.kind === 'starter').length)).toBe(0);
  await page.evaluate(() => window.__aq.app.population.release({ id: 'new-2', born: Date.now(), kind: 'design', shape: 1, color: '#ff5d8f', pattern: 0, eyes: 0, glow: true, seed: 10, paint: null }));
  expect(await page.evaluate(() => window.__aq.fish().filter((f) => f.state === 'leave').map((f) => f.id))).toEqual(['test-wand-0']);
  await page.evaluate(() => window.__aq.app.population.saving);
  const stored = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)).fish.map((f) => f.id), KEY);
  expect(stored).toHaveLength(25);
  expect(stored).not.toContain('test-wand-0');
  expect(stored).toContain('new-2');
  expect(errors).toEqual([]);
});

test("parents' corner: opens only after a 3-second press; delete brings the starters back", async ({ page }, info) => {
  const errors = await openApp(page);
  await seedFish(page, ownFishDNA(3));
  await page.reload();
  const more = await startApp(page);
  const gear = await page.locator('.gear').boundingBox();
  const gx = gear.x + gear.width / 2;
  const gy = gear.y + gear.height / 2;
  // a short press does nothing
  await page.mouse.move(gx, gy);
  await page.mouse.down();
  await page.waitForTimeout(900);
  await page.mouse.up();
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => window.__aq.app.parent.isOpen)).toBe(false);
  // three seconds open it
  await page.mouse.down();
  await page.waitForTimeout(3300);
  await page.mouse.up();
  expect(await page.evaluate(() => window.__aq.app.parent.isOpen)).toBe(true);
  expect(await page.evaluate(() => document.body.innerText.trim())).toBe('');
  await shot(page, info, '35-parents');
  // volume: a tap on the slider sets it too (dragging is tested on its own)
  const vol = await page.locator('.p-slider').first().boundingBox();
  await page.mouse.click(vol.x + 26 + (vol.width - 52) * 0.35, vol.y + vol.height / 2);
  expect(await page.evaluate(() => window.__aq.app.audio.volume)).toBeCloseTo(0.35, 1);
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)).settings.volume, KEY)).toBeCloseTo(0.35, 1);
  // delete our own fish: ✓
  await page.locator('.p-delete').click();
  await page.locator('.p-yes').click();
  expect(await page.evaluate(() => window.__aq.app.parent.isOpen)).toBe(false);
  expect(await page.evaluate(() => window.__aq.app.population.own.length)).toBe(0);
  await expect.poll(() => page.evaluate(() => window.__aq.fish().filter((f) => f.kind === 'design').length), { timeout: 20_000 }).toBe(0);
  expect(await page.evaluate(() => window.__aq.fish().filter((f) => f.kind === 'starter').length)).toBe(8);
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)).fish.length, KEY)).toBe(0);
  expect([...errors, ...more]).toEqual([]);
});

// ---------------------------------------------------------------- stage 6: juice

test('big bubbles can be popped — sometimes with a surprise inside', async ({ page }, info) => {
  const errors = await startApp(page);
  await page.evaluate(() => {
    const bb = window.__aq.app.world.bigBubbles;
    bb.spawn(bb.spots[2]);
  });
  await page.waitForTimeout(1600);
  const [b] = await page.evaluate(() => window.__aq.bubbles());
  expect(b).toBeTruthy();
  await page.touchscreen.tap(b.x, b.y);
  expect(await page.evaluate(() => window.__aq.app.interaction.last.type)).toBe('bubble');
  expect(await page.evaluate(() => window.__aq.app.world.bigBubbles.popped)).toBe(1);
  await page.waitForTimeout(150);
  await shot(page, info, '40-bubble-pop');
  expect(errors).toEqual([]);
});

test('tapping the sand: now and then a starfish peeks out and waves', async ({ page }, info) => {
  const errors = await startApp(page);
  const spot = await page.evaluate(() => {
    for (let y = innerHeight - 190; y > innerHeight * 0.55; y -= 20) {
      for (let x = 300; x < innerWidth - 300; x += 25) if (window.__aq.whatIsAt(x, y) === 'sand') return { x, y };
    }
    return null;
  });
  expect(spot).toBeTruthy();
  await page.touchscreen.tap(spot.x, spot.y);
  await page.waitForTimeout(200);
  await page.touchscreen.tap(spot.x, spot.y);
  expect(await page.evaluate(() => window.__aq.app.world.starfish.busy)).toBe(true);
  await page.waitForTimeout(700);
  await shot(page, info, '41-starfish');
  await expect.poll(() => page.evaluate(() => window.__aq.app.world.starfish.busy), { timeout: 6000 }).toBe(false);
  expect(errors).toEqual([]);
});

test('when nobody touches for a while, a fish comes to the glass to say hello', async ({ page }) => {
  const errors = await startApp(page);
  await page.evaluate(() => {
    window.__aq.app.interaction.lastInputAt = performance.now() - 20000;
  });
  await expect.poll(() => page.evaluate(() => window.__aq.app.world.school.fish.some((f) => f.state === 'curious' && Math.abs(f.target.z - 2.8) < 0.01)), { timeout: 4000 }).toBe(true);
  expect(errors).toEqual([]);
});

// ---------------------------------------------------------------- tools for parents and for measuring

test('?fill=25 fills the aquarium with painted test fish — and saves nothing', async ({ page }, info) => {
  const errors = await openApp(page, '?fill=25&autostart');
  await page.waitForTimeout(1500);
  const own = await page.evaluate(() => window.__aq.app.population.own.map((d) => ({ shape: d.shape, pattern: d.pattern, eyes: d.eyes, painted: /^data:image\/jpeg/.test(d.paint || '') })));
  expect(own).toHaveLength(25);
  expect(own.every((f) => f.painted)).toBe(true);
  for (const k of ['shape', 'pattern', 'eyes']) expect(new Set(own.map((f) => f[k])).size).toBe(4);
  expect(await page.evaluate(() => window.__aq.fish().length)).toBe(25);
  const perf = await page.evaluate(() => window.__aq.perf());
  console.log('fill=25 perf', JSON.stringify({ calls: perf.sceneCalls, tris: perf.sceneTriangles, tier: perf.tier }));
  expect(perf.sceneCalls).toBeLessThanOrEqual(90);
  expect(perf.sceneTriangles).toBeLessThanOrEqual(250_000);
  await shot(page, info, '50-fill-25');
  // even a fish from the factory is not written down in this mode
  await page.evaluate(() => window.__aq.app.population.release({ id: 'new-fill', born: Date.now(), kind: 'design', shape: 0, color: '#ff5d8f', pattern: 0, eyes: 0, glow: true, seed: 3, paint: null }));
  await page.evaluate(() => window.__aq.app.population.saving);
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key) || '{"fish":[]}').fish.length, KEY)).toBe(0);
  expect(errors).toEqual([]);
});

async function openParents(page) {
  const gear = await page.locator('.gear').boundingBox();
  await page.mouse.move(gear.x + gear.width / 2, gear.y + gear.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(3300);
  await page.mouse.up();
  await page.waitForFunction(() => window.__aq.app.parent.isOpen);
}

test("parents' corner: save a copy of our fish as a file — and load it back", async ({ page }, info) => {
  const errors = await openApp(page);
  const tinyJpeg = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 16;
    c.height = 8;
    const g = c.getContext('2d');
    g.fillStyle = '#ff5d8f';
    g.fillRect(0, 0, 16, 8);
    return c.toDataURL('image/jpeg', 0.8);
  });
  await seedFish(page, ownFishDNA(3).map((f, i) => ({ ...f, paint: i === 0 ? tinyJpeg : null })));
  await page.reload();
  const more = await startApp(page);
  await openParents(page);
  expect(await page.evaluate(() => document.body.innerText.trim())).toBe('');
  await shot(page, info, '51-parents-copies');

  // save a copy: through the iPad's share sheet ("Save to Files") — stubbed here…
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true });
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: async ({ files }) => {
        window.__shared = { name: files[0].name, type: files[0].type, text: await files[0].text() };
      },
    });
  });
  await page.locator('.p-save').click();
  await page.waitForFunction(() => window.__shared);
  const shared = await page.evaluate(() => window.__shared);
  expect(shared.name).toMatch(/^akvariet-\d{4}-\d{2}-\d{2}\.json$/);
  expect(shared.type).toBe('application/json');
  const copy = JSON.parse(shared.text);
  expect(copy.app).toBe('undervandsspil');
  expect(copy.fish.map((f) => f.id)).toEqual(['test-design-0', 'test-design-1', 'test-design-2']);
  expect(copy.fish[0].paint).toBe(tinyJpeg);
  // …or, without a share sheet, as a download
  await page.evaluate(() => Object.defineProperty(navigator, 'canShare', { configurable: true, value: undefined }));
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('.p-save').click()]);
  expect(download.suggestedFilename()).toMatch(/^akvariet-.*\.json$/);

  // delete our fish… and load the copy: they swim home again, painting and all
  await page.locator('.p-delete').click();
  await page.locator('.p-yes').click();
  expect(await page.evaluate(() => window.__aq.app.population.own.length)).toBe(0);
  await openParents(page);
  await page.setInputFiles('.p-file', { name: 'akvariet.json', mimeType: 'application/json', buffer: Buffer.from(shared.text) });
  await expect.poll(() => page.evaluate(() => window.__aq.app.population.own.length)).toBe(3);
  await expect(page.locator('.p-load')).toHaveClass(/p-ok/);
  expect(await page.evaluate(() => window.__aq.app.population.own[0].paint)).toBe(tinyJpeg);
  await page.evaluate(() => window.__aq.app.population.saving);
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)).fish.length, KEY)).toBe(3);

  // a file that is not ours is refused kindly (a little shake), and nothing changes
  await page.setInputFiles('.p-file', { name: 'other.json', mimeType: 'application/json', buffer: Buffer.from('{"hello": "world"}') });
  await expect(page.locator('.p-load')).toHaveClass(/p-nope/);
  // a sneaky painting is left out, the rest of the fish is kept
  const sneaky = JSON.stringify({ app: 'undervandsspil', v: 1, fish: [{ ...copy.fish[1], id: 'sneaky-1', paint: 'javascript:alert(1)' }] });
  await page.setInputFiles('.p-file', { name: 'sneaky.json', mimeType: 'application/json', buffer: Buffer.from(sneaky) });
  await expect.poll(() => page.evaluate(() => window.__aq.app.population.own.length)).toBe(4);
  expect(await page.evaluate(() => window.__aq.app.population.own.find((d) => d.id === 'sneaky-1').paint)).toBeNull();
  expect([...errors, ...more]).toEqual([]);
});

test("parents' corner: the sliders follow a dragging finger", async ({ page, browserName }) => {
  const errors = await startApp(page);
  await openParents(page);
  const box = await page.locator('.p-slider').first().boundingBox();
  const y = box.y + box.height / 2;
  const at = (k) => box.x + 26 + (box.width - 52) * k; // the rail inside the slider
  const start = await page.evaluate(() => window.__aq.app.audio.volume);
  const thumbX = at(start);
  if (browserName === 'chromium') {
    // a real touch drag, like a finger on the iPad (the page blocks touchmove scrolling)
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: thumbX, y, id: 1 }] });
    for (let i = 1; i <= 12; i++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: thumbX + ((at(0.25) - thumbX) * i) / 12, y, id: 1 }] });
      await page.waitForTimeout(16);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } else {
    await page.mouse.move(thumbX, y);
    await page.mouse.down();
    await page.mouse.move(at(0.25), y, { steps: 12 });
    await page.mouse.up();
  }
  expect(await page.evaluate(() => window.__aq.app.audio.volume)).toBeCloseTo(0.25, 1);
  await expect.poll(() => page.evaluate((key) => JSON.parse(localStorage.getItem(key)).settings.volume, KEY)).toBeCloseTo(0.25, 1);
  // the sea-sound slider too
  const sea = await page.locator('.p-slider').nth(1).boundingBox();
  await page.mouse.move(sea.x + 26 + (sea.width - 52) * 0.5, sea.y + sea.height / 2);
  await page.mouse.down();
  await page.mouse.move(sea.x + 26 + (sea.width - 52) * 0.9, sea.y + sea.height / 2, { steps: 8 });
  await page.mouse.up();
  expect(await page.evaluate(() => window.__aq.app.audio.ambienceAmount)).toBeCloseTo(0.9, 1);
  expect(errors).toEqual([]);
});
