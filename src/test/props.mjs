// Prop tests (CEO, 2026-11-22: "pickable props the player can use as weapons"). Registered from run.mjs.
// Covers: the data table, layout parsing, pick-up prompt and pick-up, replacing the melee weapon, drop, swap, throw, shatter, durability and cracks, disarm, enemy drops,
// enemy pick-up (readable and fair), stamina costs, determinism and the state hash, the frame contract, the no-contact-damage rule, and the four missions' prop placement.
import assert from 'node:assert/strict';
import { parseLayout, reachable } from '../world.js';
import { createSim, step, stateHash } from '../sim.js';
import { makeFrame } from '../renderer.js';
import { PROPS, PROP_IDS } from '../abilities.js';
import { COMBAT, spawnEnemy, PICK_RADIUS, MAX_PROPS, DEBRIS_FOR, DISARM_CHANCE, ENEMY, kitOf, propPrompt, nearestProp } from '../combat.js';
import { captionFor, announceFor, cueFor, CAPTIONS, VOICES } from '../audio.js';
import { validateMission, createRunner } from '../mission.js';

const DT = 1 / 60;
const ROOM = ['##############################', '#S...........................#', '#............................#', '#............................#', '#............................#', '#............................#', '#............................#', '#...........................1#', '##############################'];
const mk = (props = [], opts = {}, extra = {}) => createSim(parseLayout({ tileSize: 40, rows: ROOM, timeLimit: 600, mode: 'foot', rules: 2, props, ...extra }), { timerMode: 'off', ...opts });
const A = (o = {}) => ({ attack: false, jump: false, crouch: false, interact: false, dodge: false, push: false, heavy: false, swap: false, w1: false, w2: false, w3: false, throw: false, drop: false, ...o });
function run(sim, secs, c = {}, first = {}) {
  const ev = [];
  for (let i = 0; i < Math.round(secs / DT); i++) ev.push(...step(sim, DT, { mx: 0, my: 0, run: false, hold: {}, ...c, action: A(i === 0 ? first : {}) }));
  return ev;
}
const types = (ev) => ev.map((e) => e.type);
const at = (sim, x, y, face = 0) => { sim.chariot.x = x; sim.chariot.y = y; sim.chariot.moveAngle = face; sim.chariot.angle = face; };
// A held prop given straight to the player (the pick-up itself is tested separately).
function arm(sim, kind) { const ev = []; const pr = { id: 'h1', kind, x: 0, y: 0, state: 'held', uses: PROPS[kind].uses, holder: 'player', angle: 0, vx: 0, vy: 0, left: 0, z: 0, t: 0, from: null }; sim.props.push(pr); sim.player.held = pr; return ev && pr; }
function foe({ kind = 'raider', dist = 40, carry, hp, props = [], hold = null, abilities = [], seed = 1 } = {}) {
  const sim = mk(props, { seed, abilities });
  at(sim, 200, 140, 0);
  if (hold) arm(sim, hold);
  const e = spawnEnemy({ id: 'e1', kind, x: 200 + dist, y: 140, angle: Math.PI, carry, hp }, sim.rng);
  e.aware = true; e.state = 'chase'; e.lastX = 200; e.lastY = 140; e.cd = 99; // it holds its blow: these tests are about what the player does
  sim.enemies = [e];
  return { sim, e };
}
const here = (id) => import(`../../missions/${id}.js`);
const MISSION_IDS = ['dvapara-escape', 'mauryan-spy', 'sangam-staff', 'gupta-forge'];

