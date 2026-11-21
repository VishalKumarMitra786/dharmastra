// Node tests for the game logic. Run: node src/test/run.mjs   (no dependencies)
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseLayout, resolveWalls, reachable } from '../world.js';
import { createSim, step, setTimerMode } from '../sim.js';
import { validateMission, loadMission, createRunner } from '../mission.js';
import { createLoop } from '../loop.js';
import { assertRenderer, makeFrame } from '../renderer.js';
import { layout } from '../../missions/dvapara-escape.js';
import { MISSIONS, pickMissionId } from '../missions.js';
import { angleDelta, createCameraState, followCamera, chooseGraphics } from '../camera.js';
import { loadSettings } from '../settings.js';
import './render1.mjs';
import './hero-spike.mjs';

const results = [];
const queue = [];
const test = (name, fn) => { queue.push(async () => { try { await fn(); results.push(['ok', name]); } catch (e) { results.push(['FAIL', name, e.message]); } }); };
const none = { steer: 0, throttle: 0 };
const missionPath = new URL('../../missions/dvapara-escape.json', import.meta.url);
const mission = JSON.parse(await readFile(missionPath, 'utf8'));
const fresh = (o) => createSim(parseLayout({ ...layout, mode: 'chariot' }), o); // the chariot rules are still tested on the first map
const warp = (sim, p) => { sim.chariot.x = p.x; sim.chariot.y = p.y; };

test('mission JSON passes validation and has the exact schema keys', () => {
  assert.deepEqual(validateMission(mission), []);
  assert.deepEqual(Object.keys(mission), ['id', 'era', 'title', 'logline', 'objectives', 'dialogue', 'events', 'rewards']);
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

// Like routeTiles but keeps away from walls (tiles next to a wall cost more), the way a careful driver stays mid-street.
function routeCentred(w, from, cps) {
  const ts = w.tileSize; const open = (c, r) => w.solid[r]?.[c] === false;
  const nearWall = (c, r) => [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]].some(([dc, dr]) => !open(c + dc, r + dr));
  let cur = [Math.floor(from.x / ts), Math.floor(from.y / ts)]; const out = [];
  for (const cp of cps) {
    const goal = [Math.floor(cp.x / ts), Math.floor(cp.y / ts)];
    const dist = new Map([[cur.join(','), 0]]); const prev = new Map(); const pq = [[0, cur]];
    while (pq.length) {
      pq.sort((a, b) => a[0] - b[0]); const [d, [c, r]] = pq.shift();
      if (c === goal[0] && r === goal[1]) break;
      if (d > dist.get(`${c},${r}`)) continue;
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const n = [c + dc, r + dr]; if (!open(...n)) continue;
        const nd = d + 1 + (nearWall(...n) ? 6 : 0);
        if (nd < (dist.get(n.join(',')) ?? Infinity)) { dist.set(n.join(','), nd); prev.set(n.join(','), [c, r]); pq.push([nd, n]); }
      }
    }
    const seg = []; let k = goal.join(',');
    while (k && k !== cur.join(',')) { const [c, r] = k.split(',').map(Number); seg.push({ x: (c + 0.5) * ts, y: (r + 0.5) * ts }); const p = prev.get(k); k = p ? p.join(',') : null; }
    seg.reverse(); seg[seg.length - 1] = { x: cp.x, y: cp.y, cp: true }; // aim at the checkpoint itself, not just its tile
    out.push(...seg); cur = goal;
  }
  return out;
}

