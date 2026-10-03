// Writes the precache list and a content hash into sw.js. Run before every commit:
//   npm run sw

import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const roots = ['index.html', 'manifest.webmanifest', 'icons', 'src', 'vendor'];
const skip = new Set(['icon.svg']);

async function walk(rel) {
  const abs = path.join(root, rel);
  let entries;
  try {
    entries = await readdir(abs, { withFileTypes: true });
  } catch {
    return [rel]; // a file
  }
  const out = [];
  for (const e of entries) {
    if (e.name.startsWith('.')) continue;
    const child = path.posix.join(rel, e.name);
    if (e.isDirectory()) out.push(...(await walk(child)));
    else if (!skip.has(e.name)) out.push(child);
  }
  return out;
}

const files = [];
for (const r of roots) files.push(...(await walk(r)));
files.sort();

const hash = createHash('sha256');
for (const f of files) {
  hash.update(f);
  hash.update(await readFile(path.join(root, f)));
}
const version = hash.digest('hex').slice(0, 12);
const assets = ['./', ...files.map((f) => `./${f}`)];

const swPath = path.join(root, 'sw.js');
const sw = await readFile(swPath, 'utf8');
const block = `// <generated>\nconst VERSION = '${version}';\nconst ASSETS = ${JSON.stringify(assets, null, 2)};\n// </generated>`;
const next = sw.replace(/\/\/ <generated>[\s\S]*?\/\/ <\/generated>/, block);
if (next === sw) {
  console.log(`sw.js already up to date (${version}, ${assets.length} files)`);
} else {
  await writeFile(swPath, next);
  console.log(`sw.js updated: version ${version}, ${assets.length} files`);
}
