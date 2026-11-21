// Reach provider: "N players have reached this". The interface is one function, getReachCounts() -> {eventId: count} or null.
// The only provider shipped reads an optional static file, data/reach.json. No network call to any third party, no invented numbers.
// Intended later design (needs CEO decision on hosting): docs/decisions.md item 16.
const ID_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;
const BAD = new Set(['__proto__', 'constructor', 'prototype']);

// Keeps only ids that look like event ids with a whole, non-negative, safe count. Returns null when nothing usable is left.
export function validateCounts(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const src = raw.counts && typeof raw.counts === 'object' && !Array.isArray(raw.counts) ? raw.counts : raw;
  const out = Object.create(null); let n = 0;
  for (const id of Object.keys(src)) {
    if (BAD.has(id) || !ID_RE.test(id)) continue;
    const c = src[id];
    if (typeof c === 'number' && Number.isSafeInteger(c) && c > 0) { out[id] = c; n++; }
  }
  return n ? out : null;
}

export function createStaticReachProvider({ url = 'data/reach.json', fetchFn = globalThis.fetch?.bind(globalThis) } = {}) {
  let cached; // undefined = not asked yet
  return {
    async getReachCounts() {
      if (cached !== undefined) return cached;
      try {
        const res = await fetchFn(url, { cache: 'no-cache' });
        cached = res && res.ok ? validateCounts(await res.json()) : null;
      } catch { cached = null; }
      return cached;
    },
  };
}

// The words on an event card. Never says 0 and never guesses: no count means "Be among the first".
export function reachText(counts, id) {
  const c = counts && counts[id];
  if (!Number.isSafeInteger(c) || c < 1) return 'Be among the first';
  return c === 1 ? '1 player has reached this' : `${c.toLocaleString('en')} players have reached this`;
}