function drive(sim, path, tol = 70, careful = false) {
  let i = 0; let walls = 0; let guards = 0; let t = 0;
  while (sim.status === 'playing' && t < 400) {
    const c = sim.chariot;
    const near = (p) => Math.hypot(p.x - c.x, p.y - c.y) < tol;
    while (i < path.length - 1 && (near(path[i]) || (!path[i].cp && near(path[i + 1])))) i++; // may skip a point whose successor is already reached, but never skips a checkpoint
    const target = path[i].cp ? path[i] : path[Math.min(i + 1, path.length - 1)]; // look one point ahead, but head straight for a checkpoint
    if (sim.foot) { // walking: head straight for the target, no steering needed
      const dx = target.x - c.x; const dy = target.y - c.y; const d = Math.hypot(dx, dy) || 1;
      for (const e of step(sim, 1 / 60, { mx: dx / d, my: dy / d, run: !careful })) { if (e.type === 'wall') walls++; if (e.type === 'guard') guards++; }
      t += 1 / 60; continue;
    }
    let da = Math.atan2(target.y - c.y, target.x - c.x) - c.angle;
    da = Math.atan2(Math.sin(da), Math.cos(da));
    let throttle = Math.abs(da) > 0.6 ? (c.speed > 90 ? -0.3 : 0.3) : (c.speed > 150 ? 0 : 1);
    if (careful && Math.hypot(target.x - c.x, target.y - c.y) < 170) throttle = c.speed > 55 ? -0.5 : 0.5; // slow down near waypoints like a careful driver
    for (const e of step(sim, 1 / 60, { steer: Math.max(-1, Math.min(1, da * 3)), throttle })) { if (e.type === 'wall') walls++; if (e.type === 'guard') guards++; }
    t += 1 / 60;
  }
  return { t, walls, guards };
}


test('camera: angleDelta takes the short way round', () => {
  assert.ok(Math.abs(angleDelta(3.0, -3.0) - (2 * Math.PI - 6.0)) < 1e-9);
  assert.ok(Math.abs(angleDelta(0, 1) - 1) < 1e-9);
  assert.ok(Math.abs(angleDelta(-3.0, 3.0) + (2 * Math.PI - 6.0)) < 1e-9);
});

test('camera: sits behind the chariot, snaps on first frame, lags otherwise, never lags with reduced motion', () => {
  const st = createCameraState();
  const c = { x: 100, y: 200, angle: 0 };
  const v = followCamera(st, c, 0.016, false);
  assert.ok(v.position.x < c.x && Math.abs(v.position.z - c.y) < 1e-9, 'behind the chariot along its heading');
  assert.ok(v.target.x > c.x, 'looks ahead of the chariot');
  const turned = { ...c, angle: Math.PI / 2 };
  followCamera(st, turned, 0.016, false);
  assert.ok(st.angle > 0 && st.angle < Math.PI / 2, 'smoothing lags a little');
  for (let i = 0; i < 200; i++) followCamera(st, turned, 0.016, false);
  assert.ok(Math.abs(st.angle - Math.PI / 2) < 0.01, 'converges');
  const rm = createCameraState();
  followCamera(rm, c, 0.016, true);
  followCamera(rm, turned, 0.016, true);
  assert.equal(rm.angle, Math.PI / 2, 'reduced motion has no camera lag');
});

test('graphics choice: 3D when possible, 2D when asked or when WebGL is missing', () => {
  assert.equal(chooseGraphics({ preference: '3d', webglAvailable: true }).mode, '3d');
  assert.equal(chooseGraphics({ preference: '2d', webglAvailable: true }).mode, '2d');
  const fb = chooseGraphics({ preference: '3d', webglAvailable: false });
  assert.equal(fb.mode, '2d');
  assert.ok(fb.note.length > 0, 'fallback explains itself');
  assert.equal(chooseGraphics({ preference: '2d', webglAvailable: false }).note, '');
});

test('settings: graphics defaults to 3d and rejects bad saved values', () => {
  const win = { matchMedia: () => ({ matches: false }) };
  const store = (v) => ({ getItem: () => v });
  assert.equal(loadSettings(store(null), win).graphics, '3d');
  assert.equal(loadSettings(store('{"graphics":"2d"}'), win).graphics, '2d');
  assert.equal(loadSettings(store('{"graphics":"hologram"}'), win).graphics, '3d');
  assert.equal(loadSettings(store('not json'), win).graphics, '3d');
});


