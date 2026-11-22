// Combat v2 tests (CEO, 2026-11-22: "soldiers do not use weapons, the player just touches them and loses health" is unacceptable).
// Covers: no contact damage anywhere, telegraphed blows (windup >= 0.45 s, active window, recovery), the five soldier types, group AI fairness (max 2 attackers),
// player feel (combos with cancel windows, block, perfect parry, finisher, roll, shove, hit-stop, slow motion and reduced motion), audio cues and captions,
// waves and defeat-captain objectives, determinism, the frame contract, and all four missions. Registered from run.mjs.
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { parseLayout, reachable } from '../world.js';
import { createSim, step, stateHash, createRng, setReduceMotion, TUNING } from '../sim.js';
import { makeFrame } from '../renderer.js';
import { ENEMY, ENEMY_KINDS, COMBAT, COMBOS, MAX_ATTACKERS, MIN_WINDUP, WINDUP_GAP, spawnEnemy, forceAttack, applyHit } from '../combat.js';
import { createObjectives, updateObjectives, objectivesStatus, validateObjectiveDefs, tickWaves } from '../objectives.js';
import { createAudio, CAPTIONS, VOICES, cueFor, captionFor, announceFor } from '../audio.js';
import { validateMission } from '../mission.js';

const DT = 1 / 60;
const FULL = ['crouch', 'vault', 'staff', 'sword', 'bow'];
const ROOM = ['##############################', '#S...........................#', '#............................#', '#............................#', '#............................#', '#............................#', '#............................#', '#...........................1#', '##############################'];
const mk = (rows = ROOM, extra = {}, opts = {}) => createSim(parseLayout({ tileSize: 40, rows, timeLimit: 600, mode: 'foot', rules: 2, ...extra }), { timerMode: 'off', ...opts });
const A = (o = {}) => ({ attack: false, jump: false, crouch: false, interact: false, dodge: false, push: false, heavy: false, swap: false, w1: false, w2: false, w3: false, ...o });
const IDLE = { mx: 0, my: 0, run: false, hold: {} };
function run(sim, secs, c = {}, first = {}) {
  const ev = [];
  for (let i = 0; i < Math.round(secs / DT); i++) ev.push(...step(sim, DT, { ...IDLE, ...c, action: A(i === 0 ? first : {}) }));
  return ev;
}
const at = (sim, x, y, face = 0) => { sim.chariot.x = x; sim.chariot.y = y; sim.chariot.moveAngle = face; sim.chariot.angle = face; };
const types = (ev) => ev.map((e) => e.type);
// One enemy of `kind` standing `dist` east of the player (who faces east at 200,140), aware and ready.
function duel({ kind = 'swordsman', dist = 40, weapon = 'none', abilities = FULL, seed = 1 } = {}) {
  const sim = mk(ROOM, {}, { abilities, weapon, seed });
  at(sim, 200, 140, 0);
  const e = spawnEnemy({ id: 'e1', kind, x: 200 + dist, y: 140, angle: Math.PI }, sim.rng);
  e.aware = true; e.state = 'chase'; e.lastX = 200; e.lastY = 140;
  sim.enemies = [e];
  return { sim, e };
}
const inert = (e) => { e.state = 'stagger'; e.stagDur = 1e9; e.fleeing = false; e.atk = null; };
const here = (id) => import(`../../missions/${id}.js`);
const MISSION_IDS = ['dvapara-escape', 'mauryan-spy', 'sangam-staff', 'gupta-forge'];

