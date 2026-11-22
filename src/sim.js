// Simulation: pure game rules, no DOM. step() advances one fixed tick and returns the events that happened.
import { resolveWalls } from './world.js';
import { START_ABILITIES, COMBAT_BASICS, WEAPONS, WEAPON_ORDER, HURDLES, hasAbility, grantAbility, closeAbilities, bestWeapon, findCross, solidObstacles, underBeam, PREREQ } from './abilities.js';
import { COMBAT, createProps, stepProps, tryPickupProp, dropHeld, startThrow, throwContext, twoHandCue, carryScale, createEnemies, createTargets, spawnEnemy, startAttack, stepAttack, lungeStep, stepFinisher, resolveSwing, stepEnemies, regenStamina, tryDodge, stepDodge, updateGuard, updateAim, stepArrows, stepEnemyArrows } from './combat.js';
import { createObjectives, updateObjectives, objectivesStatus, tickWaves, phaseSpawns } from './objectives.js';
import { createStyle, feedStyle, tickStyle, rankResult } from './style.js';

export const TUNING = {
  maxSpeed: 200, maxReverse: 80, accel: 260, brakeForce: 420, coast: 120, drag: 0.25,
  turnRate: 2.8, turnFullAt: 90, radius: 18, guardRadius: 16,
  maxHealth: 100, impactMin: 45, wallCooldown: 0.5, // walls and guards never cost health: only an enemy's telegraphed attack does (see combat.js)
  walkSpeed: 135, runSpeed: 215, footAccel: 900, footTurn: 14, footRadius: 14, footGuardRadius: 13,
  timerFactor: { off: null, standard: 1, extended: 2 },
};

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Seeded PRNG (mulberry32). rng() gives 0..1; rng.state() exposes the counter for hashing.
export function createRng(seed = 1) {
  let a = seed >>> 0;
  const f = () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  f.state = () => a;
  return f;
}

export function createSim(world, { timerMode = 'standard', tuning = {}, abilities, weapon, seed = 1, rules, objectives, reduceMotion = false } = {}) {
  const t = { ...TUNING, ...tuning };
  const sim = {
    world, t, status: 'playing', failReason: null, elapsed: 0, timerMode,
    health: t.maxHealth, checkpoint: 0, wallCooldown: 0, invuln: 0,
    foot: world.mode === 'foot',
    chariot: { ...world.start, speed: 0, radius: world.mode === 'foot' ? t.footRadius : t.radius, moveAngle: world.start.angle || 0 },
    guards: [], // the old touch-damage patrol guards are gone: a layout's guards become armed enemies (combat.js createEnemies)
    reduceMotion: !!reduceMotion, clock: 0, hitstop: 0, slow: { left: 0, scale: 1 }, pending: null, lastWindup: -9,
  };
  sim.rules2 = (rules ?? world.rules) === 2 && sim.foot;
  sim.abilities = sim.rules2 ? [...new Set([...START_ABILITIES, ...COMBAT_BASICS, ...(Array.isArray(abilities) ? abilities : [])])] : [...START_ABILITIES];
  sim.player = { hp: sim.health, state: 'idle', stateT: 0, weapon: 'none', cooldown: 0, crouching: false, swingHit: true, attackAngle: 0, vault: null,
    atk: 'none', spec: null, combo: -1, comboT: 0, queued: null, queueT: 0, hurtFor: 0, kx: 0, ky: 0, kbT: 0, finTarget: null,
    stamina: COMBAT.stamina.max, stamDelay: 0, dodgeCd: 0, dodgeAngle: 0, draw: 0, drawFull: false, aimAngle: 0, aimHeld: false, arrows: 0, held: null, twoHandCd: 0 };
  sim.rng = createRng(seed);
  sim.enemies = []; sim.props = []; sim.propSeq = 0; sim.pickups = []; sim.targets = []; sim.arrows = []; sim.eArrows = []; sim.arrowSeq = 0; sim.objectives = null; sim.fx = []; sim.nav = null;
  if (sim.rules2) {
    sim.abilities = closeAbilities(sim.abilities); // known ids only, a weapon never without the one it builds on
    for (let i = 0; i < 16; i++) sim.arrows.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, left: 0, dmg: 1, angle: 0 }); // fixed pools: no allocation per shot
    for (let i = 0; i < 12; i++) sim.eArrows.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, left: 0, dmg: 1, angle: 0, from: null, stun: 0, knock: 0 });
    if (WEAPONS.includes(weapon) && (weapon === 'none' || hasAbility(sim, weapon))) sim.player.weapon = weapon;
    else sim.player.weapon = bestWeapon(sim.abilities);
    if (hasAbility(sim, 'bow')) sim.player.arrows = COMBAT.bow.startArrows;
    sim.enemies = createEnemies(world, sim.rng);
    sim.targets = createTargets(world);
    sim.props = createProps(world);
    sim.pickups = world.pickups.map((k) => ({ ...k, taken: false }));
    sim.objectives = createObjectives(objectives ?? world.objectiveDefs, world.checkpoints.length);
    sim.style = createStyle(); sim.result = null; // the style meter and, once won, the end rank (src/style.js)
  }
  sim.timeLeft = limitFor(sim);
  return sim;
}

