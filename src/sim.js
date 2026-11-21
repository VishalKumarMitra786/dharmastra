// Simulation: pure game rules, no DOM. step() advances one fixed tick and returns the events that happened.
import { resolveWalls } from './world.js';
import { START_ABILITIES, WEAPONS, WEAPON_ORDER, HURDLES, hasAbility, grantAbility, closeAbilities, bestWeapon, findVault, findCross, solidObstacles, underBeam, PREREQ } from './abilities.js';
import { COMBAT, ATTACKS, createEnemies, createTargets, startAttack, resolveSwing, stepEnemies, regenStamina, tryDodge, stepDodge, updateGuard, updateAim, stepArrows } from './combat.js';
import { createObjectives, updateObjectives, objectivesStatus } from './objectives.js';

export const TUNING = {
  maxSpeed: 200, maxReverse: 80, accel: 260, brakeForce: 420, coast: 120, drag: 0.25,
  turnRate: 2.8, turnFullAt: 90, radius: 18, guardRadius: 16,
  maxHealth: 100, wallDamage: 8, guardDamage: 20, impactMin: 45, wallCooldown: 0.5, guardInvuln: 1.2,
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

export function createSim(world, { timerMode = 'standard', tuning = {}, abilities, weapon, seed = 1, rules, objectives } = {}) {
  const t = { ...TUNING, ...tuning };
  const sim = {
    world, t, status: 'playing', failReason: null, elapsed: 0, timerMode,
    health: t.maxHealth, checkpoint: 0, wallCooldown: 0, invuln: 0,
    foot: world.mode === 'foot',
    chariot: { ...world.start, speed: 0, radius: world.mode === 'foot' ? t.footRadius : t.radius, moveAngle: world.start.angle || 0 },
    guards: world.guards.map((g) => ({ ...g.path[0], radius: world.mode === 'foot' ? t.footGuardRadius : t.guardRadius, angle: 0, speed: g.speed, path: g.path, target: 1 % g.path.length })),
  };
  sim.rules2 = (rules ?? world.rules) === 2 && sim.foot;
  sim.abilities = sim.rules2 ? [...new Set([...START_ABILITIES, ...(Array.isArray(abilities) ? abilities : [])])] : [...START_ABILITIES];
  sim.player = { hp: sim.health, state: 'idle', stateT: 0, weapon: 'none', cooldown: 0, crouching: false, swingHit: true, attackAngle: 0, vault: null,
    atk: 'staff', stamina: COMBAT.stamina.max, stamDelay: 0, dodgeCd: 0, dodgeAngle: 0, draw: 0, drawFull: false, aimAngle: 0, aimHeld: false, arrows: 0 };
  sim.rng = createRng(seed);
  sim.enemies = []; sim.pickups = []; sim.targets = []; sim.arrows = []; sim.arrowSeq = 0; sim.objectives = null; sim.fx = [];
  if (sim.rules2) {
    sim.abilities = closeAbilities(sim.abilities); // known ids only, a weapon never without the one it builds on
    for (let i = 0; i < 16; i++) sim.arrows.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, left: 0, dmg: 1, angle: 0 }); // fixed pool: no allocation per shot
    if (WEAPONS.includes(weapon) && (weapon === 'none' || hasAbility(sim, weapon))) sim.player.weapon = weapon;
    else sim.player.weapon = bestWeapon(sim.abilities);
    if (hasAbility(sim, 'bow')) sim.player.arrows = COMBAT.bow.startArrows;
    sim.enemies = createEnemies(world, sim.rng);
    sim.targets = createTargets(world);
    sim.pickups = world.pickups.map((k) => ({ ...k, taken: false }));
    sim.objectives = createObjectives(objectives ?? world.objectiveDefs, world.checkpoints.length);
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

export function step(sim, dt, controls) {
  if (sim.status !== 'playing') return [];
  const events = [];
  sim.elapsed += dt;
  sim.wallCooldown = Math.max(0, sim.wallCooldown - dt);
  sim.invuln = Math.max(0, sim.invuln - dt);
  if (sim.rules2) playerStep(sim, dt, controls, events);
  else if (sim.foot) walk(sim, dt, controls); else driveChariot(sim, dt, controls);
  moveGuards(sim, dt);
  if (sim.rules2) { stepEnemies(sim, dt, events); stepArrows(sim, dt, events); for (const t of sim.targets) t.flash = Math.max(0, t.flash - dt); }
  wallHits(sim, events);
  guardHits(sim, events);
  checkpoints(sim, events);
  if (sim.rules2) settleObjectives(sim, events);
  sim.player.hp = sim.health;
  for (const e of events) queueFx(sim, e);
  if (sim.status === 'playing' && sim.health <= 0) finish(sim, events, 'failed', 'wrecked');
  if (sim.status === 'playing' && sim.timeLeft != null) {
    sim.timeLeft = Math.max(0, sim.timeLeft - dt);
    if (sim.timeLeft === 0) finish(sim, events, 'failed', 'time');
  }
  return events;
}

function finish(sim, events, status, reason) {
  sim.status = status;
  sim.failReason = status === 'failed' ? reason : null;
  events.push({ type: status === 'won' ? 'win' : 'fail', reason });
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

function moveGuards(sim, dt) {
  for (const g of sim.guards) {
    const to = g.path[g.target];
    const dx = to.x - g.x; const dy = to.y - g.y;
    const dist = Math.hypot(dx, dy);
    const stepLen = g.speed * dt;
    if (dist <= stepLen) { g.x = to.x; g.y = to.y; g.target = (g.target + 1) % g.path.length; continue; }
    g.x += (dx / dist) * stepLen; g.y += (dy / dist) * stepLen;
    g.angle = Math.atan2(dy, dx);
  }
}

function wallHits(sim, events) {
  const c = sim.chariot;
  if (sim.foot) { // walking into a wall just stops you, no damage
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
  sim.health = Math.max(0, sim.health - sim.t.wallDamage);
  events.push({ type: 'wall', damage: sim.t.wallDamage, health: sim.health });
}

function guardHits(sim, events) {
  const c = sim.chariot;
  for (const g of sim.guards) {
    const dx = c.x - g.x; const dy = c.y - g.y;
    const min = c.radius + g.radius;
    const d = Math.hypot(dx, dy);
    if (d >= min) continue;
    const nx = d > 0 ? dx / d : 1; const ny = d > 0 ? dy / d : 0;
    c.x = g.x + nx * min; c.y = g.y + ny * min; // separate so we do not hit every tick
    if (sim.invuln > 0) continue;
    c.speed = sim.foot ? 0 : c.speed * -0.3;
    sim.invuln = sim.t.guardInvuln;
    sim.health = Math.max(0, sim.health - sim.t.guardDamage);
    events.push({ type: 'guard', damage: sim.t.guardDamage, health: sim.health });
  }
  resolveWalls(sim.world, c);
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

// Feeds this tick's events to the objective machine, emits objective events, and decides win or loss.
function settleObjectives(sim, events) {
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

const FX_TYPES = new Set(['hit-enemy', 'enemy-down', 'enemy-fell', 'hurt', 'vault', 'pickup', 'dodge', 'climb', 'shove-hit', 'parry', 'blocked', 'target-hit', 'shot', 'stagger']);
function queueFx(sim, e) {
  if (!FX_TYPES.has(e.type) || sim.fx.length >= 32) return;
  const c = sim.chariot;
  sim.fx.push({ type: e.type, x: e.x ?? c.x, y: e.y ?? c.y });
}

// Foot player with rules 2: crouch, vault, climb, dodge, shove, staff, sword, bow. Edge-triggered actions come in controls.action;
// held actions (block, aim) come in controls.hold.
function playerStep(sim, dt, controls, events) {
  const p = sim.player; const c = sim.chariot; const act = controls.action || {}; const hold = controls.hold || {};
  p.stateT += dt; p.cooldown = Math.max(0, p.cooldown - dt); p.dodgeCd = Math.max(0, p.dodgeCd - dt);
  regenStamina(sim, dt);
  if (p.state === 'vault' || p.state === 'climb') {
    const dur = p.state === 'climb' ? HURDLES.climb.duration : HURDLES.vault.duration;
    const k = Math.min(1, p.stateT / dur);
    const v = p.vault;
    c.x = v.sx + (v.ex - v.sx) * k; c.y = v.sy + (v.ey - v.sy) * k; c.speed = 0;
    sim.invuln = Math.max(sim.invuln, dt * 2);
    if (k >= 1) { p.state = 'idle'; p.stateT = 0; p.vault = null; }
  } else if (p.state === 'dodge') {
    stepDodge(sim, dt);
  } else {
    const sw = ATTACKS[p.atk];
    if (p.state === 'attack' && p.stateT >= (sw?.swing ?? COMBAT.staff.swing)) { p.state = 'idle'; p.stateT = 0; }
    if (p.state === 'shove' && p.stateT >= ATTACKS.shove.swing) { p.state = 'idle'; p.stateT = 0; }
    if (p.state === 'hurt' && p.stateT >= COMBAT.hurtTime) { p.state = 'idle'; p.stateT = 0; }
    swapWeapon(sim, act, events);
    if (act.crouch && hasAbility(sim, 'crouch')) {
      if (!p.crouching) p.crouching = true;
      else if (!underBeam(sim.world, c.x, c.y, c.radius + 2)) p.crouching = false; // cannot stand up under a beam
    }
    if (act.dodge) tryDodge(sim, controls, events);
    if (p.state !== 'dodge') {
      if (act.push) startAttack(sim, 'shove', events);
      if (act.attack) startAttack(sim, 'auto', events);
      if (act.heavy) startAttack(sim, 'heavy', events);
      updateGuard(sim, !!hold.block);
      updateAim(sim, dt, !!hold.aim, events);
      const doIt = act.interact || act.jump;
      if (doIt && !(act.interact && tryPickup(sim, events)) && !tryVault(sim, events)) tryClimb(sim, events);
    }
  }
  if (p.state !== 'vault' && p.state !== 'climb' && p.state !== 'dodge') {
    const slow = p.state === 'block' ? COMBAT.block.moveScale : p.state === 'aim' ? COMBAT.bow.aimMoveScale : p.state === 'shove' || (p.state === 'attack' && p.atk !== 'staff') ? 0.5 : 1;
    const run = !!controls.run && hasAbility(sim, 'run') && !p.crouching && slow === 1;
    walk(sim, dt, { mx: controls.mx, my: controls.my, run }, (p.crouching ? HURDLES.crouchSpeed : 1) * slow);
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
  if (grantAbility(sim, best.kind)) events.push({ type: 'ability', id: best.kind });
  return true;
}

// Compact hash of the full sim state; equal control scripts must give equal hashes.
export function stateHash(sim) {
  const c = sim.chariot; const p = sim.player;
  const f = (n) => n.toFixed(4);
  const parts = [f(c.x), f(c.y), f(c.angle), f(c.speed), f(sim.health), f(sim.elapsed), sim.status, sim.checkpoint, p.state, f(p.stateT), p.weapon, f(p.cooldown), p.crouching ? 1 : 0, sim.abilities.join(','), sim.rng.state(), f(p.stamina), f(p.draw), p.arrows, p.atk, f(p.dodgeCd)];
  for (const e of sim.enemies) parts.push(e.id, f(e.x), f(e.y), f(e.angle), e.hp, e.state, f(e.stateT), f(e.kbT), e.fell ? 1 : 0);
  for (const k of sim.pickups) parts.push(k.id, k.taken ? 1 : 0, f(k.x), f(k.y));
  for (const a of sim.arrows) if (a.active) parts.push('ar', f(a.x), f(a.y), a.dmg);
  for (const t of sim.targets) parts.push(t.id, t.hits);
  for (const o of sim.objectives?.items ?? []) parts.push(o.id, o.state, o.progress);
  let h = 2166136261;
  for (const ch of parts.join('|')) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return h.toString(16).padStart(8, '0');
}
