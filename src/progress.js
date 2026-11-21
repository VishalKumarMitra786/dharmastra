// Saved progress: validated load, best-effort save. Never throws.
import { ABILITY_IDS, START_ABILITIES, WEAPONS, closeAbilities } from './abilities.js';

export const PROGRESS_KEY = 'dharmastra.progress.v1';
const MAX_MISSIONS = 64;
const MAX_BEST = 36000; // seconds
const BAD_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const ID_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;

export const defaultProgress = () => ({ v: 1, abilities: [...START_ABILITIES], weapon: 'none', completed: {} });

const store = () => { try { return globalThis.localStorage ?? null; } catch { return null; } };

export function validateProgress(raw) {
  const d = defaultProgress();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || raw.v !== 1) return d;
  const set = new Set(START_ABILITIES);
  if (Array.isArray(raw.abilities)) for (const a of raw.abilities.slice(0, 64)) if (typeof a === 'string' && ABILITY_IDS.includes(a)) set.add(a);
  d.abilities = closeAbilities([...set]); // a saved sword without the staff (or bow without the sword) is dropped: abilities are earned in order
  set.clear(); d.abilities.forEach((a) => set.add(a));
  d.weapon = WEAPONS.includes(raw.weapon) && (raw.weapon === 'none' || set.has(raw.weapon)) ? raw.weapon : 'none';
  if (raw.completed && typeof raw.completed === 'object' && !Array.isArray(raw.completed)) {
    for (const id of Object.keys(raw.completed).slice(0, MAX_MISSIONS)) {
      if (BAD_KEYS.has(id) || !ID_RE.test(id)) continue;
      const best = Number(raw.completed[id]?.best);
      d.completed[id] = { best: Number.isFinite(best) ? Math.min(MAX_BEST, Math.max(0, best)) : 0 };
    }
  }
  return d;
}

export function loadProgress(storage = store()) {
  try {
    const text = storage?.getItem(PROGRESS_KEY);
    return text ? validateProgress(JSON.parse(text)) : defaultProgress();
  } catch { return defaultProgress(); }
}

export function saveProgress(progress, storage = store()) {
  try { storage?.setItem(PROGRESS_KEY, JSON.stringify(validateProgress(progress))); return true; } catch { return false; }
}

// Returns a new progress with the finished mission recorded (lower best time wins) and the abilities kept.
export function recordCompletion(progress, missionId, seconds, abilities = [], weapon = 'none') {
  const next = validateProgress({ ...progress, abilities: [...progress.abilities, ...abilities], weapon: weapon !== 'none' ? weapon : progress.weapon, completed: { ...progress.completed } });
  if (typeof missionId === 'string' && ID_RE.test(missionId) && !BAD_KEYS.has(missionId)) {
    const prev = next.completed[missionId]?.best;
    const s = Number.isFinite(seconds) ? Math.min(MAX_BEST, Math.max(0, seconds)) : 0;
    next.completed[missionId] = { best: prev ? Math.min(prev, s || prev) : s };
  }
  return next;
}
