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
import './hero-assets.mjs';
import './anim-clips.mjs';
import './tier.mjs';
import './highpack.mjs';

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
test('driving into a wall is a bump (an event), never a loss of health; sliding along it is silent', () => {
  const sim = fresh();
  // start faces east along the top road; steer into the north outer wall
  let hit = 0;
  for (let i = 0; i < 400; i++) for (const e of step(sim, 1 / 60, { steer: -1, throttle: 1 })) if (e.type === 'wall') { hit++; assert.equal(e.damage, 0); }
  assert.ok(hit >= 1, `bumps ${hit}`); assert.equal(sim.health, 100, 'no contact damage from a wall');
  const s2 = fresh();
  s2.chariot.angle = -0.05; // shallow angle: grazes the wall
  let dmg = 0;
  for (let i = 0; i < 60; i++) for (const e of step(s2, 1 / 60, { steer: 0, throttle: 1 })) if (e.type === 'wall') dmg++;
  assert.equal(dmg, 0);
});
test('legacy guards are gone: the old contact-damage guard list is always empty (they are armed enemies now)', () => {
  const sim = fresh();
  assert.equal(sim.guards.length, 0); assert.equal(sim.invuln, 0);
  const sim2 = createSim(parseLayout(layout), { timerMode: 'off' });
  assert.ok(sim2.enemies.every((e) => e.kind !== 'target')); assert.equal(sim2.guards.length, 0); // level 1 is fight-driven: its enemies arrive in waves (src/test/dvapara2.mjs)
});
test('checkpoints must be reached in order; reaching 3 wins', () => {
  const sim = fresh(); const cps = sim.world.checkpoints;
  warp(sim, cps[1]); step(sim, 1 / 60, none); assert.equal(sim.checkpoint, 0, 'cp2 first does nothing');
  const seen = [];
  for (const p of cps) { warp(sim, p); seen.push(...step(sim, 1 / 60, none).map((e) => e.type + (e.n || ''))); }
  assert.deepEqual(seen, ['checkpoint1', 'checkpoint2', 'checkpoint3', 'win']);
  assert.equal(sim.status, 'won');
  assert.deepEqual(step(sim, 1 / 60, none), [], 'sim is inert after the end');
});
test('zero health fails: "wrecked" for the chariot, "defeated" on foot', () => {
  const sim = fresh(); sim.health = 0;
  const fail = step(sim, 1 / 60, none).find((e) => e.type === 'fail');
  assert.equal(fail?.reason, 'wrecked'); assert.equal(sim.status, 'failed');
  const foot = createSim(parseLayout(layout), { timerMode: 'off' }); foot.health = 0;
  assert.equal(step(foot, 1 / 60, { mx: 0, my: 0, action: {}, hold: {} }).find((e) => e.type === 'fail')?.reason, 'defeated');
});
test('timer: standard fails at the limit, off never fails, extended doubles, mid-run change works', () => {
  const a = fresh({ timerMode: 'standard' });
  assert.equal(a.timeLeft, layout.timeLimit);
  let fail = null;
  for (let i = 0; i < layout.timeLimit * 60 + 5 && !fail; i++) fail = step(a, 1 / 60, none).find((e) => e.type === 'fail');
  assert.equal(fail?.reason, 'time');
  const off = fresh({ timerMode: 'off' });
  for (let i = 0; i < 300 * 60; i++) step(off, 1 / 60, none);
  assert.equal(off.status, 'playing'); assert.equal(off.timeLeft, null);
  assert.equal(fresh({ timerMode: 'extended' }).timeLeft, layout.timeLimit * 2);
  const m = fresh({ timerMode: 'standard' });
  for (let i = 0; i < 100 * 60; i++) step(m, 1 / 60, none);
  setTimerMode(m, 'extended'); assert.ok(Math.abs(m.timeLeft - (layout.timeLimit * 2 - 100)) < 1);
  setTimerMode(m, 'off'); assert.equal(m.timeLeft, null);
});
test('mission runner: objectives advance, triggers fire, hit lines are rate limited', () => {
  const said = []; const objs = [];
  const r = createRunner(mission, { onSay: (l) => said.push(l.trigger), onObjective: (o, i) => objs.push([o?.id, i]) });
  r.start();
  r.handle({ type: 'wall' }, 1); r.handle({ type: 'guard' }, 2); r.handle({ type: 'guard' }, 7);
  [1, 2, 3].forEach((n) => r.handle({ type: 'checkpoint', n }, 10));
  r.handle({ type: 'win' }, 11); r.handle({ type: 'fail' }, 12);
  assert.deepEqual(said, ['start', 'hit', 'hit', 'win', 'fail']); // level 1 has no per-checkpoint lines: its fights speak (wave:, phase, captain-down)
  assert.deepEqual(objs, [['bazaar', 0], ['rows', 1], ['bridge', 2], [undefined, 3]]);
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
  assert.equal(f.checkpoints[0].state, 'next'); assert.equal(f.checkpoints[2].state, 'later'); assert.equal(f.guards.length, 0, 'guards are enemies now');
});
test('bot can drive S->1->2->3 with guards removed (geometry is drivable)', () => {
  const w = parseLayout(layout); const sim = createSim(w, { objectives: [] }); sim.enemies = []; // no fights: this checks the geometry only
  const path = routeTiles(w, w.start, w.checkpoints);
  const r = drive(sim, path);
  assert.equal(sim.status, 'won', `status ${sim.status} after ${r.t.toFixed(1)}s health ${sim.health}`);
  console.log(`   bot (no guards): won in ${r.t.toFixed(1)}s, health ${sim.health}, wall hits ${r.walls}`);
});
test('bot with guards active: report outcome (informational)', () => {
  const w = parseLayout(layout); const sim = createSim(w, { timerMode: 'off' });
  const r = drive(sim, routeTiles(w, w.start, w.checkpoints));
  console.log(`   bot (guards on, blind to guards): ${sim.status} in ${r.t.toFixed(1)}s, health ${sim.health}`);
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
    if (m.id !== 'dvapara-escape') data.objectives.forEach((o, i) => assert.equal(o.id, `checkpoint-${i + 1}`)); // level 1 names its stages (bazaar, rows, bridge)
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
  const w = parseLayout(lay); const sim = createSim(w, { timerMode: 'off' }); sim.enemies = [];
  const r = drive(sim, routeCentred(w, w.start, w.checkpoints), 58, true);
  console.log(`   mission 2 bot (no guards, ${sim.status}): health ${sim.health}, checkpoints ${sim.checkpoint}, at ${Math.round(sim.chariot.x)},${Math.round(sim.chariot.y)}, t=${r.t.toFixed(0)}s`);
  assert.equal(sim.status, 'won');
  console.log(`   mission 2 bot (no guards): won in ${r.t.toFixed(1)}s, wall hits ${r.walls}`);
  const sim2 = createSim(parseLayout(lay), { timerMode: 'off' });
  const r2 = drive(sim2, routeCentred(parseLayout(lay), w.start, w.checkpoints), 58, true);
  console.log(`   mission 2 bot (guards on, blind to guards): ${sim2.status} in ${r2.t.toFixed(1)}s, health ${sim2.health}`);
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

test('start screen: the traveller avatar is a decorative icon inside a named button', async () => {
  const html = await readFile(new URL('../../index.html', import.meta.url), 'utf8');
  assert.match(html, /id="who-btn"[^>]*aria-label="Change traveller"[\s\S]*id="who-avatar"/);
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
    const sim = createSim(w, { timerMode: 'off', objectives: [] }); // no waves: this is about walls
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
  const v2 = C.thirdPersonView({ x: 500, y: 500 }, o2, 0.016, (x) => x < 380, true);
  assert.ok(v2.position.x >= 380 && v2.position.x > v.position.x, 'a wall behind pulls the boom in');
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
import { registerCombat2 } from './combat2.mjs'; await registerCombat2(test);
import { registerProps } from './props.mjs'; registerProps(test);
import { registerDvapara } from './dvapara2.mjs'; registerDvapara(test);
import { registerChakra } from './chakra.mjs'; registerChakra(test);
import { registerMonetize } from './monetize.mjs'; registerMonetize(test);
// ================= UI rework: controls, HUD, menus, chakra rings =================
import { stickVector, createInput, STICK_DEAD } from '../input.js';
import { chipText, splitCaption, needFor, tipText, TIPS, createHud } from '../hud.js';
import { shortLine } from '../screens.js';
import { ringLayout, layoutFrom, dialGeom, alignRot, segAt, thetaOf, visibleRange, clampPos, nearestSlot, slotAngle, slotAlpha, ringCap, hitTest, wrapLines, drawScene, coreRadius, TAU, norm } from '../chakra/scene.js';
import { groupEras, compactYear, yugaProgress, statusOf as chStatusOf, spineMap as chSpineMap, YUGAS as CH_YUGAS } from '../chakra/model.js';
import { dialSvg, dialLabel } from '../chakra/dial.js';
import { createClick } from '../chakra/click.js';
import { createChakra } from '../chakra/view.js';
import { createEventStore } from '../chakra/data.js';
import { loadSettings as loadSettings2 } from '../settings.js';

const ROOT2 = new URL('../../', import.meta.url);
const htmlText = await readFile(new URL('index.html', ROOT2), 'utf8');
const cssText = await readFile(new URL('src/styles.css', ROOT2), 'utf8');
const missionFiles = ['dvapara-escape', 'gupta-forge', 'mauryan-spy', 'sangam-staff'];
const missionsJson = await Promise.all(missionFiles.map(async (f) => JSON.parse(await readFile(new URL(`missions/${f}.json`, ROOT2), 'utf8'))));
const rule = (sel) => { const m = cssText.match(new RegExp(`(?:^|\\n|\\})\\s*${sel.replace(/[.[\]()*+?^$|\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`)); return m ? m[1] : ''; };

// ---- A: controls ----
test('controls: stick maths has a dead zone, grows smoothly, never exceeds 1 and keeps its direction', () => {
  assert.deepEqual(stickVector(0, 0, 44), { x: 0, y: 0 });
  assert.deepEqual(stickVector(2, 1, 44), { x: 0, y: 0 }, 'inside the dead zone');
  assert.deepEqual(stickVector(5, 5, 0), { x: 0, y: 0 }, 'no radius, no push');
  const full = stickVector(44, 0, 44); assert.ok(Math.abs(full.x - 1) < 1e-9 && full.y === 0);
  const over = stickVector(0, -300, 44); assert.ok(Math.abs(over.y + 1) < 1e-9, 'far past the edge is still 1');
  const diag = stickVector(100, 100, 44); assert.ok(Math.hypot(diag.x, diag.y) <= 1 + 1e-9 && diag.x > 0 && diag.y > 0, 'diagonals are not faster');
  let prev = 0; for (let d = 0; d <= 44; d += 4) { const v = Math.hypot(stickVector(d, 0, 44).x, 0); assert.ok(v >= prev - 1e-9, 'monotone'); prev = v; }
  assert.ok(Math.hypot(stickVector(44 * (STICK_DEAD + 0.01), 0, 44).x, 0) < 0.05, 'a push just past the dead zone is gentle');
});

const mkPointerEl = () => { const h = {}; return { h, style: {}, addEventListener: (t, f) => { (h[t] ||= []).push(f); }, setPointerCapture() {}, getBoundingClientRect: () => ({ left: 0, top: 500, width: 100, height: 100 }), classList: { add() {}, remove() {}, toggle() {} }, setAttribute() {}, dataset: {} }; };
const fire = (el, type, ev) => (el.h[type] || []).forEach((f) => f({ preventDefault() {}, pointerId: 1, pointerType: 'touch', clientX: 0, clientY: 0, ...ev }));
const withWindow = (fn) => { const wl = {}; const prev = globalThis.window; globalThis.window = { addEventListener: (t, f) => { (wl[t] ||= []).push(f); } }; try { return fn(wl); } finally { globalThis.window = prev; } };

test('controls: the stick moves the walker, releasing stops it, and the knob follows the thumb', () => withWindow(() => {
  const joy = mkPointerEl(); const knob = { style: {} }; const stage = mkPointerEl();
  const input = createInput({ stage, buttons: [], onPause() {}, joystick: joy, knob });
  input.state.enabled = true;
  fire(joy, 'pointerdown', { clientX: 50 + 44, clientY: 550 }); // full push to the right of centre (50, 550)
  let r = input.read(); assert.ok(r.mx > 0.99 && Math.abs(r.my) < 1e-9, `right: ${r.mx},${r.my}`);
  assert.match(knob.style.transform, /translate\(44\.0px, 0\.0px\)/);
  fire(joy, 'pointermove', { clientX: 50, clientY: 550 - 44 }); r = input.read(); assert.ok(r.my < -0.99, 'up is negative y');
  fire(joy, 'pointerup', {}); r = input.read(); assert.equal(r.mx, 0); assert.equal(r.my, 0); assert.match(knob.style.transform, /translate\(0\.0px, 0\.0px\)/);
  input.state.enabled = false; fire(joy, 'pointerdown', { clientX: 100, clientY: 550 }); input.state.enabled = true; assert.equal(input.read().mx, 0, 'a press while paused is ignored');
}));

test('controls: drag to look works on the free half only, the side setting flips it, and Button controls turns touch drags off (2.5.7)', () => withWindow(() => {
  const mk = () => { const stage = mkPointerEl(); stage.getBoundingClientRect = () => ({ left: 0, top: 0, width: 400, height: 800 }); const input = createInput({ stage, buttons: [], onPause() {} }); input.state.enabled = true; input.state.cameraLook = true; return { stage, input }; };
  let { stage, input } = mk();
  fire(stage, 'pointerdown', { clientX: 300, clientY: 400 }); fire(stage, 'pointermove', { clientX: 340, clientY: 410 });
  let r = input.read(); assert.equal(r.look.dx, 40); assert.equal(r.look.dy, 10); fire(stage, 'pointerup', { clientX: 340, clientY: 410 });
  ({ stage, input } = mk()); fire(stage, 'pointerdown', { clientX: 100, clientY: 400 }); fire(stage, 'pointermove', { clientX: 160, clientY: 400 });
  assert.equal(input.read().look.dx, 0, 'a touch on the stick half does not look');
  ({ stage, input } = mk()); input.state.side = 'left'; fire(stage, 'pointerdown', { clientX: 100, clientY: 400 }); fire(stage, 'pointermove', { clientX: 130, clientY: 400 });
  assert.equal(input.read().look.dx, 30, 'with the buttons on the left, the left half looks');
  ({ stage, input } = mk()); input.state.buttonMode = true; fire(stage, 'pointerdown', { clientX: 300, clientY: 400 }); fire(stage, 'pointermove', { clientX: 380, clientY: 400 });
  assert.equal(input.read().look.dx, 0, 'Button controls: no touch drag');
  fire(stage, 'pointerdown', { clientX: 300, clientY: 400, pointerType: 'mouse', pointerId: 2 }); fire(stage, 'pointermove', { clientX: 330, clientY: 400, pointerType: 'mouse', pointerId: 2 });
  assert.equal(input.read().look.dx, 30, 'a mouse drag still looks');
}));

test('controls: the single-press arrow and look buttons and the keyboard give the same movement as the stick', () => withWindow((wl) => {
  const mkBtn = (control) => { const b = mkPointerEl(); b.dataset = { control }; return b; };
  const names = ['up', 'down', 'left', 'right', 'lookleft', 'lookright', 'runtoggle', 'attack', 'dodge', 'block', 'push', 'heavy', 'swap', 'do', 'crouch', 'aim'];
  const btn = Object.fromEntries(names.map((n) => [n, mkBtn(n)]));
  const input = createInput({ stage: mkPointerEl(), buttons: Object.values(btn), onPause() {} }); input.state.enabled = true;
  fire(btn.up, 'pointerdown', {}); fire(btn.right, 'pointerdown', {}); let r = input.read(); assert.equal(r.my, -1); assert.equal(r.mx, 1);
  fire(btn.up, 'pointerup', {}); fire(btn.right, 'pointerup', {}); r = input.read(); assert.equal(r.my, 0); assert.equal(r.mx, 0);
  input.state.cameraLook = true; fire(btn.lookright, 'pointerdown', {}); assert.equal(input.read().look.key, 1); fire(btn.lookright, 'pointerup', {});
  const key = (code) => wl.keydown.forEach((f) => f({ code, repeat: false, defaultPrevented: false, target: { tagName: 'BODY' }, preventDefault() {} }));
  const keyUp = (code) => wl.keyup.forEach((f) => f({ code }));
  key('KeyW'); key('KeyD'); r = input.read(); assert.equal(r.my, -1); assert.equal(r.mx, 1, 'W and D'); keyUp('KeyW'); keyUp('KeyD');
  key('ArrowLeft'); r = input.read(); assert.equal(r.mx, -1, 'arrow keys'); keyUp('ArrowLeft');
  key('KeyQ'); assert.equal(input.read().look.key, -1, 'Q turns the camera'); keyUp('KeyQ');
  assert.equal(input.read().run, false); fire(btn.runtoggle, 'pointerdown', {}); assert.equal(input.read().run, true, 'run toggle on'); fire(btn.runtoggle, 'pointerdown', {}); assert.equal(input.read().run, false, 'and off');
  // every action name the combat developer reads is reachable from a button: light, heavy, dodge, shove, swap, jump+interact, crouch, and held block and aim
  for (const [c, a] of [['attack', 'attack'], ['heavy', 'heavy'], ['dodge', 'dodge'], ['push', 'push'], ['swap', 'swap'], ['crouch', 'crouch']]) { fire(btn[c], 'pointerdown', {}); assert.equal(input.read().action[a], true, c); }
  fire(btn.do, 'pointerdown', {}); r = input.read(); assert.ok(r.action.jump && r.action.interact);
  fire(btn.block, 'pointerdown', {}); assert.equal(input.read().hold.block, true); fire(btn.block, 'pointerup', {}); assert.equal(input.read().hold.block, false, 'block is held, not tapped');
  fire(btn.aim, 'pointerdown', {}); assert.equal(input.read().hold.aim, true); fire(btn.aim, 'pointerup', {});
}));

test('controls: markup has the stick, the action cluster and the arrow buttons; every control is named; no old nine-button pad', () => {
  assert.match(htmlText, /id="joy"[^>]*aria-label="[^"]{8,}"/); assert.match(htmlText, /id="joy-knob"/);
  const controls = [...htmlText.matchAll(/<button[^>]*data-control="([a-z]+)"[^>]*>/g)];
  const have = controls.map((m) => m[1]); for (const c of ['attack', 'aim', 'dodge', 'heavy', 'do', 'block', 'push', 'swap', 'crouch', 'runtoggle', 'up', 'down', 'left', 'right', 'lookleft', 'lookright']) assert.ok(have.includes(c), `button ${c}`);
  for (const m of controls) assert.match(m[0], /aria-label="[^"]{3,}"/, `${m[1]} has a name`);
  for (const old of ['>Forward<', '> Forward<', 'Forward</button>', 'Left</button>', 'Right</button>', 'Look</button>', 'Run</button>', 'class="pad run"']) assert.ok(!htmlText.includes(old), `old pad text ${old} is gone`);
  for (const c of ['crouch', 'runtoggle']) assert.match(htmlText.match(new RegExp(`<button[^>]*data-control="${c}"[^>]*>`))[0], /aria-pressed="false"/, `${c} is a toggle with a state`);
  for (const c of ['aim', 'swap', 'crouch', 'runtoggle']) assert.match(htmlText.match(new RegExp(`<button[^>]*data-control="${c}"[^>]*>`))[0], /\bhidden\b/, `${c} is hidden until earned`);
  for (const c of ['attack', 'heavy', 'dodge', 'block', 'push', 'do']) assert.ok(!/\bhidden\b/.test(htmlText.match(new RegExp(`<button[^>]*data-control="${c}"[^>]*>`))[0]), `${c} is there from the start (fists)`);
});

test('controls: Settings has Button controls and Sound as validated booleans, off and on by default', () => {
  assert.match(htmlText, /id="set-buttons"[\s\S]{0,120}Button controls/); assert.match(htmlText, /id="set-sound"/);
  const win = { matchMedia: () => ({ matches: false }) }; const st = (v) => ({ getItem: () => v });
  assert.equal(loadSettings2(st(null), win).buttonControls, false); assert.equal(loadSettings2(st('{"buttonControls":true}'), win).buttonControls, true); assert.equal(loadSettings2(st('{"buttonControls":"yes"}'), win).buttonControls, false);
  assert.equal(loadSettings2(st(null), win).sound, true); assert.equal(loadSettings2(st('{"sound":false}'), win).sound, false);
});

test('controls: touch targets are at least 44 px and the clusters respect the safe-area insets', () => {
  const px = (decl, prop) => { const m = decl.match(new RegExp(`(?:^|[;\\s])${prop}:\\s*(\\d+)px`)); return m ? Number(m[1]) : null; };
  for (const sel of ['.pad', '.pad.act.sm', '.pad.act.mid', '.pad.act.big', '.btn.round', '.btn.icon']) { const d = rule(sel); assert.ok(d, `${sel} exists`); const w = px(d, 'width'), h = px(d, 'height'); if (w != null) assert.ok(w >= 44, `${sel} width ${w}`); if (h != null) assert.ok(h >= 44, `${sel} height ${h}`); }
  assert.ok(px(rule('.joy'), 'width') >= 44); assert.match(rule('.btn, select'), /min-height:\s*44px/); assert.match(rule('.btn, select'), /min-width:\s*44px/);
  for (const sel of ['#hud', '#game[data-side="right"] .touch', '#game[data-side="left"] .touch', '#game[data-side="right"] .actions-pad', '#game[data-side="left"] .actions-pad', '.overlay']) assert.match(rule(sel), /safe-(t|r|l|b)/, `${sel} uses a safe-area inset`);
  assert.match(rule('.touch, .actions-pad'), /safe-b/);
  assert.match(htmlText, /viewport-fit=cover/);
});

// ---- B: HUD ----
test('hud: the objective chip is at most six words for every mission objective, with the full text kept for screen readers', () => {
  for (const m of missionsJson) for (const o of m.objectives) { const t = chipText(o.text); assert.ok(t.replace('…', '').split(/\s+/).length <= 6, `"${t}"`); assert.ok(t.length > 0); }
  assert.equal(chipText('Reach the Lamp Bazaar and take on Suvrata and the sealed plea.'), 'Reach the Lamp Bazaar');
  assert.equal(chipText('Go now'), 'Go now');
  const els = {}; const mk = () => ({ hidden: false, textContent: '', dataset: {}, style: {}, setAttribute() {}, classList: { toggle() {}, add() {}, remove() {} } });
  const hud = createHud({ getElementById: (id) => (els[id] ||= mk()), createElement: mk, querySelector: () => null, querySelectorAll: () => [] });
  hud.setObjective('Reach the Lamp Bazaar and take on Suvrata and the sealed plea.'); assert.equal(els['obj-text'].textContent, 'Reach the Lamp Bazaar'); assert.match(els['obj-full'].textContent, /sealed plea/);
});

test('hud: dialogue captions are at most 80 characters, split at sentences, and lose no words', () => {
  for (const m of missionsJson) for (const d of m.dialogue) { const parts = splitCaption(d.text, 80); assert.ok(parts.every((p) => p.length <= 80), `too long in ${m.id}: ${parts.find((p) => p.length > 80)}`); assert.equal(parts.join(' ').replace(/\s+/g, ' '), d.text.replace(/\s+/g, ' ')); }
  assert.deepEqual(splitCaption('Short line.', 80), ['Short line.']);
  assert.ok(splitCaption('x'.repeat(200), 80).every((p) => p.length <= 80), 'an unbroken word is still cut');
});

test('hud: one slim top bar with named meters, no stat pills, no checkpoint hint text, no gear sentence, no how-to wall', () => {
  const hud = htmlText.slice(htmlText.indexOf('<header id="hud">'), htmlText.indexOf('</header>', htmlText.indexOf('<header id="hud">')));
  assert.match(hud, /id="pause-btn"[^>]*aria-label="Pause"/); assert.match(hud, /id="stat-health"[^>]*role="meter"[^>]*aria-label="Health"/); assert.match(hud, /id="stat-stamina"[^>]*role="meter"[^>]*aria-label="Stamina"/); assert.match(hud, /id="minimap"/);
  for (const gone of ['class="lbl"', 'Checkpoints', 'Gear', 'cp-pips', 'kit-text', 'stat-kit', 'stat-cp', 'health-text', 'stamina-text']) assert.ok(!hud.includes(gone), `${gone} is gone from the HUD`);
  assert.match(hud, /id="hint" class="sr-only"/, 'the direction hint is for screen readers only');
  assert.ok(!/How to play|<details class="how"|class="goal"/.test(htmlText), 'no rules wall');
  assert.match(rule('.captions'), /top:/); assert.ok(!/bottom:/.test(rule('.captions')), 'captions sit at the top, not over the thumbs');
});

test('hud: a tip shows once ever per move, uses the words of the input in use, and is chosen from what is near', async () => {
  const store = {}; const storage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = v; } };
  const els = {}; const mk = () => ({ hidden: true, textContent: '', dataset: {}, style: {}, setAttribute() {}, classList: { toggle() {}, add() {}, remove() {} } });
  const doc = { getElementById: (id) => (els[id] ||= mk()), createElement: mk, querySelector: () => null, querySelectorAll: () => [] };
  let mode = 'touch'; const hud = createHud(doc, { mode: () => mode, storage });
  assert.equal(hud.tip('do'), true); assert.equal(els.tip.hidden, false); assert.equal(els['tip-text'].textContent, 'Do: vault or climb');
  assert.equal(hud.tip('do'), false, 'second time: no tip'); assert.match(store['dharmastra.tips.v1'], /"do"/);
  const hud2 = createHud(doc, { mode: () => 'key', storage }); assert.equal(hud2.tip('do'), false, 'remembered across visits');
  assert.equal(tipText('crouch', 'key'), 'C to crouch'); assert.equal(tipText('move', 'buttons'), 'Tap the arrows');
  for (const [id, t] of Object.entries(TIPS)) for (const m of ['touch', 'buttons', 'key']) assert.ok(tipText(id, m).split(/\s+/).length <= 4, `${id}/${m}: ${tipText(id, m)}`);
  const sim = (extra) => ({ chariot: { x: 100, y: 100 }, abilities: ['walk', 'run'], enemies: [], world: { obstacles: [] }, ...extra });
  assert.equal(needFor(sim()), null);
  assert.equal(needFor(sim({ abilities: ['vault'], world: { obstacles: [{ kind: 'lowwall', x: 130, y: 90, w: 40, d: 30 }] } })), 'do');
  assert.equal(needFor(sim({ abilities: ['walk'], world: { obstacles: [{ kind: 'lowwall', x: 130, y: 90, w: 40, d: 30 }] } })), null, 'not before the vault is earned');
  assert.equal(needFor(sim({ abilities: ['crouch'], world: { obstacles: [{ kind: 'beam', x: 140, y: 100, w: 40, d: 30 }] } })), 'crouch');
  assert.equal(needFor(sim({ abilities: ['dodge'], enemies: [{ x: 160, y: 100, state: 'windup' }] })), 'dodge');
  assert.equal(needFor(sim({ abilities: ['dodge', 'sword'], enemies: [{ x: 160, y: 100, state: 'windup' }] })), 'block');
  assert.equal(needFor(sim({ abilities: ['vault'], world: { obstacles: [{ kind: 'lowwall', x: 900, y: 900, w: 40, d: 30 }] } })), null, 'far away');
});

// ---- C: menus ----
test('menus: the start screen is yuga tag, title, one line, Play and three icon buttons; no paragraphs of rules', () => {
  const start = htmlText.slice(htmlText.indexOf('id="screen-start"'), htmlText.indexOf('id="screen-pause"'));
  assert.match(start, /id="era"/); assert.match(start, /<h1 id="start-title"/); assert.match(start, /id="logline"/); assert.match(start, /id="start-btn"[^>]*>Play</);
  assert.equal((start.match(/<p[ >]/g) || []).length, 4, 'tag, line, lock note and graphics note only'); // eyebrow, logline, lock-note, gfx-note
  assert.equal((start.match(/class="btn icon"/g) || []).length, 3, 'chakra, traveller, settings');
  for (const b of start.match(/<button[^>]*class="btn icon"[^>]*>/g)) assert.match(b, /aria-label="[^"]{5,}"/);
  for (const gone of ['Reach the three numbered', 'How to play', 'Keyboard:', 'Touch:', 'Change traveller</button>', 'Chakra of the yugas</button>']) assert.ok(!start.includes(gone), gone);
  for (const m of missionsJson) { const l = shortLine(m.logline); assert.ok(l.length <= 66 && l.length > 10, `${m.id}: ${l}`); assert.ok(!l.includes('\n')); }
  assert.equal(shortLine('A short one. And more.'), 'A short one.'); assert.equal(shortLine(''), '');
});

test('menus: settings and traveller picker use short labels and one type scale', () => {
  const set = htmlText.slice(htmlText.indexOf('id="screen-settings"'), htmlText.indexOf('id="screen-win"'));
  for (const lab of ['Button controls', 'Reduce motion', 'Sound', 'Always run', 'Blood spatter', 'Action buttons', 'Timer', 'Graphics']) assert.ok(set.includes(`>${lab}<`), lab);
  assert.ok(!/\(.{25,}\)/.test(set.replace(/<[^>]+>/g, '')), 'no parenthetical sentences in settings');
  const pick = htmlText.slice(htmlText.indexOf('id="screen-character"'), htmlText.indexOf('id="screen-start"'));
  assert.ok(!pick.includes('class="goal"') && !pick.includes('You walk the chakra'), 'no story paragraph in the picker');
  assert.match(cssText, /--xs:[^;]+;\s*--s:[^;]+;\s*--m:[^;]+;\s*--l:[^;]+;\s*--xl:/); assert.match(cssText, /--sp1: 4px;[^}]*--sp5: 24px/);
  const fonts = [...cssText.matchAll(/font-size:\s*([^;}]+)/g)].map((m) => m[1].trim()); const off = fonts.filter((f) => !/^(var\(--(xs|s|m|l|xl)\)|clamp\(.*\)|inherit)$/.test(f)); assert.deepEqual(off, [], `font sizes outside the scale: ${off.join(', ')}`);
});

