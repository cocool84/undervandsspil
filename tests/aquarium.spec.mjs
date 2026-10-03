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