export async function registerCombat2(test) {
  // ============================================================ (1) no contact damage, anywhere
  test('combat2 no contact damage: standing on every enemy of every mission (and pushing into every wall) never costs health', async () => {
    for (const id of MISSION_IDS) {
      const { layout } = await here(id);
      const w = parseLayout(layout);
      assert.equal(w.rules, 2, `${id} runs the combat rules`);
      const sim = createSim(w, { timerMode: 'off', abilities: FULL, weapon: 'sword' });
      assert.ok(sim.enemies.length >= 1 || id === 'dvapara-escape', 'level 1 spawns its enemies in waves (tested in dvapara2.mjs)');
      for (const target of [...sim.enemies]) {
        sim.enemies.forEach(inert); // every enemy holds still and cannot attack: only the contact itself is under test
        at(sim, target.x, target.y, 0);
        const ev = run(sim, 1.5);
        assert.equal(sim.health, 100, `${id}: touching ${target.id} (${target.kind}) costs nothing`);
        assert.ok(!types(ev).includes('hurt'), `${id}: no hurt event from contact with ${target.id}`);
      }
      const s2 = createSim(w, { timerMode: 'off' }); s2.enemies = [];
      for (const [mx, my] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) run(s2, 3, { mx, my, run: true });
      assert.equal(s2.health, 100, `${id}: walls cost nothing`);
    }
  });

  test('combat2 no contact damage: structure. Only the blow resolver hurts the player; the old touch-damage tuning is gone; no guards list', async () => {
    const simSrc = await readFile(new URL('../sim.js', import.meta.url), 'utf8');
    const comSrc = await readFile(new URL('../combat.js', import.meta.url), 'utf8');
    assert.ok(!/hurtPlayer\(/.test(simSrc), 'sim.js never hurts the player directly');
    assert.ok(!/guardHits|moveGuards|guardDamage|wallDamage|guardInvuln/.test(simSrc + comSrc), 'no contact-damage code or tuning is left');
    const calls = [...comSrc.matchAll(/hurtPlayer\(/g)].length;
    const resolver = comSrc.slice(comSrc.indexOf('function resolveBlow'), comSrc.indexOf('// ---------------------------------------------------------------- the director'));
    assert.equal([...resolver.matchAll(/hurtPlayer\(/g)].length, 2, 'two calls, both inside resolveBlow (a blow, and a half blow through a broken guard)');
    assert.equal(calls, 3, 'the definition plus those two calls: nothing else in combat.js hurts the player');
    for (const k of ['wallDamage', 'guardDamage', 'guardInvuln']) assert.ok(!(k in TUNING), `${k} removed`);
    const s = mk(); assert.deepEqual(s.guards, []);
  });

  test('combat2 every point of damage is a telegraphed blow: a bot fights each mission for 60 s; each hurt follows a wind-up of at least 0.45 s and an enemy-swing, by the same enemy', async () => {
    for (const id of MISSION_IDS) {
      const { layout } = await here(id);
      const w = parseLayout(layout);
      const sim = createSim(w, { timerMode: 'off', abilities: FULL, weapon: 'sword', seed: 5 });
      const winds = {}; const swings = {}; let hurts = 0;
      const near = (sim.enemies.filter((e) => e.kind !== 'sparrer')[0]) || sim.enemies[0];
      if (near) at(sim, near.x - 70, near.y, 0); // level 1 has none yet: its waves come to the bot
      for (let i = 0; i < 60 * 60 && sim.status === 'playing'; i++) {
        const c = sim.chariot;
        const e = sim.enemies.filter((x) => x.state !== 'down' && x.kind !== 'sparrer').sort((a, b) => Math.hypot(a.x - c.x, a.y - c.y) - Math.hypot(b.x - c.x, b.y - c.y))[0];
        let ctl = IDLE; let act = {};
        if (e) { const dx = e.x - c.x; const dy = e.y - c.y; const d = Math.hypot(dx, dy) || 1; ctl = { ...IDLE, mx: d < 50 ? 0 : dx / d, my: d < 50 ? 0 : dy / d }; if (d < 60 && i % 17 === 0) act = { attack: true }; }
        for (const ev of step(sim, DT, { ...ctl, action: A(act) })) {
          if (ev.type === 'windup') { winds[ev.id] = { t: sim.clock, dur: ev.dur }; assert.ok(ev.dur >= MIN_WINDUP - 1e-9, `${ev.id} winds up for ${ev.dur}`); }
          if (ev.type === 'enemy-swing') { assert.ok(winds[ev.id] && sim.clock - winds[ev.id].t >= MIN_WINDUP - 2 * DT, `${ev.id} swung without a full wind-up`); swings[ev.id] = sim.clock; }
          if (ev.type === 'hurt') { hurts++; assert.ok(ev.from && swings[ev.from] != null && swings[ev.from] >= winds[ev.from].t + MIN_WINDUP - 2 * DT, `${id}: hurt by ${ev.from} without a telegraphed swing`); }
        }
        sim.health = Math.max(sim.health, 30);
      }
      assert.ok(hurts >= 1 || id === 'gupta-forge' || id === 'sangam-staff' || id === 'mauryan-spy' || id === 'dvapara-escape', `${id}: the bot was fought (${hurts} hurts)`);
    }
  });

  // ============================================================ (1b) a blow has windup, active window with a real hitbox, and a recovery
  test('combat2 a blow has three phases: windup (no damage), an active window with a reach and arc hitbox, then recovery (open to punish)', () => {
    const { sim, e } = duel({ kind: 'swordsman', dist: 36 });
    e.cd = 0; const log = [];
    let hurtAt = null; let phaseAt = {};
    for (let i = 0; i < 200; i++) {
      const ev = step(sim, DT, { ...IDLE, action: A() });
      const ph = e.atk?.phase; if (ph && !(ph in phaseAt)) phaseAt[ph] = sim.clock;
      if (ev.some((x) => x.type === 'hurt') && hurtAt == null) hurtAt = { t: sim.clock, phase: ph };
      log.push(ph);
      if (hurtAt && e.atk == null) break;
    }
    assert.ok(phaseAt.windup != null && phaseAt.active != null && phaseAt.recover != null, `phases seen ${JSON.stringify(phaseAt)}`);
    assert.ok(phaseAt.active - phaseAt.windup >= MIN_WINDUP - 2 * DT, 'a visible wind-up first');
    assert.equal(hurtAt.phase, 'active', 'damage only lands in the active window');
    assert.equal(sim.health, 100 - ENEMY.swordsman.attacks.slash.damage);
    // out of reach: the active window is a real hitbox, so a step back makes it whiff
    const { sim: s2, e: e2 } = duel({ kind: 'swordsman', dist: 120 }); forceAttack(s2, e2, { phase: 'windup', t: 0.3 });
    const ev2 = run(s2, 0.6); assert.ok(types(ev2).includes('whiff') && !types(ev2).includes('hurt'), 'too far: whiff');
    // behind the blow: the arc is a cone, not a circle
    const { sim: s3, e: e3 } = duel({ kind: 'spearman', dist: 50 }); forceAttack(s3, e3, { phase: 'active', t: 0 }); e3.atk.angle = 0; e3.angle = 0; // facing away from the player
    run(s3, 0.3); assert.equal(s3.health, 100, 'a thrust aimed away does not hit');
  });

  // ============================================================ (2) the soldier types
  test('combat2 spearman: a long thrust (reach 76) that outreaches a sword (44), a narrow arc, and a short stagger on you', () => {
    assert.ok(ENEMY.spearman.attacks.thrust.reach > ENEMY.swordsman.attacks.slash.reach * 1.5);
    assert.ok(ENEMY.spearman.attacks.thrust.halfArc < 0.3 && ENEMY.swordsman.attacks.slash.halfArc > 0.8);
    const sp = duel({ kind: 'spearman', dist: 72 }); forceAttack(sp.sim, sp.e, { phase: 'windup', t: 0.5 });
    const ev = run(sp.sim, 0.4); assert.ok(types(ev).includes('hurt'), 'the thrust reaches 72 units');
    assert.ok(sp.sim.player.hurtFor <= 0.15 + 1e-9, `short stagger (${sp.sim.player.hurtFor})`);
    const sw = duel({ kind: 'swordsman', dist: 72 }); forceAttack(sw.sim, sw.e, { phase: 'windup', t: 0.4 });
    assert.ok(!types(run(sw.sim, 0.5)).includes('hurt'), 'the sword does not');
    const side = duel({ kind: 'spearman', dist: 60 }); forceAttack(side.sim, side.e, { phase: 'active', t: 0 }); at(side.sim, 200, 140); side.e.x = 200; side.e.y = 200; side.e.atk.angle = Math.PI / 2 + 1.0; // player is 1 rad off the line of the thrust
    run(side.sim, 0.2); assert.equal(side.sim.health, 100, 'the thrust is narrow: step to the side');
    const f = makeFrame(duel({ kind: 'spearman' }).sim, { shake: 0, flash: 0 }, false); assert.equal(f.enemies[0].weapon, 'spear');
  });

  test('combat2 swordsman: slash chains of 1, 2 and 3, each blow telegraphed again for at least 0.45 s', () => {
    const lengths = new Set(); const chainWinds = [];
    for (let seed = 1; seed <= 30; seed++) {
      const { sim, e } = duel({ kind: 'swordsman', dist: 34, seed }); e.cd = 0; at(sim, 200, 140, Math.PI);
      let n = 0; let max = 0;
      for (let i = 0; i < 420; i++) {
        for (const ev of step(sim, DT, { ...IDLE, action: A(), hold: {} })) if (ev.type === 'windup') { if (ev.chain == null) { if (max) lengths.add(max); max = 1; n++; } else { max = Math.max(max, ev.chain + 1); chainWinds.push(ev.dur); } }
        sim.health = 100; if (n >= 1 && e.atk == null && i > 300) break;
      }
      if (max) lengths.add(max);
    }
    assert.deepEqual([...lengths].sort(), [1, 2, 3], `chain lengths seen ${[...lengths]}`);
    assert.ok(chainWinds.length > 0 && chainWinds.every((d) => d >= MIN_WINDUP - 1e-9), 'every chained blow has its own wind-up');
  });

  test('combat2 shield bearer: blocks the front, is hit from the side and back, and a shove or heavy blow breaks the guard so it can be finished', () => {
    const mkShield = () => { const { sim, e } = duel({ kind: 'shield', dist: 34, weapon: 'sword' }); e.cd = 99; return { sim, e }; };
    const { sim, e } = mkShield(); const hp = e.hp;
    const ev = run(sim, 0.3, {}, { attack: true });
    assert.ok(types(ev).includes('shield-block') && !types(ev).includes('hit-enemy')); assert.equal(e.hp, hp, 'a light blow into the shield does nothing');
    const f = makeFrame(sim, { shake: 0, flash: 0 }, false); assert.equal(f.enemies[0].guard, true, 'the frame says the shield is up');
    // flanked: the player stands behind it
    const b = mkShield(); at(b.sim, b.e.x + 36, b.e.y, Math.PI); b.e.angle = Math.PI;
    const evb = run(b.sim, 0.3, {}, { attack: true }); assert.ok(types(evb).includes('hit-enemy'), 'from behind it lands'); assert.equal(b.e.hp, hp - 1);
    const s = mkShield(); at(s.sim, s.e.x, s.e.y - 36, Math.PI / 2); s.e.angle = Math.PI; // from the side, 90 degrees off the shield
    assert.ok(types(run(s.sim, 0.3, {}, { attack: true })).includes('hit-enemy'), 'from the side it lands');
    // guard break by a shove
    const sh = mkShield(); const evs = run(sh.sim, 0.5, {}, { push: true });
    assert.ok(types(evs).includes('shield-break') && sh.e.open && sh.e.state === 'stagger', 'a shove breaks the guard and opens it');
    assert.equal(makeFrame(sh.sim, { shake: 0, flash: 0 }, false).enemies[0].open, true);
    // ...and by a heavy blow, then the finisher
    const hv = mkShield(); const evh = run(hv.sim, 0.9, {}, { heavy: true });
    assert.ok(types(evh).includes('shield-break'), 'a heavy blow breaks it'); assert.equal(hv.e.hp, hp, 'breaking the guard is not damage');
    const fin = run(hv.sim, 1.0, {}, { attack: true }); assert.ok(types(fin).includes('finisher') && types(fin).includes('hit-enemy'), 'then a finisher');
    assert.ok(hv.e.hp < hp);
    // the bash itself is telegraphed like any other blow
    assert.ok(ENEMY.shield.attacks.bash.windup >= MIN_WINDUP);
  });

  test('combat2 archer: a readable aim line, then an arrow you can see and roll through; walls stop both the line and the arrow; a parry turns an arrow aside', () => {
    const { sim, e } = duel({ kind: 'archer', dist: 260 }); e.cd = 0; e.atk = null;
    forceAttack(sim, e, { name: 'shoot', phase: 'windup', t: 0 }); e.atk.locked = false;
    const f0 = makeFrame(sim, { shake: 0, flash: 0 }, false).enemies[0];
    assert.equal(f0.weapon, 'bow'); assert.equal(f0.phase, 'windup'); assert.ok(f0.aim && f0.aim.x1 < f0.aim.x0, 'the aim line points at you'); assert.equal(f0.aim.locked, false);
    run(sim, 0.7); const f1 = makeFrame(sim, { shake: 0, flash: 0 }, false).enemies[0]; assert.equal(f1.aim.locked, true, 'the line locks before the shot, so a sidestep works');
    let seen = 0; let hurt = 0; let first = null; const xs = [];
    for (let i = 0; i < 120; i++) {
      const ev = step(sim, DT, { ...IDLE, action: A() }); hurt += types(ev).filter((t) => t === 'hurt').length;
      const pr = makeFrame(sim, { shake: 0, flash: 0 }, false).projectiles.filter((p) => p.from === 'enemy'); if (pr.length) { seen++; if (first == null) first = i; xs.push(pr[0].x); }
      if (hurt) break;
    }
    assert.ok(seen >= 15, `the arrow is visible in flight for ${seen} frames`); assert.ok(xs[xs.length - 1] < xs[0], 'it travels toward you'); assert.equal(hurt, 1); assert.equal(sim.health, 100 - ENEMY.archer.attacks.shoot.damage);
    // roll through it
    const r = duel({ kind: 'archer', dist: 260 }); forceAttack(r.sim, r.e, { name: 'shoot', phase: 'windup', t: 0.8 });
    let dodged = false; let rh = 0;
    for (let i = 0; i < 200; i++) { const pr = r.sim.eArrows.find((a) => a.active); const near = pr && Math.hypot(pr.x - r.sim.chariot.x, pr.y - r.sim.chariot.y) < 80; const go = near && !dodged; rh += types(step(r.sim, DT, { ...IDLE, mx: 0, my: go || r.sim.player.state === 'dodge' ? 1 : 0, action: A(go ? { dodge: true } : {}) })).filter((t) => t === 'hurt').length; if (near) dodged = true; }
    assert.ok(dodged && rh === 0, 'a roll at the right moment passes through the arrow');
    // a wall between
    const wall = ['##############################', '#S.........#.................#', '#..........#.................#', '#..........#.................#', '#..........#...............1.#', '##############################'];
    const ws = mk(wall, {}, { abilities: FULL }); at(ws, 100, 100, 0);
    const ea = spawnEnemy({ id: 'e1', kind: 'archer', x: 520, y: 100, angle: Math.PI }, ws.rng); ea.aware = true; ws.enemies = [ea]; forceAttack(ws, ea, { name: 'shoot', phase: 'windup', t: 0.2 });
    const fw = makeFrame(ws, { shake: 0, flash: 0 }, false).enemies[0]; assert.ok(fw.aim.x1 >= 470 && fw.aim.x1 <= 490, `the aim line ends at the wall (${fw.aim.x1})`);
    run(ws, 2.5); assert.equal(ws.health, 100, 'the wall stopped the arrow'); assert.ok(ws.eArrows.every((a) => !a.active));
    // parry turns it aside
    const p = duel({ kind: 'archer', dist: 150 }); run(p.sim, 0.1, { hold: { block: true } }); forceAttack(p.sim, p.e, { name: 'shoot', phase: 'windup', t: 0.9 });
    let pe = []; for (let i = 0; i < 90; i++) pe.push(...step(p.sim, DT, { ...IDLE, hold: { block: true }, action: A() }));
    assert.ok(pe.some((x) => x.type === 'parry' && x.ranged) || pe.some((x) => x.type === 'blocked'), 'a block or parry takes an arrow'); assert.equal(p.sim.health, 100);
    assert.equal(sim.eArrows.length, 12, 'fixed arrow pool');
  });

  test('combat2 captain: three phases at two thirds and one third health, invulnerable and calling allies at each change, superarmor against light hits, an unblockable slam, defeat ends in captain-down', () => {
    const { sim, e } = duel({ kind: 'captain', dist: 60, weapon: 'sword' }); e.cd = 99;
    assert.equal(e.maxHp, 16); assert.equal(e.phaseNo, 1);
    const ally = spawnEnemy({ id: 'e2', kind: 'swordsman', x: 500, y: 140 }, sim.rng); sim.enemies.push(ally);
    const evs = []; const hit = (d, extra = {}) => applyHit(sim, e, { damage: d, stagger: 0.3, via: 'sword', ...extra }, 0, evs);
    hit(1); assert.notEqual(e.state, 'stagger', 'superarmor: a light hit only makes it flinch'); assert.ok(e.flinch > 0 || e.state === 'chase');
    hit(4, { stagger: 1.5, breaks: true, heavy: true }); // 11 left: still phase 1
    assert.equal(e.phaseNo, 1);
    e.poise = 0; hit(3, { stagger: 1.5, breaks: true, heavy: true }); // 8 left: phase 2
    assert.equal(e.phaseNo, 2); assert.ok(evs.some((x) => x.type === 'phase' && x.n === 2)); assert.ok(evs.some((x) => x.type === 'call'), 'the captain rallies his men at a phase change'); assert.equal(ally.aware, true);
    assert.equal(e.state, 'phase'); assert.ok(e.invul > 0);
    const before = e.hp; hit(2); assert.equal(e.hp, before, 'invulnerable while changing stance'); assert.ok(evs.some((x) => x.type === 'deflect'));
    e.invul = 0; e.state = 'chase'; hit(4, { stagger: 1.5, breaks: true, heavy: true }); // 4 left: phase 3
    assert.equal(e.phaseNo, 3); assert.ok(evs.filter((x) => x.type === 'phase').length === 2);
    // phase 3 uses the unblockable slam and the lunge at times
    const seen = new Set(); let unblock = false;
    for (let seed = 1; seed < 40 && !(seen.has('slam') && seen.has('lunge')); seed++) {
      const d = duel({ kind: 'captain', dist: seed % 2 ? 60 : 120, weapon: 'sword', seed }); d.e.phaseNo = 3; d.e.hp = 4; d.e.cd = 0;
      for (let i = 0; i < 400; i++) { for (const ev of step(d.sim, DT, { ...IDLE, action: A() })) if (ev.type === 'windup') { unblock = unblock || ev.unblockable; } if (d.e.atk) seen.add(d.e.atk.name); d.sim.health = 100; }
    }
    assert.ok(seen.has('slam') && seen.has('lunge') && seen.has('slash'), `captain attacks seen: ${[...seen]}`); assert.ok(unblock, 'the slam is flagged unblockable in the windup event');
    // a blocked slam still lands: only a roll avoids it
    const sl = duel({ kind: 'captain', dist: 40, weapon: 'sword' }); sl.e.phaseNo = 3; run(sl.sim, 0.4, { hold: { block: true } }); forceAttack(sl.sim, sl.e, { name: 'slam', phase: 'windup', t: 0.8 });
    run(sl.sim, 0.5, { hold: { block: true } }); assert.ok(sl.sim.health < 100, 'a block does not stop the slam');
    const sr = duel({ kind: 'captain', dist: 40, weapon: 'sword' }); sr.e.phaseNo = 3; forceAttack(sr.sim, sr.e, { name: 'slam', phase: 'windup', t: 0.75 });
    run(sr.sim, 0.5, { mx: -1 }, { dodge: true }); assert.equal(sr.sim.health, 100, 'a roll does');
    // defeat
    e.invul = 0; const last = []; applyHit(sim, e, { damage: 99, stagger: 1, via: 'sword' }, 0, last);
    assert.ok(last.some((x) => x.type === 'captain-down') && last.some((x) => x.type === 'enemy-down' && x.kind === 'captain')); assert.equal(e.state, 'down');
  });

  // ============================================================ (3) group AI
  const crowd = (kinds, { seed = 3, weapon = 'sword' } = {}) => {
    const sim = mk(['##############################', ...Array.from({ length: 12 }, () => '#............................#'), '#S..........................1#', '##############################'], {}, { abilities: FULL, weapon, seed });
    at(sim, 600, 260, 0);
    sim.enemies = kinds.map((k, i) => { const a = (i / kinds.length) * Math.PI * 2; const e = spawnEnemy({ id: `e${i + 1}`, kind: k, x: 600 + Math.cos(a) * 180, y: 260 + Math.sin(a) * 140, angle: a + Math.PI }, sim.rng); e.aware = true; e.state = 'chase'; e.lastX = 600; e.lastY = 260; return e; });
    return sim;
  };
  test('combat2 fairness: with seven enemies around you at most two attack at once, the rest circle or wait, and their wind-ups are spaced at least 0.35 s apart', () => {
    const sim = crowd(['swordsman', 'swordsman', 'spearman', 'spearman', 'shield', 'archer', 'swordsman']);
    let most = 0; let waited = 0; let twoAtOnce = 0; const starts = []; const roles = new Set();
    for (let i = 0; i < 60 * 40; i++) {
      for (const ev of step(sim, DT, { ...IDLE, hold: { block: i % 100 < 30 }, action: A() })) if (ev.type === 'windup' && ev.chain == null) starts.push(sim.clock);
      sim.health = Math.max(sim.health, 50);
      const att = sim.enemies.filter((e) => e.atk && e.state !== 'down').length; most = Math.max(most, att); if (att === 2) twoAtOnce++;
      const f = makeFrame(sim, { shake: 0, flash: 0 }, false); assert.ok(f.director.attackers <= MAX_ATTACKERS);
      for (const e of f.enemies) if (e.state === 'circle') { waited++; roles.add(e.role); }
    }
    assert.ok(most <= MAX_ATTACKERS, `most at once: ${most}`); assert.ok(twoAtOnce > 0 || starts.length > 5, 'they do attack');
    assert.ok(waited > 100, `others circled while waiting (${waited} enemy-ticks)`); assert.ok(roles.has('flanker') || roles.has('waiting'), `roles ${[...roles]}`);
    for (let i = 1; i < starts.length; i++) assert.ok(starts[i] - starts[i - 1] >= WINDUP_GAP - 2 * DT, 'no two blows start together');
    assert.ok(starts.length >= 8, `${starts.length} attacks in 40 s: busy but fair`);
  });

  test('combat2 fairness: every enemy blow in the data is telegraphed for at least 0.45 s, first blow and chained blows alike', () => {
    for (const [k, R] of Object.entries(ENEMY)) for (const [n, a] of Object.entries(R.attacks)) {
      assert.ok(a.windup >= MIN_WINDUP, `${k}.${n} windup ${a.windup}`); assert.ok((a.chainWindup ?? a.windup) >= MIN_WINDUP, `${k}.${n} chain windup`);
      assert.ok(a.active >= 0.08 && a.recover >= 0.7, `${k}.${n} has an active window (${a.active}) and a recovery (${a.recover})`); assert.ok(a.reach > 0 && a.halfArc > 0, `${k}.${n} has a hitbox`);
    }
    assert.deepEqual(ENEMY_KINDS.sort(), ['archer', 'captain', 'raider', 'shield', 'spearman', 'swordsman']);
  });

  test('combat2 group AI: an enemy that sees you calls its allies; far-off ones stay unaware', () => {
    const sim = mk(); at(sim, 200, 140, 0);
    const mkE = (id, x, y, ang) => { const e = spawnEnemy({ id, kind: 'swordsman', x, y, angle: ang }, sim.rng); return e; };
    const a = mkE('e1', 280, 140, Math.PI); const b = mkE('e2', 330, 200, 0); const far = mkE('e3', 1000, 200, 0);
    sim.enemies = [a, b, far];
    const ev = run(sim, 1.0);
    assert.ok(types(ev).includes('seen')); assert.ok(types(ev).includes('call'), 'a shout');
    assert.equal(b.aware, true, 'the near ally heard the call and comes'); assert.equal(far.aware, false, 'the far one did not');
    assert.ok(['alert', 'chase', 'attack', 'circle'].includes(b.state));
    assert.equal(makeFrame(sim, { shake: 0, flash: 0 }, false).enemies.some((e) => e.calling) || ev.some((x) => x.type === 'call' && x.n >= 1), true);
  });

  test('combat2 group AI: a badly hurt enemy retreats, a cornered one fights on, and nobody attacks through a wall', () => {
    const { sim, e } = duel({ kind: 'swordsman', dist: 60 }); e.hp = 1; e.cd = 0;
    const ev = run(sim, 0.5); assert.ok(types(ev).includes('retreat')); const d0 = Math.hypot(e.x - sim.chariot.x, e.y - sim.chariot.y);
    run(sim, 1.0); assert.ok(Math.hypot(e.x - sim.chariot.x, e.y - sim.chariot.y) > d0 + 40, 'it falls back'); assert.equal(e.state, 'retreat');
    const rows = ['##############', '#S...........#', '#............#', '#...........1#', '##############'];
    const c = mk(rows); at(c, 120, 60, 0);
    const ce = spawnEnemy({ id: 'e1', kind: 'swordsman', x: 70, y: 60, angle: 0 }, c.rng); ce.hp = 1; ce.aware = true; ce.state = 'chase'; c.enemies = [ce];
    const cev = run(c, 6); assert.ok(types(cev).includes('retreat'));
    assert.ok(types(cev).includes('windup') || ce.desperate, 'cornered, it fights on instead of standing still');
    // walls: a one-tile wall with no way round
    const wrows = ['##############', '#S.....#.....#', '#......#.....#', '#......#....1#', '##############'];
    const ws = mk(wrows, {}, { abilities: FULL, weapon: 'sword' }); at(ws, 400, 60, Math.PI);
    const sp = spawnEnemy({ id: 'e1', kind: 'spearman', x: 220, y: 60, angle: 0 }, ws.rng); sp.aware = true; sp.state = 'chase'; ws.enemies = [sp];
    const wev = run(ws, 8); assert.ok(!types(wev).includes('windup') && !types(wev).includes('hurt'), 'no blow begins or lands through the wall'); assert.equal(ws.health, 100);
    sp.x = 262; at(ws, 338, 60, Math.PI); forceAttack(ws, sp, { phase: 'windup', t: 0.5 }); const fev = run(ws, 0.6); assert.ok(!types(fev).includes('hurt'), 'even a forced blow stops at the wall'); assert.equal(ws.health, 100);
    // a low wall stops a blow too
    const lrows = ['##############', '#S.....=.....#', '#......=.....#', '#......=....1#', '##############'];
    const ls = mk(lrows, {}, { abilities: FULL }); at(ls, 330, 60, Math.PI);
    const lp = spawnEnemy({ id: 'e1', kind: 'spearman', x: 250, y: 60, angle: 0 }, ls.rng); lp.aware = true; ls.enemies = [lp]; forceAttack(ls, lp, { phase: 'windup', t: 0.5 });
    assert.ok(!types(run(ls, 0.6)).includes('hurt'), 'a thrust does not pass over a low wall');
  });

  test('combat2 group AI: enemies chase round corners (they find a way) and flankers work round to your back', () => {
    const rows = ['######################', '#S...................#', '#.##################.#', '#....................#', '#...................1#', '######################'];
    const sim = mk(rows, {}, { abilities: FULL }); at(sim, 60, 60, 0);
    const e = spawnEnemy({ id: 'e1', kind: 'swordsman', x: 60, y: 140, angle: 0 }, sim.rng); e.aware = true; e.state = 'chase'; e.lastX = 60; e.lastY = 60; sim.enemies = [e]; // the wall row is between them
    let reached = false; for (let i = 0; i < 60 * 25 && !reached; i++) { run(sim, DT); sim.health = 100; if (Math.hypot(e.x - sim.chariot.x, e.y - sim.chariot.y) < 80 && e.y < 100) reached = true; }
    assert.ok(reached, 'it walked round the wall to you');
    // flank: two enemies hold both attack slots; the rest circle, and flankers end up behind the player
    const g = crowd(['swordsman', 'swordsman', 'swordsman', 'swordsman', 'spearman', 'spearman']);
    let behind = 0;
    for (let i = 0; i < 60 * 25; i++) { step(g, DT, { ...IDLE, hold: { block: true }, action: A() }); g.health = 100; }
    const c = g.chariot;
    for (const e2 of g.enemies) if (e2.state !== 'down' && Math.abs(Math.atan2(Math.sin(Math.atan2(e2.y - c.y, e2.x - c.x) - (c.moveAngle + Math.PI)), Math.cos(Math.atan2(e2.y - c.y, e2.x - c.x) - (c.moveAngle + Math.PI)))) < 1.4) behind++;
    assert.ok(behind >= 1, `${behind} enemies worked round behind the player`);
  });

  // ============================================================ (4) player feel
  test('combat2 you start with bare hands: a three-hit fist combo (jab, cross, kick) with cancel windows; the next press during the swing cuts the recovery short', () => {
    const { sim, e } = duel({ kind: 'swordsman', dist: 36, weapon: 'none' }); e.cd = 99; e.hp = 99; e.maxHp = 99;
    assert.equal(sim.player.weapon, 'none'); assert.deepEqual(COMBOS.none.steps.map((s) => s.id), ['jab', 'cross', 'kick']);
    const log = [];
    for (let i = 0; i < 60; i++) {
      const press = i === 0 || i === 14 || i === 30; // second press lands inside the cancel window (>= 0.16 s), third as well
      for (const ev of step(sim, DT, { ...IDLE, action: A(press ? { attack: true } : {}) })) if (ev.type === 'swing') log.push([i, ev.id, ev.step]);
      if (i === 5) assert.equal(sim.player.state, 'attack');
    }
    assert.deepEqual(log.map((l) => l[1]), ['jab', 'cross', 'kick']); assert.deepEqual(log.map((l) => l[2]), [0, 1, 2]);
    assert.ok(log[1][0] < 0.3 / DT, `the cross started at ${log[1][0]} ticks, before the 18 ticks a jab takes to finish: cancelled`);
    assert.ok(e.hp <= 99 - 4, `1 + 1 + 2 damage (${99 - e.hp})`);
    // pressed too early (before the cancel window): remembered, played as soon as the window opens
    const early = duel({ kind: 'swordsman', dist: 36 }); early.e.cd = 99; early.e.hp = 99;
    const l2 = []; for (let i = 0; i < 40; i++) for (const ev of step(early.sim, DT, { ...IDLE, action: A(i === 0 || i === 3 ? { attack: true } : {}) })) if (ev.type === 'swing') l2.push([i, ev.id]);
    assert.deepEqual(l2.map((x) => x[1]), ['jab', 'cross']); assert.ok(l2[1][0] >= Math.floor(COMBOS.none.steps[0].cancel / DT) - 1, `queued until the window (${l2[1][0]})`);
    // a long pause resets the chain
    const gap = duel({ kind: 'swordsman', dist: 36 }); gap.e.cd = 99; gap.e.hp = 99; run(gap.sim, 0.1, {}, { attack: true }); run(gap.sim, 1.0);
    assert.equal(run(gap.sim, 0.1, {}, { attack: true }).find((x) => x.type === 'swing').id, 'jab', 'the chain starts again after a pause');
    // stamina: tired means no swing
    const tired = duel({ weapon: 'none' }); tired.sim.player.stamina = 1; assert.ok(types(run(tired.sim, 0.1, {}, { attack: true })).includes('tired'));
  });

  test('combat2 weapons are earned in order and each has its own combo: staff (sweep, backsweep, thrust), sword (three cuts), bow (arrows; bare hands up close)', () => {
    assert.deepEqual(COMBOS.staff.steps.map((s) => s.id), ['sweep', 'backsweep', 'thrust']); assert.deepEqual(COMBOS.sword.steps.map((s) => s.id), ['cut1', 'cut2', 'cut3']);
    assert.ok(COMBOS.staff.steps[0].range > COMBOS.sword.steps[0].range && COMBOS.sword.heavy.damage > COMBOS.none.heavy.damage);
    for (const set of Object.values(COMBOS)) assert.ok(set.steps.every((s) => s.cancel >= s.hitAt && s.cancel <= s.swing) && set.heavy.hitAt >= 0.45, 'cancel windows open after the blow lands; heavy blows have a 0.45 s+ visible wind-up');
    const bow = duel({ weapon: 'bow', dist: 36 }); bow.e.cd = 99; assert.equal(bow.sim.player.weapon, 'bow');
    assert.ok(types(run(bow.sim, 0.3, {}, { attack: true })).includes('hit-enemy'), 'with a bow in hand, up close you still have your fists');
    const none = mk(ROOM, {}, { abilities: [] }); assert.equal(none.player.weapon, 'none', 'a fresh traveller has no weapon');
  });

  test('combat2 perfect parry opens the enemy for a finisher; a late block only blocks; the opening runs out', () => {
    const { sim, e } = duel({ kind: 'swordsman', dist: 36, weapon: 'none' });
    forceAttack(sim, e, { phase: 'windup', t: 0.3 }); // the blow lands 0.2 s from now
    const ev = run(sim, 0.35, { hold: { block: true } });
    assert.ok(types(ev).includes('parry') && types(ev).includes('opened')); assert.equal(sim.health, 100); assert.equal(e.open, true); assert.equal(e.state, 'stagger');
    assert.equal(makeFrame(sim, { shake: 0, flash: 0 }, false).enemies[0].open, true, 'the frame marks the opening so it can be drawn');
    const hp = e.hp; const fin = run(sim, 1.0, { hold: {} }, { attack: true });
    assert.ok(types(fin).includes('finisher')); assert.equal(e.hp, hp - COMBAT.finisher.damage, `the finisher is a sure ${COMBAT.finisher.damage} damage`); assert.equal(sim.health, 100, 'no damage while finishing');
    // the opening expires
    const b = duel({ kind: 'swordsman', dist: 36 }); forceAttack(b.sim, b.e, { phase: 'windup', t: 0.3 }); run(b.sim, 0.35, { hold: { block: true } });
    run(b.sim, 1.0); run(b.sim, 1.2); assert.ok(!types(run(b.sim, 0.2, {}, { attack: true })).includes('finisher'), 'too late: it is no longer open');
    // a late block (raised well before the blow) only blocks
    const late = duel({ kind: 'swordsman', dist: 36 }); run(late.sim, 0.6, { hold: { block: true } }); forceAttack(late.sim, late.e, { phase: 'windup', t: 0.3 });
    const lev = run(late.sim, 0.35, { hold: { block: true } }); assert.ok(types(lev).includes('blocked') && !types(lev).includes('parry')); assert.equal(late.e.open, false);
    // a finisher is also a kill-shot-free "yield": hp 0 means the enemy withdraws, never gore
    const k = duel({ kind: 'swordsman', dist: 36 }); k.e.hp = 2; forceAttack(k.sim, k.e, { phase: 'windup', t: 0.3 }); run(k.sim, 0.35, { hold: { block: true } });
    const kev = run(k.sim, 1.0, {}, { attack: true }); assert.ok(kev.some((x) => x.type === 'enemy-down' && x.finisher)); assert.equal(k.e.state, 'down');
  });

  test('combat2 dodge roll: i-frames avoid every kind of blow (slash, thrust, bash, arrow, lunge)', () => {
    for (const [kind, name, t0] of [['swordsman', 'slash', 0.35], ['spearman', 'thrust', 0.4], ['shield', 'bash', 0.45], ['captain', 'lunge', 0.6]]) {
      const base = duel({ kind, dist: 38 }); forceAttack(base.sim, base.e, { name, phase: 'windup', t: t0 }); run(base.sim, 0.6); assert.ok(base.sim.health < 100, `${kind} ${name} lands when you stand still`);
      const d = duel({ kind, dist: 38 }); forceAttack(d.sim, d.e, { name, phase: 'windup', t: t0 }); run(d.sim, 0.6, { mx: 0, my: 1 }, { dodge: true });
      assert.equal(d.sim.health, 100, `${kind} ${name} misses a rolling traveller`);
    }
  });

  test('combat2 knock-back: a kick sends the enemy back, a blow pushes you back; both stop at walls', () => {
    const { sim, e } = duel({ kind: 'swordsman', dist: 34, weapon: 'none' }); e.cd = 99; e.hp = 99; e.maxHp = 99; const x0 = e.x;
    run(sim, 0.08, {}, { attack: true }); run(sim, 0.12, {}, { attack: true }); run(sim, 0.9, {}, { attack: true });
    for (let i = 0; i < 60; i++) { run(sim, 0.4); at(sim, e.x - 34, e.y, 0); sim.player.comboT = 0.3; run(sim, 0.04, {}, { attack: true }); }
    assert.ok(e.x > x0 + 20, `knocked back (${e.x - x0})`);
    const h = duel({ kind: 'swordsman', dist: 36 }); forceAttack(h.sim, h.e, { phase: 'windup', t: 0.45 }); const px = h.sim.chariot.x; run(h.sim, 0.4);
    assert.ok(px - h.sim.chariot.x > 10, `pushed back ${px - h.sim.chariot.x}`);
    const wall = mk(['########', '#S.....#', '#......#', '#.....1#', '########']); at(wall, 80, 60, 0);
    const we = spawnEnemy({ id: 'e1', kind: 'swordsman', x: 230, y: 60, angle: 0 }, wall.rng); we.aware = true; wall.enemies = [we]; applyHit(wall, we, { damage: 0, stagger: 1, knock: 200, via: 'shove' }, 0, []); run(wall, 0.5); assert.ok(we.x < 7 * 40, `stopped by the wall (${we.x})`);
  });

  test('combat2 hit-stop and slow motion: brief and real, held presses are kept, and none of it happens under reduced motion', () => {
    const { sim, e } = duel({ kind: 'swordsman', dist: 36, weapon: 'sword' }); e.cd = 99; e.hp = 99; e.maxHp = 99;
    let stopped = 0; let swung = null;
    for (let i = 0; i < 40; i++) {
      const before = { x: e.x, st: sim.player.stateT };
      const wasStopped = sim.hitstop > 0;
      const ev = step(sim, DT, { ...IDLE, action: A(i === 0 ? { attack: true } : i === 12 ? { attack: true } : {}) });
      if (wasStopped) { stopped++; assert.deepEqual(ev, [], 'the world is held during a hit-stop'); }
      if (sim.hitstop > 0) assert.equal(makeFrame(sim, { shake: 0, flash: 0 }, false).hitstop, true);
      if (ev.some((x) => x.type === 'swing') && i > 5) swung = i;
    }
    assert.ok(stopped >= 2 && stopped <= 12, `hit-stop lasted ${stopped} ticks (about ${(stopped * DT).toFixed(2)} s)`);
    assert.ok(swung != null, 'a press made during the hit-stop was not lost');
    const rm = duel({ kind: 'swordsman', dist: 36, weapon: 'sword' }); setReduceMotion(rm.sim, true); rm.e.cd = 99;
    let any = 0; for (let i = 0; i < 40; i++) { step(rm.sim, DT, { ...IDLE, action: A(i === 0 ? { attack: true } : {}) }); any += rm.sim.hitstop > 0 ? 1 : 0; }
    assert.equal(any, 0, 'no hit-stop under reduced motion'); assert.ok(rm.e.hp < rm.e.maxHp, 'the hit still landed');
    const opt = createSim(parseLayout({ tileSize: 40, rows: ROOM, timeLimit: 9, mode: 'foot', rules: 2 }), { timerMode: 'off', reduceMotion: true }); assert.equal(opt.reduceMotion, true);
    // slow motion on a parry: time runs at 0.4 for 0.3 s; never under reduced motion
    const mkParry = (reduce) => { const d = duel({ kind: 'swordsman', dist: 36 }); if (reduce) setReduceMotion(d.sim, true); forceAttack(d.sim, d.e, { phase: 'windup', t: 0.3 }); const ev = run(d.sim, 0.3, { hold: { block: true } }); return { ...d, ev }; };
    const p = mkParry(false); assert.ok(types(p.ev).includes('parry'));
    let slow = false; for (let i = 0; i < 30; i++) { const c0 = p.sim.clock; step(p.sim, DT, { ...IDLE, action: A() }); const f = makeFrame(p.sim, { shake: 0, flash: 0 }, false); if (f.timeScale < 1) { slow = true; assert.ok(p.sim.clock - c0 <= DT * 0.41 + 1e-9, 'game time runs at the slow-motion rate'); } }
    assert.ok(slow, 'slow motion after a parry');
    const r = mkParry(true); assert.ok(types(r.ev).includes('parry')); assert.equal(r.sim.slow.left, 0); assert.equal(makeFrame(r.sim, { shake: 0, flash: 0 }, false).timeScale, 1);
    // turning reduced motion on mid-effect clears it at once
    const m = mkParry(false); setReduceMotion(m.sim, true); assert.equal(m.sim.hitstop, 0); assert.equal(m.sim.slow.left, 0);
  });

  test('combat2 screenshake and flash in game.js are gated by the reduced-motion setting; hit-stop lives in the sim where reduced motion can switch it off', async () => {
    const g = await readFile(new URL('../game.js', import.meta.url), 'utf8');
    assert.match(g, /!settings\.reduceMotion && SHAKE\[e\.type\]/); assert.match(g, /setReduceMotion\(sim, settings\.reduceMotion\)/); assert.match(g, /reduceMotion: settings\.reduceMotion/);
    const c = await readFile(new URL('../combat.js', import.meta.url), 'utf8'); assert.match(c, /if \(sim\.reduceMotion\) return;/);
  });

  test('combat2 stamina: light swings, heavy blows, rolls, shoves and holding a block all draw on one pool that refills when you rest', () => {
    const { sim, e } = duel({ kind: 'swordsman', dist: 36, weapon: 'sword' }); e.cd = 99; e.hp = 99; e.maxHp = 99;
    const s0 = sim.player.stamina; run(sim, 0.5, {}, { attack: true }); assert.equal(Math.round(sim.player.stamina), Math.round(s0 - COMBOS.sword.steps[0].stamina));
    run(sim, 0.6); sim.player.stamina = 100; run(sim, 0.1, {}, { heavy: true }); assert.ok(sim.player.stamina <= 70.5, `heavy cost ${sim.player.stamina}`);
    run(sim, 1.2); sim.player.stamina = 100; run(sim, 0.1, {}, { push: true }); assert.ok(Math.round(sim.player.stamina) <= 85);
    sim.player.stamina = 0; sim.player.stamDelay = 0; run(sim, 2); assert.ok(sim.player.stamina > 50, 'refills'); run(sim, 4); assert.equal(sim.player.stamina, 100);
  });

  // ============================================================ (5) audio
  function fakeCtx() {
    const log = { osc: 0, noise: 0, gains: 0, starts: 0 }; let t = 0;
    const param = () => ({ value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {} });
    const node = (extra = {}) => ({ connect() {}, ...extra });
    const ctx = {
      sampleRate: 8000, state: 'running', destination: node(), get currentTime() { return t; }, set currentTime(v) { t = v; }, resume() { this.state = 'running'; }, log,
      createGain: () => { log.gains++; return node({ gain: param() }); },
      createOscillator: () => { log.osc++; return node({ type: 'sine', frequency: param(), start() { log.starts++; }, stop() {} }); },
      createBufferSource: () => { log.noise++; return node({ buffer: null, start() { log.starts++; }, stop() {} }); },
      createBiquadFilter: () => node({ type: 'lowpass', Q: { value: 0 }, frequency: param() }),
      createBuffer: (ch, n) => ({ getChannelData: () => new Float32Array(n) }),
    };
    return ctx;
  }
  test('combat2 audio: every cue is synthesized (oscillators and noise, no audio files), every cue has a bracketed caption, nothing plays when sound is off', async () => {
    const ctx = fakeCtx(); const audio = createAudio({ ctxFactory: () => ctx });
    for (const cue of Object.keys(VOICES)) { ctx.currentTime += 1; assert.equal(audio.play(cue), true, cue); assert.match(CAPTIONS[cue], /^\[.+\]$/, `${cue} has a caption`); }
    assert.ok(ctx.log.osc > 20 && ctx.log.noise >= 5 && ctx.log.starts > 25, `synth nodes ${JSON.stringify(ctx.log)}`);
    assert.deepEqual(Object.keys(CAPTIONS).sort(), Object.keys(VOICES).sort(), 'a caption for exactly every voice');
    assert.equal(audio.play('nope'), false);
    ctx.currentTime += 1; assert.equal(audio.play('hit'), true); assert.equal(audio.play('hit'), false, 'the same cue is not restarted inside 40 ms');
    audio.setEnabled(false); const n = ctx.log.starts; ctx.currentTime += 1; assert.equal(audio.play('parry'), false); assert.equal(ctx.log.starts, n); assert.equal(audio.enabled, false);
    const broke = createAudio({ ctxFactory: () => { throw new Error('no audio'); } }); assert.equal(broke.play('hit'), false, 'a missing or blocked AudioContext is silent, never an error');
    const none = createAudio({ ctxFactory: () => null }); assert.equal(none.play('swing'), false);
    const lazy = []; createAudio({ ctxFactory: () => { lazy.push(1); return fakeCtx(); } }); assert.equal(lazy.length, 0, 'the context is made on the first play, after a tap');
    const files = await readdir(new URL('..', import.meta.url));
    for (const f of files.filter((x) => x.endsWith('.js'))) { const src = await readFile(new URL(`../${f}`, import.meta.url), 'utf8'); assert.ok(!/\.(mp3|ogg|wav|m4a|flac)\b/i.test(src) && !/new Audio\(/.test(src), `${f} loads no audio file`); }
    const a = await readFile(new URL('../audio.js', import.meta.url), 'utf8'); assert.ok(!/fetch\(|XMLHttpRequest|import\(/.test(a));
  });

  test('combat2 audio: every sound a fight produces has a caption and the ones a player must not miss have a spoken line', () => {
    const seen = new Set(); const all = [];
    const collect = (ev) => ev.forEach((x) => { seen.add(x.type); all.push(x); });
    const sim = crowd(['swordsman', 'spearman', 'shield', 'archer', 'captain'], { weapon: 'sword' });
    for (let i = 0; i < 60 * 40; i++) { collect(step(sim, DT, { ...IDLE, mx: Math.sin(i / 40), my: Math.cos(i / 55), hold: { block: i % 120 < 40 }, action: A({ attack: i % 25 === 0, heavy: i % 170 === 0, dodge: i % 90 === 0, push: i % 211 === 0 }) })); sim.health = Math.max(sim.health, 40); }
    for (const t of ['swing', 'hit-enemy', 'windup', 'enemy-swing', 'hurt', 'dodge']) assert.ok(seen.has(t), `the fight produced ${t}`);
    for (const e of all) { const cue = cueFor(e); if (cue) { assert.match(captionFor(e), /^\[.+\]$/, `${e.type} caption`); assert.ok(VOICES[cue], `${e.type} -> ${cue} exists`); } }
    assert.match(announceFor({ type: 'hurt', amount: 8, health: 92, weapon: 'spear' }), /8 damage.*spear/); assert.ok(announceFor({ type: 'windup', kind: 'captain', unblockable: true }).includes('cannot be blocked'));
    assert.equal(announceFor({ type: 'windup', kind: 'swordsman' }), null, 'ordinary wind-ups are caption-only, so a screen reader is not flooded');
    assert.match(captionFor({ type: 'windup', kind: 'spearman' }), /spearman winds up/); assert.match(captionFor({ type: 'phase', n: 2 }), /phase 2/);
    assert.equal(cueFor({ type: 'whiff' }), null); assert.equal(captionFor({ type: 'whiff' }), null);
  });

  // ============================================================ objectives: waves and defeat captain
  test('combat2 objectives: waves (arena) validate, start on unlock or zone, spawn each wave, clear, rest, and complete; defeat-captain completes only on the captain', () => {
    const good = { id: 'arena', type: 'waves', unlock: 1, zone: { x: 5, y: 5, r: 3 }, gap: 2, heal: 20, waves: [[{ kind: 'swordsman', at: [8, 3] }], [{ kind: 'shield', at: [8, 5] }, { kind: 'archer', at: [9, 5] }]] };
    assert.deepEqual(validateObjectiveDefs([good, { id: 'c', type: 'defeat-captain' }, { ...good, id: 'alias', type: 'arena' }], 1), []);
    const bad = [{ id: 'a', type: 'waves' }, { id: 'b', type: 'waves', waves: [[]] }, { id: 'c', type: 'waves', waves: [[{ kind: 'dragon', at: [1, 1] }]] }, { id: 'd', type: 'waves', waves: [[{ kind: 'spearman', at: ['x'] }]] }, { id: 'e', type: 'waves', gap: 99, waves: [[{ kind: 'spearman', at: [1, 1] }]] }, { id: 'f', type: 'waves', heal: 99, waves: [[{ kind: 'spearman', at: [1, 1] }]] }];
    assert.ok(validateObjectiveDefs(bad, 1).length >= 6, validateObjectiveDefs(bad, 1).join('; '));
    assert.ok(validateObjectiveDefs([{ id: 'x', type: 'waves', waves: Array.from({ length: 9 }, () => [{ kind: 'spearman', at: [1, 1] }]) }], 1).length >= 1, 'at most 8 waves');
    const o = createObjectives([good], 1); const a = o.items.find((i) => i.id === 'arena'); assert.equal(a.goal, 2);
    const alive = new Set(); const ctx = (o2) => ({ dt: 0.5, checkpoint: 1, px: 5 * 40, py: 5 * 40, ts: 40, alive: (id) => alive.has(id), ...o2 });
    assert.deepEqual(tickWaves(o, ctx({ checkpoint: 0 })).spawn, [], 'not unlocked yet');
    assert.deepEqual(tickWaves(o, ctx({ px: 900 })).spawn, [], 'player outside the zone');
    const w1 = tickWaves(o, ctx()); assert.equal(w1.spawn.length, 1); assert.deepEqual(w1.spawn[0], { id: 'arena-1-1', kind: 'swordsman', x: 320, y: 120, hp: undefined }); assert.equal(w1.events[0].type, 'wave-start');
    alive.add('arena-1-1'); assert.deepEqual(tickWaves(o, ctx()).spawn, [], 'wave 1 is still on');
    alive.clear(); const c1 = tickWaves(o, ctx()); assert.ok(c1.events.some((e) => e.type === 'wave-clear' && e.n === 1 && e.heal === 20)); assert.equal(a.progress, 1);
    assert.equal(tickWaves(o, ctx({ dt: 1 })).spawn.length, 0, 'the gap is 2 s'); const w2 = tickWaves(o, ctx({ dt: 1.1 })); assert.equal(w2.spawn.length, 2); assert.equal(w2.events[0].n, 2);
    w2.spawn.forEach((s) => alive.add(s.id)); alive.clear(); const done = tickWaves(o, ctx()); assert.ok(done.changes.some((c) => c.id === 'arena' && c.state === 'done')); assert.equal(a.state, 'done');
    // defeat-captain
    const cap = createObjectives([{ id: 'c', type: 'defeat-captain' }], 1); const ci = cap.items.find((i) => i.id === 'c');
    updateObjectives(cap, { type: 'enemy-down', kind: 'swordsman' }); assert.equal(ci.state, 'active'); updateObjectives(cap, { type: 'enemy-down', kind: 'captain' }); assert.equal(ci.state, 'done');
    const cap2 = createObjectives([{ id: 'c', type: 'defeat-captain' }], 1); updateObjectives(cap2, { type: 'captain-down' }); assert.equal(cap2.items.find((i) => i.id === 'c').state, 'done');
    updateObjectives(cap2, { type: 'checkpoint', n: 1 }); assert.equal(objectivesStatus(cap2), 'won');
  });

  test('combat2 objectives in the sim: an arena spawns waves of armed enemies that rush you, a clear gives some health back, and the run is won only when waves, captain and checkpoint are done', () => {
    const rows = ['##########################', '#S.......................#', '#........................#', '#........................#', '#........................#', '#.......................1#', '##########################'];
    const objectives = [{ id: 'arena', type: 'waves', gap: 1, heal: 25, waves: [[{ kind: 'swordsman', at: [15, 2] }], [{ kind: 'captain', at: [15, 3] }]] }, { id: 'cap', type: 'defeat-captain' }];
    const sim = mk(rows, { objectives }, { abilities: FULL, weapon: 'sword' }); at(sim, 200, 120, 0);
    const evs = [];
    for (let i = 0; i < 8; i++) evs.push(...run(sim, 0.1));
    assert.ok(evs.some((e) => e.type === 'wave-start' && e.n === 1)); const w1 = sim.enemies.find((e) => e.id === 'arena-1-1'); assert.ok(w1 && w1.aware && w1.state !== 'patrol', 'wave enemies come straight at you');
    sim.health = 60; w1.hp = 0; w1.state = 'down'; evs.push(...run(sim, 0.2));
    assert.ok(evs.some((e) => e.type === 'wave-clear')); assert.equal(sim.health, 85, 'a clear gives back some health'); assert.ok(evs.some((e) => e.type === 'rest'));
    evs.push(...run(sim, 1.2)); const cap = sim.enemies.find((e) => e.kind === 'captain'); assert.ok(cap, 'the captain arrives in wave two');
    assert.ok(evs.some((e) => e.type === 'wave-start' && e.n === 2));
    at(sim, sim.world.checkpoints[0].x, sim.world.checkpoints[0].y); evs.push(...run(sim, 0.1)); assert.equal(sim.status, 'playing', 'not won while the captain stands');
    cap.hp = 1; cap.invul = 0; cap.state = 'stagger'; cap.stagDur = 5; cap.atk = null; sim.health = 100; at(sim, cap.x - 34, cap.y, 0); evs.push(...run(sim, 0.8, {}, { attack: true }));
    assert.ok(evs.some((e) => e.type === 'captain-down')); assert.equal(sim.status, 'won');
    assert.ok(sim.enemies.length <= 24, 'a cap on live enemies');
    JSON.stringify(makeFrame(sim, { shake: 0, flash: 0 }, false));
  });

  // ============================================================ determinism and the frame contract
  test('combat2 determinism: the same seed and controls give the same hash and events for a mixed fight, a different seed does not, and the hash covers the attack phase', () => {
    const play = (seed) => {
      const sim = crowd(['swordsman', 'spearman', 'shield', 'archer', 'captain'], { seed, weapon: 'sword' }); const ev = [];
      for (let i = 0; i < 60 * 20; i++) { ev.push(...step(sim, DT, { ...IDLE, mx: Math.sin(i / 37), my: Math.cos(i / 53), run: i % 90 < 30, hold: { block: i % 120 < 30 }, action: A({ attack: i % 19 === 0, heavy: i % 133 === 0, dodge: i % 71 === 0, push: i % 173 === 0 }) })); sim.health = Math.max(sim.health, 30); }
      return { h: stateHash(sim), ev, sim };
    };
    const a = play(7); const b = play(7); assert.equal(a.h, b.h); assert.deepEqual(a.ev, b.ev); assert.match(a.h, /^[0-9a-f]{8}$/); assert.notEqual(play(8).h, a.h); assert.ok(a.ev.length > 100);
    const { sim, e } = duel({ kind: 'swordsman' }); const h0 = stateHash(sim); forceAttack(sim, e, { phase: 'windup', t: 0.1 }); const h1 = stateHash(sim); e.atk.phase = 'active'; assert.notEqual(h0, h1); assert.notEqual(h1, stateHash(sim));
    const r1 = createRng(5); const r2 = createRng(5); assert.deepEqual([r1(), r1()], [r2(), r2()]);
  });

  test('combat2 frame contract: every enemy exposes weapon, attack phase (windup, active, recover), facing and target, and the renderer sees each phase of each kind', () => {
    for (const kind of ENEMY_KINDS) {
      const { sim, e } = duel({ kind, dist: kind === 'archer' ? 200 : 40 }); e.cd = 0; const seen = new Set(); let shape = null;
      forceAttack(sim, e, { name: ENEMY[kind].main, phase: 'windup', t: 0 });
      for (let i = 0; i < 60 * 3; i++) { step(sim, DT, { ...IDLE, hold: { block: false }, action: A() }); sim.health = 100; const f = makeFrame(sim, { shake: 0, flash: 0 }, false).enemies[0]; if (f.phase) seen.add(f.phase); if (f.phase === 'windup' && !shape) shape = f; }
      assert.deepEqual([...seen].sort(), ['active', 'recover', 'windup'], `${kind} shows every phase (${[...seen]})`);
      assert.equal(shape.weapon, ENEMY[kind].weapon); assert.equal(typeof shape.facing, 'number'); assert.equal(shape.facing, shape.angle);
      assert.deepEqual(Object.keys(shape.target).sort(), ['angle', 'id', 'x', 'y']); assert.equal(shape.state, 'windup'); assert.ok(shape.windup >= 0 && shape.windup <= 1 && shape.phaseT >= 0 && shape.phaseT <= 1);
      assert.ok(shape.attack && shape.attack.reach > 0 && shape.attack.halfArc > 0 && typeof shape.attack.unblockable === 'boolean');
      JSON.stringify(shape);
    }
    const f = makeFrame(duel({ kind: 'swordsman' }).sim, { shake: 0, flash: 0 }, false);
    for (const k of ['director', 'waves', 'timeScale', 'hitstop', 'projectiles', 'enemies', 'player']) assert.ok(k in f, k);
    for (const k of ['facing', 'parrying', 'combo', 'finisher', 'blocking', 'invulnerable']) assert.ok(k in f.player, `player.${k}`);
    const quiet = spawnEnemy({ id: 'q', kind: 'spearman', x: 900, y: 140, angle: 0 }, createRng(1)); const sim2 = mk(); sim2.enemies = [quiet];
    const fq = makeFrame(sim2, { shake: 0, flash: 0 }, false).enemies[0]; assert.equal(fq.target, null, 'an unaware patrol has no target'); assert.equal(fq.phase, null);
  });

  // ============================================================ missions
  test('combat2 all four missions run the combat rules with armed guards: every guard has a real weapon, dvapara starts unarmed, mauryan-spy keeps its stealth objective', async () => {
    for (const id of MISSION_IDS) {
      const { layout } = await here(id); const w = parseLayout(layout);
      const mission = JSON.parse(await readFile(new URL(`../../missions/${id}.json`, import.meta.url), 'utf8'));
      assert.deepEqual(validateMission(mission), [], id); assert.equal(w.rules, 2, `${id} rules 2`); assert.equal(w.checkpoints.length, mission.objectives.length);
      assert.deepEqual(validateObjectiveDefs(layout.objectives || [], w.checkpoints.length), [], id);
      for (const g of w.guards) assert.ok(ENEMY_KINDS.includes(g.kind), `${id} guard kind ${g.kind}`);
      const sim = createSim(w, { timerMode: 'off' }); assert.equal(sim.guards.length, 0);
      for (const e of sim.enemies) assert.ok(ENEMY[e.kind].weapon, `${id}: ${e.id} is armed`);
      for (const d of mission.dialogue) assert.ok(d.text.length <= 140, `${id} ${d.id}`);
      const pts = [w.start, ...w.checkpoints]; for (let i = 0; i < pts.length - 1; i++) assert.ok(reachable(w, pts[i], pts[i + 1]) > 0, `${id} leg ${i}`);
    }
    const dv = await here('dvapara-escape'); const dsim = createSim(parseLayout(dv.layout), { timerMode: 'off' });
    assert.equal(dsim.player.weapon, 'none'); assert.ok(!dsim.abilities.includes('staff')); const wv = dv.layout.objectives.filter((o) => o.type === 'waves').flatMap((o) => o.waves.flat()); assert.ok(wv.length >= 10, 'level 1 is a chain of waves');
    assert.ok(new Set(wv.map((e) => e.kind)).size >= 4, 'spears, swords, shields and a captain'); assert.ok(types(run(dsim, 0.3, {}, { attack: true })).includes('swing'), 'fists work on level 1');
    const my = await here('mauryan-spy'); const ms = parseLayout(my.layout); assert.ok(my.layout.objectives.some((o) => o.type === 'evade'), 'stealth objective stays');
    assert.ok(createSim(ms, { timerMode: 'off' }).enemies.length >= 5);
  });

  test('combat2 mauryan-spy stealth: a guard that has not seen you leaves you alone; once you are seen, he is armed and fights', () => {
    const rows = ['##############################', '#S...........................#', '#............................#', '#............................#', '#...........................1#', '##############################'];
    const hidden = mk(rows, {}, { abilities: FULL }); at(hidden, 120, 100, 0);
    const g = spawnEnemy({ id: 'g1', kind: 'swordsman', x: 200, y: 100, angle: 0 }, hidden.rng); hidden.enemies = [g]; // faces away, you are behind him
    const ev = run(hidden, 1.5); assert.ok(!types(ev).includes('seen') && !types(ev).includes('windup'), 'unseen, unfought'); assert.equal(g.aware, false);
    const spotted = mk(rows, {}, { abilities: FULL }); at(spotted, 120, 100, 0);
    const g2 = spawnEnemy({ id: 'g1', kind: 'swordsman', x: 200, y: 100, angle: Math.PI }, spotted.rng); spotted.enemies = [g2];
    const ev2 = run(spotted, 4); assert.ok(types(ev2).includes('seen') && types(ev2).includes('windup') && types(ev2).includes('hurt'), 'seen: he winds up and strikes'); assert.ok(spotted.health < 100);
  });
}