// ---- D: chakra rings ----
const fakeCtx2 = () => { const log = { calls: 0, alphas: [] }; const grad = { addColorStop() { log.calls++; } }; const ctx = new Proxy({}, { get: (t, k) => (k in t ? t[k] : k === 'measureText' ? (s) => { log.calls++; return { width: String(s).length * 6 }; } : (() => { log.calls++; return grad; })), set: (t, k, v) => { if (k === 'globalAlpha') log.alphas.push(v); t[k] = v; return true; } }); return { ctx, log }; };
const sceneFor = (L, over = {}) => ({ W: 360, H: 560, dpr: 1, L, layout: ringLayout(L), rot: [0, 0, 0, 0], alpha: [1, 1, 1], glow: [0, 0, 0], cap: 14, pos: 0, focus: 0, readout: ['A title', 'History · Legend'], motion: true,
  rings: [{ n: 5, labels: ['Satya', 'Treta', 'Dvapara', 'Kali', 'Kalki'], sel: 2, chosen: L >= 1 ? 3 : -1, cur: 2, progress: [0, 0.5, 0, 0, 0] }, { n: L >= 1 ? 5 : 0, labels: ['a', 'b', 'c', 'd', 'e'], sel: 0, chosen: L >= 2 ? 1 : -1, cur: -1, progress: null }], list: { events: [], idx: [], status: () => ({ code: 'open' }) }, ...over });

