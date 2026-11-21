// Combat and enemy AI: staff, sword (light, heavy, block, parry), dodge roll, shove, bow and arrows. Pure and deterministic:
// no DOM, no unseeded randomness and no clock; randomness only through sim.rng. Every number a person can feel is in the tables below.
import { resolveWalls } from './world.js';
import { inGrass, inPit, circleHitsRect } from './abilities.js';

// Melee actions. swing = whole action in seconds, hitAt = the moment the arc is applied, stamina = cost to start.
export const ATTACKS = {
  staff: { swing: 0.45, hitAt: 0.18, range: 60, halfArc: Math.PI / 3, damage: 1, stagger: 1.2, cooldown: 0.6, stamina: 0, flee: true },
  light: { swing: 0.4, hitAt: 0.14, range: 56, halfArc: 0.95, damage: 1, stagger: 0.9, cooldown: 0.45, stamina: 10, via: 'sword' },
  heavy: { swing: 0.8, hitAt: 0.46, range: 66, halfArc: 0.95, damage: 2, stagger: 1.5, cooldown: 0.9, stamina: 30, via: 'sword' }, // 0.46 s of visible wind-up
  shove: { swing: 0.3, hitAt: 0.1, range: 46, halfArc: 0.9, damage: 0, stagger: 1.0, knock: 80, cooldown: 0.8, stamina: 15, via: 'shove' },
};

export const COMBAT = {
  staff: ATTACKS.staff,
  stamina: { max: 100, regen: 35, delay: 0.7 },
  dodge: { duration: 0.36, distance: 110, iFrom: 0.04, iTo: 0.28, cooldown: 0.55, stamina: 25 }, // invulnerable for 0.24 s of a 0.36 s roll
  block: { parryWindow: 0.25, halfArc: 1.2, cost: 15, parryRefund: 10, moveScale: 0.4, parryStagger: 1.8 },
  bow: { drawTime: 0.9, minDraw: 0.25, speed: 480, range: 420, damageFull: 2, damagePart: 1, stagger: 1.0, cooldown: 0.3, maxArrows: 12, startArrows: 6, aimMoveScale: 0.4, autoAimCone: 0.45, autoAimRange: 380 },
  knockTime: 0.25, poise: 0.6, // knock-back lasts 0.25 s; right after a stagger ends the raider cannot be staggered again for 0.6 s (no stun-lock)
  raider: {
    hp: 3, radius: 13, sight: 160, sightHalf: 1.0, hearing: 60, hearingCrouch: 30,
    patrolSpeed: 55, searchSpeed: 90, chaseSpeed: 150, fleeSpeed: 120,
    react: 0.35, windup: 0.5, reach: 34, strikeReach: 46, damage: 10, recover: 1.0, loseAfter: 3, searchFor: 3, downFlee: 1.0,
  },
  // The sparring partner of a teaching yard: same telegraph but slower, and its wooden stick does no damage. It cannot be driven off.
  sparrer: {
    hp: 3, radius: 13, sight: 240, sightHalf: Math.PI, hearing: 240, hearingCrouch: 240, friendly: true, immortal: true,
    patrolSpeed: 0, searchSpeed: 90, chaseSpeed: 80, fleeSpeed: 80,
    react: 0.6, windup: 0.8, reach: 40, strikeReach: 50, damage: 0, recover: 2.2, loseAfter: 99, searchFor: 3, downFlee: 1.0,
  },
  hurtTime: 0.25, hurtInvuln: 0.8,
};
const cfg = (e) => COMBAT[e.kind] || COMBAT.raider;

const angleDiff = (from, to) => {
  const tau = Math.PI * 2;
  let d = (to - from) % tau;
  if (d > Math.PI) d -= tau;
  if (d < -Math.PI) d += tau;
  return d;
};

export function createEnemies(world, rng) {
  return world.spawns.filter((s) => s.kind === 'raider' || s.kind === 'sparrer').map((s) => ({
    id: s.id, kind: s.kind, x: s.x, y: s.y, hp: s.hp, maxHp: s.hp, radius: COMBAT[s.kind].radius,
    angle: s.angle, homeAngle: s.angle, homeX: s.x, homeY: s.y, patrol: s.patrol, target: 0,
    phase: rng() * Math.PI * 2, state: 'patrol', stateT: 0, aware: false, sightT: 0, lostT: 0, cd: 0,
    lastX: s.x, lastY: s.y, spin: 1, kx: 0, ky: 0, kbT: 0, stagDur: 0, fleeing: false, poise: 0, fell: false,
  }));
}

