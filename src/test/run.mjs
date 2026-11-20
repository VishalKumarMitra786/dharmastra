// Node tests for the game logic. Run: node src/test/run.mjs   (no dependencies)
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseLayout, resolveWalls, reachable } from '../world.js';
import { createSim, step, setTimerMode } from '../sim.js';
import { validateMission, loadMission, createRunner } from '../mission.js';
import { createLoop } from '../loop.js';
import { assertRenderer, makeFrame } from '../renderer.js';
import { layout } from '../../missions/dvapara-escape.js';

const results = [];
const test = (name, fn) => { try { fn(); results.push(['ok', name]); } catch (e) { results.push(['FAIL', name, e.message]); } };
const none = { steer: 0, throttle: 0 };
const missionPath = new URL('../../missions/dvapara-escape.json', import.meta.url);
const mission = JSON.parse(await readFile(missionPath, 'utf8'));
const fresh = (o) => createSim(parseLayout(layout), o);
const warp = (sim, p) => { sim.chariot.x = p.x; sim.chariot.y = p.y; };

test('mission JSON passes validation and has the exact schema keys', () => {
  assert.deepEqual(validateMission(mission), []);
  assert.deepEqual(Object.keys(mission), ['id', 'era', 'title', 'logline', 'objectives', 'dialogue', 'events']);
  assert.deepEqual(Object.keys(mission.dialogue[0]), ['id', 'speaker', 'text', 'trigger']);
  assert.deepEqual(Object.keys(mission.events[0]), ['name', 'year', 'label']);
});
test('validation rejects bad triggers, labels and missing fields', () => {
  const bad = structuredClone(mission);
  bad.dialogue[0].trigger = 'nope'; bad.events[0].label = 'Fact'; delete bad.title;
  assert.equal(validateMission(bad).length, 3);
});
test('loadMission works with a fetch stub and throws on HTTP errors', async () => {
  const ok = async () => ({ ok: true, json: async () => mission });
  assert.equal((await loadMission('x', ok)).id, 'dvapara-escape');
  await assert.rejects(loadMission('x', async () => ({ ok: false, status: 404 })), /404/);
});
test('layout parses: start, 3 ordered checkpoints, merged walls', () => {
  const w = parseLayout(layout);
  assert.equal(w.checkpoints.length, 3);
  assert.equal(mission.objectives.length, w.checkpoints.length);
  assert.ok(w.walls.length < 40, `walls merged (${w.walls.length})`);
  const solidTiles = w.solid.flat().filter(Boolean).length;
  const area = w.walls.reduce((a, r) => a + (r.w / w.tileSize) * (r.h / w.tileSize), 0);
  assert.equal(area, solidTiles, 'merged walls cover exactly the solid tiles');
});
test('S -> 1 -> 2 -> 3 are connected by road', () => {
  const w = parseLayout(layout);
  const pts = [w.start, ...w.checkpoints];
  for (let i = 0; i < 3; i++) assert.ok(reachable(w, pts[i], pts[i + 1]) > 0, `leg ${i}`);
});
test('wall collision pushes the chariot out and never leaves it inside a wall', () => {
  const w = parseLayout(layout);
  const c = { x: w.tileSize * 3.2, y: w.tileSize * 4, radius: 18 }; // inside the first block
  resolveWalls(w, c);
  for (const r of w.walls) {
    const qx = Math.max(r.x, Math.min(c.x, r.x + r.w)); const qy = Math.max(r.y, Math.min(c.y, r.y + r.h));
    assert.ok(Math.hypot(c.x - qx, c.y - qy) >= c.radius - 1e-6);
  }
});
test('driving into a wall costs health; sliding along it does not', () => {
  const sim = fresh();
  sim.guards = [];
  // start faces east along the top road; steer into the north outer wall
  let hit = 0;
  for (let i = 0; i < 400; i++) for (const e of step(sim, 1 / 60, { steer: -1, throttle: 1 })) if (e.type === 'wall') hit++;
  assert.ok(hit >= 1 && sim.health < 100, `hits ${hit}, health ${sim.health}`);
  const s2 = fresh(); s2.guards = [];
  s2.chariot.angle = -0.05; // shallow angle: grazes the wall
  let dmg = 0;
  for (let i = 0; i < 60; i++) for (const e of step(s2, 1 / 60, { steer: 0, throttle: 1 })) if (e.type === 'wall') dmg++;
  assert.equal(dmg, 0);
});
test('guard hit costs 20 health, then brief invulnerability', () => {
  const sim = fresh(); const g = sim.guards[0];
  warp(sim, g);
  const ev = step(sim, 1 / 60, none).filter((e) => e.type === 'guard');
  assert.equal(ev.length, 1); assert.equal(sim.health, 80);
  warp(sim, g);
  assert.equal(step(sim, 1 / 60, none).filter((e) => e.type === 'guard').length, 0);
});
test('checkpoints must be reached in order; reaching 3 wins', () => {
  const sim = fresh(); sim.guards = []; const cps = sim.world.checkpoints;
  warp(sim, cps[1]); step(sim, 1 / 60, none); assert.equal(sim.checkpoint, 0, 'cp2 first does nothing');
  const seen = [];
  for (const p of cps) { warp(sim, p); seen.push(...step(sim, 1 / 60, none).map((e) => e.type + (e.n || ''))); }
  assert.deepEqual(seen, ['checkpoint1', 'checkpoint2', 'checkpoint3', 'win']);
  assert.equal(sim.status, 'won');
  assert.deepEqual(step(sim, 1 / 60, none), [], 'sim is inert after the end');
});
test('zero health fails with reason "wrecked"', () => {
  const sim = fresh(); sim.guards = [];
  sim.health = 8; sim.chariot.speed = 200; sim.chariot.angle = Math.PI; // east wall behind start? drive west into outer wall
  let fail = null;
  for (let i = 0; i < 120 && !fail; i++) fail = step(sim, 1 / 60, { steer: 0, throttle: 1 }).find((e) => e.type === 'fail');
  assert.equal(fail?.reason, 'wrecked'); assert.equal(sim.status, 'failed');
});
test('timer: standard fails at the limit, off never fails, extended doubles, mid-run change works', () => {
  const a = fresh({ timerMode: 'standard' }); a.guards = [];
  assert.equal(a.timeLeft, 150);
  let fail = null;
  for (let i = 0; i < 150 * 60 + 5 && !fail; i++) fail = step(a, 1 / 60, none).find((e) => e.type === 'fail');
  assert.equal(fail?.reason, 'time');
  const off = fresh({ timerMode: 'off' }); off.guards = [];
  for (let i = 0; i < 200 * 60; i++) step(off, 1 / 60, none);
  assert.equal(off.status, 'playing'); assert.equal(off.timeLeft, null);
  assert.equal(fresh({ timerMode: 'extended' }).timeLeft, 300);
  const m = fresh({ timerMode: 'standard' }); m.guards = [];
  for (let i = 0; i < 100 * 60; i++) step(m, 1 / 60, none);
  setTimerMode(m, 'extended'); assert.ok(Math.abs(m.timeLeft - 200) < 1);
  setTimerMode(m, 'off'); assert.equal(m.timeLeft, null);
});
test('mission runner: objectives advance, triggers fire, hit lines are rate limited', () => {
  const said = []; const objs = [];
  const r = createRunner(mission, { onSay: (l) => said.push(l.trigger), onObjective: (o, i) => objs.push([o?.id, i]) });
  r.start();
  r.handle({ type: 'wall' }, 1); r.handle({ type: 'guard' }, 2); r.handle({ type: 'guard' }, 7);
  [1, 2, 3].forEach((n) => r.handle({ type: 'checkpoint', n }, 10));
  r.handle({ type: 'win' }, 11); r.handle({ type: 'fail' }, 12);
  assert.deepEqual(said, ['start', 'hit', 'hit', 'checkpoint-1', 'checkpoint-2', 'checkpoint-3', 'win', 'fail']);
  assert.deepEqual(objs, [['checkpoint-1', 0], ['checkpoint-2', 1], ['checkpoint-3', 2], [undefined, 3]]);
});
test('loop runs fixed steps and stops', () => {
  let t = 0; const q = []; let updates = 0; let renders = 0;
  const loop = createLoop({ update: () => updates++, render: () => renders++, raf: (f) => { q.push(f); return q.length; }, caf: () => {}, now: () => t });
  loop.start();
  for (let i = 1; i <= 10; i++) { t += 1000 / 30; q.shift()(t); } // 10 frames at 30 fps = 1/3 s
  assert.ok(updates >= 19 && updates <= 20, `updates ${updates}`); assert.equal(renders, 10);
  loop.stop(); assert.equal(loop.running, false);
});
test('renderer interface check and frame snapshot', () => {
  assert.throws(() => assertRenderer({}), /missing/);
  assertRenderer({ resize() {}, setWorld() {}, render() {} });
  const f = makeFrame(fresh(), { shake: 0, flash: 0 }, true);
  assert.equal(f.checkpoints[0].state, 'next'); assert.equal(f.checkpoints[2].state, 'later'); assert.equal(f.guards.length, 6);
});
test('bot can drive S->1->2->3 with guards removed (geometry is drivable)', () => {
  const w = parseLayout(layout); const sim = createSim(w); sim.guards = [];
  const path = routeTiles(w, w.start, w.checkpoints);
  const r = drive(sim, path);
  assert.equal(sim.status, 'won', `status ${sim.status} after ${r.t.toFixed(1)}s health ${sim.health}`);
  console.log(`   bot (no guards): won in ${r.t.toFixed(1)}s, health ${sim.health}, wall hits ${r.walls}`);
});
test('bot with guards active: report outcome (informational)', () => {
  const w = parseLayout(layout); const sim = createSim(w, { timerMode: 'off' });
  const r = drive(sim, routeTiles(w, w.start, w.checkpoints));
  console.log(`   bot (guards on, blind to guards): ${sim.status} in ${r.t.toFixed(1)}s, health ${sim.health}, guard hits ${r.guards}`);
});