test('chakra rings: exactly one ring is thick at each level, rings never overlap, and the thick ring is the open one', () => {
  for (let L = 0; L < 3; L++) {
    const lay = ringLayout(L); const th = lay.map((r) => r.outer - r.inner); const thick = th.map((t, i) => [t, i]).sort((a, b) => b[0] - a[0]);
    assert.equal(thick[0][1], L, `level ${L}`); assert.ok(thick[0][0] > 2.5 * thick[1][0], 'clearly thicker');
    for (let i = 0; i < 3; i++) { assert.ok(lay[i].outer > lay[i].inner && lay[i].outer <= 1); if (i) assert.ok(lay[i].outer < lay[i - 1].inner, 'a gap between rings'); }
    assert.ok(coreRadius(lay) > 0.2, 'room for the readout in the middle');
  }
  assert.equal(ringLayout(0)[0].outer, 1);
});

test('chakra rings: segments line up at the top, angles run clockwise, the dial fills the width below the floating bar', () => {
  for (const n of [1, 2, 5, 6]) for (let i = 0; i < n; i++) assert.equal(segAt(0, n, alignRot(i, n)), i, `segment ${i} of ${n} lines up at the top`);
  assert.ok(Math.abs(norm(7 * Math.PI) - Math.PI) < 1e-9 || Math.abs(norm(7 * Math.PI) + Math.PI) < 1e-9);
  assert.ok(Math.abs(thetaOf(0, -10)) < 1e-9 && Math.abs(thetaOf(10, 0) - Math.PI / 2) < 1e-9, 'angles run clockwise from the top');
  const g = dialGeom(360, 680, 56, 0); assert.ok(g.R * 2 >= 360 * 0.95 && g.R * 2 <= 360, 'the dial is as wide as the screen'); assert.ok(g.cy - g.R - 17 >= 56 - 1 || g.cy > 56 + g.R * 0.9, 'it is centred below the bar'); assert.equal(layoutFrom([0.3, 0.085, 0.085])[0].inner, ringLayout(0)[0].inner);
});

