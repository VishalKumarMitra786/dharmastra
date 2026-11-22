// Phase 1 sim tests: vault, crouch, staff, enemy AI, objectives, progress, determinism, frame. Registered from run.mjs.
import assert from 'node:assert/strict';
import { parseLayout } from '../world.js';
import { createSim, step, stateHash, createRng } from '../sim.js';
import { makeFrame } from '../renderer.js';
import { sightRange, ATTACKS } from '../combat.js';
import { createObjectives, updateObjectives, objectivesStatus, validateObjectiveDefs } from '../objectives.js';
import { PROGRESS_KEY, loadProgress, saveProgress, validateProgress, defaultProgress, recordCompletion } from '../progress.js';

const DT = 1 / 60;
const mk = (rows, extra = {}, opts = {}) => createSim(parseLayout({ tileSize: 40, rows, timeLimit: 600, mode: 'foot', rules: 2, ...extra }), { timerMode: 'off', ...opts });
const A = (o = {}) => ({ attack: false, jump: false, crouch: false, interact: false, ...o });
// Runs `secs` seconds of one control; `first` actions fire on the first tick only (edge triggered). Returns all events.
function run(sim, secs, c = {}, first = {}) {
  const ev = [];
  for (let i = 0; i < Math.round(secs / DT); i++) ev.push(...step(sim, DT, { mx: 0, my: 0, run: false, ...c, action: A(i === 0 ? first : {}) }));
  return ev;
}
const WALL = ['############', '#S..=......#', '#...=..1...#', '#...=......#', '#...=......#', '############'];
const BEAM = ['############', '#S..~......#', '#...~..1...#', '#...~......#', '#...~......#', '############'];
const at = (sim, x, y) => { sim.chariot.x = x; sim.chariot.y = y; };