function limitFor(sim, mode = sim.timerMode) {
  const f = sim.t.timerFactor[mode];
  return f == null ? null : sim.world.timeLimit * f;
}

// Change the timer mid-run: keep elapsed time, never leave less than 10s when switching a timer on.
export function setTimerMode(sim, mode) {
  sim.timerMode = mode;
  const limit = limitFor(sim);
  sim.timeLeft = limit == null ? null : Math.max(10, limit - sim.elapsed);
}

export function setReduceMotion(sim, on) {
  sim.reduceMotion = !!on;
  if (on) { sim.hitstop = 0; sim.slow.left = 0; sim.slow.scale = 1; } // no hit-stop and no slow motion under reduced motion
}

const ACTION_KEYS = ['attack', 'jump', 'crouch', 'interact', 'dodge', 'push', 'heavy', 'swap', 'w1', 'w2', 'w3', 'throw', 'drop'];
const mergeActions = (a, b) => { const out = {}; for (const k of ACTION_KEYS) out[k] = !!(a?.[k] || b?.[k]); return out; };

export function step(sim, dt, controls) {
  if (sim.status !== 'playing') return [];
  const events = [];
  sim.elapsed += dt;
  let gdt = dt; let frozen = false;
  if (sim.rules2) {
    if (sim.hitstop > 0) { // a brief hit-stop: the world holds still, button presses are kept for the first live tick
      sim.hitstop = Math.max(0, sim.hitstop - dt); sim.pending = mergeActions(sim.pending, controls.action); frozen = true;
    } else {
      if (sim.pending) { controls = { ...controls, action: mergeActions(sim.pending, controls.action) }; sim.pending = null; }
      if (sim.slow.left > 0) { sim.slow.left = Math.max(0, sim.slow.left - dt); gdt = dt * sim.slow.scale; if (sim.slow.left === 0) sim.slow.scale = 1; }
    }
  }
  if (!frozen) advance(sim, gdt, controls, events);
  if (sim.status === 'playing' && sim.health <= 0) finish(sim, events, 'failed', sim.foot ? 'defeated' : 'wrecked');
  if (sim.status === 'playing' && sim.timeLeft != null) {
    sim.timeLeft = Math.max(0, sim.timeLeft - dt);
    if (sim.timeLeft === 0) finish(sim, events, 'failed', 'time');
  }
  return events;
}

function advance(sim, dt, controls, events) {
  sim.clock += dt;
  sim.wallCooldown = Math.max(0, sim.wallCooldown - dt);
  sim.invuln = Math.max(0, sim.invuln - dt);
  if (sim.rules2) playerStep(sim, dt, controls, events);
  else if (sim.foot) walk(sim, dt, controls); else driveChariot(sim, dt, controls);
  if (sim.rules2) { stepEnemies(sim, dt, events); stepArrows(sim, dt, events); stepEnemyArrows(sim, dt, events); stepProps(sim, dt, events); for (const t of sim.targets) t.flash = Math.max(0, t.flash - dt); }
  wallHits(sim, events);
  checkpoints(sim, events);
  if (sim.rules2) { events.push(...tickStyle(sim.style, dt), ...feedStyle(sim.style, events)); settleObjectives(sim, dt, events); }
  sim.player.hp = sim.health;
  for (const e of events) queueFx(sim, e);
}

function finish(sim, events, status, reason) {
  sim.status = status;
  sim.failReason = status === 'failed' ? reason : null;
  if (status === 'won' && sim.style) sim.result = rankResult(sim.style, sim.elapsed, sim.world.rank);
  events.push({ type: status === 'won' ? 'win' : 'fail', reason, rank: sim.result?.rank });
}