test('chakra rings: an event ring pages through any number of events with a bounded window and fades at the bottom', () => {
  const cap = 14; assert.ok(ringCap(170, ringLayout(2)[2]) >= 10 && ringCap(170, ringLayout(2)[2]) <= 16, 'about 14 slots on a phone'); assert.ok(ringCap(1000, ringLayout(2)[2]) <= 24);
  for (const n of [1, 5, 14, 15, 2000]) for (const pos of [0, 3.5, n - 1]) { const p = clampPos(n, cap, pos); const [a, b] = visibleRange(n, cap, p); assert.ok(b - a + 1 <= cap, `${n} events, window ${b - a + 1}`); assert.ok(a >= 0 && b <= n - 1); }
  assert.equal(clampPos(5, cap, 99), 2, 'a short list stays still around the top'); assert.equal(clampPos(2000, cap, -5), 0); assert.equal(clampPos(2000, cap, 5000), 1999);
  assert.deepEqual(visibleRange(2000, cap, 1000), [993, 1006]); assert.equal(nearestSlot(10.4, 2000), 10); assert.equal(nearestSlot(1e9, 2000), 1999);
  assert.equal(slotAngle(10, 10, cap), 0); assert.ok(Math.abs(slotAngle(11, 10, cap) - TAU / cap) < 1e-12);
  assert.equal(slotAlpha(10, 10, cap, 2000), 1); assert.ok(slotAlpha(16, 10, cap, 2000) === 1 && slotAlpha(17, 10, cap, 2000) < 0.01 + 0.5 && slotAlpha(10 + 7, 10, cap, 2000) === 0, 'edge nodes fade out'); assert.equal(slotAlpha(3, 0, cap, 5), 1);
});

test('chakra rings: eras cover every event once, in order, with short unique labels; an event may name its own era', async () => {
  const read = async (y) => JSON.parse(await readFile(new URL(`data/events/${y}.json`, ROOT2), 'utf8')).events;
  for (const y of ['satya', 'treta', 'dvapara', 'kali', 'kalki']) {
    const ev = await read(y); const g = groupEras(ev);
    assert.ok(g.length >= 1 && g.length <= 6, `${y}: ${g.length} eras`); assert.equal(g[0].from, 0); assert.equal(g.at(-1).to, ev.length);
    for (let i = 1; i < g.length; i++) assert.equal(g[i].from, g[i - 1].to, 'contiguous'); assert.equal(g.reduce((a, e) => a + e.count, 0), ev.length);
    for (const e of g) assert.ok(e.label.length > 0 && e.label.length <= 18, `label "${e.label}"`); assert.equal(new Set(g.map((e) => e.label)).size, g.length, 'labels are unique');
  }
  const named = [{ era: 'Maurya' }, { era: 'Maurya' }, { era: 'Gupta' }].map((e, i) => ({ ...e, year: 'Legend', label: 'x' + i })); assert.deepEqual(groupEras(named).map((e) => [e.label, e.count]), [['Maurya', 2], ['Gupta', 1]]);
  assert.deepEqual(groupEras([]), []); assert.equal(groupEras(makeSyn(2000)).length, 6, 'thousands of events still give at most six eras');
  assert.equal(compactYear('Legend'), 'Legend'); assert.equal(compactYear('c. 2600-1900 BCE'), '2600 BCE'); assert.equal(compactYear('c. 4th-5th century CE (debated)'), '4c CE'); assert.equal(compactYear('15 August 1947'), '1947 CE'); assert.equal(compactYear('3102 BCE'), '3102 BCE');
  for (const y of ['Legend', 'c. 2600-1900 BCE', 'c. late 4th-early 3rd century BCE (as reported)', 'c. 5th century CE onward (as reported)']) assert.ok(compactYear(y).length <= 8, compactYear(y));
});
function makeSyn(n) { return Array.from({ length: n }, (_, i) => ({ id: `s${i}`, year: i % 3 ? `${100 + i} CE` : 'Legend', label: `E${i}` })); }

test('chakra rings: drawing is cheap at any level with 2,000 events, shows only a window of nodes, dims locked and marks every status by shape', () => {
  const events = Array.from({ length: 2000 }, (_, i) => ({ id: `e${i}`, label: `Event ${i}`, kind: ['History', 'Tradition', 'Invented'][i % 3], year: i % 2 ? '300 BCE' : 'Legend', level: i % 4 === 0 ? i + 1 : null }));
  const idx = events.map((_, i) => i); let worst = 0, worstT = 0;
  for (const L of [0, 1, 2]) {
    const { ctx, log } = fakeCtx2(); const s = sceneFor(L, { list: { events, idx, status: () => ({ code: 'open' }) }, pos: 1000, focus: 1000 }); const t = performance.now(); const st = drawScene(ctx, s); worstT = Math.max(worstT, performance.now() - t);
    worst = Math.max(worst, log.calls); assert.ok(st.nodes <= 14, `${st.nodes} nodes`); if (L < 2) assert.equal(st.nodes, 0, 'events appear only on the open event ring');
  }
  assert.ok(worst < 1500, `${worst} canvas calls`); assert.ok(worstT < 50, `${worstT.toFixed(1)} ms`);
  const dimmed = (code) => { const { ctx, log } = fakeCtx2(); drawScene(ctx, sceneFor(2, { list: { events: events.slice(0, 5), idx: [0, 1, 2, 3, 4], status: () => ({ code }) }, pos: 2, focus: 2, cap: 14 })); return log.alphas; };
  assert.ok(dimmed('locked').includes(0.5), 'locked nodes are dimmed'); assert.ok(!dimmed('open').includes(0.5), 'open nodes are not'); assert.ok(dimmed('planned').includes(0.7));
  const calls = (code) => { const { ctx, log } = fakeCtx2(); drawScene(ctx, sceneFor(2, { list: { events: events.slice(0, 1), idx: [0], status: () => ({ code }) }, pos: 0, focus: 0 })); return log.calls; };
  assert.equal(new Set(['open', 'done', 'locked', 'planned', 'info'].map(calls)).size >= 4, true, 'each status draws a different shape');
  const lockSrc = (rule2) => rule2; void lockSrc;
});

test('chakra rings: tapping finds the segment, the node or the hub; rotation moves the segments with it', () => {
  const s = sceneFor(0); const { ctx } = fakeCtx2(); drawScene(ctx, s); const R = s.R, cx = s.cx, cy = s.cy;
  const at = (r, th) => [cx + Math.sin(th) * r * R, cy - Math.cos(th) * r * R];
  const mid0 = (s.layout[0].outer + s.layout[0].inner) / 2;
  let h = hitTest(s, ...at(mid0, TAU / 10)); assert.deepEqual([h.kind, h.ring, h.index], ['segment', 0, 0], 'first yuga is just right of the top');
  h = hitTest(s, ...at(mid0, TAU * 0.9)); assert.deepEqual([h.kind, h.ring, h.index], ['segment', 0, 4]);
  s.rot[0] = alignRot(2, 5); h = hitTest(s, ...at(mid0, 0)); assert.equal(h.index, 2, 'after the ring turns, the aligned segment is at the top');
  assert.equal(hitTest(s, cx, cy).kind, 'hub'); assert.equal(hitTest(s, 1, 1).kind, 'none');
  const s1 = sceneFor(1); drawScene(fakeCtx2().ctx, s1); const midEra = (s1.layout[1].outer + s1.layout[1].inner) / 2; h = hitTest(s1, s1.cx + Math.sin(0.3) * midEra * s1.R, s1.cy - Math.cos(0.3) * midEra * s1.R); assert.deepEqual([h.kind, h.ring], ['segment', 1]);
  const midY = (s1.layout[0].outer + s1.layout[0].inner) / 2; h = hitTest(s1, s1.cx, s1.cy - midY * s1.R); assert.deepEqual([h.kind, h.ring], ['segment', 0], 'a closed outer ring can still be tapped to change yuga');
  const evs = [{ id: 'a', label: 'A', kind: 'History', year: 'Legend', level: 1 }, { id: 'b', label: 'B', kind: 'History', year: 'Legend', level: 2 }];
  const s2 = sceneFor(2, { list: { events: evs, idx: [0, 1], status: () => ({ code: 'open' }) }, pos: 0.5, focus: 0, cap: 14 }); drawScene(fakeCtx2().ctx, s2);
  assert.equal(s2.nodes.length, 2); h = hitTest(s2, s2.nodes[1].x + 5, s2.nodes[1].y - 5); assert.deepEqual([h.kind, h.index], ['node', 1]);
  assert.deepEqual(wrapLines('The Churning of the Ocean of Milk and more', 16, 2).length, 2); assert.ok(wrapLines('The Churning of the Ocean of Milk and more', 16, 2)[1].endsWith('…')); assert.deepEqual(wrapLines('Short', 16, 2), ['Short']);
});

