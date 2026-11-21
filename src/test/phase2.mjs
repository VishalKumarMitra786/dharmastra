// Phase 2 tests: dodge, shove, climb, sword (light, heavy, block, parry), bow and arrows, progression order, fair enemy AI,
// determinism, save/load, objectives (do, defeat), frame fields, input keys, HUD text, and the "Forge Road" playthrough. Registered from run.mjs.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseLayout } from '../world.js';
import { createSim, step, stateHash } from '../sim.js';
import { COMBAT, ATTACKS } from '../combat.js';
import { closeAbilities, grantAbility, bestWeapon, PREREQ, ABILITY_IDS } from '../abilities.js';
import { makeFrame } from '../renderer.js';
import { createObjectives, updateObjectives, objectivesStatus, validateObjectiveDefs } from '../objectives.js';
import { loadProgress, saveProgress, validateProgress, defaultProgress, recordCompletion, PROGRESS_KEY } from '../progress.js';
import { createInput, ACTION_NAMES } from '../input.js';
import { createHud } from '../hud.js';
import { createRenderer2D } from '../renderer2d.js';
import { validateMission, createRunner } from '../mission.js';
import { MISSIONS, UNLISTED_MISSIONS, pickMissionId, missingFor } from '../missions.js';
import { layout as forge } from '../../missions/gupta-forge.js';

const DT = 1 / 60;
const FULL = ['crouch', 'vault', 'dodge', 'push', 'climb', 'staff', 'sword', 'bow'];
const OPEN = ['####################', '#S.................#', '#..................#', '#..................#', '#.................1#', '####################'];
const mk = (rows = OPEN, extra = {}, opts = {}) => createSim(parseLayout({ tileSize: 40, rows, timeLimit: 600, mode: 'foot', rules: 2, ...extra }), { timerMode: 'off', abilities: FULL, ...opts });
const A = (o = {}) => ({ attack: false, jump: false, crouch: false, interact: false, dodge: false, push: false, heavy: false, swap: false, w1: false, w2: false, w3: false, ...o });
function run(sim, secs, c = {}, first = {}) {
  const ev = [];
  for (let i = 0; i < Math.round(secs / DT); i++) ev.push(...step(sim, DT, { mx: 0, my: 0, run: false, hold: {}, ...c, action: A(i === 0 ? first : {}) }));
  return ev;
}
const at = (sim, x, y, face = 0) => { sim.chariot.x = x; sim.chariot.y = y; sim.chariot.moveAngle = face; sim.chariot.angle = face; };
const types = (ev) => ev.map((e) => e.type);
function mkEnemy(kind = 'raider') {
  const R = COMBAT[kind];
  return { id: 'a1', kind, x: 0, y: 0, hp: 3, maxHp: 3, radius: R.radius, angle: Math.PI, homeAngle: Math.PI, homeX: 0, homeY: 0, patrol: [], target: 0, phase: 0, state: 'patrol', stateT: 0, aware: true, sightT: 0, lostT: 0, cd: 0, lastX: 0, lastY: 0, spin: 1, kx: 0, ky: 0, kbT: 0, stagDur: 0, fleeing: false, poise: 0, fell: false };
}
// One raider east of the player, close enough to reach.
function duel({ weapon = 'sword', abilities = FULL, kind = 'raider', dist = 30 } = {}) {
  const sim = mk(OPEN, {}, { abilities, weapon });
  at(sim, 200, 100, 0);
  sim.enemies = [{ ...mkEnemy(kind), x: 200 + dist, y: 100 }];
  return sim;
}
const winding = (sim, t0) => { const e = sim.enemies[0]; e.state = 'windup'; e.stateT = t0; e.angle = Math.PI; return e; };
const PIT = ['##############', '#S...________#', '#............#', '#...........1#', '##############'];