// Training posts: hit by the staff, the sword, a shove or an arrow. They never move and never fight back.
export function createTargets(world) {
  return world.spawns.filter((s) => s.kind === 'target').map((s) => ({ id: s.id, x: s.x, y: s.y, radius: 16, flash: 0, hits: 0 }));
}

// Straight-line visibility over the wall grid (low walls, beams and grass do not block sight).
export function lineClear(world, x0, y0, x1, y1) {
  const ts = world.tileSize;
  const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / (ts / 4));
  for (let i = 1; i < n; i++) {
    const x = x0 + ((x1 - x0) * i) / n; const y = y0 + ((y1 - y0) * i) / n;
    if (world.solid[Math.floor(y / ts)]?.[Math.floor(x / ts)]) return false;
  }
  return true;
}

// Effective sight range against the player: crouching halves it, crouching in tall grass halves it again.
export function sightRange(sim) {
  const p = sim.player; const c = sim.chariot;
  let r = COMBAT.raider.sight;
  if (p.crouching) { r *= 0.5; if (inGrass(sim.world, c.x, c.y)) r *= 0.5; }
  return r;
}

export const hearingRange = (sim) => (sim.player.crouching ? COMBAT.raider.hearingCrouch : COMBAT.raider.hearing);

function sees(sim, e) {
  const c = sim.chariot; const R = cfg(e);
  const d = Math.hypot(c.x - e.x, c.y - e.y);
  if (d > (R.friendly ? R.sight : sightRange(sim))) return false;
  if (Math.abs(angleDiff(e.angle, Math.atan2(c.y - e.y, c.x - e.x))) > R.sightHalf) return false;
  return lineClear(sim.world, e.x, e.y, c.x, c.y);
}

// ---- stamina ----
const spend = (sim, cost) => {
  const p = sim.player;
  if (p.stamina < cost) return false;
  p.stamina -= cost; p.stamDelay = COMBAT.stamina.delay;
  return true;
};
export function regenStamina(sim, dt) {
  const p = sim.player; const S = COMBAT.stamina;
  if (p.stamDelay > 0) { p.stamDelay = Math.max(0, p.stamDelay - dt); return; }
  p.stamina = Math.min(S.max, p.stamina + S.regen * dt * (p.state === 'block' ? 0.4 : 1));
}

const FREE = new Set(['idle', 'walk', 'run', 'crouch']);

// ---- melee ----
// kind: 'auto' (the weapon's normal swing), 'light', 'heavy' or 'shove'. Returns true when it started.
export function startAttack(sim, kind = 'auto', events = []) {
  const p = sim.player;
  const key = kind === 'shove' ? 'shove' : p.weapon === 'staff' && (kind === 'auto' || kind === 'light') ? 'staff'
    : p.weapon === 'sword' && (kind === 'auto' || kind === 'light') ? 'light' : p.weapon === 'sword' && kind === 'heavy' ? 'heavy' : null;
  if (!key) return false;
  if (key === 'shove' ? !sim.abilities.includes('push') : !sim.abilities.includes(p.weapon)) return false;
  if (p.cooldown > 0 || !(FREE.has(p.state) || p.state === 'block' || p.state === 'aim')) return false;
  const s = ATTACKS[key];
  if (!spend(sim, s.stamina)) { events.push({ type: 'tired', what: key }); return false; }
  p.state = key === 'shove' ? 'shove' : 'attack'; p.stateT = 0; p.cooldown = s.cooldown; p.swingHit = false; p.atk = key;
  p.attackAngle = sim.chariot.moveAngle; p.crouching = false; p.draw = 0;
  events.push({ type: key === 'shove' ? 'shove' : 'swing', heavy: key === 'heavy', via: s.via || 'staff' });
  return true;
}

// Applies one hit to a raider: damage, stagger (unless it just recovered), knock-back, and the events.
function applyHit(sim, e, s, from, events, via) {
  const R = cfg(e);
  const dmg = s.damage || 0;
  if (dmg > 0) {
    e.hp = R.immortal ? Math.max(1, e.hp - dmg) : Math.max(0, e.hp - dmg);
    events.push({ type: 'hit-enemy', id: e.id, x: e.x, y: e.y, via });
  } else events.push({ type: 'shove-hit', id: e.id, x: e.x, y: e.y, via });
  if (s.knock) { e.kx = (Math.cos(from) * s.knock) / COMBAT.knockTime; e.ky = (Math.sin(from) * s.knock) / COMBAT.knockTime; e.kbT = COMBAT.knockTime; }
  e.aware = true; e.cd = 0;
  if (e.hp === 0) {
    e.state = 'down'; e.stateT = 0; e.fleeing = true;
    events.push({ type: 'enemy-down', id: e.id, x: e.x, y: e.y });
  } else if (e.poise <= 0 || e.state === 'windup') {
    e.state = 'stagger'; e.stateT = 0; e.stagDur = s.stagger; e.fleeing = !!s.flee; e.sightT = 0;
    events.push({ type: 'stagger', id: e.id, x: e.x, y: e.y });
  }
}