function driveChariot(sim, dt, { steer = 0, throttle = 0 }) {
  const { t, chariot: c } = sim;
  const thr = clamp(throttle, -1, 1);
  if (thr > 0) c.speed += (c.speed < 0 ? t.brakeForce : t.accel) * thr * dt;
  else if (thr < 0) c.speed += (c.speed > 0 ? -t.brakeForce : -t.accel) * -thr * dt;
  else c.speed -= Math.sign(c.speed) * Math.min(Math.abs(c.speed), t.coast * dt);
  c.speed = clamp(c.speed * (1 - t.drag * dt), -t.maxReverse, t.maxSpeed);
  c.angle += clamp(steer, -1, 1) * t.turnRate * clamp(c.speed / t.turnFullAt, -1, 1) * dt;
  c.x += Math.cos(c.angle) * c.speed * dt;
  c.y += Math.sin(c.angle) * c.speed * dt;
}

// On foot: direct control. (mx, my) is the wanted direction on the map (x east, y south), length 0..1 for analog sticks.
function walk(sim, dt, { mx = 0, my = 0, run = false }, scale = 1) {
  const { t, chariot: c } = sim;
  let len = Math.hypot(mx, my);
  if (len > 1) { mx /= len; my /= len; len = 1; }
  const wanted = len > 0.08 ? (run ? t.runSpeed : t.walkSpeed) * len * scale : 0;
  if (len > 0.08) c.moveAngle = Math.atan2(my, mx);
  const dv = wanted - c.speed;
  c.speed += Math.sign(dv) * Math.min(Math.abs(dv), t.footAccel * dt);
  c.angle += clamp(angleDiff(c.angle, c.moveAngle), -t.footTurn * dt, t.footTurn * dt);
  c.x += Math.cos(c.moveAngle) * c.speed * dt;
  c.y += Math.sin(c.moveAngle) * c.speed * dt;
}

function angleDiff(from, to) {
  const tau = Math.PI * 2;
  let d = (to - from) % tau;
  if (d > Math.PI) d -= tau;
  if (d < -Math.PI) d += tau;
  return d;
}

function wallHits(sim, events) {
  const c = sim.chariot;
  if (sim.foot) { // walking into a wall just stops you
    resolveWalls(sim.world, c);
    if (sim.rules2 && sim.player.state !== 'vault' && sim.player.state !== 'climb') resolveWalls({ walls: solidObstacles(sim.world, sim.player.crouching).map(asWall) }, c);
    return;
  }
  const vx = Math.cos(c.angle) * c.speed; const vy = Math.sin(c.angle) * c.speed;
  const normals = resolveWalls(sim.world, c);
  const impact = Math.max(0, ...normals.map((n) => -(vx * n.nx + vy * n.ny)));
  if (impact < sim.t.impactMin) return;
  c.speed *= 0.4;
  if (sim.wallCooldown > 0) return;
  sim.wallCooldown = sim.t.wallCooldown;
  events.push({ type: 'wall', damage: 0, health: sim.health }); // a bump is a sound and a caption, never a loss of health
}

function checkpoints(sim, events) {
  const next = sim.world.checkpoints[sim.checkpoint];
  if (!next || sim.health <= 0) return;
  if (Math.hypot(sim.chariot.x - next.x, sim.chariot.y - next.y) > next.radius) return;
  sim.checkpoint += 1;
  events.push({ type: 'checkpoint', n: sim.checkpoint });
  if (sim.rules2) return; // rules 2: the objectives decide the win
  if (sim.checkpoint === sim.world.checkpoints.length) finish(sim, events, 'won');
}

const asWall = (o) => ({ x: o.x, y: o.y, w: o.w, h: o.d });

