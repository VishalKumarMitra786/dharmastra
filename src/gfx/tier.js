// Quality tiers, the automatic benchmark's decision rule and the dynamic-resolution governor. Pure functions (no WebGL, no DOM), so Node tests cover them.
// Numbers follow docs/review/modern-look.md section 3 (pixel budgets in render pixels, 30 fps floor). Every threshold is a starting value to tune on real phones.
export const TIER_BUDGET = {
  low: { maxMP: 0.7, minMP: 0.35, dprMax: 1.5, msaa: false, shadows: false, particles: 40, bloom: false },
  medium: { maxMP: 1.2, minMP: 0.6, dprMax: 2, msaa: true, shadows: true, particles: 120, bloom: false },
  high: { maxMP: 2.0, minMP: 1.0, dprMax: 3, msaa: true, shadows: true, particles: 240, bloom: true },
};
export const BENCH_VERSION = 1;

// Render pixel ratio for a CSS size: the device ratio, capped by the tier, capped by its pixel budget, times the governor's scale (0.5..1).
export function renderRatio(tier, cssW, cssH, dpr, scale = 1) {
  const b = TIER_BUDGET[tier] || TIER_BUDGET.medium; const area = Math.max(1, cssW * cssH);
  const byBudget = Math.sqrt((b.maxMP * 1e6) / area);
  const d = dpr || 1; const r = Math.min(d, b.dprMax, byBudget) * scale; const floor = Math.min(d, Math.sqrt((b.minMP * 1e6) / area)); // never below the tier's minimum pixel count
  return Math.min(d, Math.max(r, floor));
}

// The benchmark ladder: ms per step (median of repeats, synchronous read-back), workloads 1x, 2x, 4x. Returns the tier.
// low if even the 1x step is over 8 ms; medium if 2x is under 14 ms; high if 4x is under 12 ms. `thin` (3 GB or less, saver mode) lowers the result one step.
export function classifyBench(stepsMs, { thin = false } = {}) {
  if (!Array.isArray(stepsMs) || !stepsMs.length || stepsMs.some((v) => !(v >= 0))) return 'low';
  let tier = 'low';
  if (stepsMs[0] < 8 && (stepsMs[1] ?? 99) < 14) tier = 'medium';
  if (tier === 'medium' && (stepsMs[2] ?? 99) < 12) tier = 'high';
  if (thin && tier !== 'low') tier = tier === 'high' ? 'medium' : 'low';
  return tier;
}

export function readBenchCache(storage, version = BENCH_VERSION) {
  try { const o = JSON.parse(storage?.getItem('dharmastra.bench') || 'null'); if (o && o.v === version && ['low', 'medium', 'high'].includes(o.tier)) return o.tier; } catch { /* no cache */ }
  return null;
}
export function writeBenchCache(storage, tier, version = BENCH_VERSION) { try { storage?.setItem('dharmastra.bench', JSON.stringify({ v: version, tier })); } catch { /* blocked */ } }

// Dynamic resolution. Feed it every frame interval in seconds. Keeps the 60-frame median under about 34.5 ms (30 fps with a little tolerance for the 33.3 ms vsync step) by lowering the render scale in 8% steps
// (at most one step per second), raises it again 4% at a time only after 6 s of comfortable frames and never within 8 s of a drop (no oscillation),
// and reports `tierDown` once when the scale is at its floor and frames are still slow for 4 s. Pauses (tab hidden) are ignored.
export function createGovernor({ min = 0.55, max = 1, slow = 0.0345, fast = 1 / 42, window = 45 } = {}) {
  let scale = max; const buf = []; let sinceDrop = 99; let sinceStep = 99; let fastFor = 0; let floorSlow = 0; let told = false;
  const median = () => { const a = buf.slice().sort((x, y) => x - y); return a[a.length >> 1]; };
  return {
    get scale() { return scale; },
    reset() { buf.length = 0; sinceDrop = sinceStep = 99; fastFor = floorSlow = 0; told = false; },
    push(dt) {
      if (!(dt > 0) || dt > 0.5) return { scale, changed: false, tierDown: false }; // a pause or a hitch is not a trend
      buf.push(dt); if (buf.length > window) buf.shift(); sinceDrop += dt; sinceStep += dt;
      if (buf.length < window) return { scale, changed: false, tierDown: false };
      const m = median(); let changed = false; let tierDown = false;
      if (m > slow) {
        fastFor = 0;
        if (scale > min + 1e-6 && sinceStep >= 1) { scale = Math.max(min, +(scale - 0.08).toFixed(3)); sinceDrop = 0; sinceStep = 0; changed = true; buf.length = 0; }
        else if (scale <= min + 1e-6) { floorSlow += dt; if (floorSlow > 4 && !told) { told = true; tierDown = true; } }
      } else {
        floorSlow = 0;
        if (m < fast && scale < max - 1e-6) { fastFor += dt; if (fastFor > 6 && sinceDrop > 8 && sinceStep >= 1) { scale = Math.min(max, +(scale + 0.04).toFixed(3)); sinceStep = 0; fastFor = 0; changed = true; buf.length = 0; } } else fastFor = 0;
      }
      return { scale, changed, tierDown };
    },
  };
}