export async function registerPhase2(test) {
  // ---------- abilities and the progression order ----------
  test('phase2 progression: shunya -> staff -> sword -> bow. A weapon is never granted before the one it builds on', () => {
    assert.deepEqual(PREREQ, { sword: ['staff'], bow: ['sword'] });
    const sim = mk(OPEN, {}, { abilities: [] });
    assert.deepEqual(sim.abilities, ['walk', 'run']); assert.equal(sim.player.weapon, 'none');
    assert.equal(grantAbility(sim, 'bow'), false); assert.equal(grantAbility(sim, 'sword'), false);
    assert.equal(grantAbility(sim, 'staff'), true); assert.equal(sim.player.weapon, 'staff');
    assert.equal(grantAbility(sim, 'bow'), false, 'bow still needs the sword');
    assert.equal(grantAbility(sim, 'sword'), true); assert.equal(sim.player.weapon, 'sword');
    assert.equal(grantAbility(sim, 'bow'), true); assert.equal(sim.player.weapon, 'bow'); assert.equal(sim.player.arrows, COMBAT.bow.startArrows);
    assert.equal(grantAbility(sim, 'bow'), false, 'only once'); assert.equal(grantAbility(sim, 'nonsense'), false);
    assert.deepEqual(closeAbilities(['bow', 'walk', 'dodge']), ['walk', 'dodge']);
    assert.equal(bestWeapon(['staff', 'sword']), 'sword'); assert.equal(bestWeapon(['walk']), 'none');
    const forged = mk(OPEN, {}, { abilities: ['bow', 'sword'] }); assert.ok(!forged.abilities.includes('bow') && !forged.abilities.includes('sword'), 'a lent bow without the staff is dropped');
  });

  test('phase2 teacher tokens: a sword token is refused (and stays) until the staff is held', () => {
    const rows = ['############', '#Sk.......1#', '#.........1#', '############'];
    const sim = mk(rows, { entities: { k: { kind: 'sword' } } }, { abilities: [] });
    at(sim, 60, 60);
    const ev = run(sim, 0.1, {}, { interact: true });
    assert.ok(types(ev).includes('refused')); assert.equal(sim.pickups[0].taken, false); assert.ok(!sim.abilities.includes('sword'));
    grantAbility(sim, 'staff');
    const ev2 = run(sim, 0.1, {}, { interact: true });
    assert.ok(types(ev2).includes('ability')); assert.ok(sim.abilities.includes('sword')); assert.equal(sim.player.weapon, 'sword');
  });

  // ---------- dodge ----------
  test('phase2 dodge: needs the ability, costs 25 stamina, rolls ~110 units, 0.24 s of invulnerability inside a 0.36 s roll, cooldown', () => {
    const none = mk(OPEN, {}, { abilities: [] }); at(none, 100, 100);
    assert.ok(!types(run(none, 0.1, {}, { dodge: true })).includes('dodge'), 'no ability, no roll');
    const sim = mk(); at(sim, 100, 100);
    const ev = run(sim, 0.02, { mx: 1 }, { dodge: true });
    assert.ok(types(ev).includes('dodge')); assert.equal(sim.player.state, 'dodge');
    assert.equal(Math.round(sim.player.stamina), 75);
    let first = -1; let last = -1; let endX = null;
    for (let i = 0; i < 40; i++) {
      step(sim, DT, { mx: 1, my: 0, action: A(), hold: {} });
      if (sim.invuln > 0 && sim.player.state === 'dodge') { if (first < 0) first = sim.player.stateT; last = sim.player.stateT; }
      if (endX == null && sim.player.state !== 'dodge') endX = sim.chariot.x;
    }
    assert.ok(first <= 0.07 && last >= 0.25 && last <= 0.32, `i-frames from ${first} to ${last}`);
    assert.ok(Math.abs(endX - (100 + COMBAT.dodge.distance)) < 20, `rolled about 110 units (${endX - 100})`);
    assert.ok(endX != null, 'roll is over after 0.36 s');
    const quick = mk(); at(quick, 100, 100); run(quick, 0.02, { mx: 1 }, { dodge: true }); run(quick, 0.36, { mx: 1 });
    assert.notEqual(quick.player.state, 'dodge');
    assert.ok(!types(run(quick, 0.05, { mx: 1 }, { dodge: true })).includes('dodge'), 'cooldown 0.55 s blocks a second roll straight after the first');
    run(quick, 0.5, {}); assert.ok(types(run(quick, 0.1, { mx: 1 }, { dodge: true })).includes('dodge'), 'and it is available again afterwards');
  });

  test('phase2 dodge: stamina limits rolls, "tired" is an event, and stamina comes back', () => {
    const sim = mk(); at(sim, 60, 100);
    let rolls = 0; let tired = 0;
    for (let n = 0; n < 8; n++) { const ev = run(sim, 0.6, { mx: 0, my: n % 2 ? -1 : 1 }, { dodge: true }); rolls += types(ev).filter((t) => t === 'dodge').length; tired += types(ev).filter((t) => t === 'tired').length; at(sim, 60, 100); }
    assert.ok(rolls >= 3 && rolls <= 5, `a burst of ${rolls} rolls then empty`); assert.ok(tired >= 1);
    const low = sim.player.stamina; run(sim, 3);
    assert.ok(sim.player.stamina > low + 50, `regenerates (${low} -> ${sim.player.stamina})`);
    run(sim, 3); assert.equal(sim.player.stamina, COMBAT.stamina.max);
  });

  test('phase2 dodge: a roll through a raider\'s strike avoids the damage; the same strike without a roll hurts', () => {
    const hit = duel(); winding(hit, 0.3); run(hit, 0.3); assert.equal(hit.health, 90, 'baseline: the blow lands for 10');
    const sim = duel(); winding(sim, 0.3);
    const ev = run(sim, 0.3, { mx: 0, my: 1 }, { dodge: true });
    assert.equal(sim.health, 100); assert.ok(types(ev).includes('whiff'), 'the blow whiffs'); assert.ok(!types(ev).includes('hurt'));
  });

  test('phase2 dodge: a roll cannot pass a low wall', () => {
    const w = mk(['########', '#S..=..#', '#...=.1#', '########'], {}, { abilities: FULL }); at(w, 100, 60);
    run(w, 0.5, { mx: 1 }, { dodge: true });
    assert.ok(w.chariot.x < 160, `stopped by the low wall (${w.chariot.x})`);
  });

  // ---------- shove ----------
  test('phase2 shove: needs push, knocks a raider back ~80 units, staggers it, deals no damage, costs 15 stamina', () => {
    const no = duel({ abilities: ['staff'] }); assert.ok(!types(run(no, 0.4, {}, { push: true })).includes('shove'));
    const sim = duel(); const e = sim.enemies[0]; const x0 = e.x; e.state = 'chase'; e.cd = 5;
    const ev = run(sim, 0.5, {}, { push: true });
    assert.ok(types(ev).includes('shove') && types(ev).includes('shove-hit'));
    assert.ok(!types(ev).includes('hit-enemy'), 'a shove is not a blow'); assert.equal(e.hp, 3);
    assert.ok(e.x - x0 > 60 && e.x - x0 < 100, `knocked back ${e.x - x0}`);
    assert.equal(e.state, 'stagger'); assert.equal(Math.round(sim.player.stamina), 85);
  });

  test('phase2 shove: shoving a raider mid wind-up cancels its blow', () => {
    const sim = duel(); const e = winding(sim, 0.2);
    run(sim, 0.2, {}, { push: true });
    assert.equal(e.state, 'stagger'); run(sim, 0.6); assert.equal(sim.health, 100);
  });

  test('phase2 shove: off a ledge into a pit the raider falls and is out of the fight (no damage, no corpse); the player cannot walk into a pit', () => {
    const sim = mk(PIT, {}, { weapon: 'staff' });
    const e = { ...mkEnemy(), x: 3 * 40 + 20, y: 60, state: 'chase', cd: 9 }; sim.enemies = [e];
    at(sim, e.x - 34, e.y, 0);
    const ev = run(sim, 0.7, {}, { push: true });
    assert.ok(types(ev).includes('enemy-fell'), types(ev).join());
    assert.equal(e.state, 'down'); assert.equal(e.fell, true); assert.equal(e.hp, 3, 'a fall costs no health'); assert.ok(!types(ev).includes('enemy-down'));
    const p = mk(PIT); p.enemies = []; at(p, 6 * 40 + 20, 100, 0); run(p, 2, { mx: 0, my: -1 });
    assert.ok(p.chariot.y > 80 - 1, `the player stops at the pit edge (${p.chariot.y})`);
  });

  test('phase2 shove: a wall stops the knock-back, nobody is pushed through it', () => {
    const sim = duel(); const e = sim.enemies[0]; e.x = 20 * 40 - 40 - 14; at(sim, e.x - 30, 100, 0); e.state = 'chase'; e.cd = 9;
    run(sim, 0.6, {}, { push: true }); assert.ok(e.x < 19 * 40, `inside the map (${e.x})`);
  });

  // ---------- climb ----------
  const LEDGE = ['############', '#S...H.....#', '#....H....1#', '#....H.....#', '############'];
  test('phase2 climb: needs the ability, crosses a marked ledge in 1.1 s, invulnerable, lands on the far side; without it the ledge blocks', () => {
    const none = mk(LEDGE, {}, { abilities: ['vault', 'crouch'] }); at(none, 160, 60);
    run(none, 0.3, { mx: 1 }); assert.ok(!types(run(none, 0.2, { mx: 1 }, { jump: true })).includes('climb'));
    run(none, 1.5, { mx: 1 }); assert.ok(none.chariot.x < 200, 'the ledge blocks without the ability');
    const sim = mk(LEDGE); at(sim, 160, 60);
    run(sim, 0.3, { mx: 1 });
    const ev = run(sim, 0.05, { mx: 1 }, { jump: true });
    assert.ok(types(ev).includes('climb')); assert.equal(sim.player.state, 'climb');
    run(sim, 0.5); assert.ok(sim.invuln > 0 && sim.player.state === 'climb', 'still climbing at 0.55 s');
    run(sim, 0.65); assert.notEqual(sim.player.state, 'climb'); assert.ok(sim.chariot.x > 6 * 40 + 10, `landed beyond (${sim.chariot.x})`);
  });

  test('phase2 climb: a plain low wall is not climbable and a ledge is not vaultable (each ability has its own obstacle)', () => {
    const l = mk(LEDGE, {}, { abilities: ['vault'] }); at(l, 160, 60); run(l, 0.3, { mx: 1 });
    assert.ok(!types(run(l, 0.1, { mx: 1 }, { jump: true })).includes('vault'));
    const w = mk(['########', '#S..=..#', '#...=.1#', '########'], {}, { abilities: ['climb'] }); at(w, 100, 60); run(w, 0.3, { mx: 1 });
    assert.ok(!types(run(w, 0.1, { mx: 1 }, { jump: true })).includes('climb'));
  });

  // ---------- sword ----------
  test('phase2 sword: light cut 1 damage 10 stamina; heavy cut 2 damage 30 stamina with a 0.46 s visible wind-up; heavy needs stamina; the staff is free', () => {
    const sim = duel(); const e = sim.enemies[0]; e.state = 'chase'; e.cd = 9;
    const ev = run(sim, 0.3, {}, { attack: true });
    assert.ok(types(ev).includes('swing') && types(ev).includes('hit-enemy')); assert.equal(e.hp, 2); assert.equal(Math.round(sim.player.stamina), 90);
    const h = duel(); const he = h.enemies[0]; he.state = 'chase'; he.cd = 9;
    run(h, 0.3, {}, { heavy: true }); assert.equal(he.hp, 3, 'no damage during the wind-up'); assert.equal(h.player.state, 'attack');
    const f = makeFrame(h, { shake: 0, flash: 0 }, false); assert.equal(f.attack.kind, 'heavy'); assert.ok(f.attack.progress > 0.3 && f.attack.progress < 0.5);
    run(h, 0.3); assert.equal(he.hp, 1, 'then 2 damage'); assert.equal(Math.round(h.player.stamina), 70);
    const tired = duel(); tired.player.stamina = 20;
    assert.ok(types(run(tired, 0.2, {}, { heavy: true })).includes('tired')); assert.equal(tired.player.state, 'idle');
    const staff = duel({ weapon: 'staff' }); run(staff, 0.3, {}, { attack: true }); assert.equal(staff.player.stamina, 100);
  });

  test('phase2 sword: swap cycles staff -> sword -> bow -> hands; 1/2/3 pick directly; only earned weapons', () => {
    const sim = mk(OPEN, {}, { weapon: 'staff' });
    assert.equal(sim.player.weapon, 'staff');
    for (const w of ['sword', 'bow', 'none', 'staff']) { run(sim, 0.05, {}, { swap: true }); assert.equal(sim.player.weapon, w); }
    run(sim, 0.05, {}, { w3: true }); assert.equal(sim.player.weapon, 'bow'); run(sim, 0.05, {}, { w2: true }); assert.equal(sim.player.weapon, 'sword');
    const half = mk(OPEN, {}, { abilities: ['staff'], weapon: 'staff' }); run(half, 0.05, {}, { w3: true }); assert.equal(half.player.weapon, 'staff');
  });

  test('phase2 block: holding block stops the blow for 15 stamina and no damage; only in front; block needs the sword', () => {
    const sim = duel(); run(sim, 0.4, { hold: { block: true } }); winding(sim, 0.3); // the guard is already up: a block, not a parry
    run(sim, 0.4, { hold: { block: true } });
    assert.equal(sim.health, 100); assert.equal(sim.player.state, 'block');
    assert.equal(Math.round(sim.player.stamina), 85);
    const back = duel(); at(back, 200, 100, Math.PI); run(back, 0.4, { hold: { block: true } }); winding(back, 0.3);
    run(back, 0.4, { hold: { block: true } }); assert.equal(back.health, 90, 'a blow from behind is not blocked');
    const staff = duel({ weapon: 'staff' }); winding(staff, 0.3); run(staff, 0.4, { hold: { block: true } }); assert.equal(staff.health, 90, 'no sword, no block');
  });

  test('phase2 parry: a block raised just before the blow lands (0.25 s window) staggers the raider 1.8 s; a late block only blocks', () => {
    const sim = duel(); const e = winding(sim, 0.4);
    const ev = run(sim, 0.2, { hold: { block: true } });
    assert.ok(types(ev).includes('parry')); assert.equal(e.state, 'stagger'); assert.equal(e.stagDur, COMBAT.block.parryStagger); assert.equal(sim.health, 100);
    const late = duel(); run(late, 0.6, { hold: { block: true } });
    const e2 = winding(late, 0.4); const ev2 = run(late, 0.2, { hold: { block: true } });
    assert.ok(!types(ev2).includes('parry') && types(ev2).includes('blocked')); assert.notEqual(e2.state, 'stagger');
  });

  test('phase2 block: with no stamina the guard breaks and half the damage lands', () => {
    const sim = duel(); run(sim, 0.3, { hold: { block: true } }); sim.player.stamina = 5; sim.player.stamDelay = 5; winding(sim, 0.3);
    const ev = run(sim, 0.35, { hold: { block: true } });
    assert.equal(sim.health, 95); assert.ok(types(ev).includes('guard-break'));
  });

  // ---------- bow ----------
  const RANGE = ['####################', '#S.................#', '#..................#', '#..................#', '#.................1#', '####################'];
  const bowSim = (o = {}) => { const s = mk(RANGE, {}, { weapon: 'bow', ...o }); at(s, 60, 100, 0); return s; };
  test('phase2 bow: needs the ability; a short draw does nothing and costs nothing; a full draw (0.9 s) does 2 damage', () => {
    const none = mk(RANGE, {}, { abilities: ['staff'], weapon: 'staff' }); at(none, 60, 100);
    run(none, 1, { hold: { aim: true } }); assert.notEqual(none.player.state, 'aim');
    const sim = bowSim(); assert.equal(sim.player.arrows, 6);
    sim.enemies = [{ ...mkEnemy(), x: 300, y: 100, state: 'patrol', aware: false }];
    run(sim, 0.1, { hold: { aim: true } }); assert.equal(sim.player.state, 'aim'); assert.ok(sim.player.draw > 0 && sim.player.draw < 0.2);
    const ev = run(sim, 0.01, { hold: {} }); assert.ok(types(ev).includes('unnock') && !types(ev).includes('shot')); assert.equal(sim.player.arrows, 6);
    run(sim, 1.0, { hold: { aim: true } }); assert.equal(sim.player.draw, COMBAT.bow.drawTime);
    assert.equal(makeFrame(sim, { shake: 0, flash: 0 }, false).player.draw, 1);
    const shot = run(sim, 0.01, { hold: {} }); assert.ok(types(shot).includes('shot')); assert.equal(sim.player.arrows, 5);
    const hit = run(sim, 0.6); assert.ok(types(hit).includes('hit-enemy')); assert.equal(sim.enemies[0].hp, 1, 'full draw: 2 damage');
  });

  test('phase2 bow: arrows are limited; none left refuses the draw; a missed arrow lands as a pickup that can be taken again, up to 12 carried', () => {
    const sim = bowSim(); sim.player.arrows = 1;
    run(sim, 1.0, { hold: { aim: true } }); run(sim, 0.01, { hold: {} });
    assert.equal(sim.player.arrows, 0);
    run(sim, 1.2);
    const dropped = sim.pickups.filter((k) => k.kind === 'arrows'); assert.equal(dropped.length, 1, 'the spent arrow lies where it landed');
    assert.ok(dropped[0].x < 19 * 40, 'not inside the wall');
    const ev = run(sim, 0.5, { hold: { aim: true } }); run(sim, 0.01, { hold: {} });
    assert.ok(types(ev).includes('no-arrows')); assert.notEqual(sim.player.state, 'aim');
    at(sim, dropped[0].x - 10, dropped[0].y, 0); run(sim, 0.05, {}, { interact: true });
    assert.equal(sim.player.arrows, 1); assert.equal(dropped[0].taken, true);
    const full = bowSim(); full.player.arrows = 12; full.pickups.push({ id: 'q', x: 60, y: 100, kind: 'arrows', n: 6, taken: false });
    run(full, 0.05, {}, { interact: true }); assert.equal(full.player.arrows, 12); assert.equal(full.pickups[0].taken, false, 'a full quiver leaves the arrows on the ground');
    full.player.arrows = 8; run(full, 0.05, {}, { interact: true }); assert.equal(full.player.arrows, 12, 'capped at 12');
  });

  test('phase2 bow: pool fixed at 16, auto-aim snaps to a post within a small cone, posts take the hit, a wall stops the arrow', () => {
    const sim = bowSim();
    assert.equal(sim.arrows.length, 16);
    sim.targets = [{ id: 't1', x: 300, y: 130, radius: 16, flash: 0, hits: 0 }];
    run(sim, 1.0, { hold: { aim: true } }); const shot = run(sim, 0.01, { hold: {} }); assert.ok(types(shot).includes('shot'));
    const ev = run(sim, 0.8); assert.ok(types(ev).includes('target-hit'), 'auto-aim found the post'); assert.equal(sim.targets[0].hits, 1);
    assert.equal(sim.arrows.length, 16);
    const wall = mk(['####################', '#S.....#...........#', '#......#..........1#', '####################'], {}, { weapon: 'bow' }); at(wall, 60, 60, 0);
    wall.enemies = [{ ...mkEnemy(), x: 400, y: 60, state: 'patrol', aware: false }];
    run(wall, 1.0, { hold: { aim: true } }); run(wall, 0.01, { hold: {} }); run(wall, 1, {}); assert.equal(wall.enemies[0].hp, 3, 'the wall stopped the arrow');
  });

  // ---------- enemy AI fairness ----------
  test('phase2 AI: every blow is telegraphed for at least 0.5 s (state windup) before it can hurt, and the frame carries the progress', () => {
    const sim = duel({ dist: 28 }); const e = sim.enemies[0]; e.state = 'chase'; e.cd = 0; e.lastX = 200; e.lastY = 100;
    let t0 = null; let hurtAt = null;
    for (let i = 0; i < 240 && hurtAt == null; i++) {
      const ev = step(sim, DT, { mx: 0, my: 0, action: A(), hold: {} });
      if (e.state === 'windup' && t0 == null) t0 = sim.elapsed;
      if (ev.some((x) => x.type === 'hurt')) hurtAt = sim.elapsed;
    }
    assert.ok(t0 != null && hurtAt != null, 'the raider winds up then strikes');
    assert.ok(hurtAt - t0 >= COMBAT.raider.windup - 2 * DT, `wind-up lasted ${(hurtAt - t0).toFixed(2)} s`);
    assert.equal(sim.health, 90);
    const w = duel(); winding(w, 0.3);
    const f = makeFrame(w, { shake: 0, flash: 0 }, false); assert.ok(f.enemies[0].windup > 0.5 && f.enemies[0].windup < 1);
  });

  test('phase2 AI: a hit raider staggers readably, recovers to alert, and cannot be stun-locked (0.6 s poise)', () => {
    const sim = duel(); const e = sim.enemies[0]; e.state = 'chase'; e.cd = 9;
    run(sim, 0.2, {}, { attack: true }); assert.equal(e.state, 'stagger'); assert.equal(e.stagDur, ATTACKS.light.stagger);
    run(sim, 0.9); assert.equal(e.state, 'alert'); assert.ok(e.poise > 0);
    at(sim, e.x - 30, e.y, 0); sim.player.cooldown = 0;
    run(sim, 0.2, {}, { attack: true }); assert.notEqual(e.state, 'stagger', 'right after recovering it cannot be staggered again'); assert.equal(e.hp, 1);
  });

  test('phase2 AI: two raiders never wind up at the same time', () => {
    const sim = mk(OPEN, {}, { weapon: 'sword' }); at(sim, 200, 100, 0);
    sim.enemies = [{ ...mkEnemy(), id: 'a1', x: 228, y: 90, state: 'chase', cd: 0, lastX: 200, lastY: 100 }, { ...mkEnemy(), id: 'a2', x: 228, y: 115, state: 'chase', cd: 0, lastX: 200, lastY: 100 }];
    let both = 0; let some = 0;
    for (let i = 0; i < 400; i++) { step(sim, DT, { mx: 0, my: 0, action: A(), hold: {} }); sim.health = 100; const n = sim.enemies.filter((e) => e.state === 'windup').length; if (n > 1) both++; if (n === 1) some++; }
    assert.equal(both, 0); assert.ok(some > 0);
  });

  test('phase2 sparring partner: telegraphs 0.8 s, never hurts, cannot be driven off, and a block or parry works on it', () => {
    const sim = duel({ kind: 'sparrer', dist: 36 }); const e = sim.enemies[0]; e.state = 'chase'; e.cd = 0; e.lastX = 200; e.lastY = 100;
    let tap = 0;
    for (let i = 0; i < 600; i++) { const ev = step(sim, DT, { mx: 0, my: 0, action: A(), hold: {} }); tap += types(ev).filter((t) => t === 'tap').length; }
    run(sim, 0.1, {}, { attack: true }); assert.ok(sim.enemies[0].hp >= 1);
    assert.ok(tap >= 1, 'the stick taps'); assert.equal(sim.health, 100); assert.ok(e.hp >= 1 && e.state !== 'down', 'cannot be driven off');
    const p = duel({ kind: 'sparrer', dist: 36 }); winding(p, 0.7); const ev = run(p, 0.2, { hold: { block: true } });
    assert.ok(types(ev).includes('parry') || types(ev).includes('blocked')); assert.equal(p.health, 100);
  });

  // ---------- determinism, hash, save/load ----------
  const script = (sim) => {
    const ev = [];
    const plan = [[0.2, { mx: 1 }, {}], [0.1, { mx: 1 }, { dodge: true }], [0.5, { mx: 1 }, { attack: true }], [0.3, { hold: { block: true } }, {}], [0.4, {}, { push: true }], [1.1, { hold: { aim: true } }, {}], [0.2, {}, { heavy: true }], [0.5, { mx: -1, my: 1 }, { swap: true }], [0.6, { mx: 0, my: -1 }, {}]];
    for (const [s, c, a] of plan) ev.push(...run(sim, s, c, a));
    return ev;
  };
  test('phase2 determinism: the same seed and controls give the same state hash and events; the hash moves as the sim runs', () => {
    const mkp = (seed) => { const s = mk(RANGE, {}, { weapon: 'sword', seed }); at(s, 100, 100, 0); s.enemies = [{ ...mkEnemy(), x: 160, y: 100, state: 'chase', lastX: 100, lastY: 100 }]; return s; };
    const a = mkp(7); const b = mkp(7);
    const before = stateHash(mkp(7)); assert.equal(before, stateHash(mkp(7)));
    const ea = script(a); const eb = script(b);
    assert.equal(stateHash(a), stateHash(b)); assert.deepEqual(ea, eb);
    assert.match(stateHash(a), /^[0-9a-f]{8}$/); assert.notEqual(stateHash(a), before);
    assert.ok(ea.length > 5, 'the script did things');
  });

  test('phase2 hash covers the new state: stamina, arrows, drawn bow', () => {
    const s = bowSim(); const h0 = stateHash(s);
    s.player.stamina -= 10; const h1 = stateHash(s); assert.notEqual(h0, h1);
    s.player.arrows -= 1; const h2 = stateHash(s); assert.notEqual(h1, h2);
    s.player.draw = 0.5; assert.notEqual(stateHash(s), h2);
  });

  const store = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, v); }, m }; };
  test('phase2 save/load: new abilities and the best weapon round-trip; a sword without the staff, an unknown id, junk and blocked storage fall back safely', () => {
    const st = store(); const forgeGrants = ['dodge', 'push', 'climb', 'sword', 'bow'];
    let p = recordCompletion(defaultProgress(), 'sangam-staff', 100, ['staff'], 'staff');
    p = recordCompletion(p, 'gupta-forge', 300, forgeGrants, bestWeapon(forgeGrants));
    assert.ok(saveProgress(p, st));
    const q = loadProgress(st); assert.deepEqual(q.abilities, ['walk', 'run', 'dodge', 'push', 'climb', 'staff', 'sword', 'bow']); assert.equal(q.weapon, 'bow'); assert.ok(q.completed['gupta-forge']);
    assert.deepEqual(validateProgress({ v: 1, abilities: ['sword', 'bow', 'dodge'], weapon: 'bow', completed: {} }).abilities, ['walk', 'run', 'dodge']);
    assert.equal(validateProgress({ v: 1, abilities: ['sword', 'bow', 'dodge'], weapon: 'bow' }).weapon, 'none');
    assert.deepEqual(validateProgress({ v: 1, abilities: ['staff', 'laser', 7, null, '__proto__'], weapon: 'staff' }).abilities, ['walk', 'run', 'staff']);
    st.setItem(PROGRESS_KEY, '{"v":1,"abilities":'); assert.deepEqual(loadProgress(st), defaultProgress());
    assert.deepEqual(loadProgress({ getItem() { throw new Error('blocked'); } }), defaultProgress());
    assert.equal(saveProgress(p, { setItem() { throw new Error('full'); } }), false);
    assert.ok(ABILITY_IDS.includes('dodge') && ABILITY_IDS.includes('bow'));
  });

  // ---------- objectives ----------
  test('phase2 objectives: do and defeat count events (via and heavy filters), validate definitions, and the win needs every required one', () => {
    const defs = [{ id: 'r', type: 'do', event: 'dodge', count: 2 }, { id: 's', type: 'do', event: 'target-hit', via: 'shove', count: 1 }, { id: 'h', type: 'do', event: 'swing', heavy: true, count: 1 }, { id: 'd', type: 'defeat', count: 2 }, { id: 'p', type: 'do', event: 'parry', count: 1, optional: true }];
    assert.deepEqual(validateObjectiveDefs(defs, 1), []);
    assert.ok(validateObjectiveDefs([{ id: 'x', type: 'do', event: 'sneeze', count: 1 }], 1).length >= 1);
    assert.ok(validateObjectiveDefs([{ id: 'x', type: 'defeat', count: 0 }], 1).length >= 1);
    const o = createObjectives(defs, 1); const get = (id) => o.items.find((i) => i.id === id);
    const feed = (e) => updateObjectives(o, e);
    feed({ type: 'dodge' }); assert.equal(get('r').progress, 1); feed({ type: 'dodge' }); assert.equal(get('r').state, 'done');
    feed({ type: 'target-hit', via: 'arrow' }); assert.equal(get('s').state, 'active', 'an arrow is not a shove');
    feed({ type: 'target-hit', via: 'shove' }); assert.equal(get('s').state, 'done');
    feed({ type: 'swing', heavy: false }); assert.equal(get('h').state, 'active'); feed({ type: 'swing', heavy: true }); assert.equal(get('h').state, 'done');
    feed({ type: 'enemy-down' }); feed({ type: 'enemy-fell' }); assert.equal(get('d').state, 'done');
    assert.equal(objectivesStatus(o), 'playing', 'the checkpoint is still to do'); feed({ type: 'checkpoint', n: 1 });
    assert.equal(objectivesStatus(o), 'won', 'the optional parry is not required');
  });

  // ---------- frame, input, hud, renderer ----------
  test('phase2 frame: stamina, draw, arrows, invulnerable roll, targets, arrows in flight, and a JSON-safe snapshot', () => {
    const sim = bowSim(); sim.targets = [{ id: 't1', x: 300, y: 100, radius: 16, flash: 0.3, hits: 0 }];
    run(sim, 1, { hold: { aim: true } }); run(sim, 0.01, { hold: {} });
    sim.targets[0].flash = 0.3;
    const f = makeFrame(sim, { shake: 0, flash: 0 }, false);
    assert.equal(f.arrows.length, 1); assert.equal(f.targets[0].flash, 1); assert.equal(f.player.arrows, 5); assert.ok(f.player.stamina <= 1);
    JSON.stringify(f);
    const d = mk(); at(d, 100, 100); run(d, 0.1, { mx: 1 }, { dodge: true });
    assert.equal(makeFrame(d, { shake: 0, flash: 0 }, false).player.invulnerable, true);
  });

  test('phase2 input: X dodge, V shove, K heavy, R swap, 1/2/3 are edges; B and Z are held, and a tap shorter than one tick still counts', () => {
    const wl = {}; const prev = globalThis.window;
    globalThis.window = { addEventListener: (t, f) => { (wl[t] ||= []).push(f); } };
    try {
      const t = 1000; const sink = { addEventListener() {}, setPointerCapture() {}, getBoundingClientRect: () => ({ left: 0, width: 100 }) };
      const input = createInput({ stage: sink, buttons: [], onPause() {}, now: () => t });
      const key = (type, code, extra = {}) => wl[type].forEach((f) => f({ code, repeat: false, defaultPrevented: false, target: { tagName: 'BODY' }, preventDefault() {}, ...extra }));
      input.state.enabled = true;
      for (const c of ['KeyX', 'KeyV', 'KeyK', 'KeyR', 'Digit1', 'Digit2', 'Digit3']) key('keydown', c);
      const a = input.read().action; for (const n of ['dodge', 'push', 'heavy', 'swap', 'w1', 'w2', 'w3']) assert.equal(a[n], true, n);
      assert.deepEqual(Object.keys(a), ACTION_NAMES); assert.ok(Object.values(input.read().action).every((v) => v === false), 'edges, not held');
      key('keydown', 'KeyB'); assert.equal(input.read().hold.block, true); assert.equal(input.read().hold.block, true, 'still held'); key('keyup', 'KeyB'); assert.equal(input.read().hold.block, false);
      key('keydown', 'KeyZ'); key('keyup', 'KeyZ'); assert.equal(input.read().hold.aim, true, 'a press and release between two reads still counts once'); assert.equal(input.read().hold.aim, false);
      input.state.enabled = false; assert.deepEqual(input.read().hold, { block: false, aim: false });
    } finally { globalThis.window = prev; }
  });

  test('phase2 hud: every new event has a spoken line and a bracketed caption; arrows and stamina are text', async () => {
    const mkEl = () => ({ hidden: false, textContent: '', children: [], dataset: {}, classList: { toggle() {}, add() {}, remove() {} }, style: {}, setAttribute() {}, replaceChildren(...c) { this.children = c; }, append() {}, querySelector: () => null });
    const els = {}; const doc = { getElementById: (id) => (els[id] ||= mkEl()), createElement: mkEl, querySelector: () => null, querySelectorAll: () => [] };
    let now = 0; const hud = createHud(doc, { now: () => now });
    const spoken = {};
    for (const e of [{ type: 'dodge' }, { type: 'tired', what: 'dodge' }, { type: 'climb' }, { type: 'shove-hit' }, { type: 'enemy-fell' }, { type: 'stagger' }, { type: 'blocked' }, { type: 'parry' }, { type: 'guard-break' }, { type: 'tap' }, { type: 'whiff' }, { type: 'shot', arrows: 4 }, { type: 'drawn' }, { type: 'no-arrows' }, { type: 'target-hit' }, { type: 'weapon', weapon: 'sword' }, { type: 'refused' }, { type: 'ability', id: 'dodge' }, { type: 'hit-enemy', via: 'sword' }]) {
      now += 10; hud.handleEvents([e]); await new Promise((r) => setTimeout(r, 40));
      spoken[e.type] = [els.announcer.textContent, els.cue.textContent];
      assert.ok(spoken[e.type][0].length > 3, `${e.type} is announced`); assert.match(spoken[e.type][1], /^\[.+\]$/, `${e.type} has a caption`);
    }
    assert.match(spoken.shot[0], /4 left/); assert.match(spoken['hit-enemy'][1], /Sword/); assert.match(spoken.ability[0], /dodge roll/);
    hud.setVitals({ stamina: 0.2, arrows: 3, draw: 1, drawing: true });
    assert.match(els['stamina-text'].textContent, /20%.*tired/); assert.match(els['arrows-text'].textContent, /3, draw 100% \(full\)/);
    hud.setAbilities({ abilities: ['walk', 'run', 'dodge', 'push', 'climb', 'staff', 'sword'], weapon: 'sword' });
    assert.match(els['kit-text'].textContent, /^Sword\. Can dodge roll, shove, climb/);
  });

  test('phase2 hud: buttons show only for what is earned; every button in index.html has an accessible name', async () => {
    const mkBtn = (control) => ({ dataset: { control }, hidden: true, attrs: {}, classList: { toggle() {} }, setAttribute(k, v) { this.attrs[k] = v; }, querySelector: () => null });
    const btns = ['attack', 'heavy', 'block', 'aim', 'dodge', 'push', 'swap', 'do', 'crouch'].map(mkBtn);
    const mkEl = () => ({ hidden: false, textContent: '', children: [], dataset: {}, classList: { toggle() {}, add() {}, remove() {} }, style: {}, setAttribute() {}, replaceChildren() {}, append() {} });
    const els = {}; const doc = { getElementById: (id) => (els[id] ||= mkEl()), createElement: mkEl, querySelector: (q) => btns.find((b) => q.includes(`"${b.dataset.control}"`)) || null, querySelectorAll: (q) => btns.filter((b) => q.includes(`"${b.dataset.control}"`)) };
    const hud = createHud(doc); const vis = () => Object.fromEntries(btns.map((b) => [b.dataset.control, !b.hidden]));
    hud.setAbilities({ abilities: ['walk', 'run', 'staff'], weapon: 'staff' });
    assert.deepEqual(vis(), { attack: true, heavy: false, block: false, aim: false, dodge: false, push: false, swap: false, do: true, crouch: false });
    hud.setAbilities({ abilities: FULL, weapon: 'sword' });
    assert.deepEqual(vis(), { attack: true, heavy: true, block: true, aim: false, dodge: true, push: true, swap: true, do: true, crouch: true });
    hud.setAbilities({ abilities: FULL, weapon: 'bow' });
    assert.deepEqual(vis(), { attack: false, heavy: false, block: false, aim: true, dodge: true, push: true, swap: true, do: true, crouch: true });
    const html = await readFile(new URL('../../index.html', import.meta.url), 'utf8');
    for (const c of ['attack', 'heavy', 'block', 'aim', 'dodge', 'push', 'swap', 'do']) assert.match(html, new RegExp(`data-control="${c}"[^>]*aria-label="[^"]{4,}"`), `${c} button has an accessible name`);
  });

  test('phase2 2D renderer: draws roll, block, aim, arrows, posts, windup telegraph, ledge, pit and every pickup kind without throwing, also with reduced motion', () => {
    const calls = []; const ctx = new Proxy({}, { get: (_, k) => (k === 'createPattern' ? () => ({}) : k === 'canvas' ? {} : (...a) => { calls.push(k); }), set: () => true });
    const prevDoc = globalThis.document; globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) };
    try {
      const r = createRenderer2D({ width: 0, height: 0, getContext: () => ctx }); r.resize(360, 640, 1);
      r.setWorld({ width: 800, height: 600, walls: [{ x: 0, y: 0, w: 40, h: 40 }] });
      const base = { chariot: { x: 200, y: 200, angle: 0, radius: 14, speed: 0, invulnerable: false }, mode: 'foot', guards: [], checkpoints: [], effects: { shake: 0, flash: 0 }, reducedMotion: false, time: 1, events: [], blood: true };
      r.render({ ...base, player: { state: 'idle', stateT: 0, weapon: 'none', crouch: false }, enemies: [], pickups: [], obstacles: [], attack: { active: false, progress: 0, angle: 0 } });
      const mid = calls.length; r.render({ ...base, player: { state: 'idle', stateT: 0, weapon: 'none', crouch: false }, enemies: [], pickups: [], obstacles: [], attack: { active: false, progress: 0, angle: 0 } });
      const idle = calls.length - mid; let busy = 0;
      for (const [state, weapon, extra] of [['dodge', 'sword', { invulnerable: true }], ['block', 'sword', { blocking: true }], ['aim', 'bow', { draw: 0.6, arrows: 3, aimAngle: 0.2 }], ['shove', 'sword', {}], ['attack', 'sword', {}]]) {
        const before = calls.length;
        r.render({ ...base, reducedMotion: state === 'aim', player: { state, stateT: 0.2, weapon, crouch: false, stamina: 0.5, draw: 0, arrows: 0, ...extra },
          enemies: [{ id: 'a1', x: 260, y: 200, angle: Math.PI, hpFrac: 1, state: 'windup', kind: 'raider', windup: 0.6 }, { id: 'a2', x: 300, y: 240, angle: 0, hpFrac: 1, state: 'stagger', kind: 'sparrer', windup: 0 }],
          targets: [{ id: 't1', x: 320, y: 200, flash: 1 }], arrows: [{ x: 240, y: 200, angle: 0 }],
          pickups: ['dodge', 'push', 'climb', 'sword', 'bow', 'arrows'].map((kind, i) => ({ id: `k${i}`, x: 100 + i * 30, y: 100, kind, taken: false })),
          obstacles: [{ x: 80, y: 300, w: 48, d: 48, kind: 'ledge' }, { x: 140, y: 300, w: 48, d: 48, kind: 'pit' }],
          attack: { active: state === 'attack' || state === 'shove', progress: 0.5, angle: 0, kind: state === 'shove' ? 'shove' : 'heavy', range: 66 } });
        busy += calls.length - before;
      }
      assert.ok(busy > idle * 5 * 3, `the busy frames draw far more (${busy} vs ${idle} per idle frame)`);
    } finally { globalThis.document = prevDoc; }
  });

  // ---------- the new mission ----------
  const mission = JSON.parse(await readFile(new URL('../../missions/gupta-forge.json', import.meta.url), 'utf8'));
  test('phase2 mission gupta-forge: JSON valid, map and objectives agree, labelled, dialogue <= 140 chars, gated behind the staff, playable by link but not yet listed', () => {
    assert.deepEqual(validateMission(mission), []);
    const w = parseLayout(forge);
    assert.equal(w.rules, 2); assert.equal(w.checkpoints.length, mission.objectives.length);
    assert.deepEqual(validateObjectiveDefs(forge.objectives, w.checkpoints.length), []);
    assert.deepEqual(w.pickups.map((k) => k.kind).sort(), ['arrows', 'bow', 'climb', 'dodge', 'push', 'sword']);
    assert.equal(w.spawns.filter((s) => s.kind === 'target').length, 6); assert.equal(w.spawns.filter((s) => s.kind === 'sparrer').length, 1); assert.equal(w.spawns.filter((s) => s.kind === 'raider').length, 2);
    assert.ok(w.obstacles.some((o) => o.kind === 'ledge') && w.obstacles.some((o) => o.kind === 'pit'));
    for (const d of mission.dialogue) assert.ok(d.text.length <= 140, `${d.id} is ${d.text.length} characters`);
    for (const e of mission.events) assert.ok(['History', 'Tradition', 'Invented'].includes(e.label) && e.year);
    assert.ok(mission.events.some((e) => e.label === 'Invented' && e.year === 'Legend'));
    assert.deepEqual(mission.rewards.grants, ['dodge', 'push', 'climb', 'sword', 'bow']);
    assert.deepEqual(missingFor(UNLISTED_MISSIONS[0], ['walk', 'run']), ['Escape from Hastinapur', 'The Night Report of Pataliputra', 'The Pepper Road']);
    assert.deepEqual(missingFor(UNLISTED_MISSIONS[0], ['walk', 'run', 'vault', 'crouch', 'staff']), []);
    assert.equal(pickMissionId('?mission=gupta-forge'), 'gupta-forge'); assert.equal(pickMissionId('?mission=nope'), MISSIONS[0].id);
    assert.ok(!MISSIONS.some((m) => m.id === 'gupta-forge'), 'listed on the chakra only once data/ has its event');
    const col = (k) => w.pickups.find((p) => p.kind === k).x;
    const ledge = Math.min(...w.obstacles.filter((o) => o.kind === 'ledge').map((o) => o.x));
    assert.ok(col('dodge') < col('push') && col('push') < col('climb') && col('climb') < ledge && ledge < col('sword') && col('sword') < col('bow'), 'each lesson comes before the obstacle that needs it, in the order of the docs');
  });

  test('phase2 mission: the dialogue runner plays the teacher on ability, parry, checkpoint 4 and enemy-fell', () => {
    const said = []; const r = createRunner(mission, { onSay: (l) => said.push(l.id) });
    r.start(); r.handle({ type: 'ability', id: 'dodge' }); r.handle({ type: 'ability', id: 'push' }); r.handle({ type: 'parry' }); r.handle({ type: 'checkpoint', n: 4 }); r.handle({ type: 'enemy-fell' });
    assert.deepEqual(said, ['g1', 'a1', 'a2', 'p1', 'c4', 'e1']);
  });

  const ts = 72; const w0 = parseLayout(forge);
  const pick = (sim, kind) => { const k = sim.pickups.find((p) => p.kind === kind && !p.taken); at(sim, k.x - 20, k.y, 0); return run(sim, 0.1, {}, { interact: true }); };
  const cp = (sim, n) => { const c = w0.checkpoints[n - 1]; at(sim, c.x, c.y); return run(sim, 0.05); };
  // Plays the whole yard with scripted controls (warping between yards). Returns the sim and every event.
  function playForge(seed = 11) {
    const sim = createSim(parseLayout(forge), { timerMode: 'off', abilities: ['crouch', 'vault', 'staff'], weapon: 'staff', seed });
    const all = [];
    const go = (secs, c, a) => { const ev = run(sim, secs, c, a); all.push(...ev); return ev; };
    all.push(...pick(sim, 'dodge')); at(sim, 3.5 * ts, 5.5 * ts, 0); go(0.1, { mx: 1 }, { dodge: true }); go(0.7); go(0.1, { mx: 1 }, { dodge: true }); go(0.6);
    all.push(...pick(sim, 'push')); at(sim, 12.5 * ts - 40, 6.5 * ts, 0); go(0.05, {}, {}); go(0.5, {}, { push: true });
    all.push(...pick(sim, 'climb')); at(sim, 20.1 * ts, 5.5 * ts, 0); go(0.3, { mx: 1 }); go(0.05, { mx: 1 }, { jump: true }); go(1.3);
    all.push(...cp(sim, 1));
    all.push(...pick(sim, 'sword')); at(sim, 25 * ts, 2.5 * ts, 0); go(0.1, {}, {}); go(0.5, {}, { attack: true }); go(0.6); go(1.2, {}, { heavy: true }); go(1);
    at(sim, 27 * ts, 6.5 * ts, 0); go(8, { hold: { block: true } });
    all.push(...cp(sim, 2));
    all.push(...pick(sim, 'bow')); all.push(...pick(sim, 'arrows'));
    for (const y of [5.5, 2.5]) { at(sim, 33.5 * ts, y * ts, 0); go(1.1, { hold: { aim: true } }); go(0.01); go(0.9); }
    all.push(...cp(sim, 3));
    at(sim, 40 * ts, 3.5 * ts, 0); go(0.1, {}, { w2: true }); // the road: put the bow away, then a simple bot turns the raiders aside with light cuts
    for (let i = 0; i < 60 * 40 && sim.status === 'playing' && sim.enemies.some((e) => e.kind === 'raider' && e.state !== 'down'); i++) {
      const e = sim.enemies.filter((x) => x.kind === 'raider' && x.state !== 'down').sort((a, b) => Math.hypot(a.x - sim.chariot.x, a.y - sim.chariot.y) - Math.hypot(b.x - sim.chariot.x, b.y - sim.chariot.y))[0];
      const dx = e.x - sim.chariot.x; const dy = e.y - sim.chariot.y; const d = Math.hypot(dx, dy); const near = d < 52;
      all.push(...step(sim, DT, { mx: near ? (dx / d) * 0.1 : dx / d, my: near ? (dy / d) * 0.1 : dy / d, run: false, hold: {}, action: A(near && i % 12 === 0 ? { attack: true } : {}) }));
      sim.health = Math.max(sim.health, 40); // this test is about the route and the objectives, not the health balance
    }
    all.push(...cp(sim, 4));
    return { sim, all };
  }
  test('phase2 mission playthrough: lessons taken in order, every exercise completed, the yard is won', () => {
    const { sim, all } = playForge();
    assert.deepEqual(all.filter((e) => e.type === 'ability').map((e) => e.id), ['dodge', 'push', 'climb', 'sword', 'bow']);
    const st = Object.fromEntries(sim.objectives.items.map((o) => [o.id, o.state]));
    for (const id of ['roll', 'shove', 'climb', 'light', 'heavy', 'block', 'posts', 'turn', 'cp1', 'cp2', 'cp3', 'cp4']) assert.equal(st[id], 'done', `${id}: ${JSON.stringify(st)}`);
    assert.equal(sim.status, 'won');
    assert.ok(sim.enemies.filter((e) => e.kind === 'raider').every((e) => e.state === 'down'));
    assert.ok(all.some((e) => e.type === 'objective'));
  });

  test('phase2 mission playthrough is deterministic: the same seed gives the same final hash and the same events', () => {
    const a = playForge(11); const b = playForge(11);
    assert.equal(stateHash(a.sim), stateHash(b.sim)); assert.deepEqual(a.all, b.all);
  });

  test('phase2 mission: the lessons cannot be skipped (without the climb lesson the ledge holds); raiders stand only in the final yard', () => {
    const sim = createSim(parseLayout(forge), { timerMode: 'off', abilities: ['crouch', 'vault', 'staff'], weapon: 'staff', seed: 3 });
    at(sim, 20.1 * ts, 5.5 * ts, 0); run(sim, 0.3, { mx: 1 }); run(sim, 0.1, { mx: 1 }, { jump: true, interact: true }); run(sim, 2, { mx: 1 });
    assert.ok(sim.chariot.x < 21 * ts, `the ledge holds (${sim.chariot.x})`);
    assert.ok(sim.enemies.filter((e) => e.kind === 'raider').every((e) => e.x / ts > 39), 'raiders only in the final yard');
    assert.ok(sim.enemies.filter((e) => e.kind === 'sparrer').every((e) => e.x / ts > 22 && e.x / ts < 30));
  });

  test('phase2 mission: spent arrows lie where they landed, so a player cannot strand themselves without arrows', () => {
    const sim = createSim(parseLayout(forge), { timerMode: 'off', abilities: ['crouch', 'vault', 'staff', 'sword', 'bow'], weapon: 'bow', seed: 5 });
    at(sim, 33.5 * ts, 7.5 * ts, 0); sim.player.arrows = 6;
    for (let i = 0; i < 6; i++) { run(sim, 1.1, { hold: { aim: true } }); run(sim, 0.01); run(sim, 0.8); }
    assert.equal(sim.player.arrows, 0);
    const back = sim.pickups.filter((k) => k.kind === 'arrows' && !k.taken).length; assert.ok(back >= 5, `${back} arrows recoverable`);
  });
}
