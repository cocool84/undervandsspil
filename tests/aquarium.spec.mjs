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
  const { recipes, ambience } = await page.evaluate(() => window.__aq.app.audio.analyze());
  console.log('ambience', JSON.stringify(ambience));
  console.log('sound analysis', JSON.stringify(recipes));
  // the calm bed never pushes the limiter and stays well under every tap
  expect(ambience.peakDb).toBeLessThanOrEqual(-18);
  for (const [name, r] of Object.entries(recipes)) {
    expect(r.peakDb, `${name} peak`).toBeLessThanOrEqual(-6);
    expect(r.trebleRatio, `${name} treble`).toBeLessThan(0.12);
    // (the whoosh is only ever an accent under the day/night chime)
    if (name !== 'whoosh') expect(r.loudness - ambience.loudest, `${name} over ambience`).toBeGreaterThanOrEqual(8);
  }
});
