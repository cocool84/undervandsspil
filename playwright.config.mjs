import { defineConfig } from '@playwright/test';

// iPad 10th gen: 820 × 1180 CSS px at 2×. Safari on iPadOS.
const IPAD_UA = 'Mozilla/5.0 (iPad; CPU OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1';
const ipad = { deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: IPAD_UA };
const landscape = { width: 1180, height: 820 };
const portrait = { width: 820, height: 1180 };
const chromiumGpu = { args: ['--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--use-angle=metal', '--autoplay-policy=no-user-gesture-required'] };

export default defineConfig({
  testDir: './tests',
  timeout: 120_000,
  workers: 1,
  fullyParallel: false,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:8765/',
    trace: 'off',
  },
  webServer: {
    command: 'python3 -m http.server 8765 --bind 127.0.0.1',
    url: 'http://127.0.0.1:8765/index.html',
    reuseExistingServer: true,
    stdout: 'ignore',
    stderr: 'ignore',
  },
  projects: [
    { name: 'webkit-landscape', use: { browserName: 'webkit', viewport: landscape, ...ipad } },
    { name: 'webkit-portrait', use: { browserName: 'webkit', viewport: portrait, ...ipad } },
    { name: 'chromium-landscape', use: { browserName: 'chromium', viewport: landscape, ...ipad, launchOptions: chromiumGpu } },
    { name: 'chromium-portrait', use: { browserName: 'chromium', viewport: portrait, ...ipad, launchOptions: chromiumGpu } },
  ],
});
