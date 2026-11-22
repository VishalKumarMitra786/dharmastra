// Level 1 rebuilt (CEO, 2026-11-23: "checkpoints as goals feel dull, combat needs to be addictive").
// Covers: wave and boss structure, phases and reinforcements, the style meter and end rank (D to S), the cliffhanger, short objective text, the HUD and end screen markup,
// captions for the new sounds, and headless playthroughs: a bot that fights wins it, an idle bot loses it, a mashing bot is reported. Registered from run.mjs.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseLayout } from '../world.js';
import { createSim, step } from '../sim.js';
import { layout } from '../../missions/dvapara-escape.js';
import { validateMission, createRunner } from '../mission.js';
import { validateObjectiveDefs, currentStage } from '../objectives.js';
import { createStyle, feedStyle, tickStyle, rankResult, rankIndex, RANKS, RANK_AT, HURT_PENALTY, COMBO_WINDOW } from '../style.js';
import { captionFor, announceFor, cueFor } from '../audio.js';
import { chipText } from '../hud.js';
import { COMBAT } from '../combat.js';

const DT = 1 / 60;
const A = (o = {}) => ({ attack: false, jump: false, crouch: false, interact: false, dodge: false, push: false, heavy: false, swap: false, w1: false, w2: false, w3: false, throw: false, drop: false, ...o });
const ROOT = new URL('../../', import.meta.url);
const read = (f) => readFile(new URL(f, ROOT), 'utf8');
const mkSim = (o = {}) => createSim(parseLayout(layout), { timerMode: 'off', seed: 7, ...o });

// ---- the bots. They only press what a person can press. -----------------------------------------------------------------------------------------------
const nearest = (sim) => sim.enemies.filter((e) => e.state !== 'down').sort((a, b) => Math.hypot(a.x - sim.chariot.x, a.y - sim.chariot.y) - Math.hypot(b.x - sim.chariot.x, b.y - sim.chariot.y))[0];
function routeTo(w, from, to) { // BFS over road tiles; returns the next point to steer at
  const ts = w.tileSize; const key = (c, r) => r * w.cols + c; const open = (c, r) => w.solid[r]?.[c] === false;
  const s = [Math.floor(from.x / ts), Math.floor(from.y / ts)]; const g = [Math.floor(to.x / ts), Math.floor(to.y / ts)];
  const prev = new Map([[key(...s), null]]); const q = [s];
  while (q.length) { const [c, r] = q.shift(); if (c === g[0] && r === g[1]) break; for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const n = [c + dc, r + dr]; if (prev.has(key(...n)) || !open(...n)) continue; prev.set(key(...n), [c, r]); q.push(n); } }
  const path = []; for (let p = g; p; p = prev.get(key(...p))) path.push(p); path.reverse();
  const nx = path[1] || path[0]; return { x: (nx[0] + 0.5) * ts, y: (nx[1] + 0.5) * ts };
}
// skill: 'idle' does nothing; 'mash' walks at the nearest enemy and presses attack; 'skilled' also rolls out of wind-ups, parries, shoves shields and uses heavy blows on the captain.
function bot(sim, skill, st) {
  const c = sim.chariot; const w = sim.world; const live = sim.enemies.filter((e) => e.state !== 'down'); const e = nearest(sim);
  let mx = 0; let my = 0; const act = {}; const hold = {};
  if (skill === 'idle') return { mx, my, run: false, hold, action: A() };
  const dir = (p, stop = 0) => { const dx = p.x - c.x; const dy = p.y - c.y; const d = Math.hypot(dx, dy) || 1; return d <= stop ? [0, 0] : [dx / d, dy / d]; };
  if (live.length) {
    const d = Math.hypot(e.x - c.x, e.y - c.y);
    [mx, my] = d > 90 ? dir(routeTo(w, c, e), 0) : dir(e, 46); // walk the road round walls, then close in
    if (d < 70) { st.n += 1; if (st.n % 9 === 0) act.attack = true; }
    if (skill === 'skilled') {
      const st0 = sim.player.stamina;
      if (st0 < 22) act.attack = false; // let the breath come back instead of swinging tired
      const threat = live.filter((o) => (o.atk?.phase === 'windup' || (o.atk?.phase === 'active' && !o.atk.hit)) && Math.hypot(o.x - c.x, o.y - c.y) < o.atk.def.reach + 26).sort((a, b) => (a.atk.windup - a.atk.t) - (b.atk.windup - b.atk.t))[0];
      const left = threat ? (threat.atk.phase === 'windup' ? threat.atk.windup - threat.atk.t : 0) : 9;
      if (threat) {
        act.attack = false; // finish the swing, then answer the wind-up with a guard (parry) or a roll
        if (threat.atk.def.unblockable) { if (left < 0.3 && sim.player.dodgeCd === 0 && st0 > 26) { act.dodge = true; const dx = threat.x - c.x; const dy = threat.y - c.y; const dd = Math.hypot(dx, dy) || 1; mx = dy / dd; my = -dx / dd; } }
        else if (left < 0.13 && st0 >= 15) { hold.block = true; mx = 0; my = 0; }
      }
      if (sim.player.state === 'block' && !threat) hold.block = false;
      if (!threat) {
        if (e.kind === 'shield' && e.guarding && d < 70) { act.attack = false; if (st.n % 12 === 0) act.push = true; }
        if (e.open && d < 70) act.attack = true; // the finisher
        if (e.kind === 'captain' && d < 70 && st.n % 25 === 0 && st0 > 30) { act.attack = false; act.heavy = true; }
      }
    }
  } else {
    const cp = w.checkpoints[sim.checkpoint]; if (cp) [mx, my] = dir(routeTo(w, c, cp));
  }
  return { mx, my, run: !live.length, hold, action: A(act) };
}
// Plays one attempt headless. Returns {status, reason, t, sim, events, said}. `help` keeps health up (so a clumsy bot can still reach the end) and is reported, never hidden.
function play(skill, { seed = 7, secs = 420, help = 0, timerMode = 'off' } = {}) {
  const sim = mkSim({ seed, timerMode }); const st = { n: 0, block: 0 }; const log = []; let t = 0; let healed = 0;
  const runner = createRunner(JSON.parse(globalThis.__dvMissionText), { onSay: (l) => log.push(l.trigger) }); runner.start();
  while (sim.status === 'playing' && t < secs) {
    if (help && sim.health < help) { healed += help - sim.health; sim.health = help; }
    for (const e of step(sim, DT, bot(sim, skill, st))) { log.push(e); runner.handle(e, sim.elapsed); }
    t += DT;
  }
  return { status: sim.status, reason: sim.failReason, t, sim, log, healed };
}

