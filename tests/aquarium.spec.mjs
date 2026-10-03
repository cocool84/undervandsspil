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