// Applies the swing arc once, at the moment of impact in the swing. Shoves also push.
export function resolveSwing(sim, events) {
  const p = sim.player; const c = sim.chariot; const s = ATTACKS[p.atk];
  if (!s || (p.state !== 'attack' && p.state !== 'shove') || p.swingHit || p.stateT < s.hitAt) return;
  p.swingHit = true;
  const inArc = (o, r) => {
    const d = Math.hypot(o.x - c.x, o.y - c.y);
    if (d > s.range + r) return false;
    return !(d > 1 && Math.abs(angleDiff(p.attackAngle, Math.atan2(o.y - c.y, o.x - c.x))) > s.halfArc);
  };
  for (const e of sim.enemies) {
    if (e.state === 'down' || !inArc(e, e.radius)) continue;
    applyHit(sim, e, s, Math.atan2(e.y - c.y, e.x - c.x), events, s.via || 'staff');
  }
  for (const t of sim.targets) if (inArc(t, t.radius)) hitTarget(t, s.via || 'staff', events);
}

function hitTarget(t, via, events) { t.flash = 0.3; t.hits += 1; events.push({ type: 'target-hit', id: t.id, x: t.x, y: t.y, via }); }

// ---- dodge roll ----
export function tryDodge(sim, controls, events) {
  const p = sim.player; const c = sim.chariot; const D = COMBAT.dodge;
  if (!sim.abilities.includes('dodge') || p.dodgeCd > 0) return false;
  if (!(FREE.has(p.state) || p.state === 'attack' || p.state === 'shove' || p.state === 'block' || p.state === 'aim')) return false;
  if (!spend(sim, D.stamina)) { events.push({ type: 'tired', what: 'dodge' }); return false; }
  const len = Math.hypot(controls.mx || 0, controls.my || 0);
  p.dodgeAngle = len > 0.08 ? Math.atan2(controls.my, controls.mx) : c.moveAngle; // with no direction held you roll the way you face
  c.moveAngle = p.dodgeAngle; p.state = 'dodge'; p.stateT = 0; p.dodgeCd = D.cooldown; p.crouching = false; p.draw = 0; p.swingHit = true;
  events.push({ type: 'dodge' });
  return true;
}

// Moves the roll along its line. Called every tick while state is 'dodge'. The invulnerable window is short and shown in the frame.
export function stepDodge(sim, dt) {
  const p = sim.player; const c = sim.chariot; const D = COMBAT.dodge;
  const v = D.distance / D.duration;
  c.x += Math.cos(p.dodgeAngle) * v * dt; c.y += Math.sin(p.dodgeAngle) * v * dt; c.speed = 0; c.angle = p.dodgeAngle;
  if (p.stateT >= D.iFrom && p.stateT <= D.iTo) sim.invuln = Math.max(sim.invuln, dt * 2);
  if (p.stateT >= D.duration) { p.state = 'idle'; p.stateT = 0; }
}
export const dodgeInvulnerable = (p) => p.state === 'dodge' && p.stateT >= COMBAT.dodge.iFrom && p.stateT <= COMBAT.dodge.iTo;

// ---- block and parry (sword, held) ----
export function updateGuard(sim, hold) {
  const p = sim.player;
  const can = hold && p.weapon === 'sword' && sim.abilities.includes('sword') && p.stamina > 0 && (FREE.has(p.state) || p.state === 'block');
  if (can && p.state !== 'block') { p.state = 'block'; p.stateT = 0; p.crouching = false; }
  else if (!can && p.state === 'block') { p.state = 'idle'; p.stateT = 0; }
}