export function registerPhase1(test) {
  test('phase1 world: legend chars become obstacles, pickups and spawns, not walls', () => {
    const w = parseLayout({ tileSize: 40, rows: ['##########', '#S=~,ka.1#', '#.......1#', '##########'], timeLimit: 9, entities: { a: { kind: 'raider', hp: 5 }, k: { kind: 'staff' } } });
    assert.deepEqual(w.obstacles.map((o) => o.kind), ['lowwall', 'beam', 'grass']);
    assert.equal(w.pickups.length, 1); assert.equal(w.pickups[0].kind, 'staff');
    assert.equal(w.spawns[0].hp, 5); assert.equal(w.spawns[0].id, 'a1');
    assert.equal(w.walls.reduce((n, r) => n + (r.w / 40) * (r.h / 40), 0), w.solid.flat().filter(Boolean).length, 'walls hold only # and o tiles');
  });

  test('phase1 vault: blocked without the ability, works with it (0.5 s, invulnerable, lands across)', () => {
    const none = mk(WALL); at(none, 100, 60);
    run(none, 1, { mx: 1 }, { jump: true });
    assert.ok(none.chariot.x < 160, `wall holds (${none.chariot.x})`);
    assert.equal(none.player.state === 'vault', false);
    const sim = mk(WALL, {}, { abilities: ['vault'] }); at(sim, 100, 60);
    run(sim, 0.3, { mx: 1 }); // reach the wall
    const ev = run(sim, 0.1, { mx: 1 }, { jump: true });
    assert.ok(ev.some((e) => e.type === 'vault'));
    assert.equal(sim.player.state, 'vault');
    run(sim, 0.2);
    assert.ok(sim.invuln > 0, 'invulnerable while vaulting');
    run(sim, 0.4);
    assert.ok(sim.chariot.x > 200, `landed beyond the wall (${sim.chariot.x})`);
    assert.notEqual(sim.player.state, 'vault');
  });

  test('phase1 vault: not available with no wall in front', () => {
    const sim = mk(WALL, {}, { abilities: ['vault'] }); at(sim, 60, 60);
    assert.ok(!run(sim, 0.2, {}, { jump: true }).some((e) => e.type === 'vault'));
  });

  test('phase1 crouch: beam blocks standing, passes crouched at half speed, needs the ability', () => {
    const stand = mk(BEAM, {}, { abilities: ['crouch'] }); at(stand, 100, 60);
    run(stand, 2, { mx: 1 });
    assert.ok(stand.chariot.x < 160, 'standing is blocked');
    const noAb = mk(BEAM); at(noAb, 100, 60);
    run(noAb, 0.1, {}, { crouch: true }); assert.equal(noAb.player.crouching, false);
    const sim = mk(BEAM, {}, { abilities: ['crouch'] }); at(sim, 100, 60);
    run(sim, 0.1, {}, { crouch: true });
    assert.equal(sim.player.state, 'crouch');
    run(sim, 0.5, { mx: 1 }); // reach the beam (the toggle edge fired in the first run)
    assert.ok(Math.abs(sim.chariot.speed - 67.5) < 1, `half walk speed (${sim.chariot.speed})`);
    run(sim, 3, { mx: 1 });
    assert.ok(sim.chariot.x > 220, `crouched under the beam (${sim.chariot.x})`);
    run(sim, 0.1, {}, { crouch: true }); // standing up under/near a beam is refused only while overlapping
    assert.equal(typeof sim.player.crouching, 'boolean');
  });

  test('phase1 crouch cannot stand up while under a beam', () => {
    const sim = mk(BEAM, {}, { abilities: ['crouch'] }); at(sim, 180, 60);
    sim.player.crouching = true;
    run(sim, 0.1, {}, { crouch: true });
    assert.equal(sim.player.crouching, true);
  });

  test('phase1 crouch halves sight (and grass halves it again), and an unseen crouched player stays unseen', () => {
    const rows = ['##############', '#S....a......#', '#............#', '#...........1#', '#............#', '##############'];
    const sim = mk(rows, { entities: { a: { kind: 'raider', hp: 3, angle: 0 } } }, { abilities: ['crouch'] });
    assert.equal(sightRange(sim), 160);
    sim.player.crouching = true; assert.equal(sightRange(sim), 80);
    const g = mk(['##########', '#S,,,..1.#', '#.......1#', '##########'], {}, { abilities: ['crouch'] });
    g.player.crouching = true; at(g, 100, 60); assert.equal(sightRange(g), 40);
    // Raider at (260,60) faces east (away); put player in front of it at distance 120.
    const stand = mk(rows, { entities: { a: { kind: 'raider', hp: 3, angle: Math.PI } } }, { abilities: ['crouch'] });
    const crouch = mk(rows, { entities: { a: { kind: 'raider', hp: 3, angle: Math.PI } } }, { abilities: ['crouch'] });
    for (const s of [stand, crouch]) { s.enemies[0].x = 260; s.enemies[0].homeAngle = Math.PI; s.enemies[0].phase = Math.PI / 1.2; at(s, 140, 60); }
    crouch.player.crouching = true;
    const e1 = run(stand, 0.5); const e2 = run(crouch, 0.5);
    assert.ok(e1.some((e) => e.type === 'seen'), 'standing player at 120 units is seen');
    assert.ok(!e2.some((e) => e.type === 'seen'), 'crouched player at 120 units is not');
  });

  const ARENA = ['##############', '#S...a.......#', '#............#', '#...........1#', '#............#', '##############'];
  const arena = (opts = {}, ent = { a: { kind: 'raider', hp: 3, angle: 0 } }) => {
    const s = mk(ARENA, { entities: ent }, opts);
    at(s, 100, 60); s.enemies[0].x = 150; s.enemies[0].y = 60; // 50 in front of the player, facing away
    return s;
  };

  test('phase1 fists and staff: you start unarmed and can fight (jab: 1 damage, short stagger); the staff sweeps further; the swing needs no ability', () => {
    const bare = arena();
    assert.equal(bare.player.weapon, 'none');
    const ev = run(bare, 0.3, {}, { attack: true });
    assert.ok(ev.some((e) => e.type === 'swing' && e.via === 'fists'));
    assert.ok(ev.some((e) => e.type === 'hit-enemy' && e.id === 'a1' && e.via === 'fists'), 'bare hands hit');
    const e0 = bare.enemies[0]; assert.equal(e0.hp, 2); assert.equal(e0.state, 'stagger'); assert.equal(e0.stagDur, ATTACKS['fists.jab'].stagger);
    const far = arena({ abilities: ['staff'] }); far.enemies[0].x = 180; // 80 away: past a fist (44) but inside a staff sweep (66 plus the step in)
    assert.ok(run(far, 0.3, {}, { attack: true }).some((e) => e.type === 'hit-enemy' && e.via === 'staff'));
    const fist = arena(); fist.enemies[0].x = 180;
    assert.ok(!run(fist, 0.3, {}, { attack: true }).some((e) => e.type === 'hit-enemy'), 'a fist does not reach 80 units');
  });

  test('phase1 melee misses outside range or behind; three hits put an enemy down (driven off, never killed on screen)', () => {
    const far = arena({ abilities: ['staff'] }); far.enemies[0].x = 220;
    assert.ok(!run(far, 0.4, {}, { attack: true }).some((e) => e.type === 'hit-enemy'), 'out of range');
    const behind = arena({ abilities: ['staff'] }); behind.enemies[0].x = 60;
    assert.ok(!run(behind, 0.4, {}, { attack: true }).some((e) => e.type === 'hit-enemy'), 'behind the player');
    const sim = arena({ abilities: ['staff'] }); const e = sim.enemies[0]; const evs = [];
    for (let i = 0; i < 3; i++) { e.x = 150; e.y = 60; e.state = e.hp ? 'patrol' : e.state; e.poise = 0; sim.player.comboT = 0; evs.push(...run(sim, 0.7, {}, { attack: true })); }
    assert.equal(e.hp, 0); assert.equal(e.state, 'down');
    assert.ok(evs.some((x) => x.type === 'enemy-down' && x.id === 'a1'));
    const f = makeFrame(sim, { shake: 0, flash: 0 }, false);
    assert.equal(f.enemies[0].state, 'down'); assert.equal(f.enemies[0].hpFrac, 0);
  });

  test('phase1 raider AI: sees, goes alert then chase, 0.5 s windup, 10 damage', () => {
    const sim = arena({}, { a: { kind: 'raider', hp: 3, angle: Math.PI } });
    sim.enemies[0].homeAngle = Math.PI; sim.enemies[0].angle = Math.PI; sim.enemies[0].phase = Math.PI / 1.2;
    const seen = []; const states = new Set(); const hurts = [];
    for (let i = 0; i < 240; i++) {
      const ev = step(sim, DT, { mx: 0, my: 0, action: A() });
      ev.forEach((e) => { if (e.type === 'seen') seen.push(e); if (e.type === 'hurt') hurts.push(e); });
      states.add(sim.enemies[0].atk ? sim.enemies[0].atk.phase : sim.enemies[0].state); // windup, active and recover are the phases of an attack
    }
    assert.equal(seen.length, 1, 'seen is emitted once per sighting');
    for (const s of ['alert', 'chase', 'windup']) assert.ok(states.has(s), `passes through ${s}`);
    assert.ok(hurts.length >= 1 && hurts[0].amount === 10);
    assert.ok(sim.health <= 90);
    assert.ok(hurts[0].from === 'a1' && Number.isFinite(hurts[0].dir), 'the hurt event says who and from where');
  });

  test('phase1 raider hearing: walking near alerts, crouching halves the range', () => {
    const mkH = (crouch) => {
      const s = mk(ARENA, { entities: { a: { kind: 'raider', hp: 3, angle: 0 } } }, { abilities: ['crouch'] });
      s.enemies[0].x = 200; s.enemies[0].y = 60; at(s, 150, 100); // 64 away, behind its back
      s.player.crouching = crouch; return s;
    };
    const walker = mkH(false); at(walker, 160, 100); // ~50 away
    run(walker, 0.3, { mx: 1 });
    assert.equal(walker.enemies[0].state, 'alert');
    const sneak = mkH(true); at(sneak, 160, 100); // 50 away is outside 30 when crouched
    run(sneak, 0.3, { mx: 1 });
    assert.equal(sneak.enemies[0].state, 'patrol');
  });

  test('phase1 pickup grants ability: interact within reach, once, equips the staff, fires events', () => {
    const rows = ['##########', '#Sk....1.#', '#.......1#', '##########'];
    const sim = mk(rows);
    assert.deepEqual(sim.abilities, ['walk', 'run', 'dodge', 'push'], 'the roll and the shove are always there; weapons are earned');
    at(sim, 200, 60);
    assert.ok(!run(sim, 0.1, {}, { interact: true }).some((e) => e.type === 'pickup'), 'too far');
    at(sim, 70, 60);
    const ev = run(sim, 0.1, {}, { interact: true });
    assert.ok(ev.some((e) => e.type === 'pickup' && e.id === 'k1' && e.kind === 'staff'));
    assert.ok(ev.some((e) => e.type === 'ability' && e.id === 'staff'));
    assert.ok(sim.abilities.includes('staff')); assert.equal(sim.player.weapon, 'staff');
    assert.ok(!run(sim, 0.1, {}, { interact: true }).some((e) => e.type === 'pickup'), 'only once');
    const f = makeFrame(sim, { shake: 0, flash: 0 }, false);
    assert.equal(f.pickups[0].taken, true);
    assert.ok(f.events.some((e) => e.type === 'pickup'), 'one-shot event in the frame');
    assert.equal(makeFrame(sim, { shake: 0, flash: 0 }, false).events.length, 0, 'drained after one frame');
  });

  test('phase1 objectives: reach, collect, evade state machine and optional', () => {
    const o = createObjectives([{ id: 'herbs', type: 'collect', count: 2, kind: 'herb', text: 'Gather herbs' }, { id: 'quiet', type: 'evade', max: 1 }, { id: 'bonus', type: 'collect', count: 1, optional: true }], 2);
    assert.deepEqual(o.items.map((i) => i.id), ['cp1', 'cp2', 'herbs', 'quiet', 'bonus']);
    assert.equal(objectivesStatus(o), 'playing');
    updateObjectives(o, { type: 'pickup', kind: 'stone' });
    assert.equal(o.items[2].progress, 0, 'wrong kind ignored');
    updateObjectives(o, { type: 'pickup', kind: 'herb' });
    assert.equal(o.items[2].progress, 1); assert.equal(o.items[2].state, 'active');
    assert.deepEqual(updateObjectives(o, { type: 'seen' }), [], 'one sighting is within max 1');
    updateObjectives(o, { type: 'checkpoint', n: 2 }); assert.equal(o.items[0].state, 'active', 'cp2 does not complete cp1');
    updateObjectives(o, { type: 'checkpoint', n: 1 }); updateObjectives(o, { type: 'checkpoint', n: 2 });
    const ch = updateObjectives(o, { type: 'pickup', kind: 'herb' });
    assert.ok(ch.some((c) => c.id === 'herbs' && c.state === 'done'));
    assert.ok(ch.some((c) => c.id === 'quiet' && c.state === 'done'), 'evade completes when the rest is done');
    assert.equal(o.items[4].state, 'done', 'any pickup satisfies the untyped optional collect');
    assert.equal(objectivesStatus(o), 'won');
    const f = createObjectives([{ id: 'quiet', type: 'evade' }], 1);
    updateObjectives(f, { type: 'seen' });
    assert.equal(f.items[1].state, 'failed'); assert.equal(objectivesStatus(f), 'failed');
    const opt = createObjectives([{ id: 'q', type: 'evade', optional: true }], 1);
    updateObjectives(opt, { type: 'seen' }); updateObjectives(opt, { type: 'checkpoint', n: 1 });
    assert.equal(objectivesStatus(opt), 'won', 'a failed optional does not block the win');
  });

  test('phase1 objective defs validation', () => {
    assert.deepEqual(validateObjectiveDefs([{ id: 'a', type: 'collect', count: 2 }, { id: 'b', type: 'evade' }, { id: 'c', type: 'reach', target: 'cp1' }], 2), []);
    assert.ok(validateObjectiveDefs([{ id: 'a', type: 'fly' }, { id: 'a', type: 'collect', count: 0 }, { type: 'evade' }, { id: 'r', type: 'reach', target: 9 }], 2).length >= 4);
    assert.ok(validateObjectiveDefs('x').length);
  });

  test('phase1 sim: collect + reach win, and being seen fails an evade objective', () => {
    const lay = ['############', '#Sk.......1#', '#........1.#', '############'];
    const s = mk(lay, { objectives: [{ id: 'c', type: 'collect', count: 1, kind: 'staff' }] });
    run(s, 0.1, {}, {}); at(s, 70, 60);
    const e1 = run(s, 0.1, {}, { interact: true });
    assert.ok(e1.some((e) => e.type === 'objective' && e.id === 'c' && e.state === 'done'));
    assert.equal(s.status, 'playing');
    at(s, 400, 120); // checkpoint 1 area
    const e2 = run(s, 0.3);
    assert.ok(e2.some((e) => e.type === 'win')); assert.equal(s.status, 'won');
    const ev = arena({}, { a: { kind: 'raider', hp: 3, angle: Math.PI } });
    ev.objectives = createObjectives([{ id: 'quiet', type: 'evade', max: 0 }], 1);
    ev.enemies[0].homeAngle = Math.PI; ev.enemies[0].angle = Math.PI; ev.enemies[0].phase = Math.PI / 1.2;
    run(ev, 1, {});
    assert.equal(ev.status, 'failed'); assert.equal(ev.failReason, 'seen');
  });

  test('phase1 determinism: same control script gives the same state hash, a different seed does not', () => {
    const script = (sim) => {
      for (let i = 0; i < 600; i++) {
        const mx = Math.sin(i / 37); const my = Math.cos(i / 53);
        step(sim, DT, { mx, my, run: i % 90 < 30, action: A({ attack: i % 70 === 0, crouch: i % 200 === 0, interact: i % 50 === 0, jump: i % 80 === 0 }) });
      }
      return stateHash(sim);
    };
    const rows = ['##############', '#S.k.a...=...#', '#....~.....a.#', '#...,,.....1.#', '#............#', '##############'];
    const make = (seed) => mk(rows, { entities: { a: { kind: 'raider', hp: 3, angle: 1 } } }, { abilities: ['crouch', 'vault'], seed });
    const h1 = script(make(7)); const h2 = script(make(7));
    assert.equal(h1, h2); assert.match(h1, /^[0-9a-f]{8}$/);
    assert.notEqual(script(make(8)), h1);
    const r1 = createRng(5); const r2 = createRng(5);
    assert.deepEqual([r1(), r1(), r1()], [r2(), r2(), r2()]);
  });

  test('phase1 sim code has no Math.random or Date', async () => {
    const { readFile } = await import('node:fs/promises');
    for (const f of ['sim.js', 'combat.js', 'abilities.js', 'objectives.js', 'world.js']) {
      const src = await readFile(new URL(`../${f}`, import.meta.url), 'utf8');
      assert.ok(!/Math\.random|Date\.now|new Date|performance\.now/.test(src), `${f} is deterministic`);
    }
  });

  test('phase1 frame: new fields are always present; legacy sims give empty arrays and idle player', () => {
    const legacy = createSim(parseLayout({ tileSize: 40, rows: ['######', '#S.11#', '#...1#', '######'], timeLimit: 9, mode: 'foot' }));
    const f = makeFrame(legacy, { shake: 0, flash: 0 }, false);
    assert.deepEqual([f.enemies, f.pickups, f.obstacles, f.events], [[], [], [], []]);
    assert.equal(f.player.state, 'idle'); assert.equal(f.player.crouch, false); assert.equal(f.blood, true);
    assert.deepEqual(f.attack, { active: false, progress: 0, angle: 0, kind: 'none', via: 'none', id: '', step: 0, range: 0, halfArc: 0, hit: 0 });
    assert.deepEqual([f.targets, f.arrows], [[], []]);
    assert.equal(makeFrame(legacy, { shake: 0, flash: 0 }, false, {}, { blood: false }).blood, false);
    const sim = arena({ abilities: ['staff'] });
    run(sim, 0.1, {}, { attack: true });
    const g = makeFrame(sim, { shake: 0, flash: 0 }, false);
    assert.equal(g.attack.active, true); assert.ok(g.attack.progress > 0 && g.attack.progress < 1);
    assert.equal(g.player.weapon, 'staff'); assert.equal(g.enemies.length, 1);
    JSON.stringify(g);
  });

  test('phase1 legacy sims ignore rules-2 mechanics (no abilities, no enemies)', () => {
    const lay = ['############', '#Sk..=a....#', '#........1.#', '############'];
    const s = createSim(parseLayout({ tileSize: 40, rows: lay, timeLimit: 9, mode: 'foot' }));
    assert.equal(s.rules2, false); assert.equal(s.enemies.length, 0);
    step(s, DT, { mx: 1, my: 0, action: A({ interact: true, attack: true, jump: true }) });
    assert.equal(s.pickups.length, 0);
  });

  const mem = (init) => { const m = new Map(init); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, m }; };

  test('phase1 progress: defaults, round trip, best time keeps the lowest', () => {
    const st = mem();
    assert.deepEqual(loadProgress(st), defaultProgress());
    assert.deepEqual(loadProgress(st).abilities, ['walk', 'run']);
    let p = recordCompletion(defaultProgress(), 'shunya-1', 90, ['crouch', 'staff'], 'staff');
    p = recordCompletion(p, 'shunya-1', 120);
    assert.equal(p.completed['shunya-1'].best, 90);
    assert.equal(saveProgress(p, st), true);
    assert.ok(st.m.has(PROGRESS_KEY));
    assert.deepEqual(loadProgress(st), p);
    assert.equal(p.weapon, 'staff'); assert.ok(p.abilities.includes('staff'));
  });

  test('phase1 progress load fuzz: garbage, wrong version, huge numbers, blocked storage', () => {
    const d = defaultProgress();
    for (const raw of ['', '{', 'null', '[]', '42', '"x"', '{"v":2,"abilities":["vault"]}', '{"v":"1"}', '\u0000\u0001', 'undefined']) {
      assert.deepEqual(loadProgress(mem([[PROGRESS_KEY, raw]])), d, `garbage ${JSON.stringify(raw)}`);
    }
    const huge = JSON.stringify({ v: 1, abilities: ['vault', 'fly', 7, null, '__proto__', 'staff'], weapon: 'sword', completed: { 'shunya-1': { best: 1e308 }, '__proto__': { best: 1 }, 'Bad Id!': { best: 1 }, 'ok': { best: -5 }, 'nan': { best: 'x' }, constructor: { best: 2 } }, extra: { evil: 1 } });
    const p = loadProgress(mem([[PROGRESS_KEY, huge]]));
    assert.deepEqual(p.abilities, ['walk', 'run', 'vault', 'staff']);
    assert.equal(p.weapon, 'none', 'unknown weapon dropped');
    assert.deepEqual(Object.keys(p).sort(), ['abilities', 'completed', 'v', 'weapon']);
    assert.equal(p.completed['shunya-1'].best, 36000);
    assert.equal(p.completed.ok.best, 0); assert.equal(p.completed.nan.best, 0);
    assert.deepEqual(Object.keys(p.completed).sort(), ['nan', 'ok', 'shunya-1']);
    assert.equal(({}).evil, undefined);
    assert.equal(validateProgress({ v: 1, abilities: [], weapon: 'staff' }).weapon, 'none', 'weapon needs its ability');
    assert.equal(Object.keys(validateProgress({ v: 1, completed: Object.fromEntries(Array.from({ length: 500 }, (_, i) => [`m${i}`, { best: 1 }])) }).completed).length, 64);
    const blocked = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
    assert.deepEqual(loadProgress(blocked), d);
    assert.equal(saveProgress(p, blocked), false);
    assert.deepEqual(loadProgress(null), d);
    assert.equal(saveProgress(p, null), true, 'no storage is a quiet no-op');
  });
}
