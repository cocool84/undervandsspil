// "Save a copy" / "load a copy" of the children's own fish (parents' corner): one small JSON
// file the iPad can keep in Files, with the reef's fish (`fish`) and the open sea's big
// animals (`sea`). Loading checks every field, so any file is safe to try — a file that is
// not ours, or a broken fish in it, is simply left out.

const APP = 'undervandsspil';
const MAX_PAINT = 400_000; // characters of one painting's data URL
const HEX = /^#[0-9a-f]{6}$/i;
const ID = /^[A-Za-z0-9_-]{1,40}$/;
const PAINT = /^data:image\/(jpeg|png);base64,[A-Za-z0-9+/]+={0,2}$/;
const int = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;

export function backupFile(fish, sea = []) {
  const now = new Date();
  const data = { app: APP, v: 1, saved: now.toISOString(), fish, sea };
  return new File([JSON.stringify(data)], `akvariet-${now.toISOString().slice(0, 10)}.json`, { type: 'application/json' });
}

// Hand the file to the iPad: the share sheet ("Save to Files") where there is one, else a
// download. Must be called straight from the tap (the share sheet needs the user's gesture).
export async function offerFile(file) {
  try {
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file] });
      return 'shared';
    }
  } catch (e) {
    if (e?.name === 'AbortError') return 'cancelled';
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return 'downloaded';
}

// The fish in a saved copy, checked field by field — { fish, sea } — or null if it is not
// one of ours.
export function readBackup(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (!data || data.app !== APP || !Array.isArray(data.fish)) return null;
  return { fish: checked(data.fish, 0, 3), sea: Array.isArray(data.sea) ? checked(data.sea, 4, 7) : [] };
}

// Only fish whose shape is one of [lo, hi] (reef fish 0–3, big animals 4–7).
function checked(list, lo, hi) {
  const fish = [];
  for (const f of list.slice(0, 100)) {
    if (!f || typeof f !== 'object' || !ID.test(f.id) || !['design', 'wand'].includes(f.kind)) continue;
    if (!int(f.shape, lo, hi) || !int(f.pattern, 0, 3) || !int(f.eyes, 0, 3) || !HEX.test(f.color)) continue;
    if (!Number.isFinite(f.born) || !Number.isFinite(f.seed)) continue;
    const paint = typeof f.paint === 'string' && f.paint.length <= MAX_PAINT && PAINT.test(f.paint) ? f.paint : null;
    fish.push({
      id: f.id,
      born: f.born,
      kind: f.kind,
      shape: f.shape,
      color: f.color,
      pattern: f.pattern,
      eyes: f.eyes,
      glow: !!f.glow,
      seed: Math.floor(Math.abs(f.seed)) % 1e9,
      paint,
      color2: typeof f.color2 === 'string' && HEX.test(f.color2) ? f.color2 : null,
    });
  }
  return fish;
}