// Feeds this tick's events to the objective machine, emits objective events, spawns arena waves, and decides win or loss.
const MAX_ENEMIES = 24;
function settleObjectives(sim, dt, events) {
  // arena waves first, so a wave that starts this tick can be reported with its spawns
  const w = sim.world; const ts = w.tileSize;
  const wv = tickWaves(sim.objectives, { dt, checkpoint: sim.checkpoint, px: sim.chariot.x, py: sim.chariot.y, ts, alive: (id) => sim.enemies.some((e) => e.id === id && e.state !== 'down') });
  for (const sp of wv.spawn) {
    if (sim.enemies.length >= MAX_ENEMIES) break;
    const e = spawnEnemy({ id: sp.id, kind: sp.kind, x: sp.x, y: sp.y, hp: sp.hp, angle: Math.atan2(sim.chariot.y - sp.y, sim.chariot.x - sp.x), wave: true }, sim.rng);
    e.aware = true; e.state = 'chase'; e.lastX = sim.chariot.x; e.lastY = sim.chariot.y;
    sim.enemies.push(e);
  }
  for (const e of sim.enemies) if (e.wave && e.state !== 'down' && (e.state === 'patrol' || e.state === 'alert')) { e.state = 'chase'; e.stateT = 0; e.aware = true; e.lostT = 0; e.lastX = sim.chariot.x; e.lastY = sim.chariot.y; } // a wave never gives up the hunt or goes back to a patrol
  events.push(...wv.events);
  for (const ev of events) for (const sp of phaseSpawns(sim.objectives, ev, { ts })) { // a captain's reinforcements arrive on the phase change
    if (sim.enemies.length >= MAX_ENEMIES) break;
    const e = spawnEnemy({ id: sp.id, kind: sp.kind, x: sp.x, y: sp.y, hp: sp.hp, angle: Math.atan2(sim.chariot.y - sp.y, sim.chariot.x - sp.x), wave: true }, sim.rng);
    e.aware = true; e.state = 'chase'; e.lastX = sim.chariot.x; e.lastY = sim.chariot.y; sim.enemies.push(e);
    events.push({ type: 'reinforce', id: sp.id, kind: sp.kind, x: sp.x, y: sp.y });
  }
  for (const e of wv.events) if (e.type === 'wave-clear' && e.heal > 0 && sim.health > 0) { sim.health = Math.min(sim.t.maxHealth, sim.health + e.heal); events.push({ type: 'rest', amount: e.heal, health: sim.health }); } // a breath between waves
  for (const ch of wv.changes) events.push({ type: 'objective', id: ch.id, state: ch.state });
  const feed = events.filter((e) => e.type !== 'objective' && e.type !== 'win' && e.type !== 'fail');
  const changes = [];
  for (const e of feed) changes.push(...updateObjectives(sim.objectives, e));
  changes.push(...updateObjectives(sim.objectives, null));
  for (const c of changes) events.push({ type: 'objective', id: c.id, state: c.state });
  if (sim.status !== 'playing') return;
  const st = objectivesStatus(sim.objectives);
  if (st === 'won') finish(sim, events, 'won');
  else if (st === 'failed') finish(sim, events, 'failed', 'seen');
}

const FX_TYPES = new Set(['hit-enemy', 'enemy-down', 'enemy-fell', 'hurt', 'vault', 'pickup', 'dodge', 'climb', 'shove-hit', 'parry', 'blocked', 'target-hit', 'shot', 'stagger', 'shield-block', 'shield-break', 'finisher', 'windup', 'enemy-swing', 'enemy-arrow', 'arrow-hit', 'call', 'phase', 'whiff', 'opened', 'retreat', 'wave-start', 'wave-clear', 'captain-down', 'swing', 'guard-break', 'prop-pickup', 'prop-drop', 'prop-throw', 'prop-break', 'prop-shatter', 'prop-land', 'disarm', 'enemy-rearm', 'enemy-pickup']);
function queueFx(sim, e) {
  if (!FX_TYPES.has(e.type) || sim.fx.length >= 48) return;
  const c = sim.chariot;
  sim.fx.push({ type: e.type, x: e.x ?? c.x, y: e.y ?? c.y, id: e.id, kind: e.kind, via: e.via, heavy: e.heavy, dir: e.dir, angle: e.angle, n: e.n, dur: e.dur });
}

