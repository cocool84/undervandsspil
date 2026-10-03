// Renders icons/icon.svg into the PNG icons the PWA needs:
//   npm run icons

import { chromium } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const svg = await readFile(path.join(root, 'icons/icon.svg'));
const src = `data:image/svg+xml;base64,${svg.toString('base64')}`;

const outputs = [
  ['apple-touch-icon.png', 180],
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['icon-maskable-512.png', 512],
];

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
for (const [name, size] of outputs) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:#0b3f7e"><img id="i" src="${src}" style="display:block;width:${size}px;height:${size}px"></body></html>`);
  await page.waitForFunction(() => document.getElementById('i').complete);
  await page.screenshot({ path: path.join(root, 'icons', name), clip: { x: 0, y: 0, width: size, height: size } });
  console.log(`icons/${name}`);
}
await browser.close();