// ---- bow: hold to draw, release to loose ----
function aimAngle(sim) {
  const c = sim.chariot; const B = COMBAT.bow;
  let best = null; let bd = Infinity;
  const consider = (o) => {
    const d = Math.hypot(o.x - c.x, o.y - c.y);
    if (d > B.autoAimRange || d < 1) return;
    if (Math.abs(angleDiff(c.moveAngle, Math.atan2(o.y - c.y, o.x - c.x))) > B.autoAimCone) return;
    if (d < bd && lineClear(sim.world, c.x, c.y, o.x, o.y)) { best = o; bd = d; }
  };
  for (const e of sim.enemies) if (e.state !== 'down') consider(e);
  for (const t of sim.targets) consider(t);
  return best ? Math.atan2(best.y - c.y, best.x - c.x) : c.moveAngle;
}

export function updateAim(sim, dt, hold, events) {
  const p = sim.player; const B = COMBAT.bow;
  const rising = hold && !p.aimHeld; p.aimHeld = !!hold;
  const can = p.weapon === 'bow' && sim.abilities.includes('bow') && (FREE.has(p.state) || p.state === 'aim');
  if (p.state !== 'aim' && p.draw > 0) p.draw = 0; // a hit or a roll cancels the draw
  if (hold && can) {
    if (p.state !== 'aim') {
      if (p.arrows <= 0) { if (rising) events.push({ type: 'no-arrows' }); return; }
      if (p.cooldown > 0) return;
      p.state = 'aim'; p.stateT = 0; p.crouching = false; p.draw = 0;
    }
    p.draw = Math.min(B.drawTime, p.draw + dt);
    p.aimAngle = aimAngle(sim);
    if (p.draw >= B.drawTime && !p.drawFull) { p.drawFull = true; events.push({ type: 'drawn' }); }
  } else if (p.state === 'aim') {
    if (p.draw >= B.minDraw && p.arrows > 0) loose(sim, events);
    else events.push({ type: 'unnock' }); // let down without loosing: nothing spent
    p.state = 'idle'; p.stateT = 0; p.draw = 0; p.drawFull = false;
  }
}

function loose(sim, events) {
  const p = sim.player; const c = sim.chariot; const B = COMBAT.bow;
  const full = p.draw >= B.drawTime * 0.9;
  const slot = sim.arrows.find((a) => !a.active);
  if (!slot) return; // the pool is full (16 arrows in flight): nothing spent
  p.arrows -= 1; p.cooldown = B.cooldown;
  Object.assign(slot, { active: true, x: c.x + Math.cos(p.aimAngle) * 18, y: c.y + Math.sin(p.aimAngle) * 18, vx: Math.cos(p.aimAngle) * B.speed * (full ? 1 : 0.7), vy: Math.sin(p.aimAngle) * B.speed * (full ? 1 : 0.7), left: B.range * (full ? 1 : 0.7), dmg: full ? B.damageFull : B.damagePart, angle: p.aimAngle });
  events.push({ type: 'shot', full, arrows: p.arrows });
}

// Flies arrows. They stop at walls and marked ledges, hit the first raider or post in the way, and a spent arrow can be picked up again.
export function stepArrows(sim, dt, events) {
  const w = sim.world; const ts = w.tileSize;
  for (const a of sim.arrows) {
    if (!a.active) continue;
    const sp = Math.hypot(a.vx, a.vy); const step = sp * dt;
    const n = Math.max(1, Math.ceil(step / 6)); let done = false;
    for (let i = 0; i < n && !done; i++) {
      a.x += (a.vx * dt) / n; a.y += (a.vy * dt) / n; a.left -= step / n;
      for (const e of sim.enemies) {
        if (e.state === 'down' || Math.hypot(e.x - a.x, e.y - a.y) > e.radius + 3) continue;
        applyHit(sim, e, { damage: a.dmg, stagger: COMBAT.bow.stagger }, a.angle, events, 'arrow'); done = true; break;
      }
      if (!done) for (const t of sim.targets) if (Math.hypot(t.x - a.x, t.y - a.y) <= t.radius + 3) { hitTarget(t, 'arrow', events); done = true; break; }
      if (done) { a.active = false; break; } // the arrow breaks on a hit
      const blocked = w.solid[Math.floor(a.y / ts)]?.[Math.floor(a.x / ts)] !== false || w.obstacles.some((o) => o.kind === 'ledge' && circleHitsRect(a.x, a.y, 2, o));
      if (blocked || a.left <= 0) { land(sim, a, blocked); done = true; }
    }
  }
}