// Foot player with rules 2: fists, staff, sword, bow, block and parry, roll, shove, finisher, crouch, vault, climb.
// Edge-triggered actions come in controls.action; held actions (block, aim) come in controls.hold.
function playerStep(sim, dt, controls, events) {
  const p = sim.player; const c = sim.chariot; const act = controls.action || {}; const hold = controls.hold || {};
  p.stateT += dt; p.cooldown = Math.max(0, p.cooldown - dt); p.dodgeCd = Math.max(0, p.dodgeCd - dt); p.comboT = Math.max(0, p.comboT - dt);
  regenStamina(sim, dt);
  if (p.state === 'hurt' && p.stateT >= (p.hurtFor || COMBAT.hurtTime)) { p.state = 'idle'; p.stateT = 0; }
  if (p.state === 'vault' || p.state === 'climb') {
    const dur = p.state === 'climb' ? HURDLES.climb.duration : HURDLES.vault.duration;
    const k = Math.min(1, p.stateT / dur);
    const v = p.vault;
    c.x = v.sx + (v.ex - v.sx) * k; c.y = v.sy + (v.ey - v.sy) * k; c.speed = 0;
    sim.invuln = Math.max(sim.invuln, dt * 2);
    if (k >= 1) { p.state = 'idle'; p.stateT = 0; p.vault = null; }
  } else if (p.state === 'dodge') {
    stepDodge(sim, dt);
  } else if (p.state === 'finisher') {
    stepFinisher(sim, dt, events);
  } else {
    if (p.state === 'attack' || p.state === 'shove') stepAttack(sim, dt, act, events);
    swapWeapon(sim, act, events);
    if (act.crouch && hasAbility(sim, 'crouch') && p.state !== 'hurt') {
      if (!p.crouching) p.crouching = true;
      else if (!underBeam(sim.world, c.x, c.y, c.radius + 2)) p.crouching = false; // cannot stand up under a beam
    }
    if (act.drop && p.state !== 'hurt') dropHeld(sim, events);
    if (act.dodge) tryDodge(sim, controls, events);
    if (p.state !== 'dodge' && p.state !== 'hurt') {
      if (act.push) startAttack(sim, 'shove', events);
      if (act.attack) startAttack(sim, 'auto', events);
      if (act.heavy) startAttack(sim, 'heavy', events);
      if (act.throw) startThrow(sim, events);
      updateGuard(sim, !!hold.block); twoHandCue(sim, !!hold.block, events);
      updateAim(sim, dt, !!hold.aim, events);
      const doIt = act.interact || act.jump;
      if (doIt) { // Do: take a lesson token or a prop, else vault, else climb, else throw what you hold at the enemy in front (the HUD says "Throw" only then)
        const took = act.interact && (tryPickup(sim, events) || tryPickupProp(sim, events));
        if (!took && !tryVault(sim, events) && !tryClimb(sim, events) && act.interact) throwContext(sim, events);
      }
    }
  }
  if (p.kbT > 0) { c.x += p.kx * dt; c.y += p.ky * dt; p.kbT -= dt; } // the push of a blow
  if (p.state !== 'vault' && p.state !== 'climb' && p.state !== 'dodge' && p.state !== 'finisher') {
    let run = false;
    if (p.state === 'hurt') c.speed = 0;
    else {
      const slow = (p.state === 'block' ? COMBAT.block.moveScale : p.state === 'aim' ? COMBAT.bow.aimMoveScale : p.state === 'shove' || p.state === 'attack' ? 0.5 : 1) * carryScale(p);
      run = !!controls.run && hasAbility(sim, 'run') && !p.crouching && slow === 1;
      walk(sim, dt, { mx: controls.mx, my: controls.my, run }, (p.crouching ? HURDLES.crouchSpeed : 1) * slow);
    }
    lungeStep(sim, dt);
    resolveSwing(sim, events);
    if (p.state !== 'attack' && p.state !== 'hurt' && p.state !== 'shove' && p.state !== 'block' && p.state !== 'aim') {
      const want = p.crouching ? 'crouch' : c.speed > 10 ? (run ? 'run' : 'walk') : 'idle';
      if (want !== p.state) { p.state = want; p.stateT = 0; }
    }
  }
}

// Swap cycles through the weapons you own (staff, sword, bow, then bare hands); w1..w3 pick one directly.
function swapWeapon(sim, act, events) {
  const p = sim.player;
  if (!(act.swap || act.w1 || act.w2 || act.w3)) return;
  if (p.held && (p.state === 'idle' || p.state === 'walk' || p.state === 'run' || p.state === 'crouch')) { dropHeld(sim, events, 'swap'); if (act.swap) return; } // the held prop is put down; the weapons keys then equip as usual
  if (!(p.state === 'idle' || p.state === 'walk' || p.state === 'run' || p.state === 'crouch' || p.state === 'block')) return;
  const owned = WEAPON_ORDER.filter((w) => hasAbility(sim, w));
  if (!owned.length) return;
  const direct = act.w1 ? 'staff' : act.w2 ? 'sword' : act.w3 ? 'bow' : null;
  let next;
  if (direct) { if (!owned.includes(direct) || direct === p.weapon) return; next = direct; }
  else { const i = owned.indexOf(p.weapon); next = i === -1 ? owned[0] : i + 1 < owned.length ? owned[i + 1] : 'none'; }
  p.weapon = next; p.draw = 0; p.drawFull = false;
  if (p.state === 'block') { p.state = 'idle'; p.stateT = 0; }
  events.push({ type: 'weapon', weapon: next });
}

