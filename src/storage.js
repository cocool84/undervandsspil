// localStorage persistence. One key, versioned; every access guarded (private mode, quota).
// Stage 3 stores the settings; stage 4 adds the children's own fish.

const KEY = 'undervandsspil.v1';

const DEFAULTS = { v: 1, settings: { night: false, muted: false, volume: 0.7 }, fish: [] };

export function loadState() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(DEFAULTS);
    const data = JSON.parse(raw);
    return {
      v: 1,
      settings: { ...DEFAULTS.settings, ...(data.settings || {}) },
      fish: Array.isArray(data.fish) ? data.fish : [],
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