export const __play = (...a) => play(...a);
export function registerDvapara(test) {
  globalThis.__dvMissionText ||= '';
  test('dvapara2 mission file: valid, three named stages, every line within 80 characters even for the longest name, labels kept, cliffhanger present', async () => {
    const text = await read('missions/dvapara-escape.json'); globalThis.__dvMissionText = text; const m = JSON.parse(text);
    assert.deepEqual(validateMission(m), []);
    const { NAME_MAX } = await import('../characters.js');
    for (const d of m.dialogue) assert.ok(d.text.replaceAll('{name}', 'x'.repeat(NAME_MAX)).length <= 80, `${d.id} is too long for a caption`);
    for (const o of m.objectives) assert.ok(o.text.split(' ').length <= 4, `objective "${o.text}" is at most 4 words`);
    assert.ok(m.events.every((e) => ['History', 'Tradition', 'Invented'].includes(e.label) && e.year));
    assert.deepEqual(m.events.map((e) => e.label), ['History', 'History', 'Tradition', 'Invented', 'Invented']);
    assert.ok(m.events.filter((e) => e.label === 'History').every((e) => /BCE/.test(e.year)), 'history points carry a date');
    assert.ok(m.events.filter((e) => e.label !== 'History').every((e) => e.year === 'Legend'));
    const cliff = m.dialogue.filter((d) => d.trigger === 'cliffhanger'); assert.ok(cliff.length >= 2, 'a cliffhanger on the end screen');
    assert.match(cliff[0].text, /Ulka/); assert.match(cliff.at(-1).text, /torch/);
    assert.deepEqual(m.rewards.grants, ['vault']);
  });

  test('dvapara2 layout: no patrols, a chain of waves with a captain boss, objective text of at most 4 words, every spawn on open road and reachable', () => {
    const w = parseLayout(layout);
    assert.equal(layout.guards.length, 0); assert.equal(w.rules, 2); assert.equal(w.checkpoints.length, 3);
    assert.deepEqual(validateObjectiveDefs(layout.objectives, 3), []);
    const waves = layout.objectives.filter((o) => o.type === 'waves'); assert.deepEqual(waves.map((o) => o.id), ['mouth', 'rows', 'bridge']);
    assert.deepEqual(waves.map((o) => o.waves.length), [2, 3, 1]);
    const bridge = waves[2]; assert.equal(bridge.waves[0][0].kind, 'captain'); assert.ok(bridge.reinforce[2].length >= 2); assert.match(bridge.boss, /Kunjara/);
    for (const o of layout.objectives) assert.ok(o.text.replace(/^Optional: /, '').split(' ').length <= 5, `"${o.text}"`);
    const all = [...waves.flatMap((o) => o.waves.flat()), ...bridge.reinforce[2]];
    for (const en of all) {
      const [c, r] = en.at; assert.equal(w.solid[Math.floor(r)]?.[Math.floor(c)], false, `${en.kind} at ${c},${r} stands on a wall`);
      for (const [dx, dy] of [[0.35, 0.35], [-0.35, 0.35], [0.35, -0.35], [-0.35, -0.35]]) assert.equal(w.solid[Math.floor(r + dy)]?.[Math.floor(c + dx)], false, `${en.kind} at ${c},${r} touches a wall`);
    }
    assert.deepEqual(layout.flow, ['mouth', 'cp1', 'rows', 'cp2', 'bridge', 'cp3']);
    const sim = createSim(w, { timerMode: 'off' }); assert.deepEqual(sim.enemies, [], 'nothing on the road until the fight starts');
    const ids = new Set(sim.objectives.items.map((o) => o.id)); for (const id of layout.flow) assert.ok(ids.has(id), `flow id ${id}`);
  });

  test('dvapara2 first seconds: a spearman is already coming and control is yours at once', () => {
    const sim = mkSim(); const ev = [];
    for (let i = 0; i < 30; i++) ev.push(...step(sim, DT, { mx: 1, my: 0, run: true, hold: {}, action: A() }));
    assert.ok(ev.some((e) => e.type === 'wave-start' && e.id === 'mouth' && e.n === 1), 'wave 1 starts at once');
    assert.equal(sim.enemies.length, 1); assert.equal(sim.enemies[0].kind, 'spearman'); assert.ok(sim.enemies[0].aware);
    assert.ok(sim.chariot.x > sim.world.start.x + 20, 'you moved');
  });

  test('dvapara2 waves are gated: lamp rows and the bridge wait for the earlier fight and their checkpoint; the stage text follows the flow', () => {
    const sim = mkSim(); const stage = () => currentStage(sim.objectives, layout.flow);
    assert.equal(stage().id, 'mouth'); assert.equal(stage().text, 'Break the watch');
    sim.chariot.x = sim.world.checkpoints[0].x; sim.chariot.y = sim.world.checkpoints[0].y; // standing at lamp rows does not start its wave while the first fight is open
    for (let i = 0; i < 10; i++) step(sim, DT, { mx: 0, my: 0, hold: {}, action: A() });
    const rows = sim.objectives.items.find((o) => o.id === 'rows'); assert.equal(rows.wave, -1, 'rows waits for mouth');
    const mouth = sim.objectives.items.find((o) => o.id === 'mouth'); mouth.state = 'done';
    for (let i = 0; i < 10; i++) step(sim, DT, { mx: 0, my: 0, hold: {}, action: A() });
    assert.equal(rows.wave, 0, 'rows starts once mouth is done and lamp rows is reached');
    assert.equal(stage().id, 'rows'); assert.deepEqual(stage().progress, { n: 1, total: 3 });
    const bridge = sim.objectives.items.find((o) => o.id === 'bridge'); assert.equal(bridge.wave, -1);
  });

  test('dvapara2 boss: Captain Kunjara changes phase at 2/3 and 1/3 health, two spearmen join at phase 2, the fight is not over until they are down too', () => {
    const sim = mkSim(); sim.objectives.items.find((o) => o.id === 'mouth').state = 'done'; sim.objectives.items.find((o) => o.id === 'rows').state = 'done';
    const cp2 = sim.world.checkpoints[1]; sim.checkpoint = 2; sim.chariot.x = cp2.x; sim.chariot.y = cp2.y;
    const all = []; const tick = (n = 1, hold = {}) => { for (let i = 0; i < n; i++) all.push(...step(sim, DT, { mx: 0, my: 0, hold, action: A() })); };
    tick(5); const cap = sim.enemies.find((e) => e.kind === 'captain'); assert.ok(cap, 'the captain is on the bridge'); assert.equal(sim.enemies.length, 1);
    assert.ok(all.some((e) => e.type === 'wave-start' && e.id === 'bridge'));
    const strike = (hpAfter) => { cap.hp = hpAfter; cap.invul = 0; cap.state = 'chase'; cap.atk = null; const ev = []; sim.player.state = 'idle'; sim.chariot.x = cap.x - 30; sim.chariot.y = cap.y; sim.chariot.moveAngle = 0; ev.push(...step(sim, DT, { mx: 0, my: 0, hold: {}, action: A({ heavy: true }) })); for (let i = 0; i < 40; i++) ev.push(...step(sim, DT, { mx: 0, my: 0, hold: {}, action: A() })); all.push(...ev); return ev; };
    cap.hp = cap.maxHp; strike(Math.floor(cap.maxHp * 0.6)); // a heavy blow: the next hit takes it under two thirds
    assert.ok(all.some((e) => e.type === 'phase' && e.n === 2) || cap.phaseNo >= 2, `phase 2 (hp ${cap.hp}/${cap.maxHp}, phase ${cap.phaseNo})`);
    assert.ok(all.some((e) => e.type === 'reinforce'), 'spearmen join');
    assert.equal(sim.enemies.filter((e) => e.kind === 'spearman' && e.state !== 'down').length, 2);
    sim.enemies.find((e) => e.kind === 'captain').hp = 0; // the captain falls
    cap.state = 'down'; all.push({ type: 'captain-down' });
    const bridge = sim.objectives.items.find((o) => o.id === 'bridge'); assert.equal(bridge.state, 'active', 'the spearmen are still up');
    for (const e of sim.enemies) e.state = 'down';
    tick(3); assert.equal(bridge.state, 'done', 'all down: the bridge is held');
  });

  test('dvapara2 captain phase and reinforcement lines: the runner says the entrance, both phases and the yield, once each', () => {
    const m = JSON.parse(globalThis.__dvMissionText); const said = []; const r = createRunner(m, { onSay: (l) => said.push(l.id) }); r.start();
    r.handle({ type: 'wave-start', id: 'bridge', n: 1 }); r.handle({ type: 'phase', n: 2 }); r.handle({ type: 'phase', n: 3 }); r.handle({ type: 'captain-down' });
    assert.deepEqual(said, ['start-1', 'w-bridge-1', 'phase-1', 'phase-2', 'boss-down']);
    assert.deepEqual(r.lines('cliffhanger').map((l) => l.id), ['cliff-1', 'cliff-2', 'cliff-3']);
    r.handle({ type: 'win', rank: 'S' }); assert.deepEqual(said.slice(-2), ['win-1', 'rank-s-1']);
    assert.deepEqual(validateMission({ ...m, dialogue: [{ id: 'a', speaker: 'b', text: 'c', trigger: 'wave:rows:9' }] }), []);
    assert.equal(validateMission({ ...m, dialogue: [{ id: 'a', speaker: 'b', text: 'c', trigger: 'wave:Rows' }] }).length, 1);
  });

  // ================================================================ style meter and rank
  test('style meter: hits, parries and finishers build it; a longer combo and a mix of moves score more; a blow knocks it down and breaks the combo; idling bleeds it', () => {
    const st = createStyle(); const hit = { type: 'hit-enemy', dmg: 1 };
    feedStyle(st, [hit]); const one = st.meter; assert.ok(one > 0 && st.combo === 1);
    for (let i = 0; i < 9; i++) feedStyle(st, [hit]); assert.equal(st.combo, 10); const tenHits = st.total;
    const mix = createStyle(); for (const e of [hit, { type: 'shove-hit' }, { type: 'parry' }, { type: 'finisher' }, hit, { type: 'shove-hit' }, { type: 'parry' }, { type: 'finisher' }, hit, { type: 'shove-hit' }]) feedStyle(mix, [e]);
    assert.ok(mix.total > tenHits * 1.5, `variety pays (${mix.total.toFixed(0)} vs ${tenHits.toFixed(0)})`);
    const before = st.meter; const ev = feedStyle(st, [{ type: 'hurt', amount: 10 }]);
    assert.equal(st.combo, 0); assert.ok(st.meter <= Math.max(0, before - HURT_PENALTY) + 1e-9); assert.equal(st.hurts, 1); assert.ok(ev.some((e) => e.type === 'combo-end' && e.broken));
    const idle = createStyle(); feedStyle(idle, [hit, hit, hit, hit, hit, hit, hit, hit]); const m0 = idle.meter;
    for (let i = 0; i < 60 * 8; i++) tickStyle(idle, DT); assert.ok(idle.meter < m0 / 2 && idle.combo === 0, 'combo ended and the meter bled away');
    const roll = createStyle(); feedStyle(roll, [hit, hit]); for (let i = 0; i < 60 * (COMBO_WINDOW - 0.3); i++) tickStyle(roll, DT); feedStyle(roll, [{ type: 'dodge' }]); for (let i = 0; i < 60 * 0.8; i++) tickStyle(roll, DT);
    assert.equal(roll.combo, 2, 'a roll keeps the combo alive'); const spam = createStyle(); for (let i = 0; i < 100; i++) feedStyle(spam, [{ type: 'dodge' }]); assert.equal(spam.total, 0, 'rolling alone scores nothing');
  });

  test('style meter: live rank D to S rises through every letter, announces each change, and falls back when you stop or get hit', () => {
    assert.deepEqual(RANKS, ['D', 'C', 'B', 'A', 'S']); assert.equal(rankIndex(0), 0); assert.equal(rankIndex(RANK_AT[4]), 4); assert.equal(rankIndex(RANK_AT[4] - 0.1), 3);
    const st = createStyle(); const seen = []; const mixed = [{ type: 'hit-enemy' }, { type: 'shove-hit' }, { type: 'parry' }, { type: 'finisher' }, { type: 'hit-enemy', heavy: true }];
    for (let i = 0; i < 40 && st.rank < 4; i++) for (const e of feedStyle(st, [mixed[i % 5]])) if (e.type === 'style-rank') seen.push(e.rank);
    assert.deepEqual(seen, ['C', 'B', 'A', 'S']); assert.equal(st.peak, 4);
    const down = feedStyle(st, [{ type: 'hurt' }]); assert.ok(down.some((e) => e.type === 'style-rank' && !e.up), 'a blow drops a rank');
    assert.ok(st.rank < 4 && st.peak === 4);
  });

  test('end rank: D to S from style, combo, blows taken and time; a clean fast fight is S, mashing slowly is not, taking blows costs a letter, the weights add to 100', () => {
    const goal = layout.rank; const pro = createStyle(); pro.total = goal.style; pro.maxCombo = goal.combo; pro.peak = 4; pro.hurts = 0;
    const s = rankResult(pro, goal.parSecs - 10, goal); assert.equal(s.rank, 'S'); assert.equal(s.score, 100);
    const hurt = { ...pro, hurts: 3 }; assert.ok(rankResult(hurt, goal.parSecs, goal).score < s.score && 'ABCD'.includes(rankResult(hurt, goal.parSecs, goal).rank));
    const slow = rankResult(pro, goal.maxSecs + 50, goal); assert.ok(slow.score === 80 && slow.rank === 'A', `slow but flawless is an A (${slow.score})`);
    const mash = createStyle(); mash.total = 60; mash.maxCombo = 3; mash.peak = 1; mash.hurts = 6; const d = rankResult(mash, 300, goal); assert.equal(d.rank, 'D');
    const order = ['D', 'C', 'B', 'A', 'S']; let prev = -1; for (const k of [0, 0.2, 0.4, 0.6, 0.8, 1]) { const x = createStyle(); x.total = goal.style * k; x.maxCombo = Math.round(goal.combo * k); x.peak = Math.round(4 * k); x.hurts = Math.round((1 - k) * 4); const r = order.indexOf(rankResult(x, goal.parSecs + (1 - k) * 100, goal).rank); assert.ok(r >= prev, 'better play never ranks lower'); prev = r; }
    assert.equal(prev, 4, 'and the best play reaches S'); assert.ok(Object.values(rankResult(pro, 0, goal).part).reduce((a, b) => a + b, 0) === 100);
  });

  // ================================================================ headless playthroughs
  test('dvapara2 headless: a fighting bot wins the level (all three fights, the captain, the gate), reaches a rank and the win event carries it', () => {
    const r = play('skilled', { seed: 7, help: 0 });
    const types = r.log.filter((e) => e.type).map((e) => e.type); const count = (t) => types.filter((x) => x === t).length;
    console.log(`   skilled bot: ${r.status} (${r.reason}) in ${r.t.toFixed(0)}s, health ${r.sim.health}, rank ${r.sim.result?.rank} score ${r.sim.result?.score}, combo ${r.sim.style.maxCombo}, hurts ${r.sim.style.hurts}, parries ${r.sim.style.parries}, helped ${Math.round(r.healed)}`);
    assert.equal(r.status, 'won', `skilled bot: ${r.status} ${r.reason} after ${r.t.toFixed(0)}s`);
    for (const id of ['mouth', 'rows', 'bridge', 'cp1', 'cp2', 'cp3']) assert.equal(r.sim.objectives.items.find((o) => o.id === id).state, 'done', id);
    assert.equal(count('wave-start'), 6); assert.equal(count('captain-down'), 1); assert.ok(count('phase') >= 1, 'the captain changed stance'); assert.ok(count('reinforce') >= 2);
    assert.ok(count('enemy-down') >= 13, `all ${count('enemy-down')} fell`);
    assert.ok(r.sim.result && RANKS.includes(r.sim.result.rank)); assert.equal(r.log.find((e) => e.type === 'win').rank, r.sim.result.rank);
    assert.ok(r.log.includes('start') && r.log.includes('wave:bridge:1') && r.log.includes('captain-down'), 'the story lines fired');
  });

  test('dvapara2 headless: an idle bot loses (defeated by the first spearman), a timed run runs out, and a mashing bot is reported', () => {
    const idle = play('idle', { seed: 3, secs: 120 });
    assert.equal(idle.status, 'failed'); assert.equal(idle.reason, 'defeated'); assert.equal(idle.sim.objectives.items.find((o) => o.id === 'mouth').state, 'active');
    assert.ok(idle.log.some((e) => e.type === 'fail'));
    const timed = mkSim({ timerMode: 'standard' }); timed.health = 1e9; let ev = []; for (let i = 0; i < 60 * (layout.timeLimit + 3) && timed.status === 'playing'; i++) ev = step(timed, DT, { mx: 0, my: 0, hold: {}, action: A() });
    assert.equal(timed.status, 'failed'); assert.equal(timed.failReason, 'time'); assert.ok(layout.timeLimit >= 240 && layout.timeLimit <= 360);
    const mash = play('mash', { seed: 5, secs: 300 });
    console.log(`   mashing bot: ${mash.status} (${mash.reason}) in ${mash.t.toFixed(0)}s, health ${mash.sim.health}, rank ${mash.sim.result?.rank ?? '-'}, combo ${mash.sim.style.maxCombo}, hurts ${mash.sim.style.hurts}`);
    assert.ok(['won', 'failed'].includes(mash.status));
    if (mash.status === 'won') assert.ok(!['S', 'A'].includes(mash.sim.result.rank), `button mashing must not earn an ${mash.sim.result.rank}`);
  });

  test('dvapara2 headless: the same seed plays out the same way twice', () => {
    const a = play('skilled', { seed: 11, secs: 200 }); const b = play('skilled', { seed: 11, secs: 200 });
    assert.equal(a.status, b.status); assert.equal(a.sim.style.total.toFixed(3), b.sim.style.total.toFixed(3)); assert.equal(a.sim.enemies.length, b.sim.enemies.length);
  });

  test('dvapara2 rank spread: over several seeds the skilled bot ranks higher than the mashing bot', () => {
    const order = 'DCBAS'; const score = (b, seed) => { const r = play(b, { seed, secs: 330 }); return r.sim.result ? r.sim.result.score : 0; };
    let skilled = 0; let mash = 0; for (const seed of [21, 22, 23]) { skilled += score('skilled', seed); mash += score('mash', seed); }
    console.log(`   rank spread (3 seeds): skilled ${skilled}, mash ${mash} (points out of 300; ${order})`);
    assert.ok(skilled > mash, 'skill is rewarded');
  });

  // ================================================================ hud, end screen, audio captions
  test('dvapara2 HUD markup: a big style rank with combo, a boss bar, a named live region, the end screen shows rank and cliffhanger; nothing relies on colour alone', async () => {
    const html = await read('index.html'); const css = await read('src/styles.css');
    assert.match(html, /id="style"[^>]*role="group"[^>]*aria-label="Style"/); assert.match(html, /id="style-rank"/); assert.match(html, /id="style-combo"/); assert.match(html, /id="style-fill"/);
    assert.match(html, /id="boss"[^>]*role="meter"[^>]*aria-label/); assert.match(html, /id="boss-phase"/);
    assert.match(html, /id="win-rank"/); assert.match(html, /id="win-cliff"/); assert.match(html, /id="win-rankstats"/);
    const rule = (sel) => css.match(new RegExp(`${sel.replace(/[.#]/g, '\\$&')}\\s*\\{([^}]*)\\}`))?.[1] || '';
    const px = (decl, prop) => { const m = decl.match(new RegExp(`${prop}:\\s*([^;]+)`)); return m ? Math.max(...[...m[1].matchAll(/([\d.]+)rem/g)].map((x) => Number(x[1]) * 16), 0) : 0; }; // the largest rem in the value (clamp keeps it inside the type scale rule)
    assert.ok(px(rule('.style-rank'), 'font-size') >= 32, 'the live rank letter is big');
    assert.ok(px(rule('.rank-big'), 'font-size') >= 64, 'the end rank is huge');
    assert.match(css, /prefers-reduced-motion[\s\S]*#style|#style[\s\S]*prefers-reduced-motion/, 'style pops respect reduced motion');
    assert.match(html, /id="style-rank"[^>]*aria-hidden="true"|aria-hidden="true"[^>]*id="style-rank"/, 'the letter is not read twice');
  });

  test('dvapara2 HUD logic: setStyle shows rank and combo as text and shape, announces only rank changes, setBoss shows name, phase and health; hidden when no boss', async () => {
    const { createHud } = await import('../hud.js');
    const mk = () => { const el = { hidden: false, textContent: '', style: {}, attrs: {}, dataset: {}, setAttribute(k, v) { this.attrs[k] = v; }, classList: { add() {}, remove() {}, toggle() {} }, append() {}, replaceChildren() {} }; return el; };
    const els = {}; const doc = { getElementById: (id) => (els[id] ||= mk()), querySelector: () => null, querySelectorAll: () => [], createElement: () => mk() };
    let now = 0; const hud = createHud(doc, { now: () => now });
    hud.setStyle({ rank: 'B', index: 2, meter: 0.5, combo: 7, peak: 2 });
    assert.equal(els['style-rank'].textContent, 'B'); assert.equal(els['style-combo'].textContent, 'x7'); assert.equal(els.style.hidden, false);
    assert.match(els.style.attrs['aria-label'], /Style B, combo 7/); assert.equal(els['style-fill'].style.width, '50%');
    hud.setStyle({ rank: 'D', index: 0, meter: 0, combo: 0, peak: 2 }); assert.equal(els['style-combo'].textContent, ''); assert.equal(els.style.dataset.active, '0');
    hud.setBoss({ name: 'Captain Kunjara', hp: 0.5, phase: 2, phases: 3 });
    assert.equal(els.boss.hidden, false); assert.match(els.boss.attrs['aria-label'], /Captain Kunjara/); assert.match(els.boss.attrs['aria-valuetext'], /phase 2 of 3/); assert.equal(els['boss-phase'].textContent, 'Phase 2/3');
    assert.equal(els['boss-fill'].style.width, '50%'); hud.setBoss(null); assert.equal(els.boss.hidden, true);
    assert.equal(chipText('Out the east gate!'), 'Out the east gate!'); assert.equal(chipText('Break the watch'), 'Break the watch');
  });

  test('dvapara2 end screen: rank letter, stats and the cliffhanger lines are shown; the rank has text, not only colour; a fail screen still offers retry', async () => {
    const { createScreens } = await import('../screens.js');
    const els = {}; const mk = (id) => ({ id, hidden: true, textContent: '', dataset: {}, children: [], focus() {}, setAttribute(k, v) { this.attrs = { ...this.attrs, [k]: v }; }, removeAttribute() {}, querySelector: () => null, replaceChildren(...c) { this.children = c; this.textContent = c.map((x) => x.textContent).join(' '); }, append() {}, classList: { add() {}, remove() {} } });
    const doc = { getElementById: (id) => (els[id] ||= mk(id)), createElement: () => mk('x'), addEventListener() {} }; els.game = mk('game');
    const sc = createScreens(doc);
    const result = { rank: 'A', score: 79, style: 640, maxCombo: 14, peak: 'S', hurts: 1, parries: 4, finishers: 2, downs: 14, time: 183 };
    sc.showWin({ time: '3:03', health: 80 }, [{ label: 'History', name: 'x', year: 'y' }], { speaker: 'Dandaka', text: 'Open.' }, { result, cliff: [{ speaker: 'Kunjara', text: 'Ulka sends word.' }, { speaker: 'Far bank', text: 'A torch goes dark.' }] });
    assert.equal(els['win-rank'].textContent, 'A'); assert.match(els['win-rank'].attrs['aria-label'], /Rank A/); assert.match(els['win-rankstats'].textContent, /Best combo 14/); assert.match(els['win-rankstats'].textContent, /Blows taken 1/);
    assert.equal(els['win-cliff'].hidden, false); assert.match(els['win-cliff'].textContent, /Kunjara: Ulka sends word\./); assert.match(els['win-cliff'].textContent, /torch goes dark/);
    sc.showWin({ time: '3:03', health: 80 }, [], null); assert.equal(els['win-rank'].textContent, ''); assert.equal(els['win-cliff'].hidden, true, 'other levels show no rank or cliffhanger block');
  });

  test('dvapara2 audio: a rank change and a combo end have a caption and a spoken line; the reinforcement horn is captioned; nothing new is silent for the deaf or blind', () => {
    assert.match(captionFor({ type: 'style-rank', rank: 'S', up: true }), /^\[.*S.*\]$/); assert.match(announceFor({ type: 'style-rank', rank: 'S', up: true }), /Style S/);
    assert.match(announceFor({ type: 'style-rank', rank: 'C', up: false }), /Style C/);
    assert.equal(cueFor({ type: 'style-rank', up: true }), 'chime'); assert.equal(cueFor({ type: 'style-rank', up: false }), null);
    assert.match(captionFor({ type: 'reinforce', kind: 'spearman' }), /^\[Horn/); assert.match(announceFor({ type: 'reinforce', kind: 'spearman' }), /spearman/);
  });

  test('dvapara2 game wiring: new-run resets style and boss, the win screen gets the rank and cliffhanger, the hint points at the nearest enemy while one is up, objective chip follows the flow', async () => {
    const g = await read('src/game.js');
    assert.match(g, /currentStage\(/); assert.match(g, /hud\.setStyle\?\.\(/); assert.match(g, /hud\.setBoss\?\.\(/); assert.match(g, /runner\.lines\('cliffhanger'\)/); assert.match(g, /sim\.result/);
    assert.match(g, /trigger !== 'cliffhanger'|CHATTER/);
  });

  test('dvapara2 size and scope: the rebuilt level touches no renderer or artist files', async () => {
    for (const f of ['src/style.js', 'missions/dvapara-escape.js', 'src/test/dvapara2.mjs']) assert.ok((await read(f)).length < 40000, f);
    const sim = await read('src/sim.js'); assert.ok(!/renderer3d|gfx\/human/.test(sim));
    assert.ok(COMBAT.block.parryWindow > 0);
  });
}
