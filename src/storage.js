// localStorage persistence. One key, versioned; every access guarded (private mode, quota).
// Holds the settings (and which aquarium was open), the children's own fish for the reef
// (`fish`) and the open sea (`sea`) — DNA, paintings as JPEG data URLs — and the fish
// factory's unfinished draft.

const KEY = 'undervandsspil.v1';

const DEFAULTS = { v: 1, settings: { night: false, muted: false, volume: 0.7, ambience: 0.5, world: 'reef' }, fish: [], sea: [], draft: null };
const fishList = (list) => (Array.isArray(list) ? list.filter((f) => f && typeof f.id === 'string') : []);

export function loadState() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(DEFAULTS);
    const data = JSON.parse(raw);
    return {
      v: 1,
      settings: { ...DEFAULTS.settings, ...(data.settings || {}) },
      fish: fishList(data.fish),
      sea: fishList(data.sea),
      draft: data.draft && typeof data.draft === 'object' ? data.draft : null,
    };
  } catch {
    return structuredClone(DEFAULTS);
  }
}

export function saveState(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function saveSettings(patch) {
  const state = loadState();
  Object.assign(state.settings, patch);
  return saveState(state);
}

export function saveDraft(draft) {
  const state = loadState();
  state.draft = draft;
  if (saveState(state)) return true;
  // no room for the draft's painting: keep the rest of it
  if (draft?.strokes) {
    state.draft = { ...draft, strokes: null };
    return saveState(state);
  }
  return false;
}

// Save the own fish of one aquarium (`field`: 'fish' or 'sea'). If storage is full, paintings
// are made smaller, and as a last resort the oldest fish lose their paintings (they keep
// their colour) — a fish is never lost.
export async function saveFish(list, field = 'fish') {
  const state = loadState();
  state[field] = list;
  if (saveState(state)) return true;
  for (const f of list) if (f.paint) f.paint = await shrink(f.paint);
  if (saveState(state)) return true;
  for (const f of list) {
    if (!f.paint) continue;
    f.paint = null;
    if (saveState(state)) return true;
  }
  state.draft = null;
  return saveState(state);
}

function shrink(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = 256;
      c.height = 128;
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL('image/jpeg', 0.7));
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

// Ask the browser not to clear our storage on its own (Safari evicts after 7 days unused).
export function requestPersistence() {
  try {
    navigator.storage?.persist?.().catch(() => {});
  } catch {
    /* not supported */
  }
}
