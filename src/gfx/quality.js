// Quality levels for the 3D renderer. Pure functions (no WebGL), so they can be tested in Node.
// low is close to the cost of the original renderer; medium adds shadows and richer geometry; high adds bloom, grading and 2k shadows.
export const LEVELS = ['low', 'medium', 'high'];

export const PROFILES = {
  low: { shadows: false, shadowMap: 1024, post: false, texSize: 128, dprMax: 1.5, rad: 7, cap: 2, headW: 10, headH: 8, lathe: 10, ico: 0, density: 0.45, crowd: 10, trees: 8 },
  medium: { shadows: true, shadowMap: 1024, post: false, texSize: 256, dprMax: 2, rad: 10, cap: 3, headW: 14, headH: 10, lathe: 14, ico: 1, density: 0.8, crowd: 16, trees: 14 },
  high: { shadows: true, shadowMap: 2048, post: true, texSize: 512, dprMax: 2, rad: 14, cap: 4, headW: 20, headH: 14, lathe: 20, ico: 1, density: 1, crowd: 20, trees: 22 },
};

const clamp = (n) => Math.max(0, Math.min(2, n));

// Choose a level from device hints. ?q=low|medium|high (or a saved choice) wins and is "locked" (the frame-time probe will not change it).
// fx=1 asks for the top level, fx=0 forbids post-processing (caps at medium), which keeps the older switches working.
export function pickQuality({ dpr = 1, cores = 4, fine = false, memory = 4, search = '', saved = null } = {}) {
  const m = /[?&]q(?:uality)?=(low|medium|high)\b/.exec(search || '');
  if (m) return { level: m[1], locked: true };
  if (LEVELS.includes(saved)) return { level: saved, locked: true };
  let s = cores <= 4 ? 0 : cores < 8 ? 1 : 2;
  if (fine) s += 1; else s = Math.min(s, 1); // phones and tablets stop at medium unless asked
  if (dpr >= 3) s -= 1;
  if (memory <= 2) s -= 1;
  if (/[?&]fx=1/.test(search || '')) s = 2;
  if (/[?&]fx=0/.test(search || '')) s = Math.min(s, 1);
  return { level: LEVELS[clamp(s)], locked: false };
}

export function stepDown(level) { return LEVELS[Math.max(0, LEVELS.indexOf(level) - 1)]; }

// Short frame-time probe: ignores the first `warm` frames and any frame that was clearly a pause, averages `window` frames,
// and says "down" once if the average is slower than `limit` seconds (default about 26 fps).
export function createProbe({ warm = 20, window = 80, limit = 1 / 26 } = {}) {
  let n = 0; let sum = 0; let used = 0; let done = false;
  return {
    reset() { n = 0; sum = 0; used = 0; done = false; },
    push(dt) {
      if (done || !(dt > 0)) return false;
      n++;
      if (n <= warm || dt >= 0.1) return false; // warm-up and tab-switch pauses do not count
      sum += dt; used++;
      if (used < window) return false;
      done = true;
      return sum / used > limit;
    },
  };
}