test('chakra dial: five yuga arcs, the current one lit with a progress arc, two inner rings that turn (CSS) and stop with reduced motion', () => {
  const svg = dialSvg({ cur: 2, fracs: [0, 0, 0.5, 0, 0] });
  assert.equal((svg.match(/class="dial-seg/g) || []).length, 5); assert.equal((svg.match(/dial-seg on/g) || []).length, 1); assert.equal((svg.match(/class="dial-prog"/g) || []).length, 1);
  assert.match(svg, /dial-r1/); assert.match(svg, /dial-r2/); assert.match(svg, /aria-hidden="true"/); assert.equal((dialSvg({}).match(/dial-seg on/g) || []).length, 0);
  assert.match(dialLabel({ cur: 2, fracs: [0, 0, 0.5, 0, 0], levels: [4, 4, 4, 4, 4] }), /Dvapara Yuga, 2 of 4 levels done/); assert.equal(dialLabel({}), 'Chakra of the yugas');
  assert.match(cssText, /\.dial-r1 \{ animation: dial-cw[^}]*\}/); assert.match(cssText, /\.reduce-motion \*[^}]*animation: none/); assert.match(cssText, /prefers-reduced-motion: reduce\) \{ \* \{[^}]*animation: none/);
  const dials = htmlText.match(/<[^>]*data-dial[^>]*>/g); assert.ok(dials.length >= 8, 'a dial on the chakra, start, picker, pause, settings, win, fail and error screens');
  for (const screen of ['screen-chakra', 'screen-character', 'screen-start', 'screen-pause', 'screen-settings', 'screen-win', 'screen-fail', 'screen-error']) { const a = htmlText.indexOf(`id="${screen}"`); const b = htmlText.indexOf('\n  <div id="screen-', a + 10); assert.ok(htmlText.slice(a, b < 0 ? undefined : b).includes('data-dial'), `${screen} has the dial`); }
});

test('chakra click: a synthesized tick, only when sound is on, never throws without audio', () => {
  const made = []; const node = (k) => ({ connect() {}, start() { made.push(k + ' start'); }, stop() {}, frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} } });
  const ac = { currentTime: 0, state: 'running', destination: {}, createOscillator: () => node('osc'), createGain: () => node('gain') };
  let on = true; const c = createClick({ enabled: () => on, ctxFactory: () => ac });
  assert.equal(c.play(), true); assert.ok(made.includes('osc start')); on = false; made.length = 0; assert.equal(c.play(), false); assert.equal(made.length, 0, 'sound off: nothing plays');
  assert.equal(createClick({ ctxFactory: () => { throw new Error('no audio'); } }).play(), false);
  const src = ['click.js', 'view.js'].map((f) => readFile(new URL(`src/chakra/${f}`, ROOT2), 'utf8')); return Promise.all(src).then(([a]) => assert.ok(!/fetch\(|new Audio|\.mp3|\.ogg|\.wav/.test(a), 'no audio files'));
});

// A fake page for the chakra screen: every element records its listeners, so tests press keys and taps the way a browser would.
function fakePage({ reduced = true, synth = 0, click = null, sound = () => true, progressDone = [] } = {}) {
  const els = {}; const rafq = [];
  const mkEl = (id) => { const h = {}; const el = { id, h, hidden: false, inert: false, textContent: '', innerHTML: '', value: '', dataset: {}, style: {}, attrs: {}, children: [], scrollTop: 0, clientHeight: 300, width: 360, height: 560,
    addEventListener: (t, f) => { (h[t] ||= []).push(f); }, setAttribute(k, v) { this.attrs[k] = String(v); }, getAttribute(k) { return this.attrs[k]; }, removeAttribute(k) { delete this.attrs[k]; },
    classList: { add() {}, remove() {}, toggle() {} }, focus() { doc.activeElement = el; }, click() { (h.click || []).forEach((f) => f({ target: el, preventDefault() {} })); }, closest() { return null; }, querySelector: () => null, querySelectorAll: () => [], isConnected: true,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 360, height: 560 }), matches: () => false, getContext: () => fakeCtx2().ctx, setPointerCapture() {}, replaceChildren() {}, append() {} }; return el; };
  const doc = { hidden: false, activeElement: null, getElementById: (id) => (els[id] ||= mkEl(id)), addEventListener() {}, createElement: () => mkEl('x') };
  const press = (id, key) => (els[id].h.keydown || []).forEach((f) => f({ key, preventDefault() {}, target: els[id] }));
  const prevRO = globalThis.ResizeObserver, prevRAF = globalThis.requestAnimationFrame; globalThis.ResizeObserver = class { observe() {} }; globalThis.requestAnimationFrame = (f) => { rafq.push(f); return rafq.length; };
  const plays = { n: 0 }; const clicker = click || { play() { plays.n++; return true; } };
  const read = async (p) => JSON.parse(await readFile(new URL(p, ROOT2), 'utf8'));
  const store = createEventStore({ synth, fetchFn: async (url) => { try { const j = await read(url); return { ok: true, status: 200, json: async () => j }; } catch { return { ok: false, status: 404 }; } } });
  const played = []; const chakra = createChakra({ doc, store, getProgress: () => ({ completed: Object.fromEntries(progressDone.map((m) => [m, { best: 1 }])) }), reach: { getReachCounts: async () => null }, reducedMotion: () => reduced, onPlay: (e) => played.push(e), click: clicker, soundOn: sound });
  const frame = (ms) => { const cbs = rafq.splice(0); for (const f of cbs) f(performance.now() + ms); };
  let vt = null; const run = (sec) => { vt ??= performance.now(); for (let k = 0, n = Math.round(sec * 60); k < n; k++) { vt += 1000 / 60; const cbs = rafq.splice(0); for (const f of cbs) f(vt); } }; // a virtual 60 Hz clock
  return { els, press, chakra, plays, played, frame, run, rafq, doc, restore() { globalThis.ResizeObserver = prevRO; globalThis.requestAnimationFrame = prevRAF; } };
}

test('chakra view: rings open and close like a vault (instant with reduced motion), Enter opens, Escape and Back close, and the hierarchy is a list too', async () => {
  const p = fakePage({ reduced: true });
  try {
    await p.chakra.open(); let st = p.chakra._state(); assert.equal(st.level, 0); assert.equal(p.els['screen-chakra'].dataset.level, '0');
    assert.match(p.els['ch-items'].innerHTML, /Satya[\s\S]*Treta[\s\S]*Dvapara[\s\S]*Kali[\s\S]*Kalki/, 'yugas as a plain list'); assert.match(p.els['ch-items'].innerHTML, /here/, 'the current yuga is marked in words');
    p.press('ch-stage', 'ArrowRight'); assert.match(p.els['ch-live'].textContent, /Kali Yuga, 4 of 5/, 'arrow keys move between segments and announce'); // the current yuga is Dvapara (3 of 5)
    p.press('ch-stage', 'Enter'); await new Promise((r) => setTimeout(r, 30)); st = p.chakra._state();
    assert.equal(st.level, 1); assert.equal(st.yuga, 3); assert.equal(st.eras, 5); assert.equal(st.anim, false, 'reduced motion: no animation'); assert.equal(p.els['screen-chakra'].dataset.level, '1');
    assert.match(p.els['ch-items'].innerHTML, /3102/, 'eras as a plain list'); assert.equal(p.els['ch-back'].hidden, false); assert.equal(p.els['ch-path'].textContent, 'Kali');
    p.press('ch-stage', 'Enter'); st = p.chakra._state(); assert.equal(st.level, 2); assert.equal(st.ring, 5, 'first era of Kali has five events'); assert.match(p.els['ch-path'].textContent, /Kali .* 3102/);
    p.press('ch-stage', 'ArrowRight'); assert.equal(p.chakra._state().focus, 1);
    p.press('ch-stage', 'Enter'); assert.equal(p.els['ch-card'].hidden, false, 'Enter on an event opens its card'); assert.equal(p.els['ch-card-title'].textContent, 'The Buddha'); assert.match(p.els['ch-card-meta'].textContent, /^(History|Tradition|Invented) · /);
    p.els['screen-chakra'].h.keydown.forEach((f) => f({ key: 'Escape', preventDefault() {} })); assert.equal(p.els['ch-card'].hidden, true, 'Escape closes the card first'); assert.equal(p.chakra._state().level, 2);
    p.els['screen-chakra'].h.keydown.forEach((f) => f({ key: 'Escape', preventDefault() {} })); assert.equal(p.chakra._state().level, 1, 'Escape closes a ring');
    p.els['ch-back'].click(); st = p.chakra._state(); assert.equal(st.level, 0, 'Back closes the next one'); p.els['screen-chakra'].h.keydown.forEach((f) => f({ key: 'Escape', preventDefault() {} })); assert.equal(p.chakra._state().level, 0, 'nothing below the top');
    p.chakra._go.openYuga(2); await new Promise((r) => setTimeout(r, 30)); assert.equal(p.chakra._state().level, 1); assert.equal(p.chakra._state().yuga, 2);
  } finally { p.restore(); }
});

test('chakra view: locked events are named locked, show a card with a disabled Play, and the reached line stays "Be among the first"', async () => {
  const p = fakePage({ reduced: true });
  try {
    await p.chakra.open(); p.chakra._go.openYuga(3); await new Promise((r) => setTimeout(r, 30));
    const era = p.chakra._state(); const kali = JSON.parse(await readFile(new URL('data/events/kali.json', ROOT2), 'utf8')).events.sort((a, b) => a.order - b.order);
    const target = kali.findIndex((e) => e.id === 'kal-l14'); let eraIdx = 0; const eras = groupEras(kali); eras.forEach((g, i) => { if (target >= g.from && target < g.to) eraIdx = i; });
    p.chakra._go.openEra(eraIdx); const local = target - eras[eraIdx].from; assert.equal(p.chakra._state().level, 2);
    p.chakra._go.setFocus(local, { announce: false }); p.press('ch-stage', 'Enter'); await new Promise((r) => setTimeout(r, 20));
    assert.equal(p.els['ch-card-title'].textContent, 'The Night Report of Pataliputra'); assert.match(p.els['ch-card-status'].innerHTML, /Locked: finish Escape from Hastinapur first/);
    assert.equal(p.els['ch-play'].attrs['aria-disabled'], 'true'); p.els['ch-play'].click(); assert.equal(p.played.length, 0, 'a locked Play does nothing'); assert.match(p.els['ch-live'].textContent, /Locked/);
    assert.equal(p.els['ch-card-reach'].textContent, 'Be among the first'); assert.ok(p.els['ch-card-intro'].textContent.length > 20); assert.match(p.els['ch-card-meta'].textContent, /^Tradition|^Invented|^History/);
    assert.ok(/-webkit-line-clamp:\s*2/.test(rule('.ch-intro')), 'the card intro is cut at two lines');
  } finally { p.restore(); }
  const q = fakePage({ reduced: true, progressDone: ['dvapara-escape'] });
  try { await q.chakra.open(); q.chakra._go.openYuga(3); await new Promise((r) => setTimeout(r, 30)); q.chakra._go.openEra(1); q.chakra._go.setFocus(0, { announce: false }); q.press('ch-stage', 'Enter'); const open = q.els['ch-play'].attrs['aria-disabled']; void open; } finally { q.restore(); }
});