const FREE_STATES = new Set(['idle', 'walk', 'run', 'crouch']);

function startCross(sim, events, kind, state, max, type, slack) {
  const p = sim.player; const c = sim.chariot;
  if (!FREE_STATES.has(p.state)) return false;
  const v = findCross(sim.world, c, c.moveAngle, kind, max, slack);
  if (!v) return false;
  p.vault = v; p.state = state; p.stateT = 0; p.crouching = false; c.speed = 0;
  events.push({ type });
  return true;
}
const tryVault = (sim, events) => hasAbility(sim, 'vault') && startCross(sim, events, 'lowwall', 'vault', sim.world.tileSize * 3, 'vault');
const tryClimb = (sim, events) => hasAbility(sim, 'climb') && startCross(sim, events, 'ledge', 'climb', sim.world.tileSize * 4, 'climb', 30); // a little forgiving: face the stone, within a few steps

function tryPickup(sim, events) {
  const c = sim.chariot;
  let best = null; let bd = 44;
  for (const k of sim.pickups) {
    if (k.taken) continue;
    const d = Math.hypot(k.x - c.x, k.y - c.y);
    if (d <= bd) { best = k; bd = d; }
  }
  if (!best) return false;
  const p = sim.player;
  if (best.kind === 'arrows') { // a quiver or a spent arrow: only taken when there is room
    if (p.arrows >= COMBAT.bow.maxArrows) return false;
    p.arrows = Math.min(COMBAT.bow.maxArrows, p.arrows + (best.n || 1));
  } else if (PREREQ[best.kind]?.some((n) => !hasAbility(sim, n))) { events.push({ type: 'refused', id: best.id, kind: best.kind }); return true; } // too early: it stays where it is
  best.taken = true;
  events.push({ type: 'pickup', id: best.id, kind: best.kind, x: best.x, y: best.y });
  if (grantAbility(sim, best.kind) || COMBAT_BASICS.includes(best.kind)) events.push({ type: 'ability', id: best.kind }); // the roll and the shove are always known, but the teacher's lesson is still given
  return true;
}

// Compact hash of the full sim state; equal control scripts must give equal hashes.
export function stateHash(sim) {
  const c = sim.chariot; const p = sim.player;
  const f = (n) => n.toFixed(4);
  const parts = [f(c.x), f(c.y), f(c.angle), f(c.speed), f(sim.health), f(sim.elapsed), f(sim.clock), sim.status, sim.checkpoint, p.state, f(p.stateT), p.weapon, f(p.cooldown), p.crouching ? 1 : 0, sim.abilities.join(','), sim.rng.state(), f(p.stamina), f(p.draw), p.arrows, p.atk, p.combo, f(p.comboT), f(p.dodgeCd), f(sim.hitstop), f(sim.slow.left), f(sim.invuln)];
  for (const e of sim.enemies) parts.push(e.id, f(e.x), f(e.y), f(e.angle), e.hp, e.state, f(e.stateT), f(e.kbT), e.fell ? 1 : 0, e.open ? 1 : 0, e.phaseNo, e.atk ? `${e.atk.name}${e.atk.idx}${e.atk.phase}${f(e.atk.t)}` : '-');
  parts.push(p.held ? p.held.id : '-');
  for (const e of sim.enemies) parts.push(e.carry ?? '-', e.carryUses, e.rearm ? e.rearm.t.toFixed(2) : '-');
  for (const q of sim.props) parts.push(q.id, q.state, f(q.x), f(q.y), q.uses);
  for (const k of sim.pickups) parts.push(k.id, k.taken ? 1 : 0, f(k.x), f(k.y));
  for (const a of sim.arrows) if (a.active) parts.push('ar', f(a.x), f(a.y), a.dmg);
  for (const a of sim.eArrows) if (a.active) parts.push('ea', f(a.x), f(a.y));
  for (const t of sim.targets) parts.push(t.id, t.hits);
  for (const o of sim.objectives?.items ?? []) parts.push(o.id, o.state, o.progress, o.wave ?? '');
  let h = 2166136261;
  for (const ch of parts.join('|')) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return h.toString(16).padStart(8, '0');
}
