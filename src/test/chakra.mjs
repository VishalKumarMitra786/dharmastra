// Tests for the chakra home screen: data validation, lock logic, reach provider fallbacks, search, and 2,000-event scale budgets.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { validateEvents, statusOf, effectivePrereq, currentYuga, spineMap, yearValue, filterEvents, windowRange, accessibleName, YUGA_IDS } from '../chakra/model.js';
import { validateCounts, createStaticReachProvider, reachText } from '../chakra/reach.js';
import { buildPositions, viewOf, cameraWhole, cameraYuga, clusterVisible, drawScene, maxZoom, levelOf, CELL } from '../chakra/scene.js';
import { makeSynthetic } from '../chakra/synth.js';
import { createEventStore } from '../chakra/data.js';
import { MISSIONS } from '../missions.js';

const ROOT = new URL('../../', import.meta.url).pathname;
const readJson = async (p) => JSON.parse(await readFile(ROOT + p, 'utf8'));
const loadAll = async () => { const index = await readJson('data/events/index.json'); const shards = {}; for (const y of YUGA_IDS) shards[y] = (await readJson(`data/events/${y}.json`)).events; return { index, shards, all: YUGA_IDS.flatMap((y) => shards[y]) }; };
const ctxFor = (index, completed = {}) => ({ spineById: spineMap(index.spine), completed });
const good = () => ({ id: 'x-1', yuga: 'kali', year: 'c. 300 BCE', label: 'A test event', kind: 'History', level: null, order: 1, requires: null, source: 'test note', intro: 'This is a long enough introduction for the check.' });
const fakeCtx = () => { // counts every canvas call so tests can bound the work done per frame
  const log = { calls: 0 };
  const fn = () => { log.calls++; return grad; }; const grad = { addColorStop() { log.calls++; } };
  const ctx = new Proxy({}, { get: (t, k) => (k in t ? t[k] : fn), set: (t, k, v) => { t[k] = v; return true; } });
  return { ctx, log };
};