function land(sim, a, blocked) {
  a.active = false;
  const back = blocked ? 10 : 0; const sp = Math.hypot(a.vx, a.vy) || 1;
  const x = a.x - (a.vx / sp) * back; const y = a.y - (a.vy / sp) * back;
  if (sim.pickups.length >= 64 || sim.pickups.filter((k) => k.kind === 'arrows' && !k.taken).length >= 16) return;
  if (x < 4 || y < 4 || x > sim.world.width - 4 || y > sim.world.height - 4) return;
  sim.arrowSeq += 1;
  sim.pickups.push({ id: `ar${sim.arrowSeq}`, x, y, kind: 'arrows', n: 1, taken: false });
}

// ---- enemies ----
function moveEnemy(sim, e, dt, tx, ty, speed) {
  const dx = tx - e.x; const dy = ty - e.y; const d = Math.hypot(dx, dy);
  if (d < 1e-6) return 0;
  const s = Math.min(d, speed * dt);
  e.x += (dx / d) * s; e.y += (dy / d) * s;
  e.angle += angleDiff(e.angle, Math.atan2(dy, dx)) * Math.min(1, 12 * dt);
  resolveWalls(sim.world, e);
  for (const o of sim.world.obstacles) if (o.kind !== 'grass') pushOutOf(e, o);
  return d - s;
}

function pushOutOf(e, o) {
  if (!circleHitsRect(e.x, e.y, e.radius, o)) return;
  const qx = Math.max(o.x, Math.min(e.x, o.x + o.w)); const qy = Math.max(o.y, Math.min(e.y, o.y + o.d));
  let dx = e.x - qx; let dy = e.y - qy; const d = Math.hypot(dx, dy);
  if (d === 0) { dx = 0; dy = -1; } else { dx /= d; dy /= d; }
  e.x += dx * (e.radius - d); e.y += dy * (e.radius - d);
}

function flee(sim, e, dt) {
  const c = sim.chariot;
  const a = Math.atan2(e.y - c.y, e.x - c.x);
  moveEnemy(sim, e, dt, e.x + Math.cos(a) * 50, e.y + Math.sin(a) * 50, cfg(e).fleeSpeed);
}

function patrol(sim, e, dt) {
  const R = cfg(e);
  if (e.patrol.length) {
    const to = e.patrol[e.target % e.patrol.length];
    if (moveEnemy(sim, e, dt, to.x, to.y, R.patrolSpeed) < 2) e.target = (e.target + 1) % e.patrol.length;
  } else e.angle = e.homeAngle + Math.sin(sim.elapsed * 0.6 + e.phase) * 1.0; // stationary lookout sweeps ~±57 degrees
}

// A shove knocks the raider back along a line. It stops at walls; if its centre ends over a pit it falls and is out of the fight (no gore).
function knockback(sim, e, dt, events) {
  e.x += e.kx * dt; e.y += e.ky * dt; e.kbT -= dt;
  resolveWalls(sim.world, e);
  for (const o of sim.world.obstacles) if (o.kind !== 'grass' && o.kind !== 'pit') pushOutOf(e, o);
  if (inPit(sim.world, e.x, e.y)) {
    e.state = 'down'; e.stateT = 0; e.fell = true; e.fleeing = false; e.kbT = 0;
    events.push({ type: 'enemy-fell', id: e.id, x: e.x, y: e.y });
  }
}

// What happens when a raider's wind-up ends. Dodging (invulnerable) or stepping out of reach whiffs; a block or parry turns it aside.
function strike(sim, e, events) {
  const R = cfg(e); const c = sim.chariot; const p = sim.player;
  if (Math.hypot(c.x - e.x, c.y - e.y) > R.strikeReach) { events.push({ type: 'whiff', id: e.id, x: e.x, y: e.y }); return; }
  if (sim.invuln > 0) { events.push({ type: 'whiff', id: e.id, x: e.x, y: e.y }); return; }
  let dmg = R.damage;
  if (p.state === 'block' && Math.abs(angleDiff(c.moveAngle, Math.atan2(e.y - c.y, e.x - c.x))) <= COMBAT.block.halfArc) {
    const B = COMBAT.block;
    if (p.stateT <= B.parryWindow) {
      e.state = 'stagger'; e.stateT = 0; e.stagDur = B.parryStagger; e.fleeing = false; e.cd = 0;
      p.stamina = Math.min(COMBAT.stamina.max, p.stamina + B.parryRefund);
      events.push({ type: 'parry', id: e.id, x: e.x, y: e.y }); return;
    }
    if (spend(sim, B.cost)) { events.push({ type: 'blocked', id: e.id, x: e.x, y: e.y }); return; }
    p.stamina = 0; dmg = Math.ceil(dmg / 2); events.push({ type: 'guard-break' }); // too tired to hold: half the damage
  }
  if (dmg === 0) { sim.invuln = Math.max(sim.invuln, 0.6); events.push({ type: 'tap', id: e.id, x: c.x, y: c.y }); return; }
  hurtPlayer(sim, dmg, events);
}