test('mission picker: known ids pass, anything else falls back to the first mission', () => {
  assert.equal(pickMissionId('?mission=mauryan-spy'), 'mauryan-spy');
  assert.equal(pickMissionId(''), MISSIONS[0].id);
  assert.equal(pickMissionId('?mission=../../etc/passwd'), MISSIONS[0].id);
});

for (const m of MISSIONS) {
  test(`mission ${m.id}: JSON is valid, map matches objectives, route is drivable, guard paths avoid walls`, async () => {
    const data = JSON.parse(await readFile(new URL(`../../missions/${m.id}.json`, import.meta.url), 'utf8'));
    assert.deepEqual(validateMission(data), []);
    assert.equal(data.id, m.id);
    const { layout: lay } = await import(`../../missions/${m.id}.js`);
    const w = parseLayout(lay);
    assert.equal(w.checkpoints.length, data.objectives.length);
    assert.equal(data.objectives.length, 3);
    data.objectives.forEach((o, i) => assert.equal(o.id, `checkpoint-${i + 1}`));
    const pts = [w.start, ...w.checkpoints];
    for (let i = 0; i < pts.length - 1; i++) assert.ok(reachable(w, pts[i], pts[i + 1]) > 0, `leg ${i}`);
    const open = (c, r) => w.solid[r]?.[c] === false;
    for (const g of w.guards) {
      for (let k = 0; k < g.path.length - 1; k++) {
        const a = g.path[k], b = g.path[k + 1];
        for (let t = 0; t <= 40; t++) {
          const x = a.x + (b.x - a.x) * t / 40, y = a.y + (b.y - a.y) * t / 40;
          for (const dx of [-1, 1]) for (const dy of [-1, 1]) {
            assert.ok(open(Math.floor((x + dx) / w.tileSize), Math.floor((y + dy) / w.tileSize)), `guard path touches a wall near ${Math.round(x)},${Math.round(y)}`);
          }
        }
      }
    }
  });
}


test('mission 2: bot can drive S->1->2->3 with guards removed, and guards-on outcome is reported', async () => {
  const { layout: lay } = await import('../../missions/mauryan-spy.js');
  const w = parseLayout(lay); const sim = createSim(w, { timerMode: 'off' }); sim.guards = [];
  const r = drive(sim, routeCentred(w, w.start, w.checkpoints), 58, true);
  console.log(`   mission 2 bot (no guards, ${sim.status}): health ${sim.health}, checkpoints ${sim.checkpoint}, at ${Math.round(sim.chariot.x)},${Math.round(sim.chariot.y)}, t=${r.t.toFixed(0)}s`);
  assert.equal(sim.status, 'won');
  console.log(`   mission 2 bot (no guards): won in ${r.t.toFixed(1)}s, wall hits ${r.walls}`);
  const sim2 = createSim(parseLayout(lay), { timerMode: 'off' });
  const r2 = drive(sim2, routeCentred(parseLayout(lay), w.start, w.checkpoints), 58, true);
  console.log(`   mission 2 bot (guards on, blind to guards): ${sim2.status} in ${r2.t.toFixed(1)}s, health ${sim2.health}, guard hits ${r2.guards}`);
});