// --- helpers: BFS route through road-tile centres, then simple pure-pursuit driving ---
function routeTiles(w, from, cps) {
  const ts = w.tileSize; let cur = [Math.floor(from.x / ts), Math.floor(from.y / ts)]; const out = [];
  const key = (c, r) => r * w.cols + c;
  for (const cp of cps) {
    const goal = [Math.floor(cp.x / ts), Math.floor(cp.y / ts)];
    const prev = new Map([[key(...cur), null]]); const q = [cur];
    while (q.length) {
      const [c, r] = q.shift(); if (c === goal[0] && r === goal[1]) break;
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const n = [c + dc, r + dr];
        if (prev.has(key(...n)) || w.solid[n[1]]?.[n[0]] !== false) continue;
        prev.set(key(...n), [c, r]); q.push(n);
      }
    }
    const seg = []; for (let p = goal; p; p = prev.get(key(...p))) seg.push(p);
    out.push(...seg.reverse().slice(out.length ? 1 : 0)); cur = goal;
  }
  return out.map(([c, r]) => ({ x: (c + 0.5) * ts, y: (r + 0.5) * ts }));
}
function drive(sim, path) {
  let i = 0; let walls = 0; let guards = 0; let t = 0;
  while (sim.status === 'playing' && t < 400) {
    const c = sim.chariot;
    while (i < path.length - 1 && Math.hypot(path[i].x - c.x, path[i].y - c.y) < 70) i++;
    const target = path[Math.min(i + 1, path.length - 1)];
    let da = Math.atan2(target.y - c.y, target.x - c.x) - c.angle;
    da = Math.atan2(Math.sin(da), Math.cos(da));
    const throttle = Math.abs(da) > 0.6 ? (c.speed > 90 ? -0.3 : 0.3) : (c.speed > 150 ? 0 : 1);
    for (const e of step(sim, 1 / 60, { steer: Math.max(-1, Math.min(1, da * 3)), throttle })) { if (e.type === 'wall') walls++; if (e.type === 'guard') guards++; }
    t += 1 / 60;
  }
  return { t, walls, guards };
}

for (const [s, n, m] of results) console.log(`${s === 'ok' ? 'PASS' : 'FAIL'}  ${n}${m ? `\n      ${m}` : ''}`);
const failed = results.filter((r) => r[0] === 'FAIL').length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