export function stepEnemies(sim, dt, events) {
  const c = sim.chariot;
  for (const e of sim.enemies) {
    const R = cfg(e);
    e.stateT += dt; e.cd = Math.max(0, e.cd - dt); e.poise = Math.max(0, e.poise - dt);
    if (e.state !== 'down' && e.kbT > 0) knockback(sim, e, dt, events);
    const dist = Math.hypot(c.x - e.x, c.y - e.y);
    if (e.state === 'down') { if (!e.fell && e.stateT < R.downFlee) flee(sim, e, dt); continue; }
    if (e.state === 'stagger') {
      if (e.fleeing) flee(sim, e, dt);
      if (e.stateT >= e.stagDur) { e.state = 'alert'; e.stateT = 0; e.sightT = 0; e.lastX = c.x; e.lastY = c.y; e.poise = COMBAT.poise; }
      continue;
    }
    if (e.state === 'windup') {
      e.angle = Math.atan2(c.y - e.y, c.x - e.x);
      if (e.stateT >= R.windup) { e.state = 'chase'; e.stateT = 0; e.cd = R.recover; strike(sim, e, events); }
      continue;
    }
    const canSee = sees(sim, e);
    if (canSee && !e.aware) { e.aware = true; if (!R.friendly) events.push({ type: 'seen', id: e.id, x: e.x, y: e.y }); }
    if (canSee) { e.lastX = c.x; e.lastY = c.y; e.lostT = 0; }
    if (e.state === 'patrol') {
      patrol(sim, e, dt);
      if (canSee) { e.state = 'alert'; e.stateT = 0; e.sightT = 0; }
      else if (dist <= (R.friendly ? R.hearing : hearingRange(sim)) && c.speed > 20) { e.state = 'alert'; e.stateT = 0; e.sightT = 0; e.lastX = c.x; e.lastY = c.y; }
    } else if (e.state === 'alert') {
      if (canSee) {
        e.sightT += dt; e.angle = Math.atan2(c.y - e.y, c.x - e.x);
        if (e.sightT >= R.react) { e.state = 'chase'; e.stateT = 0; }
      } else {
        e.sightT = 0;
        const left = moveEnemy(sim, e, dt, e.lastX, e.lastY, R.searchSpeed);
        if (left < 2) e.angle += e.spin * 1.5 * dt;
        if (e.stateT >= R.searchFor) { e.state = 'patrol'; e.stateT = 0; e.aware = false; e.spin = rngSign(sim); }
      }
    } else if (e.state === 'chase') {
      if (!canSee) {
        e.lostT += dt;
        if (e.lostT >= R.loseAfter) { e.state = 'alert'; e.stateT = 0; e.sightT = 0; e.spin = rngSign(sim); continue; }
      }
      // Only one raider winds up at a time, so a group never lands a blow on the same tick; the others hold off.
      const other = sim.enemies.some((o) => o !== e && o.state === 'windup');
      if (dist <= R.reach && e.cd <= 0 && canSee && !other) { e.state = 'windup'; e.stateT = 0; continue; }
      if (dist > R.reach - 6 && !(other && dist < R.reach + 30)) moveEnemy(sim, e, dt, e.lastX, e.lastY, R.chaseSpeed);
      else e.angle = Math.atan2(c.y - e.y, c.x - e.x);
    }
    // Never overlap the player.
    const min = c.radius + e.radius;
    const d = Math.hypot(c.x - e.x, c.y - e.y);
    if (d < min && d > 0) { e.x = c.x - ((c.x - e.x) / d) * min; e.y = c.y - ((c.y - e.y) / d) * min; }
  }
}

const rngSign = (sim) => (sim.rng() < 0.5 ? -1 : 1);

export function hurtPlayer(sim, amount, events) {
  const p = sim.player;
  sim.health = Math.max(0, sim.health - amount);
  sim.invuln = Math.max(sim.invuln, COMBAT.hurtInvuln);
  p.state = 'hurt'; p.stateT = 0; p.swingHit = true; p.draw = 0; p.drawFull = false;
  events.push({ type: 'hurt', amount, health: sim.health, x: sim.chariot.x, y: sim.chariot.y });
}