test('characters: roster has both bodies, valid colours, safe names; storage is sanitised', async () => {
  const C = await import('../characters.js');
  assert.ok(C.LOOKS.filter((l) => l.body === 'f').length >= 2 && C.LOOKS.filter((l) => l.body === 'm').length >= 2);
  assert.equal(new Set(C.LOOKS.map((l) => l.id)).size, C.LOOKS.length);
  for (const l of C.LOOKS) {
    for (const c of [l.skin, l.hair, l.eyes, l.accent]) assert.match(c, /^#[0-9a-f]{6}$/i, l.id);
    assert.ok(C.OUTFITS.some((o) => o.id === l.outfit), l.id);
    assert.ok(l.name.length <= C.NAME_MAX);
    assert.ok(C.avatarSvg(C.appearance({ look: l.id })).startsWith('<svg'));
  }
  const bad = C.sanitize({ look: 'nope', name: '<img src=x onerror=1>' + 'z'.repeat(40), outfit: 'bogus' });
  assert.equal(bad.look, C.LOOKS[0].id);
  assert.ok(!/[<>=]/.test(bad.name) && bad.name.length <= C.NAME_MAX);
  assert.equal(C.sanitize({ look: 'ira', name: '   ' }).name, 'Ira');
  assert.equal(C.fill('Go, {name}.', 'Meera'), 'Go, Meera.');
});

test('missions: scripts that use {name} stay within the 140 character limit for the longest name', async () => {
  const { NAME_MAX } = await import('../characters.js');
  for (const id of ['dvapara-escape', 'mauryan-spy']) {
    const m = JSON.parse(await readFile(new URL(`../../missions/${id}.json`, import.meta.url), 'utf8'));
    for (const d of m.dialogue) assert.ok(d.text.replaceAll('{name}', 'x'.repeat(NAME_MAX)).length <= 140, `${id}/${d.id}`);
  }
});

test('renderer2d: setCharacter makes the hero use the traveller colours and hair style', async () => {
  const { createRenderer2D } = await import('../renderer2d.js');
  const C = await import('../characters.js');
  const run = (look) => {
    const fills = []; let fs = '';
    const ctx = new Proxy({}, { get: (_, k) => (k === 'fillStyle' ? fs : k === 'createPattern' ? () => 'pat' : () => { fills.push(`call:${String(k)}`); }), set: (_, k, v) => { if (k === 'fillStyle') { fs = v; fills.push(v); } return true; } });
    globalThis.document = { createElement: () => ({ getContext: () => ctx }) };
    const r = createRenderer2D({ getContext: () => ctx, width: 0, height: 0 });
    r.resize(360, 640, 1); r.setWorld({ width: 100, height: 100, walls: [], checkpoints: [] });
    if (look) r.setCharacter(look);
    r.render({ chariot: { x: 50, y: 50, angle: 0, radius: 14 }, mode: 'foot', guards: [], checkpoints: [], effects: { shake: 0, flash: 0 }, reducedMotion: true, time: 0 });
    return fills;
  };
  const tara = C.appearance({ look: 'tara', outfit: 'indigo' });
  const f = run(tara);
  for (const c of [tara.outfitColor, tara.skin, tara.hair, tara.accent]) assert.ok(f.includes(c), c);
  const generic = run(null);
  assert.ok(!generic.includes(tara.outfitColor) && !generic.includes(tara.hair));
  const bun = run(C.appearance({ look: 'ira' })).length; const short = run(C.appearance({ look: 'neel' })).length;
  assert.notEqual(bun, short, 'hair style changes what is drawn');
  delete globalThis.document;
});

test('start screen: avatar sits beside the Playing as note and is decorative', async () => {
  const html = await readFile(new URL('../../index.html', import.meta.url), 'utf8');
  assert.match(html, /id="who-avatar"[\s\S]*id="who"/);
  const C = await import('../characters.js');
  assert.match(C.avatarSvg(C.appearance({ look: 'meera' })), /aria-hidden="true"/);
  const main = await readFile(new URL('../main.js', import.meta.url), 'utf8');
  assert.match(main, /who-avatar[\s\S]*avatarSvg/);
  assert.equal(typeof assertRenderer({ resize() {}, setWorld() {}, render() {} }).render, 'function'); // setCharacter stays optional
});

test('walking: foot mode is on for both missions and the player stops at walls without losing health', async () => {
  for (const id of ['dvapara-escape', 'mauryan-spy']) {
    const { layout: lay } = await import(`../../missions/${id}.js`);
    const w = parseLayout(lay);
    assert.equal(w.mode, 'foot', id);
    const sim = createSim(w, { timerMode: 'off' });
    for (let i = 0; i < 600; i++) step(sim, 1 / 60, { mx: 0, my: -1, run: true }); // push north into the wall for 10s
    assert.equal(sim.health, 100, `${id}: walls do not hurt on foot`);
    assert.ok(sim.chariot.y > sim.chariot.radius - 1, `${id}: stays inside the map`);
  }
});

test('third-person camera: stick is relative to the camera, boom stops at walls, look input turns it', async () => {
  const C = await import('../camera.js');
  const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} vs ${b}`);
  // Facing north (the 2D fallback view): up is north, right is east, so it matches the old map controls.
  let m = C.relativeMove(0, -1, C.FORWARD_UP); near(m.mx, 0); near(m.my, -1);
  m = C.relativeMove(1, 0, C.FORWARD_UP); near(m.mx, 1); near(m.my, 0);
  // Facing east: forward is east, right-hand side is south (y grows down the map).
  m = C.relativeMove(0, -1, 0); near(m.mx, 1); near(m.my, 0);
  m = C.relativeMove(1, 0, 0); near(m.mx, 0); near(m.my, 1);
  m = C.relativeMove(0, 1, 0); near(m.mx, -1); // back = west
  // The camera sits behind the hero, above the ground, and looks ahead.
  const o = C.createOrbit(); o.yaw = 0;
  const v = C.thirdPersonView({ x: 500, y: 500 }, o, 0.016, null, true);
  assert.ok(v.position.x < 500 && v.target.x > 500 && v.position.y > 40);
  // A wall right behind the hero pulls the camera in, but never closer than the minimum.
  const o2 = C.createOrbit(); o2.yaw = 0;
  const v2 = C.thirdPersonView({ x: 500, y: 500 }, o2, 0.016, (x) => x < 450, true);
  assert.ok(v2.position.x >= 450 && v2.position.x > v.position.x);
  const o3 = C.createOrbit(); o3.yaw = 0;
  const v3 = C.thirdPersonView({ x: 500, y: 500 }, o3, 0.016, () => true, true);
  assert.ok(500 - v3.position.x >= C.TPCAM.minDistance * Math.cos(o3.pitch) - 1e-6);
  // Look input: a drag to the right turns the camera clockwise, pitch is clamped, reduced motion disables auto-steer.
  const o4 = C.createOrbit(); const y0 = o4.yaw;
  C.updateOrbit(o4, 0.016, { dx: 100, dy: 0, key: 0 }, { mx: 0, my: 0 }, false); assert.ok(o4.yaw > y0);
  C.updateOrbit(o4, 0.016, { dx: 0, dy: 99999, key: 0 }, { mx: 0, my: 0 }, false); assert.equal(o4.pitch, C.TPCAM.pitchMax);
  const o5 = C.createOrbit(); const y1 = o5.yaw;
  C.updateOrbit(o5, 0.5, { dx: 0, dy: 0, key: 0 }, { mx: 1, my: -1 }, true); assert.equal(o5.yaw, y1);
  C.updateOrbit(o5, 0.5, { dx: 0, dy: 0, key: 0 }, { mx: 1, my: -1 }, false); assert.ok(o5.yaw > y1);
});

import { registerUi1 } from './ui1.mjs'; registerUi1(test);
import { registerPhase1 } from './phase1.mjs'; registerPhase1(test);
import { registerSangam } from './sangam.mjs'; registerSangam(test);
import { registerPhase2 } from './phase2.mjs'; await registerPhase2(test);
import { registerChakra } from './chakra.mjs'; registerChakra(test);
import { registerMonetize } from './monetize.mjs'; registerMonetize(test);
for (const run of queue) await run(); // run in order, awaiting async tests
for (const [s, n, m] of results) console.log(`${s === 'ok' ? 'PASS' : 'FAIL'}  ${n}${m ? `\n      ${m}` : ''}`);
const failed = results.filter((r) => r[0] === 'FAIL').length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