test('chakra view: thousands of events page by rotation, with Prev and Next, Page keys, the list, and clamping at both ends', async () => {
  const p = fakePage({ reduced: true, synth: 2000 });
  try {
    await p.chakra.open(); p.chakra._go.openYuga(3); await new Promise((r) => setTimeout(r, 40)); const eras = p.chakra._state().eras; assert.ok(eras <= 6);
    p.chakra._go.openEra(0); let st = p.chakra._state(); assert.ok(st.ring > st.cap, `${st.ring} events on a ring of ${st.cap} slots`);
    assert.ok(st.rows <= 16, `only the visible list rows exist (${st.rows})`);
    p.els['ch-next'].click(); st = p.chakra._state(); assert.equal(st.focus, Math.floor(st.cap / 2), 'Next turns the ring by half a ring');
    p.els['ch-prev'].click(); p.els['ch-prev'].click(); assert.equal(p.chakra._state().focus, 0, 'clamped at the start');
    p.press('ch-stage', 'PageDown'); assert.equal(p.chakra._state().focus, Math.floor(st.cap / 2)); p.press('ch-stage', 'End'); st = p.chakra._state(); assert.equal(st.focus, st.ring - 1, 'End goes to the last event'); assert.ok(p.chakra._state().pos >= st.ring - 2);
    p.press('ch-stage', 'ArrowRight'); assert.equal(p.chakra._state().focus, st.ring - 1, 'clamped at the end'); p.press('ch-stage', 'Home'); assert.equal(p.chakra._state().focus, 0);
    assert.match(p.els['ch-count'].textContent, /\d+ events/); assert.ok(p.chakra._state().rows <= 16);
  } finally { p.restore(); }
});

test('chakra view: a ring turn is spring-driven, swells, locks once with a clunk, can be interrupted and reversed without a jump, and sound off is silent', async () => {
  const n = { play: 0, swell: 0 }; const p = fakePage({ reduced: false, click: { play() { n.play++; return true; }, swell() { n.swell++; return true; } } });
  try {
    await p.chakra.open(); p.run(0.1); const idle0 = p.chakra._state().idle.slice(); p.run(1); const idle1 = p.chakra._state().idle;
    assert.ok(idle1[0] !== idle0[0] && idle1[1] !== idle0[1], 'the rings turn slowly on their own'); assert.ok(Math.sign(idle1[0] - idle0[0]) !== Math.sign(idle1[1] - idle0[1]), 'in opposite directions');
    p.chakra._go.openYuga(0); await new Promise((r) => setTimeout(r, 30)); assert.equal(p.chakra._state().anim, true, 'a turn is under way'); assert.equal(n.play, 0, 'the clunk comes at the lock, not the start'); assert.equal(n.swell, 1, 'the swell starts with the turn'); assert.equal(p.els['ch-cue'].textContent, '[Deep swell]', 'and has a caption');
    const th = [], rot = []; for (let i = 0; i < 180; i++) { p.run(1 / 60); const st = p.chakra._state(); th.push(st.th[1]); rot.push(st.idle[1]); }
    for (let i = 1; i < th.length; i++) { assert.ok(Math.abs(th[i] - th[i - 1]) < 0.02, `ring thickness steps ${th[i] - th[i - 1]} at frame ${i}`); const d1 = norm(rot[i] - rot[i - 1]); assert.ok(Math.abs(d1) < 0.4, `ring turn steps at frame ${i}`); if (i > 1) assert.ok(Math.abs(d1 - norm(rot[i - 1] - rot[i - 2])) < 0.09, `ring turn speed jumps at frame ${i}`); }
    assert.ok(th[10] > th[0] && th[179] > 0.29, 'the opened ring grows to full thickness'); assert.equal(p.chakra._state().anim, false); assert.equal(p.chakra._state().level, 1); assert.equal(n.play, 1, 'one clunk when the rings lock'); assert.equal(p.els['ch-cue'].textContent, '[Clunk]');
    assert.equal(p.chakra._state().idle[1], 0, 'the opened ring comes to rest exactly at zero, locked'); assert.equal(p.chakra._state().th[1], 0.3);
    // interrupt: open an era, then go back 0.25 s in. The thickness must carry on from where it was (no jump), then reverse and settle.
    p.chakra._go.openEra(0); p.run(0.25); const mid = p.chakra._state(); assert.equal(mid.anim, true); assert.ok(mid.th[2] > 0.09 && mid.th[2] < 0.3, `mid-turn thickness ${mid.th[2]}`);
    p.chakra._go.closeRing(); p.run(1 / 60); const after = p.chakra._state(); assert.ok(Math.abs(after.th[2] - mid.th[2]) < 0.02, 'reversing mid-turn does not jump'); assert.ok(Math.abs(after.th[1] - mid.th[1]) < 0.02);
    p.run(3); const end = p.chakra._state(); assert.equal(end.level, 1); assert.equal(end.anim, false); assert.equal(end.th[1], 0.3); assert.equal(end.th[2], 0.085); assert.ok(n.play >= 2 && n.play <= 3, `clunks ${n.play}`); assert.equal(end.bloom, 0);
    p.doc.hidden = true; p.run(0.1); assert.equal(p.rafq.length, 0, 'no frames are scheduled while the tab is hidden');
  } finally { p.restore(); }
  const q = fakePage({ reduced: false, sound: () => false, click: { play() { n.play += 100; return true; }, swell() { n.swell += 100; return true; } } });
  try { await q.chakra.open(); q.chakra._go.openYuga(1); await new Promise((r) => setTimeout(r, 30)); q.run(2); assert.ok(n.play < 100 && n.swell < 100, 'sound off: no click and no swell'); assert.ok(!q.els['ch-cue']?.textContent, 'and no caption for a sound that did not play'); } finally { q.restore(); }
  const r = fakePage({ reduced: true });
  try { await r.chakra.open(); r.run(2); assert.deepEqual(r.chakra._state().idle, [0, 0, 0, 0], 'reduced motion: no idle turning at all'); r.chakra._go.openYuga(1); await new Promise((x) => setTimeout(x, 30)); assert.equal(r.chakra._state().anim, false); assert.equal(r.chakra._state().th[1], 0.3, 'and the change is instant'); } finally { r.restore(); }
});

test('chakra view: the keyboard focus ring is drawn on the dial only while the keyboard is in use, never after a tap', async () => {
  const p = fakePage({ reduced: true });
  try {
    await p.chakra.open(); p.doc.documentElement = { dataset: {} }; p.els['ch-stage'].focus();
    assert.equal(p.chakra._state().kbdRing, false, 'focused by script, no key pressed: no ring'); p.doc.documentElement.dataset.input = 'pointer'; assert.equal(p.chakra._state().kbdRing, false, 'after a tap: no ring');
    p.doc.documentElement.dataset.input = 'kbd'; assert.equal(p.chakra._state().kbdRing, true, 'keyboard in use and the dial focused: ring'); p.doc.activeElement = null; assert.equal(p.chakra._state().kbdRing, false, 'dial not focused: no ring');
  } finally { p.restore(); }
  const ops = []; const ctx = new Proxy({}, { get: (t, k) => (k in t ? t[k] : (...a) => { ops.push(k); return k === 'createRadialGradient' ? { addColorStop() {} } : k === 'measureText' ? { width: 10 } : undefined; }), set: (t, k, v) => { t[k] = v; return true; } });
  const base = () => ({ W: 360, H: 680, dpr: 1, top: 56, layout: ringLayout(0), rot: [0, 0, 0, 0], alpha: [1, 0, 0], glow: [1, 0, 0], L: 0, pos: 0, cap: 14, focus: 0, rings: [{ n: 5, labels: ['a', 'b', 'c', 'd', 'e'], sel: 1, chosen: -1, cur: -1, progress: null }, { n: 0 }], list: { events: [], idx: [], status: () => ({}) } });
  const count = (kbd) => { ops.length = 0; drawScene(ctx, { ...base(), kbd }); return ops.length; };
  assert.ok(count(true) > count(false), 'the halo strokes are extra work, drawn only with kbd on');
});

test('chakra motion: springs keep position and velocity continuous through a retarget, settle exactly, and are stable at any frame time', async () => {
  const S = await import('../chakra/spring.js');
  for (const z of [1, 0.8, 0.5]) {
    const s = S.spring(0, 1); s.v = 3; let px = s.x, pv = s.v, maxDx = 0, maxDv = 0;
    for (let i = 0; i < 360; i++) { if (i === 100) S.retarget(s, -2); const vBefore = s.v, xBefore = s.x; S.step(s, 1 / 60, 6, z); maxDx = Math.max(maxDx, Math.abs(s.x - xBefore)); maxDv = Math.max(maxDv, Math.abs(s.v - vBefore)); if (i === 100) { assert.ok(Math.abs(s.x - xBefore) < 0.1, 'retarget does not move the position'); assert.ok(Math.abs(s.v - vBefore) < 2, 'retarget does not jump the velocity'); } px = s.x; pv = s.v; }
    assert.ok(maxDx < 0.2 && maxDv < 2.5, `zeta ${z}: step ${maxDx}, velocity step ${maxDv}`); assert.ok(Math.abs(px + 2) < 1e-3 && Math.abs(pv) < 1e-3, 'comes to rest on the target'); void pv;
  }
  const a = S.spring(0, 1), b = S.spring(0, 1); S.step(a, 0.5, 6, 0.8); for (let i = 0; i < 50; i++) S.step(b, 0.01, 6, 0.8); assert.ok(Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.v - b.v) < 1e-9, 'one long step equals many short ones');
  const c = S.spring(0, 1); S.step(c, 5, 6, 1); assert.ok(Number.isFinite(c.x) && Math.abs(c.x - 1) < 1e-6, 'a 5 s frame (tab was hidden) does not explode');
  const o = S.spring(0, 1); let peak = 0; for (let i = 0; i < 300; i++) { S.step(o, 1 / 60, 5, 0.8); peak = Math.max(peak, o.x); } assert.ok(peak > 1.001 && peak < 1.05, `a soft settle overshoots a little (${peak})`);
  const k = S.spring(0, 1); peak = 0; for (let i = 0; i < 300; i++) { S.step(k, 1 / 60, 6, 1); peak = Math.max(peak, k.x); } assert.ok(peak <= 1 + 1e-9, 'critical damping never overshoots');
  assert.equal(S.bloomEase(0), 0); assert.ok(Math.abs(S.bloomEase(1) - 1) < 1e-12); assert.equal(S.smooth(0), 0); assert.equal(S.smooth(1), 1);
  const P = S.createParticles(28); for (let i = 0; i < 100; i++) S.emit(P, 10, 10, 1, 0); assert.equal(P.life.filter((v) => v > 0).length, 28, 'the pool is fixed at 28'); for (let i = 0; i < 200; i++) S.stepParticles(P, 1 / 60); assert.equal(P.life.filter((v) => v > 0).length, 0, 'every particle fades out');
});