export function registerChakra(test) {
  test('chakra data: shards and index load, 58 events, 22 levels, and tools/check-events.mjs passes', async () => {
    const { index, all } = await loadAll();
    assert.equal(all.length, 58); assert.equal(all.filter((e) => e.level != null).length, 22); assert.equal(index.spine.length, 22);
    assert.deepEqual(validateEvents(all, { missionIds: MISSIONS.map((m) => m.id) }), []);
    assert.match(execFileSync('node', [ROOT + 'tools/check-events.mjs'], { encoding: 'utf8' }), /events check passed/);
  });
  test('chakra data: validator rejects duplicate ids, bad kind, missing year, missing source, missing intro, broken and looping requires', () => {
    const has = (list, re) => assert.ok(list.some((m) => re.test(m)), `expected ${re} in ${JSON.stringify(list)}`);
    assert.deepEqual(validateEvents([good()]), []);
    assert.deepEqual(validateEvents([{ ...good(), year: 'Legend' }]), []);
    has(validateEvents([good(), { ...good(), order: 2 }]), /duplicate id/);
    has(validateEvents([{ ...good(), kind: 'Fact' }]), /History, Tradition or Invented/);
    has(validateEvents([{ ...good(), kind: undefined }]), /History, Tradition or Invented/);
    has(validateEvents([{ ...good(), year: '' }]), /year/);
    has(validateEvents([{ ...good(), year: 'sometime' }]), /year/);
    has(validateEvents([{ ...good(), source: '' }]), /source note/);
    has(validateEvents([{ ...good(), intro: '' }]), /introduction/);
    has(validateEvents([{ ...good(), label: 'x'.repeat(41) }]), /label/);
    const L = (id, requires, order) => ({ ...good(), id, level: order, order, requires });
    has(validateEvents([L('a-1', 'nope', 1)]), /does not exist/);
    has(validateEvents([L('a-1', 'a-2', 1), L('a-2', 'a-1', 2)]), /loops/);
    has(validateEvents([L('a-1', 'a-1', 1)]), /loops/);
    has(validateEvents([L('a-1', 'i-1', 1), { ...good(), id: 'i-1', order: 2 }]), /not a level/);
    has(validateEvents([{ ...L('a-1', null, 1), mission: 'ghost' }], { missionIds: ['real'] }), /does not exist in missions/);
  });
  test('chakra data: every built mission has an event and every event mission is a real mission', async () => {
    const { all } = await loadAll(); const ids = new Set(MISSIONS.map((m) => m.id));
    for (const e of all) if (e.mission) assert.ok(ids.has(e.mission), e.mission);
    for (const m of MISSIONS) assert.ok(all.some((e) => e.mission === m.id), `no event for ${m.id}`);
  });

  test('chakra locks: first built level is open, later ones locked until the prior built level is done, with the status words', async () => {
    const { index, all } = await loadAll(); const by = Object.fromEntries(all.map((e) => [e.id, e]));
    let c = ctxFor(index);
    assert.equal(statusOf(by['dva-l10'], c).code, 'open'); // unbuilt levels before it cannot gate it
    assert.equal(statusOf(by['kal-l14'], c).text, 'Locked: finish Escape from Hastinapur first');
    assert.equal(statusOf(by['kal-l14'], c).playable, false);
    assert.equal(statusOf(by['kal-l15'], c).text, 'Locked: finish The Night Report of Pataliputra first');
    assert.equal(statusOf(by['sat-l1'], c).code, 'planned'); assert.equal(statusOf(by['sat-age'], c).code, 'info');
    assert.equal(statusOf(by['sat-age'], c).playable, false);
    c = ctxFor(index, { 'dvapara-escape': { best: 90 } });
    assert.equal(statusOf(by['dva-l10'], c).code, 'done'); assert.equal(statusOf(by['kal-l14'], c).code, 'open'); assert.equal(statusOf(by['kal-l15'], c).code, 'locked');
    c = ctxFor(index, { 'dvapara-escape': { best: 90 }, 'mauryan-spy': { best: 70 } });
    assert.equal(statusOf(by['kal-l15'], c).code, 'open');
    assert.equal(accessibleName(by['kal-l14'], statusOf(by['kal-l14'], c)), 'Level 14, The Night Report of Pataliputra, Kali Yuga, Invented, Legend. Done.');
  });
  test('chakra locks: a keystone with an objective is named in the locked text, and a damaged save falls back to the first level', async () => {
    const spine = [{ id: 'k-1', level: 1, label: 'Keystone', mission: 'm1', requires: null, needsObjective: true, yuga: 'satya' }, { id: 'k-2', level: 2, label: 'Next', mission: 'm2', requires: 'k-1', needsObjective: false, yuga: 'satya' }];
    const ev = { id: 'k-2', mission: 'm2', requires: 'k-1', level: 2 };
    assert.equal(statusOf(ev, { spineById: spineMap(spine), completed: {} }).text, 'Locked: finish Keystone, including its objective, first');
    assert.equal(effectivePrereq({ requires: 'gone' }, spineMap(spine)), null);
    const { validateProgress } = await import('../progress.js');
    assert.equal(statusOf(ev, { spineById: spineMap(spine), completed: validateProgress({ v: 9, completed: { m1: {} } }).completed }).code, 'locked');
  });
  test('chakra locks: current yuga follows progress', async () => {
    const { index } = await loadAll();
    assert.equal(currentYuga(index.spine, ctxFor(index)), 'dvapara');
    assert.equal(currentYuga(index.spine, ctxFor(index, { 'dvapara-escape': { best: 1 } })), 'kali');
    assert.equal(currentYuga(index.spine, ctxFor(index, { 'dvapara-escape': { best: 1 }, 'mauryan-spy': { best: 1 }, 'sangam-staff': { best: 1 } })), 'kali');
  });

  test('reach: validateCounts keeps only whole positive counts for event-like ids', () => {
    assert.equal(validateCounts(null), null); assert.equal(validateCounts([1]), null); assert.equal(validateCounts('x'), null); assert.equal(validateCounts({}), null);
    assert.deepEqual({ ...validateCounts({ counts: { 'kal-l14': 12, bad: -1, 'Bad Id': 3, 'x-1': 1.5, 'x-2': '7', 'x-3': NaN, 'x-4': 1e300, __proto__: 5 } }) }, { 'kal-l14': 12 });
    assert.deepEqual({ ...validateCounts({ 'dva-l10': 3 }) }, { 'dva-l10': 3 }); // a flat map works too
  });
  test('reach provider: missing file, HTTP error, bad JSON and network failure all give null and never throw', async () => {
    const cases = [async () => ({ ok: false, status: 404 }), async () => ({ ok: true, json: async () => { throw new Error('bad json'); } }), async () => { throw new Error('offline'); }, async () => ({ ok: true, json: async () => ({ counts: {} }) })];
    for (const f of cases) assert.equal(await createStaticReachProvider({ fetchFn: f }).getReachCounts(), null);
    assert.equal(await createStaticReachProvider({ fetchFn: undefined }).getReachCounts(), null);
    let calls = 0; const p = createStaticReachProvider({ fetchFn: async (url) => { calls++; assert.equal(url, 'data/reach.json'); return { ok: true, json: async () => ({ counts: { 'dva-l10': 4 } }) }; } });
    assert.deepEqual({ ...(await p.getReachCounts()) }, { 'dva-l10': 4 }); await p.getReachCounts(); assert.equal(calls, 1);
  });
  test('reach text: never invents a number, says "Be among the first" when there is none', () => {
    for (const c of [null, undefined, {}, { a: 0 }, { a: -3 }, { a: NaN }, { a: '5' }, { b: 5 }]) assert.equal(reachText(c, 'a'), 'Be among the first');
    assert.equal(reachText({ a: 1 }, 'a'), '1 player has reached this'); assert.equal(reachText({ a: 2 }, 'a'), '2 players have reached this'); assert.equal(reachText({ a: 12345 }, 'a'), '12,345 players have reached this');
  });
  test('reach: no data/reach.json is shipped, so no count can be shown yet', async () => {
    await assert.rejects(readFile(ROOT + 'data/reach.json'), /ENOENT/);
  });

  test('years: BCE, CE, ranges, centuries and Legend are read as signed years', () => {
    assert.equal(yearValue('Legend'), null); assert.equal(yearValue('3102 BCE'), -3102); assert.equal(yearValue('c. 2600-1900 BCE'), -2250); assert.equal(yearValue('628 CE'), 628);
    assert.equal(yearValue('c. 5th century BCE (dates debated)'), -450); assert.equal(yearValue('15 August 1947'), 1947); assert.equal(yearValue('c. 300 BCE-300 CE (dates debated)'), 0);
    assert.equal(yearValue('born 476 CE (as reported)'), 476); assert.equal(yearValue('c. 4th-5th century CE (debated)'), 400);
  });
  test('search and filter: by kind, region, year range and text, and Legend entries drop out of a year range', async () => {
    const { shards } = await loadAll(); const kali = shards.kali; const names = (f) => filterEvents(kali, f).map((i) => kali[i].id);
    assert.equal(filterEvents(kali, {}).length, kali.length);
    assert.ok(names({ kind: 'History' }).every((id) => kali.find((e) => e.id === id).kind === 'History'));
    assert.ok(names({ region: 'Tamil country' }).includes('kal-l15'));
    assert.ok(names({ text: 'zero' }).includes('kal-brahmagupta'));
    assert.ok(names({ text: 'PATALIPUTRA wall' }).includes('kal-wall'));
    const r = names({ from: -400, to: -200 }); assert.ok(r.includes('kal-alex') && r.includes('kal-ashoka')); assert.ok(!r.some((id) => kali.find((e) => e.id === id).year === 'Legend'));
    assert.deepEqual(names({ text: 'no such words anywhere' }), []);
    assert.deepEqual(names({ kind: 'Invented', text: 'pepper' }), ['kal-l15']);
  });

  test('scale: a synthetic 2,000-event yuga validates, filters, clusters and draws inside the budget, with bounded work per frame', () => {
    const t0 = performance.now(); const before = process.memoryUsage().heapUsed;
    const events = makeSynthetic(2000, 'kali', 1);
    assert.deepEqual(validateEvents(events), []); const tValidate = performance.now() - t0;
    assert.ok(tValidate < 800, `validate 2,000 took ${tValidate.toFixed(0)} ms`);
    const pos = buildPositions(events.length, 3); const W = 360, H = 560;
    const f0 = performance.now(); const n1 = filterEvents(events, { text: 'event 4', kind: 'History', from: -100, to: 1500 }); const tFilter = performance.now() - f0;
    assert.ok(tFilter < 100, `filter took ${tFilter.toFixed(0)} ms`); assert.ok(n1.length > 0 && n1.length < events.length);
    const k1 = cameraYuga(3, W, H).k; const cap = Math.ceil(W / CELL + 2) * Math.ceil(H / CELL + 2) * 1; // most items one screen can hold
    let worstFrame = 0, worstCalls = 0, worstItems = 0;
    for (const cam of [cameraWhole(W, H), cameraYuga(3, W, H), { ...cameraYuga(3, W, H), k: k1 * 4 }, { ...cameraYuga(3, W, H), k: maxZoom(k1, 2000) }]) {
      const items = clusterVisible(pos, viewOf(cam, W, H), null, 17); worstItems = Math.max(worstItems, items.length);
      const { ctx, log } = fakeCtx(); const hits = []; const t1 = performance.now();
      const s = { W, H, dpr: 1, cam, rot: 0, alpha: 1, t: 1, motion: true, yugas: Array(5).fill({ count: 1, levels: 0, done: 0 }), sel: 3, cur: 3, pos, events, mask: null, selIdx: 17, status: () => ({ code: 'info' }), level: levelOf(cam.k, k1), hits };
      drawScene(ctx, s); worstFrame = Math.max(worstFrame, performance.now() - t1); worstCalls = Math.max(worstCalls, log.calls);
      assert.ok(hits.length <= cap, `${hits.length} hit targets, cap ${cap}`);
    }
    assert.ok(worstItems <= cap, `${worstItems} items on screen`);
    assert.ok(worstCalls < 4000, `${worstCalls} canvas calls in one frame`); // independent of the 2,000 events
    assert.ok(worstFrame < 60, `slowest frame ${worstFrame.toFixed(1)} ms`);
    for (const top of [0, 1234, 2000 * 68 - 400]) { const [a, b] = windowRange(top, 400, 68, 2000, 3); assert.ok(b - a <= 16, `${b - a} rows`); } // list rows in the DOM stay a screenful
    const heap = (process.memoryUsage().heapUsed - before) / 1048576; assert.ok(heap < 40, `heap grew ${heap.toFixed(1)} MB`);
  });
  test('scale: clusters expand as the camera zooms in, and a filter mask hides non-matches from clusters', () => {
    const events = makeSynthetic(500, 'kali', 1); const pos = buildPositions(500, 3); const W = 360, H = 560; const k1 = cameraYuga(3, W, H).k;
    const far = clusterVisible(pos, viewOf(cameraYuga(3, W, H), W, H)); const near = clusterVisible(pos, viewOf({ ...cameraYuga(3, W, H), k: maxZoom(k1, 500), cx: pos.xs[250], cy: pos.ys[250] }, W, H));
    assert.ok(far.every((c) => c.n >= 1) && far.some((c) => c.n > 1)); assert.ok(near.filter((c) => c.n === 1).length > 3);
    const mask = new Uint8Array(500); mask[10] = 1; const only = clusterVisible(pos, viewOf(cameraYuga(3, W, H), W, H), mask);
    assert.equal(only.length, 1); assert.equal(only[0].n, 1);
  });
  test('data store: a shard loads once, sorted, a failed load is not cached, and ?synth adds in-memory events only to Kali', async () => {
    const files = { 'events/index.json': await readJson('data/events/index.json') }; for (const y of YUGA_IDS) files[`events/${y}.json`] = await readJson(`data/events/${y}.json`);
    let calls = 0, fail = true;
    const fetchFn = async (url) => { calls++; const k = url.replace('data/', ''); if (fail && k === 'events/treta.json') return { ok: false, status: 500 }; return { ok: Boolean(files[k]), status: 200, json: async () => structuredClone(files[k]) }; };
    const s = createEventStore({ fetchFn });
    const a = await s.loadShard('satya'); await s.loadShard('satya'); assert.equal(calls, 2); // index + shard, once
    assert.deepEqual(a.map((e) => e.order), [...a.map((e) => e.order)].sort((x, y) => x - y));
    await assert.rejects(s.loadShard('treta'), /500/); fail = false; assert.equal((await s.loadShard('treta')).length, 9);
    await assert.rejects(s.loadShard('nowhere'), /unknown yuga/);
    const syn = createEventStore({ fetchFn, synth: 300 }); assert.equal((await syn.loadShard('kali')).length, 325); assert.equal((await syn.loadShard('satya')).length, 8);
  });
}
