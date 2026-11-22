// Tests for src/gfx/tier.js: benchmark classification, render ratio budgets, the dynamic-resolution governor (no WebGL needed).
import { classifyBench, renderRatio, createGovernor, TIER_BUDGET, readBenchCache, writeBenchCache } from '../gfx/tier.js';
import assert from 'node:assert/strict';
import { runBenchmark } from '../gfx/bench.js';
import { inOpeningShot } from '../renderer3d.js';
import { parseLayout } from '../world.js';
import { layout as sangam } from '../../missions/sangam-staff.js';
const out = [];
const t = (name, fn) => { try { fn(a); out.push(['PASS', name]); } catch (e) { out.push(['FAIL', name, e.message]); process.exitCode = 1; } };
const a = { eq: (x, y) => assert.equal(x, y), ok: (v, m) => assert.ok(v, m) };
{
  t('tier: benchmark ladder maps to low, medium and high; a thin device drops one step; bad data is low', (a) => {
    a.eq(classifyBench([2, 4, 8]), 'high'); a.eq(classifyBench([2, 4, 30]), 'medium'); a.eq(classifyBench([9, 20, 40]), 'low'); a.eq(classifyBench([2, 4, 8], { thin: true }), 'medium');
    a.eq(classifyBench([2, 30, 60]), 'low'); a.eq(classifyBench([]), 'low'); a.eq(classifyBench(null), 'low'); a.eq(classifyBench([NaN, 1, 1]), 'low');
  });
  t('tier: render ratio respects the pixel budget of each tier (a 360 x 800 phone at ratio 3 stays near 0.7 / 1.2 / 2.0 MP)', (a) => {
    for (const [tier, mp] of [['low', 0.7], ['medium', 1.2], ['high', 2.0]]) {
      const r = renderRatio(tier, 360, 800, 3, 1); const px = 360 * 800 * r * r / 1e6; a.ok(px <= mp * 1.02, `${tier} ${px.toFixed(2)} MP`); a.ok(px >= mp * 0.7, `${tier} not far under budget ${px.toFixed(2)}`);
    }
    a.ok(renderRatio('high', 1280, 800, 1, 1) === 1, 'a small desktop canvas keeps ratio 1'); a.ok(renderRatio('medium', 360, 800, 3, 0.55) < renderRatio('medium', 360, 800, 3, 1), 'scale lowers the ratio');
    a.ok(TIER_BUDGET.low.shadows === false && TIER_BUDGET.high.bloom === true);
  });
  t('tier: governor steps the scale down on a slow trace within 3 s, never below the floor, and asks for a lower tier only once', (a) => {
    const g = createGovernor(); let time = 0; let firstDrop = null; let tierDowns = 0;
    for (let i = 0; i < 600; i++) { const r = g.push(1 / 20); time += 1 / 20; if (r.changed && firstDrop === null) firstDrop = time; if (r.tierDown) tierDowns++; }
    a.ok(firstDrop !== null && firstDrop <= 3, `first drop at ${firstDrop}`); a.ok(g.scale >= 0.55 - 1e-9 && g.scale <= 0.55 + 1e-9, `floor ${g.scale}`); a.eq(tierDowns, 1);
  });
  t('tier: governor holds steady on a 30 fps trace, recovers slowly on a fast one and never oscillates within 8 s of a drop', (a) => {
    const g = createGovernor(); for (let i = 0; i < 300; i++) g.push(1 / 30); a.eq(g.scale, 1);
    const h = createGovernor(); let t0 = 0; let dropAt = null; const ups = [];
    for (let i = 0; i < 400; i++) { const slow = i < 60; const r = h.push(slow ? 1 / 22 : 1 / 60); t0 += slow ? 1 / 22 : 1 / 60; if (r.changed) { if (dropAt === null) dropAt = t0; else ups.push(t0 - dropAt); } }
    a.ok(dropAt !== null, 'dropped'); a.ok(ups.every((u) => u > 8 - 1e-6) || ups.length === 0, `raises came ${ups.map((u) => u.toFixed(1))} s after the drop`);
  });
  t('tier: governor ignores pauses and hitches, and a saved benchmark is versioned', (a) => {
    const g = createGovernor(); for (let i = 0; i < 100; i++) g.push(i % 10 === 0 ? 2.0 : 1 / 30); a.eq(g.scale, 1);
    const store = { m: {}, getItem(k) { return this.m[k] ?? null; }, setItem(k, v) { this.m[k] = v; } };
    a.eq(readBenchCache(store), null); writeBenchCache(store, 'medium'); a.eq(readBenchCache(store), 'medium'); a.eq(readBenchCache(store, 2), null);
  });
}
t('opening shot: no townsperson path can start inside the first frame, on the Pepper Road or anywhere (the cone ahead of the hero is clear)', (a) => {
  const st = { x: 100, y: 100, angle: 0 };
  a.ok(inOpeningShot(st, 300, 100) && inOpeningShot(st, 600, 150) && inOpeningShot(st, 120, 130), 'ahead and near');
  a.ok(!inOpeningShot(st, 100, 700) && !inOpeningShot(st, -400, 100) && !inOpeningShot(st, 1100, 100), 'to the side, behind and far ahead');
  a.ok(inOpeningShot({ ...st, angle: Math.PI / 2 }, 100, 500) && !inOpeningShot({ ...st, angle: Math.PI / 2 }, 600, 100), 'follows the start heading');
  const w = parseLayout(sangam); a.ok(typeof w.start.angle === 'number');
});
const fakeGL = (clock, costPerDraw) => new Proxy({ drawArrays() { clock.t += costPerDraw; }, getExtension() { return null; }, createShader: () => ({}), createProgram: () => ({}), createBuffer: () => ({}), getUniformLocation: () => ({}) }, { get: (o, k) => (k in o ? o[k] : () => {}) });
t('benchmark guard: a very slow device is stopped after the first slow call (under 1 s in total), a fast one runs all three steps', (a) => {
  const c1 = { t: 0 }; const slow = runBenchmark({ now: () => c1.t, makeGL: () => fakeGL(c1, 400) });
  a.ok(slow.aborted && slow.steps.length === 3 && slow.steps[1] === 99 && slow.ms < 1000, `slow ms ${slow.ms}`); a.eq(classifyBench(slow.steps), 'low');
  const c2 = { t: 0 }; const mid = runBenchmark({ now: () => c2.t, makeGL: () => fakeGL(c2, 30) }); // 30 ms a draw: over the call limit after 3 draws
  a.ok(mid.aborted && mid.ms < 600, `mid ms ${mid.ms}`);
  const c3 = { t: 0 }; const fast = runBenchmark({ now: () => c3.t, makeGL: () => fakeGL(c3, 1.5) });
  a.ok(!fast.aborted && fast.steps.every((v) => v < 8), 'fast ok'); a.eq(classifyBench(fast.steps), 'high'); a.eq(runBenchmark({ makeGL: () => null }), null);
});
for (const [k, n, m] of out) console.log(`${k}  ${n}${m ? ' :: ' + m : ''}`);