test('chakra sound: the swell is synthesized, one at a time, silent with sound off, and tolerates no audio', async () => {
  const { createClick } = await import('../chakra/click.js'); const made = []; let t = 0;
  const node = (n) => new Proxy({ frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} } }, { get: (o, k) => (k in o ? o[k] : (...a) => { if (k === 'start') made.push(n); }), set: (o, k, v) => { o[k] = v; return true; } });
  const ac = { get currentTime() { return t; }, state: 'running', destination: {}, createOscillator: () => node('osc'), createGain: () => node('gain'), createBiquadFilter: () => node('filter') };
  let on = true; const c = createClick({ enabled: () => on, ctxFactory: () => ac });
  assert.equal(c.swell(), true); assert.ok(made.includes('osc')); assert.equal(c.swell(), false, 'a second swell does not stack on the first'); t = 5; assert.equal(c.swell(), true, 'and one can follow once it is over');
  on = false; assert.equal(c.swell(), false); assert.equal(createClick({ ctxFactory: () => { throw new Error('no audio'); } }).swell(), false);
});

test('focus: no boxy outline after a tap. Rings show only for the keyboard, follow the control shape, and the dial draws its own', async () => {
  const { initModality, usingKeyboard } = await import('../modality.js'); const lis = {}; const root = { dataset: {} }; const doc = { documentElement: root, addEventListener: (t, f) => { (lis[t] ||= []).push(f); } };
  initModality(doc); assert.equal(usingKeyboard(doc), false, 'nothing is shown before a key press'); lis.keydown[0]({ key: 'Shift' }); assert.equal(usingKeyboard(doc), false, 'a modifier alone is not keyboard use');
  lis.keydown[0]({ key: 'Tab' }); assert.equal(root.dataset.input, 'kbd'); lis.pointerdown[0]({}); assert.equal(root.dataset.input, 'pointer', 'a tap or click hides rings'); lis.touchstart[0]({}); assert.equal(root.dataset.input, 'pointer');
  const css = cssText; assert.ok(!/(^|\n):focus-visible \{/.test(css), 'the global ring is only for html[data-input="kbd"]'); assert.match(css, /html\[data-input="kbd"\] :focus-visible/); assert.match(css, /html:not\(\[data-input="kbd"\]\) :focus-visible \{ outline: none/);
  assert.match(rule('.ch-stage'), /outline: none/); assert.ok(/\.ch-stage:focus,[^{]*\{ outline: none/.test(css) || /\.ch-stage:focus-visible \{ outline: none/.test(css), 'no box around the dial'); assert.ok(!/\.ch-stage:focus-visible \{ outline: 3px/.test(css));
  assert.match(css, /#ch-card-title:focus \{ outline: none/); assert.match(css, /html\[data-input="kbd"\] #ch-card-title:focus \{[^}]*border-radius/); assert.match(css, /-webkit-tap-highlight-color: transparent/);
  assert.match(htmlText, /src\/main\.js/); const main = await readFile(new URL('src/main.js', ROOT2), 'utf8'); assert.match(main, /initModality\(/);
});

test('chakra screen: no zoom, pan or pinch is left anywhere, controls are 44 px, and the page fills with the wheel', async () => {
  const view = await readFile(new URL('src/chakra/view.js', ROOT2), 'utf8'); const scene = await readFile(new URL('src/chakra/scene.js', ROOT2), 'utf8');
  for (const gone of ['zoomAt', 'ZOOM_STEP', 'cameraWhole', 'cameraYuga', 'ch-zoom', 'id="ch-in"', 'id="ch-out"', 'introT', "addEventListener('wheel'", 'pinch =', 'setTarget', 'clampCamera']) { assert.ok(!view.includes(gone) && !scene.includes(gone) && !htmlText.includes(gone), `${gone} is gone`); }
  assert.ok(!/\bch-whole\b|Whole wheel|Zoom in|Zoom out/.test(htmlText), 'no zoom buttons or slider');
  for (const id of ['ch-back', 'ch-prev', 'ch-next', 'ch-list-btn', 'ch-continue']) assert.match(htmlText, new RegExp(`id="${id}"`));
  for (const id of ['ch-back', 'ch-prev', 'ch-next']) assert.match(htmlText.match(new RegExp(`<button id="${id}"[^>]*>`))[0], /aria-label="[^"]+"/);
  assert.match(htmlText, /id="ch-list-btn"[^>]*aria-expanded="false"/); assert.match(htmlText, /role="group" aria-label="Chakra, ring 1 of 3, Yugas" aria-describedby="ch-help"/);
  assert.match(rule('.ch-stage'), /position:\s*absolute;\s*inset:\s*0/); assert.match(rule('.ch-stage-wrap'), /position:\s*relative/);
  assert.ok(/\.ch-stage canvas \{[^}]*width: 100%; height: 100%/.test(cssText));
  assert.ok(!/animation/.test(cssText.slice(cssText.indexOf('/* ---------- Chakra home'))), 'no CSS animation in the chakra screen');
  assert.ok(!view.includes('prompt(') && !/https?:\/\//.test(view), 'no network call to a third party');
});

test('camera reset: an eased 0.35 s swing behind the hero (instant under reduced motion), cancelled by look input, continuous in position and speed', async () => {
  const C = await import('../camera.js'); const T = C.TPCAM;
  const o = C.createOrbit(); o.yaw = 0; o.pitch = 0.35; const facing = 2.0; const yaws = [];
  C.updateOrbit(o, 1 / 60, { dx: 0, dy: 0, key: 0, reset: true }, { mx: 0, my: 0 }, false, T, { facing });
  yaws.push(o.yaw); let t = 1 / 60; while (t < 0.5) { C.updateOrbit(o, 1 / 60, { dx: 0, dy: 0, key: 0 }, { mx: 0, my: 0 }, false, T, { facing }); yaws.push(o.yaw); t += 1 / 60; }
  assert.ok(Math.abs(C.angleDelta(o.yaw, facing)) < 1e-9 && Math.abs(o.pitch - T.pitch) < 1e-9 && o.swing === null, 'ends exactly behind the hero at the default pitch');
  const at = (sec) => yaws[Math.round(sec * 60) - 1]; assert.ok(Math.abs(C.angleDelta(at(0.2), facing)) > 0.05 && Math.abs(C.angleDelta(at(0.2), facing)) < 1.9, 'a swing, not a jump'); assert.ok(Math.abs(at(0.35) - facing) < 0.02, 'done in about 0.35 s');
  const d = yaws.map((y, i) => (i ? y - yaws[i - 1] : 0)); assert.ok(Math.max(...d.map(Math.abs)) < 0.25, 'no single-frame jump'); for (let i = 3; i < 20; i++) assert.ok(Math.abs(d[i] - d[i - 1]) < 0.09, 'the speed changes smoothly (no sudden start or stop)'); assert.ok(d[1] < d[8] && d[1] >= 0, 'it eases in');
  const r = C.createOrbit(); r.yaw = 0; C.updateOrbit(r, 1 / 60, { dx: 0, dy: 0, key: 0, reset: true }, { mx: 0, my: 0 }, true, T, { facing }); assert.equal(r.yaw, facing, 'reduced motion: an instant snap'); assert.equal(r.swing, null);
  const x = C.createOrbit(); x.yaw = 0; C.updateOrbit(x, 1 / 60, { reset: true }, { mx: 0, my: 0 }, false, T, { facing }); assert.ok(x.swing); C.updateOrbit(x, 1 / 60, { dx: 10, dy: 0, key: 0 }, { mx: 0, my: 0 }, false, T, { facing }); assert.equal(x.swing, null, 'a look drag takes over');
  assert.deepEqual(C.CAMERA_RESET_KEYS, ['KeyG', 'Home'], 'C stays Crouch');
});

test('auto-centre: after about a second of running forward with no look input the camera drifts behind the hero, smoothly; off, looking, or reduced motion stop it', async () => {
  const C = await import('../camera.js'); const T = C.TPCAM; const fwd = { mx: 0, my: -1 }; const run = (o, secs, look, ext, reduced = false, mv = fwd) => { for (let i = 0; i < secs * 60; i++) C.updateOrbit(o, 1 / 60, look || { dx: 0, dy: 0, key: 0 }, mv, reduced, T, ext); return o; };
  const o = C.createOrbit(); o.yaw = 0; run(o, 1, null, { facing: 0.6, autoCentre: true }); assert.equal(o.yaw, 0, 'nothing in the first second');
  const o2 = C.createOrbit(); o2.yaw = 0; let prev = 0, maxStep = 0; for (let i = 0; i < 360; i++) { C.updateOrbit(o2, 1 / 60, { dx: 0, dy: 0, key: 0 }, fwd, false, T, { facing: 0.6, autoCentre: true }); maxStep = Math.max(maxStep, Math.abs(o2.yaw - prev)); assert.ok(o2.yaw >= prev - 1e-12, 'only ever towards the hero'); prev = o2.yaw; }
  assert.ok(Math.abs(o2.yaw - 0.6) < 0.05, `drifts back (${o2.yaw})`); assert.ok(maxStep < 0.02, `gentle (${maxStep} rad per frame)`);
  const off = C.createOrbit(); off.yaw = 0; run(off, 5, null, { facing: 0.6, autoCentre: false }); assert.equal(off.yaw, 0, 'the setting turns it off');
  const rm = C.createOrbit(); rm.yaw = 0; run(rm, 5, null, { facing: 0.6, autoCentre: true }, true); assert.equal(rm.yaw, 0, 'reduced motion: the camera stays where the player put it');
  const lk = C.createOrbit(); lk.yaw = 0; run(lk, 3, null, { facing: 0.6, autoCentre: true }); const y1 = lk.yaw; C.updateOrbit(lk, 1 / 60, { dx: 1, dy: 0, key: 0 }, fwd, false, T, { facing: 0.6, autoCentre: true }); assert.equal(lk.fwdT, 0, 'look input restarts the wait'); assert.ok(y1 > 0);
  const still = C.createOrbit(); still.yaw = 0; run(still, 5, null, { facing: 0.6, autoCentre: true }, false, { mx: 0, my: 0 }); assert.equal(still.yaw, 0, 'standing still does not move the camera');
  assert.equal(loadSettings(null, { matchMedia: () => ({ matches: false }), document: null }).autoCentre, true, 'Auto-centre camera is on by default'); assert.equal(loadSettings({ getItem: () => '{"autoCentre":false}' }, { matchMedia: () => ({ matches: false }), document: null }).autoCentre, false);
  for (const id of ['set-centre']) assert.match(htmlText, new RegExp(`<input id="${id}" type="checkbox" checked><label for="${id}">Auto-centre camera</label>`));
  assert.match(await readFile(new URL('src/screens.js', ROOT2), 'utf8'), /autoCentre: \$\('set-centre'\)/);
});

test('third-person camera tuning: the hero is clearly visible, closer than before, also with a wall behind or beside, at every pitch, in portrait and landscape', async () => {
  const C = await import('../camera.js'); const T = C.TPCAM; const hero = { x: 500, y: 500 };
  assert.ok(T.distance <= 190 && T.height <= 70, 'tuned close (it was 250 back and 105 up)'); assert.ok(T.pitchMin >= -0.2 && T.pitchMax <= 0.45, 'pitch limits keep the camera off the ground and off the sky');
  const cases = { open: null, 'wall behind': (x) => x < 495, 'wall behind, everywhere': () => true, 'wall to the right': (x, z) => z > 515, 'wall to the left': (x, z) => z < 485, corridor: (x, z) => Math.abs(z - 500) > 30 };
  for (const [name, blocked] of Object.entries(cases)) for (const pitch of [T.pitchMin, T.pitch, T.pitchMax]) for (const yaw of [0, 1.1, -2.4]) {
    const o = C.createOrbit(); o.yaw = yaw; o.pitch = pitch; const rotated = blocked && ((x, z) => { const dx = x - 500, dz = z - 500; const c = Math.cos(-yaw), s = Math.sin(-yaw); return blocked(500 + dx * c - dz * s, 500 + dx * s + dz * c); });
    const v = C.thirdPersonView(hero, o, 0.016, rotated, true);
    for (const [fov, aspect, label] of [[62, 360 / 740, 'portrait'], [46, 1280 / 800, 'landscape']]) { const f = C.heroFraming(v, hero, fov, aspect);
      assert.ok(Math.abs(f.x) < 0.7 && Math.abs(f.y) < 0.95, `${name} pitch ${pitch} yaw ${yaw} ${label}: hero at ${f.x.toFixed(2)}, ${f.y.toFixed(2)}`); assert.ok(f.size >= 0.25 && f.size <= 1.05, `${name} ${label}: hero is ${(f.size * 100).toFixed(0)}% of the screen height`); }
    assert.ok(v.position.y < 140, `${name}: the camera never climbs far above the hero (${v.position.y.toFixed(0)})`); assert.ok(o.dist >= T.minDistance - 1e-9, 'never closer than the minimum');
  }
  const o = C.createOrbit(); o.yaw = 0; C.thirdPersonView(hero, o, 0.016, (x, z) => z > 515, true); assert.ok(o.side < T.shoulder, 'a wall at the shoulder slides the camera over instead of collapsing the boom'); assert.equal(o.dist, T.distance);
  const w = C.createOrbit(); w.yaw = 0; C.thirdPersonView(hero, w, 0.016, () => true, true); assert.equal(w.dist, T.minDistance, 'spawning against a wall: the boom stops at the minimum, it does not vanish');
  const e = C.createOrbit(); e.yaw = 0; C.thirdPersonView(hero, e, 0.016, (x) => x < 495, true); let last = e.dist; for (let i = 0; i < 120; i++) { C.thirdPersonView(hero, e, 1 / 60, null, false); assert.ok(e.dist >= last - 1e-9 && e.dist - last < 6, 'the boom eases back out without popping'); last = e.dist; } assert.ok(e.dist > T.distance - 3);
});

test('camera reset controls: keys G and Home, the round button and the Button-controls button all fire one reset; C is still Crouch', () => withWindow((wl) => {
  const mkBtn = (control) => { const b = mkPointerEl(); b.dataset = { control }; return b; }; const reset1 = mkBtn('camreset'), reset2 = mkBtn('camreset'), crouch = mkBtn('crouch');
  const input = createInput({ stage: mkPointerEl(), buttons: [reset1, reset2, crouch], onPause() {} }); input.state.enabled = true; input.state.cameraLook = true;
  const key = (code, repeat = false) => wl.keydown.forEach((f) => f({ code, repeat, defaultPrevented: false, target: { tagName: 'BODY' }, preventDefault() {} }));
  assert.equal(input.read().look.reset, false); key('KeyG'); assert.equal(input.read().look.reset, true, 'G'); assert.equal(input.read().look.reset, false, 'one press, one reset'); key('Home'); assert.equal(input.read().look.reset, true, 'Home'); key('KeyG', true); assert.equal(input.read().look.reset, false, 'holding the key does not repeat');
  fire(reset1, 'pointerdown', {}); assert.equal(input.read().look.reset, true, 'the round button'); fire(reset2, 'pointerdown', {}); assert.equal(input.read().look.reset, true, 'the Button-controls button');
  key('KeyC'); const a = input.read(); assert.equal(a.action.crouch, true, 'C still crouches'); assert.equal(a.look.reset, false);
  input.state.enabled = false; key('KeyG'); input.state.enabled = true; assert.equal(input.read().look.reset, false, 'not while paused');
  assert.match(htmlText, /id="cam-reset"[^>]*aria-label="Reset camera behind you \(G\)"/); assert.ok((htmlText.match(/data-control="camreset"/g) || []).length === 2, 'one round button and one in the Button-controls cluster');
  assert.match(cssText, /\.cam-reset \{[^}]*bottom:/); assert.match(cssText, /data-controls="buttons"\]\)? \.cam-reset|:not\(\[data-controls="buttons"\]\) \.cam-reset/);
}));

test('prop HUD: prompt, held chip, Throw/Drop only while held, Block unavailable with two hands, keys T and H, prop minimap icons', async () => {
  const mkBtn = (control) => ({ dataset: { control }, hidden: true, attrs: {}, classList: { toggle(c, on) { this.on = on; }, add() {}, remove() {} }, setAttribute(k, v) { this.attrs[k] = v; } });
  const btns = ['attack', 'block', 'do', 'swap', 'throw', 'drop'].map(mkBtn); const by = Object.fromEntries(btns.map((b) => [b.dataset.control, b]));
  const mkEl = () => ({ hidden: true, textContent: '', dataset: {}, style: {}, classList: { toggle() {}, add() {}, remove() {} }, setAttribute() {}, replaceChildren() {}, append() {} });
  const els = {}; const doc = { getElementById: (id) => (els[id] ||= mkEl()), createElement: mkEl, querySelector: (q) => btns.find((b) => q.includes(`"${b.dataset.control}"`)) || null, querySelectorAll: (q) => btns.filter((b) => q.includes(`"${b.dataset.control}"`)) };
  let now = 0; const hud = createHud(doc, { now: () => now });
  hud.setAbilities({ abilities: ['walk', 'staff', 'sword'], weapon: 'staff' }); assert.equal(by.swap.hidden, false); assert.equal(by.throw.hidden, true); assert.equal(by.drop.hidden, true);
  hud.setProps({ hud: { prompt: 'Take club' }, player: { held: null } }); assert.equal(els['prop-prompt'].hidden, false); assert.equal(els['prop-prompt-text'].textContent, 'Take club'); assert.match(by.do.attrs['aria-label'], /^Take club/); assert.ok(els['prop-prompt-text'].textContent.split(' ').length <= 3);
  const held = { id: 'p1', name: 'Club', durability: 0.7, crack: 1, canThrow: false, twoHands: true };
  now += 5; hud.setProps({ hud: { prompt: '' }, player: { held } });
  assert.equal(els['stat-held'].hidden, false); assert.equal(els['held-fill'].style.width, '70%'); assert.match(els['held-name'].textContent, /Club: Cracked/); assert.equal(els['prop-prompt'].hidden, true);
  assert.equal(by.drop.hidden, false); assert.equal(by.throw.hidden, true, 'Throw only if it can be thrown'); assert.equal(by.swap.hidden, true, 'Drop takes the Swap slot');
  assert.equal(by.block.attrs['aria-disabled'], 'true'); assert.match(by.block.attrs['aria-label'], /unavailable/);
  now += 5; hud.setProps({ hud: { prompt: '' }, player: { held: { ...held, canThrow: true, twoHands: false } } }); assert.equal(by.throw.hidden, false); assert.equal(by.block.attrs['aria-disabled'], 'false');
  now += 5; hud.setProps({ hud: { prompt: '' }, player: { held: null } }); assert.equal(by.drop.hidden, true); assert.equal(by.throw.hidden, true); assert.equal(by.swap.hidden, false); assert.equal(els['stat-held'].hidden, true);
  const { ACTION_NAMES } = await import('../input.js'); assert.ok(ACTION_NAMES.includes('throw') && ACTION_NAMES.includes('drop'));
  const inSrc = await readFile(new URL('src/input.js', ROOT2), 'utf8'); assert.match(inSrc, /KeyT: 'throw', KeyH: 'drop'/);
  const mm = await readFile(new URL('src/minimap.js', ROOT2), 'utf8'); assert.match(mm, /frame\.props/);
  for (const c of ['throw', 'drop']) assert.match(htmlText, new RegExp(`data-control="${c}" aria-label="[A-Z][a-z]+ \\(${c === 'throw' ? 'T' : 'H'}\\)" hidden`));
  assert.match(htmlText, /id="stat-held"/); assert.match(htmlText, /id="prop-prompt"/);
});

for (const run of queue) await run(); // run in order, awaiting async tests
for (const [s, n, m] of results) console.log(`${s === 'ok' ? 'PASS' : 'FAIL'}  ${n}${m ? `\n      ${m}` : ''}`);
const failed = results.filter((r) => r[0] === 'FAIL').length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