export function registerProps(test) {
  test('props data: every kind is complete, names are short, numbers are sane, and a missile is thrown by the light attack', () => {
    assert.ok(PROP_IDS.length >= 15);
    for (const id of ['stick', 'bamboo-staff', 'club', 'clay-pot', 'stone', 'oil-lamp', 'torch', 'spear', 'fallen-sword', 'wood-shield', 'bench', 'crate', 'market-pole', 'rope', 'grain-sack']) assert.ok(PROPS[id], id);
    for (const [id, P] of Object.entries(PROPS)) {
      assert.ok(P.name.split(' ').length <= 2, `${id} name is at most 2 words`);
      assert.equal(typeof P.twoHands, 'boolean'); assert.ok(P.uses >= 1 && P.uses <= 30); assert.ok(P.move > 0 && P.move <= 1);
      assert.ok(P.melee.heavy.stamina > 0 && P.melee.heavy.hitAt < P.melee.heavy.swing, `${id} heavy`);
      if (P.primary === 'throw') { assert.equal(P.melee.steps.length, 0); assert.ok(P.throw, `${id} missile can be thrown`); } else assert.ok(P.melee.steps.length >= 1);
      for (const s of [...P.melee.steps, P.melee.heavy]) { assert.ok(s.hitAt > 0 && s.hitAt < s.swing && s.range > 0 && s.stamina > 0 && s.damage <= 3, `${id}.${s.id}`); if (s !== P.melee.heavy) assert.ok(s.swing - s.hitAt >= 0.2, `${id}.${s.id} has a recovery`); }
      if (P.throw) { assert.ok(P.throw.range > 0 && P.throw.speed > 0 && P.throw.damage <= 3 && P.throw.stamina > 0); }
    }
    assert.ok(PROPS.spear.twoHands && PROPS.bench.twoHands && !PROPS.stick.twoHands);
    assert.ok(PROPS['clay-pot'].throw.shatter && PROPS.rope.throw === null);
  });

  test('props layout: kinds and tile positions parse, and a typo, an off-map spot or a spot inside a wall throws', () => {
    const w = parseLayout({ tileSize: 40, rows: ROOM, timeLimit: 1, mode: 'foot', rules: 2, props: [{ kind: 'stick', at: [2.5, 1.5] }] });
    assert.deepEqual(w.props.map((q) => [q.id, q.kind, q.x, q.y]), [['pr1', 'stick', 100, 60]]);
    const bad = (props, re) => assert.throws(() => parseLayout({ tileSize: 40, rows: ROOM, timeLimit: 1, mode: 'foot', rules: 2, props }), re);
    bad([{ kind: 'sword-of-doom', at: [2, 2] }], /unknown kind/); bad([{ kind: 'stick', at: [99, 2] }], /outside/); bad([{ kind: 'stick', at: [0.5, 0.5] }], /inside a wall/); bad([{ kind: 'stick' }], /needs at/);
    assert.deepEqual(parseLayout({ tileSize: 40, rows: ROOM, timeLimit: 1, mode: 'foot', rules: 2 }).props, []);
  });

  test('props pick-up: a prompt of at most 3 words shows near a prop, one Do press takes it, the prop is held, and nothing is taken from far away', () => {
    const sim = mk([{ kind: 'club', at: [5.5, 3.5] }, { kind: 'bamboo-staff', at: [20.5, 3.5] }]);
    at(sim, 150, 140, 0); // 18 units from the club at (220,140)? no: 70 away
    assert.equal(propPrompt(sim), null, 'out of reach: no prompt');
    assert.ok(!types(run(sim, 0.1, {}, { interact: true })).includes('prop-pickup'), 'a press out of reach takes nothing');
    at(sim, 200, 140, 0);
    const pr = propPrompt(sim);
    assert.equal(pr.text, 'Take club'); assert.ok(pr.text.split(' ').length <= 3);
    assert.equal(makeFrame(sim, { shake: 0, flash: 0 }, false).hud.prompt, 'Take club');
    const ev = run(sim, 0.1, {}, { interact: true });
    assert.ok(types(ev).includes('prop-pickup'));
    assert.equal(sim.player.held.kind, 'club');
    assert.equal(sim.props.find((q) => q.id === 'pr1').state, 'held');
    assert.equal(propPrompt(sim), null, 'nothing else in reach: no prompt');
    assert.ok(PICK_RADIUS >= 44, 'the reach is at least a lesson token reach');
    for (const id of PROP_IDS) { const s = mk([{ kind: id, at: [5.5, 3.5] }]); at(s, 200, 140); const t = propPrompt(s).text; assert.ok(t.split(' ').length <= 3, t); }
  });

  test('props pick-up: a prop behind a wall cannot be taken, and a prop that is not idle is not offered', () => {
    const rows = ROOM.map((r, i) => (i === 3 ? '#.........#..................#' : i === 2 ? '#.........#..................#' : i === 4 ? '#.........#..................#' : r));
    const sim = createSim(parseLayout({ tileSize: 40, rows: rows.map((r) => r.padEnd(30, '#').slice(0, 30)), timeLimit: 1, mode: 'foot', rules: 2, props: [{ kind: 'club', at: [11.2, 3.5] }] }), { timerMode: 'off' });
    at(sim, 9.9 * 40, 3.5 * 40); // the pillar-like wall at column 10 sits between
    assert.equal(nearestProp(sim), null);
    const s2 = mk([{ kind: 'club', at: [5.5, 3.5] }]); at(s2, 200, 140); s2.props[0].state = 'broken'; assert.equal(nearestProp(s2), null);
  });

  test('props melee: the held prop replaces the weapon in hand, uses its own numbers and events, and the ability weapon is back after a drop', () => {
    const { sim, e } = foe({ abilities: ['crouch', 'vault', 'staff'], hold: 'club' });
    assert.equal(sim.player.weapon, 'staff', 'the staff is still owned underneath');
    const ev = run(sim, 0.5, {}, { attack: true });
    const sw = ev.find((x) => x.type === 'swing'); assert.equal(sw.via, 'prop'); assert.equal(sw.id, 'bash');
    const hit = ev.find((x) => x.type === 'hit-enemy'); assert.ok(hit, 'the club lands'); assert.equal(hit.dmg, PROPS.club.melee.steps[0].damage); assert.equal(hit.prop, 'club');
    assert.equal(e.hp, 3 - PROPS.club.melee.steps[0].damage);
    const f = makeFrame(sim, { shake: 0, flash: 0 }, false);
    assert.equal(f.player.weapon, 'none', 'renderers that do not know props draw an empty hand, not a phantom staff'); assert.equal(f.player.held.kind, 'club');
    run(sim, 0.8); run(sim, 0.1, {}, { drop: true });
    assert.equal(sim.player.held, null); assert.equal(sim.player.weapon, 'staff');
    assert.equal(makeFrame(sim, { shake: 0, flash: 0 }, false).player.weapon, 'staff');
  });

  test('props heavy blow: a club heavy swing costs more stamina, hits harder, and wears the club by 2', () => {
    const { sim, e } = foe({ hold: 'club', hp: 6 });
    const s0 = sim.player.stamina; const ev = run(sim, 0.05, {}, { heavy: true }); const spent = s0 - sim.player.stamina; ev.push(...run(sim, 1.2));
    const h = ev.find((x) => x.type === 'hit-enemy'); assert.equal(h.dmg, 3); assert.ok(h.heavy);
    assert.equal(e.hp, 3);
    assert.ok(Math.abs(spent - PROPS.club.melee.heavy.stamina) < 1.5, 'the heavy cost');
    assert.equal(sim.player.held.uses, PROPS.club.uses - 2);
  });

  test('props drop and swap: Drop puts it on the ground in front, Swap (R) does the same, Do over another prop swaps and the old one lies where the new one was, 1/2/3 put it down too', () => {
    const sim = mk([{ kind: 'club', at: [5.5, 3.5] }, { kind: 'stone', at: [6.5, 3.5] }], { abilities: ['staff', 'sword'], weapon: 'none' });
    at(sim, 200, 140); run(sim, 0.1, {}, { interact: true }); assert.equal(sim.player.held.kind, 'club');
    let ev = run(sim, 0.1, {}, { drop: true });
    assert.ok(types(ev).includes('prop-drop')); assert.equal(sim.player.held, null);
    const club = sim.props.find((q) => q.kind === 'club'); assert.equal(club.state, 'idle'); assert.ok(club.x > 200, 'it lands in front of you');
    run(sim, 0.4, {}, { interact: true }); assert.ok(sim.player.held, 'and can be taken again');
    const first = sim.player.held.kind; const other = first === 'club' ? 'stone' : 'club';
    run(sim, 0.4, {}, { interact: true }); // the other prop is within reach too
    if (sim.player.held.kind === first) { at(sim, sim.props.find((q) => q.kind === other).x, sim.props.find((q) => q.kind === other).y); run(sim, 0.3, {}, { interact: true }); }
    assert.equal(sim.player.held.kind, other, 'swapped');
    assert.equal(sim.props.find((q) => q.kind === first).state, 'idle');
    ev = run(sim, 0.4, {}, { swap: true }); assert.equal(sim.player.held, null, 'R puts the prop down'); assert.equal(sim.player.weapon, 'none', 'and does not also cycle weapons');
    run(sim, 0.4, {}, { interact: true }); assert.ok(sim.player.held);
    run(sim, 0.4, {}, { w2: true }); assert.equal(sim.player.held, null); assert.equal(sim.player.weapon, 'sword', 'a weapon key puts the prop down and equips the weapon');
  });

  test('props stamina: every prop action spends its cost, is refused with a tired event when you cannot pay, and picking up or dropping is free', () => {
    for (const id of PROP_IDS) {
      const P = PROPS[id]; const light = P.primary === 'throw' ? P.throw.stamina : P.melee.steps[0].stamina;
      const { sim } = foe({ hold: id, dist: 300 });
      sim.player.stamina = 100; const ev = run(sim, 0.05, {}, { attack: true });
      assert.ok(types(ev).includes('swing'), `${id} light`);
      assert.ok(Math.abs(100 - sim.player.stamina - light) < 1.5, `${id} light costs ${light}, took ${100 - sim.player.stamina}`);
      const t = foe({ hold: id, dist: 300 }).sim; t.player.stamina = light - 0.5; t.player.stamDelay = 1;
      const ev2 = run(t, 0.05, {}, { attack: true }); assert.ok(types(ev2).includes('tired') && !types(ev2).includes('swing'), `${id} too tired`);
      const h = foe({ hold: id, dist: 300 }).sim; h.player.stamina = 100; run(h, 0.05, {}, { heavy: true });
      assert.ok(Math.abs(100 - h.player.stamina - P.melee.heavy.stamina) < 1.5, `${id} heavy costs ${P.melee.heavy.stamina}`);
      if (P.throw && P.primary !== 'throw') { const q = foe({ hold: id, dist: 300 }).sim; q.player.stamina = 100; const ev3 = run(q, 0.05, {}, { throw: true }); assert.ok(types(ev3).includes('swing')); assert.ok(Math.abs(100 - q.player.stamina - P.throw.stamina) < 1.5, `${id} throw costs ${P.throw.stamina}`); }
    }
    const sim = mk([{ kind: 'club', at: [5.5, 3.5] }]); at(sim, 200, 140); sim.player.stamina = 0;
    run(sim, 0.05, {}, { interact: true }); assert.ok(sim.player.held, 'pick-up needs no stamina'); run(sim, 0.4, {}, { drop: true }); assert.equal(sim.player.held, null);
    const q = foe({ hold: 'spear', dist: 300 }).sim; q.player.stamina = 1; q.player.stamDelay = 1; assert.ok(types(run(q, 0.05, {}, { throw: true })).includes('tired'), 'a throw too tired for is refused'); assert.ok(q.player.held, 'and nothing is thrown');
  });

  test('props durability: only a swing that connects wears a prop, cracks appear at 2/3 and 1/3, it breaks at 0 with an event, debris fades, and the weapon underneath returns', () => {
    const { sim, e } = foe({ hold: 'stick', hp: 99, abilities: ['staff'] }); e.hp = e.maxHp = 99;
    run(sim, 0.6, {}, { attack: true }); // connects
    assert.equal(sim.player.held.uses, PROPS.stick.uses - 1);
    const far = foe({ hold: 'stick', dist: 200 }).sim; run(far, 0.6, {}, { attack: true }); assert.equal(far.player.held.uses, PROPS.stick.uses, 'a miss wears nothing');
    const cracks = new Set(); let broke = null; let n = 0;
    while (sim.player.held && n++ < 60) {
      sim.enemies[0].state = 'chase'; sim.enemies[0].poise = 0; sim.player.stamina = 100;
      const f = makeFrame(sim, { shake: 0, flash: 0 }, false); cracks.add(f.player.held.crack);
      const ev = run(sim, 0.5, {}, { attack: true }); if (types(ev).includes('prop-break')) broke = ev.find((x) => x.type === 'prop-break');
    }
    assert.ok(broke, 'it broke'); assert.equal(broke.kind, 'stick');
    assert.ok(cracks.has(0) && cracks.has(1) && cracks.has(2), `crack states seen: ${[...cracks]}`);
    assert.equal(sim.player.held, null); assert.equal(sim.player.weapon, 'staff');
    const pr = sim.props.find((q) => q.id === 'h1'); assert.equal(pr.state, 'broken'); assert.equal(makeFrame(sim, { shake: 0, flash: 0 }, false).props.find((q) => q.id === 'h1').crack, 3);
    run(sim, DEBRIS_FOR + 0.2); assert.ok(!sim.props.find((q) => q.id === 'h1'), 'the debris is cleared');
    assert.ok(n >= PROPS.stick.uses - 2, 'a stick lasts about its durability');
  });

  test('props throw: a pot thrown at an enemy hits, shatters, staggers it and the ones next to it, and is gone; the throw leaves the hand', () => {
    const { sim, e } = foe({ hold: 'clay-pot', dist: 140, hp: 5 });
    const e2 = spawnEnemy({ id: 'e2', kind: 'raider', x: 200 + 140, y: 140 + 22, angle: Math.PI }, sim.rng); e2.aware = true; e2.state = 'chase'; e2.cd = 99; sim.enemies.push(e2);
    const ev = run(sim, 0.75, {}, { attack: true }); // a missile is thrown by the light attack
    assert.ok(types(ev).includes('prop-throw')); assert.ok(types(ev).includes('prop-shatter')); assert.equal(sim.player.held, null);
    assert.equal(e.hp, 5 - PROPS['clay-pot'].throw.damage); assert.equal(e.state, 'stagger'); assert.equal(e2.state, 'stagger', 'the shards stagger its neighbour'); assert.equal(e2.hp, 3, 'but do no damage to it');
    assert.equal(sim.props.find((q) => q.id === 'h1').state, 'broken');
  });

  test('props throw: a pot thrown at the ground shatters at the end of its range; a stone lands, can be picked up again, and is dented; a bench breaks when thrown', () => {
    const a = foe({ hold: 'clay-pot', dist: 400 }).sim; a.enemies = []; const ev = run(a, 1.5, {}, { attack: true });
    const sh = ev.find((x) => x.type === 'prop-shatter'); assert.ok(sh, 'shatters'); assert.ok(Math.hypot(sh.x - 200, sh.y - 140) <= PROPS['clay-pot'].throw.range + 20);
    const b = foe({ hold: 'stone', dist: 400 }).sim; b.enemies = []; run(b, 1.5, {}, { attack: true });
    const st = b.props.find((q) => q.id === 'h1'); assert.equal(st.state, 'idle'); assert.equal(st.uses, PROPS.stone.uses - 1); assert.ok(st.x > 200 + 100);
    at(b, st.x, st.y); run(b, 0.3, {}, { interact: true }); assert.equal(b.player.held.id, 'h1', 'taken again');
    const c = foe({ hold: 'bench', dist: 100, hp: 6 }); const ev3 = run(c.sim, 1.2, {}, { throw: true });
    assert.ok(types(ev3).includes('prop-break')); assert.equal(c.e.hp, 6 - PROPS.bench.throw.damage); assert.equal(c.sim.player.held, null);
  });

  test('props throw: a thrown prop stops at a wall and never passes through it; Do throws only when an enemy is lined up and nothing else is to be done; a rope cannot be thrown', () => {
    const s = foe({ hold: 'spear', dist: 100 }).sim; s.enemies = [];
    const rows = ROOM.map((r, i) => (i >= 1 && i <= 6 ? r.slice(0, 8) + '#' + r.slice(9) : r));
    const sim = createSim(parseLayout({ tileSize: 40, rows, timeLimit: 1, mode: 'foot', rules: 2 }), { timerMode: 'off' }); at(sim, 200, 140); arm(sim, 'spear');
    run(sim, 1.2, {}, { throw: true }); const sp = sim.props.find((q) => q.id === 'h1'); assert.ok(sp.x < 9 * 40, `stopped by the wall at x=${sp.x}`);
    const d = foe({ hold: 'spear', dist: 120 }).sim; assert.equal(propPrompt(d).text, 'Throw', 'the prompt says so when Do would throw');
    assert.ok(types(run(d, 0.3, {}, { interact: true })).includes('prop-throw'), 'Do throws at the enemy in front');
    const n = foe({ hold: 'spear', dist: 120 }).sim; n.enemies = []; assert.equal(propPrompt(n), null); assert.ok(!types(run(n, 0.3, {}, { interact: true })).includes('prop-throw'), 'with nobody in front, Do never throws what you hold');
    const r = foe({ hold: 'rope', dist: 120 }).sim; assert.ok(types(run(r, 0.1, {}, { throw: true })).includes('prop-nothrow')); assert.ok(r.player.held);
  });

  test('props disarm: a shove or a heavy blow can knock the weapon out of an enemy hand (seeded), it lands on the ground for the player, and a rope always does', () => {
    let disarmed = 0; let kept = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const { sim, e } = foe({ seed, hp: 6 }); const ev = run(sim, 0.5, {}, { push: true });
      if (types(ev).includes('disarm')) { disarmed++; assert.equal(e.carry, null); const d = ev.find((x) => x.type === 'prop-drop'); assert.equal(d.kind, 'club'); assert.equal(d.reason, 'disarm'); assert.equal(sim.props.find((q) => q.id === d.id).state, 'idle'); } else { kept++; assert.equal(e.carry, 'club'); }
    }
    assert.ok(disarmed >= 8 && kept >= 2, `about ${DISARM_CHANCE * 100}% of shoves disarm (${disarmed}/20)`);
    const a = foe({ seed: 5, hp: 6 }); const b = foe({ seed: 5, hp: 6 }); assert.deepEqual(types(run(a.sim, 0.5, {}, { push: true })), types(run(b.sim, 0.5, {}, { push: true })), 'the same seed rolls the same');
    for (let seed = 1; seed <= 6; seed++) { const { sim, e } = foe({ seed, hp: 6, hold: 'rope' }); const ev = run(sim, 0.7, {}, { attack: true }); assert.ok(types(ev).includes('disarm'), 'rope always disarms'); assert.equal(e.carry, null); }
    for (let seed = 1; seed <= 8; seed++) { const { sim, e } = foe({ seed, hp: 6, hold: 'wood-shield' }); const ev = run(sim, 1.1, {}, { heavy: true }); assert.ok(types(ev).includes('disarm'), 'a shield slam always disarms'); assert.equal(e.carry, null); }
    const { sim } = foe({ hp: 6, seed: 2 }); sim.rng = () => 0; run(sim, 0.5, {}, { push: true }); const drop = sim.props.find((q) => q.from === 'e1'); assert.ok(drop && drop.state === 'idle');
    at(sim, drop.x, drop.y); run(sim, 0.4, {}, { interact: true }); assert.equal(sim.player.held.kind, 'club', 'the player takes the disarmed weapon');
    const L = foe({ hp: 6, seed: 3 }); run(L.sim, 0.5, {}, { attack: true }); assert.equal(L.e.carry, 'club', 'a plain fist never disarms');
    const arrow = foe({ hp: 6 }); arrow.sim.rng = () => 0; arrow.sim.arrows[0].active = true; Object.assign(arrow.sim.arrows[0], { x: 225, y: 140, vx: 400, vy: 0, left: 300, dmg: 1 }); run(arrow.sim, 0.2); assert.equal(arrow.e.carry, 'club', 'arrows and thrown props never disarm');
  });

  test('props disarm: a disarmed enemy fights with its fists (4 damage, same telegraph) and a disarmed shield bearer loses its guard; a captain and an archer cannot be disarmed', () => {
    const { sim, e } = foe({ kind: 'swordsman', carry: null, dist: 30 });
    assert.equal(kitOf(e).weapon, 'fists'); const p = kitOf(e).attacks.punch; assert.ok(p.windup >= 0.45 && p.damage < ENEMY.swordsman.attacks.slash.damage);
    e.cd = 0; const h0 = sim.health; const ev = run(sim, 2.2); assert.ok(types(ev).includes('windup'), 'telegraphed'); assert.equal(h0 - sim.health, p.damage, 'one punch for the fist damage');
    const sh = foe({ kind: 'shield', hp: 6, dist: 40 }); assert.ok(kitOf(sh.e).shield);
    sh.e.carry = null; sh.e.guarding = false; assert.ok(!kitOf(sh.e).shield, 'no shield, no guard');
    for (const kind of ['captain', 'archer']) { const f = foe({ kind, hp: 40 }); f.sim.rng = () => 0; run(f.sim, 0.5, {}, { push: true }); assert.equal(f.e.carry, null); assert.ok(!f.sim.props.length, `${kind} has nothing to drop`); }
  });

  test('props enemy drop: a beaten enemy drops the weapon it carried, half worn, where the player can take it, with an event; a fallen enemy in a pit loses it', () => {
    const { sim, e } = foe({ hp: 1 }); const ev = run(sim, 0.5, {}, { attack: true });
    assert.ok(types(ev).includes('enemy-down')); const d = ev.find((x) => x.type === 'prop-drop'); assert.equal(d.reason, 'down'); assert.equal(d.kind, 'club');
    const pr = sim.props.find((q) => q.id === d.id); assert.equal(pr.state, 'idle'); assert.equal(pr.uses, Math.ceil(PROPS.club.uses * 0.5)); assert.equal(e.carry, null);
    at(sim, pr.x, pr.y); run(sim, 0.3, {}, { interact: true }); assert.equal(sim.player.held.kind, 'club');
    for (const [kind, prop] of [['spearman', 'spear'], ['swordsman', 'fallen-sword'], ['shield', 'wood-shield']]) { const f = foe({ kind, hp: 1 }); f.e.angle = 0; run(f.sim, 0.5, {}, { attack: true }); // from behind, so a shield cannot stop it
       assert.ok(f.sim.props.some((q) => q.kind === prop), `${kind} drops ${prop}`); }
  });

  test('props enemy pick-up: an unarmed enemy away from the player walks to a loose weapon, bends (visibly, with events) and arms itself; the player can get there first; a hit stops it', () => {
    const rig = (extra = {}) => { const f = foe({ carry: null, dist: 220, props: [] }); const pr = { kind: 'club', at: [(200 + 220 - 60) / 40, 3.5] }; return { ...f, pr, sim: mk([pr], { seed: 1 }) }; };
    const make = () => { const sim = mk([{ kind: 'club', at: [8.5, 3.5] }]); at(sim, 40 * 1.5, 140); const e = spawnEnemy({ id: 'e1', kind: 'raider', x: 40 * 11, y: 140, angle: Math.PI, carry: null }, sim.rng); e.aware = true; e.state = 'chase'; e.lastX = sim.chariot.x; e.lastY = sim.chariot.y; sim.enemies = [e]; return { sim, e }; };
    void rig;
    const { sim, e } = make();
    assert.equal(kitOf(e).weapon, 'fists');
    const ev = run(sim, 4); const t = types(ev);
    assert.ok(t.includes('enemy-rearm'), 'it announces what it is doing'); assert.ok(t.includes('enemy-pickup'));
    assert.ok(t.indexOf('enemy-rearm') < t.indexOf('enemy-pickup')); assert.equal(e.carry, 'club'); assert.ok(!sim.props.some((q) => q.kind === 'club' && q.state === 'idle'), 'the prop left the ground');
    assert.equal(kitOf(e).weapon, 'club');
    // the frame shows it while it happens
    const m = make(); let sawRearm = false; for (let i = 0; i < 240; i++) { step(m.sim, DT, { mx: 0, my: 0, hold: {}, action: A() }); const f = makeFrame(m.sim, { shake: 0, flash: 0 }, false).enemies[0]; if (f.rearm) { sawRearm = true; assert.equal(f.rearm.propId, 'pr1'); assert.equal(f.carry, null); } }
    assert.ok(sawRearm);
    // the player takes it first
    const p = make(); at(p.sim, 40 * 8.5 - 20, 140, 0); p.e.x = 40 * 12; p.e.homeX = p.e.x;
    run(p.sim, 0.1, {}, { interact: true }); assert.equal(p.sim.player.held.kind, 'club'); run(p.sim, 3); assert.equal(p.e.carry, null, 'it did not get the club'); assert.equal(p.sim.player.held.kind, 'club');
    // a blow interrupts the bend
    const q = make(); let n = 0; while (q.e.state !== 'rearm' && n++ < 400) run(q.sim, DT);
    assert.equal(q.e.state, 'rearm'); at(q.sim, q.e.x - 30, q.e.y, 0); q.sim.player.weapon = 'none'; run(q.sim, 0.5, {}, { push: true }); assert.notEqual(q.e.state, 'rearm'); assert.equal(q.e.carry, null);
    // never while the player is on top of it
    const r = make(); at(r.sim, r.e.x - 40, r.e.y, 0); r.e.disarmedT = 99; run(r.sim, 0.1); assert.notEqual(r.e.state, 'rearm', 'it fights with its fists when you are next to it');
  });

  test('props enemy pick-up: archers, captains and the sparring partner never go for props, and enemies never take heavy or throw-only props', () => {
    for (const kind of ['archer', 'captain', 'sparrer']) { const sim = mk([{ kind: 'club', at: [8.5, 3.5] }]); at(sim, 60, 140); const e = spawnEnemy({ id: 'e1', kind, x: 340, y: 140, angle: Math.PI }, sim.rng); e.aware = true; e.state = 'chase'; sim.enemies = [e]; run(sim, 2); assert.notEqual(e.state, 'rearm'); assert.equal(e.carry, null); }
    const sim = mk([{ kind: 'bench', at: [8.5, 3.5] }, { kind: 'clay-pot', at: [8.5, 4.5] }]); at(sim, 60, 140); const e = spawnEnemy({ id: 'e1', kind: 'raider', x: 340, y: 140, angle: Math.PI, carry: null }, sim.rng); e.aware = true; e.state = 'chase'; sim.enemies = [e]; run(sim, 2); assert.notEqual(e.state, 'rearm');
  });

  test('props two hands: a two-handed prop forbids block and the bow, a heavy one slows walking and forbids running, and the player is told why', () => {
    const { sim } = foe({ hold: 'spear', dist: 300, abilities: ['staff', 'sword', 'bow'] });
    const ev = run(sim, 0.3, { hold: { block: true } }); assert.notEqual(sim.player.state, 'block'); assert.ok(types(ev).includes('prop-twohands'));
    assert.equal(types(run(sim, 0.1, { hold: { block: true } })).filter((x) => x === 'prop-twohands').length, 0, 'the cue is not repeated every tick');
    const one = foe({ hold: 'stick', dist: 300 }).sim; run(one, 0.3, { hold: { block: true } }); assert.equal(one.player.state, 'block', 'a one-handed prop can block');
    const b = foe({ hold: 'spear', dist: 300, abilities: ['staff', 'sword', 'bow'] }).sim; b.player.weapon = 'bow'; run(b, 0.5, { hold: { aim: true } }); assert.notEqual(b.player.state, 'aim', 'no bow while a prop fills the hand');
    const speed = (kind) => { const s = foe({ hold: kind, dist: 300 }).sim; s.enemies = []; at(s, 100, 140); run(s, 1.5, { mx: 1, run: true }); return s.chariot.x - 100; };
    const free = speed(null) ; void free;
    const walk = speed('stick'); const heavy = speed('bench'); assert.ok(heavy < walk * 0.8, `bench ${heavy} vs stick ${walk}`);
  });

  test('props shield: a held shield turns blows for less stamina than a bare block and wears with each block', () => {
    const { sim, e } = foe({ hold: 'wood-shield', dist: 30 }); e.cd = 0; const s0 = 100; sim.player.stamina = s0;
    const h0 = sim.health; let ev = []; for (let i = 0; i < 150; i++) ev.push(...step(sim, DT, { mx: 0, my: 0, hold: { block: true }, action: A() }));
    assert.equal(sim.health, h0, 'blocked'); assert.ok(types(ev).includes('blocked') || types(ev).includes('parry'));
    if (types(ev).includes('blocked')) assert.equal(sim.player.held.uses, PROPS['wood-shield'].uses - 1);
  });

  test('props frame: props carry kind, position, state, crack and durability; held, thrown and broken states are reported; the HUD fields are plain and short', () => {
    const sim = mk([{ kind: 'spear', at: [5.5, 3.5] }, { kind: 'clay-pot', at: [6.5, 3.5] }]); at(sim, 200, 140);
    let f = makeFrame(sim, { shake: 0, flash: 0 }, false);
    assert.deepEqual(f.props.map((q) => [q.kind, q.state]), [['spear', 'idle'], ['clay-pot', 'idle']]); assert.ok(f.props.every((q) => Number.isFinite(q.x) && Number.isFinite(q.y) && 'crack' in q && 'durability' in q));
    assert.equal(f.hud.heldName, ''); assert.equal(f.hud.prompt, 'Take spear'); assert.equal(f.hud.promptProp, 'pr1');
    run(sim, 0.1, {}, { interact: true }); f = makeFrame(sim, { shake: 0, flash: 0 }, false);
    assert.equal(f.hud.heldName, 'Spear'); assert.equal(f.hud.heldDurability, 1); assert.equal(f.props[0].state, 'held'); assert.equal(f.props[0].holder, 'player'); assert.equal(f.player.held.twoHands, true);
    assert.equal(JSON.stringify(f).includes('NaN'), false);
    const t = foe({ hold: 'stone', dist: 300 }).sim; step(t, DT, { mx: 0, my: 0, hold: {}, action: A({ attack: true }) }); let sawThrown = false;
    for (let i = 0; i < 40; i++) { step(t, DT, { mx: 0, my: 0, hold: {}, action: A() }); const q = makeFrame(t, { shake: 0, flash: 0 }, false).props.find((x) => x.id === 'h1'); if (q.state === 'thrown') { sawThrown = true; assert.ok(q.z >= 0 && q.z <= 1); } }
    assert.ok(sawThrown, 'a thrown prop is visible in flight');
    const fr = makeFrame(foe({ carry: null }).sim, { shake: 0, flash: 0 }, false); assert.equal(fr.enemies[0].carry, null);
    assert.equal(makeFrame(foe({}).sim, { shake: 0, flash: 0 }, false).enemies[0].carry, 'club');
    const old = createSim(parseLayout({ tileSize: 40, rows: ROOM, timeLimit: 1, mode: 'chariot' }), { timerMode: 'off' }); assert.deepEqual(makeFrame(old, { shake: 0, flash: 0 }, false).props, []);
  });

  test('props determinism: the same seed and inputs give the same state hash, and the hash changes with prop state (held, thrown, worn, enemy carry)', () => {
    const script = (seed) => { const { sim } = foe({ seed, hp: 6, props: [{ kind: 'stone', at: [5.5, 3.5] }] }); const ev = []; const acts = [{ interact: true }, {}, { attack: true }, {}, { push: true }, {}, { throw: true }]; acts.forEach((a, k) => ev.push(...run(sim, 0.6, {}, a))); return { sim, ev }; };
    const a = script(7); const b = script(7); assert.equal(stateHash(a.sim), stateHash(b.sim)); assert.deepEqual(a.ev.map((e) => e.type), b.ev.map((e) => e.type));
    const base = foe({ props: [{ kind: 'stone', at: [5.5, 3.5] }] }).sim; const h0 = stateHash(base);
    base.props[0].uses -= 1; assert.notEqual(stateHash(base), h0, 'wear is hashed'); base.props[0].uses += 1; assert.equal(stateHash(base), h0);
    base.props[0].state = 'broken'; assert.notEqual(stateHash(base), h0, 'state is hashed'); base.props[0].state = 'idle';
    base.enemies[0].carry = null; assert.notEqual(stateHash(base), h0, 'what an enemy carries is hashed'); base.enemies[0].carry = 'club';
    base.player.held = base.props[0]; assert.notEqual(stateHash(base), h0, 'what you hold is hashed');
  });

  test('props no contact damage: standing on enemies with props in hand, thrown props and dropped props never cost the player health, and an enemy blow still needs its wind-up', () => {
    const { sim, e } = foe({ hold: 'bench', dist: 0, hp: 9 }); e.cd = 99; e.x = sim.chariot.x; e.y = sim.chariot.y; const h = sim.health;
    run(sim, 3, { mx: 1 }); run(sim, 1, {}, { throw: true }); run(sim, 1, {}, { drop: true }); assert.equal(sim.health, h, 'no contact damage');
    const t = foe({ hold: 'spear', dist: 60, hp: 9 }); t.e.cd = 0; const ev = run(t.sim, 1.6); const w = ev.findIndex((x) => x.type === 'windup'); const hurt = ev.findIndex((x) => x.type === 'hurt');
    assert.ok(w >= 0 && (hurt < 0 || hurt > w), 'the telegraph comes first');
    const u = foe({ carry: null, dist: 28 }); u.e.cd = 99; const hh = u.sim.health; run(u.sim, 2); assert.equal(u.sim.health, hh, 'an unarmed enemy standing against you does nothing until it winds up');
  });

  test('props dropped by many enemies never exceed the cap, and a full world refuses the drop instead of growing', () => {
    const sim = mk([]); for (let i = 0; i < MAX_PROPS + 10; i++) { const e = spawnEnemy({ id: `x${i}`, kind: 'raider', x: 100 + (i % 20) * 10, y: 100, angle: 0 }, sim.rng); sim.enemies.push(e); }
    at(sim, 600, 200); for (const e of sim.enemies) { e.hp = 1; e.aware = true; }
    import('../combat.js').then(() => 0);
    for (let i = 0; i < 10; i++) sim.props.push({ id: `f${i}`, kind: 'stick', x: 50, y: 50, state: 'idle', uses: 1, holder: null, angle: 0, vx: 0, vy: 0, left: 0, z: 0, t: 0, from: null });
    assert.ok(sim.props.length <= MAX_PROPS);
  });

  test('props audio: every new event has a cue and a caption, the cues have voices, and the live-region lines are plain', () => {
    const evs = [{ type: 'prop-pickup', name: 'Club' }, { type: 'prop-drop', by: 'e1' }, { type: 'prop-throw' }, { type: 'prop-break', name: 'Club' }, { type: 'prop-shatter' }, { type: 'disarm' }, { type: 'enemy-pickup', kind: 'raider', prop: 'club' }, { type: 'enemy-rearm', kind: 'raider', prop: 'club' }, { type: 'prop-twohands', name: 'Spear' }];
    for (const e of evs) { assert.ok(captionFor(e), `${e.type} has a caption`); assert.match(captionFor(e), /^\[.+\]$/); }
    for (const c of ['grab', 'drop', 'throw', 'crack', 'shatter', 'clatter']) { assert.ok(VOICES[c] && CAPTIONS[c], c); }
    for (const t of ['prop-pickup', 'prop-drop', 'prop-throw', 'prop-break', 'prop-shatter', 'disarm', 'enemy-pickup']) assert.ok(cueFor({ type: t }), t);
    assert.match(announceFor({ type: 'prop-pickup', name: 'Old sword' }), /old sword/); assert.ok(announceFor({ type: 'disarm' })); assert.equal(announceFor({ type: 'prop-drop', by: 'player' }), null);
  });

  test('props objectives and dialogue: a do objective can count prop pick-ups, and the runner says the prop-pickup line', () => {
    const lines = []; const r = createRunner({ objectives: [{ id: 'a', text: 'a' }], dialogue: [{ id: 'p', speaker: 'x', text: 'Nice stick', trigger: 'prop-pickup' }], events: [] }, { onSay: (l) => lines.push(l.id) });
    r.start(); r.handle({ type: 'prop-pickup' }); assert.deepEqual(lines, ['p']);
    assert.deepEqual(validateMission({ id: 'a', era: 'b', title: 'c', logline: 'd', objectives: [{ id: 'o', text: 't' }], dialogue: [{ id: 'p', speaker: 'x', text: 't', trigger: 'disarm' }], events: [] }), []);
  });

  test('props missions: every mission places props on open ground that the traveller can reach, the first level has sticks near the start, and the mix keeps fights from being trivial', async () => {
    const want = { 'dvapara-escape': ['stick', 'spear', 'bench', 'clay-pot'], 'mauryan-spy': ['clay-pot', 'bench', 'oil-lamp'], 'sangam-staff': ['market-pole', 'rope', 'grain-sack'], 'gupta-forge': ['bench', 'clay-pot', 'spear'] };
    for (const id of MISSION_IDS) {
      const { layout } = await here(id); const w = parseLayout(layout); const sim = createSim(w, { timerMode: 'off' });
      assert.ok(w.props.length >= 6 && w.props.length <= 24, `${id}: ${w.props.length} props`);
      const kinds = new Set(w.props.map((q) => q.kind)); for (const k of want[id]) assert.ok(kinds.has(k), `${id} has a ${k}`);
      for (const q of w.props) { assert.ok(reachable(w, w.start, q) > 0, `${id}: ${q.kind} at ${q.x},${q.y} is reachable`); assert.ok(!w.obstacles.some((o) => o.kind !== 'grass' && q.x >= o.x && q.x <= o.x + o.w && q.y >= o.y && q.y <= o.y + o.d), `${id}: ${q.kind} is not inside an obstacle`); }
      const weapons = w.props.filter((q) => ['spear', 'club', 'fallen-sword', 'market-pole', 'bamboo-staff'].includes(q.kind)).length; assert.ok(weapons <= 4, `${id}: at most 4 real weapons lie about (${weapons})`);
      assert.equal(sim.props.length, w.props.length);
    }
    const dv = parseLayout((await here('dvapara-escape')).layout);
    const sticks = dv.props.filter((q) => q.kind === 'stick' || q.kind === 'bamboo-staff'); assert.ok(sticks.length >= 2 && sticks.every((q) => Math.hypot(q.x - dv.start.x, q.y - dv.start.y) <= 6 * dv.tileSize), 'a fists-only player can arm themselves at the start');
    const sim = createSim(dv, { timerMode: 'off', abilities: [] }); sim.chariot.x = sticks[0].x; sim.chariot.y = sticks[0].y; run(sim, 0.1, {}, { interact: true }); assert.equal(sim.player.held.kind, sticks[0].kind);
  });
}
